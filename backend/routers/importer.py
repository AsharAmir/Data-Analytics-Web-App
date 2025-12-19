from roles_utils import get_admin_role, get_default_role
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
import pandas as pd
import io
import logging
from typing import List

from auth import get_current_user
from database import db_manager
from failure_tracker import failure_tracker
from models import (
    APIResponse,
    ReportImportOptions,
    ImportMode,
    ReportImportResult,
    User,
)
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["import"])


@router.post("/report/{table_name}/import", response_model=APIResponse)
async def import_report_data(
    table_name: str,
    mode: str = Form("abort_on_error"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Import data into an existing table.

    *Only* users with admin role (or the same role that owns the table) are
    currently permitted.
    """

    # --- Permissions -----------------------------------------------------------------
    # Case-insensitive role check
    user_role = str(current_user.role).upper() if current_user.role else ""
    admin_role = get_admin_role().upper()
    
    if user_role != admin_role:
        # Simple rule for demo – extend with proper ACL later
        raise HTTPException(status_code=403, detail="Not authorised to import data")

    # --- Parse options ----------------------------------------------------------------
    try:
        import_mode = ImportMode(mode)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid import mode '{mode}'")

    # --- Read file into DataFrame ------------------------------------------------------
    filename = file.filename.lower()
    try:
        if filename.endswith((".xlsx", ".xls")):
            # Read first sheet only
            df = pd.read_excel(io.BytesIO(await file.read()), sheet_name=0)
        elif filename.endswith((".csv", ".txt")):
            df = pd.read_csv(io.BytesIO(await file.read()))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
    except Exception as exc:
        logger.error(f"File parsing error: {exc}")
        failure_tracker.track_import_failure(
            table_name=table_name,
            filename=file.filename or "unknown",
            error=exc,
            user_id=current_user.id,
            records_processed=0
        )
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")

    total_records = len(df)
    if total_records == 0:
        return APIResponse(success=False, message="No records found in file")

    # --- Prepare insertion -------------------------------------------------------------
    inserted = 0
    failed = 0
    errors: List[str] = []

    # Fetch column list from target table for rudimentary validation
    # ORACLE: Use USER_TAB_COLUMNS (current schema). Table name usually UPPERCASE.
    try:
        cols_query = (
            "SELECT COLUMN_NAME AS col_name, DATA_TYPE AS data_type "
            "FROM USER_TAB_COLUMNS "
            "WHERE TABLE_NAME = :1"
        )
        meta = db_manager.execute_query(
            cols_query, (table_name.upper(),)
        )
        if not meta:
            # Try exact match if lower case table exists (unlikely in default Oracle but possible if quoted)
            meta = db_manager.execute_query(cols_query, (table_name,))
        
        if not meta:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
        
        target_columns = {
            str(m["col_name"]).lower(): str(m["data_type"]).upper() for m in meta
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Metadata query failed: {exc}")
        raise HTTPException(status_code=500, detail="Unable to access table information. Please verify the table exists.")

    # Ensure dataframe has only columns present in table (case-insensitive match)
    df.columns = [c.lower() for c in df.columns]
    unknown_cols = [c for c in df.columns if c not in target_columns]
    if unknown_cols:
        raise HTTPException(status_code=400, detail=f"Unknown columns in file: {', '.join(unknown_cols)}")

    # Build dynamic INSERT SQL with positional bind variables (:1, :2...)
    insert_cols = list(df.columns)
    placeholders = ", ".join([f":{i+1}" for i in range(len(insert_cols))])
    col_names_sql = ", ".join(insert_cols)
    insert_sql = f"INSERT INTO {table_name} ({col_names_sql}) VALUES ({placeholders})"

    for idx, row in df.iterrows():
        try:
            # Handle potential NaN/None values compatible with Oracle
            values = tuple((None if pd.isna(row[col]) else row[col]) for col in insert_cols)
            db_manager.execute_non_query(insert_sql, values)
            inserted += 1
        except Exception as exc:
            failed += 1
            # Sanitize database errors for user display (Oracle error patterns)
            msg = str(exc)
            sanitized_error = "Data validation error"
            
            # Oracle Error Mapping
            if "ORA-12899" in msg: # value too large for column
                sanitized_error = "Value too large for column"
            elif "ORA-01400" in msg: # cannot insert NULL
                sanitized_error = "Required field is empty"
            elif "ORA-02291" in msg: # integrity constraint violated - parent key not found
                sanitized_error = "Invalid reference value (Foreign Key missing)"
            elif "ORA-00001" in msg: # unique constraint violated
                sanitized_error = "Duplicate entry"
            elif "ORA-01861" in msg or "ORA-01843" in msg or "ORA-01847" in msg: # literal does not match format string / not a valid month / day of month invalid
                sanitized_error = "Invalid date format"
            elif "ORA-01722" in msg: # invalid number
                sanitized_error = "Invalid number format"

            error_msg = f"Row {idx+1}: {sanitized_error}"
            # logger.warning(f"Import error for row {idx+1}: {exc}")
            errors.append(error_msg)
            if import_mode == ImportMode.ABORT_ON_ERROR:
                break
            # else continue inserting next rows

    success = failed == 0 or import_mode == ImportMode.SKIP_FAILED
    
    # Track import failures if any records failed
    if failed > 0:
        failure_tracker.track_import_failure(
            table_name=table_name,
            filename=file.filename or "unknown",
            error=Exception(f"Import failed for {failed} out of {total_records} records"),
            user_id=current_user.id,
            records_processed=inserted
        )

    result = ReportImportResult(
        success=success,
        total_records=total_records,
        inserted_records=inserted,
        failed_records=failed,
        errors=errors,
    )

    return APIResponse(
        success=success,
        message="Import completed" if success else "Import completed with errors",
        data=result.model_dump(),
    )
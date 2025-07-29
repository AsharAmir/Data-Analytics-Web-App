from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
import pandas as pd
import io
import logging
from typing import List

from auth import get_current_user
from database import db_manager
from models import (
    APIResponse,
    ReportImportOptions,
    ImportMode,
    ReportImportResult,
    User,
)

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
    currently permitted. This can be extended later by checking dedicated ACL
    tables.  The endpoint accepts a **single** sheet Excel (`.xlsx` / `.xls`) or
    a CSV/TXT file with `,` delimiter. Validation errors are collected and the
    caller can choose to skip only the failed records or abort the whole batch.
    """

    # --- Permissions -----------------------------------------------------------------
    if str(current_user.role).lower() != "admin":
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
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")

    total_records = len(df)
    if total_records == 0:
        return APIResponse(success=False, message="No records found in file")

    # --- Prepare insertion -------------------------------------------------------------
    inserted = 0
    failed = 0
    errors: List[str] = []

    # Fetch column list from target table for rudimentary validation
    try:
        cols_query = (
            "SELECT column_name, data_type FROM user_tab_columns WHERE table_name = UPPER(:1)"
        )
        meta = db_manager.execute_query(cols_query, (table_name,))
        if not meta:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
        target_columns = {m["COLUMN_NAME"].lower(): m["DATA_TYPE"] for m in meta}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Metadata query failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to introspect table schema")

    # Ensure dataframe has only columns present in table (case-insensitive match)
    df.columns = [c.lower() for c in df.columns]
    unknown_cols = [c for c in df.columns if c not in target_columns]
    if unknown_cols:
        raise HTTPException(status_code=400, detail=f"Unknown columns in file: {', '.join(unknown_cols)}")

    # Build dynamic INSERT SQL with positional bind variables
    insert_cols = list(df.columns)
    placeholders = ", ".join([f":{i+1}" for i in range(len(insert_cols))])
    col_names_sql = ", ".join(insert_cols)
    insert_sql = f"INSERT INTO {table_name} ({col_names_sql}) VALUES ({placeholders})"

    for idx, row in df.iterrows():
        try:
            values = tuple(row[col] for col in insert_cols)
            db_manager.execute_non_query(insert_sql, values)
            inserted += 1
        except Exception as exc:
            failed += 1
            error_msg = f"Row {idx+1}: {exc}"
            logger.warning(error_msg)
            errors.append(error_msg)
            if import_mode == ImportMode.ABORT_ON_ERROR:
                break
            # else continue inserting next rows

    success = failed == 0 or import_mode == ImportMode.SKIP_FAILED

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
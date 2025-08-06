import logging
import asyncio

from functools import partial

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from failure_tracker import failure_tracker
from models import (
    APIResponse,
    FilteredQueryRequest,
    QueryExecute,
    QueryResult,
    User,
    UserRole,
    ExportRequest,
)
from services import DataService, QueryService
# New import for file export
from services import ExportService
from fastapi.responses import Response
from database import db_manager
from datetime import datetime
from sql_utils import validate_sql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query/execute", response_model=QueryResult)
async def execute_query(request: QueryExecute, current_user: User = Depends(get_current_user)):
    try:
        if request.query_id:
            # Execute saved query
            query_obj = QueryService.get_query_by_id(request.query_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Query not found")

            # Role authorization: admin can run anything; others only if role matches
            if current_user.role != UserRole.ADMIN:
                assigned_roles = {r.strip() for r in (query_obj.role or "").split(",") if r.strip()}
                if not assigned_roles or current_user.role not in assigned_roles:
                    raise HTTPException(status_code=403, detail="Not authorized for this query")

            # ------------------------------------------------------------------
            # Sanitize and validate SQL – ensure it's a read-only SELECT and
            # strip trailing semicolons that break sub-queries or pagination.
            # ------------------------------------------------------------------
            sanitized_sql = query_obj.sql_query.strip().rstrip(";")
            validate_sql(sanitized_sql)

            if query_obj.chart_type and query_obj.chart_type != "table":
                return DataService.execute_query_for_chart(
                    sanitized_sql, query_obj.chart_type, query_obj.chart_config
                )
            else:
                return DataService.execute_query_for_table(
                    sanitized_sql, request.limit, request.offset
                )
        elif request.sql_query:
            validate_sql(request.sql_query)
            return DataService.execute_query_for_table(
                request.sql_query, request.limit, request.offset
            )
        else:
            raise HTTPException(
                status_code=400, detail="Either query_id or sql_query must be provided"
            )
    except Exception as exc:
        logger.error(f"Error executing query: {exc}")
        
        # Track the failure
        query_id = request.query_id if hasattr(request, 'query_id') else None
        sql_query = request.sql_query if hasattr(request, 'sql_query') else ""
        if query_id and not sql_query:
            try:
                query_obj = QueryService.get_query_by_id(query_id)
                sql_query = query_obj.sql_query if query_obj else ""
            except:
                pass
        
        failure_tracker.track_query_failure(
            query_id=query_id,
            sql_query=sql_query,
            error=exc,
            user_id=current_user.id
        )
        
        # Don't expose internal database errors to users
        error_msg = "Query execution failed. Please check your SQL syntax and try again."
        if "ORA-00907" in str(exc) or "ORA-00936" in str(exc) or "missing right parenthesis" in str(exc):
            error_msg = "SQL syntax error: Please check your query syntax."
        elif "ORA-00942" in str(exc) or "table or view does not exist" in str(exc):
            error_msg = "Table or view not found. Please verify the table name."
        elif "ORA-00904" in str(exc) or "invalid identifier" in str(exc):
            error_msg = "Column not found. Please verify the column names."
        return QueryResult(success=False, error=error_msg)


@router.get("/query/{query_id}", response_model=APIResponse)
async def get_query_detail(query_id: int, current_user: User = Depends(get_current_user)):
    """Return metadata about a saved query.

    Non-admin users are only allowed to access queries that are either **not**
    restricted (``role`` column empty) *or* that explicitly list the user’s
    role.  Otherwise we raise *403 Not authorised* so the frontend can display
    an appropriate message.
    """

    try:
        query_obj = QueryService.get_query_by_id(query_id)
        if not query_obj:
            return APIResponse(success=False, error="Query not found")

        # Authorisation check – admin can view everything; other roles must match
        if current_user.role != UserRole.ADMIN:
            assigned_roles = {r.strip() for r in (query_obj.role or "").split(',') if r.strip()}
            if assigned_roles and current_user.role not in assigned_roles:
                raise HTTPException(status_code=403, detail="Not authorised for this query")

        return APIResponse(success=True, data=query_obj)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error getting query detail {query_id}: {exc}")
        return APIResponse(success=False, error=str(exc))


@router.post("/query/filtered", response_model=QueryResult)
async def execute_filtered_query(request: FilteredQueryRequest, current_user: User = Depends(get_current_user)):
    """Execute a saved query (``query_id``) or raw SQL with filtering/pagination.

    The same role-based access rules as ``/query/execute`` apply: admins can run
    everything; other users may only run queries that either have no role
    restrictions or explicitly include their role.
    """

    try:
        # Perform the same role check as /query/execute when a query_id is supplied
        if request.query_id:
            query_obj = QueryService.get_query_by_id(request.query_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Query not found")

            if current_user.role != UserRole.ADMIN:
                assigned_roles = {r.strip() for r in (query_obj.role or "").split(',') if r.strip()}
                if assigned_roles and current_user.role not in assigned_roles:
                    raise HTTPException(status_code=403, detail="Not authorised for this query")

        return DataService.execute_filtered_query(request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error executing filtered query: {exc}")
        # Don't expose internal database errors to users
        error_msg = "Query execution failed. Please check your SQL syntax and try again."
        if "ORA-00907" in str(exc) or "ORA-00936" in str(exc) or "missing right parenthesis" in str(exc):
            error_msg = "SQL syntax error: Please check your query syntax."
        elif "ORA-00942" in str(exc) or "table or view does not exist" in str(exc):
            error_msg = "Table or view not found. Please verify the table name."
        elif "ORA-00904" in str(exc) or "invalid identifier" in str(exc):
            error_msg = "Column not found. Please verify the column names."
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/reports/menu/{menu_item_id}", response_model=APIResponse)
async def get_reports_by_menu(menu_item_id: int, current_user: User = Depends(get_current_user)):
    try:
        queries = QueryService.get_queries_by_menu(menu_item_id)
        if current_user.role != UserRole.ADMIN:
            queries = [
                q for q in queries if not q.role or current_user.role in {r.strip() for r in q.role.split(",")}
            ]
        return APIResponse(success=True, data=queries)
    except Exception as exc:
        logger.error(f"Error retrieving reports for menu {menu_item_id}: {exc}")
        return APIResponse(success=False, error=str(exc))

# ------------------ Data Export ------------------


@router.post("/export")
async def export_query_data(request: ExportRequest, current_user: User = Depends(get_current_user)):
    """Export data for a given query ID or raw SQL to CSV or Excel.

    The client posts an ``ExportRequest`` specifying either ``query_id`` or
    ``sql_query`` and the desired ``format`` (``csv`` or ``excel``). We execute
    the statement without pagination, then stream the file back.
    
    For large datasets, this uses unlimited timeout and streaming to handle
    exports that may take several minutes.
    """

    try:
        # 1. Determine SQL to execute
        sql = ""
        if request.query_id:
            query_obj = QueryService.get_query_by_id(request.query_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Query not found")

            # Role check (admin can export everything, others need matching role)
            if current_user.role != UserRole.ADMIN:
                assigned_roles = {r.strip() for r in (query_obj.role or "").split(',') if r.strip()}
                if assigned_roles and current_user.role not in assigned_roles:
                    raise HTTPException(status_code=403, detail="Not authorized for this query")

            sql = query_obj.sql_query
        elif request.sql_query:
            validate_sql(request.sql_query)
            sql = request.sql_query
        else:
            raise HTTPException(status_code=400, detail="query_id or sql_query required")

        # 2. Execute and get DataFrame – move the potentially long-running
        # blocking DB call into a thread so this coroutine yields control.

        logger.info(
            f"Starting export for user {current_user.username}, estimated data size: large"
        )

        loop = asyncio.get_running_loop()
        df = await loop.run_in_executor(
            None,  # default thread-pool executor
            partial(db_manager.execute_query_pandas, sql, timeout=0),
        )

        if df.empty:
            # Create empty file with headers for empty results
            logger.info(f"Export query returned no data, creating empty file for {filename}")
            import pandas as pd
            df = pd.DataFrame()  # Empty DataFrame will still have proper structure

        filename = request.filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        logger.info(f"Export query completed, processing {len(df)} rows for {filename}")

        # 3. Convert to requested format and return
        fmt = request.format.lower()
        if fmt == "excel":
            if not filename.lower().endswith(".xlsx"):
                filename += ".xlsx"

            # Pandas writing to Excel is CPU-bound; offload to the same thread pool.
            file_bytes: bytes = await loop.run_in_executor(
                None, partial(ExportService.export_to_excel, df, filename)
            )
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            logger.info(f"Excel export completed for {filename}, size: {len(file_bytes)} bytes")
            return Response(content=file_bytes, media_type=media_type, headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(file_bytes))
            })
        elif fmt == "csv":
            if not filename.lower().endswith(".csv"):
                filename += ".csv"

            csv_str: str = await loop.run_in_executor(
                None, partial(ExportService.export_to_csv, df, filename)
            )
            logger.info(f"CSV export completed for {filename}, size: {len(csv_str)} characters")
            return Response(content=csv_str.encode("utf-8"), media_type="text/csv", headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(csv_str.encode("utf-8")))
            })
        else:
            raise HTTPException(status_code=400, detail="Unsupported format; choose 'excel' or 'csv'")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error exporting data: {exc}")
        # Don't expose internal database errors to users
        error_msg = "Export failed. Please try again or contact support."
        if "no data" in str(exc).lower():
            error_msg = "No data available to export."
        elif "timeout" in str(exc).lower():
            error_msg = "Export timed out. Try filtering your data to reduce the result set."
        raise HTTPException(status_code=500, detail=error_msg) 
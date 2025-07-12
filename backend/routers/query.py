import logging

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
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
        return QueryResult(success=False, error=str(exc))


@router.get("/query/{query_id}", response_model=APIResponse)
async def get_query_detail(query_id: int, current_user: User = Depends(get_current_user)):
    try:
        query_obj = QueryService.get_query_by_id(query_id)
        if not query_obj:
            return APIResponse(success=False, error="Query not found")
        return APIResponse(success=True, data=query_obj)
    except Exception as exc:
        logger.error(f"Error getting query detail {query_id}: {exc}")
        return APIResponse(success=False, error=str(exc))


@router.post("/query/filtered", response_model=QueryResult)
async def execute_filtered_query(request: FilteredQueryRequest, current_user: User = Depends(get_current_user)):
    try:
        return DataService.execute_filtered_query(request)
    except Exception as exc:
        logger.error(f"Error executing filtered query: {exc}")
        raise HTTPException(status_code=500, detail=f"Query execution failed: {exc}")


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

        # 2. Execute and get DataFrame with unlimited timeout for exports
        logger.info(f"Starting export for user {current_user.username}, estimated data size: large")
        df = db_manager.execute_query_pandas(sql, timeout=0)  # 0 = unlimited timeout

        if df.empty:
            raise HTTPException(status_code=404, detail="Query returned no data")

        filename = request.filename or f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        logger.info(f"Export query completed, processing {len(df)} rows for {filename}")

        # 3. Convert to requested format and return
        fmt = request.format.lower()
        if fmt == "excel":
            if not filename.lower().endswith(".xlsx"):
                filename += ".xlsx"
            file_bytes = ExportService.export_to_excel(df, filename)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            logger.info(f"Excel export completed for {filename}, size: {len(file_bytes)} bytes")
            return Response(content=file_bytes, media_type=media_type, headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(file_bytes))
            })
        elif fmt == "csv":
            if not filename.lower().endswith(".csv"):
                filename += ".csv"
            csv_str = ExportService.export_to_csv(df, filename)
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
        raise HTTPException(status_code=500, detail=f"Failed to export data: {str(exc)}") 
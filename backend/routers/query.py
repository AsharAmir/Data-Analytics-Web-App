from typing import List
import logging

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from models import (
    APIResponse,
    FilteredQueryRequest,
    Query,
    QueryExecute,
    QueryResult,
    User,
    UserRole,
)
from services import DataService, QueryService
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

            if query_obj.chart_type and query_obj.chart_type != "table":
                return DataService.execute_query_for_chart(
                    query_obj.sql_query, query_obj.chart_type, query_obj.chart_config
                )
            else:
                return DataService.execute_query_for_table(
                    query_obj.sql_query, request.limit, request.offset
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
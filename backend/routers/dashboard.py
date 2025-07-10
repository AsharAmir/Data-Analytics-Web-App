from typing import List
import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import db_manager
from models import DashboardWidget, QueryResult, User, UserRole, KPI
from services import DashboardService, DataService, KPIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=List[DashboardWidget])
async def get_dashboard(current_user: User = Depends(get_current_user)):
    """Return dashboard layout filtered by user role."""
    widgets = DashboardService.get_dashboard_layout()
    if current_user.role != UserRole.ADMIN:
        widgets = [
            w
            for w in widgets
            if (not w.query) or (w.query.role in (None, "", current_user.role))
        ]
    return widgets


@router.post("/dashboard/widget/{widget_id}/data", response_model=QueryResult)
async def get_widget_data(widget_id: int, timeout: int = 45, current_user: User = Depends(get_current_user)):
    """Fetch and execute underlying SQL for a dashboard widget, returning chart-ready data with timeout."""
    try:
        query = """
        SELECT q.sql_query, q.chart_type, q.chart_config
        FROM app_dashboard_widgets w
        JOIN app_queries q ON w.query_id = q.id
        WHERE w.id = :1 AND w.is_active = 1 AND q.is_active = 1
        """
        result = db_manager.execute_query(query, (widget_id,))
        if not result:
            raise HTTPException(status_code=404, detail="Widget not found")

        widget_data = result[0]
        chart_config = {}
        if widget_data["CHART_CONFIG"]:
            try:
                chart_config = json.loads(widget_data["CHART_CONFIG"])
            except Exception:
                chart_config = {}

        return DataService.execute_query_for_chart(
            widget_data["SQL_QUERY"], widget_data["CHART_TYPE"], chart_config, timeout=timeout
        )
    except Exception as exc:
        logger.error(f"Error getting widget data: {exc}")
        return QueryResult(success=False, error=str(exc))


@router.get("/kpis", response_model=List[KPI])
async def get_kpis(current_user: User = Depends(get_current_user)):
    """Return list of KPI metrics available for the current user."""
    return KPIService.get_kpis(current_user.role) 
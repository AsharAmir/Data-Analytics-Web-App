from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    IT_USER = "IT_USER"  # Fixed built-in role requested by scenario
    CEO = "CEO"
    FINANCE_USER = "FINANCE_USER"
    TECH_USER = "TECH_USER"
    USER = "user"

RoleType = Union[str, "UserRole"]


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: RoleType = UserRole.USER
    must_change_password: bool = True  # always true on creation

# Payload for partial user updates
class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[RoleType] = None  # Now supports dynamic roles as well
    is_active: Optional[bool] = None


class UserLogin(BaseModel):
    username: str
    password: str


class User(BaseModel):
    id: int
    username: str
    email: str
    role: RoleType = UserRole.USER
    is_active: bool
    created_at: datetime
    must_change_password: bool = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User


# Menu Models
class MenuItem(BaseModel):
    id: int
    name: str
    type: str  # 'dashboard' or 'report'
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0
    is_active: bool = True
    role: Optional[Union[RoleType, List[RoleType]]] = None
    children: Optional[List["MenuItem"]] = []


class MenuItemCreate(BaseModel):
    name: str
    type: str
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0
    role: Optional[Union[RoleType, List[RoleType]]] = None


# Query Models
class QueryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sql_query: str
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    menu_item_id: Optional[int] = None  # Keep for backward compatibility
    menu_item_ids: Optional[List[int]] = None  # New field for multiple assignments
    role: Optional[Union[RoleType, List[RoleType]]] = UserRole.USER


class Query(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sql_query: str
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    menu_item_id: Optional[int] = None  # Keep for backward compatibility
    menu_item_ids: Optional[List[int]] = None  # Multiple menu assignments
    menu_names: Optional[List[str]] = None  # Menu names for display
    is_active: bool = True
    created_at: datetime
    role: Optional[RoleType] = UserRole.USER


class QueryExecute(BaseModel):
    query_id: Optional[int] = None
    sql_query: Optional[str] = None
    limit: Optional[int] = 1000
    offset: Optional[int] = 0


# Dashboard Models
class DashboardWidget(BaseModel):
    id: int
    title: str
    query_id: int
    position_x: int = 0
    position_y: int = 0
    width: int = 6
    height: int = 4
    is_active: bool = True
    query: Optional[Query] = None


class DashboardWidgetCreate(BaseModel):
    title: str
    query_id: int
    position_x: int = 0
    position_y: int = 0
    width: int = 6
    height: int = 4


# Model for updating widget layout/attributes
class DashboardWidgetUpdate(BaseModel):
    title: Optional[str] = None
    query_id: Optional[int] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    is_active: Optional[bool] = None


class DashboardLayout(BaseModel):
    widgets: List[DashboardWidget]


# Data Models
class ChartData(BaseModel):
    labels: List[str]
    datasets: List[Dict[str, Any]]


class TableData(BaseModel):
    columns: List[str]
    data: List[List[Any]]
    total_count: int


class QueryResult(BaseModel):
    success: bool
    data: Optional[Union[ChartData, TableData]] = None
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


class KPI(BaseModel):
    """Simple model representing a single numeric KPI metric that will be displayed on the dashboard."""

    id: int  # Unique query identifier acting as KPI id
    label: str  # Human-friendly name shown to the user e.g. "Total Assets"
    value: float | int  # Numeric result of KPI query – coerced to float if needed


# Export Models
class ExportRequest(BaseModel):
    query_id: Optional[int] = None
    sql_query: Optional[str] = None
    format: str  # 'excel', 'csv', 'pdf'
    filename: Optional[str] = None


# Filter Models
class FilterCondition(BaseModel):
    column: str
    operator: str  # 'eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'like', 'in'
    value: Union[str, int, float, List[Any]]


class TableFilter(BaseModel):
    conditions: List[FilterCondition]
    logic: str = "AND"  # 'AND' or 'OR'


class FilteredQueryRequest(BaseModel):
    query_id: Optional[int] = None
    sql_query: Optional[str] = None
    filters: Optional[TableFilter] = None
    limit: Optional[int] = 1000
    offset: Optional[int] = 0
    sort_column: Optional[str] = None
    sort_direction: Optional[str] = "ASC"


# Response Models
class APIResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[str] = None


class PaginatedResponse(BaseModel):
    success: bool
    data: List[Any]
    total_count: int
    page: int
    page_size: int
    total_pages: int

# ---------------------------
# Data-import models (Scenario 2)
# ---------------------------


class ImportMode(str, Enum):
    """Behaviour when validation errors are encountered during import."""

    SKIP_FAILED = "skip_failed"  # Insert valid rows, skip erroneous rows
    ABORT_ON_ERROR = "abort_on_error"  # Abort entire operation if any row fails


class ReportImportOptions(BaseModel):
    """Options supplied by the frontend for a bulk data import request."""

    mode: ImportMode = ImportMode.ABORT_ON_ERROR


class ReportImportResult(BaseModel):
    """Return object for import endpoint detailing successes & failures."""

    success: bool
    total_records: int
    inserted_records: int
    failed_records: int
    errors: List[str] = []


# ---------------------------
# Process models (Scenario 3)
# ---------------------------


class ParameterInputType(str, Enum):
    """Supported input widgets for process parameters."""

    TEXT = "text"
    DROPDOWN = "dropdown"
    DATE = "date"


class ProcessParameter(BaseModel):
    """Defines a single configurable parameter for a backend process."""

    name: str  # Internal parameter name passed to the script
    label: str  # User-friendly caption displayed in the UI
    input_type: ParameterInputType = ParameterInputType.TEXT
    default_value: Optional[str] = None
    dropdown_values: Optional[List[str]] = None  # For DROPDOWN input


class Process(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    script_path: str  # Absolute / relative Python file path
    parameters: Optional[List[ProcessParameter]] = []
    is_active: bool = True
    role: Optional[Union[RoleType, List[RoleType]]] = UserRole.USER
    created_at: datetime


class ProcessCreate(BaseModel):
    name: str
    description: Optional[str] = None
    script_path: str
    parameters: Optional[List[ProcessParameter]] = []
    role: Optional[Union[RoleType, List[RoleType]]] = UserRole.USER


# Update forward references for new nested models
MenuItem.model_rebuild()
ProcessParameter.model_rebuild()
Process.model_rebuild()


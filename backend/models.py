from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any, Union
from datetime import datetime


# Authentication Models
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class User(BaseModel):
    id: int
    username: str
    email: str
    role: str = "user"  # 'admin' or 'user'
    is_active: bool
    created_at: datetime


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
    children: Optional[List["MenuItem"]] = []


class MenuItemCreate(BaseModel):
    name: str
    type: str
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


# Query Models
class QueryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sql_query: str
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    menu_item_id: Optional[int] = None


class Query(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sql_query: str
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    menu_item_id: Optional[int] = None
    is_active: bool = True
    created_at: datetime


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


# Update forward references
MenuItem.model_rebuild()

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import uvicorn
import logging
import io
import json
import pandas as pd
import time
from datetime import timedelta, datetime
from typing import List, Optional

# Import our modules
from config import settings
from database import init_database, db_manager
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_auth_mode,
    saml_auth,
    init_default_user,
)
from models import (
    UserLogin,
    Token,
    User,
    MenuItem,
    Query,
    QueryExecute,
    QueryResult,
    DashboardWidget,
    ExportRequest,
    FilteredQueryRequest,
    APIResponse,
    PaginatedResponse,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        logger.info("Initializing database...")
        init_database()
        init_default_user()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

    yield

    # Shutdown (if needed)
    logger.info("Application shutting down...")


# Initialize FastAPI app
app = FastAPI(
    title="Data Analytics Web App",
    description="Advanced analytics platform with dynamic dashboards and reports",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Simple service classes (inline for now)
class DataService:
    @staticmethod
    def execute_query_for_chart(
        query: str, chart_type: str = None, chart_config: dict = None
    ) -> QueryResult:
        start_time = time.time()
        try:
            df = db_manager.execute_query_pandas(query)
            if df.empty:
                return QueryResult(
                    success=False,
                    error="Query returned no data",
                    execution_time=time.time() - start_time,
                )

            # Simple chart data formatting
            if chart_type in ["pie", "doughnut"]:
                labels = df.iloc[:, 0].astype(str).tolist()
                values = (
                    pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0).tolist()
                )
                chart_data = {
                    "labels": labels,
                    "datasets": [
                        {
                            "data": values,
                            "backgroundColor": [
                                "#FF6384",
                                "#36A2EB",
                                "#FFCE56",
                                "#4BC0C0",
                                "#9966FF",
                            ][: len(labels)],
                        }
                    ],
                }
            else:
                labels = df.iloc[:, 0].astype(str).tolist()
                datasets = []
                for i, col in enumerate(df.columns[1:]):
                    values = pd.to_numeric(df[col], errors="coerce").fillna(0).tolist()
                    datasets.append(
                        {
                            "label": col,
                            "data": values,
                            "backgroundColor": [
                                "#FF6384",
                                "#36A2EB",
                                "#FFCE56",
                                "#4BC0C0",
                                "#9966FF",
                            ][i % 5],
                        }
                    )
                chart_data = {"labels": labels, "datasets": datasets}

            return QueryResult(
                success=True,
                data=chart_data,
                chart_type=chart_type,
                chart_config=chart_config or {},
                execution_time=time.time() - start_time,
            )
        except Exception as e:
            return QueryResult(
                success=False, error=str(e), execution_time=time.time() - start_time
            )

    @staticmethod
    def execute_query_for_table(
        query: str, limit: int = 1000, offset: int = 0
    ) -> QueryResult:
        start_time = time.time()
        try:
            # Add pagination
            paginated_query = f"""
            SELECT * FROM (
                SELECT ROWNUM as rn, sub.* FROM (
                    {query}
                ) sub WHERE ROWNUM <= {offset + limit}
            ) WHERE rn > {offset}
            """

            df = db_manager.execute_query_pandas(paginated_query)

            # Get total count
            count_query = f"SELECT COUNT(*) as total_count FROM ({query})"
            count_result = db_manager.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0

            table_data = {
                "columns": df.columns.tolist(),
                "data": df.values.tolist(),
                "total_count": total_count,
            }

            return QueryResult(
                success=True, data=table_data, execution_time=time.time() - start_time
            )
        except Exception as e:
            return QueryResult(
                success=False, error=str(e), execution_time=time.time() - start_time
            )


class MenuService:
    @staticmethod
    def get_menu_structure() -> List[MenuItem]:
        try:
            query = """
            SELECT id, name, type, icon, parent_id, sort_order, is_active
            FROM app_menu_items WHERE is_active = 1 ORDER BY sort_order, name
            """
            result = db_manager.execute_query(query)

            all_items = []
            for row in result:
                item = MenuItem(
                    id=row["ID"],
                    name=row["NAME"],
                    type=row["TYPE"],
                    icon=row["ICON"],
                    parent_id=row["PARENT_ID"],
                    sort_order=row["SORT_ORDER"],
                    is_active=bool(row["IS_ACTIVE"]),
                    children=[],
                )
                all_items.append(item)

            # Build hierarchy
            menu_dict = {item.id: item for item in all_items}
            root_items = []

            for item in all_items:
                if item.parent_id and item.parent_id in menu_dict:
                    menu_dict[item.parent_id].children.append(item)
                else:
                    root_items.append(item)

            return root_items
        except Exception as e:
            logger.error(f"Error getting menu structure: {e}")
            return []


class QueryService:
    @staticmethod
    def get_query_by_id(query_id: int) -> Optional[Query]:
        try:
            query = """
            SELECT id, name, description, sql_query, chart_type, chart_config, 
                   menu_item_id, is_active, created_at
            FROM app_queries WHERE id = ? AND is_active = 1
            """
            result = db_manager.execute_query(query, (query_id,))

            if result:
                row = result[0]
                chart_config = {}
                if row["CHART_CONFIG"]:
                    try:
                        chart_config = json.loads(row["CHART_CONFIG"])
                    except:
                        chart_config = {}

                return Query(
                    id=row["ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=row["MENU_ITEM_ID"],
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )
            return None
        except Exception as e:
            logger.error(f"Error getting query by ID: {e}")
            return None


class DashboardService:
    @staticmethod
    def get_dashboard_layout() -> List[DashboardWidget]:
        try:
            query = """
            SELECT w.id, w.title, w.query_id, w.position_x, w.position_y, 
                   w.width, w.height, w.is_active,
                   q.name as query_name, q.sql_query, q.chart_type, q.chart_config
            FROM app_dashboard_widgets w
            JOIN app_queries q ON w.query_id = q.id
            WHERE w.is_active = 1 AND q.is_active = 1
            ORDER BY w.position_y, w.position_x
            """
            result = db_manager.execute_query(query)

            widgets = []
            for row in result:
                chart_config = {}
                if row["CHART_CONFIG"]:
                    try:
                        chart_config = json.loads(row["CHART_CONFIG"])
                    except:
                        chart_config = {}

                query_obj = Query(
                    id=row["QUERY_ID"],
                    name=row["QUERY_NAME"],
                    description="",
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=None,
                    is_active=True,
                    created_at=datetime.now(),
                )

                widget = DashboardWidget(
                    id=row["ID"],
                    title=row["TITLE"],
                    query_id=row["QUERY_ID"],
                    position_x=row["POSITION_X"],
                    position_y=row["POSITION_Y"],
                    width=row["WIDTH"],
                    height=row["HEIGHT"],
                    is_active=bool(row["IS_ACTIVE"]),
                    query=query_obj,
                )
                widgets.append(widget)

            return widgets
        except Exception as e:
            logger.error(f"Error getting dashboard layout: {e}")
            return []


# API Routes


@app.get("/", response_model=APIResponse)
async def root():
    return APIResponse(
        success=True, message="Data Analytics Web App API", data={"version": "1.0.0"}
    )


@app.get("/health", response_model=APIResponse)
async def health_check():
    try:
        # Test database connection
        result = db_manager.execute_query("SELECT 1 FROM DUAL")
        return APIResponse(
            success=True, message="System healthy", data={"database": "connected"}
        )
    except Exception as e:
        return APIResponse(success=False, error=f"Database connection failed: {str(e)}")


# Authentication Routes
@app.post("/auth/login", response_model=Token)
async def login(user_login: UserLogin):
    user = authenticate_user(user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer", user=user)


@app.get("/auth/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/auth/mode", response_model=APIResponse)
async def get_authentication_mode():
    return APIResponse(success=True, data={"auth_mode": get_auth_mode()})


# Menu Routes
@app.get("/api/menu", response_model=List[MenuItem])
async def get_menu(current_user: User = Depends(get_current_user)):
    return MenuService.get_menu_structure()


# Dashboard Routes
@app.get("/api/dashboard", response_model=List[DashboardWidget])
async def get_dashboard(current_user: User = Depends(get_current_user)):
    return DashboardService.get_dashboard_layout()


@app.post("/api/dashboard/widget/{widget_id}/data", response_model=QueryResult)
async def get_widget_data(
    widget_id: int, current_user: User = Depends(get_current_user)
):
    try:
        # Get widget and its query
        query = """
        SELECT q.sql_query, q.chart_type, q.chart_config
        FROM app_dashboard_widgets w
        JOIN app_queries q ON w.query_id = q.id
        WHERE w.id = ? AND w.is_active = 1 AND q.is_active = 1
        """
        result = db_manager.execute_query(query, (widget_id,))

        if not result:
            raise HTTPException(status_code=404, detail="Widget not found")

        widget_data = result[0]
        chart_config = {}
        if widget_data["CHART_CONFIG"]:
            try:
                chart_config = json.loads(widget_data["CHART_CONFIG"])
            except:
                chart_config = {}

        return DataService.execute_query_for_chart(
            widget_data["SQL_QUERY"], widget_data["CHART_TYPE"], chart_config
        )
    except Exception as e:
        logger.error(f"Error getting widget data: {e}")
        return QueryResult(success=False, error=str(e))


# Query Routes
@app.post("/api/query/execute", response_model=QueryResult)
async def execute_query(
    request: QueryExecute, current_user: User = Depends(get_current_user)
):
    try:
        if request.query_id:
            # Execute saved query
            query_obj = QueryService.get_query_by_id(request.query_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Query not found")

            if query_obj.chart_type:
                return DataService.execute_query_for_chart(
                    query_obj.sql_query, query_obj.chart_type, query_obj.chart_config
                )
            else:
                return DataService.execute_query_for_table(
                    query_obj.sql_query, request.limit, request.offset
                )
        elif request.sql_query:
            # Execute custom SQL
            return DataService.execute_query_for_table(
                request.sql_query, request.limit, request.offset
            )
        else:
            raise HTTPException(
                status_code=400, detail="Either query_id or sql_query must be provided"
            )

    except Exception as e:
        logger.error(f"Error executing query: {e}")
        return QueryResult(success=False, error=str(e))


# Export Routes
@app.post("/api/export")
async def export_data(
    request: ExportRequest, current_user: User = Depends(get_current_user)
):
    try:
        query_sql = ""
        if request.query_id:
            query_obj = QueryService.get_query_by_id(request.query_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Query not found")
            query_sql = query_obj.sql_query
        elif request.sql_query:
            query_sql = request.sql_query
        else:
            raise HTTPException(
                status_code=400, detail="Either query_id or sql_query must be provided"
            )

        # Execute query to get data
        df = db_manager.execute_query_pandas(query_sql)

        if request.format.lower() == "csv":
            csv_data = df.to_csv(index=False)
            return StreamingResponse(
                io.StringIO(csv_data),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={request.filename or 'export.csv'}"
                },
            )
        elif request.format.lower() == "excel":
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
                df.to_excel(writer, sheet_name="Data", index=False)
            output.seek(0)

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename={request.filename or 'export.xlsx'}"
                },
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported export format")

    except Exception as e:
        logger.error(f"Error exporting data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)

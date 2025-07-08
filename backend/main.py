from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    StreamingResponse,
    RedirectResponse,
    HTMLResponse,
)
from contextlib import asynccontextmanager
import uvicorn
import logging
import io
import json
import pandas as pd
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
    create_user,
    require_admin,
    get_password_hash,
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
    DashboardWidgetCreate,
    QueryCreate,
    ExportRequest,
    FilteredQueryRequest,
    APIResponse,
    UserCreate,
    UserUpdate,
    UserRole,
    MenuItemCreate,
)
from sql_utils import validate_sql
from services import DataService  # NEW: use shared DataService implementation

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
    def _ensure_role_column():
        """Add ROLE column to APP_QUERIES if it doesn't exist."""
        try:
            db_manager.execute_non_query(
                "ALTER TABLE app_queries ADD (role VARCHAR2(30) DEFAULT 'user')"
            )
        except Exception:
            # Ignore if already exists or cannot add
            pass

    @staticmethod
    def get_query_by_id(query_id: int) -> Optional[Query]:
        try:
            query = """
            SELECT id, name, description, sql_query, chart_type, chart_config, 
                   menu_item_id, role, is_active, created_at
            FROM app_queries WHERE id = :1 AND is_active = 1
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
                    role=row.get("ROLE", "user"),
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )
            return None
        except Exception as e:
            if "ORA-00904" in str(e).upper() and "ROLE" in str(e).upper():
                QueryService._ensure_role_column()
                result = db_manager.execute_query(query, (query_id,))
            else:
                raise

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
                    role=row.get("ROLE", "user"),
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )
            return None

    @staticmethod
    def get_queries_by_menu(menu_item_id: int) -> List[Query]:
        """Return all active queries that belong to a given menu item (report section)."""
        query_sql = """
        SELECT id, name, description, sql_query, chart_type, chart_config,
               menu_item_id, role, is_active, created_at
        FROM app_queries
        WHERE menu_item_id = :1 AND is_active = 1
        ORDER BY created_at DESC
        """

        try:
            rows = db_manager.execute_query(query_sql, (menu_item_id,))
        except Exception as e:
            if "ORA-00904" in str(e).upper() and "ROLE" in str(e).upper():
                QueryService._ensure_role_column()
                rows = db_manager.execute_query(query_sql, (menu_item_id,))
            else:
                logger.error(f"Error getting queries for menu {menu_item_id}: {e}")
                return []

        queries: List[Query] = []
        for row in rows:
            chart_config = {}
            if row["CHART_CONFIG"]:
                try:
                    chart_config = json.loads(row["CHART_CONFIG"])
                except Exception:
                    chart_config = {}

            queries.append(
                Query(
                    id=row["ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=row["MENU_ITEM_ID"],
                    role=row["ROLE"],
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )
            )

        return queries


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
    # Disallow form logins when SAML mode is enabled
    if get_auth_mode() != "form":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form-based authentication is disabled",
        )

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


# ---------------------------------------------------------------------------
# SAML Authentication Routes
# ---------------------------------------------------------------------------
@app.get("/auth/saml/login")
async def saml_login(request: Request):
    if get_auth_mode() != "saml":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAML authentication not enabled",
        )

    redirect_url = saml_auth.initiate_login(request)
    return RedirectResponse(url=redirect_url)


@app.post("/auth/saml/acs")
async def saml_acs(request: Request):
    if get_auth_mode() != "saml":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAML authentication not enabled",
        )

    form = await request.form()
    saml_response = form.get("SAMLResponse")
    if not saml_response:
        raise HTTPException(status_code=400, detail="Missing SAMLResponse in request")

    user = saml_auth.handle_response(saml_response)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid SAML response")

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # Return a small HTML page that stores the token and redirects to the dashboard
    html_content = f"""
    <!DOCTYPE html>
    <html lang=\"en\">
      <head>
        <meta charset=\"UTF-8\">
        <title>Login Successful</title>
      </head>
      <body>
        <script>
          (function() {{
            var token = '{access_token}';
            localStorage.setItem('auth_token', token);
            document.cookie = 'auth_token=' + token + '; path=/; max-age=' + (7*24*60*60) + '; samesite=strict;';
            window.location.href = '{settings.FRONTEND_BASE_URL.rstrip('/')}/dashboard';
          }})();
        </script>
        <noscript>Login successful. You can now close this window.</noscript>
      </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# Menu Routes
@app.get("/api/menu", response_model=List[MenuItem])
async def get_menu(current_user: User = Depends(get_current_user)):
    return MenuService.get_menu_structure()


# Dashboard Routes
@app.get("/api/dashboard", response_model=List[DashboardWidget])
async def get_dashboard(current_user: User = Depends(get_current_user)):
    widgets = DashboardService.get_dashboard_layout()
    if current_user.role != UserRole.ADMIN:
        widgets = [
            w for w in widgets if (not w.query) or (w.query.role in (None, "", current_user.role))
        ]
    return widgets


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

            # Role authorization: admin can run anything; others only if role matches
            if current_user.role != UserRole.ADMIN and query_obj.role not in (None, "", current_user.role):
                raise HTTPException(status_code=403, detail="Not authorized for this query")

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
            validate_sql(request.sql_query)
            query_sql = request.sql_query
            return DataService.execute_query_for_table(
                query_sql, request.limit, request.offset
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
            validate_sql(request.sql_query)
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
                io.BytesIO(csv_data.encode("utf-8")),
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

            # Ensure correct file extension
            filename = request.filename or "export.xlsx"
            if not filename.endswith(".xlsx"):
                filename = filename.replace(".excel", ".xlsx")
                if not filename.endswith(".xlsx"):
                    filename += ".xlsx"

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported export format")

    except Exception as e:
        logger.error(f"Error exporting data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Reports Routes
# ---------------------------------------------------------------------------


@app.get("/api/reports/menu/{menu_item_id}", response_model=APIResponse)
async def get_reports_by_menu(
    menu_item_id: int, current_user: User = Depends(get_current_user)
):
    try:
        queries = QueryService.get_queries_by_menu(menu_item_id)
        if current_user.role != UserRole.ADMIN:
            queries = [q for q in queries if q.role in (None, "", current_user.role)]
        return APIResponse(success=True, data=queries)
    except Exception as e:
        logger.error(f"Error retrieving reports for menu {menu_item_id}: {e}")
        return APIResponse(success=False, error=str(e))


# ---------------------------------------------------------------------------
# Query Detail and Filtered execution endpoints
# ---------------------------------------------------------------------------


@app.get("/api/query/{query_id}", response_model=APIResponse)
async def get_query_detail(
    query_id: int, current_user: User = Depends(get_current_user)
):
    try:
        query_obj = QueryService.get_query_by_id(query_id)
        if not query_obj:
            return APIResponse(success=False, error="Query not found")
        return APIResponse(success=True, data=query_obj)
    except Exception as e:
        logger.error(f"Error getting query detail {query_id}: {e}")
        return APIResponse(success=False, error=str(e))


@app.post("/api/query/filtered", response_model=QueryResult)
async def execute_filtered_query(
    request: FilteredQueryRequest, current_user: User = Depends(get_current_user)
):
    """Execute a filtered query with sorting and pagination"""
    try:
        return DataService.execute_filtered_query(request)
    except Exception as e:
        logger.error(f"Error executing filtered query: {e}")
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")


# ==============================================
# ADMIN ENDPOINTS FOR DASHBOARD CUSTOMIZATION
# ==============================================


@app.post("/api/admin/user", response_model=APIResponse)
async def create_user_admin(
    request: UserCreate, current_user: User = Depends(require_admin)
):
    """Admin endpoint to create new users"""
    try:
        new_user = create_user(request, role=request.role)

        return APIResponse(
            success=True,
            message=f"User '{request.username}' created successfully",
            data={
                "user_id": new_user.id,
                "username": new_user.username,
                "email": new_user.email,
                "role": new_user.role,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")


@app.get("/api/admin/users", response_model=APIResponse)
async def list_users(current_user: User = Depends(require_admin)):
    """Admin endpoint to list all users"""
    try:
        query = """
        SELECT id, username, email, role, is_active, created_at
        FROM app_users
        ORDER BY created_at DESC
        """

        result = db_manager.execute_query(query)

        users = []
        for row in result:
            users.append(
                {
                    "id": row["ID"],
                    "username": row["USERNAME"],
                    "email": row["EMAIL"],
                    "role": row.get("ROLE", "user"),
                    "is_active": bool(row["IS_ACTIVE"]),
                    "created_at": (
                        row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None
                    ),
                    "is_admin": row.get("ROLE", "user") == "admin",
                }
            )

        return APIResponse(
            success=True, message=f"Found {len(users)} users", data=users
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")


# ------------------ New User Management Endpoints ------------------

# Query deletion


@app.delete("/api/admin/query/{query_id}", response_model=APIResponse)
async def delete_query_admin(query_id: int, current_user: User = Depends(require_admin)):
    """Delete a query by ID"""
    try:
        # Ensure query exists
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1", (query_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="Query not found")

        db_manager.execute_non_query("DELETE FROM app_queries WHERE id = :1", (query_id,))
        return APIResponse(success=True, message="Query deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting query: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete query")


@app.put("/api/admin/user/{user_id}", response_model=APIResponse)
async def update_user_admin(
    user_id: int,
    request: UserUpdate,
    current_user: User = Depends(require_admin),
):
    """Admin endpoint to update existing user"""
    try:
        # Build dynamic update statement
        fields = []
        params = []

        if request.username:
            fields.append("username = :?")
            params.append(request.username)
        if request.email:
            fields.append("email = :?")
            params.append(request.email)
        if request.password:
            fields.append("password_hash = :?")
            params.append(get_password_hash(request.password))
        if request.role:
            fields.append("role = :?")
            params.append(request.role)
        if request.is_active is not None:
            fields.append("is_active = :?")
            params.append(1 if request.is_active else 0)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        # Oracle uses positional bind parameters; convert ? placeholders to numbers
        set_clause = ", ".join(
            field.replace(":?", f":{i+1}") for i, field in enumerate(fields)
        )
        sql = f"UPDATE app_users SET {set_clause} WHERE id = :{len(params)+1}"
        params.append(user_id)

        db_manager.execute_non_query(sql, tuple(params))

        return APIResponse(success=True, message="User updated successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        raise HTTPException(status_code=500, detail="Failed to update user")


@app.delete("/api/admin/user/{user_id}", response_model=APIResponse)
async def delete_user_admin(
    user_id: int, current_user: User = Depends(require_admin)
):
    """Admin endpoint to delete user"""
    try:
        db_manager.execute_non_query("DELETE FROM app_users WHERE id = :1", (user_id,))
        return APIResponse(success=True, message="User deleted successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user")


@app.post("/api/admin/query", response_model=APIResponse)
async def create_query(
    request: QueryCreate, current_user: User = Depends(require_admin)
):
    """Create a new query for dashboard widgets or reports"""
    try:
        # Insert including role column; add column if missing
        insert_sql = """
        INSERT INTO app_queries (name, description, sql_query, chart_type, chart_config, menu_item_id, role)
        VALUES (:1, :2, :3, :4, :5, :6, :7)
        """
        try:
            db_manager.execute_non_query(
                insert_sql,
                (
                    request.name,
                    request.description,
                    request.sql_query,
                    request.chart_type,
                    json.dumps(request.chart_config or {}),
                    request.menu_item_id,
                    request.role or "user",
                ),
            )
        except Exception as e:
            if "ORA-00904" in str(e).upper() and "ROLE" in str(e).upper():
                # Add ROLE column then retry
                db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(30) DEFAULT 'user')")
                db_manager.execute_non_query(
                    insert_sql,
                    (
                        request.name,
                        request.description,
                        request.sql_query,
                        request.chart_type,
                        json.dumps(request.chart_config or {}),
                        request.menu_item_id,
                        request.role or "user",
                    ),
                )
            else:
                logger.error(f"Error creating query: {e}")
                raise HTTPException(status_code=500, detail="Failed to create query")

        return APIResponse(success=True, message="Query created")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating query: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create query: {str(e)}")


@app.post("/api/admin/dashboard/widget", response_model=APIResponse)
async def create_dashboard_widget(
    request: DashboardWidgetCreate, current_user: User = Depends(get_current_user)
):
    """Create a new dashboard widget"""
    try:
        # Verify the query exists
        query_check = db_manager.execute_query(
            "SELECT id FROM app_queries WHERE id = :1 AND is_active = 1",
            (request.query_id,),
        )

        if not query_check:
            raise HTTPException(status_code=404, detail="Query not found or inactive")

        # Insert the new widget
        query = """
        INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height)
        VALUES (:1, :2, :3, :4, :5, :6)
        """

        affected_rows = db_manager.execute_non_query(
            query,
            (
                request.title,
                request.query_id,
                request.position_x,
                request.position_y,
                request.width,
                request.height,
            ),
        )

        if affected_rows > 0:
            # Get the ID of the newly created widget
            result = db_manager.execute_query(
                "SELECT id FROM app_dashboard_widgets WHERE title = :1 ORDER BY created_at DESC",
                (request.title,),
            )

            new_widget_id = result[0]["ID"] if result else None

            return APIResponse(
                success=True,
                message=f"Dashboard widget '{request.title}' created successfully",
                data={"widget_id": new_widget_id},
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to create widget")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating dashboard widget: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create widget: {str(e)}"
        )


@app.get("/api/admin/queries", response_model=APIResponse)
async def list_all_queries(current_user: User = Depends(get_current_user)):
    """List all queries available for dashboard widgets"""
    try:
        query = """
        SELECT q.id, q.name, q.description, q.chart_type, q.created_at,
               m.name as menu_name
        FROM app_queries q
        LEFT JOIN app_menu_items m ON q.menu_item_id = m.id
        WHERE q.is_active = 1
        ORDER BY q.created_at DESC
        """

        result = db_manager.execute_query(query)

        queries = []
        for row in result:
            queries.append(
                {
                    "id": row["ID"],
                    "name": row["NAME"],
                    "description": row["DESCRIPTION"],
                    "chart_type": row["CHART_TYPE"],
                    "menu_name": row["MENU_NAME"],
                    "created_at": (
                        row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None
                    ),
                }
            )

        return APIResponse(
            success=True, message=f"Found {len(queries)} queries", data=queries
        )

    except Exception as e:
        logger.error(f"Error listing queries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list queries: {str(e)}")


@app.delete("/api/admin/dashboard/widget/{widget_id}", response_model=APIResponse)
async def delete_dashboard_widget(
    widget_id: int, current_user: User = Depends(get_current_user)
):
    """Delete a dashboard widget"""
    try:
        # Check if widget exists
        check_query = "SELECT id FROM app_dashboard_widgets WHERE id = :1"
        result = db_manager.execute_query(check_query, (widget_id,))

        if not result:
            raise HTTPException(status_code=404, detail="Widget not found")

        # Delete the widget
        delete_query = "DELETE FROM app_dashboard_widgets WHERE id = :1"
        affected_rows = db_manager.execute_non_query(delete_query, (widget_id,))

        if affected_rows > 0:
            return APIResponse(
                success=True, message=f"Widget {widget_id} deleted successfully"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to delete widget")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting widget: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete widget: {str(e)}"
        )


@app.get("/api/admin/dashboard/widgets", response_model=APIResponse)
async def list_dashboard_widgets(current_user: User = Depends(get_current_user)):
    """List all dashboard widgets with their query information"""
    try:
        query = """
        SELECT w.id, w.title, w.position_x, w.position_y, w.width, w.height,
               w.created_at, q.name as query_name, q.chart_type
        FROM app_dashboard_widgets w
        JOIN app_queries q ON w.query_id = q.id
        WHERE w.is_active = 1 AND q.is_active = 1
        ORDER BY w.position_y, w.position_x
        """

        result = db_manager.execute_query(query)

        widgets = []
        for row in result:
            widgets.append(
                {
                    "id": row["ID"],
                    "title": row["TITLE"],
                    "position_x": row["POSITION_X"],
                    "position_y": row["POSITION_Y"],
                    "width": row["WIDTH"],
                    "height": row["HEIGHT"],
                    "query_name": row["QUERY_NAME"],
                    "chart_type": row["CHART_TYPE"],
                    "created_at": (
                        row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None
                    ),
                }
            )

        return APIResponse(
            success=True,
            message=f"Found {len(widgets)} dashboard widgets",
            data=widgets,
        )

    except Exception as e:
        logger.error(f"Error listing dashboard widgets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list widgets: {str(e)}")


@app.post("/api/admin/menu", response_model=APIResponse)
async def create_menu_item(request: MenuItemCreate, current_user: User = Depends(require_admin)):
    try:
        insert_sql = "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, is_active) VALUES (:1, :2, :3, :4, :5, 1)"
        db_manager.execute_non_query(
            insert_sql,
            (
                request.name,
                request.type,
                request.icon,
                request.parent_id,
                request.sort_order,
            ),
        )
        return APIResponse(success=True, message="Menu item created")
    except Exception as e:
        logger.error(f"Error creating menu item: {e}")
        raise HTTPException(status_code=500, detail="Failed to create menu item")


@app.put("/api/admin/menu/{menu_id}", response_model=APIResponse)
async def update_menu_item(menu_id: int, request: MenuItemCreate, current_user: User = Depends(require_admin)):
    try:
        update_sql = """
        UPDATE app_menu_items SET name=:1, type=:2, icon=:3, parent_id=:4, sort_order=:5 WHERE id=:6
        """
        db_manager.execute_non_query(
            update_sql,
            (
                request.name,
                request.type,
                request.icon,
                request.parent_id,
                request.sort_order,
                menu_id,
            ),
        )
        return APIResponse(success=True, message="Menu item updated")
    except Exception as e:
        logger.error(f"Error updating menu item: {e}")
        raise HTTPException(status_code=500, detail="Failed to update menu item")


@app.delete("/api/admin/menu/{menu_id}", response_model=APIResponse)
async def delete_menu_item(menu_id: int, current_user: User = Depends(require_admin)):
    try:
        db_manager.execute_non_query("DELETE FROM app_menu_items WHERE id = :1", (menu_id,))
        return APIResponse(success=True, message="Menu item deleted")
    except Exception as e:
        logger.error(f"Error deleting menu item: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete menu item")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)

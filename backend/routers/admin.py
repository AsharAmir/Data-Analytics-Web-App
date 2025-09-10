import json
import logging
from typing import List, Optional
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_admin, get_password_hash
from roles_utils import normalize_role, serialize_roles, get_default_role, get_admin_role, get_user_role
from database import db_manager
from models import (
    APIResponse,
    DashboardWidgetCreate,
    MenuItemCreate,
    QueryCreate,
    User,
    UserCreate,
    UserUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Constants for database values
class QueryType(str, Enum):
    KPI = "kpi"
    CHART = "chart"
    TABLE = "table"

class DatabaseFlags:
    ACTIVE = 1
    INACTIVE = 0
    DEFAULT_DASHBOARD = 1
    NON_DEFAULT_DASHBOARD = 0
    KPI = 1
    NON_KPI = 0

class MenuConstants:
    DEFAULT_DASHBOARD_ID = -1  # Special ID representing default dashboard

# Query management utilities
class QueryUtils:
    """Utility functions for query management"""
    
    @staticmethod
    def is_default_dashboard(menu_item_id: Optional[int]) -> bool:
        """Check if the menu_item_id represents the default dashboard"""
        return menu_item_id == MenuConstants.DEFAULT_DASHBOARD_ID or menu_item_id is None
    
    @staticmethod
    def get_menu_item_id_for_db(menu_item_id: Optional[int]) -> Optional[int]:
        """Convert menu_item_id for database storage (None for default dashboard)"""
        return None if QueryUtils.is_default_dashboard(menu_item_id) else menu_item_id
    
    @staticmethod
    def get_default_dashboard_flag(menu_item_id: Optional[int]) -> int:
        """Get the is_default_dashboard flag value"""
        return DatabaseFlags.DEFAULT_DASHBOARD if QueryUtils.is_default_dashboard(menu_item_id) else DatabaseFlags.NON_DEFAULT_DASHBOARD


@router.post("/user", response_model=APIResponse)
async def create_user_admin(request: UserCreate, current_user: User = Depends(require_admin)):
    from auth import create_user

    try:
        new_user = create_user(request, role=normalize_role(request.role))
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
    except Exception as exc:
        logger.error(f"Error creating user: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create user")


@router.get("/users", response_model=APIResponse)
async def list_users(current_user: User = Depends(require_admin)):
    try:
        query = """
        SELECT id, username, email, role, is_active, created_at
        FROM app_users
        ORDER BY created_at DESC
        """
        result = db_manager.execute_query(query)
        users: List[dict] = []
        for row in result:
            from auth import normalize_role
            raw_role = row.get("ROLE") or get_default_role()
            raw_role = normalize_role(raw_role)
            is_admin = raw_role == "ADMIN"

            users.append(
                {
                    "id": row["ID"],
                    "username": row["USERNAME"],
                    "email": row["EMAIL"],
                    "role": raw_role,
                    "is_active": bool(row["IS_ACTIVE"]),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                    "is_admin": is_admin,
                }
            )
        return APIResponse(success=True, message=f"Found {len(users)} users", data=users)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error listing users: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list users")


@router.put("/user/{user_id}", response_model=APIResponse)
async def update_user_admin(user_id: int, request: UserUpdate, current_user: User = Depends(require_admin)):
    try:
        fields = []
        params: List = []
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
            params.append(normalize_role(request.role))
        if request.is_active is not None:
            fields.append("is_active = :?")
            params.append(1 if request.is_active else 0)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields provided for update")
        set_clause = ", ".join(field.replace(":?", f":{i+1}") for i, field in enumerate(fields))
        sql = f"UPDATE app_users SET {set_clause} WHERE id = :{len(params)+1}"
        params.append(user_id)
        db_manager.execute_non_query(sql, tuple(params))
        return APIResponse(success=True, message="User updated successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error updating user: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update user")


@router.delete("/user/{user_id}", response_model=APIResponse)
async def delete_user_admin(user_id: int, current_user: User = Depends(require_admin)):
    try:
        db_manager.execute_non_query("DELETE FROM app_users WHERE id = :1", (user_id,))
        return APIResponse(success=True, message="User deleted successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting user: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete user")

@router.post("/query", response_model=APIResponse)
async def create_query(request: QueryCreate, current_user: User = Depends(require_admin)):
    """Create a new query with professional practices and proper error handling"""
    try:
        # Prepare data using utility functions
        db_menu_item_id = QueryUtils.get_menu_item_id_for_db(request.menu_item_id)
        is_default_dashboard = QueryUtils.get_default_dashboard_flag(request.menu_item_id)
        roles = serialize_roles(request.role) or get_default_role()
        
        # SQL query with named parameters for better readability
        insert_sql = """
        INSERT INTO app_queries (
            name, description, sql_query, chart_type, chart_config, 
            menu_item_id, role, is_default_dashboard
        ) VALUES (
            :name, :description, :sql_query, :chart_type, :chart_config,
            :menu_item_id, :role, :is_default_dashboard
        )
        """
        
        # Parameters dictionary for better maintainability
        params = {
            "name": request.name,
            "description": request.description,
            "sql_query": request.sql_query,
            "chart_type": request.chart_type,
            "chart_config": json.dumps(request.chart_config or {}),
            "menu_item_id": db_menu_item_id,
            "role": roles,
            "is_default_dashboard": is_default_dashboard
        }
        
        db_manager.execute_non_query(insert_sql, params)
        logger.info(f"Successfully created query: {request.name}")
        
        # Get the newly created query ID
        get_id_query = """
        SELECT id FROM app_queries 
        WHERE name = :name 
        ORDER BY created_at DESC 
        FETCH FIRST 1 ROWS ONLY
        """
        id_result = db_manager.execute_query(get_id_query, {"name": request.name})
        new_query_id = id_result[0]["ID"] if id_result else None
        
        # Handle menu item associations if provided
        if request.menu_item_ids and new_query_id:
            junction_sql = """
            INSERT INTO app_query_menu_items (query_id, menu_item_id) 
            VALUES (:query_id, :menu_item_id)
            """
            for menu_id in request.menu_item_ids:
                if not QueryUtils.is_default_dashboard(menu_id):
                    try:
                        db_manager.execute_non_query(junction_sql, {
                            "query_id": new_query_id, 
                            "menu_item_id": menu_id
                        })
                    except Exception as e:
                        logger.warning(f"Failed to associate query {new_query_id} with menu {menu_id}: {e}")
        
        if new_query_id:
            logger.info(f"Query created successfully with ID: {new_query_id}")
            return APIResponse(
                success=True, 
                message=f"Query '{request.name}' created successfully",
                data={"query_id": new_query_id}
            )
        else:
            logger.error("Failed to retrieve new query ID")
            raise HTTPException(status_code=500, detail="Query created but failed to retrieve ID")
            
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error creating query '{request.name}': {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to create query: {str(exc)}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error creating query: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create query")


@router.get("/query/{query_id}", response_model=APIResponse)
async def get_query_admin(query_id: int, current_user: User = Depends(require_admin)):
    try:
        query = """
        SELECT id, name, description, sql_query, chart_type, chart_config, menu_item_id, role, created_at, 
               COALESCE(is_default_dashboard, 0) as is_default_dashboard
        FROM app_queries
        WHERE id = :1 AND is_active = 1
        """
        result = db_manager.execute_query(query, (query_id,))
        if not result:
            raise HTTPException(status_code=404, detail="Query not found")
        
        row = result[0]
        chart_config = {}
        if row["CHART_CONFIG"]:
            try:
                chart_config = json.loads(row["CHART_CONFIG"])
            except:
                chart_config = {}
        
        menu_ids = []
        menu_names = []
        try:
            menu_query = """
            SELECT m.id, m.name 
            FROM app_query_menu_items qm
            JOIN app_menu_items m ON qm.menu_item_id = m.id
            WHERE qm.query_id = :1
            """
            menu_result = db_manager.execute_query(menu_query, (query_id,))
            menu_ids = [r["ID"] for r in menu_result]
            menu_names = [r["NAME"] for r in menu_result]
        except Exception as exc:
            logger.warning(f"Could not get menu assignments: {exc}")
            if row["MENU_ITEM_ID"]:
                menu_ids = [row["MENU_ITEM_ID"]]
        
        if row["IS_DEFAULT_DASHBOARD"] == 1:
            frontend_menu_item_id = -1
        elif row["MENU_ITEM_ID"] is None and not menu_ids:
            frontend_menu_item_id = None
        else:
            frontend_menu_item_id = row["MENU_ITEM_ID"]
        
        query_data = {
            "id": row["ID"],
            "name": row["NAME"],
            "description": row["DESCRIPTION"],
            "sql_query": row["SQL_QUERY"],
            "chart_type": row["CHART_TYPE"],
            "chart_config": chart_config,
            "menu_item_id": frontend_menu_item_id,
            "menu_item_ids": menu_ids,
            "menu_names": menu_names,
            "role": row.get("ROLE", get_default_role()),
            "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
        }
        return APIResponse(success=True, data=query_data)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error getting query: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get query")


@router.put("/query/{query_id}", response_model=APIResponse)
async def update_query_admin(query_id: int, request: QueryCreate, current_user: User = Depends(require_admin)):
    try:
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1", (query_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="Query not found")
        
        update_sql = """
        UPDATE app_queries 
        SET name=:name, description=:description, sql_query=:sql_query, chart_type=:chart_type, 
            chart_config=:chart_config, menu_item_id=:menu_item_id, role=:role, is_default_dashboard=:is_default_dashboard
        WHERE id=:query_id
        """
        try:
            is_default_dashboard = 1 if request.menu_item_id == -1 else 0
            if request.menu_item_id == -1:
                db_menu_item_id = None
            elif request.menu_item_id is None:
                db_menu_item_id = None
            else:
                db_menu_item_id = request.menu_item_id
            
            roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
            db_manager.execute_non_query(
                update_sql,
                {
                    "name": request.name,
                    "description": request.description,
                    "sql_query": request.sql_query,
                    "chart_type": request.chart_type,
                    "chart_config": json.dumps(request.chart_config or {}),
                    "menu_item_id": db_menu_item_id,
                    "role": serialize_roles(request.role) or get_default_role(),
                    "is_default_dashboard": is_default_dashboard,
                    "query_id": query_id,
                },
            )
        except Exception:
            raise
        
        if request.menu_item_ids:
            db_manager.execute_non_query("DELETE FROM app_query_menu_items WHERE query_id = :1", (query_id,))
            junction_sql = "INSERT INTO app_query_menu_items (query_id, menu_item_id) VALUES (:query_id, :menu_item_id)"
            for menu_id in request.menu_item_ids:
                if menu_id != -1:
                    db_manager.execute_non_query(junction_sql, {"query_id": query_id, "menu_item_id": menu_id})
        
        return APIResponse(success=True, message="Query updated successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error updating query: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update query")


@router.delete("/query/{query_id}", response_model=APIResponse)
async def delete_query_admin(query_id: int, current_user: User = Depends(require_admin)):
    try:
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1", (query_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="Query not found")

        count_query = "SELECT COUNT(*) as cnt FROM app_dashboard_widgets WHERE query_id = :1"
        result = db_manager.execute_query(count_query, (query_id,))
        widget_count = result[0]["CNT"] if result else 0
        if widget_count > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete query that is used in dashboard widgets. Remove the widgets first."
            )

        db_manager.execute_non_query("DELETE FROM app_queries WHERE id = :1", (query_id,))
        return APIResponse(success=True, message="Query deleted successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting query: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete query")


@router.get("/queries", response_model=APIResponse)
async def list_all_queries(current_user: User = Depends(get_current_user)):
    try:
        query = """
        SELECT q.id, q.name, q.description, q.chart_type, q.created_at, q.role, q.menu_item_id
        FROM app_queries q
        WHERE q.is_active = 1
        ORDER BY q.created_at DESC
        """
        result = db_manager.execute_query(query)
        queries: List[dict] = []
        for row in result:
            menu_names = []
            try:
                menu_query = """
                SELECT m.name 
                FROM app_query_menu_items qm
                JOIN app_menu_items m ON qm.menu_item_id = m.id
                WHERE qm.query_id = :1
                ORDER BY m.name
                """
                menu_result = db_manager.execute_query(menu_query, (row["ID"],))
                menu_names = [r["NAME"] for r in menu_result]
            except Exception as exc:
                logger.warning(f"Could not get menu assignments for query {row['ID']}: {exc}")
                if row["MENU_ITEM_ID"]:
                    legacy_menu_query = "SELECT name FROM app_menu_items WHERE id = :1"
                    legacy_result = db_manager.execute_query(legacy_menu_query, (row["MENU_ITEM_ID"],))
                    if legacy_result:
                        menu_names = [legacy_result[0]["NAME"]]
            
            if not menu_names:
                if row["MENU_ITEM_ID"] is None:
                    menu_names = ["Default Dashboard"]
                elif row["MENU_ITEM_ID"] == -999:
                    menu_names = []
            
            queries.append(
                {
                    "id": row["ID"],
                    "name": row["NAME"],
                    "description": row["DESCRIPTION"],
                    "chart_type": row["CHART_TYPE"],
                    "menu_name": ", ".join(menu_names) if menu_names else None,
                    "menu_names": menu_names,
                    "role": row.get("ROLE", get_default_role()),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                }
            )
        return APIResponse(success=True, message=f"Found {len(queries)} queries", data=queries)
    except Exception as exc:
        logger.error(f"Error listing queries: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list queries")


@router.post("/dashboard/widget", response_model=APIResponse)
async def create_dashboard_widget(request: DashboardWidgetCreate, current_user: User = Depends(get_current_user)):
    try:
        query_check = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1 AND is_active = 1", (request.query_id,))
        if not query_check:
            raise HTTPException(status_code=404, detail="Query not found or inactive")
        insert_sql = """
        INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height)
        VALUES (:title, :query_id, :position_x, :position_y, :width, :height)
        """
        db_manager.execute_non_query(
            insert_sql,
            {
                "title": request.title,
                "query_id": request.query_id,
                "position_x": request.position_x,
                "position_y": request.position_y,
                "width": request.width,
                "height": request.height,
            },
        )
        result = db_manager.execute_query(
            "SELECT id FROM app_dashboard_widgets WHERE title = :1 ORDER BY created_at DESC",
            (request.title,),
        )
        new_id = result[0]["ID"] if result else None
        return APIResponse(success=True, message="Dashboard widget created", data={"widget_id": new_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error creating dashboard widget: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create widget")


@router.delete("/dashboard/widget/{widget_id}", response_model=APIResponse)
async def delete_dashboard_widget(widget_id: int, current_user: User = Depends(get_current_user)):
    try:
        check = db_manager.execute_query("SELECT id FROM app_dashboard_widgets WHERE id = :1", (widget_id,))
        if not check:
            raise HTTPException(status_code=404, detail="Widget not found")
        db_manager.execute_non_query("DELETE FROM app_dashboard_widgets WHERE id = :1", (widget_id,))
        return APIResponse(success=True, message=f"Widget {widget_id} deleted successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting widget: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete widget")


from models import DashboardWidgetUpdate


@router.put("/dashboard/widget/{widget_id}", response_model=APIResponse)
async def update_dashboard_widget(widget_id: int, request: DashboardWidgetUpdate, current_user: User = Depends(get_current_user)):
    try:
        check = db_manager.execute_query("SELECT id FROM app_dashboard_widgets WHERE id = :1", (widget_id,))
        if not check:
            raise HTTPException(status_code=404, detail="Widget not found")

        fields = []
        params = []
        mapping = {
            "title": request.title,
            "query_id": request.query_id,
            "position_x": request.position_x,
            "position_y": request.position_y,
            "width": request.width,
            "height": request.height,
            "is_active": request.is_active,
        }
        for col, val in mapping.items():
            if val is not None:
                fields.append(f"{col} = :{len(params)+1}")
                params.append(val)

        if not fields:
            return APIResponse(success=True, message="No changes submitted")

        update_sql = f"UPDATE app_dashboard_widgets SET {', '.join(fields)} WHERE id = :{len(params)+1}"
        params.append(widget_id)
        db_manager.execute_non_query(update_sql, tuple(params))

        return APIResponse(success=True, message="Widget updated")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error updating widget: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update widget")


@router.get("/dashboard/widgets", response_model=APIResponse)
async def list_dashboard_widgets(current_user: User = Depends(get_current_user)):
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
        widgets: List[dict] = []
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
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                }
            )
        return APIResponse(success=True, message=f"Found {len(widgets)} dashboard widgets", data=widgets)
    except Exception as exc:
        logger.error(f"Error listing dashboard widgets: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list widgets")


@router.post("/menu", response_model=APIResponse)
async def create_menu_item(request: MenuItemCreate, current_user: User = Depends(require_admin)):
    try:
        if request.parent_id is not None:
            parent_type_result = db_manager.execute_query(
                "SELECT type FROM app_menu_items WHERE id = :1",
                (request.parent_id,),
            )

            if parent_type_result and str(parent_type_result[0]["TYPE"]).lower() == "dashboard":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot create submenu for dashboard menu items.",
                )
        sql = """
        INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, role, is_active)
        VALUES (:1, :2, :3, :4, :5, :6, 1)
        """
        roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
        db_manager.execute_non_query(
            sql,
            (
                request.name,
                request.type,
                request.icon,
                request.parent_id,
                request.sort_order,
                serialize_roles(request.role),
            ),
        )
        return APIResponse(success=True, message="Menu item created successfully")
    except Exception as exc:
        logger.error(f"Error creating menu item: {exc}")
        raise HTTPException(
            status_code=500, detail="Failed to create menu item"
        )


@router.put("/menu/{menu_id}", response_model=APIResponse)
async def update_menu_item(
    menu_id: int, request: MenuItemCreate, current_user: User = Depends(require_admin)
):
    try:
        if request.parent_id is not None:
            parent_type_result = db_manager.execute_query(
                "SELECT type FROM app_menu_items WHERE id = :1",
                (request.parent_id,),
            )

            if parent_type_result and str(parent_type_result[0]["TYPE"]).lower() == "dashboard":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot assign a dashboard menu as parent for another menu item.",
                )
        update_sql = """
        UPDATE app_menu_items SET name=:1, type=:2, icon=:3, parent_id=:4, sort_order=:5, role=:6 WHERE id=:7
        """
        roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
        db_manager.execute_non_query(
            update_sql,
            (
                request.name,
                request.type,
                request.icon,
                request.parent_id,
                request.sort_order,
                serialize_roles(request.role),
                menu_id,
            ),
        )
        return APIResponse(success=True, message="Menu item updated")
    except Exception as exc:
        logger.error(f"Error updating menu item: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update menu item")


@router.delete("/menu/{menu_id}", response_model=APIResponse)
async def delete_menu_item(menu_id: int, current_user: User = Depends(require_admin)):
    try:
        children = db_manager.execute_query(
            "SELECT id FROM app_menu_items WHERE parent_id = :1", (menu_id,)
        )

        db_manager.execute_non_query(
            "UPDATE app_queries SET menu_item_id = NULL WHERE menu_item_id = :1",
            (menu_id,),
        )

        for child in children:
            child_id = child["ID"]
            await delete_menu_item(child_id, current_user)

        db_manager.execute_non_query("DELETE FROM app_menu_items WHERE id = :1", (menu_id,))

        return APIResponse(success=True, message=f"Menu item {menu_id} deleted")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting menu item {menu_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete menu item")


@router.get("/kpis", response_model=APIResponse)
async def list_kpis(current_user: User = Depends(get_current_user)):
    try:
        query = """
        SELECT q.id, q.name, q.description, q.sql_query, q.role, q.created_at,
               m.name as menu_name
        FROM app_queries q
        LEFT JOIN app_menu_items m ON q.menu_item_id = m.id
        WHERE q.is_active = 1 AND q.is_kpi = 1
        ORDER BY q.created_at DESC
        """
        result = db_manager.execute_query(query)

        kpis: List[dict] = []
        for row in result:
            menu_name = row["MENU_NAME"] if row["MENU_NAME"] else "Default Dashboard"
            
            kpis.append(
                {
                    "id": row["ID"],
                    "name": row["NAME"],
                    "description": row["DESCRIPTION"],
                    "sql_query": row["SQL_QUERY"],
                    "menu_name": menu_name,
                    "role": row.get("ROLE", get_default_role()),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                }
            )
        return APIResponse(success=True, message=f"Found {len(kpis)} KPIs", data=kpis)
    except Exception as exc:
        logger.error(f"Error listing KPIs: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list KPIs")


@router.post("/kpi", response_model=APIResponse)
async def create_kpi(request: QueryCreate, current_user: User = Depends(require_admin)):
    """Create a new KPI with proper error handling and professional practices"""
    try:
        # Prepare data using utility functions
        db_menu_item_id = QueryUtils.get_menu_item_id_for_db(request.menu_item_id)
        is_default_dashboard = QueryUtils.get_default_dashboard_flag(request.menu_item_id)
        roles = serialize_roles(request.role) or get_default_role()
        
        # SQL query with named parameters for better readability
        insert_sql = """
        INSERT INTO app_queries (
            name, description, sql_query, chart_type, chart_config, 
            menu_item_id, role, is_kpi, is_default_dashboard
        ) VALUES (
            :name, :description, :sql_query, :chart_type, :chart_config,
            :menu_item_id, :role, :is_kpi, :is_default_dashboard
        )
        """
        
        # Parameters dictionary for better maintainability
        params = {
            "name": request.name,
            "description": request.description,
            "sql_query": request.sql_query,
            "chart_type": QueryType.KPI.value,
            "chart_config": json.dumps({}),
            "menu_item_id": db_menu_item_id,
            "role": roles,
            "is_kpi": DatabaseFlags.KPI,
            "is_default_dashboard": is_default_dashboard
        }
        
        db_manager.execute_non_query(insert_sql, params)
        logger.info(f"Successfully created KPI: {request.name}")
        
        # Get the newly created KPI ID
        get_id_query = """
        SELECT id FROM app_queries 
        WHERE name = :name AND is_kpi = :is_kpi 
        ORDER BY created_at DESC 
        FETCH FIRST 1 ROWS ONLY
        """
        id_result = db_manager.execute_query(get_id_query, {
            "name": request.name,
            "is_kpi": DatabaseFlags.KPI
        })
        
        new_kpi_id = id_result[0]["ID"] if id_result else None
        
        if new_kpi_id:
            logger.info(f"KPI created successfully with ID: {new_kpi_id}")
            return APIResponse(
                success=True, 
                message=f"KPI '{request.name}' created successfully",
                data={"kpi_id": new_kpi_id}
            )
        else:
            logger.error("Failed to retrieve new KPI ID")
            raise HTTPException(status_code=500, detail="KPI created but failed to retrieve ID")
            
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error creating KPI '{request.name}': {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to create KPI: {str(exc)}")


@router.put("/kpi/{kpi_id}", response_model=APIResponse)
async def update_kpi(kpi_id: int, request: QueryCreate, current_user: User = Depends(require_admin)):
    try:
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1 AND is_kpi = 1", (kpi_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="KPI not found")
        
        update_sql = """
        UPDATE app_queries
        SET name=:1, description=:2, sql_query=:3, menu_item_id=:4, role=:5
        WHERE id=:6 AND is_kpi=1
        """
        db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
        
        roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
        db_manager.execute_non_query(
            update_sql,
            (
                request.name,
                request.description,
                request.sql_query,
                db_menu_item_id,
                serialize_roles(request.role) or get_default_role(),
                kpi_id,
            ),
        )
        return APIResponse(success=True, message="KPI updated successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error updating KPI: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update KPI")


@router.delete("/kpi/{kpi_id}", response_model=APIResponse)
async def delete_kpi(kpi_id: int, current_user: User = Depends(require_admin)):
    try:
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1 AND is_kpi = 1", (kpi_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="KPI not found")

        db_manager.execute_non_query("DELETE FROM app_queries WHERE id = :1 AND is_kpi = 1", (kpi_id,))
        return APIResponse(success=True, message="KPI deleted successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting KPI: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete KPI")


@router.get("/kpi/{kpi_id}", response_model=APIResponse)
async def get_kpi_admin(kpi_id: int, current_user: User = Depends(require_admin)):
    try:
        query = """
        SELECT id, name, description, sql_query, menu_item_id, role, created_at
        FROM app_queries
        WHERE id = :1 AND is_active = 1 AND is_kpi = 1
        """
        result = db_manager.execute_query(query, (kpi_id,))
        if not result:
            raise HTTPException(status_code=404, detail="KPI not found")
        
        row = result[0]
        frontend_menu_item_id = -1 if row["MENU_ITEM_ID"] is None else row["MENU_ITEM_ID"]
        
        kpi_data = {
            "id": row["ID"],
            "name": row["NAME"],
            "description": row["DESCRIPTION"],
            "sql_query": row["SQL_QUERY"],
            "menu_item_id": frontend_menu_item_id,
            "role": row.get("ROLE", get_default_role()),
            "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
        }
        return APIResponse(success=True, data=kpi_data)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error getting KPI: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get KPI")

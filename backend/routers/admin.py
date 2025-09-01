import json
import logging
from typing import List

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
    try:
        # Try to add the column if it doesn't exist
        try:
            db_manager.execute_non_query(
                "ALTER TABLE app_queries ADD (is_default_dashboard NUMBER(1) DEFAULT 0)"
            )
        except:
            # Column already exists or other error, continue
            pass

        insert_sql = """
        INSERT INTO app_queries (name, description, sql_query, chart_type, chart_config, menu_item_id, role, is_default_dashboard)
        VALUES (:name, :description, :sql_query, :chart_type, :chart_config, :menu_item_id, :role, :is_default_dashboard)
        """
        try:
            # Determine if this is assigned to default dashboard
            is_default_dashboard = 1 if request.menu_item_id == -1 else 0
            # For menu_item_id, use None for default dashboard case, otherwise use the provided ID
            db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
            
            roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
            db_manager.execute_non_query(
                insert_sql,
                {
                    "name": request.name,
                    "description": request.description,
                    "sql_query": request.sql_query,
                    "chart_type": request.chart_type,
                    "chart_config": json.dumps(request.chart_config or {}),
                    "menu_item_id": db_menu_item_id,
                    "role": serialize_roles(request.role) or get_default_role(),
                    "is_default_dashboard": is_default_dashboard,
                },
            )
        except Exception as exc:
            if "ORA-00904" in str(exc).upper() and ("ROLE" in str(exc).upper() or "IS_DEFAULT_DASHBOARD" in str(exc).upper()):
                # Add missing columns
                try:
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                except:
                    pass
                try:
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (is_default_dashboard NUMBER(1) DEFAULT 0)")
                except:
                    pass
                
                # Retry with proper logic
                is_default_dashboard = 1 if request.menu_item_id == -1 else 0
                db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
                
                roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
                db_manager.execute_non_query(
                    insert_sql,
                    {
                        "name": request.name,
                        "description": request.description,
                        "sql_query": request.sql_query,
                        "chart_type": request.chart_type,
                        "chart_config": json.dumps(request.chart_config or {}),
                        "menu_item_id": db_menu_item_id,
                        "role": serialize_roles(request.role) or get_default_role(),
                        "is_default_dashboard": is_default_dashboard,
                    },
                )
            else:
                logger.error(f"Error creating query: {exc}")
                raise HTTPException(status_code=500, detail="Failed to create query")
        
        # Get the ID of the newly created query
        get_id_query = "SELECT id FROM app_queries WHERE name = :1 ORDER BY created_at DESC"
        id_result = db_manager.execute_query(get_id_query, (request.name,))
        new_query_id = id_result[0]["ID"] if id_result else None
        
        # If menu_item_ids is provided, create the many-to-many relationships (filter out -1)
        if request.menu_item_ids and new_query_id:
            junction_sql = "INSERT INTO app_query_menu_items (query_id, menu_item_id) VALUES (:query_id, :menu_item_id)"
            for menu_id in request.menu_item_ids:
                # Skip -1 (Default Dashboard) as it's handled by the main menu_item_id field
                if menu_id != -1:
                    db_manager.execute_non_query(junction_sql, {"query_id": new_query_id, "menu_item_id": menu_id})
        
        return APIResponse(success=True, message="Query created", data={"id": new_query_id})
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
            # This is explicitly assigned to Default Dashboard
            frontend_menu_item_id = -1
        elif row["MENU_ITEM_ID"] is None and not menu_ids:
            # NULL menu_item_id with no other assignments and NOT default dashboard = no assignment
            frontend_menu_item_id = None
        else:
            # Specific menu assignment
            frontend_menu_item_id = row["MENU_ITEM_ID"]
        
        query_data = {
            "id": row["ID"],
            "name": row["NAME"],
            "description": row["DESCRIPTION"],
            "sql_query": row["SQL_QUERY"],
            "chart_type": row["CHART_TYPE"],
            "chart_config": chart_config,
            "menu_item_id": frontend_menu_item_id,  # Convert NULL to -1 for Default Dashboard
            "menu_item_ids": menu_ids,  # New multiple assignments
            "menu_names": menu_names,   # Names for display
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
    """Update an existing query"""
    try:
        # Check if query exists
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
            # Determine if this is assigned to default dashboard
            is_default_dashboard = 1 if request.menu_item_id == -1 else 0
            # For menu_item_id, handle different cases:
            # -1 means Default Dashboard -> store as NULL with is_default_dashboard=1
            # null means no dashboard assignment -> store as NULL with is_default_dashboard=0
            # any other value means specific menu assignment
            if request.menu_item_id == -1:
                db_menu_item_id = None  # Default Dashboard case
            elif request.menu_item_id is None:
                db_menu_item_id = None  # No assignment case
            else:
                db_menu_item_id = request.menu_item_id  # Specific menu case
            
            # Validate roles
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
        except Exception as exc:
            if "ORA-00904" in str(exc).upper() and ("ROLE" in str(exc).upper() or "IS_DEFAULT_DASHBOARD" in str(exc).upper()):
                # Add missing columns
                try:
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                except:
                    pass
                try:
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (is_default_dashboard NUMBER(1) DEFAULT 0)")
                except:
                    pass
                
                # Retry with proper logic
                is_default_dashboard = 1 if request.menu_item_id == -1 else 0
                if request.menu_item_id == -1:
                    db_menu_item_id = None  # Default Dashboard case
                elif request.menu_item_id is None:
                    db_menu_item_id = None  # No assignment case
                else:
                    db_menu_item_id = request.menu_item_id  # Specific menu case
                
                # Validate roles
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
            else:
                raise exc
        
        # Clear existing menu assignments and re-add them
        if request.menu_item_ids:
            # Delete existing assignments
            db_manager.execute_non_query("DELETE FROM app_query_menu_items WHERE query_id = :1", (query_id,))
            # Add new assignments
            junction_sql = "INSERT INTO app_query_menu_items (query_id, menu_item_id) VALUES (:query_id, :menu_item_id)"
            for menu_id in request.menu_item_ids:
                if menu_id != -1:  # Skip -1 (Default Dashboard)
                    db_manager.execute_non_query(junction_sql, {"query_id": query_id, "menu_item_id": menu_id})
        
        return APIResponse(success=True, message="Query updated successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error updating query: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update query")


@router.delete("/query/{query_id}", response_model=APIResponse)
async def delete_query_admin(query_id: int, current_user: User = Depends(require_admin)):
    """Delete a query by ID"""
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
    """List all queries available for dashboard widgets"""
    try:
        query = """
        SELECT q.id, q.name, q.description, q.chart_type, q.created_at, q.role, q.menu_item_id
        FROM app_queries q
        WHERE q.is_active = 1
        ORDER BY q.created_at DESC
        """
        try:
            result = db_manager.execute_query(query)
        except Exception as exc:
            # If ROLE column doesn't exist, add it and retry
            if "ORA-00904" in str(exc).upper() and "ROLE" in str(exc).upper():
                db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                result = db_manager.execute_query(query)
            else:
                raise exc
        queries: List[dict] = []
        for row in result:
            # Get all menu assignments for this query
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
                # Fallback to legacy single menu_item_id
                if row["MENU_ITEM_ID"]:
                    legacy_menu_query = "SELECT name FROM app_menu_items WHERE id = :1"
                    legacy_result = db_manager.execute_query(legacy_menu_query, (row["MENU_ITEM_ID"],))
                    if legacy_result:
                        menu_names = [legacy_result[0]["NAME"]]
            
            # Handle special cases for dashboard assignment display
            if not menu_names:
                if row["MENU_ITEM_ID"] is None:
                    # NULL means Default Dashboard
                    menu_names = ["Default Dashboard"]
                elif row["MENU_ITEM_ID"] == -999:
                    # -999 means explicitly no dashboard assignment
                    menu_names = []  # Keep empty to show as no assignment
            
            queries.append(
                {
                    "id": row["ID"],
                    "name": row["NAME"],
                    "description": row["DESCRIPTION"],
                    "chart_type": row["CHART_TYPE"],
                    "menu_name": ", ".join(menu_names) if menu_names else None,  # Multiple menus comma-separated
                    "menu_names": menu_names,  # Array for frontend
                    "role": row.get("ROLE", get_default_role()),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                }
            )
        return APIResponse(success=True, message=f"Found {len(queries)} queries", data=queries)
    except Exception as exc:
        logger.error(f"Error listing queries: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list queries")

# ------------------ Dashboard Widget Management ------------------


@router.post("/dashboard/widget", response_model=APIResponse)
async def create_dashboard_widget(request: DashboardWidgetCreate, current_user: User = Depends(get_current_user)):
    """Create a new dashboard widget"""
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
    """Delete a dashboard widget"""
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


# ------------------ Update widget layout/attrs ------------------


from models import DashboardWidgetUpdate  # placed after imports earlier but for patch


@router.put("/dashboard/widget/{widget_id}", response_model=APIResponse)
async def update_dashboard_widget(widget_id: int, request: DashboardWidgetUpdate, current_user: User = Depends(get_current_user)):
    """Update a dashboard widget's layout or attributes"""
    try:
        # Ensure widget exists
        check = db_manager.execute_query("SELECT id FROM app_dashboard_widgets WHERE id = :1", (widget_id,))
        if not check:
            raise HTTPException(status_code=404, detail="Widget not found")

        # Build dynamic update query
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

# ------------------ Menu Management ------------------


@router.post("/menu", response_model=APIResponse)
async def create_menu_item(request: MenuItemCreate, current_user: User = Depends(require_admin)):
    """Admin endpoint to create a new menu item"""
    try:
        if request.parent_id is not None:
            parent_type_result = db_manager.execute_query(
                "SELECT type FROM app_menu_items WHERE id = :1",
                (request.parent_id,),
            )

            # If parent exists *and* its type is 'dashboard' we reject.
            if parent_type_result and str(parent_type_result[0]["TYPE"]).lower() == "dashboard":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot create submenu for dashboard menu items.",
                )
        sql = """
        INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, role, is_active)
        VALUES (:1, :2, :3, :4, :5, :6, 1)
        """
        try:
            # Validate roles
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
        except Exception as exc:
            # If role column doesn't exist, add it and retry
            if "ORA-00904" in str(exc).upper() and "ROLE" in str(exc).upper():
                db_manager.execute_non_query("ALTER TABLE app_menu_items ADD (role VARCHAR2(255))")
                # Validate roles
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
            else:
                raise exc
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
        # -------------------------------------------------------------
        # BUSINESS RULE: Dashboards cannot have children.  If the caller
        # attempts to set a *dashboard* item as the new parent we reject.
        # -------------------------------------------------------------
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
        try:
            # Validate roles
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
        except Exception as exc:
            # If role column doesn't exist, add it and retry
            if "ORA-00904" in str(exc).upper() and "ROLE" in str(exc).upper():
                db_manager.execute_non_query("ALTER TABLE app_menu_items ADD (role VARCHAR2(255))")
                # Validate roles
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
            else:
                raise exc
        return APIResponse(success=True, message="Menu item updated")
    except Exception as exc:
        logger.error(f"Error updating menu item: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update menu item")


@router.delete("/menu/{menu_id}", response_model=APIResponse)
async def delete_menu_item(menu_id: int, current_user: User = Depends(require_admin)):
    """Delete a menu item and *all* of its nested children to maintain referential integrity.

    Oracle raises ORA-02292 (child record found) when we try to delete a parent
    row referenced by children due to the self-referencing FK constraint on
    ``app_menu_items.parent_id``. We **cannot** simply add *ON DELETE CASCADE*
    retrospectively without a migration, so we perform a depth-first traversal
    and delete children first.

    This keeps the logic contained in the application layer (no schema change)
    and avoids additional database migrations. The operation is wrapped in a
    single connection via ``db_manager.execute_non_query`` calls which commit
    automatically after each statement, adequate for the small data volume of
    menu structures.
    """

    try:
        # Fetch all immediate children of the current menu item.
        children = db_manager.execute_query(
            "SELECT id FROM app_menu_items WHERE parent_id = :1", (menu_id,)
        )

        # ------------------------------------------------------------------
        # STEP 0:  Detach **queries** that reference this menu item so we don’t
        #          violate the FK_QUERY_MENU foreign-key constraint (ORA-02292)
        #          when the menu row is deleted. We *do not* delete the
        #          queries themselves – that would orphan lots of historical
        #          data. Instead we simply set their `menu_item_id` to NULL.
        #          This keeps the queries available in the system while
        #          allowing the menu item to be removed safely.
        # ------------------------------------------------------------------

        db_manager.execute_non_query(
            "UPDATE app_queries SET menu_item_id = NULL WHERE menu_item_id = :1",
            (menu_id,),
        )

        # Recursively delete child items first (depth-first order) so that when
        # we finally delete the parent no FK constraint is violated by the
        # self-referencing relationship in `app_menu_items`.
        for child in children:
            child_id = child["ID"]
            # Recurse by calling this endpoint’s core logic directly.  We *don’t*
            # need to propagate `current_user` again because we are executing
            # within the same request context.
            await delete_menu_item(child_id, current_user)  # type: ignore[arg-type]

        # Now that all descendants are gone, delete the parent item itself.
        db_manager.execute_non_query("DELETE FROM app_menu_items WHERE id = :1", (menu_id,))

        return APIResponse(success=True, message=f"Menu item {menu_id} deleted")

    except HTTPException:
        # Bubble up HTTP exceptions unchanged so FastAPI can format them.
        raise
    except Exception as exc:
        logger.error(f"Error deleting menu item {menu_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete menu item")


# ------------------ KPI Management ------------------

@router.get("/kpis", response_model=APIResponse)
async def list_kpis(current_user: User = Depends(get_current_user)):
    """List all KPI queries"""
    try:
        query = """
        SELECT q.id, q.name, q.description, q.sql_query, q.role, q.created_at,
               m.name as menu_name
        FROM app_queries q
        LEFT JOIN app_menu_items m ON q.menu_item_id = m.id
        WHERE q.is_active = 1 AND q.is_kpi = 1
        ORDER BY q.created_at DESC
        """
        try:
            result = db_manager.execute_query(query)
        except Exception as exc:
            # If columns don't exist, add them and retry
            if "ORA-00904" in str(exc).upper():
                if "IS_KPI" in str(exc).upper():
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (is_kpi NUMBER(1) DEFAULT 0)")
                if "ROLE" in str(exc).upper():
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                result = db_manager.execute_query(query)
            else:
                raise exc

        kpis: List[dict] = []
        for row in result:
            # If menu_name is NULL, this means Default Dashboard
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
    """Create a new KPI query"""
    try:
        insert_sql = """
        INSERT INTO app_queries (name, description, sql_query, chart_type, chart_config, menu_item_id, role, is_kpi)
        VALUES (:1, :2, :3, :4, :5, :6, :7, 1)
        """
        try:
            # Convert menu_item_id = -1 (Default Dashboard) to None for database storage
            db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
            
            # Validate roles for KPI
            roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
            db_manager.execute_non_query(
                insert_sql,
                (
                    request.name,
                    request.description,
                    request.sql_query,
                    "kpi",  # Set chart_type to "kpi" for KPIs
                    json.dumps({}),  # Empty chart config for KPIs
                    db_menu_item_id,
                    serialize_roles(request.role) or get_default_role(),
                ),
            )
        except Exception as exc:
            if "ORA-00904" in str(exc).upper() and ("ROLE" in str(exc).upper() or "IS_KPI" in str(exc).upper()):
                # Add missing columns
                if "ROLE" in str(exc).upper():
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                if "IS_KPI" in str(exc).upper():
                    db_manager.execute_non_query("ALTER TABLE app_queries ADD (is_kpi NUMBER(1) DEFAULT 0)")
                # Convert menu_item_id = -1 (Default Dashboard) to None for database storage
                db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
                
                # Validate roles for KPI
                roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
                # Removed ensure_roles_exist
                db_manager.execute_non_query(
                    insert_sql,
                    (
                        request.name,
                        request.description,
                        request.sql_query,
                        "kpi",
                        json.dumps({}),
                        db_menu_item_id,
                        serialize_roles(request.role) or get_default_role(),
                    ),
                )
            else:
                logger.error(f"Error creating KPI: {exc}")
                raise HTTPException(status_code=500, detail="Failed to create KPI")
        
        # Get the ID of the newly created KPI
        get_id_query = "SELECT id FROM app_queries WHERE name = :1 AND is_kpi = 1 ORDER BY created_at DESC"
        id_result = db_manager.execute_query(get_id_query, (request.name,))
        new_kpi_id = id_result[0]["ID"] if id_result else None
        
        return APIResponse(success=True, message="KPI created", data={"id": new_kpi_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error creating KPI: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create KPI")


@router.put("/kpi/{kpi_id}", response_model=APIResponse)
async def update_kpi(kpi_id: int, request: QueryCreate, current_user: User = Depends(require_admin)):
    """Update an existing KPI query"""
    try:
        # Check if KPI exists
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1 AND is_kpi = 1", (kpi_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="KPI not found")
        
        update_sql = """
        UPDATE app_queries
        SET name=:1, description=:2, sql_query=:3, menu_item_id=:4, role=:5
        WHERE id=:6 AND is_kpi=1
        """
        # Convert menu_item_id = -1 (Default Dashboard) to None for database storage
        db_menu_item_id = None if request.menu_item_id == -1 else request.menu_item_id
        
        # Validate roles for KPI update
        roles_list = request.role if isinstance(request.role, list) else ([request.role] if request.role else [])
        # Removed ensure_roles_exist
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
    """Delete a KPI by ID"""
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
    """Get a single KPI by ID for editing"""
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
        # Convert NULL menu_item_id back to -1 for frontend (Default Dashboard)
        # For KPIs, we always treat NULL as Default Dashboard since they don't have multiple assignments
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

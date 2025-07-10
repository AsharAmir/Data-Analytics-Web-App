import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_admin, get_password_hash
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

# ------------------ User Management ------------------


@router.post("/user", response_model=APIResponse)
async def create_user_admin(request: UserCreate, current_user: User = Depends(require_admin)):
    """Admin endpoint to create new users"""
    from auth import create_user  # local import to avoid circular deps

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
    except Exception as exc:
        logger.error(f"Error creating user: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {exc}")


@router.get("/users", response_model=APIResponse)
async def list_users(current_user: User = Depends(require_admin)):
    """Admin endpoint to list all users"""
    try:
        query = """
        SELECT id, username, email, role, is_active, created_at
        FROM app_users
        ORDER BY created_at DESC
        """
        result = db_manager.execute_query(query)
        users: List[dict] = []
        for row in result:
            users.append(
                {
                    "id": row["ID"],
                    "username": row["USERNAME"],
                    "email": row["EMAIL"],
                    "role": row.get("ROLE", "user"),
                    "is_active": bool(row["IS_ACTIVE"]),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                    "is_admin": row.get("ROLE", "user") == "admin",
                }
            )
        return APIResponse(success=True, message=f"Found {len(users)} users", data=users)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error listing users: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {exc}")


@router.put("/user/{user_id}", response_model=APIResponse)
async def update_user_admin(user_id: int, request: UserUpdate, current_user: User = Depends(require_admin)):
    """Admin endpoint to update existing user"""
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
            params.append(request.role)
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
    """Admin endpoint to delete user"""
    try:
        db_manager.execute_non_query("DELETE FROM app_users WHERE id = :1", (user_id,))
        return APIResponse(success=True, message="User deleted successfully")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error deleting user: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete user")

# ------------------ Query Management ------------------


@router.post("/query", response_model=APIResponse)
async def create_query(request: QueryCreate, current_user: User = Depends(require_admin)):
    """Create a new query for dashboard widgets or reports"""
    try:
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
                    ",".join(request.role) if isinstance(request.role, list) else (request.role or "user"),
                ),
            )
        except Exception as exc:
            if "ORA-00904" in str(exc).upper() and "ROLE" in str(exc).upper():
                db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(255) DEFAULT 'user')")
                db_manager.execute_non_query(
                    insert_sql,
                    (
                        request.name,
                        request.description,
                        request.sql_query,
                        request.chart_type,
                        json.dumps(request.chart_config or {}),
                        request.menu_item_id,
                        ",".join(request.role) if isinstance(request.role, list) else (request.role or "user"),
                    ),
                )
            else:
                logger.error(f"Error creating query: {exc}")
                raise HTTPException(status_code=500, detail="Failed to create query")
        return APIResponse(success=True, message="Query created")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error creating query: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to create query: {exc}")


@router.delete("/query/{query_id}", response_model=APIResponse)
async def delete_query_admin(query_id: int, current_user: User = Depends(require_admin)):
    """Delete a query by ID"""
    try:
        exists = db_manager.execute_query("SELECT id FROM app_queries WHERE id = :1", (query_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="Query not found")
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
        SELECT q.id, q.name, q.description, q.chart_type, q.created_at, q.role,
               m.name as menu_name
        FROM app_queries q
        LEFT JOIN app_menu_items m ON q.menu_item_id = m.id
        WHERE q.is_active = 1
        ORDER BY q.created_at DESC
        """
        result = db_manager.execute_query(query)
        queries: List[dict] = []
        for row in result:
            queries.append(
                {
                    "id": row["ID"],
                    "name": row["NAME"],
                    "description": row["DESCRIPTION"],
                    "chart_type": row["CHART_TYPE"],
                    "menu_name": row["MENU_NAME"],
                    "role": row.get("ROLE", "user"),
                    "created_at": row["CREATED_AT"].isoformat() if row["CREATED_AT"] else None,
                }
            )
        return APIResponse(success=True, message=f"Found {len(queries)} queries", data=queries)
    except Exception as exc:
        logger.error(f"Error listing queries: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to list queries: {exc}")

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
        VALUES (:1, :2, :3, :4, :5, :6)
        """
        db_manager.execute_non_query(
            insert_sql,
            (
                request.title,
                request.query_id,
                request.position_x,
                request.position_y,
                request.width,
                request.height,
            ),
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
        raise HTTPException(status_code=500, detail=f"Failed to create widget: {exc}")


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
        raise HTTPException(status_code=500, detail=f"Failed to delete widget: {exc}")


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
        raise HTTPException(status_code=500, detail=f"Failed to update widget: {exc}")


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
        raise HTTPException(status_code=500, detail=f"Failed to list widgets: {exc}")

# ------------------ Menu Management ------------------


@router.post("/menu", response_model=APIResponse)
async def create_menu_item(request: MenuItemCreate, current_user: User = Depends(require_admin)):
    """Admin endpoint to create a new menu item"""
    try:
        sql = """
        INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, is_active)
        VALUES (:1, :2, :3, :4, :5, 1)
        """
        db_manager.execute_non_query(
            sql,
            (
                request.name,
                request.type,
                request.icon,
                request.parent_id,
                request.sort_order,
            ),
        )
        return APIResponse(success=True, message="Menu item created successfully")
    except Exception as exc:
        logger.error(f"Error creating menu item: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create menu item: {exc}"
        )


@router.put("/menu/{menu_id}", response_model=APIResponse)
async def update_menu_item(
    menu_id: int, request: MenuItemCreate, current_user: User = Depends(require_admin)
):
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
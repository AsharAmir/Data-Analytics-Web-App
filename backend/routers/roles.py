from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, status

from auth import require_admin, get_current_user
from database import db_manager
from roles_utils import serialize_roles
from models import APIResponse, User
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roles", tags=["roles"])

SYSTEM_ROLES = {"ADMIN", "IT_USER", "CEO", "FINANCE_USER", "TECH_USER", "USER"}  # must stay in sync with enum / DB init


# -----------------------------------------------------------------------------
# Helper utilities
# -----------------------------------------------------------------------------

def _role_exists(role_name: str) -> bool:
    """Return True when the provided role name exists in the roles table."""
    try:
        res = db_manager.execute_query(
            "SELECT COUNT(*) FROM app_roles WHERE UPPER(name) = UPPER(:1)", (role_name,)
        )
        return res[0]["COUNT(*)"] > 0
    except Exception as exc:
        logger.error(f"Error checking role existence: {exc}")
        return False


def _is_system_role(role_name: str) -> bool:
    return role_name.upper() in SYSTEM_ROLES


def _update_comma_roles(table: str, id_col: str, role_col: str, old_role: str, new_role: Optional[str] = None) -> int:
    """Remove or replace a role code within comma-separated role columns across a table.

    Returns number of updated rows.
    """
    try:
        rows = db_manager.execute_query(
            f"SELECT {id_col} AS id, {role_col} AS role FROM {table} WHERE {role_col} IS NOT NULL"
        )
    except Exception as exc:
        logger.warning(f"Skipping role update for table {table}: {exc}")
        return 0

    updated = 0
    for row in rows:
        role_val = row.get("ROLE")
        if not role_val:
            continue
        parts = [p.strip().upper() for p in str(role_val).split(",") if p.strip()]
        if not parts or old_role.upper() not in parts:
            continue
        # Transform
        if new_role:
            parts = [new_role.upper() if p == old_role.upper() else p for p in parts]
        else:
            parts = [p for p in parts if p != old_role.upper()]

        new_serialized = serialize_roles(parts)
        # Write back (NULL if empty)
        db_manager.execute_non_query(
            f"UPDATE {table} SET {role_col} = :1 WHERE {id_col} = :2",
            (new_serialized, row["ID"]),
        )
        updated += 1
    return updated


def _collect_distinct_roles() -> set[str]:
    """Collect all distinct role codes referenced across users, queries, menus, and processes."""
    roles: set[str] = set()
    # Users (single value)
    try:
        rows = db_manager.execute_query("SELECT DISTINCT role FROM app_users WHERE role IS NOT NULL")
        for r in rows or []:
            if r.get("ROLE"):
                roles.add(str(r["ROLE"]).strip().upper())
    except Exception as exc:
        logger.warning(f"Collect roles: users failed: {exc}")

    # Helper for comma columns
    def collect_from_table(table: str):
        try:
            rs = db_manager.execute_query(f"SELECT role FROM {table} WHERE role IS NOT NULL")
            for rr in rs or []:
                if not rr.get("ROLE"):
                    continue
                parts = [p.strip().upper() for p in str(rr["ROLE"]).split(",") if p.strip()]
                roles.update(parts)
        except Exception as e:
            logger.warning(f"Collect roles: {table} failed: {e}")

    for t in ("app_queries", "app_menu_items", "app_processes"):
        collect_from_table(t)

    return roles


@router.get("/stale", response_model=APIResponse)
async def list_stale_roles(current_user: User = Depends(require_admin)):
    """Return role codes referenced in data but missing from app_roles (excluding system roles)."""
    try:
        # Current known roles
        rows = db_manager.execute_query("SELECT UPPER(name) AS name FROM app_roles")
        known = {r["NAME"] for r in rows} if rows else set()
        known.update(SYSTEM_ROLES)

        referenced = _collect_distinct_roles()
        stale = sorted([r for r in referenced if r not in known])

        def count_where(role: str, table: str, single: bool = False) -> int:
            try:
                if single:
                    rs = db_manager.execute_query(
                        f"SELECT COUNT(*) FROM {table} WHERE UPPER(role) = :1",
                        (role,),
                    )
                    return int(rs[0]["COUNT(*)"]) if rs else 0
                else:
                    rs = db_manager.execute_query(
                        f"SELECT COUNT(*) FROM {table} WHERE role IS NOT NULL AND (','||UPPER(role)||',') LIKE :1",
                        (f'%,{role.upper()},%',),
                    )
                    return int(rs[0]["COUNT(*)"]) if rs else 0
            except Exception as exc:
                logger.warning(f"Count stale roles in {table} failed: {exc}")
                return 0

        data = []
        for r in stale:
            data.append(
                {
                    "name": r,
                    "counts": {
                        "users": count_where(r, "app_users", single=True),
                        "queries": count_where(r, "app_queries"),
                        "menus": count_where(r, "app_menu_items"),
                        "processes": count_where(r, "app_processes"),
                    },
                }
            )
        return APIResponse(success=True, data=data)
    except Exception as exc:
        logger.error(f"Error listing stale roles: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list stale roles")


@router.post("/stale/{role_name}/purge", response_model=APIResponse)
async def purge_stale_role(role_name: str, current_user: User = Depends(require_admin)):
    """Remove a stale role from all data references (users set to USER; others remove the role)."""
    role_upper = role_name.upper()
    if role_upper in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot purge a system role")

    try:
        # Users → set to USER where exactly matching the stale role
        db_manager.execute_non_query(
            "UPDATE app_users SET role = 'USER' WHERE UPPER(role) = :1",
            (role_upper,),
        )

        # Comma-separated role columns → remove occurrence
        q = _update_comma_roles("app_queries", "id", "role", role_upper, new_role=None)
        m = _update_comma_roles("app_menu_items", "id", "role", role_upper, new_role=None)
        p = _update_comma_roles("app_processes", "id", "role", role_upper, new_role=None)

        return APIResponse(success=True, message="Role references purged", data={"queries": q, "menus": m, "processes": p})
    except Exception as exc:
        logger.error(f"Error purging stale role {role_upper}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to purge role references")


# -----------------------------------------------------------------------------
# API endpoints
# -----------------------------------------------------------------------------


@router.get("/", response_model=APIResponse)
async def list_roles(current_user: User = Depends(require_admin)):
    """List all roles from the database."""
    try:
        rows = db_manager.execute_query("SELECT name, is_system FROM app_roles ORDER BY name")
        data = [
            {"name": row["NAME"], "is_system": bool(row.get("IS_SYSTEM", 0))} for row in rows
        ]
        return APIResponse(success=True, data=data)
    except Exception as exc:
        logger.error(f"Error listing roles: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list roles")


@router.post("/", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_name: str = Body(..., embed=True, min_length=1, max_length=50),
    current_user: User = Depends(require_admin),
):
    """Create a new custom role. Fails when role already exists or is reserved."""
    role_upper = role_name.upper()
    if _is_system_role(role_upper):
        raise HTTPException(status_code=400, detail="Cannot create a reserved system role")

    if _role_exists(role_upper):
        raise HTTPException(status_code=400, detail="Role already exists")

    try:
        db_manager.execute_non_query(
            "INSERT INTO app_roles (name, is_system) VALUES (:1, 0)", (role_upper,)
        )
        return APIResponse(success=True, message="Role created", data={"name": role_upper})
    except Exception as exc:
        logger.error(f"Error creating role: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create role")


@router.get("/{role_name}/users", response_model=APIResponse)
async def list_users_with_role(role_name: str, current_user: User = Depends(require_admin)):
    """Return users currently assigned to the provided role."""
    try:
        rows = db_manager.execute_query(
            "SELECT id, username, email FROM app_users WHERE UPPER(role) = UPPER(:1)",
            (role_name,),
        )
        users = [
            {"id": r["ID"], "username": r["USERNAME"], "email": r["EMAIL"]} for r in rows
        ]
        return APIResponse(success=True, data=users, message=f"Found {len(users)} users")
    except Exception as exc:
        logger.error(f"Error fetching users for role {role_name}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch users for role")


@router.delete("/{role_name}", response_model=APIResponse)
async def delete_role(
    role_name: str,
    new_role: Optional[str] = Body(None, embed=True),
    current_user: User = Depends(require_admin),
):
    """Delete a role.

    If users are still assigned the role, the client should either:
    1. Provide *new_role* in the request body to re-assign those users automatically.
    2. Omit *new_role* to simply return an error with the list of affected users so the
       UI can prompt for reassignment.
    """
    role_upper = role_name.upper()

    if _is_system_role(role_upper):
        raise HTTPException(status_code=400, detail="Cannot delete a reserved system role")

    if not _role_exists(role_upper):
        raise HTTPException(status_code=404, detail="Role not found")

    # Check for users with this role
    user_rows = db_manager.execute_query(
        "SELECT id, username FROM app_users WHERE UPPER(role) = UPPER(:1)", (role_upper,)
    )

    if user_rows and not new_role:
        # Return conflict status so the UI can show the list and ask for reassignment
        user_list = [
            {"id": r["ID"], "username": r["USERNAME"]} for r in user_rows
        ]
        return APIResponse(
            success=False,
            message="Users still assigned to role. Provide 'new_role' to reassign.",
            data=user_list,
            error="ROLE_IN_USE",
        )

    try:
        if user_rows and new_role:
            # Ensure target role exists
            if not _role_exists(new_role.upper()):
                raise HTTPException(status_code=400, detail="Replacement role does not exist")
            # Reassign users first
            db_manager.execute_non_query(
                "UPDATE app_users SET role = :1 WHERE UPPER(role) = UPPER(:2)",
                (new_role.upper(), role_upper),
            )

        # Cascade update in other tables holding comma-separated roles
        replaced_in_queries = _update_comma_roles(
            table="app_queries", id_col="id", role_col="role", old_role=role_upper, new_role=new_role
        )
        replaced_in_menus = _update_comma_roles(
            table="app_menu_items", id_col="id", role_col="role", old_role=role_upper, new_role=new_role
        )
        replaced_in_processes = _update_comma_roles(
            table="app_processes", id_col="id", role_col="role", old_role=role_upper, new_role=new_role
        )

        # Finally, delete the role itself
        db_manager.execute_non_query(
            "DELETE FROM app_roles WHERE UPPER(name) = UPPER(:1)", (role_upper,)
        )
        msg = "Role deleted"
        if any([replaced_in_queries, replaced_in_menus, replaced_in_processes]):
            msg += f" (updated {replaced_in_queries} queries, {replaced_in_menus} menus, {replaced_in_processes} processes)"
        return APIResponse(success=True, message=msg)
    except Exception as exc:
        logger.error(f"Error deleting role: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete role")

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, status

from auth import require_admin, get_current_user
from database import db_manager
from models import APIResponse, User
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roles", tags=["roles"])

SYSTEM_ROLES = {"ADMIN", "IT_USER"}  # must stay in sync with enum / DB init


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
            # Reassign users first
            db_manager.execute_non_query(
                "UPDATE app_users SET role = :1 WHERE UPPER(role) = UPPER(:2)",
                (new_role.upper(), role_upper),
            )

        # Delete from roles table
        db_manager.execute_non_query(
            "DELETE FROM app_roles WHERE UPPER(name) = UPPER(:1)", (role_upper,)
        )
        return APIResponse(success=True, message="Role deleted")
    except Exception as exc:
        logger.error(f"Error deleting role: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete role") 
from typing import List, Union, Optional
from fastapi import HTTPException, status
from database import db_manager


def normalize_role(role: Union[str, "UserRole", None]) -> str:
    if role is None:
        return "USER"
    value = getattr(role, "value", role)
    return str(value).strip().upper()


def serialize_roles(value: Union[str, List[str], None]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list):
        roles = [normalize_role(r) for r in value if str(r).strip()]
        return ",".join(sorted(set(roles))) if roles else None
    return normalize_role(value)


def ensure_roles_exist(roles: List[Union[str, "UserRole"]]) -> None:
    """Validate that all provided role codes exist in app_roles.

    Raises 400 if any are missing.
    """
    if not roles:
        return
    normalized = [normalize_role(r) for r in roles if str(r).strip()]
    if not normalized:
        return
    placeholders = ",".join(":%d" % (i + 1) for i in range(len(normalized)))
    sql = f"SELECT name FROM app_roles WHERE UPPER(name) IN ({placeholders})"
    rows = db_manager.execute_query(sql, tuple(normalized))
    found = {row["NAME"].upper() for row in rows} if rows else set()
    missing = [r for r in normalized if r.upper() not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role(s): {', '.join(missing)}",
        )


def is_admin(role: Union[str, "UserRole", None]) -> bool:
    return normalize_role(role) == "ADMIN"


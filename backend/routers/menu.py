from roles_utils import get_admin_role, get_default_role
from typing import List

from fastapi import APIRouter, Depends

from auth import get_current_user
from models import MenuItem, User
from services import MenuService

router = APIRouter(prefix="/api", tags=["menu"])


@router.get("/menu", response_model=List[MenuItem])
async def get_menu(current_user: User = Depends(get_current_user)):
    """Return hierarchical application menu for authenticated user."""
    # Only filter by role if user is not admin (admins see all menus)
    user_role = None if current_user.role == get_admin_role() else current_user.role
    return MenuService.get_menu_structure(user_role, current_user.hidden_features)
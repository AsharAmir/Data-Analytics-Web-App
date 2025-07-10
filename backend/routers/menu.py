from typing import List

from fastapi import APIRouter, Depends

from auth import get_current_user
from models import MenuItem, User
from services import MenuService

router = APIRouter(prefix="/api", tags=["menu"])


@router.get("/menu", response_model=List[MenuItem])
async def get_menu(current_user: User = Depends(get_current_user)):
    """Return hierarchical application menu for authenticated user."""
    return MenuService.get_menu_structure() 
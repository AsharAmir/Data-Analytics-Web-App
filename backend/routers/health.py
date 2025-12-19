from fastapi import APIRouter
from models import APIResponse
from database import db_manager

router = APIRouter(tags=["system"])


@router.get("/", response_model=APIResponse)
async def root():
    """Root endpoint just returns service info."""
    return APIResponse(success=True, message="Data Analytics Web App API", data={"version": "1.0.0"})


@router.get("/health", response_model=APIResponse)
async def health_check():
    """Simple database connectivity check."""
    try:
        db_manager.execute_query("SELECT 1 FROM DUAL")
        return APIResponse(success=True, message="System healthy", data={"database": "connected"})
    except Exception as exc:
        return APIResponse(success=False, error=f"Database connection failed: {exc}")
from contextlib import asynccontextmanager
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import init_database
from routers.auth import router as auth_router
from routers.dashboard import router as dashboard_router
from routers.query import router as query_router
from routers.admin import router as admin_router
from routers.menu import router as menu_router
from routers.health import router as health_router
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown hooks."""
    try:
        logger.info("Initializing database ...")
        init_database()
        logger.info("Database initialized successfully")
        yield
    finally:
        logger.info("Application shutting down ...")


app = FastAPI(
    title="Data Analytics Web App",
    description="Advanced analytics platform with dynamic dashboards and reports",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register routers ---
for r in (
    auth_router,
    dashboard_router,
    query_router,
    admin_router,
    menu_router,
    health_router,
):
    app.include_router(r)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)

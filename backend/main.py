from contextlib import asynccontextmanager
import logging
import time

from logging_config import setup_logging
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
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
from routers.roles import router as roles_router
from routers.importer import router as import_router
from routers.processes import router as processes_router
from routers.health import router as health_router
from routers.excel_compare import router as excel_compare_router
from routers.logs import router as logs_router

# Initialise structured logging *before* anything else so all modules inherit
setup_logging()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Simple request/response logging middleware – records method, path, status
# code and latency for every request.
# ---------------------------------------------------------------------------


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        start = time.time()
        response = await call_next(request)
        duration = (time.time() - start) * 1000
        logger.info(
            "%s %s -> %s %.2fms", request.method, request.url.path, response.status_code, duration
        )
        return response


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

# Register request logging middleware (after CORS so it times downstream
# processing only).
app.add_middleware(RequestLoggingMiddleware)

# --- Register routers ---
for r in (
    auth_router,
    dashboard_router,
    query_router,
    admin_router,
    menu_router,
    roles_router,
    import_router,
    processes_router,
    health_router,
    excel_compare_router,
    logs_router,
):
    app.include_router(r)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)

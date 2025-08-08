import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime

from auth import get_current_user_optional
from models import APIResponse, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/logs", tags=["logs"])


class FrontendLogEntry(BaseModel):
    timestamp: str
    level: str
    message: str
    context: Dict[str, Any] = None
    userId: str = None
    sessionId: str = None
    url: str = None
    userAgent: str = None


class FrontendLogRequest(BaseModel):
    logs: List[FrontendLogEntry]


@router.post("/frontend", response_model=APIResponse)
async def receive_frontend_logs(
    request: FrontendLogRequest, 
    current_user: User = Depends(get_current_user_optional)
):
    """
    Receive frontend logs for debugging and monitoring purposes.
    This endpoint accepts logs from the frontend logger and processes them appropriately.
    """
    try:
        # Log each frontend log entry with appropriate backend logging level
        for log_entry in request.logs:
            # Add user context if available
            user_info = f"user_id={current_user.id}" if current_user else "anonymous"
            session_info = f"session={log_entry.sessionId}"
            
            # Format the log message with context
            log_message = f"[FRONTEND] {log_entry.message}"
            log_context = {
                "frontend_timestamp": log_entry.timestamp,
                "user_id": current_user.id if current_user else None,
                "session_id": log_entry.sessionId,
                "url": log_entry.url,
                "user_agent": log_entry.userAgent,
                "frontend_context": log_entry.context
            }
            
            # Map frontend log levels to backend logger
            if log_entry.level == "DEBUG":
                logger.debug(f"{log_message} [{user_info}, {session_info}]", extra=log_context)
            elif log_entry.level == "INFO":
                logger.info(f"{log_message} [{user_info}, {session_info}]", extra=log_context)
            elif log_entry.level == "WARN":
                logger.warning(f"{log_message} [{user_info}, {session_info}]", extra=log_context)
            elif log_entry.level == "ERROR":
                logger.error(f"{log_message} [{user_info}, {session_info}]", extra=log_context)
            else:
                logger.info(f"{log_message} [{user_info}, {session_info}]", extra=log_context)
        
        return APIResponse(
            success=True,
            message=f"Processed {len(request.logs)} frontend log entries"
        )
    
    except Exception as exc:
        logger.error(f"Error processing frontend logs: {exc}")
        return APIResponse(
            success=False,
            error="Failed to process frontend logs"
        )


@router.get("/health", response_model=APIResponse)
async def logs_health():
    """Health check for the logs service"""
    return APIResponse(
        success=True,
        message="Logs service is healthy",
        data={"timestamp": datetime.now().isoformat()}
    )
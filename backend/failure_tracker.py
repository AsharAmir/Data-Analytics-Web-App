"""Failure tracking and monitoring utility for the application.

This module provides centralized failure tracking that can be used across
the application to log, monitor, and analyze failures.
"""

import logging
import json
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path
import os

logger = logging.getLogger(__name__)


class FailureTracker:
    """Centralized failure tracking system."""
    
    def __init__(self):
        self.failures_log_path = Path(os.getenv("LOG_DIR", "logs")) / "failures.log"
        self.failures_log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Setup dedicated failure logger
        self.failure_logger = logging.getLogger("failures")
        self.failure_logger.setLevel(logging.ERROR)
        
        # Create timed rotating file handler for failures (daily rollover)
        use_utc = os.getenv("LOG_USE_UTC", "false").lower() == "true"
        from logging.handlers import TimedRotatingFileHandler
        failure_handler = TimedRotatingFileHandler(
            filename=str(self.failures_log_path),
            when="midnight",
            interval=1,
            backupCount=30,
            utc=use_utc,
            encoding="utf-8",
        )
        failure_handler.setLevel(logging.ERROR)
        
        # JSON formatter for failures with localtime timestamp
        formatter = logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": %(message)s}',
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        failure_handler.setFormatter(formatter)
        
        if not self.failure_logger.handlers:
            self.failure_logger.addHandler(failure_handler)
    
    def track_failure(
        self,
        operation: str,
        error: Exception,
        user_id: Optional[int] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Track a failure with detailed context.
        
        Args:
            operation: The operation that failed (e.g., "query_execution", "data_import")
            error: The exception that occurred
            user_id: ID of the user who triggered the operation (if applicable)
            additional_context: Additional context information
        """
        failure_data = {
            "operation": operation,
            "error_type": type(error).__name__,
            "error_message": str(error),
            "user_id": user_id,
            # Use computer local time for the failure record
            "timestamp": datetime.now().isoformat(timespec="seconds"),
        }
        
        if additional_context:
            failure_data["context"] = additional_context
        
        # Oracle Error Extraction
        ora_code = self._extract_oracle_error_code(error)
        if ora_code:
            failure_data["oracle_error_code"] = ora_code
            if "context" not in failure_data:
                failure_data["context"] = {}
            failure_data["context"]["oracle_error_code"] = ora_code

        # Log to dedicated failure log
        self.failure_logger.error(json.dumps(failure_data))
        
        # Also log to main application log
        logger.error(f"FAILURE_TRACKED: {operation} failed for user {user_id}: {error}")

    def _extract_oracle_error_code(self, error: Exception) -> Optional[str]:
        """Extract ORA-XXXXX code from exception if present."""
        import re
        msg = str(error)
        match = re.search(r'(ORA-\d{5})', msg)
        return match.group(1) if match else None
    
    def track_auth_failure(
        self,
        username: str,
        failure_type: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> None:
        """Track authentication failures.
        
        Args:
            username: Username that failed authentication
            failure_type: Type of auth failure (e.g., "invalid_password", "account_locked")
            ip_address: IP address of the request
            user_agent: User agent string
        """
        self.track_failure(
            operation="authentication",
            error=Exception(f"Auth failure: {failure_type}"),
            additional_context={
                "username": username,
                "failure_type": failure_type,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
        )
    
    def track_query_failure(
        self,
        query_id: Optional[int],
        sql_query: str,
        error: Exception,
        user_id: Optional[int] = None
    ) -> None:
        """Track query execution failures.
        
        Args:
            query_id: ID of the saved query (if applicable)
            sql_query: The SQL query that failed
            error: The exception that occurred
            user_id: ID of the user who executed the query
        """
        self.track_failure(
            operation="query_execution",
            error=error,
            user_id=user_id,
            additional_context={
                "query_id": query_id,
                "sql_preview": sql_query[:500] + "..." if len(sql_query) > 500 else sql_query,
            }
        )
    
    def track_import_failure(
        self,
        table_name: str,
        filename: str,
        error: Exception,
        user_id: Optional[int] = None,
        records_processed: Optional[int] = None
    ) -> None:
        """Track data import failures.
        
        Args:
            table_name: Name of the target table
            filename: Name of the imported file
            error: The exception that occurred
            user_id: ID of the user who initiated the import
            records_processed: Number of records processed before failure
        """
        self.track_failure(
            operation="data_import",
            error=error,
            user_id=user_id,
            additional_context={
                "table_name": table_name,
                "filename": filename,
                "records_processed": records_processed,
            }
        )
    
    def track_process_failure(
        self,
        process_id: int,
        process_name: str,
        error: Exception,
        user_id: Optional[int] = None,
        parameters: Optional[Dict[str, Any]] = None
    ) -> None:
        """Track process execution failures.
        
        Args:
            process_id: ID of the process
            process_name: Name of the process
            error: The exception that occurred
            user_id: ID of the user who executed the process
            parameters: Parameters passed to the process
        """
        self.track_failure(
            operation="process_execution",
            error=error,
            user_id=user_id,
            additional_context={
                "process_id": process_id,
                "process_name": process_name,
                "parameters": parameters,
            }
        )


# Global failure tracker instance
failure_tracker = FailureTracker()

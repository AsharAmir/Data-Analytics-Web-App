# logging_config.py

"""Central logging configuration for the backend service.

Usage::

    from logging_config import setup_logging
    setup_logging()

Call *setup_logging()* **once**, as early as possible (e.g. at the very top of
``main.py``) to configure structured JSON logs written both to stdout and to a
rotating file (``logs/app.log``) so they can be collected by Docker or cloud
log aggregators.
"""

from __future__ import annotations

import logging
import logging.config
import os
from pathlib import Path


def setup_logging() -> None:
    """Configure root logger with sensible defaults for production."""

    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    # ------------------------------------------------------------------
    # Ensure the log directory exists (defaults to ./logs inside the
    # container/image; override with LOG_DIR).
    # ------------------------------------------------------------------

    log_dir = Path(os.getenv("LOG_DIR", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "app.log"

    # ------------------------------------------------------------------
    # Minimal JSON formatter so log aggregators (Datadog, Stackdriver, etc.) can
    # parse it easily.  We still keep a human-readable console formatter for
    # local development.
    # ------------------------------------------------------------------

    logging_config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            },
            "console": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "json",
                "filename": str(log_file),
                "maxBytes": 5 * 1024 * 1024,  # 5 MB per file
                "backupCount": 3,
            },
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "console" if os.getenv("DEBUG", "False").lower() == "true" else "json",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {
            "level": log_level,
            "handlers": ["console", "file"],
        },
    }

    logging.config.dictConfig(logging_config)

    # Reduce verbosity of noisy third-party libraries in production.
    if log_level not in ("DEBUG", "NOTSET"):
        for noisy in ("sqlalchemy", "uvicorn.access"):
            logging.getLogger(noisy).setLevel("WARNING") 
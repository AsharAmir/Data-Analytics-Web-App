import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Database Configuration for Docker Oracle
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "1521"))
    DB_SERVICE_NAME: str = os.getenv("DB_SERVICE_NAME", "XE")
    DB_USERNAME: str = os.getenv("DB_USERNAME", "system")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "admin123")

    # JWT Configuration
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", "your-super-secret-jwt-key-change-this-in-production"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "240")
    )

    # Application Configuration
    AUTH_MODE: str = os.getenv("AUTH_MODE", "form")  # form or saml
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"

    # Allow overriding CORS origins via comma‑separated env var, e.g.
    # CORS_ORIGINS="http://localhost:3000,https://localhost"
    _cors_env = os.getenv("CORS_ORIGINS")
    if _cors_env:
        # Handle JSON-style list string or simple comma-separated
        cleaned_cors = _cors_env.replace("[", "").replace("]", "").replace('"', "").replace("'", "")
        CORS_ORIGINS = [origin.strip() for origin in cleaned_cors.split(",") if origin.strip()]
    else:
        # sensible defaults for local dev (http) and common https reverse‑proxy on localhost
        CORS_ORIGINS = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://localhost",
            "https://127.0.0.1",
        ]

    # SAML Configuration (if using SAML)
    SAML_ENTITY_ID: Optional[str] = os.getenv("SAML_ENTITY_ID")
    SAML_SSO_URL: Optional[str] = os.getenv("SAML_SSO_URL")
    SAML_X509_CERT: Optional[str] = os.getenv("SAML_X509_CERT")

    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

    @property
    def database_url(self) -> str:
        return f"oracle+oracledb://{self.DB_USERNAME}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/?service_name={self.DB_SERVICE_NAME}"


settings = Settings()

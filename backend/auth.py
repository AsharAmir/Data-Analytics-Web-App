from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Union
from jose import JWTError, jwt
import bcrypt
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models import User, UserCreate
from database import db_manager
from config import settings
import logging
import os
from roles_utils import normalize_role, is_admin, is_user, get_default_role, get_admin_role, get_user_role

logger = logging.getLogger(__name__)

# Password hashing
security = HTTPBearer()

# -----------------------------
# Role normalization helpers
# -----------------------------

def serialize_roles(value: Union[str, List[str], None]) -> Optional[str]:
    """Serialize a role or list of roles into a comma-separated, uppercase string."""
    if value is None:
        return None
    if isinstance(value, list):
        roles = [normalize_role(r) for r in value if str(r).strip()]
        # de-duplicate case-insensitively by using the normalized set
        return ",".join(sorted(set(roles))) if roles else None
    return normalize_role(value)


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token with enhanced security"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),  # Issued at
        "jti": f"{data.get('sub', '')}_{int(datetime.utcnow().timestamp())}"  # JWT ID for tracking
    })
    
    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            return None
        return payload
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    username = payload.get("sub")
    if username is None:
        raise credentials_exception

    user = get_user_by_username(username)
    if user is None:
        raise credentials_exception

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[User]:
    """Get current user from JWT token, but return None if not authenticated (no exception)"""
    if not credentials:
        return None
    
    try:
        payload = verify_token(credentials.credentials)
        if payload is None:
            return None

        username = payload.get("sub")
        if username is None:
            return None

        user = get_user_by_username(username)
        return user
    except Exception:
        return None


def get_user_by_username(username: str) -> Optional[User]:
    """Get user by username from database"""
    try:
        result = db_manager.execute_query(
            "SELECT id, username, email, role, is_active, must_change_password, created_at FROM app_users WHERE username = :1",
            (username,),
        )
        if result:
            user_data = result[0]
            return User(
                id=user_data["ID"],
                username=user_data["USERNAME"],
                email=user_data["EMAIL"],
                role=normalize_role(user_data.get("ROLE", get_default_role())),
                is_active=bool(user_data["IS_ACTIVE"]),
                must_change_password=bool(user_data.get("MUST_CHANGE_PASSWORD", 1)),
                created_at=user_data["CREATED_AT"],
            )
        return None
    except Exception as e:
        logger.error(f"Error getting user by username: {e}")
        return None


def get_user_by_email(email: str) -> Optional[User]:
    """Get user by email from database"""
    try:
        result = db_manager.execute_query(
            "SELECT id, username, email, role, is_active, must_change_password, created_at FROM app_users WHERE email = :1",
            (email,),
        )
        if result:
            user_data = result[0]
            return User(
                id=user_data["ID"],
                username=user_data["USERNAME"],
                email=user_data["EMAIL"],
                role=normalize_role(user_data.get("ROLE", get_default_role())),
                is_active=bool(user_data["IS_ACTIVE"]),
                must_change_password=bool(user_data.get("MUST_CHANGE_PASSWORD", 1)),
                created_at=user_data["CREATED_AT"],
            )
        return None
    except Exception as e:
        logger.error(f"Error getting user by email: {e}")
        return None


def authenticate_user(username: str, password: str) -> Optional[User]:
    """Authenticate user with username and password"""
    try:
        result = db_manager.execute_query(
            "SELECT id, username, email, password_hash, role, is_active, must_change_password, created_at FROM app_users WHERE username = :1",
            (username,),
        )
        if not result:
            return None

        user_data = result[0]
        if not verify_password(password, user_data["PASSWORD_HASH"]):
            return None

        if not user_data["IS_ACTIVE"]:
            return None

        return User(
            id=user_data["ID"],
            username=user_data["USERNAME"],
            email=user_data["EMAIL"],
            role=normalize_role(user_data.get("ROLE", get_default_role())),
            is_active=bool(user_data["IS_ACTIVE"]),
            must_change_password=bool(user_data.get("MUST_CHANGE_PASSWORD", 1)),
            created_at=user_data["CREATED_AT"],
        )
    except Exception as e:
        logger.error(f"Error authenticating user: {e}")
        return None


def create_user(user_create: UserCreate, role: Any = get_default_role()) -> Optional[User]:
    """Create new user with specified role"""
    try:
        # Check if user already exists
        if get_user_by_username(user_create.username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered",
            )

        if get_user_by_email(user_create.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        # Normalize role for storage (always uppercase)
        role = normalize_role(role)

        # Hash password
        hashed_password = get_password_hash(user_create.password)

        # Insert user with role, auto-creating column if necessary
        insert_sql = (
            "INSERT INTO app_users (username, email, password_hash, role, must_change_password) VALUES (:1, :2, :3, :4, 1)"
        )

        try:
            user_id = db_manager.execute_non_query(
                insert_sql,
                (user_create.username, user_create.email, hashed_password, role),
            )
        except Exception as e:
            # Handle Oracle unique constraint violation (username/email already exists)
            if "ORA-00001" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username or email already exists",
                )

            # Handle cases where ROLE column is missing (e.g. legacy DB) – add it then retry
            if "ORA-00904" in str(e).upper() and "ROLE" in str(e).upper():
                try:
                    logger.warning("ROLE column missing – adding column to app_users table on the fly")
                    db_manager.execute_non_query(
                        "ALTER TABLE app_users ADD (role VARCHAR2(20) DEFAULT 'user' NOT NULL)"
                    )
                    # Retry insert
                    user_id = db_manager.execute_non_query(
                        insert_sql,
                        (
                            user_create.username,
                            user_create.email,
                            hashed_password,
                            role,
                        ),
                    )
                except Exception as inner_exc:
                    logger.error(f"Error adding ROLE column or retrying insert: {inner_exc}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create user (database schema update error)",
                    )
            else:
                logger.error(f"Error inserting user: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create user",
                )

        # Get created user
        return get_user_by_username(user_create.username)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating user",
        )


class SAMLAuth:
    """Light-weight SAML authentication wrapper around python3-saml.

    The goal is not to expose all SAML capabilities but to provide just enough
    behaviour so that IdP-initiated or SP-initiated flows can be completed and
    the resulting user can be mapped/created in the local database.

    This implementation purposely keeps the 3rd-party dependency optional so
    that the whole backend can still boot even when the python3-saml extras are
    not available in the environment (for example during CI when SAML is not
    used). In such cases, the helper will raise explicit HTTP 501 errors when
    the SAML endpoints are hit so that administrators know why the flow cannot
    continue.
    """

    def __init__(self):
        self.idp_url = settings.SAML_SSO_URL
        self.sp_entity_id = (
            settings.SAML_ENTITY_ID or "http://localhost:8000/metadata"
        )  # default entity ID
        self.cert_path = settings.SAML_X509_CERT
        self._saml_available = None  # Will be checked lazily

    # ------------------------------------------------------------------
    # Helper methods
    # ------------------------------------------------------------------
    def _check_saml_availability(self):
        """Lazily check if SAML libraries are available"""
        if self._saml_available is None:
            try:
                # Lazy import so that the module is only required when SAML mode is enabled
                from onelogin.saml2.settings import OneLogin_Saml2_Settings  # noqa
                from onelogin.saml2.auth import OneLogin_Saml2_Auth  # noqa
                from onelogin.saml2.utils import OneLogin_Saml2_Utils  # noqa

                self._saml_available = True
            except ImportError:
                self._saml_available = False
        return self._saml_available

    def _build_settings(self):
        """Return a minimal python3-saml settings dict."""
        return {
            "strict": False,
            "debug": settings.DEBUG,
            "sp": {
                "entityId": self.sp_entity_id,
                "assertionConsumerService": {
                    "url": f"{os.getenv('BACKEND_BASE_URL', 'http://localhost:8000').rstrip('/')}/auth/saml/acs",
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
                },
                "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
            },
            "idp": {
                "entityId": self.idp_url,
                "singleSignOnService": {
                    "url": self.idp_url,
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                },
                "x509cert": self._load_idp_cert(),
            },
        }

    def _load_idp_cert(self):
        if self.cert_path and os.path.exists(self.cert_path):
            try:
                with open(self.cert_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                logger.warning(f"Unable to read IdP certificate: {e}")
        return ""

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------
    def initiate_login(self, request: Optional[Request] = None) -> str:
        """Return the URL that the user should be redirected to in order to start the SAML login flow."""
        if not self._check_saml_availability():
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="SAML libraries not installed on the server.",
            )

        # Build a fake FastAPI request adapter as expected by python3-saml.
        saml_request_data = {
            "https": "on" if request and request.url.scheme == "https" else "off",
            "http_host": request.url.hostname if request else "localhost",
            "server_port": str(
                request.url.port
                or (443 if (request and request.url.scheme == "https") else 80)
            ),
            "script_name": request.url.path if request else "",
            "get_data": request.query_params if request else {},
            "post_data": {},
        }

        from onelogin.saml2.auth import OneLogin_Saml2_Auth

        auth = OneLogin_Saml2_Auth(saml_request_data, self._build_settings())
        return auth.login()

    def handle_response(self, saml_response: str) -> Optional[User]:
        """Validate the SAML response and map or create a local user.

        Returns a ``User`` instance on success or ``None`` when validation fails.
        """
        if not self._check_saml_availability():
            logger.error("python3-saml not available – cannot validate SAML response")
            return None

        try:
            from onelogin.saml2.response import OneLogin_Saml2_Response
            from onelogin.saml2.utils import OneLogin_Saml2_Utils

            settings_dict = self._build_settings()
            from onelogin.saml2.settings import OneLogin_Saml2_Settings

            saml_settings = OneLogin_Saml2_Settings(
                settings_dict, raise_exceptions=True
            )
            response = OneLogin_Saml2_Response(saml_settings, saml_response)

            if not response.is_valid():
                logger.warning("Invalid SAML response received")
                return None

            user_data = response.get_attributes()
            username = response.get_nameid()
            email = (
                user_data.get("email")
                or user_data.get("Email")
                or user_data.get("mail")
                or [f"{username}@example.com"]
            )[0]

            # ------------------------------------------------------------------
            # Ensure that the user exists locally
            # ------------------------------------------------------------------
            user = get_user_by_username(username)
            if not user:
                random_password = jwt.encode(
                    {"rnd": username},
                    settings.JWT_SECRET_KEY,
                    algorithm=settings.JWT_ALGORITHM,
                )
                new_user = UserCreate(
                    username=username, email=email, password=random_password
                )
                user = create_user(new_user)

            return user
        except Exception as exc:
            logger.error(f"Exception while handling SAML response: {exc}")
            return None


saml_auth = SAMLAuth()


def get_auth_mode() -> str:
    """Get current authentication mode"""
    return settings.AUTH_MODE


# Initialize default admin user
def init_default_user():
    """Create default admin user if no users exist"""
    try:
        result = db_manager.execute_query("SELECT COUNT(*) as count FROM app_users")
        if result and result[0]["COUNT"] == 0:
            # Create default admin user
            admin_user = UserCreate(
                username="admin",
                email="admin@example.com",
                password="admin123",  # Change this in production!
            )
            create_user(admin_user, role=get_admin_role())
            logger.info("Default admin user created")
    except Exception as e:
        logger.error(f"Error creating default user: {e}")


# Role-based access control
def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role for certain endpoints (case-insensitive)"""
    if not is_admin(current_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return current_user


def require_user_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """Allow access to users and admins (case-insensitive)"""
    if not (is_admin(current_user.role) or is_user(current_user.role)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User access required"
        )
    return current_user


def require_resource_access(resource_type: str, resource_id: int = None):
    """Decorator to check if user has access to specific resource"""
    def decorator(current_user: User = Depends(get_current_user)) -> User:
        if is_admin(current_user.role):
            return current_user
            
        # Check resource-specific permissions
        if resource_type == "query" and resource_id:
            query_obj = get_query_by_id(resource_id)
            if not query_obj:
                raise HTTPException(status_code=404, detail="Resource not found")
                
            # Check if user has permission for this query
            assigned_roles = {r.strip().upper() for r in (query_obj.get('role', '') or "").split(",") if r.strip()}
            if assigned_roles and normalize_role(current_user.role).strip().upper() not in assigned_roles:
                logger.warning(
                    f"Access denied for {resource_type} {resource_id}: user {current_user.username} "
                    f"(role: {current_user.role}) not in assigned roles: {assigned_roles}"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You don't have permission to access this resource"
                )
                
        return current_user
    return decorator


def get_query_by_id(query_id: int):
    """Get query by ID for permission checking"""
    try:
        result = db_manager.execute_query(
            "SELECT id, name, role FROM app_queries WHERE id = :1 AND is_active = 1",
            (query_id,),
        )
        if result:
            return result[0]
        return None
    except Exception as e:
        logger.error(f"Error getting query by ID: {e}")
        return None


def check_rate_limit(username: str, action: str, limit: int = 10, window_minutes: int = 1, *, client_ip: str | None = None) -> bool:
    """Check whether further attempts are allowed (failed attempts only).

    This function NO LONGER records the attempt automatically. Call
    ``record_login_attempt(..., success=False)`` on failed attempts and
    ``reset_login_attempts(...)`` on success. This avoids locking users out when
    they provide the correct password and prevents global IP lockouts.
    """
    import time
    from collections import defaultdict

    # In production use Redis or DB for distributed rate limiting
    if not hasattr(check_rate_limit, "attempts"):
        check_rate_limit.attempts = defaultdict(list)

    now = time.time()
    window_start = now - (window_minutes * 60)

    def _prune(key: str):
        check_rate_limit.attempts[key] = [t for t in check_rate_limit.attempts[key] if t > window_start]

    # Check both username and IP buckets (when provided)
    user_key = f"user:{username}:{action}"
    ip_key = f"ip:{client_ip}:{action}" if client_ip else None

    _prune(user_key)
    if ip_key:
        _prune(ip_key)

    if len(check_rate_limit.attempts[user_key]) >= limit:
        logger.warning(f"Rate limit exceeded for username={username} action={action}")
        return False
    if ip_key and len(check_rate_limit.attempts[ip_key]) >= max(limit * 2, limit):
        # Allow higher per-IP burst to reduce collateral blocking
        logger.warning(f"Rate limit exceeded for ip={client_ip} action={action}")
        return False

    return True


def record_login_attempt(username: str, action: str, success: bool, *, client_ip: str | None = None, window_minutes: int = 1) -> None:
    """Record a login attempt only on failure; reset counters on success."""
    import time
    from collections import defaultdict

    if not hasattr(check_rate_limit, "attempts"):
        check_rate_limit.attempts = defaultdict(list)

    user_key = f"user:{username}:{action}"
    ip_key = f"ip:{client_ip}:{action}" if client_ip else None

    if success:
        # Reset recent failures for both buckets on success
        check_rate_limit.attempts[user_key] = []
        if ip_key:
            check_rate_limit.attempts[ip_key] = []
        return

    now = time.time()
    check_rate_limit.attempts[user_key].append(now)
    if ip_key:
        check_rate_limit.attempts[ip_key].append(now)

import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from auth import (
    authenticate_user,
    create_access_token,
    get_auth_mode,
    get_current_user,
    saml_auth,
    check_rate_limit,
)
from config import settings
from failure_tracker import failure_tracker
from models import APIResponse, Token, User, UserLogin
from auth import verify_password, get_password_hash
from database import db_manager
from input_validation import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(user_login: UserLogin, request: Request):
    """Enhanced secure form-based login with comprehensive validation"""
    import time
    
    if get_auth_mode() != "form":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form-based authentication is disabled",
        )

    try:
        # Validate and sanitize username
        if not InputValidator.validate_username(user_login.username):
            logger.warning(f"Invalid username format in login attempt: {user_login.username}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username format"
            )
        
        sanitized_username = InputValidator.sanitize_string(user_login.username, max_length=50)
        
        # Validate password (basic checks)
        if not user_login.password or len(user_login.password) > 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password"
            )
        
        # Rate limiting check – use failed-attempt buckets only (username+IP)
        client_ip = request.client.host if request.client else "unknown"
        if not check_rate_limit(sanitized_username, "login_attempt", limit=5000, window_minutes=15, client_ip=client_ip):
            logger.warning(f"Rate limit exceeded for login attempts: {sanitized_username} from {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again in 15 minutes."
            )
        
        user = authenticate_user(sanitized_username, user_login.password)
        if not user:
            # Record only failed attempts for limiter
            try:
                from auth import record_login_attempt
                record_login_attempt(sanitized_username, "login_attempt", success=False, client_ip=client_ip)
            except Exception:
                pass
            failure_tracker.track_auth_failure(
                username=sanitized_username,
                failure_type="invalid_credentials"
            )
            logger.warning(
                f"Failed login attempt: {sanitized_username} from {client_ip} "
                f"[User-Agent: {request.headers.get('User-Agent', 'Unknown')}]"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "sub": user.username,
                "role": user.role,
                "iat": int(time.time()),  # Issued at time
            }, 
            expires_delta=access_token_expires
        )

        logger.info(
            f"Successful login: {user.username} (role: {user.role}) from {client_ip}"
        )
        # Reset limiter on success
        try:
            from auth import record_login_attempt
            record_login_attempt(sanitized_username, "login_attempt", success=True, client_ip=client_ip)
        except Exception:
            pass

        return Token(access_token=access_token, token_type="bearer", user=user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service temporarily unavailable"
        )


# ---------------- Password Change ----------------


class PasswordChangeRequest(UserLogin):
    new_password: str


@router.post("/change-password", response_model=APIResponse)
async def change_password(request_data: PasswordChangeRequest, current_user: User = Depends(get_current_user)):
    """Allow a user to change their password. Requires old password verification."""

    # Verify old password
    if current_user.username != request_data.username:
        raise HTTPException(status_code=403, detail="Cannot change another user's password")

    # Re-fetch hashed password for verification
    result = db_manager.execute_query(
        "SELECT password_hash FROM app_users WHERE id = :1", (current_user.id,)
    )
    if not result or not verify_password(request_data.password, result[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect current password")

    # Update hash & clear must_change_password
    new_hash = get_password_hash(request_data.new_password)
    db_manager.execute_non_query(
        "UPDATE app_users SET password_hash=:1, must_change_password=0 WHERE id=:2",
        (new_hash, current_user.id),
    )

    return APIResponse(success=True, message="Password changed successfully")


@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/mode", response_model=APIResponse)
async def get_authentication_mode():
    return APIResponse(success=True, data={"auth_mode": get_auth_mode()})


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: User = Depends(get_current_user)):
    """Refresh JWT token for active users"""
    try:
        # Create new access token
        access_token = create_access_token(data={"sub": current_user.username})
        
        # Return new token with user data
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=current_user
        )
    except Exception as e:
        logger.error(f"Error refreshing token: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh token")


@router.post("/logout", response_model=APIResponse)
async def logout(request: Request):
    """
    Handle user logout.
    Since JWTs are stateless, actual invalidation happens on the client side (deleting the token).
    This endpoint serves as a hook for any server-side cleanup (audit logs, etc.) and avoids 404s.
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"User logout request from {client_ip}")
    return APIResponse(success=True, message="Logged out successfully")


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------


@router.get("/saml/login")
async def saml_login(request: Request):
    if get_auth_mode() != "saml":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAML authentication not enabled",
        )

    redirect_url = saml_auth.initiate_login(request)
    return RedirectResponse(url=redirect_url)


@router.post("/saml/acs")
async def saml_acs(request: Request):
    if get_auth_mode() != "saml":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAML authentication not enabled",
        )

    form = await request.form()
    saml_response = form.get("SAMLResponse")
    if not saml_response:
        raise HTTPException(status_code=400, detail="Missing SAMLResponse in request")

    user = saml_auth.handle_response(saml_response)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid SAML response")

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    html_content = f"""
    <!DOCTYPE html>
    <html lang=\"en\">
      <head>
        <meta charset=\"UTF-8\">
        <title>Login Successful</title>
      </head>
      <body>
        <script>
          (function() {{
            var token = '{access_token}';
            localStorage.setItem('auth_token', token);
            document.cookie = 'auth_token=' + token + '; path=/; max-age=' + (7*24*60*60) + '; samesite=strict;';
            window.location.href = '{settings.FRONTEND_BASE_URL.rstrip('/')}/dashboard';
          }})();
        </script>
        <noscript>Login successful. You can now close this window.</noscript>
      </body>
    </html>
    """
    return HTMLResponse(content=html_content)

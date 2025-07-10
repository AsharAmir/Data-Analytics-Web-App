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
)
from config import settings
from models import APIResponse, Token, User, UserLogin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(user_login: UserLogin):
    """Standard form-based login returning JWT token."""
    if get_auth_mode() != "form":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Form-based authentication is disabled",
        )

    user = authenticate_user(user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer", user=user)


@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/mode", response_model=APIResponse)
async def get_authentication_mode():
    return APIResponse(success=True, data={"auth_mode": get_auth_mode()})


# ---------------------------------------------------------------------------
# SAML Authentication Routes
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
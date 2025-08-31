import logging
import time
import secrets
from typing import Dict, Set
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from fastapi import status

logger = logging.getLogger(__name__)


class SecurityMiddleware(BaseHTTPMiddleware):
    """Enhanced security middleware with rate limiting, CSRF protection, and request validation"""
    
    def __init__(self, app, max_requests_per_minute: int = 60, max_failed_attempts: int = 5):
        super().__init__(app)
        self.max_requests_per_minute = max_requests_per_minute
        self.max_failed_attempts = max_failed_attempts
        
        # Rate limiting storage (in production, use Redis)
        self.request_counts: Dict[str, deque] = defaultdict(lambda: deque())
        self.failed_attempts: Dict[str, int] = defaultdict(int)
        self.blocked_ips: Dict[str, float] = {}
        
        # CSRF token storage (in production, use secure session storage)
        self.csrf_tokens: Set[str] = set()
        
        self.security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
        }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.time()
        client_ip = self.get_client_ip(request)
        
        try:
            if not await self.validate_request_security(request, client_ip):
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"error": "Request blocked by security policy"}
                )
            
            # Rate limiting check
            if not await self.check_rate_limit(client_ip, request.method):
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"error": "Rate limit exceeded. Please try again later."}
                )
            
            # Process request
            response = await call_next(request)
            
            for header, value in self.security_headers.items():
                response.headers[header] = value
            
            # Log successful request
            duration = (time.time() - start_time) * 1000
            logger.info(
                f"SECURITY: {request.method} {request.url.path} -> {response.status_code} "
                f"[{duration:.2f}ms] [IP: {client_ip}]"
            )
            
            if response.status_code in [401, 403]:
                # Do not escalate to IP-block for login endpoint – per-user limiter handles it
                path = str(request.url.path).lower()
                if not path.startswith("/auth/login"):
                    self.failed_attempts[client_ip] += 1
                    if self.failed_attempts[client_ip] >= self.max_failed_attempts:
                        self.blocked_ips[client_ip] = time.time() + 300  # Block for 5 minutes
                        logger.warning(f"IP {client_ip} blocked due to repeated failed attempts")
            else:
                # Reset failed attempts on successful request
                self.failed_attempts[client_ip] = 0
            
            return response
            
        except Exception as e:
            logger.error(f"Security middleware error: {e}")
            duration = (time.time() - start_time) * 1000
            logger.error(
                f"SECURITY_ERROR: {request.method} {request.url.path} "
                f"[{duration:.2f}ms] [IP: {client_ip}] [Error: {str(e)}]"
            )
            raise

    def get_client_ip(self, request: Request) -> str:
        """Get real client IP, considering proxy headers"""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"

    async def validate_request_security(self, request: Request, client_ip: str) -> bool:
        """Validate request for security threats"""
        
        # Check if IP is blocked
        if client_ip in self.blocked_ips:
            if time.time() < self.blocked_ips[client_ip]:
                return False
            else:
                # Unblock expired IPs
                del self.blocked_ips[client_ip]
        
        # Validate request size (prevent DoS)
        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB limit
            logger.warning(f"Request too large from IP {client_ip}: {content_length} bytes")
            return False
        
        # Check for suspicious patterns in URL
        suspicious_patterns = [
            "../", "..\\", "<script", "javascript:", "vbscript:",
            "data:text/html", "eval(", "expression(", "import(", "require("
        ]
        
        url_path = str(request.url.path).lower()
        query_string = str(request.url.query).lower()
        
        for pattern in suspicious_patterns:
            if pattern in url_path or pattern in query_string:
                logger.warning(f"Suspicious pattern detected from IP {client_ip}: {pattern}")
                return False
        
        # Validate headers for common attack vectors
        user_agent = request.headers.get("User-Agent", "").lower()
        if not user_agent or len(user_agent) > 500:
            logger.warning(f"Suspicious User-Agent from IP {client_ip}")
            return False
        
        # Check for SQL injection patterns in query parameters
        for key, value in request.query_params.items():
            if self.contains_sql_injection_pattern(str(value)):
                logger.warning(f"Potential SQL injection attempt from IP {client_ip}: {key}={value}")
                return False
        
        return True

    def contains_sql_injection_pattern(self, value: str) -> bool:
        """Check if string contains potential SQL injection patterns"""
        value_lower = value.lower()
        sql_patterns = [
            "union select", "drop table", "delete from", "insert into",
            "update set", "create table", "alter table", "grant ", "revoke ",
            "exec ", "execute ", "sp_", "xp_", "'; ", "' or ", "' and ",
            "' union", "' drop", "' delete", "' insert", "' update",
            "char(", "ascii(", "substring(", "declare @"
        ]
        
        return any(pattern in value_lower for pattern in sql_patterns)

    async def check_rate_limit(self, client_ip: str, method: str = "GET") -> bool:
        """Check if client IP is within rate limits"""
        # Skip rate limiting for OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return True
            
        # Skip rate limiting for localhost in development
        if client_ip in ["127.0.0.1", "::1", "localhost"]:
            return True
            
        now = time.time()
        minute_ago = now - 60
        
        # Clean old requests
        while (self.request_counts[client_ip] and 
               self.request_counts[client_ip][0] < minute_ago):
            self.request_counts[client_ip].popleft()
        
        # Check current count
        current_count = len(self.request_counts[client_ip])
        if current_count >= self.max_requests_per_minute:
            return False
        
        # Add current request
        self.request_counts[client_ip].append(now)
        return True

    def generate_csrf_token(self) -> str:
        """Generate a secure CSRF token"""
        token = secrets.token_urlsafe(32)
        self.csrf_tokens.add(token)
        return token

    def validate_csrf_token(self, token: str) -> bool:
        """Validate CSRF token"""
        return token in self.csrf_tokens

    def cleanup_expired_data(self):
        """Clean up expired data to prevent memory leaks"""
        now = time.time()
        
        # Clean up old request counts
        minute_ago = now - 60
        for ip in list(self.request_counts.keys()):
            while (self.request_counts[ip] and 
                   self.request_counts[ip][0] < minute_ago):
                self.request_counts[ip].popleft()
            
            # Remove empty deques
            if not self.request_counts[ip]:
                del self.request_counts[ip]
        
        # Clean up expired blocked IPs
        expired_ips = [ip for ip, expiry in self.blocked_ips.items() if now >= expiry]
        for ip in expired_ips:
            del self.blocked_ips[ip]


class ContentSecurityPolicyMiddleware(BaseHTTPMiddleware):
    """Middleware to add Content Security Policy headers"""
    
    def __init__(self, app):
        super().__init__(app)
        
        # Define CSP policy
        self.csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' http://localhost:8000 https://api.example.com; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "base-uri 'self'"
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        
        # Add CSP header
        response.headers["Content-Security-Policy"] = self.csp_policy
        
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Middleware for enhanced request validation and logging"""
    
    def __init__(self, app):
        super().__init__(app)
        self.max_request_size = 50 * 1024 * 1024  # 50MB
        self.suspicious_extensions = ['.php', '.asp', '.jsp', '.py', '.rb', '.pl', '.cgi']

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Log all requests for audit trail
        client_ip = self.get_client_ip(request)
        
        logger.info(
            f"REQUEST: {request.method} {request.url} "
            f"[IP: {client_ip}] "
            f"[User-Agent: {request.headers.get('User-Agent', 'None')}] "
            f"[Referer: {request.headers.get('Referer', 'None')}]"
        )
        
        # Validate request path for suspicious extensions
        path = str(request.url.path).lower()
        for ext in self.suspicious_extensions:
            if path.endswith(ext):
                logger.warning(f"Request with suspicious extension blocked: {path} from {client_ip}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"error": "Access denied"}
                )
        
        return await call_next(request)

    def get_client_ip(self, request: Request) -> str:
        """Get real client IP"""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

import re
import logging
from typing import Any, Dict, List, Optional, Union
from fastapi import HTTPException, status
import html
import urllib.parse

logger = logging.getLogger(__name__)


class InputValidator:
    """Enhanced input validation and sanitization for enterprise security"""
    
    # Common dangerous patterns
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)",
        r"(UNION\s+SELECT)",
        r"(--|\#|\/\*|\*\/)",
        r"(\bOR\b\s+\d+\s*=\s*\d+)",
        r"(\bAND\b\s+\d+\s*=\s*\d+)",
        r"(';\s*(SELECT|INSERT|UPDATE|DELETE))",
        r"(\bxp_\w+|\bsp_\w+)",
        r"(\bDBMS_\w+)",          # Oracle DBMS packages
        r"(\bUTL_\w+)",           # Oracle UTL packages
        r"(\bCTX_\w+)",           # Oracle CTX packages
        r"(\bORA_\w+)",           # Oracle ORA system users/roles
        r"(\bXMLTYPE\b)",         # Oracle XMLType

        r"('\s*OR\s*'\d+'\s*=\s*'\d+')",  # '1'='1' patterns
        r"('\s*OR\s*'\w+'\s*=\s*'\w+')",  # 'a'='a' patterns  
        r"('\s*OR\s+1\s*=\s*1)",         # ' OR 1=1 patterns
        r"('\s*AND\s*'\d+'\s*=\s*'\d+')", # '1'='1' AND patterns
        r"('\s*OR\s*'\d+'\s*=\s*'\d+')",  # Additional '1'='1' variants
        r"OR\s*'\d+'\s*=\s*'\d+'",       # OR '1'='1' without leading quote
        r"OR\s+'\w+'\s*=\s*'\w+'",       # OR 'a'='a' variants
        r"'\s*OR\s*'\d+'\s*=\s*'\d+'",   # ' OR '1'='1' variations
        r"'\s*OR\s*'\d+'\s*=\s*'\d+",    # ' OR '1'='1 (without trailing quote)
        r"'\s*OR\s*\d+\s*=\s*\d+\s*--",  # ' OR 1=1-- patterns
        r"'\s*OR\s*'\d+'\s*=\s*'\d+'\s*--", # ' OR '1'='1'-- patterns
    ]
    
    XSS_PATTERNS = [
        r"<script[^>]*>",
        r"javascript:",
        r"vbscript:",
        r"data:text/html",
        r"on\w+\s*=",
        r"<iframe[^>]*>",
        r"<object[^>]*>",
        r"<embed[^>]*>",
        r"<form[^>]*>",
        r"';\s*alert\s*\(",      # '; alert( patterns
        r"'\s*;\s*alert\s*\(",    # '; alert( with spaces
        r"eval\s*\(",            # eval( function calls
        r"document\.",           # document. access
        r"window\.",             # window. access
    ]
    
    PATH_TRAVERSAL_PATTERNS = [
        r"\.\./",
        r"\.\.\\",
        r"%2e%2e%2f",
        r"%2e%2e%5c",
        r"..%2f",
        r"..%5c",
    ]
    
    LDAP_INJECTION_PATTERNS = [
        r"\*\)\(.*\=",
        r"\)\(.*\|\(.*\=",
        r"\)\(&\(.*\=",
        r"\*\|\(.*\=",
        r"[\(\)\*\&\|]",
    ]

    @staticmethod
    def sanitize_string(value: str, max_length: int = 1000, allow_html: bool = False) -> str:
        """Sanitize string input with comprehensive cleaning"""
        if not isinstance(value, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input must be a string"
            )
        
        if len(value) > max_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Input too long. Maximum length is {max_length} characters"
            )
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        # HTML encode if HTML is not allowed
        if not allow_html:
            value = html.escape(value, quote=True)
        
        # Remove control characters except common whitespace
        value = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', value)
        
        return value.strip()

    @staticmethod
    def validate_sql_injection(value: str) -> bool:
        """Check for SQL injection patterns"""
        value_lower = value.lower()
        
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value_lower, re.IGNORECASE):
                logger.warning(f"SQL injection pattern detected: {pattern} in {value[:100]}...")
                return False
        
        return True

    @staticmethod
    def validate_xss(value: str) -> bool:
        """Check for XSS patterns"""
        value_lower = value.lower()
        
        for pattern in InputValidator.XSS_PATTERNS:
            if re.search(pattern, value_lower, re.IGNORECASE):
                logger.warning(f"XSS pattern detected: {pattern} in {value[:100]}...")
                return False
        
        return True

    @staticmethod
    def validate_path_traversal(value: str) -> bool:
        """Check for path traversal patterns"""
        value_decoded = urllib.parse.unquote(value).lower()
        
        for pattern in InputValidator.PATH_TRAVERSAL_PATTERNS:
            if re.search(pattern, value_decoded, re.IGNORECASE):
                logger.warning(f"Path traversal pattern detected: {pattern} in {value[:100]}...")
                return False
        
        return True

    @staticmethod
    def validate_ldap_injection(value: str) -> bool:
        """Check for LDAP injection patterns"""
        for pattern in InputValidator.LDAP_INJECTION_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning(f"LDAP injection pattern detected: {pattern} in {value[:100]}...")
                return False
        
        return True

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format with enhanced security"""
        email = InputValidator.sanitize_string(email, max_length=254)
        
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        if not re.match(email_pattern, email):
            return False
        
        if '..' in email or email.startswith('.') or email.endswith('.'):
            return False
        
        return True

    @staticmethod
    def validate_username(username: str) -> bool:
        """Validate username with security constraints"""
        username = InputValidator.sanitize_string(username, max_length=50)
        
        # Only allow alphanumeric, underscore, and hyphen
        if not re.match(r'^[a-zA-Z0-9_-]+$', username):
            return False
        
        # Minimum length
        if len(username) < 3:
            return False
        
        # No consecutive special characters
        if re.search(r'[_-]{2,}', username):
            return False
        
        return True

    @staticmethod
    def validate_password_strength(password: str) -> Dict[str, Any]:
        """Validate password strength with detailed feedback"""
        if not isinstance(password, str):
            return {"valid": False, "message": "Password must be a string"}
        
        checks = {
            "length": len(password) >= 8,
            "uppercase": bool(re.search(r'[A-Z]', password)),
            "lowercase": bool(re.search(r'[a-z]', password)),
            "digit": bool(re.search(r'\d', password)),
            "special": bool(re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]', password)),
            "no_common": not any(common in password.lower() for common in 
                               ['password', '123456', 'admin', 'user', 'qwerty']),
            "no_repeated": not re.search(r'(.)\1{2,}', password),  # No 3+ repeated chars
        }
        
        valid = all(checks.values())
        
        if not valid:
            failed_checks = [check for check, passed in checks.items() if not passed]
            messages = {
                "length": "At least 8 characters",
                "uppercase": "At least one uppercase letter",
                "lowercase": "At least one lowercase letter", 
                "digit": "At least one digit",
                "special": "At least one special character",
                "no_common": "Must not contain common passwords",
                "no_repeated": "Must not have 3 or more repeated characters"
            }
            
            failure_messages = [messages[check] for check in failed_checks]
            return {
                "valid": False,
                "message": "Password requirements not met: " + ", ".join(failure_messages),
                "requirements": failure_messages
            }
        
        return {"valid": True, "message": "Password meets all requirements"}

    @staticmethod
    def sanitize_sql_parameter(value: Union[str, int, float]) -> Union[str, int, float]:
        """Sanitize parameters for SQL queries"""
        if isinstance(value, str):
            # Check for SQL injection
            if not InputValidator.validate_sql_injection(value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid characters detected in input"
                )
            
            # Sanitize the string
            return InputValidator.sanitize_string(value)
        
        elif isinstance(value, (int, float)):
            # Validate numeric ranges
            if isinstance(value, int):
                if value < -2147483648 or value > 2147483647:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Numeric value out of acceptable range"
                    )
            
            return value
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported parameter type: {type(value)}"
            )

    @staticmethod
    def validate_file_upload(filename: str, allowed_extensions: List[str] = None) -> bool:
        """Validate file upload with security checks"""
        if not filename:
            return False
        
        # Sanitize filename
        filename = InputValidator.sanitize_string(filename, max_length=255)
        
        # Check for path traversal
        if not InputValidator.validate_path_traversal(filename):
            return False
        
        # Check file extension if provided
        if allowed_extensions:
            file_ext = filename.lower().split('.')[-1]
            if file_ext not in [ext.lower().lstrip('.') for ext in allowed_extensions]:
                return False
        
        # Block dangerous extensions
        dangerous_extensions = [
            'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jse',
            'wsf', 'wsh', 'msi', 'dll', 'scr', 'hta', 'cpl', 'msc', 'jar'
        ]
        
        file_ext = filename.lower().split('.')[-1]
        if file_ext in dangerous_extensions:
            return False
        
        return True

    @staticmethod
    def sanitize_dict(data: Dict[str, Any], max_depth: int = 10) -> Dict[str, Any]:
        """Recursively sanitize dictionary data"""
        if max_depth <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data structure too deeply nested"
            )
        
        sanitized = {}
        
        for key, value in data.items():
            # Sanitize key
            if not isinstance(key, str):
                continue  # Skip non-string keys
            
            sanitized_key = InputValidator.sanitize_string(key, max_length=100)
            
            # Sanitize value based on type
            if isinstance(value, str):
                sanitized_value = InputValidator.sanitize_string(value)
            elif isinstance(value, dict):
                sanitized_value = InputValidator.sanitize_dict(value, max_depth - 1)
            elif isinstance(value, list):
                sanitized_value = InputValidator.sanitize_list(value, max_depth - 1)
            elif isinstance(value, (int, float, bool)) or value is None:
                sanitized_value = value
            else:
                # Skip unsupported types
                continue
            
            sanitized[sanitized_key] = sanitized_value
        
        return sanitized

    @staticmethod
    def sanitize_list(data: List[Any], max_depth: int = 10) -> List[Any]:
        """Recursively sanitize list data"""
        if max_depth <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data structure too deeply nested"
            )
        
        sanitized = []
        
        for item in data:
            if isinstance(item, str):
                sanitized.append(InputValidator.sanitize_string(item))
            elif isinstance(item, dict):
                sanitized.append(InputValidator.sanitize_dict(item, max_depth - 1))
            elif isinstance(item, list):
                sanitized.append(InputValidator.sanitize_list(item, max_depth - 1))
            elif isinstance(item, (int, float, bool)) or item is None:
                sanitized.append(item)
            # Skip unsupported types
        
        return sanitized


# Decorator for automatic input validation
def validate_input(validate_json: bool = True, validate_query: bool = True):
    """Decorator to automatically validate request inputs"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # This would be implemented with FastAPI dependency injection
            # For now, it's a placeholder for the concept
            return await func(*args, **kwargs)
        return wrapper
    return decorator
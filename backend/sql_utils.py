import re
from fastapi import HTTPException, status


# ---------------------------------------------------------------------------
# Basic SQL sanitization helpers
# ---------------------------------------------------------------------------

_FORBIDDEN_TOKENS = [
    r";",  # multiple statements separator
    r"--",  # inline comment that can hide rest of statement
    r"/\*",  # block comment start
    r"\*/",  # block comment end
    r"drop\b",
    r"delete\b",
    r"truncate\b",
    r"insert\b",
    r"update\b",
    r"alter\b",
    r"create\b",
    r"grant\b",
    r"revoke\b",
    r"union\b",  # UNION-based injection
    r"exec\b",   # execute stored procedures
    r"execute\b",
    r"sp_\w+",   # stored procedures
    r"xp_\w+",   # extended stored procedures
    r"declare\b", # variable declaration
    r"char\s*\(",  # char() function often used in injection
    r"ascii\s*\(",  # ascii() function
    r"substring\s*\(",  # substring() function
    r"concat\s*\(",  # string concatenation
    r"cast\s*\(",   # type casting
    r"convert\s*\(",  # type conversion
    r"@@\w+",    # system variables
    r"waitfor\b", # time delay attacks
    r"benchmark\b", # MySQL benchmark function
    r"sleep\s*\(",  # sleep function
    r"pg_sleep\s*\(",  # PostgreSQL sleep
    r"dbms_\w+",  # Oracle DBMS packages
    r"utl_\w+",   # Oracle UTL packages
    r"'\s*or\s*'\d+'\s*=\s*'\d+'?",  # ' OR '1'='1' injection patterns (last quote optional)
    r"\s+or\s+\d+\s*=\s*\d+",       # OR 1=1 injection patterns
    r"or\s*'\d+'\s*=\s*'\d+'?",      # OR '1'='1' variants (last quote optional)
    r"'\s*or\s*\d+\s*=\s*\d+",      # ' OR 1=1 variants
]

# Compile one big regex – case-insensitive & dot matches new-lines just in case
_FORBIDDEN_PATTERN = re.compile("|".join(_FORBIDDEN_TOKENS), re.IGNORECASE | re.DOTALL)


def is_safe_sql(sql: str) -> bool:
    """Very small whitelist-based checker.

    1. Statement must start with the *SELECT* keyword.
    2. It must *not* contain any forbidden keywords or comment delimiters.

    NOTE: This is **NOT** bullet-proof security but raises the bar to prevent
    accidental destructive statements and most naïve injection attempts. For a
    production system you should combine this with proper database permissions
    (read-only user) and, ideally, a SQL parser/validator.
    """
    stripped = sql.strip().lower()
    if not stripped.startswith("select"):
        return False

    # Reject when any forbidden token is present
    if _FORBIDDEN_PATTERN.search(stripped):
        return False

    return True


def validate_sql(sql: str) -> None:
    """Enhanced validation of SQL string and raise ``HTTPException`` when it looks unsafe."""
    # Basic safety check
    if not is_safe_sql(sql):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsafe SQL detected. Only read-only SELECT queries are permitted.",
        )
    
    # Additional validation for common injection patterns
    sql_lower = sql.lower().strip()
    
    # Check for SQL injection patterns that might bypass basic checks
    injection_patterns = [
        r"'\s*or\s+'\d+'\s*=\s*'\d+'",  # '1'='1' patterns
        r"'\s*or\s+\d+\s*=\s*\d+",     # ' or 1=1 patterns
        r"'\s*and\s+'\d+'\s*=\s*'\d+'", # '1'='1' AND patterns
        r"'\s*;\s*select\s+",           # '; SELECT patterns
        r"'\s*union\s+all\s+select\s+", # ' UNION ALL SELECT patterns
        r"information_schema\.",        # metadata access
        r"sys\.",                       # system tables
        r"dual\s+where",                # Oracle dual table abuse
        r"from\s+dual\s+where",         # Oracle injection patterns
    ]
    
    for pattern in injection_patterns:
        if re.search(pattern, sql_lower, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Potential SQL injection detected. Query rejected.",
            )
    
    # Validate SQL length to prevent excessively long queries
    if len(sql) > 10000:  # 10KB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query too long. Maximum length is 10,000 characters.",
        )


def escape_literal(value: str) -> str:
    """Escape a literal to be interpolated into a SQL string.

    Currently we just double any single quote which is enough for Oracle. The
    returned string is **already quoted**, ready to be concatenated.
    """
    return f"'" + value.replace("'", "''") + "'" 
import re
from fastapi import HTTPException, status


# ---------------------------------------------------------------------------
# Basic SQL sanitization helpers
# ---------------------------------------------------------------------------

# Disallowed tokens that may modify data or alter the database when executed.
_FORBIDDEN_TOKENS = [
    r";",  # multiple statements separator
    r"--",  # inline comment that can hide rest of statement
    r"/\*",  # block comment start
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
    """Validate a SQL string and raise ``HTTPException`` when it looks unsafe."""
    if not is_safe_sql(sql):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsafe SQL detected. Only read-only SELECT queries are permitted.",
        )


def escape_literal(value: str) -> str:
    """Escape a literal to be interpolated into a SQL string.

    Currently we just double any single quote which is enough for Oracle. The
    returned string is **already quoted**, ready to be concatenated.
    """
    return f"'" + value.replace("'", "''") + "'" 
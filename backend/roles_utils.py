from typing import Union, List, Optional
from models import UserRole
from fastapi import HTTPException, status

# Canonical set of built-in/system roles used across the app
SYSTEM_ROLE_CODES: List[str] = [
    'ADMIN',
    'IT_USER',
    'CEO',
    'FINANCE_USER',
    'TECH_USER',
    'USER',
]

def normalize_role(role: Union[str, UserRole, None]) -> str:
    """Normalize role to uppercase string"""
    if role is None:
        return "USER"
    return str(role).strip().upper()

def serialize_roles(value: Union[str, List[str], None]) -> Optional[str]:
    """Serialize roles to comma-separated string"""
    if value is None:
        return None
    if isinstance(value, list):
        roles = [normalize_role(r) for r in value if str(r).strip()]
        return ",".join(sorted(set(roles))) if roles else None
    return normalize_role(value)

def is_admin(role: Union[str, UserRole, None]) -> bool:
    """Check if role is admin (case-insensitive)"""
    return normalize_role(role) == "ADMIN"

def is_user(role: Union[str, UserRole, None]) -> bool:
    """Check if role is user (case-insensitive)"""
    return normalize_role(role) == "USER"

def is_system_role(role: Union[str, UserRole, None]) -> bool:
    """Check if role is a system role"""
    return normalize_role(role) in SYSTEM_ROLE_CODES

def format_role_label(role: Union[str, UserRole, None]) -> str:
    """Format role for display"""
    normalized = normalize_role(role)
    if not normalized:
        return 'User'
    
    system_labels = {
        'ADMIN': 'Admin',
        'USER': 'User',
        'IT_USER': 'IT User',
        'TECH_USER': 'Tech',
        'CEO': 'CEO',
        'FINANCE_USER': 'Finance',
    }
    
    if normalized in system_labels:
        return system_labels[normalized]
    
    # Title case fallback for custom roles
    return normalized.replace('_', ' ').title()

def describe_role(role: Union[str, UserRole, None]) -> str:
    """Get role description"""
    normalized = normalize_role(role)
    descriptions = {
        'ADMIN': 'Full system access and user management',
        'IT_USER': 'IT infrastructure and system administration',
        'CEO': 'Executive dashboards and reports',
        'FINANCE_USER': 'Financial data and analytics',
        'TECH_USER': 'Technical metrics and system data',
        'USER': 'Basic access to assigned dashboards',
    }
    return descriptions.get(normalized, descriptions.get('USER', 'Basic access'))

def get_default_role() -> str:
    """Get default role for new users"""
    return "USER"

def get_admin_role() -> str:
    """Get admin role string"""
    return "ADMIN"

def get_user_role() -> str:
    """Get user role string"""
    return "USER"

def validate_role(role: str) -> bool:
    """Validate if role is a valid system role"""
    return normalize_role(role) in SYSTEM_ROLE_CODES

def get_all_roles() -> List[str]:
    """Get all available system roles"""
    return SYSTEM_ROLE_CODES.copy()


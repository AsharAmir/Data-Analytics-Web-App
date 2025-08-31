export function normalizeRoleCode(code: string | undefined | null): string {
  return (code ?? '').toString().trim().toUpperCase();
}

export function isAdmin(code: string | undefined | null): boolean {
  return normalizeRoleCode(code) === 'ADMIN';
}

// Canonical set of built-in/system roles used across the app
export const SYSTEM_ROLE_CODES: string[] = [
  'ADMIN',
  'USER',
  'IT_USER',
  'TECH_USER',
  'CEO',
  'FINANCE_USER',
];

export function formatRoleLabel(code: string | undefined | null): string {
  const c = normalizeRoleCode(code);
  if (!c) return 'User';
  const system: Record<string, string> = {
    ADMIN: 'Admin',
    USER: 'User',
    IT_USER: 'IT User',
    TECH_USER: 'Tech',
    CEO: 'CEO',
    FINANCE_USER: 'Finance',
  };
  if (system[c]) return system[c];
  // Title case fallback for custom roles
  return c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

export function describeRole(code: string | undefined | null): string {
  const c = normalizeRoleCode(code);
  const descriptions: Record<string, string> = {
    ADMIN: 'Full system access and user management',
    IT_USER: 'IT infrastructure and system administration',
    CEO: 'Executive dashboards and reports',
    FINANCE_USER: 'Financial data and analytics',
    TECH_USER: 'Technical metrics and system data',
    USER: 'Basic access to assigned dashboards',
  };
  return descriptions[c] || (c === 'ADMIN' ? descriptions.ADMIN : descriptions.USER);
}

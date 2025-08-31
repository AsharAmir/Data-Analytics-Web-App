export function normalizeRoleCode(code: string | undefined | null): string {
  return (code ?? '').toString().trim().toUpperCase();
}

export function isAdmin(code: string | undefined | null): boolean {
  return normalizeRoleCode(code) === 'ADMIN';
}

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


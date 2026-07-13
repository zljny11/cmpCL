export type AppRole = 'user' | 'admin' | 'super_admin';

export function isManagementRole(role: AppRole | null | undefined) {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role: AppRole | null | undefined) {
  return role === 'super_admin';
}
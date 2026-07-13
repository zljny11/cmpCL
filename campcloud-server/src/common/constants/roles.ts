export const ROLE_VALUES = ['user', 'admin', 'super_admin'] as const;

export type RoleValue = (typeof ROLE_VALUES)[number];

export const MANAGEMENT_ROLE_VALUES = ['admin', 'super_admin'] as const;

export function isManagementRole(role: RoleValue) {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdminRole(role: RoleValue) {
  return role === 'super_admin';
}

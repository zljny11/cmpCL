import { UserRole } from '@prisma/client';

export function isManagementRole(role: UserRole) {
  return role === UserRole.admin || role === UserRole.super_admin;
}

export function isSuperAdmin(role: UserRole) {
  return role === UserRole.super_admin;
}

export function getManagementRoles(): UserRole[] {
  return [UserRole.admin, UserRole.super_admin];
}
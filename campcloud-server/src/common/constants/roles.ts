export const ROLE_VALUES = ['user', 'admin'] as const;

export type RoleValue = (typeof ROLE_VALUES)[number];

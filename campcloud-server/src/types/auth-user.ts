import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  hospitalName: string;
  iat?: number;
  exp?: number;
}

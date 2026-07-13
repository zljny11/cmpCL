import type { AppRole } from './roles';

export interface UserProfileSummary {
  realName?: string | null;
  email?: string | null;
  phone?: string | null;
  wechat?: string | null;
  department?: string | null;
  title?: string | null;
  remark?: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: AppRole;
  hospitalName: string;
  status?: string;
  profile?: UserProfileSummary | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RequestPasswordResetCodePayload {
  email: string;
}

export interface EmailCodeLoginPayload {
  email: string;
  code: string;
  newPassword?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface AuthMeResponse extends AuthUser {}
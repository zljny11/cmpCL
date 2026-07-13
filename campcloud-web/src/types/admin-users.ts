import type { AppRole } from './roles';

export interface AdminUserRequirementItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface AdminUserProfile {
  realName: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
  department: string | null;
  title: string | null;
  remark: string | null;
}

export interface AdminUserItem {
  id: string;
  username: string;
  role: AppRole;
  hospitalName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  passwordDisplay: string;
  profile: AdminUserProfile | null;
  requirements: AdminUserRequirementItem[];
}

export interface AdminUserListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  role?: AppRole;
}

export interface AdminUserUpsertPayload {
  username: string;
  password?: string;
  hospitalName: string;
  role: AppRole;
  status: 'active' | 'disabled';
  realName?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  department?: string;
  title?: string;
  remark?: string;
}
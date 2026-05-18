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
  role: 'user' | 'admin';
  hospitalName: string;
  status?: string;
  profile?: UserProfileSummary | null;
}

export interface LoginPayload {
  username: string;
  password: string;
  hospitalName?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface AuthMeResponse extends AuthUser {}

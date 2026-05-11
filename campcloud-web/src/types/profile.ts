export interface Profile {
  id?: string;
  userId: string;
  realName: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  title: string | null;
  remark: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfilePayload {
  realName?: string;
  email?: string;
  phone?: string;
  department?: string;
  title?: string;
  remark?: string;
}

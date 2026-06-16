import { ApiResponse, PaginatedData } from '../../types/api';
import { AdminUserItem, AdminUserListQuery, AdminUserUpsertPayload } from '../../types/admin-users';
import { http } from '../http';

export const adminUsersApi = {
  async list(params: AdminUserListQuery) {
    const response = (await http.get('/admin/users', { params })) as ApiResponse<PaginatedData<AdminUserItem>>;
    return response.data;
  },

  async create(payload: AdminUserUpsertPayload) {
    const response = (await http.post('/admin/users', payload)) as ApiResponse<AdminUserItem>;
    return response.data;
  },

  async update(id: string, payload: AdminUserUpsertPayload) {
    const response = (await http.patch(`/admin/users/${id}`, payload)) as ApiResponse<AdminUserItem>;
    return response.data;
  },

  async remove(id: string) {
    const response = (await http.delete(`/admin/users/${id}`)) as ApiResponse<{ success: boolean }>;
    return response.data;
  },
};

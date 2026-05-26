import { ApiResponse, PaginatedData } from '../../types/api';
import { AdminLogItem, AdminLogListQuery } from '../../types/admin-logs';
import { http } from '../http';

export const adminLogsApi = {
  async list(params: AdminLogListQuery) {
    const response = (await http.get('/admin/logs', { params })) as ApiResponse<PaginatedData<AdminLogItem>>;
    return response.data;
  },
};

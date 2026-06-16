import { http } from '../http';
import { ApiResponse, PaginatedData } from '../../types/api';
import { NotificationItem, NotificationListQuery } from '../../types/notifications';

export const notificationsApi = {
  async list(params: NotificationListQuery) {
    const response = (await http.get('/notifications', { params })) as ApiResponse<PaginatedData<NotificationItem>>;
    return response.data;
  },

  async markRead(id: string) {
    const response = (await http.post(`/notifications/${id}/read`)) as ApiResponse<{ success: boolean }>;
    return response.data;
  },

  async markAllRead() {
    const response = (await http.post('/notifications/read-all')) as ApiResponse<{
      success: boolean;
      updatedCount: number;
    }>;
    return response.data;
  },
};

import { http } from '../http';
import { ApiResponse } from '../../types/api';
import { AuthMeResponse, LoginPayload, LoginResponse } from '../../types/auth';

export const authApi = {
  async login(payload: LoginPayload) {
    const response = (await http.post('/auth/login', payload)) as ApiResponse<LoginResponse>;
    return response.data;
  },

  async getMe() {
    const response = (await http.get('/auth/me')) as ApiResponse<AuthMeResponse>;
    return response.data;
  },
};

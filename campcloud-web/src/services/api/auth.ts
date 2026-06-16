import { http } from '../http';
import { ApiResponse } from '../../types/api';
import {
  AuthMeResponse,
  EmailCodeLoginPayload,
  LoginPayload,
  LoginResponse,
  RequestPasswordResetCodePayload,
} from '../../types/auth';

export const authApi = {
  async login(payload: LoginPayload) {
    const response = (await http.post('/auth/login', payload)) as ApiResponse<LoginResponse>;
    return response.data;
  },

  async requestPasswordResetCode(payload: RequestPasswordResetCodePayload) {
    return http.post('/auth/password-reset/request-code', payload) as Promise<{ success: boolean }>;
  },

  async loginWithEmailCode(payload: EmailCodeLoginPayload) {
    const response = (await http.post('/auth/password-reset/login', payload)) as ApiResponse<LoginResponse>;
    return response.data;
  },

  async getMe() {
    const response = (await http.get('/auth/me')) as ApiResponse<AuthMeResponse>;
    return response.data;
  },
};

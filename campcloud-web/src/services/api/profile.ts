import { http } from '../http';
import { ApiResponse } from '../../types/api';
import { Profile, UpdateProfilePayload } from '../../types/profile';

export const profileApi = {
  async getProfile() {
    const response = (await http.get('/profile')) as ApiResponse<Profile>;
    return response.data;
  },

  async updateProfile(payload: UpdateProfilePayload) {
    const response = (await http.put('/profile', payload)) as ApiResponse<Profile>;
    return response.data;
  },
};

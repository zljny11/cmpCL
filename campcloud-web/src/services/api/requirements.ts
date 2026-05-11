import { http } from '../http';
import { ApiResponse, PaginatedData } from '../../types/api';
import {
  CreateRequirementPayload,
  RequirementDataTree,
  RequirementDetail,
  RequirementListItem,
  RequirementListQuery,
} from '../../types/requirements';

export const requirementsApi = {
  async create(payload: CreateRequirementPayload) {
    const response = (await http.post('/requirements', payload)) as ApiResponse<RequirementDetail>;
    return response.data;
  },

  async list(params: RequirementListQuery) {
    const response = (await http.get('/requirements', { params })) as ApiResponse<PaginatedData<RequirementListItem>>;
    return response.data;
  },

  async detail(id: string) {
    const response = (await http.get(`/requirements/${id}`)) as ApiResponse<RequirementDetail>;
    return response.data;
  },

  async dataTree(id: string) {
    const response = (await http.get(`/requirements/${id}/data-tree`)) as ApiResponse<RequirementDataTree>;
    return response.data;
  },
};

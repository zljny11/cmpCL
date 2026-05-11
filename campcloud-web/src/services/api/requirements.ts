import { http } from '../http';
import { ApiResponse, PaginatedData } from '../../types/api';
import {
  CreateDatasetBatchPayload,
  CreateRequirementPayload,
  DatasetBatchItem,
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

  async listDatasetBatches(id: string, params?: { page?: number; pageSize?: number }) {
    const response = (await http.get(`/requirements/${id}/dataset-batches`, { params })) as ApiResponse<
      PaginatedData<DatasetBatchItem>
    >;
    return response.data;
  },

  async createDatasetBatch(id: string, payload: CreateDatasetBatchPayload) {
    const formData = new FormData();
    formData.append('uploadType', payload.uploadType);
    if (payload.sourceName?.trim()) {
      formData.append('sourceName', payload.sourceName.trim());
    }
    if (payload.remark?.trim()) {
      formData.append('remark', payload.remark.trim());
    }
    payload.files.forEach((file) => formData.append('files', file));

    const response = (await http.post(`/requirements/${id}/dataset-batches`, formData)) as ApiResponse<{
      datasetBatchId: string;
      batchNo: number;
      status: string;
      fileCount: number;
      uploadedAt: string;
    }>;
    return response.data;
  },
};

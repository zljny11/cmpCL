import type { AxiosProgressEvent } from 'axios';
import { http } from '../http';
import { ApiResponse, PaginatedData } from '../../types/api';
import {
  CreateRequirementDeliveryPayload,
  CreateDatasetBatchPayload,
  RequirementMessageItem,
  RequirementDeliveryItem,
  CreateRequirementPayload,
  DatasetBatchItem,
  RequirementDataTree,
  RequirementDetail,
  RequirementListItem,
  RequirementListQuery,
  RequirementPreviewPayload,
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

  async listMessages(id: string) {
    const response = (await http.get(`/requirements/${id}/messages`)) as ApiResponse<RequirementMessageItem[]>;
    return response.data;
  },

  async createMessage(id: string, payload: { content: string }) {
    const response = (await http.post(`/requirements/${id}/messages`, payload)) as ApiResponse<RequirementMessageItem>;
    return response.data;
  },

  async listDeliveries(id: string) {
    const response = (await http.get(`/requirements/${id}/deliveries`)) as ApiResponse<RequirementDeliveryItem[]>;
    return response.data;
  },

  async createDelivery(id: string, payload: CreateRequirementDeliveryPayload) {
    const formData = new FormData();
    formData.append('title', payload.title.trim());
    if (payload.description?.trim()) {
      formData.append('description', payload.description.trim());
    }
    if (payload.isFinal) {
      formData.append('isFinal', 'true');
    }
    formData.append('file', payload.file);

    const response = (await http.post(`/requirements/${id}/deliveries`, formData)) as ApiResponse<RequirementDeliveryItem>;
    return response.data;
  },

  async downloadDelivery(requirementId: string, deliveryId: string) {
    const blob = (await http.get(`/requirements/${requirementId}/deliveries/${deliveryId}/file`, {
      responseType: 'blob',
    })) as unknown as Blob;
    return blob;
  },

  async updateStatus(id: string, payload: { status: string; reason?: string }) {
    const response = (await http.patch(`/requirements/${id}/status`, payload)) as ApiResponse<{
      id: string;
      status: string;
      updatedAt: string;
    }>;
    return response.data;
  },

  async dataTree(id: string) {
    const response = (await http.get(`/requirements/${id}/data-tree`)) as ApiResponse<RequirementDataTree>;
    return response.data;
  },

  async previewStudy(requirementId: string, studyId: string) {
    const response = (await http.get(
      `/requirements/${requirementId}/studies/${studyId}/preview`,
    )) as ApiResponse<RequirementPreviewPayload>;
    return response.data;
  },

  async deleteStudy(requirementId: string, studyId: string) {
    const response = (await http.delete(`/requirements/${requirementId}/studies/${studyId}`)) as ApiResponse<{
      success: boolean;
    }>;
    return response.data;
  },

  async previewSeries(requirementId: string, seriesId: string) {
    const response = (await http.get(
      `/requirements/${requirementId}/series/${seriesId}/preview`,
    )) as ApiResponse<RequirementPreviewPayload>;
    return response.data;
  },

  async deleteSeries(requirementId: string, seriesId: string) {
    const response = (await http.delete(`/requirements/${requirementId}/series/${seriesId}`)) as ApiResponse<{
      success: boolean;
    }>;
    return response.data;
  },

  async listDatasetBatches(id: string, params?: { page?: number; pageSize?: number }) {
    const response = (await http.get(`/requirements/${id}/dataset-batches`, { params })) as ApiResponse<
      PaginatedData<DatasetBatchItem>
    >;
    return response.data;
  },

  async createDatasetBatch(
    id: string,
    payload: CreateDatasetBatchPayload,
    options?: { onUploadProgress?: (event: AxiosProgressEvent) => void },
  ) {
    const formData = new FormData();
    if (payload.sourceName?.trim()) {
      formData.append('sourceName', payload.sourceName.trim());
    }
    if (payload.remark?.trim()) {
      formData.append('remark', payload.remark.trim());
    }
    payload.files.forEach((file) => formData.append('files', file));

    const response = (await http.post(`/requirements/${id}/dataset-batches`, formData, {
      onUploadProgress: options?.onUploadProgress,
    })) as ApiResponse<{
      datasetBatchId: string;
      batchNo: number;
      status: string;
      fileCount: number;
      uploadedAt: string;
    }>;
    return response.data;
  },
};

import type { AxiosProgressEvent } from 'axios';
import { http } from '../http';
import { ApiResponse, PaginatedData } from '../../types/api';
import {
  CreateRequirementDeliveryPayload,
  CreateDatasetBatchFromOssFilesPayload,
  CreateDatasetBatchFromSessionsPayload,
  CreateRequirementOssFilePayload,
  CreateDatasetBatchPayload,
  CreateUploadSessionPayload,
  DatasetBatchFailedFilesPayload,
  DatasetBatchCommitResult,
  RequirementMessageItem,
  RequirementDeliveryItem,
  CreateRequirementPayload,
  DatasetBatchItem,
  RequirementDataTree,
  RequirementDetail,
  RequirementListItem,
  RequirementListQuery,
  RequirementPreviewPayload,
  RequirementDetailDataPullResult,
  RequirementOssFileDownloadAuthorization,
  RequirementOssFileItem,
  RequirementOssFileUploadTicket,
  UploadSessionItem,
  ConfirmRequirementOssFileUploadPayload,
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

  async verifyDeliveryLicense(requirementId: string, deliveryId: string, licenseFile: File) {
    const formData = new FormData();
    formData.append('license', licenseFile);
    const response = (await http.post(
      `/requirements/${requirementId}/deliveries/${deliveryId}/license/verify`,
      formData,
    )) as ApiResponse<{ success: boolean; message: string }>;
    return response.data;
  },

  async verifyUserLicense(licenseFile: File) {
    const formData = new FormData();
    formData.append('license', licenseFile);
    const response = (await http.post('/requirements/license/verify', formData)) as ApiResponse<{
      success: boolean;
      message: string;
    }>;
    return response.data;
  },

  async updateStatus(id: string, payload: { status: string; reason?: string }) {
    const response = (await http.patch(`/requirements/${id}/status`, payload)) as ApiResponse<{
      id: string;
      status: string;
      updatedAt: string;
    }>;
    return response.data;
  },

  async dataTree(id: string, params?: { page?: number; pageSize?: number }) {
    const response = (await http.get(`/requirements/${id}/data-tree`, { params })) as ApiResponse<RequirementDataTree>;
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

  async getViewerImageIds(seriesIds: string[]) {
    const response = (await http.post('/getImgIdArr', { seriesIds })) as ApiResponse<string[][]>;
    return response.data;
  },

  async getViewerDicomTags(seriesIds: string[]) {
    const response = (await http.post('/getDICOMTagInfo', { seriesIds })) as ApiResponse<string[][][][]>;
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

  async listDatasetBatchFailedFiles(requirementId: string, batchId: string) {
    const response = (await http.get(
      `/requirements/${requirementId}/dataset-batches/${batchId}/failed-files`,
    )) as ApiResponse<DatasetBatchFailedFilesPayload>;
    return response.data;
  },

  // Deprecated: keep only for small compatibility uploads.
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
    formData.append('modality', payload.modality);
    formData.append('bodyPart', payload.bodyPart);
    if (payload.diagnosis && payload.diagnosis.length > 0) {
      formData.append('diagnosis', JSON.stringify(payload.diagnosis));
    }
    if (payload.clinicalTags && payload.clinicalTags.length > 0) {
      formData.append('clinicalTags', JSON.stringify(payload.clinicalTags));
    }
    if (payload.annotationStatus?.trim()) {
      formData.append('annotationStatus', payload.annotationStatus.trim());
    }
    if (payload.retryBatchId) {
      formData.append('retryBatchId', payload.retryBatchId);
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

  async createUploadSession(id: string, payload: CreateUploadSessionPayload) {
    const response = (await http.post(`/requirements/${id}/upload-sessions`, payload)) as ApiResponse<UploadSessionItem>;
    return response.data;
  },

  async getUploadSession(id: string, sessionId: string) {
    const response = (await http.get(`/requirements/${id}/upload-sessions/${sessionId}`)) as ApiResponse<UploadSessionItem>;
    return response.data;
  },

  async uploadUploadSessionContent(
    id: string,
    sessionId: string,
    payload: Blob,
    options?: { startByte?: number; onUploadProgress?: (event: AxiosProgressEvent) => void },
  ) {
    const response = (await http.put(`/requirements/${id}/upload-sessions/${sessionId}/content`, payload, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-start-byte': String(options?.startByte ?? 0),
      },
      onUploadProgress: options?.onUploadProgress,
    })) as ApiResponse<UploadSessionItem>;
    return response.data;
  },

  async createDatasetBatchFromSessions(id: string, payload: CreateDatasetBatchFromSessionsPayload) {
    const response = (await http.post(`/requirements/${id}/dataset-batches/commit`, payload)) as ApiResponse<DatasetBatchCommitResult>;
    return response.data;
  },

  async createDatasetBatchFromOssFiles(id: string, payload: CreateDatasetBatchFromOssFilesPayload) {
    const response = (await http.post(
      `/requirements/${id}/dataset-batches/commit-oss-files`,
      payload,
    )) as ApiResponse<DatasetBatchCommitResult>;
    return response.data;
  },

  async createRequirementOssFile(id: string, payload: CreateRequirementOssFilePayload) {
    const response = (await http.post(`/requirements/${id}/object-storage-files`, payload)) as ApiResponse<
      RequirementOssFileUploadTicket
    >;
    return response.data;
  },

  async listRequirementOssFiles(id: string) {
    const response = (await http.get(`/requirements/${id}/object-storage-files`)) as ApiResponse<RequirementOssFileItem[]>;
    return response.data;
  },

  async completeRequirementOssFileUpload(
    id: string,
    fileId: string,
    payload: ConfirmRequirementOssFileUploadPayload,
  ) {
    const response = (await http.post(
      `/requirements/${id}/object-storage-files/${fileId}/complete`,
      payload,
    )) as ApiResponse<RequirementOssFileItem>;
    return response.data;
  },

  async authorizeRequirementOssFileDownload(id: string, fileId: string) {
    const response = (await http.post(
      `/requirements/${id}/object-storage-files/${fileId}/download-authorization`,
    )) as ApiResponse<RequirementOssFileDownloadAuthorization>;
    return response.data;
  },

  async pullRequirementDetailData(id: string) {
    const response = (await http.post(`/requirements/${id}/pull-detail-data`)) as ApiResponse<RequirementDetailDataPullResult>;
    return response.data;
  },

};

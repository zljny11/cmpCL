export type RequirementType =
  | 'CT_SUPER_RESOLUTION'
  | 'CT_DENOISE'
  | 'MR_SUPER_RESOLUTION'
  | 'MR_DENOISE'
  | 'PET_DENOISE'
  | 'PET_SUPER_RESOLUTION'
  | 'SPECT_TOMOGRAPHIC_DENOISE'
  | 'SPECT_PLANAR_DENOISE'
  | 'OTHER';

export type RequirementStatus =
  | 'pending'
  | 'processing'
  | 'waiting_user'
  | 'completed';

export type DatasetUploadType = 'initial' | 'supplement';

export type DatasetBatchStatus = 'uploaded' | 'parsed' | 'failed';

export type RequirementOssFileKind = 'dicom' | 'model';

export type RequirementOssFileStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'failed';

export interface CreateRequirementPayload {
  type: RequirementType;
  typeCustom: string | null;
  title: string;
  description: string;
  expectedGoal: string;
  remark?: string;
}

export interface RequirementListItem {
  id: string;
  type: RequirementType;
  title: string;
  status: RequirementStatus;
  patientCount: number;
  studyCount: number;
  seriesCount: number;
  createdAt: string;
  latestMessageAt: string | null;
  unreadNotificationCount: number;
  creator?: {
    id: string;
    username: string;
    hospitalName: string | null;
  };
  needsAdminReply?: boolean;
  pendingReplyMessageCount?: number;
}

export interface RequirementListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  type?: RequirementType;
  hospitalName?: string;
}

export interface RequirementDetail {
  id: string;
  type: RequirementType;
  typeCustom: string | null;
  title: string;
  description: string;
  status: RequirementStatus;
  createdAt: string;
  submittedAt: string | null;
  expectedGoal: string | null;
  remark: string | null;
  creator: {
    username: string;
    hospitalName: string | null;
    profile: {
      realName: string | null;
      department: string | null;
      title: string | null;
      email: string | null;
      phone: string | null;
      wechat: string | null;
    } | null;
  } | null;
  stats: {
    patientCount: number;
    studyCount: number;
    seriesCount: number;
  } | null;
  latestMessage: {
    sender: { username: string };
    content: string;
    createdAt: string;
  } | null;
  latestDelivery: {
    id: string;
    title: string;
    fileName: string | null;
    isFinal: boolean;
    createdAt: string;
  } | null;
}

export interface RequirementMessageItem {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    role: 'user' | 'admin';
    hospitalName: string | null;
  };
}

export interface RequirementSeriesNode {
  id: string;
  seriesUid: string;
  seriesDescription: string | null;
  bodyPart?: string | null;
  diagnosis?: string[] | null;
  clinicalTags?: string[] | null;
  annotationStatus?: string | null;
  hospitalName: string | null;
  remark: string | null;
  imageCount: number;
  uploadedAt: string | null;
  storagePath: string | null;
  datasetBatch: {
    id: string;
    batchNo: number;
    uploadType: string;
    sourceName: string | null;
  };
}

export interface RequirementStudyNode {
  id: string;
  studyUid: string;
  studyId?: string | null;
  studyDescription: string | null;
  modality: string | null;
  studyDate: string | null;
  manufacturer?: string | null;
  protocolName?: string | null;
  manufacturerModelName?: string | null;
  series: RequirementSeriesNode[];
}

export interface RequirementPatientNode {
  id: string;
  patientUid: string;
  patientId: string | null;
  patientName: string | null;
  sex: string | null;
  birthday?: string | null;
  imageCount: number;
  studies: RequirementStudyNode[];
}

export interface RequirementDataTree {
  requirementId?: string;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  patients: RequirementPatientNode[];
}

export interface RequirementSeriesFile {
  name: string;
  size: number;
  url: string;
}

export interface RequirementSeriesPreviewItem {
  id: string;
  seriesUid: string;
  seriesDescription: string | null;
  hospitalName: string | null;
  remark: string | null;
  uploadedAt: string | null;
  imageCount: number;
  files: RequirementSeriesFile[];
  datasetBatch: {
    id: string;
    batchNo: number;
    uploadType: string;
    sourceName: string | null;
  };
}

export interface RequirementPreviewPayload {
  target:
    | {
        type: 'study';
        id: string;
        studyUid: string;
        studyId: string | null;
        modality: string | null;
        studyDate: string | null;
        studyDescription: string | null;
        patient: {
          id: string;
          patientUid: string;
          patientId: string | null;
          patientName: string | null;
        };
      }
    | {
        type: 'series';
        id: string;
        seriesUid: string;
        seriesDescription: string | null;
        study: {
          id: string;
          studyUid: string;
          studyId: string | null;
          studyDescription: string | null;
        };
      };
  series: RequirementSeriesPreviewItem[];
}

export interface DatasetBatchItem {
  id: string;
  batchNo: number;
  uploadType: DatasetUploadType;
  sourceName: string | null;
  fileCount: number;
  totalBytes: number;
  requiresManualAnalysis: boolean;
  failedFileCount: number;
  status: DatasetBatchStatus;
  remark: string | null;
  modality: string | null;
  bodyPart: string | null;
  diagnosis: string[] | null;
  clinicalTags: string[] | null;
  annotationStatus: string | null;
  uploadedAt: string;
  uploader: {
    id: string;
    username: string;
  };
}

export interface FailedDatasetBatchFileItem {
  originalName: string;
  reason: string;
}

export interface DatasetBatchFailedFilesPayload {
  batchId: string;
  batchNo: number;
  fileCount: number;
  failedFileCount: number;
  status: DatasetBatchStatus;
  files: FailedDatasetBatchFileItem[];
}

export interface CreateDatasetBatchPayload {
  sourceName?: string;
  remark?: string;
  modality: string;
  bodyPart: string;
  diagnosis?: string[];
  clinicalTags?: string[];
  annotationStatus?: string;
  retryBatchId?: string;
  files: File[];
}

export interface UploadSessionItem {
  sessionId: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
  uploadedSize: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'consumed' | 'failed';
  errorMessage?: string | null;
}

export interface CreateUploadSessionPayload {
  fileName: string;
  relativePath: string;
  fileSize: number;
  mimeType?: string;
  lastModified?: number;
}

export interface CreateDatasetBatchFromSessionsPayload {
  sourceName?: string;
  remark?: string;
  modality: string;
  bodyPart: string;
  diagnosis?: string[];
  clinicalTags?: string[];
  annotationStatus?: string;
  retryBatchId?: string;
  sessionIds: string[];
}

export interface CreateDatasetBatchFromOssFilesPayload {
  sourceName?: string;
  remark?: string;
  modality: string;
  bodyPart: string;
  diagnosis?: string[];
  clinicalTags?: string[];
  annotationStatus?: string;
  retryBatchId?: string;
  fileIds: string[];
}

export interface DatasetBatchCommitResult {
  datasetBatchId: string;
  batchNo: number;
  status: string;
  fileCount: number;
  uploadedAt: string;
  requiresManualAnalysis: boolean;
}

export interface CreateRequirementOssFilePayload {
  kind: RequirementOssFileKind;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  modelName?: string;
  modelVersion?: string;
}

export interface RequirementOssFileUploadTicket {
  fileId: string;
  kind: RequirementOssFileKind;
  status: RequirementOssFileStatus;
  objectKey: string;
  bucketName: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

export interface ConfirmRequirementOssFileUploadPayload {
  etag?: string;
  fileSize?: number;
}

export interface RequirementOssFileItem {
  id: string;
  datasetBatchId: string | null;
  kind: RequirementOssFileKind;
  status: RequirementOssFileStatus;
  objectKey: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  etag: string | null;
  modelName: string | null;
  modelVersion: string | null;
  parsedObjectKey: string | null;
  parsedPayload: unknown;
  errorMessage: string | null;
  uploadCompletedAt: string | null;
  pulledToLocalAt: string | null;
  parsedAt: string | null;
  ossDeletedAt: string | null;
  ossDeleteError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementOssFileDownloadAuthorization {
  fileId: string;
  fileName: string;
  objectKey: string;
  url: string;
  expiresAt: string;
}

export interface RequirementDetailDataPullResult {
  startedBatchIds: string[];
  skippedBatchIds: string[];
  totalBytes: number;
  fileCount: number;
}

export interface RequirementDeliveryItem {
  id: string;
  title: string;
  description: string | null;
  fileName: string | null;
  isFinal: boolean;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    role: 'user' | 'admin';
  };
}

export interface CreateRequirementDeliveryPayload {
  title: string;
  description?: string;
  isFinal?: boolean;
  file: File;
}

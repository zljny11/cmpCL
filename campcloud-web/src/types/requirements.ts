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
  | 'completed'
  | 'rejected';

export interface CreateRequirementPayload {
  type: RequirementType;
  typeCustom: string | null;
  title: string;
  description: string;
  expectedGoal?: string;
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
}

export interface RequirementListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
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
    title: string;
    fileName: string | null;
    createdAt: string;
  } | null;
}

export interface RequirementSeriesNode {
  id: string;
  seriesUid: string;
  seriesDescription: string | null;
  imageCount: number;
  uploadedAt: string | null;
  datasetBatch: {
    batchNo: number;
    uploadType: string;
  };
}

export interface RequirementStudyNode {
  id: string;
  studyUid: string;
  studyDescription: string | null;
  modality: string | null;
  studyDate: string | null;
  series: RequirementSeriesNode[];
}

export interface RequirementPatientNode {
  id: string;
  patientUid: string;
  patientId: string | null;
  patientName: string | null;
  sex: string | null;
  imageCount: number;
  studies: RequirementStudyNode[];
}

export interface RequirementDataTree {
  patients: RequirementPatientNode[];
}

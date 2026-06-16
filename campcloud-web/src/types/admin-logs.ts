export type AdminLogCategory = 'auth' | 'user' | 'requirement' | 'data';
export type AdminLogResult = 'success' | 'failed';

export interface AdminLogItem {
  id: string;
  actorId: string | null;
  actorUsername: string;
  category: AdminLogCategory;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  result: AdminLogResult;
  detail: unknown;
  detailSummary: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminLogListQuery {
  page: number;
  pageSize: number;
  category?: AdminLogCategory;
  result?: AdminLogResult;
  keyword?: string;
}

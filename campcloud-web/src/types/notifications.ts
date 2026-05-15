import { RequirementStatus } from './requirements';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  requirement: {
    id: string;
    title: string;
    status: RequirementStatus;
  } | null;
}

export interface NotificationListQuery {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
}

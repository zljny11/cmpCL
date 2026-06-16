import { Tag } from 'antd';
import React from 'react';
import { RequirementStatus, RequirementType } from '../../../types/requirements';

const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  CT_SUPER_RESOLUTION: 'CT超高分辨率',
  CT_DENOISE: 'CT降噪',
  MR_SUPER_RESOLUTION: 'MR超分辨率',
  MR_DENOISE: 'MR降噪',
  PET_DENOISE: 'PET降噪',
  PET_SUPER_RESOLUTION: 'PET超分辨率',
  SPECT_TOMOGRAPHIC_DENOISE: 'SPECT断层显像降噪',
  SPECT_PLANAR_DENOISE: 'SPECT平面显像降噪',
  OTHER: '其他 / 自定义',
};

const REQUIREMENT_STATUS_CONFIG: Record<RequirementStatus, { label: string; color: string }> = {
  pending: { label: '待我响应', color: 'default' },
  processing: { label: '受理中（需等待）', color: 'processing' },
  waiting_user: { label: '受理中（需补充数据）', color: 'warning' },
  completed: { label: '已完成', color: 'success' },
};

export function renderRequirementType(type: string, typeCustom?: string | null): string {
  if (type === 'OTHER' && typeCustom) return typeCustom;
  return REQUIREMENT_TYPE_LABELS[type as RequirementType] ?? type;
}

export function renderRequirementStatus(status: string): React.ReactNode {
  const config = REQUIREMENT_STATUS_CONFIG[status as RequirementStatus];
  if (!config) return <Tag>{status}</Tag>;
  return <Tag color={config.color}>{config.label}</Tag>;
}

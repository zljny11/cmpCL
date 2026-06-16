// 影像模态选项
export const MODALITY_OPTIONS = [
  { value: 'CT', label: 'CT' },
  { value: 'MRI', label: 'MRI' },
  { value: 'X-ray', label: 'X-ray' },
  { value: 'US', label: '超声 (US)' },
  { value: 'PET-CT', label: 'PET-CT' },
  { value: 'Other', label: '其他' },
];

export const MODALITY_MAP: Record<string, string> = {
  CT: 'CT',
  MRI: 'MRI',
  'X-ray': 'X-ray',
  US: '超声 (US)',
  'PET-CT': 'PET-CT',
  Other: '其他',
};

// 检查部位选项
export const BODY_PART_OPTIONS = [
  { value: '胸部', label: '胸部' },
  { value: '腹部', label: '腹部' },
  { value: '头颅', label: '头颅' },
  { value: '盆腔', label: '盆腔' },
  { value: '四肢', label: '四肢' },
  { value: '脊柱', label: '脊柱' },
  { value: '其他', label: '其他' },
];

export const BODY_PART_MAP: Record<string, string> = {
  胸部: '胸部',
  腹部: '腹部',
  头颅: '头颅',
  盆腔: '盆腔',
  四肢: '四肢',
  脊柱: '脊柱',
  其他: '其他',
};

// 临床金标准选项
export const CLINICAL_TAG_OPTIONS = [
  { value: '已有病理结果', label: '已有病理结果' },
  { value: '包含生存期随访', label: '包含生存期随访' },
  { value: '纯影像诊断', label: '纯影像诊断' },
];

export const CLINICAL_TAG_MAP: Record<string, string> = {
  '已有病理结果': '已有病理结果',
  '包含生存期随访': '包含生存期随访',
  '纯影像诊断': '纯影像诊断',
};

// 标注状态选项
export const ANNOTATION_STATUS_OPTIONS = [
  { value: '原始未标注', label: '原始未标注' },
  { value: '专家已勾画ROI', label: '专家已勾画 ROI' },
];

export const ANNOTATION_STATUS_MAP: Record<string, string> = {
  '原始未标注': '原始未标注',
  '专家已勾画ROI': '专家已勾画 ROI',
};

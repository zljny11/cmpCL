import * as dicomParser from 'dicom-parser';

export interface DicomMetadata {
  modality?: string;
  bodyPart?: string;
  seriesDescription?: string;
  sliceThickness?: string;
  protocolName?: string;
  manufacturer?: string;
  manufacturerModelName?: string;
}

const INITIAL_DICOM_PROBE_BYTES = 256 * 1024;
const MAX_DICOM_PROBE_BYTES = 8 * 1024 * 1024;

// DICOM 标准值映射到前端选项值
const MODALITY_MAPPING: Record<string, string> = {
  'CT': 'CT',
  'MR': 'MRI',
  'US': 'US',
  'XC': 'X-ray',
  'XA': 'X-ray',
  'CR': 'X-ray',
  'MG': 'X-ray',
  'PET': 'PET-CT',
};

const BODY_PART_MAPPING: Record<string, string> = {
  'CHEST': '胸部',
  'THORAX': '胸部',
  'ABDOMEN': '腹部',
  'PELVIS': '盆腔',
  'BRAIN': '头颅',
  'HEAD': '头颅',
  'SPINE': '脊柱',
  'EXTREMITY': '四肢',
  'SHOULDER': '四肢',
  'ARM': '四肢',
  'LEG': '四肢',
  'KNEE': '四肢',
};

function mapModality(dicomModality?: string): string | undefined {
  if (!dicomModality) return undefined;
  const upper = dicomModality.toUpperCase().trim();
  return MODALITY_MAPPING[upper] || 'Other';
}

function mapBodyPart(dicomBodyPart?: string): string | undefined {
  if (!dicomBodyPart) return undefined;
  const upper = dicomBodyPart.toUpperCase().trim();
  return BODY_PART_MAPPING[upper] || dicomBodyPart.trim();
}

function readTrimmedString(dataset: dicomParser.DataSet, tag: string): string | undefined {
  try {
    const value = dataset.string(tag)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function extractDicomMetadata(dataset: dicomParser.DataSet): DicomMetadata {
  const rawModality = readTrimmedString(dataset, 'x00080060');
  const rawBodyPart = readTrimmedString(dataset, 'x00180015');

  return {
    modality: mapModality(rawModality),
    bodyPart: mapBodyPart(rawBodyPart),
    seriesDescription: readTrimmedString(dataset, 'x0008103e'),
    sliceThickness: readTrimmedString(dataset, 'x00180050'),
    protocolName: readTrimmedString(dataset, 'x00181030'),
    manufacturer: readTrimmedString(dataset, 'x00080070'),
    manufacturerModelName: readTrimmedString(dataset, 'x00081090'),
  };
}

export function parseDicomArrayBuffer(arrayBuffer: ArrayBuffer): DicomMetadata {
  const byteArray = new Uint8Array(arrayBuffer);
  const dataset = dicomParser.parseDicom(byteArray);
  return extractDicomMetadata(dataset);
}

export async function parseDicomFile(file: File): Promise<DicomMetadata> {
  const maxProbeBytes = Math.min(file.size, MAX_DICOM_PROBE_BYTES);
  let targetSize = Math.min(maxProbeBytes, INITIAL_DICOM_PROBE_BYTES);

  while (targetSize > 0 && targetSize <= maxProbeBytes) {
    try {
      const arrayBuffer = await file.slice(0, targetSize).arrayBuffer();
      return parseDicomArrayBuffer(arrayBuffer);
    } catch {
      if (targetSize >= maxProbeBytes) {
        return {};
      }
      targetSize = Math.min(maxProbeBytes, targetSize * 2);
    }
  }

  return {};
}

export async function findAndParseDicomInFiles(files: File[]): Promise<DicomMetadata> {
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.dcm')) {
      const metadata = await parseDicomFile(file);
      if (metadata.modality || metadata.bodyPart) {
        return metadata;
      }
    }
  }

  for (const file of files) {
    if (!file.name.startsWith('.')) {
      const metadata = await parseDicomFile(file);
      if (metadata.modality || metadata.bodyPart) {
        return metadata;
      }
    }
  }

  return {};
}

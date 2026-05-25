import * as dicomParser from 'dicom-parser';

export interface DicomMetadata {
  modality?: string;
  bodyPart?: string;
  seriesDescription?: string;
  sliceThickness?: string;
}

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
  return BODY_PART_MAPPING[upper] || '其他';
}

export function parseDicomFile(file: File): Promise<DicomMetadata> {
  return new Promise((resolve) => {
    console.log('[parseDicomFile] Reading file:', file.name, 'size:', file.size);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const byteArray = new Uint8Array(arrayBuffer);
        console.log('[parseDicomFile] Buffer ready, trying to parse...');
        const dataset = dicomParser.parseDicom(byteArray);

        const metadata: DicomMetadata = {};

        try {
          const rawModality = dataset.string('x00080060');
          metadata.modality = mapModality(rawModality);
          console.log('[parseDicomFile] modality: raw=', rawModality, 'mapped=', metadata.modality);
        } catch (e) {
          console.log('[parseDicomFile] Failed to get modality:', e);
        }

        try {
          const rawBodyPart = dataset.string('x00180015');
          metadata.bodyPart = mapBodyPart(rawBodyPart);
          console.log('[parseDicomFile] bodyPart: raw=', rawBodyPart, 'mapped=', metadata.bodyPart);
        } catch (e) {
          console.log('[parseDicomFile] Failed to get bodyPart:', e);
        }

        try {
          const seriesDesc = dataset.string('x0008103e');
          metadata.seriesDescription = seriesDesc?.trim();
        } catch (e) {
          //
        }

        try {
          const thickness = dataset.string('x00180050');
          metadata.sliceThickness = thickness?.trim();
        } catch (e) {
          //
        }

        console.log('[parseDicomFile] Final metadata:', metadata);
        resolve(metadata);
      } catch (error) {
        console.log('[parseDicomFile] Parse error:', error);
        resolve({});
      }
    };
    reader.onerror = () => {
      console.log('[parseDicomFile] FileReader error');
      resolve({});
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function findAndParseDicomInFiles(files: File[]): Promise<DicomMetadata> {
  console.log('[findAndParseDicomInFiles] Scanning', files.length, 'files for DICOM');

  for (const file of files) {
    console.log('[findAndParseDicomInFiles] Checking file:', file.name);
    // 先检查 .dcm 扩展名
    if (file.name.toLowerCase().endsWith('.dcm')) {
      console.log('[findAndParseDicomInFiles] Found .dcm file, parsing:', file.name);
      const metadata = await parseDicomFile(file);
      if (metadata.modality || metadata.bodyPart) {
        console.log('[findAndParseDicomInFiles] Successfully parsed, returning metadata:', metadata);
        return metadata;
      }
    }
  }

  // 如果没有找到 .dcm 文件，尝试无扩展名限制的解析
  console.log('[findAndParseDicomInFiles] No .dcm files found with metadata, trying all files');
  for (const file of files) {
    if (!file.name.startsWith('.')) {
      console.log('[findAndParseDicomInFiles] Trying (no ext check):', file.name);
      const metadata = await parseDicomFile(file);
      if (metadata.modality || metadata.bodyPart) {
        console.log('[findAndParseDicomInFiles] Found metadata (no ext check):', metadata);
        return metadata;
      }
    }
  }

  console.log('[findAndParseDicomInFiles] No DICOM metadata found in any file');
  return {};
}


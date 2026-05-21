import { requirementsApi } from '../../../../services/api/requirements';

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(objectUrl);
}

function sanitizeZipName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || fallback;
}

export async function downloadRequirementDicomZip(seriesIds: string[], fileNameSeed: string) {
  const blob = await requirementsApi.downloadViewerSeries(seriesIds);
  triggerDownload(blob, `${sanitizeZipName(fileNameSeed, 'dicom_series')}.zip`);
}

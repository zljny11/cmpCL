import { downloadViaBrowser, sanitizeDownloadFileName } from '../../../../utils/browser-download';

export async function downloadRequirementDicomZip(seriesIds: string[], fileNameSeed: string) {
  await downloadViaBrowser({
    path: '/downloadSeries',
    method: 'POST',
    body: JSON.stringify({ seriesIds }),
    headers: {
      'Content-Type': 'application/json',
    },
    fileName: `${sanitizeDownloadFileName(fileNameSeed, 'dicom_series')}.zip`,
    onProgress: undefined,
  });
}

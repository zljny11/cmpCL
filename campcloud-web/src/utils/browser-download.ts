import { appConfig } from '../app/config/env';
import { getToken } from '../services/http';

type DownloadRequestOptions = {
  body?: BodyInit;
  fileName: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  onProgress?: (progress: { loaded: number; total: number | null; percent: number | null }) => void;
  path: string;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (chunk: BufferSource | Blob | string) => Promise<void>;
      close: () => Promise<void>;
      abort: (reason?: unknown) => Promise<void>;
    }>;
  }>;
};

function buildApiUrl(path: string) {
  const normalizedBase = appConfig.apiBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(objectUrl);
}

export async function downloadViaBrowser(options: DownloadRequestOptions) {
  const token = getToken();
  const response = await fetch(buildApiUrl(options.path), {
    method: options.method ?? 'GET',
    body: options.body,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = `下载失败（${response.status}）`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;
  const stream = response.body;
  const pickerWindow = window as SaveFilePickerWindow;

  if (stream && pickerWindow.showSaveFilePicker) {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: options.fileName,
    });
    const writable = await handle.createWritable();
    const reader = stream.getReader();
    let loaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        await writable.write(value);
        loaded += value.byteLength;
        options.onProgress?.({
          loaded,
          total,
          percent: total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null,
        });
      }
      await writable.close();
      return;
    } catch (error) {
      await writable.abort(error);
      throw error;
    }
  }

  const blob = await response.blob();
  options.onProgress?.({
    loaded: blob.size,
    total: total ?? blob.size,
    percent: 100,
  });
  triggerBlobDownload(blob, options.fileName);
}

export function sanitizeDownloadFileName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || fallback;
}

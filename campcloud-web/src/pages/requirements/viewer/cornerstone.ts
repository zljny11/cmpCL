import { init as initCore } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { addTool, init as initTools, PanTool, StackScrollTool, WindowLevelTool, ZoomTool } from '@cornerstonejs/tools';
import { getToken } from '../../../services/http';

let initialized = false;
let wadouriLoadImagePatched = false;
let toolsRegistered = false;

export async function ensureCornerstoneInitialized() {
  if (initialized) {
    return;
  }

  await initCore();

  dicomImageLoader.init({
    maxWebWorkers: typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.max(1, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)))
      : 1,
    beforeSend: async (_xhr, _imageId, headers) => {
      const token = getToken();
      return token
        ? {
            ...headers,
            Authorization: `Bearer ${token}`,
          }
        : headers;
    },
  });

  await initTools();

  if (!wadouriLoadImagePatched) {
    const originalLoadImage = dicomImageLoader.wadouri.loadImage.bind(dicomImageLoader.wadouri);
    dicomImageLoader.wadouri.loadImage = (imageId, options = {}) =>
      originalLoadImage(imageId, {
        ...options,
        preScale: {
          ...(options.preScale ?? {}),
          enabled: false,
        },
      });
    wadouriLoadImagePatched = true;
  }

  if (!toolsRegistered) {
    addTool(PanTool);
    addTool(ZoomTool);
    addTool(WindowLevelTool);
    addTool(StackScrollTool);
    toolsRegistered = true;
  }

  initialized = true;
}

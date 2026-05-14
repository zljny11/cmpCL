import registerMetadataProvider from './initProviders';
import initVolumeLoader from './initVolumeLoader';
import { init as csCoreInit } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { getToken } from '../../../../services/http';

let initPromise;
let wadouriLoadImagePatched = false;

export default async function initDemo() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await csCoreInit();
    dicomImageLoader.init({
      maxWebWorkers:
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
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

    initVolumeLoader();
    registerMetadataProvider();
  });

  return initPromise;
}

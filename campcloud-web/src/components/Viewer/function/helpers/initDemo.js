import registerMetadataProvider from './initProviders';
import initVolumeLoader from './initVolumeLoader';
import { init as csCoreInit, getConfiguration } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { init as csToolsInit } from '@cornerstonejs/tools';
import { ensureCornerstoneTooling } from '../cornerstoneAddTools';

let initPromise;
let wadouriLoadImagePatched = false;

export default async function initDemo() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await csCoreInit();
    await csToolsInit();

    const { preferSizeOverAccuracy, useNorm16Texture } = getConfiguration().rendering;

    dicomImageLoader.init({
      maxWebWorkers:
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? Math.max(1, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)))
          : 1,
      startWebWorkersOnDemand: false,
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: false,
          strict: false,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
            use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
          },
        },
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
    ensureCornerstoneTooling();
  })();

  return initPromise;
}



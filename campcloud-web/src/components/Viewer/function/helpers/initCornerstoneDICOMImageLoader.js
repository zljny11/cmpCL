import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;

export default function initCornerstoneDICOMImageLoader() {
  // @cornerstonejs/dicom-image-loader v4 不再需要设置 external.cornerstone / external.dicomParser，
  // cornerstone 集成和 worker 初始化均已由 initDemo.js 中的 dicomImageLoader.init() 统一处理。
}


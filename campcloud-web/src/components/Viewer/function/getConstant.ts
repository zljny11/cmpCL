// @ts-nocheck
const renderingEngineId = "PACSRenderingEngine";
const renderingEngineId_Stack = "PACSRenderingEngine_Stack";

const volumeLoaderScheme = "cornerstoneStreamingImageVolume"; // Loader id which defines which volume loader to use
const VOLUME_NAME = "VOLUME_NAME";
const VOLUME_ID = `${volumeLoaderScheme}:${VOLUME_NAME}`; // VolumeId with loader id + volume id

const MPR_VIEWPORTIDS = [
  "AXIALVIEWPORTS",
  "CORONALVIEWPORTS",
  "SAGITTALVIEWPORTS",
  "MIPVIEWPORTS",
];

const TooltipOverlayInnerStyle = {
  backgroundColor: "#000",
  border: "1px solid #0069a7",
};

export {
  renderingEngineId,
  renderingEngineId_Stack,
  VOLUME_ID,
  MPR_VIEWPORTIDS,
  TooltipOverlayInnerStyle,
};

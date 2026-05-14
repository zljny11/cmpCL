// @ts-nocheck
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  VolumeToolGroup,
  StackToolGroup,
  MipToolGroup,
  ToolGroupSetToolActive,
  setUpSynchronizers,
  removeSynchronizers,
  setToolPassiveFun,
} from "./cornerstoneAddTools";
import calculateSUV from "./calculateSUV";
import addResizeObserver from "./resizeObserver";
import getElementGridIndex from "./getElementGridIndex";
import axiosInstances from "../../../axiosInstance";
import { SeriesData } from "../../../types";

const { Enums: csToolsEnums } = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = "PACSRenderingEngine";
const renderingEngineId_Stack = "PACSRenderingEngine_Stack";

const volumeLoaderScheme = "cornerstoneStreamingImageVolume"; // Loader id which defines which volume loader to use
const VOLUME_NAME = "VOLUME_NAME: ";
const VOLUME_ID = `${volumeLoaderScheme}:${VOLUME_NAME}`; // VolumeId with loader id + volume id

const TooltipOverlayInnerStyle = {
  backgroundColor: "#000",
  border: "1px solid #0069a7",
};

const generateViewportIds = (rows: number, columns: number) => {
  const viewportIds = [];
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= columns; j++) {
      viewportIds.push(`viewport${i}_${j}`);
    }
  }
  return viewportIds;
};

const getImageDatas = async (records: any[], apiId: number): Promise<SeriesData[]> => {
  const { patientId } = records[0];
  const uids = records.map(e => e.seriesUID);
  const seriesIds = records.map(e => e.seriesId);
  // console.log(records);
  // const response = await axiosInstances[apiId].post("/getImageIdsArr", { patientId });
  const response = await axiosInstances[apiId].post("/getImgIdArr", { patientId, seriesUIDs: uids, seriesIds });
  const ImageIdsArr = response.data as string[][];
  return ImageIdsArr.map((ImageIds, index) => ({ volumeId: VOLUME_ID + records[index].seriesUID, ImageIds, ...records[index] }))
};

const switchTool = (
  curTool: string,
  setCurTool: React.Dispatch<React.SetStateAction<string>>,
  CornerstoneTool: any
) => {
  [StackToolGroup, VolumeToolGroup, MipToolGroup].forEach((toolGroup) => {
    toolGroup.setToolPassive(curTool);

    toolGroup.setToolActive(CornerstoneTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
    setCurTool(CornerstoneTool.toolName);
  });
};

const resetTools = () => {
  removeSynchronizers(renderingEngineId, []);
  setToolPassiveFun(StackToolGroup);
  setToolPassiveFun(VolumeToolGroup);
};

export {
  VolumeToolGroup,
  StackToolGroup,
  MipToolGroup,
  ToolGroupSetToolActive,
  setUpSynchronizers,
  removeSynchronizers,
  setToolPassiveFun,
  calculateSUV,
  addResizeObserver,
  getElementGridIndex,
  generateViewportIds,
  getImageDatas,
  switchTool,
  resetTools,
  renderingEngineId,
  renderingEngineId_Stack,
  VOLUME_ID,
  TooltipOverlayInnerStyle,
};

// @ts-nocheck
import {
  getRenderingEngine,
  StackViewport,
  Enums,
  VolumeViewport,
  Types,
} from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { utilities } from '@cornerstonejs/core';

const {
  Enums: csToolsEnums,
  ToolGroupManager,
  StackScrollTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ArrowAnnotateTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  DragProbeTool,
  CrosshairsTool,
  MIPJumpToClickTool,
  VolumeRotateTool,
  TrackballRotateTool,
  synchronizers,
  SynchronizerManager,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { createCameraPositionSynchronizer } = synchronizers;
const { createSynchronizer, getSynchronizer } = SynchronizerManager;
const { jumpToSlice } = utilities;

const VolumeToolGroupId = "VOLUMETOOLGROUP_ID";
const StackToolGroupId = "STACKTOOLGROUP_ID";
const MipToolGroupId = "MIPTOOLGROUP_ID";

let toolsInitialized = false;

let VolumeToolGroup;
let StackToolGroup;
let MipToolGroup;

const registerTools = () => {
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(DragProbeTool);
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(MIPJumpToClickTool);
  cornerstoneTools.addTool(VolumeRotateTool);
  cornerstoneTools.addTool(TrackballRotateTool);
};

// CrosshairsTool 工具所需配置
/* const viewportColors = {
  [MPR_VIEWPORTIDS[0]]: "rgb(200, 0, 0)",
  [MPR_VIEWPORTIDS[1]]: "rgb(200, 200, 0)",
  [MPR_VIEWPORTIDS[2]]: "rgb(0, 200, 0)",
};
const viewportReferenceLineControllable = [
  MPR_VIEWPORTIDS[0],
  MPR_VIEWPORTIDS[1],
  MPR_VIEWPORTIDS[2],
];
const viewportReferenceLineDraggableRotatable = [
  MPR_VIEWPORTIDS[0],
  MPR_VIEWPORTIDS[1],
  MPR_VIEWPORTIDS[2],
];
const viewportReferenceLineSlabThicknessControlsOn = [
  MPR_VIEWPORTIDS[0],
  MPR_VIEWPORTIDS[1],
  MPR_VIEWPORTIDS[2],
]; */

/* function getReferenceLineColor(viewportId: string) {
  return viewportColors[viewportId];
}
function getReferenceLineControllable(viewportId: string) {
  const index = viewportReferenceLineControllable.indexOf(viewportId);
  return index !== -1;
}
function getReferenceLineDraggableRotatable(viewportId: string) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId);
  return index !== -1;
}
function getReferenceLineSlabThicknessControlsOn(viewportId: string) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
  return index !== -1;
} */

const setToolPassiveFun = (ToolGroup: cornerstoneTools.Types.IToolGroup) => {
  ToolGroup.setToolPassive(ZoomTool.toolName);
  ToolGroup.setToolPassive(PanTool.toolName);
  ToolGroup.setToolPassive(WindowLevelTool.toolName);
  ToolGroup.setToolPassive(DragProbeTool.toolName);

  // // 如果不是mip的工具组，则Passive所有的测量工具
  // if (ToolGroup.id !== MipToolGroupId) {
  //   ToolGroup.setToolPassive(LengthTool.toolName);
  //   ToolGroup.setToolPassive(RectangleROITool.toolName);
  //   ToolGroup.setToolPassive(EllipticalROITool.toolName);
  //   ToolGroup.setToolPassive(CircleROITool.toolName);
  //   ToolGroup.setToolPassive(BidirectionalTool.toolName);
  //   ToolGroup.setToolPassive(AngleTool.toolName);
  //   ToolGroup.setToolPassive(CobbAngleTool.toolName);
  //   ToolGroup.setToolPassive(ArrowAnnotateTool.toolName);
  // }
};

const MipToolGroupAddTool = () => {
  MipToolGroup.addTool("VolumeRotateMouseWheel");
  MipToolGroup.addTool("MIPJumpToClickTool", {
    toolGroupId: VolumeToolGroupId,
  });
  MipToolGroup.addTool(TrackballRotateTool.toolName);
  MipToolGroup.addTool(WindowLevelTool.toolName);
  MipToolGroup.addTool(ZoomTool.toolName);
  MipToolGroup.addTool(PanTool.toolName);
  MipToolGroup.addTool(DragProbeTool.toolName);
  MipToolGroup.addTool(StackScrollTool.toolName);
};

const getToolGroups = () => [VolumeToolGroup, StackToolGroup].filter(Boolean);

const configureToolGroups = () => {
  const ToolGroups = getToolGroups();
  ToolGroups.forEach((ToolGroup) => {
    ToolGroup.addTool(StackScrollTool.toolName);
    ToolGroup.addTool(WindowLevelTool.toolName);
    ToolGroup.addTool(ZoomTool.toolName);
    ToolGroup.addTool(PanTool.toolName);
    ToolGroup.addTool(DragProbeTool.toolName);
    setToolPassiveFun(ToolGroup);
  });

  MipToolGroupAddTool();
};

const createToolGroups = () => {
  VolumeToolGroup = ToolGroupManager.getToolGroup(VolumeToolGroupId) ?? ToolGroupManager.createToolGroup(VolumeToolGroupId);
  StackToolGroup = ToolGroupManager.getToolGroup(StackToolGroupId) ?? ToolGroupManager.createToolGroup(StackToolGroupId);
  MipToolGroup = ToolGroupManager.getToolGroup(MipToolGroupId) ?? ToolGroupManager.createToolGroup(MipToolGroupId);
};

const ensureCornerstoneTooling = () => {
  if (toolsInitialized) {
    return;
  }

  registerTools();
  createToolGroups();
  configureToolGroups();
  toolsInitialized = true;
};

// VolumeToolGroup、StackToolGroup、MipToolGroup 的通用 SetToolActive 函数
const ToolGroupSetToolActive = () => {
  ensureCornerstoneTooling();

  // VolumeToolGroup、StackToolGroup    SetToolActive
  getToolGroups().forEach((ToolGroup) => {
    ToolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] });
    ToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    ToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
    ToolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }],
    });
  });

  MipToolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  MipToolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  MipToolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  MipToolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  MipToolGroup.setToolActive("VolumeRotateMouseWheel");
};

/**
 * 同步功能
 */
const in_out_cameraSynchronizerId_Volume =
  "IN_OUT_CAMERAPOSITION_SYNCHRONIZER_ID_VOLUME";
const in_out_cameraSynchronizerId_Stack =
  "IN_OUT_CAMERAPOSITION_SYNCHRONIZER_ID_STACK";
const in_out_VoiSynchronizerId = "IN_OUT_VOI_SYNCHRONIZER_ID";

// 强行让VOI的synchronizer不执行volume的模式
const voiSyncCallback = (
  synchronizerInstance,
  sourceViewport,
  targetViewport,
  voiModifiedEvent
) => {
  const eventDetail = voiModifiedEvent.detail;
  const { volumeId, range } = eventDetail;

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  if (tViewport instanceof VolumeViewport) {
    tViewport.setProperties({
      voiRange: range,
    });
  } else if (tViewport instanceof StackViewport) {
    tViewport.setProperties({
      voiRange: range,
    });
  } else {
    throw new Error("Viewport type not supported.");
  }

  tViewport.render();
};
// 专属于Stack的同步回调函数
const stackCameraSyncCallback = (
  synchronizerInstance: cornerstoneTools.Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent: CustomEvent
): void => {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const sViewport = renderingEngine.getViewport(
    sourceViewport.viewportId
  ) as Types.IStackViewport;
  const tViewport = renderingEngine.getViewport(
    targetViewport.viewportId
  ) as Types.IStackViewport;

  const currentIndex = sViewport.getCurrentImageIdIndex();
  jumpToSlice(tViewport.element, {
    imageIndex: currentIndex,
  });
};
// 获取所有的同步器，并支持没有对应同步器时创建同步器
const getSynchronizers = (renderingEngineId: string) => {
  const isVolume = renderingEngineId.includes("volume");
  const in_out_cameraSynchronizerId = isVolume
    ? in_out_cameraSynchronizerId_Volume
    : in_out_cameraSynchronizerId_Stack;
  let in_out_voi_Synchronizer = getSynchronizer(
    in_out_VoiSynchronizerId
  ) as cornerstoneTools.Synchronizer;
  let in_out_camera_Synchronizer = getSynchronizer(
    in_out_cameraSynchronizerId
  ) as cornerstoneTools.Synchronizer;

  if (!in_out_voi_Synchronizer) {
    in_out_voi_Synchronizer = createSynchronizer(
      in_out_VoiSynchronizerId,
      Enums.Events.VOI_MODIFIED,
      voiSyncCallback
    );
  }
  if (!in_out_camera_Synchronizer) {
    in_out_camera_Synchronizer = isVolume
      ? createCameraPositionSynchronizer(in_out_cameraSynchronizerId)
      : createSynchronizer(
        in_out_cameraSynchronizerId,
        Enums.Events.CAMERA_MODIFIED,
        stackCameraSyncCallback
      );
  }

  return [in_out_voi_Synchronizer, in_out_camera_Synchronizer];
};
const setUpSynchronizers = (
  renderingEngineId: string,
  viewportIds: string[]
) => {
  ensureCornerstoneTooling();
  const synchronizers = getSynchronizers(renderingEngineId);
  synchronizers.forEach((in_out_Synchronizer) => {
    viewportIds.forEach((viewportId) => {
      in_out_Synchronizer.add({
        renderingEngineId,
        viewportId,
      });
    });
  });
};
const removeSynchronizers = (
  renderingEngineId: string,
  viewportIds: string[]
) => {
  ensureCornerstoneTooling();
  const synchronizers = getSynchronizers(renderingEngineId);

  synchronizers.forEach((in_out_Synchronizer) => {
    viewportIds.forEach((viewportId) => {
      in_out_Synchronizer.remove({
        renderingEngineId,
        viewportId,
      });
    });
  });
};

export {
  ensureCornerstoneTooling,
  VolumeToolGroup,
  StackToolGroup,
  MipToolGroup,
  ToolGroupSetToolActive,
  setUpSynchronizers,
  removeSynchronizers,
  setToolPassiveFun,
};

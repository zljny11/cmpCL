import { init as csCoreInit } from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  DragProbeTool,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import dicomLoaderInit from '@cornerstonejs/dicom-image-loader';
import { getToken } from '../../../services/http';

export const RENDERING_ENGINE_ID = 'AICampCloud_VIEWER_ENGINE';
export const STACK_TOOL_GROUP_ID = 'AICampCloud_VIEWER_STACK_TOOL_GROUP';
export const VOLUME_TOOL_GROUP_ID = 'AICampCloud_VIEWER_VOLUME_TOOL_GROUP';

export const WW_WL_PRESETS = [
  { label: 'Abdomen', value: { lower: 60, upper: 400 } },
  { label: 'Angio', value: { lower: 300, upper: 600 } },
  { label: 'Bone', value: { lower: 300, upper: 1500 } },
  { label: 'Brain', value: { lower: 40, upper: 80 } },
  { label: 'Chest', value: { lower: 40, upper: 400 } },
  { label: 'Lung', value: { lower: -400, upper: 1500 } },
] as const;

export const TOOL_NAMES = {
  WindowLevel: WindowLevelTool.toolName,
  Zoom: ZoomTool.toolName,
  Pan: PanTool.toolName,
  Probe: DragProbeTool.toolName,
} as const;

export type ToolKey = keyof typeof TOOL_NAMES;

let initPromise: Promise<void> | null = null;

function instrumentWorker() {
  const flag = window as Window & { __ccWorkerInstrumented?: boolean };
  if (flag.__ccWorkerInstrumented) return;
  flag.__ccWorkerInstrumented = true;

  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(url: string | URL, opts?: WorkerOptions) {
      const urlStr = String(url);
      console.log('[viewer] Worker created:', urlStr.slice(-60), opts);
      super(url, opts);

      const origPost = this.postMessage.bind(this);
      this.postMessage = (msg: unknown, transferOrOpts?: unknown) => {
        console.log('[viewer] main→worker:', JSON.stringify(msg)?.slice(0, 120));
        origPost(msg, transferOrOpts as never);
      };

      this.addEventListener('message', (e) => {
        console.log('[viewer] worker→main:', JSON.stringify((e as MessageEvent).data)?.slice(0, 120));
      });

      this.addEventListener('error', (e) => {
        console.error('[viewer] Worker error:', urlStr.slice(-60), e.message, e.filename, e.lineno);
      });

      this.addEventListener('messageerror', (e) => {
        console.error('[viewer] Worker messageerror:', urlStr.slice(-60), e);
      });
    }
  } as typeof Worker;
}

function ensureToolGroup(toolGroupId: string) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (toolGroup) return toolGroup;

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(DragProbeTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
  });

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
  });

  return toolGroup;
}

export function ensureCornerstoneReady(): Promise<void> {
  if (!initPromise) {
    instrumentWorker();
    initPromise = (async () => {
      await csCoreInit();
      await csToolsInit();

      dicomLoaderInit.init({
        maxWebWorkers: Math.min(navigator.hardwareConcurrency || 1, 4),
        beforeSend: (_xhr: XMLHttpRequest, _imageId: string, defaultHeaders: Record<string, string>) => {
          const token = getToken();
          const headers = { ...defaultHeaders };
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          return headers;
        },
        errorInterceptor: (error: unknown) => {
          console.error('[viewer] dicom image load error:', error);
        },
      });

      addTool(WindowLevelTool);
      addTool(ZoomTool);
      addTool(PanTool);
      addTool(DragProbeTool);
      addTool(StackScrollTool);

      ensureToolGroup(STACK_TOOL_GROUP_ID);
      ensureToolGroup(VOLUME_TOOL_GROUP_ID);
    })();
  }

  return initPromise;
}

export function attachViewportToToolGroup(
  toolGroupId: typeof STACK_TOOL_GROUP_ID | typeof VOLUME_TOOL_GROUP_ID,
  viewportId: string,
) {
  const targetGroup = ensureToolGroup(toolGroupId);
  const otherGroup = ToolGroupManager.getToolGroup(
    toolGroupId === STACK_TOOL_GROUP_ID ? VOLUME_TOOL_GROUP_ID : STACK_TOOL_GROUP_ID,
  );

  otherGroup?.removeViewports(RENDERING_ENGINE_ID, viewportId);
  targetGroup.addViewport(viewportId, RENDERING_ENGINE_ID);
}

export function detachViewportFromToolGroups(viewportId: string) {
  ToolGroupManager.getToolGroup(STACK_TOOL_GROUP_ID)?.removeViewports(RENDERING_ENGINE_ID, viewportId);
  ToolGroupManager.getToolGroup(VOLUME_TOOL_GROUP_ID)?.removeViewports(RENDERING_ENGINE_ID, viewportId);
}

export function setActivePrimaryTool(tool: ToolKey) {
  const toolName = TOOL_NAMES[tool];

  [STACK_TOOL_GROUP_ID, VOLUME_TOOL_GROUP_ID].forEach((groupId) => {
    const toolGroup = ToolGroupManager.getToolGroup(groupId);
    if (!toolGroup) return;

    [WindowLevelTool.toolName, ZoomTool.toolName, PanTool.toolName, DragProbeTool.toolName].forEach((name) => {
      toolGroup.setToolPassive(name);
    });

    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
  });
}

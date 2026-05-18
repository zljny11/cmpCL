import { init as csCoreInit } from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  ToolGroupManager,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import dicomLoaderInit from '@cornerstonejs/dicom-image-loader';
import { getToken } from '../../../services/http';

export const TOOL_GROUP_ID = 'CAMPCLOUD_VIEWER_TOOL_GROUP';
export const RENDERING_ENGINE_ID = 'CAMPCLOUD_RENDERING_ENGINE';
export const VIEWPORT_ID = 'CAMPCLOUD_STACK_VIEWPORT';

export const TOOLS = {
  WindowLevel: WindowLevelTool.toolName,
  Zoom: ZoomTool.toolName,
  Pan: PanTool.toolName,
} as const;

export type ToolKey = keyof typeof TOOLS;

let initPromise: Promise<void> | null = null;

function instrumentWorker() {
  if ((window as unknown as { __ccWorkerInstrumented?: boolean }).__ccWorkerInstrumented) return;
  (window as unknown as { __ccWorkerInstrumented?: boolean }).__ccWorkerInstrumented = true;
  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(url: string | URL, opts?: WorkerOptions) {
      const urlStr = String(url);
      // eslint-disable-next-line no-console
      console.log('[viewer] Worker created:', urlStr.slice(-60), opts);
      super(url, opts);

      // intercept main → worker
      const origPost = this.postMessage.bind(this);
      this.postMessage = (msg: unknown, transferOrOpts?: unknown) => {
        // eslint-disable-next-line no-console
        console.log('[viewer] main→worker:', JSON.stringify(msg)?.slice(0, 120));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        origPost(msg, transferOrOpts as any);
      };

      // intercept worker → main
      this.addEventListener('message', (e) => {
        // eslint-disable-next-line no-console
        console.log('[viewer] worker→main:', JSON.stringify((e as MessageEvent).data)?.slice(0, 120));
      });

      this.addEventListener('error', (e) => {
        // eslint-disable-next-line no-console
        console.error('[viewer] Worker error:', urlStr.slice(-60), e.message, e.filename, e.lineno);
      });
      this.addEventListener('messageerror', (e) => {
        // eslint-disable-next-line no-console
        console.error('[viewer] Worker messageerror:', urlStr.slice(-60), e);
      });
    }
  } as typeof Worker;
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
          const headers: Record<string, string> = { ...defaultHeaders };
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          return headers;
        },
        errorInterceptor: (error: unknown) => {
          // eslint-disable-next-line no-console
          console.error('[viewer] dicom image load error:', error);
        },
      });

      addTool(WindowLevelTool);
      addTool(ZoomTool);
      addTool(PanTool);
      addTool(StackScrollTool);

      let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!;
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(PanTool.toolName);
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
      }
    })();
  }
  return initPromise;
}

export function setActivePrimaryTool(tool: ToolKey) {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) return;

  ([WindowLevelTool.toolName, ZoomTool.toolName, PanTool.toolName] as const).forEach((name) => {
    toolGroup.setToolPassive(name);
  });

  toolGroup.setToolActive(TOOLS[tool], {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
  });
}

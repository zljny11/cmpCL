// @ts-nocheck
import { getRenderingEngine } from "@cornerstonejs/core";

const addResizeObserver = (renderingEngineId: string) => {
  return new ResizeObserver(() => {
    const renderingEngine = getRenderingEngine(renderingEngineId);

    if (renderingEngine) {
      renderingEngine.resize(true, true);
    }
  });
};

export default addResizeObserver;

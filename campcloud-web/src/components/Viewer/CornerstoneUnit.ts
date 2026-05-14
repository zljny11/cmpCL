// @ts-nocheck
import { RenderingEngine } from "@cornerstonejs/core";

class CornerstoneUnit {
  renderingEngine: RenderingEngine | null = null;
  imageIdsMap: Map<string, string[]>;
}

export {
  CornerstoneUnit
}
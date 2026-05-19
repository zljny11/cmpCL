import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  ConfigProvider,
  Dropdown,
  Modal,
  Popover,
  Progress,
  Result,
  Slider,
  Spin,
  Tooltip,
  message,
  theme,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CameraOutlined,
  CaretRightOutlined,
  DownloadOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  MoreOutlined,
  PauseOutlined,
  PicLeftOutlined,
  ReloadOutlined,
  SearchOutlined,
  SunOutlined,
  ZoomInOutlined,
} from '@ant-design/icons';
import html2canvas from 'html2canvas';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Enums as csEnums,
  RenderingEngine,
  getRenderingEngine,
  utilities as csCoreUtils,
  type Types as csTypes,
} from '@cornerstonejs/core';
import { utilities as csToolsUtilities } from '@cornerstonejs/tools';
import { requirementsApi } from '../../../services/api/requirements';
import {
  RENDERING_ENGINE_ID,
  STACK_TOOL_GROUP_ID,
  TOOL_NAMES,
  VOLUME_TOOL_GROUP_ID,
  WW_WL_PRESETS,
  attachViewportToToolGroup,
  detachViewportFromToolGroups,
  ensureCornerstoneReady,
  setActivePrimaryTool,
  type ToolKey,
} from './cornerstoneSetup';
import './styles.css';
import logo from '../../../images/logonamegrey.png';
import type {
  RequirementPreviewPayload,
  RequirementSeriesPreviewItem,
} from '../../../types/requirements';

const { ViewportType, OrientationAxis, BlendModes, Events } = csEnums;
const VOLUME_ID_PREFIX = 'cornerstoneStreamingImageVolume:AICampCloud:';
const DEFAULT_LAYOUT: [number, number] = [1, 1];
const DEFAULT_FPS = 24;

type ViewerMode = 'stack' | 'mpr' | 'mip';
type ViewerOrientation = keyof typeof OrientationAxis;
type TagQuadrants = string[][];
type TagFrames = TagQuadrants[];

type ViewerSeries = RequirementSeriesPreviewItem & {
  imageIds: string[];
  tagInfo: TagFrames;
  volumeId: string;
  previewImageId: string | null;
};

type ViewportAssignment = Record<string, string | null>;
type ViewportModeMap = Record<string, ViewerMode>;
type ViewportOrientationMap = Record<string, ViewerOrientation>;
type ViewportMipThicknessMap = Record<string, number>;

type ViewportRuntimeState = {
  imageIndex: number;
  totalFrames: number;
  error: string | null;
  renderedMode: ViewerMode;
};

function ToolbarIcon({ children }: { children: React.ReactNode }) {
  return <span className="cc-viewer-toolbar-btn__icon">{children}</span>;
}

function ToolbarLabel({ children }: { children: React.ReactNode }) {
  return <span className="cc-viewer-toolbar-btn__label">{children}</span>;
}

function PanIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M512.42 71.54a6.62 6.62 0 0 1 5.26 2.6l105.86 138.2a6.63 6.63 0 0 1-5.26 10.66H551.5v249.658l251.325 0.017v-64.94a6.63 6.63 0 0 1 10.66-5.26l138.2 105.86a6.62 6.62 0 0 1 0 10.52l-138.2 105.86a6.63 6.63 0 0 1-10.66-5.26v-66.78H551.5V804h66.59a6.63 6.63 0 0 1 5.29 10.66l-105.86 138.2a6.62 6.62 0 0 1-10.52 0l-105.89-138.2a6.63 6.63 0 0 1 5.26-10.66h65.09l0.017-251.325H221.825v66.59a6.63 6.63 0 0 1-10.66 5.29l-138.2-105.86a6.62 6.62 0 0 1 0-10.52l138.2-105.89a6.63 6.63 0 0 1 10.66 5.26v65.09l249.658 0.017L471.5 223h-64.94a6.63 6.63 0 0 1-5.26-10.66l105.86-138.2a6.62 6.62 0 0 1 5.26-2.6z"
        fill="currentColor"
      />
    </svg>
  );
}

function MprIcon() {
  return (
    <svg viewBox="0 0 19 19" aria-hidden="true">
      <g fill="none" stroke="currentColor" fillRule="evenodd">
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="m9.75.5-8.5 3.719 8.5 3.718 8.5-3.718z" />
          <path d="M1.25 4.219v10.093l8.5 3.72 8.5-3.72V4.22m-8.5 3.718v10.093" />
        </g>
        <path fill="currentColor" d="M1.25 4.576v9.736l8.05 3.72.45-10.095z" />
      </g>
    </svg>
  );
}

function MipIcon() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <path
        d="M221.984 402.816L0 280.928 512.064 0.032 1024 280.928l-221.888 121.888 221.472 124-188.128 105.312 188.128 105.408-511.552 286.496L0.608 737.536l188.128-105.312-188.128-105.408 221.376-124z m506.752 40.192l-216.704 118.912-216.704-118.912-149.6 83.712 366.304 205.216 366.304-205.216c0 0.096-149.6-83.712-149.6-83.712zM261.312 672.8l-115.552 64.704 366.304 205.216 366.304-205.216-115.552-64.704-250.752 140.512-250.752-140.512z"
        fill="currentColor"
      />
    </svg>
  );
}

function getViewerRenderingEngine() {
  const existing = getRenderingEngine(RENDERING_ENGINE_ID);
  if (existing) return existing;
  return new RenderingEngine(RENDERING_ENGINE_ID);
}

function buildImageIdsFallback(series: RequirementSeriesPreviewItem | undefined): string[] {
  if (!series) return [];
  return series.files.map((file) => `wadouri:${file.url}`);
}

function buildViewportIds(rows: number, columns: number) {
  const ids: string[] = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      ids.push(`viewport${row}_${column}`);
    }
  }
  return ids;
}

function ensureViewportAssignments(
  previous: ViewportAssignment,
  viewportIds: string[],
  fallbackSeriesId: string | null,
) {
  const next: ViewportAssignment = {};
  viewportIds.forEach((viewportId, index) => {
    next[viewportId] = previous[viewportId] ?? (index === 0 ? fallbackSeriesId : null);
  });
  return next;
}

function inferSeriesTitle(series: RequirementSeriesPreviewItem) {
  return series.seriesDescription || `序列 ${series.seriesUid.slice(-6)}`;
}

function safeTagBlock(tagInfo: string[][] | undefined, index: number) {
  return Array.isArray(tagInfo?.[index]) ? tagInfo![index] : [];
}

function isTagQuadrants(value: unknown): value is TagQuadrants {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => Array.isArray(item) && item.every((line) => typeof line === 'string'),
    )
  );
}

function normalizeTagFrames(value: unknown): TagFrames {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  if (isTagQuadrants(value)) {
    return [value];
  }

  if (value.every((frame) => isTagQuadrants(frame))) {
    return value as TagFrames;
  }

  return [];
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function LayoutSelector({
  onSelect,
}: {
  onSelect: (layout: [number, number]) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const grid = new Array(9).fill(0);

  return (
    <div
      className="cc-viewer-layout-selector"
      style={{ gridTemplateRows: 'repeat(3, 20px)', gridTemplateColumns: 'repeat(3, 20px)' }}
    >
      {grid.map((_, index) => {
        const x = index % 3;
        const y = Math.floor(index / 3);
        const hoverX = hoveredIndex % 3;
        const hoverY = Math.floor(hoveredIndex / 3);
        const highlighted = hoveredIndex >= 0 && x <= hoverX && y <= hoverY;

        return (
          <div
            key={index}
            className={highlighted ? 'is-active' : undefined}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(-1)}
            onClick={() => onSelect([y + 1, x + 1])}
          />
        );
      })}
    </div>
  );
}

function SeriesThumbnail({
  series,
  active,
  onAssign,
}: {
  series: ViewerSeries;
  active: boolean;
  onAssign: () => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const viewportId = `thumb-${series.id}`;

  useEffect(() => {
    let cancelled = false;

    async function renderThumbnail() {
      const element = elementRef.current;
      if (!element || !series.previewImageId) return;

      await ensureCornerstoneReady();
      if (cancelled) return;

      const renderingEngine = getViewerRenderingEngine();
      let viewport = renderingEngine.getViewport(viewportId) as csTypes.IStackViewport | undefined;

      if (!viewport) {
        renderingEngine.enableElement({
          viewportId,
          type: ViewportType.STACK,
          element,
        });
        viewport = renderingEngine.getViewport(viewportId) as csTypes.IStackViewport;
      }

      await viewport.setStack([series.previewImageId], 0);
      viewport.render();
    }

    void renderThumbnail();

    return () => {
      cancelled = true;
      const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (renderingEngine?.getViewport(viewportId)) {
        renderingEngine.disableElement(viewportId);
      }
    };
  }, [series.previewImageId, viewportId]);

  return (
    <div
      className={`cc-viewer-sider-item${active ? ' is-active' : ''}`}
      onClick={onAssign}
    >
      <div
        className="cc-viewer-sider-item__thumb"
        draggable
        onDragStart={(event) => event.dataTransfer.setData('seriesId', series.id)}
      >
        <div ref={elementRef} className="cc-viewer-sider-item__thumb-canvas" />
      </div>
      <div className="cc-viewer-sider-item__meta">
        <div className="cc-viewer-sider-item__counts">
          <span>{series.files.length} 帧</span>
          <span>{series.datasetBatch.sourceName || `批次 ${series.datasetBatch.batchNo}`}</span>
        </div>
        <div className="cc-viewer-sider-item__title">{inferSeriesTitle(series)}</div>
      </div>
    </div>
  );
}

function DicomViewport({
  viewportId,
  series,
  active,
  mode,
  orientation,
  mipThickness,
  cinePlaying,
  cineFps,
  showTags,
  onActivate,
  onDropSeries,
}: {
  viewportId: string;
  series: ViewerSeries | null;
  active: boolean;
  mode: ViewerMode;
  orientation: ViewerOrientation;
  mipThickness: number;
  cinePlaying: boolean;
  cineFps: number;
  showTags: boolean;
  onActivate: (viewportId: string) => void;
  onDropSeries: (viewportId: string, seriesId: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastSeriesIdRef = useRef<string | null>(null);
  const currentModeRef = useRef<ViewerMode>('stack');
  const [sliderLength, setSliderLength] = useState(0);
  const [runtimeState, setRuntimeState] = useState<ViewportRuntimeState>({
    imageIndex: 0,
    totalFrames: 0,
    error: null,
    renderedMode: 'stack',
  });

  useEffect(() => {
    const currentSeries = series;

    if (!currentSeries) {
      lastSeriesIdRef.current = null;
      setRuntimeState({ imageIndex: 0, totalFrames: 0, error: null, renderedMode: 'stack' });
      return;
    }

    let cancelled = false;

    async function renderViewport() {
      const element = elementRef.current;
      if (!element) return;
      const activeSeries = currentSeries;
      if (!activeSeries) return;

      try {
        await ensureCornerstoneReady();
        if (cancelled) return;

        const renderingEngine = getViewerRenderingEngine();
        let viewport = renderingEngine.getViewport(viewportId) as
          | csTypes.IStackViewport
          | csTypes.IVolumeViewport
          | undefined;

        const seriesChanged = lastSeriesIdRef.current !== activeSeries.id;

        if (!viewport) {
          renderingEngine.enableElement({
            viewportId,
            type: ViewportType.STACK,
            element,
          });
          viewport = renderingEngine.getViewport(viewportId) as csTypes.IStackViewport;
          attachViewportToToolGroup(STACK_TOOL_GROUP_ID, viewportId);
          currentModeRef.current = 'stack';
        }

        if (seriesChanged && viewport.type !== ViewportType.STACK) {
          viewport = await csCoreUtils.convertVolumeToStackViewport({
            viewport: viewport as csTypes.IVolumeViewport,
            options: { viewportId },
          });
          attachViewportToToolGroup(STACK_TOOL_GROUP_ID, viewportId);
          currentModeRef.current = 'stack';
        }

        if (seriesChanged || viewport.type === ViewportType.STACK) {
          if (viewport.type !== ViewportType.STACK) {
            throw new Error('内部状态错误：期望 StackViewport');
          }
          const stackViewport = viewport as csTypes.IStackViewport;
          await stackViewport.setStack(activeSeries.imageIds, 0);
          csToolsUtilities.stackContextPrefetch.enable(stackViewport.element);
          stackViewport.resetCamera();
          stackViewport.render();
          attachViewportToToolGroup(STACK_TOOL_GROUP_ID, viewportId);
          currentModeRef.current = 'stack';
          lastSeriesIdRef.current = activeSeries.id;
          setRuntimeState({
            imageIndex: 1,
            totalFrames: activeSeries.imageIds.length,
            error: null,
            renderedMode: 'stack',
          });
        }

        if (mode !== 'stack') {
          if (viewport.type === ViewportType.STACK) {
            viewport = await csCoreUtils.convertStackToVolumeViewport({
              viewport: viewport as csTypes.IStackViewport,
              options: {
                viewportId,
                orientation: OrientationAxis[orientation],
                volumeId: activeSeries.volumeId,
              },
            });
            attachViewportToToolGroup(VOLUME_TOOL_GROUP_ID, viewportId);
          } else {
            attachViewportToToolGroup(VOLUME_TOOL_GROUP_ID, viewportId);
          }

          const volumeViewport = viewport as csTypes.IVolumeViewport;
          volumeViewport.setOrientation(OrientationAxis[orientation]);

          if (mode === 'mpr') {
            volumeViewport.setBlendMode(BlendModes.AVERAGE_INTENSITY_BLEND);
            volumeViewport.setSlabThickness(1);
          } else {
            volumeViewport.setBlendMode(BlendModes.MAXIMUM_INTENSITY_BLEND);
            volumeViewport.setSlabThickness(mipThickness);
          }

          volumeViewport.render();
          currentModeRef.current = mode;

          const sliceData = csCoreUtils.getImageSliceDataForVolumeViewport(volumeViewport);
          setRuntimeState({
            imageIndex: sliceData ? sliceData.imageIndex + 1 : 0,
            totalFrames: sliceData ? sliceData.numberOfSlices : activeSeries.imageIds.length,
            error: null,
            renderedMode: mode,
          });
        } else if (viewport.type !== ViewportType.STACK) {
          viewport = await csCoreUtils.convertVolumeToStackViewport({
            viewport: viewport as csTypes.IVolumeViewport,
            options: { viewportId },
          });
          attachViewportToToolGroup(STACK_TOOL_GROUP_ID, viewportId);
          currentModeRef.current = 'stack';
          setRuntimeState({
            imageIndex: 1,
            totalFrames: activeSeries.imageIds.length,
            error: null,
            renderedMode: 'stack',
          });
        } else {
          attachViewportToToolGroup(STACK_TOOL_GROUP_ID, viewportId);
          currentModeRef.current = 'stack';
        }
      } catch (error) {
        console.error('[viewer] viewport render failed:', viewportId, error);
        setRuntimeState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '图像渲染失败',
          renderedMode: mode,
        }));
      }
    }

    void renderViewport();

    return () => {
      cancelled = true;
    };
  }, [mipThickness, mode, orientation, series, viewportId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const updateStack = () => {
      const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
      const viewport = renderingEngine?.getViewport(viewportId) as csTypes.IStackViewport | undefined;
      if (!viewport || viewport.type !== ViewportType.STACK) return;
      const currentIndex = viewport.getCurrentImageIdIndex();
      const imageIds = viewport.getImageIds();
      setRuntimeState((current) => ({
        ...current,
        imageIndex: currentIndex + 1,
        totalFrames: imageIds.length || current.totalFrames,
      }));
    };

    const updateVolume = () => {
      const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
      const viewport = renderingEngine?.getViewport(viewportId) as
        | csTypes.IVolumeViewport
        | csTypes.IStackViewport
        | undefined;
      if (!viewport) return;
      if (viewport.type === ViewportType.STACK) {
        updateStack();
        return;
      }
      const volumeViewport = viewport as csTypes.IVolumeViewport;
      const sliceData = csCoreUtils.getImageSliceDataForVolumeViewport(volumeViewport);
      if (sliceData) {
        setRuntimeState((current) => ({
          ...current,
          imageIndex: sliceData.imageIndex + 1,
          totalFrames: sliceData.numberOfSlices,
        }));
      }
    };

    const imageLoadError = (event: Event) => {
      const detail = (event as CustomEvent<{ error?: Error; imageId?: string }>).detail;
      setRuntimeState((current) => ({
        ...current,
        error: detail?.error?.message || `图像加载失败: ${detail?.imageId ?? ''}`,
      }));
    };

    element.addEventListener(Events.STACK_NEW_IMAGE, updateStack);
    element.addEventListener(Events.CAMERA_MODIFIED, updateVolume);
    element.addEventListener(Events.IMAGE_LOAD_ERROR, imageLoadError);

    return () => {
      element.removeEventListener(Events.STACK_NEW_IMAGE, updateStack);
      element.removeEventListener(Events.CAMERA_MODIFIED, updateVolume);
      element.removeEventListener(Events.IMAGE_LOAD_ERROR, imageLoadError);
    };
  }, [viewportId, series?.id]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (cinePlaying && mode === 'stack' && series) {
      csToolsUtilities.cine.playClip(element, {
        framesPerSecond: cineFps,
      });
      return () => {
        csToolsUtilities.cine.stopClip(element);
      };
    }

    csToolsUtilities.cine.stopClip(element);
    return undefined;
  }, [cineFps, cinePlaying, mode, series]);

  useEffect(() => () => {
    if (elementRef.current) {
      csToolsUtilities.cine.stopClip(elementRef.current);
    }
    detachViewportFromToolGroups(viewportId);
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (renderingEngine?.getViewport(viewportId)) {
      renderingEngine.disableElement(viewportId);
    }
  }, [viewportId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const updateSliderLength = () => {
      setSliderLength(Math.max(element.clientHeight - 30, 120));
    };

    updateSliderLength();

    const observer = new ResizeObserver(updateSliderLength);
    observer.observe(element);

    return () => observer.disconnect();
  }, [series?.id, viewportId]);

  const handleRangeChange = (value: number) => {
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine?.getViewport(viewportId) as
      | csTypes.IStackViewport
      | csTypes.IVolumeViewport
      | undefined;
    if (!viewport) return;

    const targetIndex = value - 1;
    csCoreUtils.jumpToSlice(viewport.element, { imageIndex: targetIndex });
  };

  const tagFrames = series?.tagInfo ?? [];
  const tagInfo =
    tagFrames[Math.max(runtimeState.imageIndex - 1, 0)] ??
    tagFrames[0] ??
    [];

  return (
    <div
      className={`cc-viewer-viewport${active ? ' is-active' : ''}`}
      onClick={() => onActivate(viewportId)}
      onContextMenu={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const seriesId = event.dataTransfer.getData('seriesId');
        if (seriesId) {
          onDropSeries(viewportId, seriesId);
        }
      }}
    >
      {!series ? (
        <div className="cc-viewer-viewport__empty">
          <div>拖拽或点击左侧序列</div>
          <div>将其载入当前窗口</div>
        </div>
      ) : (
        <>
          <div ref={elementRef} className="cc-viewer-viewport__element" />

          {runtimeState.error ? (
            <div className="cc-viewer-viewport__status">
              <Alert
                type="error"
                message="加载错误"
                description={runtimeState.error}
                showIcon
              />
            </div>
          ) : null}

          {runtimeState.totalFrames > 0 ? (
            <>
              <div className="cc-viewer-viewport__counter">
                Img: {runtimeState.imageIndex}/{runtimeState.totalFrames}
              </div>

              <div className="cc-viewer-viewport__slider">
                <div className="cc-viewer-viewport__slider-holder">
                  <input
                    className="cc-viewer-viewport__slider-input"
                    style={{ width: sliderLength > 0 ? sliderLength : undefined }}
                    type="range"
                    min={1}
                    max={Math.max(runtimeState.totalFrames, 1)}
                    step={1}
                    value={Math.min(Math.max(runtimeState.imageIndex, 1), Math.max(runtimeState.totalFrames, 1))}
                    onChange={(event) => handleRangeChange(Number(event.target.value))}
                  />
                </div>
              </div>
            </>
          ) : null}

          {showTags ? (
            <>
              <div className="cc-viewer-viewport__tag cc-viewer-viewport__tag--lt">
                {safeTagBlock(tagInfo, 0).map((line, index) => <div key={index}>{line}</div>)}
              </div>
              <div className="cc-viewer-viewport__tag cc-viewer-viewport__tag--rt">
                {safeTagBlock(tagInfo, 1).map((line, index) => <div key={index}>{line}</div>)}
              </div>
              <div className="cc-viewer-viewport__tag cc-viewer-viewport__tag--lb">
                {safeTagBlock(tagInfo, 2).map((line, index) => <div key={index}>{line}</div>)}
              </div>
              <div className="cc-viewer-viewport__tag cc-viewer-viewport__tag--rb">
                {safeTagBlock(tagInfo, 3).map((line, index) => <div key={index}>{line}</div>)}
              </div>
            </>
          ) : null}

          {active && cinePlaying && mode === 'stack' ? (
            <div className="cc-viewer-cine-player">
              <div className="cc-viewer-cine-player__container">
                <div className="cc-viewer-cine-player__btn">
                  <PauseOutlined />
                </div>
                <div className="cc-viewer-cine-player__fps">{cineFps} FPS</div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function RequirementViewerPage() {
  const navigate = useNavigate();
  const { id: requirementId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') ?? undefined;
  const seriesIdParam = searchParams.get('seriesId') ?? undefined;
  const [modal, contextHolder] = Modal.useModal();

  const [layout, setLayout] = useState<[number, number]>(DEFAULT_LAYOUT);
  const [activeViewportId, setActiveViewportId] = useState('viewport1_1');
  const [viewportAssignments, setViewportAssignments] = useState<ViewportAssignment>({});
  const [viewportModes, setViewportModes] = useState<ViewportModeMap>({});
  const [viewportOrientations, setViewportOrientations] = useState<ViewportOrientationMap>({});
  const [viewportMipThicknesses, setViewportMipThicknesses] = useState<ViewportMipThicknessMap>({});
  const [activeTool, setActiveTool] = useState<ToolKey>('WindowLevel');
  const [showTags, setShowTags] = useState(true);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(DEFAULT_FPS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const previewQuery = useQuery<RequirementPreviewPayload>({
    queryKey: ['requirement-viewer-preview', requirementId, studyId ?? `series:${seriesIdParam}`],
    enabled: Boolean(requirementId) && Boolean(studyId || seriesIdParam),
    queryFn: () => {
      if (seriesIdParam) {
        return requirementsApi.previewSeries(requirementId, seriesIdParam);
      }
      return requirementsApi.previewStudy(requirementId, studyId!);
    },
    staleTime: 60_000,
  });

  const previewSeries = previewQuery.data?.series ?? [];

  const viewerSeriesQuery = useQuery<ViewerSeries[]>({
    queryKey: ['requirement-viewer-series', previewSeries.map((item) => item.id).join(',')],
    enabled: previewSeries.length > 0,
    queryFn: async () => {
      const seriesIds = previewSeries.map((item) => item.id);
      const [imageIdsResult, tagInfoResult] = await Promise.allSettled([
        requirementsApi.getViewerImageIds(seriesIds),
        requirementsApi.getViewerDicomTags(seriesIds),
      ]);

      const imageGroups = imageIdsResult.status === 'fulfilled' ? imageIdsResult.value : [];
      const tagGroups = tagInfoResult.status === 'fulfilled' ? tagInfoResult.value : [];

      return previewSeries.map((series, index) => {
        const fallbackIds = buildImageIdsFallback(series);
        const imageIds = imageGroups[index]?.length ? imageGroups[index] : fallbackIds;
        return {
          ...series,
          imageIds,
          tagInfo: normalizeTagFrames(tagGroups[index]),
          volumeId: `${VOLUME_ID_PREFIX}${series.id}`,
          previewImageId: imageIds[Math.floor(imageIds.length / 2)] ?? null,
        };
      });
    },
    staleTime: 60_000,
  });

  const viewerSeries = viewerSeriesQuery.data ?? [];
  const viewerSeriesMap = useMemo(
    () => new Map(viewerSeries.map((series) => [series.id, series])),
    [viewerSeries],
  );

  const viewportIds = useMemo(() => buildViewportIds(layout[0], layout[1]), [layout]);

  useEffect(() => {
    const firstSeriesId = viewerSeries[0]?.id ?? null;
    setViewportAssignments((current) => ensureViewportAssignments(current, viewportIds, firstSeriesId));
  }, [viewerSeries, viewportIds]);

  useEffect(() => {
    setViewportModes((current) => {
      const next = { ...current };
      viewportIds.forEach((viewportId) => {
        next[viewportId] ??= 'stack';
      });
      return next;
    });

    setViewportOrientations((current) => {
      const next = { ...current };
      viewportIds.forEach((viewportId) => {
        next[viewportId] ??= 'AXIAL';
      });
      return next;
    });

    setViewportMipThicknesses((current) => {
      const next = { ...current };
      viewportIds.forEach((viewportId) => {
        next[viewportId] ??= 10;
      });
      return next;
    });
  }, [viewportIds]);

  useEffect(() => {
    if (!viewportIds.includes(activeViewportId)) {
      setActiveViewportId('viewport1_1');
    }
  }, [activeViewportId, viewportIds]);

  useEffect(() => {
    void ensureCornerstoneReady();
  }, []);

  const assignSeriesToViewport = useCallback((viewportId: string, seriesId: string) => {
    setViewportAssignments((current) => ({ ...current, [viewportId]: seriesId }));
    setCinePlaying(false);
    setActiveViewportId(viewportId);
  }, []);

  const handleToolChange = useCallback((tool: ToolKey) => {
    setActiveTool(tool);
    setActivePrimaryTool(tool);
  }, []);

  const activeViewportSeriesId = viewportAssignments[activeViewportId] ?? null;
  const activeViewportSeries = activeViewportSeriesId ? viewerSeriesMap.get(activeViewportSeriesId) ?? null : null;

  const applyWwWlPreset = useCallback((lower: number, upper: number) => {
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine?.getViewport(activeViewportId) as
      | csTypes.IStackViewport
      | csTypes.IVolumeViewport
      | undefined;

    if (!viewport) {
      message.warning('请先选中一个图像窗口');
      return;
    }

    viewport.setProperties({
      voiRange: { lower, upper },
    });
    viewport.render();
  }, [activeViewportId]);

  const resetActiveViewport = useCallback(() => {
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine?.getViewport(activeViewportId) as
      | csTypes.IStackViewport
      | csTypes.IVolumeViewport
      | undefined;

    if (!viewport) {
      message.warning('请先选中一个图像窗口');
      return;
    }

    if ('resetProperties' in viewport && typeof viewport.resetProperties === 'function') {
      if (viewport.type !== ViewportType.STACK) {
        viewport.resetProperties(activeViewportSeries?.volumeId);
      } else {
        viewport.resetProperties();
      }
    } else {
      const defaults = 'getDefaultProperties' in viewport ? viewport.getDefaultProperties() : undefined;
      if (defaults?.voiRange) {
        viewport.setProperties({ voiRange: defaults.voiRange });
      }
    }
    viewport.resetCamera();
    viewport.render();
  }, [activeViewportId, activeViewportSeries]);

  const wwWlPresetMap = useMemo(
    () =>
      new Map<string, { lower: number; upper: number }>(
        WW_WL_PRESETS.map((preset) => [
          preset.label,
          preset.value,
        ]),
      ),
    [],
  );

  const handleWwWlMenuClick = useCallback(
    ({ key }: { key: string }) => {
      if (key === 'reset') {
        resetActiveViewport();
        return;
      }

      const preset = wwWlPresetMap.get(key);
      if (preset) {
        applyWwWlPreset(preset.lower, preset.upper);
      }
    },
    [applyWwWlPreset, resetActiveViewport, wwWlPresetMap],
  );

  const handleMpr = useCallback((value: string) => {
    if (!activeViewportSeries) {
      message.warning('请先选中一个图像窗口');
      return;
    }

    if (value === 'cancel') {
      setViewportModes((current) => ({ ...current, [activeViewportId]: 'stack' }));
      return;
    }

    setViewportOrientations((current) => ({ ...current, [activeViewportId]: value as ViewerOrientation }));
    setViewportModes((current) => ({ ...current, [activeViewportId]: 'mpr' }));
    setCinePlaying(false);
  }, [activeViewportId, activeViewportSeries]);

  const handleMip = useCallback((value: string) => {
    if (!activeViewportSeries) {
      message.warning('请先选中一个图像窗口');
      return;
    }

    if ((viewportModes[activeViewportId] ?? 'stack') === 'stack') {
      modal.warning({
        title: '提示',
        content: '请先开启MPR',
        okText: '确定',
      });
      return;
    }

    if (value === 'cancel') {
      setViewportModes((current) => ({ ...current, [activeViewportId]: 'mpr' }));
      return;
    }

    const nextThickness = value === 'MAX' ? 999 : Number(value);
    setViewportMipThicknesses((current) => ({ ...current, [activeViewportId]: nextThickness }));
    setViewportModes((current) => ({ ...current, [activeViewportId]: 'mip' }));
    setCinePlaying(false);
  }, [activeViewportId, activeViewportSeries, modal, viewportModes]);

  const handleDownload = useCallback(() => {
    if (!viewerSeries.length) {
      message.warning('没有可下载的序列');
      return;
    }

    modal.confirm({
      title: '下载图像序列',
      content: (
        <div>
          <p>确定要下载当前查看范围内的全部图像序列吗？</p>
          <p>共 {viewerSeries.length} 个序列，可能需要一些时间。</p>
        </div>
      ),
      okText: '确认下载',
      cancelText: '取消',
      onOk: async () => {
        try {
          setDownloading(true);
          setDownloadProgress(0);
          const blob = await requirementsApi.downloadViewerSeries(
            viewerSeries.map((series) => series.id),
            {
              onDownloadProgress: (event) => {
                if (event.progress) {
                  setDownloadProgress(Math.round(event.progress * 100));
                }
              },
            },
          );
          const targetLabel =
            previewQuery.data?.target.type === 'study'
              ? previewQuery.data.target.patient.patientId || previewQuery.data.target.patient.patientName || 'viewer'
              : previewQuery.data?.target.study.studyId || 'viewer';
          triggerDownload(blob, `series_${targetLabel}.zip`);
          message.success('图像序列下载成功');
        } catch (error) {
          console.error('[viewer] download failed:', error);
          message.error('图像序列下载失败');
        } finally {
          setDownloading(false);
          setDownloadProgress(0);
        }
      },
    });
  }, [modal, previewQuery.data, viewerSeries]);

  const handleCapture = useCallback(async () => {
    if (!gridRef.current) return;
    const canvas = await html2canvas(gridRef.current);
    setScreenshotDataUrl(canvas.toDataURL('image/png'));
    setScreenshotOpen(true);
  }, []);

  const activeMode = viewportModes[activeViewportId] ?? 'stack';
  const mprOrMip = activeMode === 'stack' ? 'none' : activeMode === 'mpr' ? 'MPR' : 'MIP';

  const wwWlItems: MenuProps['items'] = [
    ...WW_WL_PRESETS.map((preset) => ({
      key: preset.label,
      label: (
        <div className="cc-viewer-dropdown-item">
          <span>{preset.label}</span>
          <span>{preset.value.lower}/{preset.value.upper}</span>
        </div>
      ),
    })),
    { type: 'divider' as const },
    { key: 'reset', label: '重置' },
  ];

  const mprItems: MenuProps['items'] = [
    { key: 'AXIAL', label: 'AXIAL', onClick: () => handleMpr('AXIAL') },
    { key: 'CORONAL', label: 'CORONAL', onClick: () => handleMpr('CORONAL') },
    { key: 'SAGITTAL', label: 'SAGITTAL', onClick: () => handleMpr('SAGITTAL') },
    { key: 'cancel', label: '取消', onClick: () => handleMpr('cancel') },
  ];

  const mipItems: MenuProps['items'] = ['5', '10', '30', 'MAX', 'cancel'].map((key) => ({
    key,
    label: key === 'cancel' ? '取消' : key,
    onClick: () => handleMip(key),
  }));

  if (!requirementId || (!studyId && !seriesIdParam)) {
    return (
      <Result
        status="error"
        title="参数不完整"
        subTitle="缺少 studyId 或 seriesId 参数"
        extra={<Button onClick={() => navigate(-1)}>返回</Button>}
      />
    );
  }

  if (previewQuery.isLoading || viewerSeriesQuery.isLoading) {
    return (
      <div className="cc-viewer-page cc-viewer-page--loading">
        <div className="cc-viewer-fullscreen-status">
          <Spin />
          <div>正在加载 Viewer...</div>
        </div>
      </div>
    );
  }

  if (previewQuery.isError || viewerSeriesQuery.isError) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle="无法获取图像预览信息，请检查网络或权限"
        extra={<Button onClick={() => window.location.reload()}>刷新重试</Button>}
      />
    );
  }

  if (!viewerSeries.length) {
    return (
      <Result
        status="warning"
        title="无可显示序列"
        subTitle="当前检查尚未生成可预览图像"
        extra={<Button onClick={() => navigate(-1)}>返回</Button>}
      />
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: '#000',
          colorPrimary: '#1ab5ed',
          colorInfo: '#1ab5ed',
          colorBorder: '#0069a7',
        },
      }}
    >
      <div className="cc-viewer-page">
        <header className="cc-viewer-header">
          <div className="cc-viewer-header__left">
            <Tooltip title="目录">
              <Button
                className={`cc-viewer-toolbar-btn cc-viewer-header__nav-btn${directoryOpen ? ' is-solid' : ''}`}
                onClick={() => setDirectoryOpen((current) => !current)}
              >
                <ToolbarIcon>
                  <PicLeftOutlined />
                </ToolbarIcon>
                <ToolbarLabel>目录</ToolbarLabel>
              </Button>
            </Tooltip>
            <Tooltip title="返回">
              <Button
                className="cc-viewer-toolbar-btn cc-viewer-header__nav-btn"
                onClick={() => navigate(-1)}
              >
                <ToolbarIcon>
                  <ArrowLeftOutlined />
                </ToolbarIcon>
                <ToolbarLabel>返回</ToolbarLabel>
              </Button>
            </Tooltip>
          </div>

          <div className="cc-viewer-toolbar">
            <Tooltip title="WW/WL">
              <Dropdown menu={{ items: wwWlItems, onClick: handleWwWlMenuClick }} trigger={['click']}>
                <Button
                  className={`cc-viewer-toolbar-btn${activeTool === 'WindowLevel' ? ' is-active' : ''}`}
                  onClick={() => handleToolChange('WindowLevel')}
                >
                  <ToolbarIcon>
                    <SunOutlined />
                  </ToolbarIcon>
                </Button>
              </Dropdown>
            </Tooltip>

            <Tooltip title="缩放">
              <Button
                className={`cc-viewer-toolbar-btn${activeTool === 'Zoom' ? ' is-active' : ''}`}
                onClick={() => handleToolChange('Zoom')}
              >
                <ToolbarIcon>
                  <ZoomInOutlined />
                </ToolbarIcon>
              </Button>
            </Tooltip>

            <Tooltip title="拖拽">
              <Button
                className={`cc-viewer-toolbar-btn${activeTool === 'Pan' ? ' is-active' : ''}`}
                onClick={() => handleToolChange('Pan')}
              >
                <ToolbarIcon>
                  <PanIcon />
                </ToolbarIcon>
              </Button>
            </Tooltip>

            <Tooltip title="布局">
              <Popover
                trigger="click"
                open={layoutOpen}
                onOpenChange={setLayoutOpen}
                content={(
                  <LayoutSelector
                    onSelect={(nextLayout) => {
                      setLayout(nextLayout);
                      setLayoutOpen(false);
                    }}
                  />
                )}
              >
                <Button className={`cc-viewer-toolbar-btn${layoutOpen ? ' is-active' : ''}`}>
                  <ToolbarIcon>
                    <AppstoreOutlined />
                  </ToolbarIcon>
                </Button>
              </Popover>
            </Tooltip>

            <Tooltip title="MPR">
              <Dropdown menu={{ items: mprItems }} trigger={['click']}>
                <Button className={`cc-viewer-toolbar-btn${mprOrMip === 'MPR' ? ' is-active' : ''}`}>
                  <ToolbarIcon>
                    <MprIcon />
                  </ToolbarIcon>
                </Button>
              </Dropdown>
            </Tooltip>

            <Tooltip title="MIP">
              <Dropdown menu={{ items: mipItems }} trigger={['click']}>
                <Button className={`cc-viewer-toolbar-btn${mprOrMip === 'MIP' ? ' is-active' : ''}`}>
                  <ToolbarIcon>
                    <MipIcon />
                  </ToolbarIcon>
                </Button>
              </Dropdown>
            </Tooltip>

            <Tooltip title="重置">
              <Button className="cc-viewer-toolbar-btn" onClick={resetActiveViewport}>
                <ToolbarIcon>
                  <ReloadOutlined />
                </ToolbarIcon>
              </Button>
            </Tooltip>

            <Tooltip title="下载序列">
              <Button className="cc-viewer-toolbar-btn" onClick={handleDownload}>
                <ToolbarIcon>
                  <DownloadOutlined />
                </ToolbarIcon>
              </Button>
            </Tooltip>

            <Button
              className={`cc-viewer-toolbar-btn${moreOpen ? ' is-active' : ''}`}
              onClick={() => setMoreOpen((current) => !current)}
            >
              <ToolbarIcon>
                <MoreOutlined />
              </ToolbarIcon>
            </Button>
          </div>

          <div className="cc-viewer-header__right">
            <img className="cc-viewer-header__logo" src={logo} alt="RaDyn" />
          </div>
        </header>

        <div className="cc-viewer-more" style={{ height: moreOpen ? 54 : 0 }}>
          <Tooltip title="探针">
            <Button
              className={`cc-viewer-toolbar-btn${activeTool === 'Probe' ? ' is-active' : ''}`}
              onClick={() => handleToolChange('Probe')}
            >
              <ToolbarIcon>
                <SearchOutlined />
              </ToolbarIcon>
            </Button>
          </Tooltip>

          <Tooltip title="自动播放">
            <Button
              className={`cc-viewer-toolbar-btn${cinePlaying ? ' is-active' : ''}`}
              onClick={() => setCinePlaying((current) => !current)}
            >
              <ToolbarIcon>
                {cinePlaying ? <PauseOutlined /> : <CaretRightOutlined />}
              </ToolbarIcon>
            </Button>
          </Tooltip>

          <Popover
            trigger="click"
            content={(
              <div className="cc-viewer-fps-popover">
                <Slider min={1} max={100} value={cineFps} onChange={(value) => setCineFps(Number(value))} />
              </div>
            )}
          >
            <Button className="cc-viewer-toolbar-btn cc-viewer-toolbar-btn--fps">
              <ToolbarLabel>{cineFps} FPS</ToolbarLabel>
            </Button>
          </Popover>

          <Tooltip title={showTags ? '隐藏标签' : '显示标签'}>
            <Button
              className={`cc-viewer-toolbar-btn${!showTags ? ' is-active' : ''}`}
              onClick={() => setShowTags((current) => !current)}
            >
              <ToolbarIcon>
                {showTags ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </ToolbarIcon>
            </Button>
          </Tooltip>

          <Tooltip title="截图">
            <Button className="cc-viewer-toolbar-btn" onClick={handleCapture}>
              <ToolbarIcon>
                <CameraOutlined />
              </ToolbarIcon>
            </Button>
          </Tooltip>
        </div>

        <div className={`cc-viewer-layout${directoryOpen ? '' : ' is-sider-collapsed'}`}>
          {directoryOpen ? (
            <aside className="cc-viewer-sider">
              {viewerSeries.map((series) => (
                <SeriesThumbnail
                  key={series.id}
                  series={series}
                  active={series.id === activeViewportSeriesId}
                  onAssign={() => assignSeriesToViewport(activeViewportId, series.id)}
                />
              ))}
            </aside>
          ) : null}

          <main className="cc-viewer-content">
            <div
              ref={gridRef}
              id="viewportGrid"
              className="cc-viewer-grid"
              style={{
                gridTemplateRows: `repeat(${layout[0]}, minmax(0, 1fr))`,
                gridTemplateColumns: `repeat(${layout[1]}, minmax(0, 1fr))`,
              }}
            >
              {viewportIds.map((viewportId) => (
                <DicomViewport
                  key={viewportId}
                  viewportId={viewportId}
                  series={viewerSeriesMap.get(viewportAssignments[viewportId] ?? '') ?? null}
                  active={activeViewportId === viewportId}
                  mode={viewportModes[viewportId] ?? 'stack'}
                  orientation={viewportOrientations[viewportId] ?? 'AXIAL'}
                  mipThickness={viewportMipThicknesses[viewportId] ?? 10}
                  cinePlaying={cinePlaying && activeViewportId === viewportId}
                  cineFps={cineFps}
                  showTags={showTags}
                  onActivate={setActiveViewportId}
                  onDropSeries={assignSeriesToViewport}
                />
              ))}
            </div>
          </main>
        </div>

        <Modal
          open={downloading}
          title="正在下载图像序列"
          footer={null}
          closable={false}
        >
          <div className="cc-viewer-download-modal">
            <Progress type="circle" percent={downloadProgress} />
            <p>正在准备下载，请稍候...</p>
          </div>
        </Modal>

        <Modal
          open={screenshotOpen}
          title="图像截图预览"
          okText="下载"
          cancelText="关闭"
          onOk={() => {
            if (screenshotDataUrl) {
              const link = document.createElement('a');
              link.href = screenshotDataUrl;
              link.download = 'viewer-screenshot.png';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
            setScreenshotOpen(false);
          }}
          onCancel={() => setScreenshotOpen(false)}
          width={960}
        >
          {screenshotDataUrl ? (
            <img className="cc-viewer-screenshot" src={screenshotDataUrl} alt="viewer screenshot" />
          ) : null}
        </Modal>

        {contextHolder}
      </div>
    </ConfigProvider>
  );
}

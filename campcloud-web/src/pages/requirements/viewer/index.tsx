import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Result, Space, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Enums as csEnums,
  RenderingEngine,
  type Types as csTypes,
} from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';
import { requirementsApi } from '../../../services/api/requirements';
import { appConfig } from '../../../app/config/env';
import {
  RENDERING_ENGINE_ID,
  TOOL_GROUP_ID,
  TOOLS,
  VIEWPORT_ID,
  ensureCornerstoneReady,
  setActivePrimaryTool,
  type ToolKey,
} from './cornerstoneSetup';
import './styles.css';
import type {
  RequirementPreviewPayload,
  RequirementSeriesPreviewItem,
} from '../../../types/requirements';

function getApiOrigin(): string {
  try {
    const url = new URL(appConfig.apiBaseUrl, window.location.origin);
    return url.origin;
  } catch {
    return window.location.origin;
  }
}

function buildImageIds(series: RequirementSeriesPreviewItem | undefined): string[] {
  if (!series) return [];
  const origin = getApiOrigin();
  return series.files.map((file) => {
    const absolute = file.url.startsWith('http') ? file.url : `${origin}${file.url}`;
    return `wadouri:${absolute}`;
  });
}

export function RequirementViewerPage() {
  const navigate = useNavigate();
  const { id: requirementId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') ?? undefined;
  const seriesIdParam = searchParams.get('seriesId') ?? undefined;

  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolKey>('WindowLevel');
  const [imageIndex, setImageIndex] = useState(0);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [viewportLoading, setViewportLoading] = useState(false);

  const elementRef = useRef<HTMLDivElement | null>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportInitedRef = useRef(false);

  const previewQuery = useQuery<RequirementPreviewPayload>({
    queryKey: ['requirement-viewer', requirementId, studyId ?? `series:${seriesIdParam}`],
    enabled: Boolean(requirementId) && Boolean(studyId || seriesIdParam),
    queryFn: () => {
      if (seriesIdParam) {
        return requirementsApi.previewSeries(requirementId, seriesIdParam);
      }
      return requirementsApi.previewStudy(requirementId, studyId!);
    },
    staleTime: 60_000,
  });

  const seriesList = previewQuery.data?.series ?? [];

  useEffect(() => {
    if (!seriesList.length) {
      setActiveSeriesId(null);
      return;
    }
    setActiveSeriesId((current) => {
      if (current && seriesList.some((s) => s.id === current)) return current;
      const preferred = seriesIdParam ? seriesList.find((s) => s.id === seriesIdParam) : undefined;
      return (preferred ?? seriesList[0]).id;
    });
  }, [seriesList, seriesIdParam]);

  const activeSeries = useMemo(
    () => seriesList.find((s) => s.id === activeSeriesId),
    [seriesList, activeSeriesId],
  );

  const imageIds = useMemo(() => buildImageIds(activeSeries), [activeSeries]);

  // Single effect: init viewport (if needed) then load stack, in strict order.
  // This eliminates the race condition where two concurrent effects both await
  // ensureCornerstoneReady() and loadStack finds viewportInitedRef still false.
  useEffect(() => {
    let cancelled = false;
    setViewportError(null);

    if (!imageIds.length) return;

    async function initAndLoad() {
      const element = elementRef.current;
      if (!element) return;

      try {
        await ensureCornerstoneReady();
        if (cancelled) return;

        // Init viewport on first call (or after unmount reset).
        if (!renderingEngineRef.current) {
          renderingEngineRef.current = new RenderingEngine(RENDERING_ENGINE_ID);
        }
        if (!viewportInitedRef.current) {
          renderingEngineRef.current.enableElement({
            viewportId: VIEWPORT_ID,
            type: csEnums.ViewportType.STACK,
            element,
          });
          const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
          toolGroup?.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
          viewportInitedRef.current = true;
        }

        if (cancelled) return;
        setViewportLoading(true);
        // eslint-disable-next-line no-console
        console.log('[viewer] loading stack, first imageId =', imageIds[0], 'total =', imageIds.length);
        const viewport = renderingEngineRef.current.getViewport(VIEWPORT_ID) as csTypes.IStackViewport;
        await viewport.setStack(imageIds, 0);
        if (cancelled) return;
        viewport.render();
        setImageIndex(0);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[viewer] setStack failed:', error);
        if (!cancelled) {
          setViewportError(error instanceof Error ? error.message : '加载图像失败');
        }
      } finally {
        if (!cancelled) {
          setViewportLoading(false);
        }
      }
    }

    loadStack();

    return () => {
      cancelled = true;
    };
  }, [imageIds]);

  // Track current image index for overlay.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ imageIdIndex: number }>).detail;
      if (typeof detail?.imageIdIndex === 'number') {
        setImageIndex(detail.imageIdIndex);
      }
    };

    element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, handler);

    const errorHandler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ error?: Error; imageId?: string }>).detail;
      // eslint-disable-next-line no-console
      console.error('[viewer] IMAGE_LOAD_ERROR', detail?.imageId, detail?.error);
      setViewportError(detail?.error?.message || `图像加载失败: ${detail?.imageId ?? ''}`);
      setViewportLoading(false);
    };
    element.addEventListener(csEnums.Events.IMAGE_LOAD_ERROR, errorHandler);

    return () => {
      element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, handler);
      element.removeEventListener(csEnums.Events.IMAGE_LOAD_ERROR, errorHandler);
    };
  }, [activeSeriesId]);

  const handleToolChange = useCallback((tool: ToolKey) => {
    setActiveTool(tool);
    setActivePrimaryTool(tool);
  }, []);

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

  if (previewQuery.isLoading) {
    return (
      <div className="cc-viewer-page">
        <div className="cc-viewer-status">
          <Spin />
          <div>正在加载检查信息...</div>
        </div>
      </div>
    );
  }

  if (previewQuery.isError) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle="无法获取检查/序列信息，请检查网络或权限"
        extra={
          <Space>
            <Button onClick={() => previewQuery.refetch()}>重试</Button>
            <Button onClick={() => navigate(-1)}>返回</Button>
          </Space>
        }
      />
    );
  }

  if (!seriesList.length) {
    return (
      <Result
        status="warning"
        title="无可显示序列"
        subTitle="该检查尚未上传图像数据"
        extra={<Button onClick={() => navigate(-1)}>返回</Button>}
      />
    );
  }

  const totalFrames = activeSeries?.files.length ?? 0;

  return (
    <div className="cc-viewer-page">
      <div className="cc-viewer-header">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} size="small">
            返回
          </Button>
          <span className="cc-viewer-header__title">
            {activeSeries?.seriesDescription || '未命名序列'}
          </span>
        </Space>
        <Space className="cc-viewer-header__tools">
          {(Object.keys(TOOLS) as ToolKey[]).map((tool) => (
            <Button
              key={tool}
              size="small"
              type={activeTool === tool ? 'primary' : 'default'}
              onClick={() => handleToolChange(tool)}
            >
              {tool === 'WindowLevel' ? '窗宽窗位' : tool === 'Zoom' ? '缩放' : '平移'}
            </Button>
          ))}
        </Space>
      </div>

      <div className="cc-viewer-body">
        <aside className="cc-viewer-sider">
          {seriesList.map((series) => (
            <div
              key={series.id}
              className={`cc-viewer-series-item${
                series.id === activeSeriesId ? ' cc-viewer-series-item--active' : ''
              }`}
              onClick={() => setActiveSeriesId(series.id)}
            >
              <div className="cc-viewer-series-item__desc">
                {series.seriesDescription || '未命名序列'}
              </div>
              <div className="cc-viewer-series-item__meta">
                {series.files.length} 帧
              </div>
            </div>
          ))}
        </aside>

        <main className="cc-viewer-main">
          <div
            ref={elementRef}
            className="cc-viewer-canvas"
            onContextMenu={(e) => e.preventDefault()}
          />

          {viewportLoading ? (
            <div className="cc-viewer-status">
              <Spin />
              <div>加载图像中...</div>
            </div>
          ) : null}

          {viewportError ? (
            <div className="cc-viewer-status">
              <Alert type="error" message="图像加载失败" description={viewportError} showIcon />
            </div>
          ) : null}

          {!viewportLoading && !viewportError && totalFrames > 0 ? (
            <>
              <div className="cc-viewer-overlay">
                {activeSeries?.seriesDescription || '序列'}
              </div>
              <div className="cc-viewer-overlay cc-viewer-overlay--br">
                {imageIndex + 1} / {totalFrames}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

import {
  AimOutlined,
  ColumnWidthOutlined,
  DragOutlined,
  ExpandOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { RenderingEngine, Enums, getRenderingEngine, type Types } from '@cornerstonejs/core';
import {
  Enums as ToolEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Skeleton, Slider, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { appConfig } from '../../../app/config/env';
import { requirementsApi } from '../../../services/api/requirements';
import {
  RequirementPreviewPayload,
  RequirementSeriesFile,
  RequirementSeriesPreviewItem,
} from '../../../types/requirements';
import { ensureCornerstoneInitialized } from './cornerstone';
import './index.less';

const RENDERING_ENGINE_ID = 'campcloud-dicom-viewer-engine';
const VIEWPORT_ID = 'campcloud-dicom-viewer-viewport';
const TOOL_GROUP_ID = 'campcloud-dicom-viewer-tool-group';

type ActiveTool = 'windowLevel' | 'pan' | 'zoom';

function toAbsoluteFileUrl(file: RequirementSeriesFile) {
  return new URL(file.url, appConfig.apiBaseUrl).toString();
}

function getCurrentIndex(viewport: Types.IStackViewport, imageIds: string[]) {
  const currentImageId = viewport.getCurrentImageId();
  const foundIndex = imageIds.indexOf(currentImageId);
  return foundIndex >= 0 ? foundIndex : viewport.getCurrentImageIdIndex?.() ?? 0;
}

export function RequirementViewerPage() {
  const navigate = useNavigate();
  const { id: requirementId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId');
  const seriesId = searchParams.get('seriesId');

  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('windowLevel');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  const targetQuery = useQuery({
    queryKey: ['requirements', requirementId, 'viewer', studyId, seriesId],
    queryFn: () => {
      if (seriesId) {
        return requirementsApi.previewSeries(requirementId, seriesId);
      }

      if (studyId) {
        return requirementsApi.previewStudy(requirementId, studyId);
      }

      throw new Error('缺少查看目标');
    },
    enabled: Boolean(requirementId && (studyId || seriesId)),
  });

  const previewData = targetQuery.data as RequirementPreviewPayload | undefined;
  const seriesList = previewData?.series ?? [];
  const activeSeries =
    seriesList.find((item) => item.id === activeSeriesId) ??
    (seriesList.length > 0 ? seriesList[0] : null);

  useEffect(() => {
    if ((!activeSeriesId || !seriesList.some((item) => item.id === activeSeriesId)) && seriesList[0]) {
      setActiveSeriesId(seriesList[0].id);
    }
  }, [activeSeriesId, seriesList]);

  const imageIds = useMemo(
    () => (activeSeries ? activeSeries.files.map((file) => `wadouri:${toAbsoluteFileUrl(file)}`) : []),
    [activeSeries],
  );

  useEffect(() => {
    if (!activeSeries) {
      return;
    }

    let cancelled = false;

    const setupViewer = async () => {
      const element = viewportElementRef.current;
      if (!element || imageIds.length === 0) {
        return;
      }

      try {
        setRenderError(null);
        await ensureCornerstoneInitialized();

        let renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
        if (!renderingEngine) {
          renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
        }

        try {
          renderingEngine.disableElement(VIEWPORT_ID);
        } catch {}

        renderingEngine.enableElement({
          viewportId: VIEWPORT_ID,
          element,
          type: Enums.ViewportType.STACK,
        });

        let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
          toolGroup?.addTool(WindowLevelTool.toolName);
          toolGroup?.addTool(PanTool.toolName);
          toolGroup?.addTool(ZoomTool.toolName);
          toolGroup?.addTool(StackScrollTool.toolName);
        }

        toolGroup?.removeViewports(RENDERING_ENGINE_ID, VIEWPORT_ID);
        toolGroup?.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
        toolGroup?.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });
        toolGroup?.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });
        toolGroup?.setToolPassive(PanTool.toolName);
        toolGroup?.setToolPassive(ZoomTool.toolName);

        const viewport = renderingEngine.getViewport(VIEWPORT_ID) as Types.IStackViewport;
        await viewport.setStack(imageIds, 0);
        viewport.resetCamera();
        viewport.render();

        if (cancelled) {
          return;
        }

        setCurrentImageIndex(0);

        const handleStackImageChange = () => {
          const nextViewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID) as Types.IStackViewport | undefined;
          if (!nextViewport) {
            return;
          }
          setCurrentImageIndex(getCurrentIndex(nextViewport, imageIds));
        };

        element.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleStackImageChange);

        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = new ResizeObserver(() => {
          getRenderingEngine(RENDERING_ENGINE_ID)?.resize();
        });
        resizeObserverRef.current.observe(element);

        return () => {
          element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, handleStackImageChange);
        };
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : 'DICOM 图像加载失败');
        }
      }
    };

    let teardown: (() => void) | undefined;
    void setupViewer().then((cleanup) => {
      teardown = cleanup;
    });

    return () => {
      cancelled = true;
      teardown?.();
      resizeObserverRef.current?.disconnect();
    };
  }, [activeSeries, imageIds]);

  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) {
      return;
    }

    toolGroup.setToolPassive(WindowLevelTool.toolName);
    toolGroup.setToolPassive(PanTool.toolName);
    toolGroup.setToolPassive(ZoomTool.toolName);

    const toolName =
      activeTool === 'pan'
        ? PanTool.toolName
        : activeTool === 'zoom'
          ? ZoomTool.toolName
          : WindowLevelTool.toolName;

    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
  }, [activeTool]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      try {
        ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
      } catch {}
      try {
        getRenderingEngine(RENDERING_ENGINE_ID)?.destroy();
      } catch {}
    };
  }, []);

  const handleResetViewport = async () => {
    if (!activeSeries || imageIds.length === 0) {
      return;
    }

    const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID) as Types.IStackViewport | undefined;
    if (!viewport) {
      return;
    }

    await viewport.setStack(imageIds, 0);
    viewport.resetCamera();
    viewport.render();
    setCurrentImageIndex(0);
  };

  const handleSliderChange = async (value: number) => {
    const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID) as Types.IStackViewport | undefined;
    if (!viewport) {
      return;
    }

    await viewport.setImageIdIndex(value);
    viewport.render();
    setCurrentImageIndex(value);
  };

  if (!studyId && !seriesId) {
    return <Alert type="error" showIcon message="缺少 viewer 参数，无法加载图像" />;
  }

  return (
    <div className="dicom-viewer-page">
      <Card bordered={false}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Button icon={<RollbackOutlined />} onClick={() => navigate(-1)}>
              返回
            </Button>
            <Link to={`/requirements/${requirementId}`}>
              <Button>需求详情</Button>
            </Link>
            <Link to={`/requirements/${requirementId}/upload`}>
              <Button>上传中心</Button>
            </Link>
          </Space>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              DICOM Viewer
            </Typography.Title>
            <Typography.Text type="secondary">
              直接复用第三周期上传后的真实 DICOM 文件，按序列栈方式浏览。
            </Typography.Text>
          </div>
          {previewData ? (
            <Space wrap>
              <Tag color="blue">{previewData.target.type === 'study' ? '检查视图' : '序列视图'}</Tag>
              {previewData.target.type === 'study' ? (
                <>
                  <Tag>{previewData.target.studyId || previewData.target.studyUid}</Tag>
                  <Tag>{previewData.target.patient.patientName || previewData.target.patient.patientId || previewData.target.patient.patientUid}</Tag>
                </>
              ) : (
                <>
                  <Tag>{previewData.target.seriesDescription || previewData.target.seriesUid}</Tag>
                  <Tag>{previewData.target.study.studyId || previewData.target.study.studyUid}</Tag>
                </>
              )}
            </Space>
          ) : null}
        </Space>
      </Card>

      <div className="dicom-viewer-shell">
        <Card
          className="dicom-viewer-sidebar"
          title="序列列表"
          loading={targetQuery.isLoading}
          styles={{ body: { maxHeight: 'calc(100vh - 300px)', overflow: 'auto' } }}
        >
          {targetQuery.isError ? (
            <Alert type="error" showIcon message="影像数据加载失败" />
          ) : seriesList.length === 0 ? (
            <Empty description="当前查看目标下没有可展示的序列" />
          ) : (
            <div className="dicom-viewer-series-list">
              {seriesList.map((item, index) => (
                <div
                  key={item.id}
                  className={`dicom-viewer-series-item${item.id === activeSeries?.id ? ' active' : ''}`}
                  onClick={() => setActiveSeriesId(item.id)}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div>
                      <Typography.Text strong>{item.seriesDescription || `未命名序列 ${index + 1}`}</Typography.Text>
                    </div>
                    <Space wrap size={[8, 8]}>
                      <Tag color="geekblue">批次 #{item.datasetBatch.batchNo}</Tag>
                      <Tag>{item.imageCount} 张</Tag>
                    </Space>
                    <Typography.Text type="secondary">
                      {item.hospitalName || item.datasetBatch.sourceName || item.datasetBatch.uploadType}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {item.uploadedAt ? dayjs(item.uploadedAt).format('YYYY-MM-DD HH:mm:ss') : '无上传时间'}
                    </Typography.Text>
                  </Space>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="dicom-viewer-main">
          <div className="dicom-viewer-stage">
            <Card className="dicom-viewer-toolbar-card">
              <div className="dicom-viewer-toolbar">
                <Button
                  type={activeTool === 'windowLevel' ? 'primary' : 'default'}
                  icon={<ColumnWidthOutlined />}
                  onClick={() => setActiveTool('windowLevel')}
                >
                  窗宽窗位
                </Button>
                <Button
                  type={activeTool === 'pan' ? 'primary' : 'default'}
                  icon={<DragOutlined />}
                  onClick={() => setActiveTool('pan')}
                >
                  平移
                </Button>
                <Button
                  type={activeTool === 'zoom' ? 'primary' : 'default'}
                  icon={<ExpandOutlined />}
                  onClick={() => setActiveTool('zoom')}
                >
                  缩放
                </Button>
                <Button icon={<AimOutlined />} onClick={() => void handleResetViewport()}>
                  复位
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => void targetQuery.refetch()}>
                  刷新
                </Button>
              </div>
            </Card>

            <Card
              className="dicom-viewer-viewport-card"
              styles={{ body: { display: 'grid', gap: 12 } }}
            >
              {targetQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 10 }} />
              ) : targetQuery.isError ? (
                <Alert type="error" showIcon message="Viewer 初始化失败" />
              ) : !activeSeries ? (
                <Empty description="没有可展示的序列" />
              ) : imageIds.length === 0 ? (
                <Empty description="当前序列下没有可渲染的 DICOM 文件" />
              ) : (
                <>
                  <div className="dicom-viewer-viewport-wrap">
                    <div ref={viewportElementRef} className="dicom-viewer-viewport" />
                    <div className="dicom-viewer-viewport-overlay">
                      <div className="dicom-viewer-overlay-top">
                        <div className="dicom-viewer-overlay-stack">
                          <div className="dicom-viewer-overlay-chip">
                            {activeSeries.seriesDescription || activeSeries.seriesUid}
                          </div>
                          <div className="dicom-viewer-overlay-chip">
                            {previewData?.target.type === 'study'
                              ? previewData.target.patient.patientName ||
                                previewData.target.patient.patientId ||
                                previewData.target.patient.patientUid
                              : previewData?.target.study.studyId || previewData?.target.study.studyUid}
                          </div>
                        </div>
                        <div className="dicom-viewer-overlay-chip">{activeSeries.files.length} 帧</div>
                      </div>
                      <div className="dicom-viewer-overlay-bottom">
                        <div className="dicom-viewer-overlay-chip">
                          {currentImageIndex + 1} / {Math.max(1, activeSeries.files.length)}
                        </div>
                        <div className="dicom-viewer-overlay-chip">{activeTool === 'windowLevel' ? '窗宽窗位' : activeTool === 'pan' ? '平移' : '缩放'}</div>
                      </div>
                    </div>
                    {renderError ? (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 24,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Alert type="error" showIcon message={renderError} />
                      </div>
                    ) : null}
                  </div>

                  <div className="dicom-viewer-slice-slider">
                    <Slider
                      min={0}
                      max={Math.max(0, activeSeries.files.length - 1)}
                      value={Math.min(currentImageIndex, Math.max(0, activeSeries.files.length - 1))}
                      tooltip={{ formatter: (value) => `第 ${(value ?? 0) + 1} 张` }}
                      onChange={(value) => void handleSliderChange(value)}
                    />
                  </div>

                  <Card size="small" title="当前序列信息">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Typography.Text>序列 UID：{activeSeries.seriesUid}</Typography.Text>
                      <Typography.Text>来源：{activeSeries.hospitalName || '-'}</Typography.Text>
                      <Typography.Text>批次来源：{activeSeries.datasetBatch.sourceName || activeSeries.datasetBatch.uploadType}</Typography.Text>
                      <Typography.Text>备注：{activeSeries.remark || '-'}</Typography.Text>
                    </Space>
                  </Card>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

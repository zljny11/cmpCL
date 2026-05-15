// @ts-nocheck
import React, { useState, useEffect, useRef, useContext, memo, useMemo, useCallback } from "react";
import { ImageDatasContext, RowColumnContext, LoadingContext, ActiveViewportIdContext, CinePlayingContext, DICOMTagInfosContext, LoadErrorsContext } from "./ViewerProvider";
import {
  getRenderingEngine,
  Types,
  Enums,
  utilities as csUtils,
} from "@cornerstonejs/core";
import { utilities } from "@cornerstonejs/tools";
import { renderingEngineId, StackToolGroup, TooltipOverlayInnerStyle, addResizeObserver } from "./function";
import { Modal, Popover, Slider, ConfigProvider, Alert } from "antd";
import {
  CloseOutlined,
  PauseOutlined,
  CaretRightOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';

const { ViewportType } = Enums;
const { CAMERA_MODIFIED } = Enums.Events;
const { getImageSliceDataForVolumeViewport, jumpToSlice } = csUtils;

const Viewport: React.FC<{
  viewportId: string,
  ImageIds?: string[],
  seriesData?: any
}> = ({ viewportId, ImageIds }) => {
  const ImageDatas = useContext(ImageDatasContext);
  const { loadErrors } = useContext(LoadErrorsContext);
  const { rowColumn } = useContext(RowColumnContext)
  const setLoading = useContext(LoadingContext)
  const { activeViewportId, setActiveViewportId } = useContext(ActiveViewportIdContext)
  const [row] = rowColumn
  const [dcmIndex, setDcmIndex] = useState(0);
  const dcmNum = useRef(0);
  const element = useRef<HTMLDivElement | null>(null);
  const seriesIndex = useRef(-1)
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const cameraModifiedHandlerRef = useRef<(() => void) | null>(null);
  const renderTimerRef = useRef<number | null>(null);
  const draggable = useMemo(() => !viewportId.includes("viewport"), [viewportId]);
  const [modal, contextHolder] = Modal.useModal();
  const [renderError, setRenderError] = useState<string | null>(null);

  const viewportRender = useCallback(async (
    element: HTMLDivElement,
    viewportId: string,
    ImageIds: string[],
    seriesIndex?: number,
  ) => {
    if (!element || !ImageIds?.length) return;
    window.__viewerDebugPush?.({ viewportId, phase: 'viewportRender-start', imageCount: ImageIds?.length ?? 0, draggable });
    const createViewportAndRender = async () => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) {
        throw new Error("RenderingEngine 未初始化");
      }

      const existingViewport = renderingEngine.getViewport(viewportId);
      if (existingViewport) {
        renderingEngine.disableElement(viewportId);
        window.__viewerDebugPush?.({ viewportId, phase: 'disableExisting-ok' });
      }

      const getViewport = () => {
        renderingEngine.enableElement({ viewportId, element, type: ViewportType.STACK });
        console.log("创建viewport " + viewportId);
        window.__viewerDebugPush?.({ viewportId, phase: 'enableElement-ok' });

        return renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      }
      const stackViewport = getViewport() as Types.IStackViewport
      window.__viewerDebugPush?.({ viewportId, phase: 'setStack-call', firstImageId: ImageIds?.[0] ?? null });
      await stackViewport.setStack(ImageIds, 0);
      window.__viewerDebugPush?.({ viewportId, phase: 'setStack-ok' });
      stackViewport.resetCamera();

      // @ts-ignore
      stackViewport.seriesIndex = seriesIndex
      window.__viewerDebugPush?.({ viewportId, phase: 'resetCamera-ok' });
      stackViewport.render();
      renderingEngine.resize(true, true);
      window.__viewerDebugPush?.({ viewportId, phase: 'render-called' });
      if (!draggable) {
        try {
          StackToolGroup.removeViewports(renderingEngineId, viewportId);
          window.__viewerDebugPush?.({ viewportId, phase: 'toolGroup-removeViewport-ok' });
        } catch {}
        try {
          StackToolGroup.addViewport(viewportId, renderingEngineId);
          window.__viewerDebugPush?.({ viewportId, phase: 'toolGroup-addViewport-ok' });
        } catch (toolGroupError) {
          console.warn("StackToolGroup.addViewport异常: ", toolGroupError);
          window.__viewerDebugPush?.({
            viewportId,
            phase: 'toolGroup-addViewport-error',
            error: toolGroupError?.message ?? String(toolGroupError),
          });
        }
      }
    };

    /** 监听鼠标滚轮滚动
    * @param viewportId    每个viewport独有的id
    * @param element       具体的viewport元素
    * @param flag          记录是添加监听还是解除监听
    * @param setDcmIndex   更新当前DICOM图像索引的方法
    * @param dcmNum        记录DICOM图像总数的变量
    */
    const wheelEventListener = (
      viewportId: string,
      element: HTMLDivElement,
      flag: boolean,
      setDcmIndex: React.Dispatch<React.SetStateAction<number>>,
      dcmNum: React.MutableRefObject<number>
    ) => {
      const handleCAMERA_MODIFIED = () => {
        const renderingEngine = getRenderingEngine(renderingEngineId);
        const viewport = renderingEngine.getViewport(viewportId);
        if (!viewport) return
        // @ts-ignore
        if (viewport.isMIP) {
          setDcmIndex(0); // 重置为0，目的在于使滚动条和图像层数索引不显示
          return
        }
        if (viewport.type === 'stack') {
          const stackViewport = viewport as Types.IStackViewport;
          setDcmIndex(stackViewport.getCurrentImageIdIndex() + 1);
          dcmNum.current = stackViewport.getImageIds().length;
        } else {
          const viewportImageIndexAndNumberOfSlices = getImageSliceDataForVolumeViewport(viewport as Types.IVolumeViewport);
          if (viewportImageIndexAndNumberOfSlices) {
            dcmNum.current = viewportImageIndexAndNumberOfSlices.numberOfSlices;
            setDcmIndex(viewportImageIndexAndNumberOfSlices.imageIndex + 1);
          }
        }
      };
      if (flag) {
        cameraModifiedHandlerRef.current = handleCAMERA_MODIFIED;
        element.addEventListener(CAMERA_MODIFIED, handleCAMERA_MODIFIED);
      } else {
        element.removeEventListener(CAMERA_MODIFIED, handleCAMERA_MODIFIED);
      }
      return handleCAMERA_MODIFIED;
    };

    try {
      setLoading(true)

      await createViewportAndRender();

      // 若最后一行最后一列的viewport渲染完毕，则loading置为false (此情况必定发生在ViewerContent的Viewport)
      if (!draggable) {
        setLoading(false)
      }
      // 只有ViewerSider的Viewport是draggable的，当ViewerSider中的最后一个Viewport渲染完毕后，loading置为false
      if (draggable && viewportId === (ImageDatas.length - 1).toString()) {
        setLoading(false);
      }

      if (!draggable) {
        // console.log("trigger!");
        wheelEventListener(
          viewportId,
          element,
          true,
          setDcmIndex,
          dcmNum
        )();
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = addResizeObserver(renderingEngineId);
        resizeObserverRef.current.observe(element);
      }

      //清除之前的错误状态
      setRenderError(null);
      window.__viewerDebugPush?.({ viewportId, phase: 'viewportRender-success' });
    } catch (error) {
      console.log("viewportRender异常: ", error);
      setLoading(false);
      const message = error?.message ?? String(error);
      setRenderError(`图像渲染失败: ${message}`);
      window.__viewerDebugPush?.({ viewportId, phase: 'viewportRender-error', error: error?.message ?? String(error) });
    }
  }, [ImageDatas, draggable, setLoading])

  useEffect(() => {
    if (renderTimerRef.current) {
      window.clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }

    if (ImageIds) {
      //检查是否有加载错误
      if (loadErrors && loadErrors[seriesIndex.current]) {
        setRenderError("该序列加载失败，无法显示");
        setLoading(false);
        return;
      }

      if (!draggable) {
        setLoading(true)
      }
      // 这里加定时器的目的是为了确保loading动画的展现
      renderTimerRef.current = window.setTimeout(() => {
        viewportRender(element.current, viewportId, ImageIds)
      }, 500);
    }

    if (viewportId === 'viewport1_1') {
      seriesIndex.current = 0
      if (!ImageDatas[0]?.ImageIds?.length) return;
      // 检查第一个序列是否有加载错误
      if (loadErrors && loadErrors[0]) {
        setRenderError("该序列加载失败，无法显示");
        setLoading(false);
      } else {
        viewportRender(element.current, viewportId, ImageDatas[0].ImageIds, 0)
      }
    }

    return () => {
      if (renderTimerRef.current) {
        window.clearTimeout(renderTimerRef.current);
        renderTimerRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (cameraModifiedHandlerRef.current && element.current) {
        element.current.removeEventListener(CAMERA_MODIFIED, cameraModifiedHandlerRef.current);
        cameraModifiedHandlerRef.current = null;
      }
      if (ImageIds) {
        console.log("移除viewport " + viewportId);
        const renderingEngine = getRenderingEngine(renderingEngineId);
        if (renderingEngine?.getViewport(viewportId))
          renderingEngine.disableElement(viewportId)
      }
      if (viewportId === 'viewport1_1') {
        const renderingEngine = getRenderingEngine(renderingEngineId);
        if (renderingEngine?.getViewport(viewportId))
          renderingEngine.disableElement(viewportId)
      }
    }
  }, [ImageDatas, viewportId, ImageIds, draggable, setLoading, viewportRender, loadErrors]);

  // 鼠标按住滑动条实现切换层数
  const wheelOnChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    viewportId: string
  ) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const newIndex = parseInt(e.target.value) - 1;
    const viewport = renderingEngine.getViewport(viewportId);
    jumpToSlice(viewport.element, {
      imageIndex: newIndex,
    });
  };

  return (
    <div
      className={`Viewport ${activeViewportId === viewportId ? 'activeViewport' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        if (draggable) return // 不允许将小窗的图像拖拽到同样为小窗的viewport中
        setLoading(true)
        const index = parseInt(e.dataTransfer.getData("index"));
        seriesIndex.current = index
        await viewportRender(element.current, viewportId, ImageDatas[index].ImageIds, index)
        setActiveViewportId(viewportId)
      }}
      onClick={() => {
        if (dcmNum.current && !draggable) {
          setActiveViewportId(viewportId)
        }
      }}
    >
      <div className="element" ref={element} />

      {
        renderError ? (
          <div className="error-overlay">
            <Alert
              message="加载错误"
              description={renderError}
              type="error"
              showIcon
            />
          </div>
        ) : dcmIndex ?
          <>
            <div className="dcmIndexContainer">
              <div>Img: {`${dcmIndex}/${dcmNum.current}`}</div>
            </div>
            <div className="scroll">
              <div className="scroll-holder">
                <input
                  className="imageSlider"
                  style={{ width: (window.innerHeight - 60) / row - 30 }}
                  value={dcmIndex}
                  type="range"
                  min={1}
                  max={dcmNum.current}
                  step={1}
                  onChange={(e) => wheelOnChange(e, viewportId)}
                />
              </div>
            </div>

            <CinePlayer element={element} />
          </> : null
      }

      {
        seriesIndex.current >= 0 ? <DICOMTagInfoContainer seriesIndex={seriesIndex.current} /> : null
      }

      {contextHolder}
    </div>
  )
}

const CinePlayer = memo(({ element }: { element: React.MutableRefObject<HTMLDivElement> }) => {
  const { cinePlaying, setCinePlaying } = useContext(CinePlayingContext);
  const [playBarVisible, setPlayBarVisible] = useState(false);
  const [FPS, setFPS] = useState(24);
  const minFPS = 1, maxFPS = 100;

  const playCine = useCallback((FPS: number) => utilities.cine.playClip(element.current, { framesPerSecond: FPS, }), [element]);
  const stopCine = useCallback(() => utilities.cine.stopClip(element.current), [element]);

  const toggleCinePlaying = () => setCinePlaying(!cinePlaying);
  const closePlayBar = () => setPlayBarVisible(false);

  useEffect(() => {
    if (cinePlaying) {
      setPlayBarVisible(true);
      playCine(FPS)
    } else {
      stopCine();
    }
  }, [cinePlaying, FPS, playCine, stopCine]);

  const changeFPS = (newValue: number) => {
    setFPS(newValue)
    if (cinePlaying)
      playCine(newValue);
  }

  return (
    <div className="CinePlayer" style={{ display: playBarVisible ? "block" : "none" }}>
      <div className="container">
        <div className="btn" onClick={toggleCinePlaying}>{cinePlaying ? <PauseOutlined /> : <CaretRightOutlined />}</div>
        <ConfigProvider
          theme={{
            token: { colorBgElevated: "#0069a7" },
          }}
        >
          <Popover
            content={
              <Slider
                className="Slider"
                min={minFPS}
                max={maxFPS}
                value={FPS}
                onChange={changeFPS}
              />
            }
            styles={{ body: { ...TooltipOverlayInnerStyle, padding: 4 } }}
          >
            <div className="FPS">
              <div className="btn" onClick={() => FPS > 1 ? changeFPS(FPS - 1) : null}><LeftOutlined /></div>
              <span>{FPS} FPS</span>
              <div className="btn" onClick={() => FPS < 100 ? changeFPS(FPS + 1) : null}><RightOutlined /></div>
            </div>
          </Popover>
        </ConfigProvider>
        <div className="btn" onClick={closePlayBar}><CloseOutlined /></div>
      </div >
    </div >
  )
})

const DICOMTagInfoContainer = memo(({ seriesIndex }: { seriesIndex: number }) => {
  const { DICOMTagInfos, tagDisplay } = useContext(DICOMTagInfosContext)

  return (
    <>
      {
        DICOMTagInfos && DICOMTagInfos.length > 0 && tagDisplay && typeof seriesIndex === 'number' && seriesIndex >= 0 ? (
          <>
            <div className="dcmInfo leftTop">
              {
                DICOMTagInfos[seriesIndex][0].map((data: string, index: number) => <div key={index}>{data}</div>)
              }
            </div>
            <div className="dcmInfo rightTop">
              {
                DICOMTagInfos[seriesIndex][1].map((data: string, index: number) => <div key={index}>{data}</div>)
              }
            </div>
            <div className="dcmInfo leftBottom">
              {
                DICOMTagInfos[seriesIndex][2].map((data: string, index: number) => <div key={index}>{data}</div>)
              }
            </div>
            <div className="dcmInfo rightBottom">
              {
                DICOMTagInfos[seriesIndex][3].map((data: string, index: number) => <div key={index}>{data}</div>)
              }
            </div>
          </>
        ) : null
      }
    </>
  )
})

export default Viewport

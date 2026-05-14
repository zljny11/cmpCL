// @ts-nocheck
import React, { memo, useCallback, useContext } from "react";
import { getRenderingEngine, Types, Enums, utilities } from "@cornerstonejs/core";
import { VolumesContext, ActiveViewportIdContext, LoadingContext } from "../ViewerProvider";
import { renderingEngineId, VolumeToolGroup, StackToolGroup, MipToolGroup } from "../function";
import { Modal, MenuProps } from "antd";
import { DwBtn, DwBtnProps } from "./Btns";
import { MPRIcon } from "./Icons";

const { ViewportType, OrientationAxis } = Enums;

const dropdownItems: MenuProps["items"] = [
  { key: OrientationAxis.AXIAL, label: "AXIAL" },
  { key: OrientationAxis.CORONAL, label: "CORONAL" },
  { key: OrientationAxis.SAGITTAL, label: "SAGITTAL" },
  { key: "cancel", label: "取消" }
];

interface Props {
  mprOrMip: string,
  setMprOrMip: React.Dispatch<React.SetStateAction<string>>
}

const MPRBtn = memo(({ mprOrMip, setMprOrMip }: Props) => {
  const Volumes = useContext(VolumesContext);
  const { activeViewportId } = useContext(ActiveViewportIdContext);
  const setLoading = useContext(LoadingContext);
  const [modal, contextHolder] = Modal.useModal();

  const handleMPR = useCallback(async (orientation: string) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(activeViewportId);
    if (!viewport) {
      modal.info({ title: "当前未选中任何图像", content: "请选中图像后再进行此操作", okText: "知道了" });
      return;
    }

    // @ts-ignore
    const seriesIndex = viewport.seriesIndex;

    if (orientation === 'cancel') {
      if (viewport.type === ViewportType.STACK) return;
      // @ts-ignore
      const isMIP = viewport.isMIP;
      const stackViewport = await utilities.convertVolumeToStackViewport({ viewport: viewport as Types.IVolumeViewport, options: {} });
      // @ts-ignore
      stackViewport.seriesIndex = seriesIndex;
      isMIP ? MipToolGroup.removeViewports(renderingEngineId, activeViewportId) : VolumeToolGroup.removeViewports(renderingEngineId, activeViewportId);
      StackToolGroup.addViewport(activeViewportId, renderingEngineId);
      setMprOrMip('none');
    } else {
      // 启用MPR
      if (viewport.type === ViewportType.STACK) {
        setLoading(true);
        setTimeout(() => {
          setLoading(false);
        }, 1000);
        // stack转volume
        const volumeViewport = await utilities.convertStackToVolumeViewport({
          viewport: viewport as Types.IStackViewport,
          options: { volumeId: Volumes[seriesIndex].volumeId },
        });
        volumeViewport.setOrientation(orientation as any);
        // @ts-ignore
        volumeViewport.seriesIndex = seriesIndex;
        StackToolGroup.removeViewports(renderingEngineId, activeViewportId);
        VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);

      } else {
        // 切换轴位
        const volumeViewport = viewport as Types.IVolumeViewport;
        // @ts-ignore
        // if (!volumeViewport.isMIP)
        volumeViewport.setOrientation(orientation as any);
        // else {
        //   // @ts-ignore
        //   volumeViewport.isMIP = false;
        //   // @ts-ignore
        //   volumeViewport.resetProperties(Volumes[seriesIndex].volumeId);
        //   volumeViewport.setOrientation(Enums.OrientationAxis[orientation]);
        //   MipToolGroup.removeViewports(renderingEngineId, activeViewportId)
        //   VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
        //   volumeViewport.render();
        // }

      }
      setMprOrMip('MPR');
    }
  }, [Volumes, activeViewportId, modal, setLoading, setMprOrMip]);

  const MPRDropdownBtnProps: DwBtnProps = {
    icon: <MPRIcon />,
    title: "MPR",
    dropdownItems,
    // itemOnclick: async (orientation: string) => {
    //   const renderingEngine = getRenderingEngine(renderingEngineId);
    //   const viewport = renderingEngine.getViewport(activeViewportId);

    //   if (!viewport) {
    //     modal.info({ title: "当前未选中任何图像", content: "请选中图像后再进行此操作", okText: "知道了" });
    //     return;
    //   }

    //   // @ts-ignore
    //   const seriesIndex = viewport.seriesIndex;

    //   if (orientation === '取消 MPR') {
    //     if (viewport.type === ViewportType.STACK) return;
    //     // @ts-ignore
    //     const isMIP = viewport.isMIP;
    //     const stackViewport = await utilities.convertVolumeToStackViewport({ viewport: viewport as Types.IVolumeViewport, options: {} });
    //     // @ts-ignore
    //     stackViewport.seriesIndex = seriesIndex;
    //     isMIP ? MipToolGroup.removeViewports(renderingEngineId, activeViewportId) : VolumeToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //     StackToolGroup.addViewport(activeViewportId, renderingEngineId);
    //     setMprOrMip('none');
    //   } else {
    //     // 启用MPR
    //     if (viewport.type === ViewportType.STACK) {
    //       // stack转volume
    //       const volumeViewport = await utilities.convertStackToVolumeViewport({
    //         viewport: viewport as Types.IStackViewport,
    //         options: { volumeId: Volumes[seriesIndex].volumeId },
    //       });
    //       // @ts-ignore
    //       volumeViewport.seriesIndex = seriesIndex;
    //       StackToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //       VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
    //     } else {
    //       // 切换轴位
    //       const volumeViewport = viewport as Types.IVolumeViewport;
    //       // @ts-ignore
    //       if (!volumeViewport.isMIP)
    //         volumeViewport.setOrientation(Enums.OrientationAxis[orientation]);

    //       else {
    //         // @ts-ignore
    //         volumeViewport.isMIP = false;
    //         // @ts-ignore
    //         volumeViewport.resetProperties(Volumes[seriesIndex].volumeId);
    //         volumeViewport.setOrientation(Enums.OrientationAxis[orientation]);
    //         MipToolGroup.removeViewports(renderingEngineId, activeViewportId)
    //         VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
    //         volumeViewport.render();
    //       }

    //     }
    //     setMprOrMip('MPR');
    //   }

    //   // if (viewport.type === ViewportType.STACK && orientation !== '取消 MPR') { // 从 stack 转 volume，并以指定的轴位进行显示
    //   //   const volumeViewport = await utilities.convertStackToVolumeViewport({
    //   //     viewport: viewport as Types.IStackViewport,
    //   //     options: { volumeId: Volumes[seriesIndex].volumeId },
    //   //   });
    //   //   // @ts-ignore
    //   //   volumeViewport.seriesIndex = seriesIndex;
    //   //   StackToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //   //   VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
    //   //   setMprOrMip('MPR');
    //   //   return;
    //   // }
    //   // if (viewport.type === ViewportType.ORTHOGRAPHIC && orientation === '取消 MPR') {  // 从 volume 转 stack，取消 MPR
    //   //   // @ts-ignore
    //   //   const isMIP = viewport.isMIP
    //   //   const stackViewport = await utilities.convertVolumeToStackViewport({ viewport: viewport as Types.IVolumeViewport, options: {} });
    //   //   // @ts-ignore
    //   //   stackViewport.seriesIndex = seriesIndex;
    //   //   isMIP ? MipToolGroup.removeViewports(renderingEngineId, activeViewportId) : VolumeToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //   //   StackToolGroup.addViewport(activeViewportId, renderingEngineId);
    //   //   setMprOrMip('none');
    //   //   return;
    //   // }
    //   // if (viewport.type === ViewportType.ORTHOGRAPHIC && orientation !== '取消 MPR') {  // 保持 volume，切换轴位
    //   //   const volumeViewport = viewport as Types.IVolumeViewport;
    //   //   // @ts-ignore
    //   //   if (volumeViewport.isMIP) {
    //   //     // @ts-ignore
    //   //     volumeViewport.isMIP = false;
    //   //     // @ts-ignore
    //   //     volumeViewport.resetProperties(Volumes[seriesIndex].volumeId);
    //   //     volumeViewport.setOrientation(Enums.OrientationAxis[orientation]);
    //   //     MipToolGroup.removeViewports(renderingEngineId, activeViewportId)
    //   //     VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
    //   //     volumeViewport.render();
    //   //   } else {
    //   //     volumeViewport.setOrientation(Enums.OrientationAxis[orientation]);
    //   //   }
    //   //   setMprOrMip('MPR');
    //   //   return;
    //   // }
    // },
    isSelected: mprOrMip === 'MPR',
    itemOnClick: handleMPR
  }

  return (
    <>
      <DwBtn {...MPRDropdownBtnProps} />
      {contextHolder}
    </>
  )
})

export default MPRBtn
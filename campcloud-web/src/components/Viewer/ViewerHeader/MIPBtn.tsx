// @ts-nocheck
import React, { memo, useCallback, useContext } from "react";
import { getRenderingEngine, Types, Enums, utilities } from "@cornerstonejs/core";
import { VolumesContext, ActiveViewportIdContext, CinePlayingContext, LoadingContext } from "../ViewerProvider";
import { renderingEngineId, StackToolGroup, VolumeToolGroup, MipToolGroup } from "../function";
import { Dropdown, MenuProps, Modal } from "antd";
import { MIPIcon } from "./Icons";
import { NormalBtn } from "./Btns";
import { IVolumeViewport } from "@cornerstonejs/core/dist/esm/types";

const { BlendModes, ViewportType } = Enums;

interface Props {
  mprOrMip: string,
  setMprOrMip: React.Dispatch<React.SetStateAction<string>>
}

const DropdownItems: MenuProps["items"] = [
  {
    key: "thickness",
    label: "请选择厚度",
    disabled: true
  },
  {
    key: "5",
    label: "5",
  },
  {
    key: "10",
    label: "10",
  },
  {
    key: "30",
    label: "30",
  },
  {
    key: "999",
    label: "MAX"
  },
  {
    key: "-1",
    label: "取消"
  }
];

const MIPBtn = memo(({ mprOrMip, setMprOrMip }: Props) => {
  // const Volumes = useContext(VolumesContext)
  // const setLoading = useContext(LoadingContext)
  const { activeViewportId } = useContext(ActiveViewportIdContext);
  const { cinePlaying, setCinePlaying } = useContext(CinePlayingContext)
  const [modal, contextHolder] = Modal.useModal();

  const handleClick = useCallback((key: number) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(activeViewportId);

    if (!viewport) {
      modal.info({ title: "当前未选中任何图像", content: "请选中图像后再进行此操作", okText: "知道了" });
      return;
    }
    if (viewport.type !== ViewportType.ORTHOGRAPHIC) {
      modal.warning({ content: "请先开启MPR" });
      return;
    }

    const volumeViewport = viewport as IVolumeViewport;
    // @ts-ignore
    if (key === -1) {
      // 关闭MIP
      // @ts-ignore   此属性原Cornerstone中不存在，仅作为标识此viewport的状态是否为MIP
      volumeViewport.isMIP = false;
      MipToolGroup.removeViewports(renderingEngineId, activeViewportId);
      VolumeToolGroup.addViewport(activeViewportId, renderingEngineId);
      volumeViewport.setBlendMode(BlendModes.AVERAGE_INTENSITY_BLEND);
      volumeViewport.setSlabThickness(1);
      volumeViewport.render();
      setMprOrMip('none');

    } else {
      // 开启MIP
      if (cinePlaying) setCinePlaying(false);

      let thickness = 1;
      if (key === 999) {
        const imageData = viewport.getImageData();
        if (!imageData) {
          console.warn("No image data");
          return;
        }
        const { dimensions } = imageData;
        thickness = Math.sqrt(
          dimensions[0] ** 2 + dimensions[1] ** 2 + dimensions[2] ** 2
        );
      } else {
        thickness = key;
      }

      // @ts-ignore   此属性原Cornerstone中不存在，仅作为标识此viewport的状态是否为MIP
      volumeViewport.isMIP = true;



      volumeViewport.setBlendMode(BlendModes.MAXIMUM_INTENSITY_BLEND);
      volumeViewport.setSlabThickness(thickness);
      MipToolGroup.addViewport(activeViewportId, renderingEngineId);
      VolumeToolGroup.removeViewports(renderingEngineId, activeViewportId);
      volumeViewport.render();
      setMprOrMip('MIP');
    }

  }, [activeViewportId, cinePlaying, modal, setCinePlaying, setMprOrMip]);

  const MIPBtnProps = {
    icon: <MIPIcon />,
    title: "MIP",
    // onClick: async () => {
    //   const renderingEngine = getRenderingEngine(renderingEngineId);
    //   const viewport = renderingEngine.getViewport(activeViewportId);

    //   if (!viewport) {
    //     modal.info({ title: "当前未选中任何图像", content: "请选中图像后再进行此操作", okText: "知道了" });
    //     return
    //   }

    //   // @ts-ignore
    //   if (viewport.isMIP) {
    //     // 关闭MIP
    //     // @ts-ignore
    //     const seriesIndex = viewport.seriesIndex
    //     const stackViewport = await utilities.convertVolumeToStackViewport({ viewport: viewport as Types.IVolumeViewport, options: {} });
    //     // @ts-ignore
    //     stackViewport.seriesIndex = seriesIndex
    //     // @ts-ignore   此属性原Cornerstone中不存在，仅作为标识此viewport的状态是否为MIP
    //     stackViewport.isMIP = false

    //     MipToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //     StackToolGroup.addViewport(activeViewportId, renderingEngineId);

    //     stackViewport.render();

    //     setMprOrMip('none')
    //   } else {
    //     // 开启MIP
    //     if (viewport.type !== ViewportType.ORTHOGRAPHIC) {
    //       modal.warning({ content: "请先开启MPR" });
    //       return;
    //     }

    //     if (cinePlaying) setCinePlaying(false);

    //     setLoading(true)
    //     let volumeViewport = viewport as Types.IVolumeViewport

    //     if (viewport.type !== ViewportType.ORTHOGRAPHIC) {  // 若当前viewport不是volume窗，则要先转成volume窗
    //       // @ts-ignore
    //       const seriesIndex = viewport.seriesIndex
    //       volumeViewport = await utilities.convertStackToVolumeViewport({
    //         viewport: viewport as Types.IStackViewport,
    //         options: { volumeId: Volumes[seriesIndex].volumeId },
    //       });
    //       // @ts-ignore
    //       volumeViewport.seriesIndex = seriesIndex

    //       StackToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //     } else {
    //       VolumeToolGroup.removeViewports(renderingEngineId, activeViewportId);
    //     }

    //     // @ts-ignore   此属性原Cornerstone中不存在，仅作为标识此viewport的状态是否为MIP
    //     volumeViewport.isMIP = true

    //     // @ts-ignore
    //     const VolumeDimensions = Volumes[volumeViewport.seriesIndex].dimensions;
    //     const slabThickness = Math.sqrt(
    //       VolumeDimensions[0] * VolumeDimensions[0] +
    //       VolumeDimensions[1] * VolumeDimensions[1] +
    //       VolumeDimensions[2] * VolumeDimensions[2]
    //     );

    //     setTimeout(() => {
    //       volumeViewport.setBlendMode(BlendModes.MAXIMUM_INTENSITY_BLEND);
    //       volumeViewport.setSlabThickness(10);
    //       MipToolGroup.addViewport(activeViewportId, renderingEngineId);
    //       volumeViewport.render();
    //       setLoading(false)
    //     }, 500)

    //     setMprOrMip('MIP')
    //   }
    // },
    isSelected: mprOrMip === 'MIP',
    // onClick: handleClick
  }

  return (
    <Dropdown
      menu={{
        items: DropdownItems,
        onClick: ({ key }) => handleClick(Number(key)),
      }}
      placement="bottom"
      trigger={['click']}
    >
      <div>
        <NormalBtn {...MIPBtnProps} />
        {contextHolder}
      </div>
    </Dropdown>
  )
})

export default MIPBtn
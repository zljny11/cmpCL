// @ts-nocheck
import React, { memo, useContext } from "react"
import { ActiveViewportIdContext } from "../ViewerProvider";
import { getRenderingEngine, Types } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { renderingEngineId, switchTool } from "../function";
import { Modal } from "antd";
import { SunOutlined } from "@ant-design/icons";
import { DwArrowBtn } from "./Btns"

const { WindowLevelTool } = cornerstoneTools;

const WWWLBtn: React.FC<{
  curTool: string,
  setCurTool: React.Dispatch<React.SetStateAction<string>>
}> = memo(({ curTool, setCurTool }) => {
  const { activeViewportId } = useContext(ActiveViewportIdContext)
  const [modal, contextHolder] = Modal.useModal();

  const WWWLDwArrowBtnProps = {
    icon: <SunOutlined />,
    title: 'WW/WL',
    onClick: () => switchTool(curTool, setCurTool, WindowLevelTool),
    dropdownItems: [
      ['Abdomen', '60/400'],
      ['Angio', '300/600'],
      ['Bone', '300/1500'],
      ['Brain', '40/80'],
      ['Chest', '40/400'],
      ['Lung', '-400/1500'],
    ],
    itemOnclick: (value: string) => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(activeViewportId) as Types.IVolumeViewport;
      if (!viewport) {
        modal.info({
          title: "当前未选中任何图像",
          content: "请选中图像后再进行此操作",
          okText: "知道了",
        });
        return
      }
      const [lower, upper] = value.split('/');
      console.log("default voiRange:");
      console.log(viewport.getDefaultProperties["voiRange"]);
      console.log("current voiRange:");
      console.log(viewport.getProperties["voiRange"]);
      console.log("changed voiRange:");

      viewport.setProperties({ voiRange: { upper: parseInt(upper), lower: parseInt(lower) } });
      console.log(viewport.getProperties["voiRange"]);
      viewport.render();
    },
    isSelected: curTool === WindowLevelTool.toolName
  }

  return (
    <>
      <DwArrowBtn {...WWWLDwArrowBtnProps} />
      {contextHolder}
    </>
  )
})

export default WWWLBtn

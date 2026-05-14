// @ts-nocheck
import React, { memo, useState, useMemo, useContext, useEffect } from "react"
import { useNavigate } from "react-router-dom";
import { ImageDatasContext, ActiveViewportIdContext } from "../ViewerProvider";
import { getRenderingEngine, Types, Enums } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { Tooltip, Button } from "antd";
import { LeftOutlined, ZoomInOutlined, ReloadOutlined } from "@ant-design/icons";
import { renderingEngineId, switchTool, resetTools } from "../function";
import { PanIcon } from "./Icons";
import { NormalBtn } from "./Btns";
import WWWLBtn from "./WWWLBtn";
import LayoutBtn from "./LayoutBtn"
import MPRBtn from "./MPRBtn";
import MIPBtn from "./MIPBtn";
import PopMenuBtn from "./PopMenuBtn";
import DownloadSeriesBtn from "./DownloadSeriesBtn";
import logo from '../../../images/logonamegrey.png';
// import { Rotate3DBtn } from "./Btns";

const { ViewportType } = Enums;
const { WindowLevelTool, ZoomTool, PanTool } = cornerstoneTools;

const ViewerHeader = memo(() => {
  const navigate = useNavigate();
  const ImageDatas = useContext(ImageDatasContext)
  const { activeViewportId } = useContext(ActiveViewportIdContext)
  const [curTool, setCurTool] = useState<string>(WindowLevelTool.toolName)
  const [mprOrMip, setMprOrMip] = useState('none')

  useEffect(() => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    if (!renderingEngine || ImageDatas.length === 0) {
      setMprOrMip('none')
      return;
    }
    const viewport = renderingEngine.getViewport(activeViewportId) as Types.IVolumeViewport;
    if (!viewport) return

    if (viewport.type === ViewportType.STACK) setMprOrMip('none')
    // @ts-ignore
    if (viewport.type === ViewportType.ORTHOGRAPHIC && !viewport.isMIP) setMprOrMip('MPR')
    // @ts-ignore
    if (viewport.isMIP) setMprOrMip('MIP')
  }, [ImageDatas.length, activeViewportId])

  const goBackListPage = () => {
    resetTools();
    navigate(-1);
  };

  const btns = useMemo(() => [
    {
      icon: <ZoomInOutlined />,
      title: "缩放",
      onClick: () => switchTool(curTool, setCurTool, ZoomTool),
      isSelected: curTool === ZoomTool.toolName
    },
    {
      icon: <PanIcon />,
      title: "拖拽",
      onClick: () => switchTool(curTool, setCurTool, PanTool),
      isSelected: curTool === PanTool.toolName
    }
  ], [curTool])

  const resetBtnProps = {
    icon: <ReloadOutlined />,
    title: "重置",
    onClick: () => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(activeViewportId) as Types.IVolumeViewport;
      if (viewport) {
        const { voiRange } = viewport.getDefaultProperties();
        viewport.setProperties({ voiRange });
        viewport.resetCamera();
        viewport.render();
      }
    },
  }

  return (
    <>
      <div className="leftContainer">
        <Tooltip placement="bottom" title='返回' >
          <Button className="backBtn" icon={<LeftOutlined />} type="link" size="large" onClick={goBackListPage} />
        </Tooltip>

      </div>

      <div className="toolsMenu">
        {/* {btns.map(btn => <NormalBtn key={btn.title} {...btn} />)} */}
        <WWWLBtn curTool={curTool} setCurTool={setCurTool} />

        <LayoutBtn />
        <MPRBtn {...{ mprOrMip, setMprOrMip }} />
        <MIPBtn {...{ mprOrMip, setMprOrMip }} />
        {/* <Rotate3DBtn /> */}
        <NormalBtn {...resetBtnProps} />
        <DownloadSeriesBtn />
        <PopMenuBtn curTool={curTool} setCurTool={setCurTool} />

      </div>
      <img src={logo} alt="logo" className="logo" />
    </>
  )
})

export default ViewerHeader

// @ts-nocheck
import React, { useState, useContext } from "react"
import { DICOMTagInfosContext } from "../ViewerProvider";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { MoreOutlined, AimOutlined, EyeInvisibleOutlined } from "@ant-design/icons"
import { switchTool } from "../function";
import { NormalBtn, DwBtn } from "./Btns"
import CineBtn from "./CineBtn"
import ScreenCapture from "./ScreenCapture";
// import { FalseColorIcon } from "./Icons";

const { DragProbeTool } = cornerstoneTools;

const PopMenuBtn = ({ curTool, setCurTool }: {
  curTool: string,
  setCurTool: React.Dispatch<React.SetStateAction<string>>
}) => {
  const { tagDisplay, setTagDisplay } = useContext(DICOMTagInfosContext)
  const [collapsed, setCollapsed] = useState(true)

  const PopMenuBtnProps = {
    icon: <MoreOutlined />,
    title: "更多",
    onClick: () => setCollapsed(!collapsed),
    isSelected: !collapsed
  }

  const ProbeBtnProps = {
    icon: <AimOutlined />,
    title: "探针",
    onClick: () => switchTool(curTool, setCurTool, DragProbeTool),
    isSelected: curTool === DragProbeTool.toolName
  }

  const TagDisplayBtnProps = {
    icon: <EyeInvisibleOutlined />,
    title: "隐藏",
    onClick: () => setTagDisplay(!tagDisplay),
    isSelected: !tagDisplay
  }

  /* const FalseColorBtnProps = {
    icon: <FalseColorIcon />,
    title: '伪彩',
    dropdownItems: [''],
    itemOnclick: () => { }
  } */

  return (
    <>
      <NormalBtn {...PopMenuBtnProps} />

      <div className="popMenu" style={{ height: collapsed ? 0 : '54px' }}>
        <NormalBtn {...ProbeBtnProps} />
        <CineBtn />
        <NormalBtn {...TagDisplayBtnProps} />
        <ScreenCapture />
        {/* <DwBtn {...FalseColorBtnProps} /> */}
      </div>
    </>
  )
}

export default PopMenuBtn
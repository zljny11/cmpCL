// @ts-nocheck
import React from "react";
import { Tooltip } from "antd";
import { TooltipOverlayInnerStyle } from "../../function";
import { cn } from "@utils";

const NormalBtn: React.FC<{
  icon: React.JSX.Element,
  title: string,
  onClick?: () => void,
  isSelected?: boolean,
  tooltipZIndex?: number,
}> = (props) => {
  const { icon, title, onClick, isSelected = false, tooltipZIndex = 999 } = props

  return (
    <Tooltip
      className="NormalBtn"
      placement="bottom"
      title={title}
      styles={{ body: TooltipOverlayInnerStyle }}
      zIndex={tooltipZIndex}
    >
      <div className={cn('btnContainer', { isSelected })} onClick={onClick}>
        <div className="iconContainer">
          {icon}
        </div>
      </div>
    </Tooltip>
  )
}

export default NormalBtn
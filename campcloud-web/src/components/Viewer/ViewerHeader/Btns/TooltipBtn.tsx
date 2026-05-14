// @ts-nocheck
import { Tooltip, TooltipProps } from 'antd';
import React from 'react'
import ToolBtn, { ToolBtnProps } from './ToolBtn';

const TooltipOverlayInnerStyle = {
  backgroundColor: "#000",
  border: "1px solid #0069a7",
};

type TooltipBtnProps = TooltipProps & ToolBtnProps;

// https://ant.design/components/tooltip#why-is-the-tooltip-for-my-custom-component-not-opening
const ComponentWithEvents: React.FC<React.HTMLAttributes<HTMLSpanElement> & ToolBtnProps> = ({ icon, selected, whenClick, ...props }) => (
  <span {...props}>
    <ToolBtn icon={icon} selected={selected} whenClick={whenClick} />
  </span>
);

const TooltipBtn = ({
  placement = "bottom",
  title,
  zIndex = 999, //如果tooltip挡住dropdown, 降低该属性
  icon,
  whenClick,
  selected
}: TooltipBtnProps) => {
  const toolBtnProps = {
    icon,
    whenClick,
    selected
  }

  return (
    <Tooltip
      placement={placement}
      title={title}
      zIndex={zIndex}
    >
      <ComponentWithEvents {...toolBtnProps} />
    </Tooltip>
  )
}

export default TooltipBtn;
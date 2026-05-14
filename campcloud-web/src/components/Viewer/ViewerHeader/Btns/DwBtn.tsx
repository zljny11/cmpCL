// @ts-nocheck
import React from "react";
import { Tooltip, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { TooltipOverlayInnerStyle } from "../../function";

export interface DwBtnProps {
  icon: React.JSX.Element,
  title: string,
  onClick?: () => void,
  dropdownItems: MenuProps["items"],
  itemOnClick: (key: string) => Promise<void>,
  isSelected?: boolean
}

const DwBtn = (props: DwBtnProps) => {
  const { icon, title, onClick, dropdownItems, itemOnClick, isSelected } = props;

  return (
    <Dropdown
      menu={{
        items: dropdownItems,
        onClick: ({ key }) => itemOnClick(key),
        // selectable: true
      }}
      trigger={["click"]}
      placement="bottom"
    >
      <Tooltip
        className="DwBtn"
        placement="bottom"
        title={title}
        styles={{ body: TooltipOverlayInnerStyle }}
        zIndex={999}  // 999就足够了，默认值是1070, 降低其数值避免遮挡Dropdown的弹出栏
      >
        <div className={`btnContainer ${isSelected ? 'isSelected' : ''}`} onClick={onClick ?? null}>
          <div className="iconContainer">
            {icon}
          </div>
        </div>
      </Tooltip>
    </Dropdown>
  )
}

export default DwBtn
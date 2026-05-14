// @ts-nocheck
import React from "react";
import { Tooltip, Dropdown, ConfigProvider } from "antd";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { TooltipOverlayInnerStyle } from "../../function";

const DwArrowBtn: React.FC<{
  icon: React.JSX.Element,
  title: string,
  onClick: () => void,
  dropdownItems: string[][],
  itemOnclick: (orientation: string) => void
  isSelected?: boolean
}> = (props) => {
  const { icon, title, onClick, dropdownItems, itemOnclick, isSelected } = props

  const DropdownItems: MenuProps["items"] = dropdownItems.map((dropdownItem) => {
    return {
      key: dropdownItem[1],
      label: (
        <div className="dropdownItem">
          {dropdownItem.map((item: string, index: number) => <div key={index}>{item}</div>)}
        </div>
      )
    }
  })

  return (
    <ConfigProvider
      theme={{
        components: {
          Button: {
            paddingInline: 0,
            paddingBlock: 0,
            contentLineHeight: 0
          },
        },
      }}>
      <Dropdown.Button
        className="DwArrowBtn"
        icon={<DownOutlined />}
        menu={{
          items: DropdownItems,
          onClick: ({ key }) => itemOnclick(key),
        }}
        type="link"
        trigger={["click"]}
      >
        <Tooltip
          placement="bottom"
          title={title}
          styles={{ body: TooltipOverlayInnerStyle }}
        >
          <div className={`btnContainer ${isSelected ? 'isSelected' : ''}`} onClick={onClick}>
            <div className="iconContainer">
              {icon}
            </div>
          </div>
        </Tooltip>
      </Dropdown.Button>
    </ConfigProvider>
  )
}

export default DwArrowBtn
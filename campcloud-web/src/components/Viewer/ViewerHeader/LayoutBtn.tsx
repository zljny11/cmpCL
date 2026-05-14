// @ts-nocheck
import React, { useState, useContext, memo } from "react";
import { RowColumnContext, ActiveViewportIdContext } from "../ViewerProvider";
import { Tooltip, Popover, ConfigProvider } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { TooltipOverlayInnerStyle } from "../function";

const row = 3, column = row, gridSquareSize = 20;
const layoutDiv = new Array(row * column).fill(0);

interface LayoutSelectorProps {
  setSelecting: React.Dispatch<React.SetStateAction<boolean>>;
}
const LayoutSelector: React.FC<LayoutSelectorProps> = (props) => {
  const { setRowColumn } = useContext(RowColumnContext)
  const { activeViewportId, setActiveViewportId } = useContext(ActiveViewportIdContext)
  const { setSelecting } = props;
  const [hoveredIndex, setHoveredIndex] = useState(0);
  const hoverX = hoveredIndex % column;
  const hoverY = Math.floor(hoveredIndex / column);

  const isHovered = (index: number) => {
    const x = index % column;
    const y = Math.floor(index / column);

    return x <= hoverX && y <= hoverY;
  };

  const needResetActiveViewportId = (row: number, column: number) => {
    const currentActiveViewportRowColumn = activeViewportId.split('_')
    if (currentActiveViewportRowColumn[0][8] > row || currentActiveViewportRowColumn[1] > column) {
      return true
    } else {
      return false
    }
  }

  return (
    <div className="LayoutSelector"
      style={{
        gridTemplateRows: `repeat(${row},${gridSquareSize}px)`,
        gridTemplateColumns: `repeat(${row},${gridSquareSize}px)`,
      }}>
      {layoutDiv.map((_, index) => {
        return (
          <div
            key={index}
            style={{
              backgroundColor: isHovered(index) ? "#5acce6" : "#000",
            }}
            onClick={() => {
              const x = index % column;
              const y = Math.floor(index / column);
              setRowColumn([y + 1, x + 1])
              if (needResetActiveViewportId(y + 1, x + 1)) {   // 如果此时原 active viewport 已经没了，就要把 activeViewportId 重置为 viewport1_1
                setActiveViewportId('viewport1_1')
              }
              setSelecting(false);
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(-1)}
          ></div>
        );
      })}
    </div>
  );
};

const LayoutBtn: React.FC = memo(() => {
  const [selecting, setSelecting] = useState(false);

  return (
    <ConfigProvider
      theme={{
        token: { colorBgElevated: "#0069a7" },
      }}
    >
      <Tooltip
        placement="bottom"
        title={"布局"}
        styles={{ body: TooltipOverlayInnerStyle }}
      >
        <Popover
          placement="bottom"
          trigger={"click"}
          content={<LayoutSelector setSelecting={setSelecting} />}
          zIndex={9999}
          open={selecting}
          onOpenChange={(open: boolean) => setSelecting(open)}
          styles={{ body: TooltipOverlayInnerStyle }}
        >
          <div className="btnContainer">
            <div
              className="iconContainer"
              style={{ color: selecting ? "rgb(111, 165, 235)" : "" }}
            >
              <AppstoreOutlined />
            </div>
          </div>
        </Popover>
      </Tooltip>
    </ConfigProvider>
  );
});

export default LayoutBtn;

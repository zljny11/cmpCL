// @ts-nocheck
import React, { useContext, memo } from "react"
import { ImageDatasContext } from "../ViewerProvider"
import { SwitcherOutlined } from '@ant-design/icons';
import Viewport from "../Viewport"

const ViewerSider = memo(() => {
  const ImageDatas = useContext(ImageDatasContext)

  return (
    <>
      {
        ImageDatas && ImageDatas.map((ImageData, index: number) => {
          const { ImageIds, seriesDesc, scanTime } = ImageData;
          const viewportId = index.toString();

          return (
            <div className="ViewerSiderItem" draggable
              onDragStart={(e) => e.dataTransfer.setData("index", viewportId)} key={index}
            >
              <Viewport
                viewportId={viewportId}
                ImageIds={[ImageIds[Math.floor(ImageIds.length / 2)]]}
              />
              <div className="px-2 flex">
                <SwitcherOutlined className="mr-1" />
                <div className="mr-4">{ImageIds.length}</div>
                <div>{scanTime}</div>
              </div>
              <div className="px-2">{seriesDesc}</div>
            </div>
          )
        })
      }
    </>
  )
})
export default ViewerSider
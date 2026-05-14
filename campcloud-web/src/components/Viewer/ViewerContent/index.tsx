// @ts-nocheck
import React, { useState, useContext } from "react";
import { ImageDatasContext, RowColumnContext } from "../ViewerProvider";
import { generateViewportIds } from "../function";
import Viewport from "../Viewport";

const ViewerContent = () => {
  const ImageDatas = useContext(ImageDatasContext);
  const { rowColumn } = useContext(RowColumnContext);
  const [row, column] = rowColumn

  const viewportIds = generateViewportIds(row, column);

  return (
    <>
      {
        ImageDatas.length ?
          <div
            className="viewportGrid"
            id="viewportGrid"
            style={{
              gridTemplateRows: `repeat(${row},auto)`,
              gridTemplateColumns: `repeat(${column},auto)`,
            }}
          >
            {
              viewportIds.map((viewportId) => {
                return (
                  <Viewport
                    key={viewportId}
                    viewportId={viewportId}
                  />
                )
              })
            }
          </div> : null
      }
    </>
  )
}

export default ViewerContent

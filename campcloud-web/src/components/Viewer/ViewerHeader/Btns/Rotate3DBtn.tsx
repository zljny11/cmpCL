// @ts-nocheck
import React from 'react';
import { LuRotate3D } from "react-icons/lu";
import TooltipBtn from './TooltipBtn';

type Props = {}

const Rotate3DBtn = (props: Props) => {
  return (
    <TooltipBtn
      icon={<LuRotate3D size={24} style={{ marginTop: 4, margin: 8 }} />}
      title="3D旋转"
    />
  )
}

export default Rotate3DBtn;
// @ts-nocheck
import React, { useState } from 'react';
import './index.less';
import { VscGithubInverted } from "react-icons/vsc";
import { cn } from '@utils';

export type ToolBtnProps = {
  icon?: React.ReactNode,
  whenClick?: () => void,
  selected?: boolean
}

const ToolBtn = ({
  icon = <VscGithubInverted size={30} />,
  whenClick,
  selected = false,
}: ToolBtnProps) => {

  const [isSelected, setIsSelected] = useState(false);

  const toggleSelected = () => {
    setIsSelected(!isSelected);
  }

  return (
    <div className={cn("toolBtn", isSelected && "toolBtn-selected")} onClick={toggleSelected}>
      {icon}
    </div>
  )
}

export default ToolBtn;
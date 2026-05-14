// @ts-nocheck
import React, { memo, useContext } from "react";
import { CinePlayingContext } from "../ViewerProvider";
import { PlayCircleOutlined } from "@ant-design/icons";
import { NormalBtn } from "./Btns";

const CineBtn = memo(() => {
  const { cinePlaying, setCinePlaying } = useContext(CinePlayingContext);

  const CineBtnProps = {
    icon: <PlayCircleOutlined />,
    title: "自动播放",
    onClick: () => setCinePlaying(!cinePlaying),
    isSelected: cinePlaying
  }

  return <NormalBtn {...CineBtnProps} />
})

export default CineBtn
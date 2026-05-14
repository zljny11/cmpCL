// @ts-nocheck
import React, { useState } from 'react';
import { Modal } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import html2canvas from "html2canvas";
import { NormalBtn } from './Btns';

const ScreenCapture: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [screenshot, setScreenshot] = useState(null);

  const ScreenCaptureProps = {
    icon: <CameraOutlined />,
    title: "捕获",
    onClick: () => {
      const element = document.getElementById("viewportGrid");
      html2canvas(element).then(canvas => {
        setScreenshot(canvas.toDataURL());
        setOpen(true);
      });
    },
    isSelected: open,
  }

  const handleOk = () => {
    //下载截图
    const link = document.createElement('a');
    link.href = screenshot;
    link.download = 'screenshot.png'; // 下载文件名
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <>
      <NormalBtn {...ScreenCaptureProps} />
      <Modal
        open={open}
        okText="下载"
        cancelText="取消"
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <h2>图像预览</h2>
        {screenshot && <img src={screenshot} alt="截图" />}
      </Modal>
    </>
  );
};

export default ScreenCapture;
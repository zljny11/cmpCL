// @ts-nocheck
import React, { useState, useContext } from "react";
import { ImageDatasContext } from "../ViewerProvider";
import { Button, Modal, Progress, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { NormalBtn } from "./Btns";
import axiosInstances from "../../../axiosInstance";
import { useAppSelector } from "../../../redux/hooks";

const DownloadSeriesBtn: React.FC = () => {
  const ImageDatas = useContext(ImageDatasContext);
  const { apiId } = useAppSelector(state => state.ApiIdReducer);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modal, contextHolder] = Modal.useModal();

  const downloadSeries = async () => {
    try {
      setLoading(true);
      setProgress(0);
      // 获取当前查看的图像序列数据
      const patientId = ImageDatas[0]?.patientId;
      if (!patientId) {
        message.error("无法获取患者信息");
        setLoading(false);
        return;
      }

      // 创建一个用于跟踪进度的 AbortController
      const controller = new AbortController();

      // 发起下载请求
      const response = await axiosInstances[apiId].post(
        "/downloadSeries",
        { patientId, seriesUIDs: ImageDatas.map(row => row.seriesUID), seriesIds: ImageDatas.map(row => row.seriesId) },
        {
          responseType: "blob",
          signal: controller.signal,
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.progress) {
              setProgress(Math.round(progressEvent.progress * 100));
            }
          },
        }
      );

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `series_${patientId}.zip`);
      document.body.appendChild(link);
      link.click();

      // 清理
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success("图像序列下载成功");
    } catch (error) {
      if (error.name === "CanceledError") {
        message.warning("下载已取消");
      } else {
        console.error("下载失败:", error);
        message.error("图像序列下载失败");
      }
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleDownload = async () => {
    if (!ImageDatas || ImageDatas.length === 0) {
      message.warning("没有可下载的图像序列");
      return;
    }

    modal.confirm({
      title: "下载图像序列",
      content: (
        <div>
          <p>确定要下载当前患者的全部图像序列吗？</p>
          <p>共 {ImageDatas.length} 个序列，可能需要一些时间。</p>
        </div>
      ),
      okText: "确认下载",
      cancelText: "取消",
      onOk: downloadSeries,
    });
  };

  return (
    <>
      <NormalBtn
        icon={<DownloadOutlined />}
        title="下载序列"
        onClick={handleDownload}
        isSelected={loading}
      />

      <Modal
        open={loading}
        title="正在下载图像序列"
        footer={null}
        closable={false}
      >
        <div style={{ textAlign: "center", padding: "20px" }}>
          <Progress type="circle" percent={progress} />
          <p style={{ marginTop: "20px" }}>正在准备下载，请稍候...</p>
          <Button
            onClick={() => {
              setLoading(false);
              setProgress(0);
            }}
            disabled={progress === 100}
          >
            取消下载
          </Button>
        </div>
      </Modal>
      {contextHolder}
    </>
  );
};

export default DownloadSeriesBtn;

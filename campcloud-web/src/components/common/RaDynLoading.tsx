import React from "react";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

const RaDynLoading: React.FC<{ loading: boolean }> = (props) => {
  const { loading } = props;

  const AntdLoadingIcon = (
    <LoadingOutlined
      style={{ fontSize: 40 }}
      spin
    />
  );

  return (
    <Spin spinning={loading} indicator={AntdLoadingIcon} fullscreen />
  );
}

export default RaDynLoading;

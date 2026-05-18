import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { App, Button, Collapse, Descriptions, Drawer, Empty, List, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { appConfig } from '../../../../app/config/env';
import { http } from '../../../../services/http';
import { RequirementPreviewPayload } from '../../../../types/requirements';

interface Props {
  open: boolean;
  data: RequirementPreviewPayload | null;
  onClose: () => void;
}

export function PacsPreviewDrawer({ open, data, onClose }: Props) {
  const { message } = App.useApp();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const handleDownload = async (url: string, fileName: string) => {
    const downloadKey = `${url}-${fileName}`;
    setDownloadingKey(downloadKey);

    try {
      const blob = (await http.get(url, {
        baseURL: appConfig.apiBaseUrl,
        responseType: 'blob',
      })) as unknown as Blob;
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      message.error('文件下载失败');
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <Drawer
      open={open}
      title={data?.target.type === 'study' ? '检查查看' : '序列查看'}
      width={920}
      onClose={onClose}
      destroyOnClose
    >
      {!data ? (
        <Empty description="暂无可查看内容" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={2} size="small" bordered>
            {data.target.type === 'study' ? (
              <>
                <Descriptions.Item label="检查 ID">{data.target.studyId || data.target.studyUid}</Descriptions.Item>
                <Descriptions.Item label="模态">{data.target.modality || '-'}</Descriptions.Item>
                <Descriptions.Item label="检查日期">
                  {data.target.studyDate ? dayjs(data.target.studyDate).format('YYYY-MM-DD HH:mm:ss') : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="患者">
                  {data.target.patient.patientName || data.target.patient.patientId || data.target.patient.patientUid}
                </Descriptions.Item>
                <Descriptions.Item label="检查描述" span={2}>
                  {data.target.studyDescription || '-'}
                </Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label="序列描述">
                  {data.target.seriesDescription || data.target.seriesUid}
                </Descriptions.Item>
                <Descriptions.Item label="所属检查">
                  {data.target.study.studyId || data.target.study.studyUid}
                </Descriptions.Item>
                <Descriptions.Item label="序列 UID" span={2}>
                  {data.target.seriesUid}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>

          <Collapse
            defaultActiveKey={data.series[0] ? [data.series[0].id] : []}
            items={data.series.map((item) => ({
              key: item.id,
              label: (
                <Space wrap>
                  <Typography.Text strong>{item.seriesDescription || '未命名序列'}</Typography.Text>
                  <Tag color="blue">批次 #{item.datasetBatch.batchNo}</Tag>
                  <Tag icon={<InboxOutlined />}>{item.imageCount} 张</Tag>
                </Space>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions column={2} size="small" bordered>
                    <Descriptions.Item label="序列 UID" span={2}>
                      {item.seriesUid}
                    </Descriptions.Item>
                    <Descriptions.Item label="医院名称">{item.hospitalName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="上传时间">
                      {item.uploadedAt ? dayjs(item.uploadedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="来源">{item.datasetBatch.sourceName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="备注">{item.remark || '-'}</Descriptions.Item>
                  </Descriptions>

                  <List
                    size="small"
                    bordered
                    dataSource={item.files}
                    locale={{ emptyText: '当前序列下没有可下载文件' }}
                    renderItem={(file) => (
                      <List.Item
                        actions={[
                          <Button
                            key="download"
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            loading={downloadingKey === `${file.url}-${file.name}`}
                            onClick={() => handleDownload(file.url, file.name)}
                          >
                            下载
                          </Button>,
                        ]}
                      >
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{file.name}</Typography.Text>
                          <Typography.Text type="secondary">{Math.max(1, Math.round(file.size / 1024))} KB</Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Space>
              ),
            }))}
          />
        </Space>
      )}
    </Drawer>
  );
}

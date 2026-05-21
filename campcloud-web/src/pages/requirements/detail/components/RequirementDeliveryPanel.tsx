import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Empty, Form, Input, List, Space, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios from 'axios';
import dayjs from 'dayjs';
import { useState } from 'react';
import { requirementsApi } from '../../../../services/api/requirements';
import { queryClient } from '../../../../services/query-client';

interface Props {
  requirementId: string;
  canUpload?: boolean;
}

export function RequirementDeliveryPanel({ requirementId, canUpload = false }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; description?: string; isFinal?: boolean; file: string[] }>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const deliveriesQuery = useQuery({
    queryKey: ['requirement-deliveries', requirementId],
    queryFn: () => requirementsApi.listDeliveries(requirementId),
    enabled: Boolean(requirementId),
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async (values: { title: string; description?: string; isFinal?: boolean; file: string[] }) => {
      const selectedFile = fileList[0]?.originFileObj;
      if (!selectedFile) {
        throw new Error('请上传 .pth 文件');
      }
      return requirementsApi.createDelivery(requirementId, {
        title: values.title,
        description: values.description,
        isFinal: values.isFinal,
        file: selectedFile as File,
      });
    },
    onSuccess: async (delivery) => {
      message.success(delivery.isFinal ? '最终交付已上传，需求已自动完成' : '交付已上传');
      form.resetFields();
      setFileList([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirement-deliveries', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
    onError: (error) => {
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : error instanceof Error
          ? error.message
          : undefined;
      message.error(errorMessage || '交付上传失败');
    },
  });

  const buildCustomerFileName = (title: string, isFinal: boolean, fileName: string | null) => {
    const normalizedTitle = title.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || (isFinal ? '最终交付' : '阶段交付');
    const extension = fileName?.includes('.') ? `.${fileName.split('.').pop()}` : '';
    return `${normalizedTitle}${extension}`;
  };

  const handleDownload = async (deliveryId: string, fileName: string, downloadName?: string) => {
    setDownloadingId(deliveryId);
    try {
      const blob = await requirementsApi.downloadDelivery(requirementId, deliveryId);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadName || fileName;
      link.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      message.error('交付文件下载失败');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card title="交付窗口" loading={deliveriesQuery.isLoading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {canUpload ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => createDeliveryMutation.mutate(values)}
          >
            <Form.Item label="交付标题" name="title" rules={[{ required: true, message: '请输入交付标题' }]}>
              <Input placeholder="例如：第一版算法权重、最终交付模型" maxLength={200} />
            </Form.Item>
            <Form.Item label="交付说明" name="description">
              <Input.TextArea rows={3} placeholder="可补充版本说明、适用范围、建议用法等" maxLength={5000} />
            </Form.Item>
            <Form.Item label="交付文件" required>
              <Upload
                accept=".pth"
                maxCount={1}
                beforeUpload={(file) => {
                  if (!file.name.toLowerCase().endsWith('.pth')) {
                    message.error('仅支持上传 .pth 文件');
                    return Upload.LIST_IGNORE;
                  }
                  setFileList([
                    {
                      uid: file.uid,
                      name: file.name,
                      status: 'done',
                      originFileObj: file,
                    },
                  ]);
                  form.setFieldValue('file', [file.uid]);
                  void form.validateFields(['file']);
                  return false;
                }}
                onRemove={() => {
                  setFileList([]);
                  form.setFieldValue('file', []);
                  void form.validateFields(['file']);
                }}
                fileList={fileList}
              >
                <Button icon={<UploadOutlined />}>上传交付文件</Button>
              </Upload>
            </Form.Item>
            <Form.Item name="file" hidden rules={[{ required: true, message: '请上传 .pth 文件' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="isFinal" valuePropName="checked">
              <Checkbox>设为最终交付</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={createDeliveryMutation.isPending}>
              上传交付
            </Button>
          </Form>
        ) : null}

        {deliveriesQuery.data && deliveriesQuery.data.length > 0 ? (
          <List
            dataSource={deliveriesQuery.data}
            renderItem={(item) => (
              <List.Item
                actions={
                  item.fileName
                    ? [
                        <Button
                          key="download"
                          type="link"
                          icon={<DownloadOutlined />}
                          loading={downloadingId === item.id}
                          onClick={() =>
                            handleDownload(
                              item.id,
                              item.fileName!,
                              canUpload ? item.fileName! : buildCustomerFileName(item.title, item.isFinal, item.fileName),
                            )
                          }
                        >
                          下载
                        </Button>,
                      ]
                    : []
                }
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    {item.isFinal ? <Tag color="success">最终交付</Tag> : <Tag color="blue">阶段交付</Tag>}
                    {canUpload ? <Tag icon={<InboxOutlined />}>{item.fileName || '未命名文件'}</Tag> : null}
                  </Space>
                  {item.description ? <Typography.Paragraph style={{ marginBottom: 0 }}>{item.description}</Typography.Paragraph> : null}
                  <Typography.Text type="secondary">
                    {item.uploader.username} 于 {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')} 上传
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无交付记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Space>
    </Card>
  );
}

import { DownloadOutlined, InboxOutlined, ReloadOutlined, SafetyCertificateOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Empty, Form, Input, List, Space, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios from 'axios';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requirementsApi } from '../../../../services/api/requirements';
import { queryClient } from '../../../../services/query-client';
import { downloadViaBrowser } from '../../../../utils/browser-download';

interface Props {
  requirementId: string;
  canUpload?: boolean;
}

export function RequirementDeliveryPanel({ requirementId, canUpload = false }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; description?: string; isFinal?: boolean; file: string[] }>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [licenseFileList, setLicenseFileList] = useState<UploadFile[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [licenseVerified, setLicenseVerified] = useState(false);
  const [licenseVerifyMessage, setLicenseVerifyMessage] = useState<string | null>(null);

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

  const verifyLicenseMutation = useMutation({
    mutationFn: async (licenseFile: File) => requirementsApi.verifyUserLicense(licenseFile),
    onSuccess: (result) => {
      setLicenseVerified(true);
      setLicenseVerifyMessage(result.message);
      message.success(result.message);
    },
    onError: (error) => {
      setLicenseVerified(false);
      setLicenseVerifyMessage(null);
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : error instanceof Error
          ? error.message
          : undefined;
      message.error(errorMessage || 'license 校验失败');
    },
  });

  const resetDownloadStateMutation = useMutation({
    mutationFn: async (deliveryId: string) => requirementsApi.resetDeliveryDownloadState(requirementId, deliveryId),
  });
  const handleDownload = async (deliveryId: string, fileName: string | null) => {
    setDownloadingId(deliveryId);
    try {
      if (canUpload) {
        await resetDownloadStateMutation.mutateAsync(deliveryId);
        message.success('用户下载次数已重置');
        await queryClient.invalidateQueries({ queryKey: ['requirement-deliveries', requirementId] });
        return;
      }

      const selectedLicenseFile = licenseFileList[0]?.originFileObj;
      if (!selectedLicenseFile) {
        throw new Error('璇峰厛涓婁紶 license 鏂囦欢');
      }
      if (!licenseVerified) {
        throw new Error('璇峰厛绛夊緟 license 鏍￠獙鎴愬姛鍚庡啀涓嬭浇');
      }

      const formData = new FormData();
      formData.append('license', selectedLicenseFile as File);

      await downloadViaBrowser({
        path: `/requirements/${requirementId}/deliveries/${deliveryId}/file`,
        method: 'POST',
        body: formData,
        fileName: fileName || 'delivery.model',
      });

      await queryClient.invalidateQueries({ queryKey: ['requirement-deliveries', requirementId] });
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : error instanceof Error
          ? error.message
          : undefined;
      message.error(errorMessage || (canUpload ? '重置用户下载次数失败' : '浜や粯鏂囦欢涓嬭浇澶辫触'));
      await queryClient.invalidateQueries({ queryKey: ['requirement-deliveries', requirementId] });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card title="交付窗口" loading={deliveriesQuery.isLoading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {canUpload ? (
          <Form form={form} layout="vertical" onFinish={(values) => createDeliveryMutation.mutate(values)}>
            <Typography.Text type="secondary">
              管理端上传原始 `.pth` 后，服务端会自动转换为加密 `.model` 文件，用户侧只会下载加密后的交付文件。
            </Typography.Text>
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
                <Button icon={<UploadOutlined />}>上传原始 .pth 文件</Button>
              </Upload>
            </Form.Item>
            <Form.Item name="file" hidden rules={[{ required: true, message: '请上传 .pth 文件' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="isFinal" valuePropName="checked">
              <Checkbox>设为最终交付</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={createDeliveryMutation.isPending}>
              上传并生成加密模型
            </Button>
          </Form>
        ) : null}

        {!canUpload ? (
          <Card size="small" title="License 校验">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                下载前请先上传管理员下发的 license 文件，系统会先校验下载资格，再由服务端代理输出加密后的 `.model` 文件。
              </Typography.Text>
              <Typography.Text type="secondary">
                下载后的文件不能直接用 `torch.load` 打开，需要配合专用 Python loader 解密加载。
              </Typography.Text>
              <Typography.Text type="secondary">
                当前规则：完整下载成功后记为唯一一次正式拉取；失败不记正式次数，但 5 分钟内只能发起 1 次下载，累计失败 2 次后需要管理员处理。
              </Typography.Text>
              <Link to="/deliveries/model-loader">
                <Button type="link" style={{ paddingInline: 0 }}>
                  打开 Python Loader 使用指引
                </Button>
              </Link>
              <Upload
                accept=".txt,.lic,.license,.json"
                maxCount={1}
                beforeUpload={(file) => {
                  setLicenseVerified(false);
                  setLicenseVerifyMessage(null);
                  setLicenseFileList([
                    {
                      uid: file.uid,
                      name: file.name,
                      status: 'done',
                      originFileObj: file,
                    },
                  ]);
                  if (deliveriesQuery.data && deliveriesQuery.data.length > 0) {
                    void verifyLicenseMutation.mutateAsync(file as File);
                  }
                  return false;
                }}
                onRemove={() => {
                  setLicenseFileList([]);
                  setLicenseVerified(false);
                  setLicenseVerifyMessage(null);
                }}
                fileList={licenseFileList}
              >
                <Button icon={<SafetyCertificateOutlined />}>上传 license 文件</Button>
              </Upload>
              {licenseVerified && licenseVerifyMessage ? <Tag color="success">{licenseVerifyMessage}</Tag> : null}
              {!licenseVerified && licenseFileList.length > 0 && verifyLicenseMutation.isPending ? (
                <Typography.Text type="secondary">正在校验 license，请稍候</Typography.Text>
              ) : null}
            </Space>
          </Card>
        ) : null}

        {deliveriesQuery.data && deliveriesQuery.data.length > 0 ? (
          <List
            dataSource={deliveriesQuery.data}
            renderItem={(item) => {
              const alreadyDownloaded = item.userDownloadCount >= 1;
              const locked = Boolean(item.userDownloadLockedAt);
              return (
                <List.Item
                  actions={
                    item.fileName
                      ? [
                          alreadyDownloaded ? (
                            <Typography.Text key="download-success" type="secondary">
                              已成功拉取
                            </Typography.Text>
                          ) : null,
                          locked ? (
                            <Typography.Text key="download-locked" type="danger">
                              已锁定
                            </Typography.Text>
                          ) : null,
                          <Button
                            key="download"
                            type="link"
                            icon={canUpload ? <ReloadOutlined /> : <DownloadOutlined />}
                            loading={downloadingId === item.id}
                            disabled={!canUpload && (alreadyDownloaded || locked)}
                            onClick={() => handleDownload(item.id, item.fileName)}
                          >
                            {canUpload ? '重置用户下载次数' : '涓嬭浇鍔犲瘑妯″瀷'}
                          </Button>,
                        ]
                      : []
                  }
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      {item.isFinal ? <Tag color="success">最终交付</Tag> : <Tag color="blue">阶段交付</Tag>}
                      {canUpload ? <Tag color="processing">对外交付：加密 .model</Tag> : null}
                      {canUpload ? <Tag icon={<InboxOutlined />}>{item.fileName || '未命名文件'}</Tag> : null}
                    </Space>
                    {item.description ? <Typography.Paragraph style={{ marginBottom: 0 }}>{item.description}</Typography.Paragraph> : null}
                    <Typography.Text type="secondary">
                      {item.uploader.username} 于 {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')} 上传
                    </Typography.Text>
                    {!canUpload && alreadyDownloaded ? (
                      <Typography.Text type="warning">
                        该算法交付已完成正式拉取。如需再次获取，请先在本页下方留言联系管理员。
                      </Typography.Text>
                    ) : null}
                    {!canUpload && !alreadyDownloaded && item.userDownloadFailedCount > 0 ? (
                      <Typography.Text type={locked ? 'danger' : 'secondary'}>
                        已失败 {item.userDownloadFailedCount} 次{locked ? '，当前已锁定，请联系管理员处理。' : '。'}
                      </Typography.Text>
                    ) : null}
                    {!canUpload && !alreadyDownloaded && item.lastUserDownloadAttemptAt ? (
                      <Typography.Text type="secondary">
                        最近一次发起下载：{dayjs(item.lastUserDownloadAttemptAt).format('YYYY-MM-DD HH:mm:ss')}
                      </Typography.Text>
                    ) : null}
                    {canUpload && item.fileName ? (
                      <Typography.Text type="secondary">
                        上传前请确认该需求所属用户已在部署配置中绑定 license，当前需求单 ID `{requirementId}`，交付文件 `{item.fileName}`。
                      </Typography.Text>
                    ) : null}
                  </Space>
                </List.Item>
              );
            }}
          />
        ) : (
          <Empty description="暂无交付记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Space>
    </Card>
  );
}
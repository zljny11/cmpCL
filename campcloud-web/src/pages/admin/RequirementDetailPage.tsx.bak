import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Empty, Form, Input, List, Result, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { requirementsApi } from '../../services/api/requirements';
import { queryClient } from '../../services/query-client';
import { RequirementStatus } from '../../types/requirements';
import { RequirementDeliveryPanel } from '../requirements/detail/components/RequirementDeliveryPanel';
import { RequirementExpandPanel } from '../requirements/list/components/RequirementExpandPanel';
import { renderRequirementStatus, renderRequirementType } from '../requirements/list/helpers';

const statusOptions: Array<{ label: string; value: RequirementStatus }> = [
  { label: '受理中（需等待）', value: 'processing' },
  { label: '受理中（需补充数据）', value: 'waiting_user' },
  { label: '已完成', value: 'completed' },
];

function formatFileSize(size: number) {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${Math.max(size / 1024 / 1024, 0.01).toFixed(2)} MB`;
}

export function AdminRequirementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [messageForm] = Form.useForm<{ content: string }>();
  const [statusForm] = Form.useForm<{ status: RequirementStatus; reason?: string }>();

  const detailQuery = useQuery({
    queryKey: ['admin', 'requirement-detail', id],
    queryFn: () => requirementsApi.detail(id),
    enabled: Boolean(id),
  });
  const messagesQuery = useQuery({
    queryKey: ['admin', 'requirement-messages', id],
    queryFn: () => requirementsApi.listMessages(id),
    enabled: Boolean(id),
  });
  const batchQuery = useQuery({
    queryKey: ['admin', 'requirement-batches', id],
    queryFn: () => requirementsApi.listDatasetBatches(id, { page: 1, pageSize: 100 }),
    enabled: Boolean(id),
  });

  const createMessageMutation = useMutation({
    mutationFn: (payload: { content: string }) => requirementsApi.createMessage(id, payload),
    onSuccess: async () => {
      message.success('回复已发送，用户会在通知栏看到提醒');
      messageForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-messages', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-messages', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { status: RequirementStatus; reason?: string }) => requirementsApi.updateStatus(id, payload),
    onSuccess: async () => {
      message.success('需求状态已更新，用户会收到通知');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
  const pullDetailDataMutation = useMutation({
    mutationFn: () => requirementsApi.pullRequirementDetailData(id),
    onSuccess: async () => {
      message.success('已开始拉取需求详情数据，请稍候刷新查看结果');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-batches', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
      ]);
    },
  });
  const data = detailQuery.data;
  const pendingBatches = batchQuery.data?.list.filter((item) => item.status === 'uploaded') ?? [];
  const pendingBytes = pendingBatches.reduce((sum, item) => sum + item.totalBytes, 0);
  const pendingFileCount = pendingBatches.reduce((sum, item) => sum + item.fileCount, 0);

  if (detailQuery.isError) {
    return <Result status="error" title="需求详情加载失败" />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          管理侧需求详情
        </Typography.Title>
      </div>

      {data ? (
        <>
          <Card loading={detailQuery.isLoading}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                {renderRequirementStatus(data.status)}
                <Tag color="blue">{renderRequirementType(data.type, data.typeCustom)}</Tag>
                <Tag>创建于 {dayjs(data.createdAt).format('YYYY-MM-DD HH:mm')}</Tag>
              </Space>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {data.title}
              </Typography.Title>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.description}</Typography.Paragraph>
            </Space>
          </Card>

          <Descriptions bordered column={2}>
            <Descriptions.Item label="提交账号">{data.creator?.username || '-'}</Descriptions.Item>
            <Descriptions.Item label="医院">{data.creator?.hospitalName || '-'}</Descriptions.Item>
            <Descriptions.Item label="联系人">{data.creator?.profile?.realName || '-'}</Descriptions.Item>
            <Descriptions.Item label="电话">{data.creator?.profile?.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">{renderRequirementStatus(data.status)}</Descriptions.Item>
            <Descriptions.Item label="需求类型">{renderRequirementType(data.type, data.typeCustom)}</Descriptions.Item>
            <Descriptions.Item label="期望目标" span={2}>
              {data.expectedGoal || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="补充备注" span={2}>
              {data.remark || '-'}
            </Descriptions.Item>
          </Descriptions>

          {pendingBatches.length > 0 ? (
            <Card>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="warning"
                  showIcon
                  message="当前存在待拉取的需求详情数据"
                  description={`共 ${pendingBatches.length} 个批次，${pendingFileCount} 个文件，约 ${formatFileSize(pendingBytes)}。拉取后才会在内网服务器生成可查看的数据树。`}
                />
                <Space>
                  <Button
                    type="primary"
                    loading={pullDetailDataMutation.isPending}
                    onClick={() =>
                      modal.confirm({
                        title: '拉取需求详情数据',
                        content: `该操作会将当前待处理的 DICOM 从 OSS 拉取到内网服务器。预计最多产生约 ${formatFileSize(
                          pendingBytes,
                        )} 的 OSS 出站流量。拉取完成后，后续解析、查看和下载将仅使用本地数据。`,
                        okText: '确认拉取',
                        cancelText: '取消',
                        onOk: () => pullDetailDataMutation.mutateAsync(),
                      })
                    }
                  >
                    拉取需求详情数据
                  </Button>
                  <Typography.Text type="secondary">
                    未确认拉取前，用户上传的数据只会暂存在 OSS。
                  </Typography.Text>
                </Space>
              </Space>
            </Card>
          ) : null}

          <Card
            title={
              <Space size={12} wrap>
                <span>需求数据详情</span>
                <Button type="primary" onClick={() => navigate(`/admin/requirements/${id}/data`)}>
                  完整数据页
                </Button>
              </Space>
            }
          >
            {(data.stats?.seriesCount ?? 0) > 0 ? (
              <RequirementExpandPanel requirementId={id} expanded readOnly allowPreview allowDownload />
            ) : (
              <Empty description="当前还没有已拉取到内网服务器的详情数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card title="留言沟通" loading={messagesQuery.isLoading}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {messagesQuery.data && messagesQuery.data.length > 0 ? (
                <List
                  dataSource={messagesQuery.data}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space wrap>
                          <Typography.Text strong>{item.sender.username}</Typography.Text>
                          <Tag color={item.sender.role === 'admin' ? 'blue' : 'default'}>
                            {item.sender.role === 'admin' ? '影动' : '用户'}
                          </Tag>
                          <Typography.Text type="secondary">
                            {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                          </Typography.Text>
                        </Space>
                        <Typography.Paragraph style={{ marginBottom: 0 }}>{item.content}</Typography.Paragraph>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="当前暂无留言" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              <Form
                form={messageForm}
                layout="vertical"
                onFinish={(values) =>
                  createMessageMutation.mutate({
                    content: values.content.trim(),
                  })
                }
              >
                <Form.Item label="回复用户" name="content" rules={[{ required: true, message: '请输入回复内容' }]}>
                  <Input.TextArea rows={4} placeholder="例如：需求已受理，当前正在处理中；或请用户补充某部分说明/数据" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={createMessageMutation.isPending}>
                  发送回复
                </Button>
              </Form>
            </Space>
          </Card>

          <Card title="更新状态">
            <Form
              form={statusForm}
              layout="vertical"
              onFinish={(values) => updateStatusMutation.mutate(values)}
            >
              <Form.Item label="目标状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
                <Select options={statusOptions} placeholder="请选择要更新到的状态" />
              </Form.Item>
              <Form.Item label="通知说明" name="reason">
                <Input.TextArea rows={3} placeholder="例如：需求已受理，正在安排处理；需要用户补充某类扫描数据等" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={updateStatusMutation.isPending}>
                更新状态并通知用户
              </Button>
            </Form>
          </Card>

          <RequirementDeliveryPanel requirementId={id} canUpload />
        </>
      ) : null}
    </Space>
  );
}

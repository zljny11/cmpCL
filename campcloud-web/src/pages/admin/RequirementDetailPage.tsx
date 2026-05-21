import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Empty, Form, Input, List, Result, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
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

export function AdminRequirementDetailPage() {
  const { id = '' } = useParams();
  const { message } = App.useApp();
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
  const data = detailQuery.data;

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

          <Card title="需求数据详情">
            <RequirementExpandPanel requirementId={id} expanded readOnly />
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
        </>
      ) : null}
    </Space>
  );
}

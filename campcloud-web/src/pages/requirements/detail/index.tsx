import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Descriptions, Empty, Form, Input, List, Result, Row, Space, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../../app/providers/auth-provider';
import { requirementsApi } from '../../../services/api/requirements';
import { queryClient } from '../../../services/query-client';
import { renderRequirementType, renderRequirementStatus } from '../list/helpers';
import { RequirementDeliveryPanel } from './components/RequirementDeliveryPanel';

export function RequirementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ content: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['requirement-detail', id],
    queryFn: () => requirementsApi.detail(id),
    enabled: Boolean(id),
  });
  const messagesQuery = useQuery({
    queryKey: ['requirement-messages', id],
    queryFn: () => requirementsApi.listMessages(id),
    enabled: Boolean(id),
  });
  const createMessageMutation = useMutation({
    mutationFn: (payload: { content: string }) => requirementsApi.createMessage(id, payload),
    onSuccess: async () => {
      message.success('留言已发送');
      form.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirement-messages', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'latest-requirement'] }),
      ]);
    },
  });

  if (isError) {
    return <Result status="error" title="需求详情加载失败" />;
  }

  const canUserLeaveMessage = Boolean(data);

  return (
    <Card loading={isLoading} bordered={false}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              需求详情
            </Typography.Title>
          </div>
          <Space>
            <Button onClick={() => navigate('/requirements')}>返回列表</Button>
            <Link to={`/requirements/${id}/upload`}>
              <Button type="primary">进入上传页</Button>
            </Link>
          </Space>
        </Space>
      {data && (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Card size="small">
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
            <Descriptions.Item label="需求类型">{renderRequirementType(data.type, data.typeCustom)}</Descriptions.Item>
            <Descriptions.Item label="当前状态">{renderRequirementStatus(data.status)}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{dayjs(data.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="提交时间">
              {data.submittedAt ? dayjs(data.submittedAt).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="期望目标" span={2}>
              {data.expectedGoal || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="补充备注" span={2}>
              {data.remark || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="需求描述" span={2}>
              {data.description}
            </Descriptions.Item>
          </Descriptions>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="创建人信息" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="账号">{data.creator?.username || '-'}</Descriptions.Item>
                  <Descriptions.Item label="医院">{data.creator?.hospitalName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="联系人">{data.creator?.profile?.realName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="科室">{data.creator?.profile?.department || '-'}</Descriptions.Item>
                  <Descriptions.Item label="职称">{data.creator?.profile?.title || '-'}</Descriptions.Item>
                  <Descriptions.Item label="邮箱">{data.creator?.profile?.email || '-'}</Descriptions.Item>
                  <Descriptions.Item label="电话">{data.creator?.profile?.phone || '-'}</Descriptions.Item>
                  <Descriptions.Item label="微信号">{data.creator?.profile?.wechat || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="统计信息" size="small">
                <Space size={16} wrap>
                  <Statistic title="患者数" value={data.stats?.patientCount ?? 0} />
                  <Statistic title="检查数" value={data.stats?.studyCount ?? 0} />
                  <Statistic title="序列数" value={data.stats?.seriesCount ?? 0} />
                </Space>
              </Card>
            </Col>
            <Col xs={24}>
              <Card title="需求留言与补充" size="small" loading={messagesQuery.isLoading}>
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
                              {item.sender.hospitalName ? (
                                <Typography.Text type="secondary">{item.sender.hospitalName}</Typography.Text>
                              ) : null}
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
                    <Empty description="暂无留言，您可以先补充说明" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}

                  <Form
                    form={form}
                    layout="vertical"
                    disabled={!canUserLeaveMessage}
                    onFinish={(values) =>
                      createMessageMutation.mutate({
                        content: values.content.trim(),
                      })
                    }
                  >
                    <Form.Item
                      label="补充回复"
                      name="content"
                      rules={[{ required: true, message: '请输入补充内容' }]}
                    >
                      <Input.TextArea rows={4} placeholder="例如补充扫描背景、补传计划、对处理结果的进一步要求等" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={createMessageMutation.isPending}>
                      发送留言
                    </Button>
                  </Form>
                </Space>
              </Card>
            </Col>
            <Col xs={24}>
              <RequirementDeliveryPanel requirementId={id} />
            </Col>
          </Row>
        </Space>
      )}
      </Space>
    </Card>
  );
}

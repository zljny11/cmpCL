import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Descriptions, Empty, Result, Row, Space, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { requirementsApi } from '../../../services/api/requirements';
import { renderRequirementType, renderRequirementStatus } from '../list/helpers';

export function RequirementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['requirement-detail', id],
    queryFn: () => requirementsApi.detail(id),
    enabled: Boolean(id),
  });

  if (isError) {
    return <Result status="error" title="需求详情加载失败" />;
  }

  return (
    <Card loading={isLoading} bordered={false}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              需求详情
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              这里展示第二周期范围内的基础信息、创建人资料、统计信息，以及最近沟通摘要。
            </Typography.Paragraph>
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
            <Col xs={24} lg={12}>
              <Card title="最近留言摘要" size="small">
                {data.latestMessage ? (
                  <Space direction="vertical" size={8}>
                    <Typography.Text strong>{data.latestMessage.sender.username}</Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {data.latestMessage.content}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary">
                      {dayjs(data.latestMessage.createdAt).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                  </Space>
                ) : (
                  <Empty description="暂无留言" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="最近交付摘要" size="small">
                {data.latestDelivery ? (
                  <Space direction="vertical" size={8}>
                    <Typography.Text strong>{data.latestDelivery.title}</Typography.Text>
                    <Typography.Text>{data.latestDelivery.fileName || '未提供文件名'}</Typography.Text>
                    <Typography.Text type="secondary">
                      {dayjs(data.latestDelivery.createdAt).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                  </Space>
                ) : (
                  <Empty description="暂无交付" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      )}
      </Space>
    </Card>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import { profileApi } from '../../services/api/profile';
import { requirementsApi } from '../../services/api/requirements';
import { RequirementListItem } from '../../types/requirements';
import { renderRequirementStatus, renderRequirementType } from '../requirements/list/helpers';
import './index.less';

function isProfileComplete(profile?: {
  realName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  title?: string | null;
  hospitalName?: string | null;
} | null) {
  if (!profile) {
    return false;
  }

  return Boolean(
    profile.realName &&
      profile.email &&
      profile.phone &&
      profile.hospitalName &&
      profile.department &&
      profile.title,
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const requirementsQuery = useQuery({
    queryKey: ['dashboard', 'requirements'],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 50 }),
  });

  const profileQuery = useQuery({
    queryKey: ['dashboard', 'profile'],
    queryFn: profileApi.getProfile,
  });

  const items = requirementsQuery.data?.list ?? [];
  const profile = profileQuery.data;
  const profileCompleted = isProfileComplete({
    ...profile,
    hospitalName: user?.hospitalName ?? null,
  });
  const waitingUserCount = items.filter((item) => item.status === 'waiting_user').length;
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const unreadCount = items.reduce((sum, item) => sum + item.unreadNotificationCount, 0);
  const recentItems = items
    .slice()
    .sort((left, right) => {
      const leftTime = left.latestMessageAt ?? left.createdAt;
      const rightTime = right.latestMessageAt ?? right.createdAt;
      return dayjs(rightTime).valueOf() - dayjs(leftTime).valueOf();
    })
    .slice(0, 5);

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <Typography.Title level={3}>用户工作台</Typography.Title>
          <Typography.Paragraph type="secondary">
            首页只回答两件事：哪些需求正在推进，以及你下一步需要处理什么。
          </Typography.Paragraph>
        </div>
        <Link to="/requirements">
          <Button type="primary">进入需求列表</Button>
        </Link>
      </div>

      <div className="dashboard-summary">
        <div className="dashboard-summary-card">
          <p>我的需求</p>
          <strong>{requirementsQuery.data?.total ?? 0}</strong>
        </div>
        <div className="dashboard-summary-card">
          <p>待处理</p>
          <strong>{pendingCount}</strong>
        </div>
        <div className="dashboard-summary-card">
          <p>待我响应</p>
          <strong>{waitingUserCount}</strong>
        </div>
        <div className="dashboard-summary-card">
          <p>未读通知</p>
          <strong>{unreadCount}</strong>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="待我处理" bordered={false}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {!profileCompleted ? (
                <Alert
                  type="warning"
                  showIcon
                  message="资料待完善"
                  description="建议先补齐联系人、邮箱、电话、医院、科室和职称，便于后续需求沟通和交付。"
                  action={
                    <Link to="/profile">
                      <Button size="small" type="primary">
                        去完善
                      </Button>
                    </Link>
                  }
                />
              ) : null}
              {waitingUserCount > 0 ? (
                <Alert
                  type="info"
                  showIcon
                  message={`有 ${waitingUserCount} 条需求待你确认`}
                  description="通常表示管理员已更新状态，或需要你补充信息。"
                  action={
                    <Link to="/requirements">
                      <Button size="small">去查看</Button>
                    </Link>
                  }
                />
              ) : null}
              {unreadCount > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  message={`有 ${unreadCount} 条未读提醒`}
                  description="建议优先查看最近有状态变化或留言更新的需求。"
                  action={
                    <Link to="/requirements">
                      <Button size="small">去处理</Button>
                    </Link>
                  }
                />
              ) : null}
              {profileCompleted && waitingUserCount === 0 && unreadCount === 0 ? (
                <Empty description="当前没有待处理事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="最近动态" bordered={false} loading={requirementsQuery.isLoading}>
            {recentItems.length === 0 ? (
              <Empty description="当前还没有可展示的需求动态" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Link to="/requirements">
                  <Button type="primary">查看需求列表</Button>
                </Link>
              </Empty>
            ) : (
              <List<RequirementListItem>
                itemLayout="vertical"
                dataSource={recentItems}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Link key="detail" to={`/requirements/${item.id}`}>
                        查看详情
                      </Link>,
                    ]}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        {renderRequirementStatus(item.status)}
                        <Tag color="blue">{renderRequirementType(item.type)}</Tag>
                        {item.unreadNotificationCount > 0 ? (
                          <Tag color="red">未读 {item.unreadNotificationCount}</Tag>
                        ) : null}
                      </Space>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Typography.Text type="secondary">
                        {item.latestMessageAt
                          ? `最近留言更新时间 ${dayjs(item.latestMessageAt).format('YYYY-MM-DD HH:mm')}`
                          : `创建于 ${dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}`}{' '}
                        · 患者 {item.patientCount} / 检查 {item.studyCount} / 序列 {item.seriesCount}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

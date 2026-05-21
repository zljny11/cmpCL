import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, List, Modal, Row, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import { notificationsApi } from '../../services/api/notifications';
import { profileApi } from '../../services/api/profile';
import { requirementsApi } from '../../services/api/requirements';
import { RequirementListItem } from '../../types/requirements';
import { isProfileComplete } from '../../utils/profileCompletion';
import { renderRequirementType } from '../requirements/list/helpers';
import './index.less';

function renderDashboardRequirementStatus(status: RequirementListItem['status']) {
  switch (status) {
    case 'pending':
      return <Tag>待响应</Tag>;
    case 'processing':
      return <Tag color="processing">受理中（需等待）</Tag>;
    case 'waiting_user':
      return <Tag color="warning">受理中（需补充数据）</Tag>;
    case 'completed':
      return <Tag color="success">已完成</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const requirementsQuery = useQuery({
    queryKey: ['dashboard', 'requirements'],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 100 }),
  });

  const profileQuery = useQuery({
    queryKey: ['dashboard', 'profile'],
    queryFn: profileApi.getProfile,
  });
  const notificationsQuery = useQuery({
    queryKey: ['dashboard', 'notifications'],
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 100, unreadOnly: true }),
  });

  const items = requirementsQuery.data?.list ?? [];
  const unreadNotifications = notificationsQuery.data?.list ?? [];
  const profile = profileQuery.data;
  const profileCompleted = isProfileComplete({
    ...profile,
    hospitalName: user?.hospitalName ?? null,
  });
  const waitingUserCount = items.filter((item) => item.status === 'waiting_user').length;
  const pendingCount = items.filter((item) => item.status === 'waiting_user').length;
  const processingCount = items.filter((item) => item.status === 'processing' || item.status === 'waiting_user').length;
  const unreadCount = items.reduce((sum, item) => sum + item.unreadNotificationCount, 0);
  const adminPendingRequirementCount = items.filter((item) => item.needsAdminReply).length;
  const recentItems = items
    .slice()
    .sort((left, right) => {
      const leftTime = left.latestMessageAt ?? left.createdAt;
      const rightTime = right.latestMessageAt ?? right.createdAt;
      return dayjs(rightTime).valueOf() - dayjs(leftTime).valueOf();
    })
    .slice(0, 5);

  useEffect(() => {
    if (isAdmin) {
      return;
    }
    if (unreadNotifications.length === 0) {
      return;
    }

    const popupKey = 'AICampCloud_notification_popup_seen_ids';
    const seenIds = new Set<string>(JSON.parse(localStorage.getItem(popupKey) ?? '[]') as string[]);
    const pendingPopups = unreadNotifications.filter((item) => !seenIds.has(item.id));
    if (pendingPopups.length === 0) {
      return;
    }

    const nextSeenIds = Array.from(new Set([...seenIds, ...pendingPopups.map((item) => item.id)])).slice(-100);
    localStorage.setItem(popupKey, JSON.stringify(nextSeenIds));

    Modal.info({
      title: '您的需求有回复了',
      content: '请及时查看需求列表中的最新处理进展与留言回复。',
      okText: '去查看通知',
      onOk: () => navigate('/notifications'),
    });
  }, [isAdmin, navigate, unreadNotifications]);

  const dashboardSummary = isAdmin
    ? [
        { label: '总需求数', value: requirementsQuery.data?.total ?? 0 },
        { label: '受理中', value: processingCount },
        { label: '待我响应', value: adminPendingRequirementCount },
        { label: '未读通知', value: unreadNotifications.length },
      ]
    : [
        { label: '我的需求', value: requirementsQuery.data?.total ?? 0 },
        { label: '待我响应', value: pendingCount },
        { label: '处理中', value: items.filter((item) => item.status === 'processing').length },
        { label: '未读通知', value: unreadCount },
      ];

  const entryLink = isAdmin ? '/admin/requirements' : '/requirements';

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <Typography.Title level={3}>{isAdmin ? '管理员工作台' : '用户工作台'}</Typography.Title>
        </div>
        <Link to={entryLink}>
          <Button type="primary">{isAdmin ? '进入管理侧需求' : '进入需求列表'}</Button>
        </Link>
      </div>

      <div className="dashboard-summary">
        {dashboardSummary.map((item) => (
          <div key={item.label} className="dashboard-summary-card">
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title={isAdmin ? '管理员提醒' : '待我响应'}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {!isAdmin && !profileCompleted ? (
                <Alert
                  type="warning"
                  showIcon
                  message="资料待完善"
                  description="建议先补齐联系人、邮箱、电话、微信号、医院、科室和职称，便于后续需求沟通和交付。"
                  action={
                    <Link to="/profile">
                      <Button size="small" type="primary">
                        去完善
                      </Button>
                    </Link>
                  }
                />
              ) : null}
              {!isAdmin && waitingUserCount > 0 ? (
                <Alert
                  type="info"
                  showIcon
                  message={`有 ${waitingUserCount} 条需求待我响应`}
                  description="这些需求当前处于受理中（需补充数据），请尽快补充所需数据或说明。"
                  action={
                    <Link to="/requirements">
                      <Button size="small">去处理</Button>
                    </Link>
                  }
                />
              ) : null}
              {!isAdmin && unreadCount > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  message={`有 ${unreadCount} 条未读提醒`}
                  description="建议优先查看最近有状态变化或留言更新的需求。"
                  action={
                    <Link to="/notifications">
                      <Button size="small">去查看</Button>
                    </Link>
                  }
                />
              ) : null}
              {isAdmin && adminPendingRequirementCount > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message={`有 ${adminPendingRequirementCount} 条需求待我响应`}
                  description={`这些需求存在新的消息通知或数据上传，请进入管理侧处理。`}
                  action={
                    <Link to="/admin/requirements">
                      <Button size="small">去处理</Button>
                    </Link>
                  }
                />
              ) : null}
              {isAdmin && unreadNotifications.length > 0 ? (
                <Alert
                  type="info"
                  showIcon
                  message={`有 ${unreadNotifications.length} 条未读通知`}
                  description="这些通知来自用户补充留言或需求动态，请优先查看。"
                  action={
                    <Link to="/notifications">
                      <Button size="small">去查看</Button>
                    </Link>
                  }
                />
              ) : null}
              {!isAdmin && profileCompleted && waitingUserCount === 0 && unreadCount === 0 ? (
                <Empty description="当前没有待处理事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : null}
              {isAdmin && adminPendingRequirementCount === 0 && unreadNotifications.length === 0 ? (
                <Empty description="当前没有待处理事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="最近动态" loading={requirementsQuery.isLoading}>
            {recentItems.length === 0 ? (
              <Empty description="当前还没有可展示的需求动态" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Link to={entryLink}>
                  <Button type="primary">{isAdmin ? '查看管理侧需求' : '查看需求列表'}</Button>
                </Link>
              </Empty>
            ) : (
              <List<RequirementListItem>
                itemLayout="vertical"
                dataSource={recentItems}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Link key="detail" to={isAdmin ? `/admin/requirements/${item.id}` : `/requirements/${item.id}`}>
                        查看详情
                      </Link>,
                    ]}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        {renderDashboardRequirementStatus(item.status)}
                        <Tag color="blue">{renderRequirementType(item.type)}</Tag>
                        {!isAdmin && item.unreadNotificationCount > 0 ? (
                          <Tag color="red">未读 {item.unreadNotificationCount}</Tag>
                        ) : null}
                        {isAdmin && item.unreadNotificationCount > 0 ? (
                          <Tag color="orange">未读 {item.unreadNotificationCount}</Tag>
                        ) : null}
                      </Space>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Typography.Text type="secondary">
                        {item.latestMessageAt
                          ? `最近留言更新时间 ${dayjs(item.latestMessageAt).format('YYYY-MM-DD HH:mm')}`
                          : `创建于 ${dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}`}{' '}
                        · 患者 {item.patientCount} / 检查 {item.studyCount} / 序列 {item.seriesCount}
                      </Typography.Text>
                      {isAdmin && item.creator ? (
                        <Typography.Text type="secondary">
                          提交方：{item.creator.username} / {item.creator.hospitalName || '-'}
                        </Typography.Text>
                      ) : null}
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

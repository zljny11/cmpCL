import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requirementsApi } from '../../services/api/requirements';
import { RequirementListItem } from '../../types/requirements';
import { renderRequirementStatus, renderRequirementType } from '../requirements/list/helpers';

export function AdminRequirementListPage() {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusInput, setStatusInput] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  const requirementsQuery = useQuery({
    queryKey: ['admin', 'requirements', keyword, status],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 100, keyword: keyword || undefined, status }),
  });

  const items = requirementsQuery.data?.list ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          管理侧需求
        </Typography.Title>
        <Typography.Text type="secondary">查看用户提交的需求、处理状态与最新留言。</Typography.Text>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索标题、描述或需求类型"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            placeholder="筛选状态"
            allowClear
            value={statusInput}
            onChange={setStatusInput}
            style={{ width: 180 }}
            options={[
              { label: '待我响应', value: 'pending' },
              { label: '受理中（需等待）', value: 'processing' },
              { label: '受理中（需补充数据）', value: 'waiting_user' },
              { label: '已完成', value: 'completed' },
              { label: '已拒绝', value: 'rejected' },
            ]}
          />
          <Button
            type="primary"
            onClick={() => {
              setKeyword(keywordInput.trim());
              setStatus(statusInput);
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setKeywordInput('');
              setKeyword('');
              setStatusInput(undefined);
              setStatus(undefined);
            }}
          >
            重置
          </Button>
        </Space>

        {items.length === 0 && !requirementsQuery.isLoading ? (
          <Empty description="暂无需求" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table<RequirementListItem>
            rowKey="id"
            loading={requirementsQuery.isLoading}
            dataSource={items}
            pagination={false}
            columns={[
              {
                title: '需求信息',
                key: 'summary',
                render: (_, record) => (
                    <Space direction="vertical" size={4}>
                      <Typography.Text strong>{record.title}</Typography.Text>
                      <Typography.Text type="secondary">{renderRequirementType(record.type)}</Typography.Text>
                    </Space>
                  ),
                },
              {
                title: '提交方',
                key: 'creator',
                render: (_, record) => (
                  <Space direction="vertical" size={2}>
                    <Typography.Text>{record.creator?.username || '-'}</Typography.Text>
                    <Typography.Text type="secondary">{record.creator?.hospitalName || '-'}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (_, record) => renderRequirementStatus(record.status),
              },
              {
                title: '动态',
                key: 'meta',
                render: (_, record) => (
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">
                      创建于 {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      最近留言 {record.latestMessageAt ? dayjs(record.latestMessageAt).format('YYYY-MM-DD HH:mm') : '-'}
                    </Typography.Text>
                    {record.unreadNotificationCount > 0 ? (
                      <Tag color="orange">未读 {record.unreadNotificationCount}</Tag>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: '操作',
                key: 'action',
                render: (_, record) => (
                  <Link to={`/admin/requirements/${record.id}`}>
                    <Button type="primary" size="small">
                      进入处理
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Space>
  );
}

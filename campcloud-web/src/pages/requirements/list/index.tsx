import { Button, Card, Empty, Input, Select, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RequirementTable } from './components/RequirementTable';
import { useRequirementList } from './hooks';
import './index.less';

export function RequirementListPage() {
  const navigate = useNavigate();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusInput, setStatusInput] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, isLoading, refetch } = useRequirementList({
    page,
    pageSize,
    keyword: keyword || undefined,
    status,
  });

  const items = data?.list ?? [];
  const summary = useMemo(
    () => ({
      total: data?.total ?? 0,
      pending: items.filter((item) => item.status === 'waiting_user').length,
      processing: items.filter((item) => item.status === 'processing').length,
      unread: items.reduce((sum, item) => sum + item.unreadNotificationCount, 0),
    }),
    [items, data?.total],
  );

  return (
    <div>
      <div className="requirement-list-hero">
        <div>
          <Typography.Title level={3}>需求列表</Typography.Title>
        </div>
        <div className="requirement-list-summary">
          <div className="requirement-list-summary-card">
            <p>需求总数</p>
            <strong>{summary.total}</strong>
          </div>
          <div className="requirement-list-summary-card">
            <p>待我响应</p>
            <strong>{summary.pending}</strong>
          </div>
          <div className="requirement-list-summary-card">
            <p>处理中</p>
            <strong>{summary.processing}</strong>
          </div>
          <div className="requirement-list-summary-card">
            <p>未读通知</p>
            <strong>{summary.unread}</strong>
          </div>
        </div>
      </div>
      <div className="requirement-list-toolbar">
        <Input
          placeholder="搜索标题、描述或需求类型"
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          allowClear
        />
        <Select
          placeholder="筛选状态"
          allowClear
          value={statusInput}
          onChange={setStatusInput}
          options={[
            { label: '待我响应', value: 'waiting_user' },
            { label: '处理中', value: 'processing' },
            { label: '已完成', value: 'completed' },
            { label: '已拒绝', value: 'rejected' },
          ]}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => {
              setPage(1);
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
              setPage(1);
              void refetch();
            }}
          >
            重置
          </Button>
          <Button onClick={() => navigate('/requirements/create')}>新建需求</Button>
        </Space>
      </div>
      <Card>
        {items.length === 0 && !isLoading ? (
          <Empty
            description="当前没有符合条件的需求单"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => navigate('/requirements/create')}>
              创建第一条需求
            </Button>
          </Empty>
        ) : (
          <RequirementTable
            data={items}
            loading={isLoading}
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }}
          />
        )}
      </Card>
    </div>
  );
}

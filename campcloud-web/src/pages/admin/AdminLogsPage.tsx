import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Popconfirm, Popover, Select, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { adminLogsApi } from '../../services/api/admin-logs';
import { AdminLogCategory, AdminLogItem, AdminLogResult } from '../../types/admin-logs';

const categoryLabelMap: Record<AdminLogCategory, string> = {
  auth: '登录与安全',
  user: '用户管理',
  requirement: '需求操作',
  data: '数据操作',
};

const resultColorMap: Record<AdminLogResult, string> = {
  success: 'green',
  failed: 'red',
};

const resultLabelMap: Record<AdminLogResult, string> = {
  success: '成功',
  failed: '失败',
};

export function AdminLogsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryInput, setCategoryInput] = useState<AdminLogCategory | undefined>();
  const [category, setCategory] = useState<AdminLogCategory | undefined>();
  const [resultInput, setResultInput] = useState<AdminLogResult | undefined>();
  const [result, setResult] = useState<AdminLogResult | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const logsQuery = useQuery({
    queryKey: ['admin', 'logs', keyword, category, result, page, pageSize],
    queryFn: () => adminLogsApi.list({ keyword: keyword || undefined, category, result, page, pageSize }),
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => adminLogsApi.clear(),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'logs'] });
      setPage(1);
      messageApi.success(`已清空 ${data.deletedCount} 条日志`);
    },
  });

  const items = logsQuery.data?.list ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          日志管理
        </Typography.Title>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索操作人、动作、对象"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            placeholder="筛选日志类型"
            allowClear
            value={categoryInput}
            onChange={setCategoryInput}
            style={{ width: 180 }}
            options={Object.entries(categoryLabelMap).map(([value, label]) => ({ value, label }))}
          />
          <Select
            placeholder="筛选结果"
            allowClear
            value={resultInput}
            onChange={setResultInput}
            style={{ width: 160 }}
            options={Object.entries(resultLabelMap).map(([value, label]) => ({ value, label }))}
          />
          <Button
            type="primary"
            onClick={() => {
              setPage(1);
              setKeyword(keywordInput.trim());
              setCategory(categoryInput);
              setResult(resultInput);
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setKeywordInput('');
              setKeyword('');
              setCategoryInput(undefined);
              setCategory(undefined);
              setResultInput(undefined);
              setResult(undefined);
              setPage(1);
              setPageSize(10);
            }}
          >
            重置
          </Button>
          <Button onClick={() => logsQuery.refetch()} loading={logsQuery.isFetching && !logsQuery.isLoading}>
            刷新
          </Button>
          <Popconfirm
            title="确认清空日志？"
            description="该操作会删除当前全部日志记录，且不可恢复。"
            okText="清空"
            cancelText="取消"
            onConfirm={() => clearLogsMutation.mutate()}
          >
            <Button danger loading={clearLogsMutation.isPending}>
              清空日志
            </Button>
          </Popconfirm>
        </Space>

        <Table<AdminLogItem>
          rowKey="id"
          loading={logsQuery.isLoading}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total: logsQuery.data?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          columns={[
            {
              title: '时间',
              width: 170,
              render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              title: '操作人',
              width: 120,
              dataIndex: 'actorUsername',
            },
            {
              title: '日志类型',
              width: 120,
              render: (_, record) => categoryLabelMap[record.category],
            },
            {
              title: '动作',
              width: 140,
              dataIndex: 'action',
            },
            {
              title: '操作对象',
              render: (_, record) => (
                <Space direction="vertical" size={2}>
                  <Typography.Text>{record.targetName || '-'}</Typography.Text>
                  <Typography.Text type="secondary">
                    {[record.targetType, record.targetId].filter(Boolean).join(' / ') || '-'}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: '结果',
              width: 90,
              render: (_, record) => <Tag color={resultColorMap[record.result]}>{resultLabelMap[record.result]}</Tag>,
            },
            {
              title: '详情',
              ellipsis: true,
              render: (_, record) => (
                <Popover
                  title="完整详情"
                  trigger="hover"
                  placement="topLeft"
                  content={
                    <div style={{ maxWidth: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {record.detailSummary || '-'}
                    </div>
                  }
                >
                  <Typography.Text style={{ cursor: 'pointer' }}>
                    {record.detailSummary}
                  </Typography.Text>
                </Popover>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

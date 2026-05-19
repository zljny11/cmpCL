import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requirementsApi } from '../../services/api/requirements';
import { RequirementListItem, RequirementType } from '../../types/requirements';
import { renderRequirementStatus, renderRequirementType } from '../requirements/list/helpers';

export function AdminRequirementListPage() {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [hospitalNameInput, setHospitalNameInput] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [typeInput, setTypeInput] = useState<RequirementType | undefined>();
  const [type, setType] = useState<RequirementType | undefined>();
  const [statusInput, setStatusInput] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  const requirementsQuery = useQuery({
    queryKey: ['admin', 'requirements', keyword, hospitalName, type, status],
    queryFn: () =>
      requirementsApi.list({
        page: 1,
        pageSize: 100,
        keyword: keyword || undefined,
        hospitalName: hospitalName || undefined,
        type,
        status,
      }),
  });

  const items = requirementsQuery.data?.list ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          管理侧需求
        </Typography.Title>
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
          <Input
            placeholder="筛选医院"
            value={hospitalNameInput}
            onChange={(event) => setHospitalNameInput(event.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            placeholder="筛选需求类型"
            allowClear
            value={typeInput}
            onChange={setTypeInput}
            style={{ width: 220 }}
            options={[
              { label: 'CT超高分辨率', value: 'CT_SUPER_RESOLUTION' },
              { label: 'CT降噪', value: 'CT_DENOISE' },
              { label: 'MR超分辨率', value: 'MR_SUPER_RESOLUTION' },
              { label: 'MR降噪', value: 'MR_DENOISE' },
              { label: 'PET降噪', value: 'PET_DENOISE' },
              { label: 'PET超分辨率', value: 'PET_SUPER_RESOLUTION' },
              { label: 'SPECT断层显像降噪', value: 'SPECT_TOMOGRAPHIC_DENOISE' },
              { label: 'SPECT平面显像降噪', value: 'SPECT_PLANAR_DENOISE' },
              { label: '其他 / 自定义', value: 'OTHER' },
            ]}
          />
          <Select
            placeholder="筛选状态"
            allowClear
            value={statusInput}
            onChange={setStatusInput}
            style={{ width: 180 }}
            options={[
              { label: '受理中（需等待）', value: 'processing' },
              { label: '受理中（需补充数据）', value: 'waiting_user' },
              { label: '已完成', value: 'completed' },
            ]}
          />
          <Button
            type="primary"
            onClick={() => {
              setKeyword(keywordInput.trim());
              setHospitalName(hospitalNameInput.trim());
              setType(typeInput);
              setStatus(statusInput);
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setKeywordInput('');
              setKeyword('');
              setHospitalNameInput('');
              setHospitalName('');
              setTypeInput(undefined);
              setType(undefined);
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

import { Button, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequirementTableRecord } from '../types';
import { renderRequirementStatus, renderRequirementType } from '../helpers';
import { RequirementExpandPanel } from './RequirementExpandPanel';
import { loadExpandedKeys, saveExpandedKeys } from './treeExpansionState';
import '../index.less';

interface Props {
  data: RequirementTableRecord[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
}

export function RequirementTable({ data, loading, page, pageSize, total, onPageChange }: Props) {
  const expandedStorageKey = 'AICampCloud:tree:requirements';
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>(() => loadExpandedKeys(expandedStorageKey));

  useEffect(() => {
    const validKeys = new Set(data.map((record) => record.id));
    setExpandedRowKeys((current) => current.filter((key) => validKeys.has(String(key))));
  }, [data]);

  useEffect(() => {
    saveExpandedKeys(expandedStorageKey, expandedRowKeys);
  }, [expandedRowKeys]);

  return (
    <Table<RequirementTableRecord>
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (value) => `共 ${value} 条需求`,
        onChange: onPageChange,
      }}
      expandable={{
        expandedRowKeys,
        onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
        expandedRowRender: (record, _index, indent, expanded) => (
          <RequirementExpandPanel requirementId={record.id} expanded={expanded} />
        ),
      }}
      columns={[
        {
          title: '需求标题',
          dataIndex: 'title',
          width: 320,
          render: (_, record) => (
            <div>
              <Typography.Text strong>{record.title}</Typography.Text>
              <br />
              <Typography.Text type="secondary">未读通知 {record.unreadNotificationCount}</Typography.Text>
            </div>
          ),
        },
        {
          title: '需求类型',
          width: 180,
          render: (_, record) => renderRequirementType(record.type),
        },
        {
          title: '状态',
          width: 92,
          render: (_, record) => renderRequirementStatus(record.status),
        },
        { title: '患者数', dataIndex: 'patientCount', width: 100 },
        { title: '检查数', dataIndex: 'studyCount', width: 100 },
        { title: '序列数', dataIndex: 'seriesCount', width: 100 },
        {
          title: '时间',
          width: 180,
          render: (_, record) => (
            <div>
              <Typography.Text>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                最近留言 {record.latestMessageAt ? dayjs(record.latestMessageAt).format('MM-DD HH:mm') : '-'}
              </Typography.Text>
            </div>
          ),
        },
        {
          title: '操作',
          width: 140,
          render: (_, record) => (
            <Space>
              <Link to={`/requirements/${record.id}`}>
                <Button type="link">详情</Button>
              </Link>
              <Link to={`/requirements/${record.id}/upload`}>
                <Button type="link">上传</Button>
              </Link>
            </Space>
          ),
        },
      ]}
    />
  );
}

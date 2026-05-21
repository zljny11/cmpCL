import { useMutation } from '@tanstack/react-query';
import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../../../services/api/requirements';
import { queryClient } from '../../../../services/query-client';
import { RequirementPatientNode, RequirementSeriesNode, RequirementStudyNode } from '../../../../types/requirements';
import { downloadRequirementDicomZip } from './downloadDicomZip';
import { withTextFilter } from './pacsTableFilters';

interface Props {
  requirementId: string;
  patient: RequirementPatientNode;
  study: RequirementStudyNode;
  data: RequirementSeriesNode[];
  onRefresh?: () => void;
  selectedSeriesKeys: React.Key[];
  onSelectedSeriesKeysChange: (keys: React.Key[]) => void;
  readOnly?: boolean;
}

export function SeriesLevel({
  requirementId,
  patient,
  study,
  data,
  onRefresh,
  selectedSeriesKeys,
  onSelectedSeriesKeysChange,
  readOnly = false,
}: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [downloadingSeriesId, setDownloadingSeriesId] = useState<string | null>(null);
  const selectedRowKeys = useMemo(
    () => data.map((item) => item.id).filter((id) => selectedSeriesKeys.includes(id)),
    [data, selectedSeriesKeys],
  );

  const handleDownloadSeries = async (record: RequirementSeriesNode) => {
    try {
      setDownloadingSeriesId(record.id);
      await downloadRequirementDicomZip(
        [record.id],
        record.seriesDescription || record.seriesUid || `series_${record.id}`,
      );
      message.success('DICOM 下载成功');
    } catch {
      message.error('DICOM 下载失败');
    } finally {
      setDownloadingSeriesId(null);
    }
  };

  const deleteSeriesMutation = useMutation({
    mutationFn: (seriesId: string) => requirementsApi.deleteSeries(requirementId, seriesId),
    onSuccess: async (_, seriesId) => {
      message.success('序列删除成功');
      onSelectedSeriesKeysChange(selectedSeriesKeys.filter((key) => key !== seriesId));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
      ]);
      onRefresh?.();
    },
    onError: () => {
      message.error('序列删除失败');
    },
  });

  return (
    <Table<RequirementSeriesNode>
        className="pacs-tree-table pacs-series-table"
        rowKey="id"
        dataSource={data}
        pagination={false}
        size="small"
        scroll={{ y: 320 }}
        rowSelection={
          readOnly
            ? undefined
            : {
                selectedRowKeys,
                onChange: (keys) => {
                  const remainingKeys = selectedSeriesKeys.filter((key) => !data.some((item) => item.id === key));
                  onSelectedSeriesKeysChange([...remainingKeys, ...keys]);
                },
                columnWidth: 44,
              }
        }
        columns={[
          withTextFilter<RequirementSeriesNode>('序列描述', (record) => record.seriesDescription || record.seriesUid, {
            width: 360,
            render: (_: unknown, record: RequirementSeriesNode) => (
              <div>
                <Typography.Text strong>{record.seriesDescription || '未命名序列'}</Typography.Text>
                <br />
                <Typography.Text type="secondary" ellipsis>
                  {record.seriesUid}
                </Typography.Text>
              </div>
            ),
          }),
          {
            title: '来源批次',
            width: 180,
            render: (_: unknown, record: RequirementSeriesNode) => (
              <div>
                <Tag color={record.datasetBatch.uploadType === 'initial' ? 'geekblue' : 'gold'}>
                  批次 #{record.datasetBatch.batchNo}
                </Tag>
                <div>
                  <Typography.Text type="secondary">
                    {record.datasetBatch.sourceName || record.datasetBatch.uploadType}
                  </Typography.Text>
                </div>
              </div>
            ),
          },
          withTextFilter<RequirementSeriesNode>('医院名称', (record) => record.hospitalName, {
            dataIndex: 'hospitalName',
            width: 140,
            render: (value: string | null) => value || '-',
          }),
          withTextFilter<RequirementSeriesNode>('备注', (record) => record.remark, {
            dataIndex: 'remark',
            width: 160,
            ellipsis: true,
            render: (value: string | null) => value || '-',
          }),
          {
            title: '图像数',
            dataIndex: 'imageCount',
            width: 90,
          },
          withTextFilter<RequirementSeriesNode>(
            '上传时间',
            (record) => (record.uploadedAt ? dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm:ss') : null),
            {
              width: 160,
              render: (_: unknown, record: RequirementSeriesNode) => (record.uploadedAt ? dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm') : '-'),
            },
          ),
          {
            title: '操作',
            width: readOnly ? 190 : 140,
            render: (_: unknown, record: RequirementSeriesNode) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  className="pacs-link-button"
                  onClick={() => navigate(`/requirements/${requirementId}/viewer?seriesId=${record.id}`)}
                >
                  查看
                </Button>
                {readOnly ? (
                  <Button
                    type="link"
                    size="small"
                    className="pacs-link-button"
                    loading={downloadingSeriesId === record.id}
                    onClick={() => void handleDownloadSeries(record)}
                  >
                    下载
                  </Button>
                ) : null}
                {readOnly ? null : (
                  <Popconfirm
                    title="删除序列"
                    description="删除后将移除该序列对应文件。"
                    okText="确定"
                    cancelText="取消"
                    onConfirm={() => deleteSeriesMutation.mutate(record.id)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      className="pacs-link-button pacs-danger-link"
                      loading={deleteSeriesMutation.isPending && deleteSeriesMutation.variables === record.id}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
  );
}

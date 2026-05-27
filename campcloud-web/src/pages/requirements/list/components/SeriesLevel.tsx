import { useMutation } from '@tanstack/react-query';
import { App, Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../../../services/api/requirements';
import { queryClient } from '../../../../services/query-client';
import { RequirementPatientNode, RequirementSeriesNode, RequirementStudyNode } from '../../../../types/requirements';
import { DataPageVisibleTags } from './RequirementExpandPanel';
import { downloadRequirementDicomZip } from './downloadDicomZip';
import { withTextFilter } from './pacsTableFilters';
import { ANNOTATION_STATUS_MAP, CLINICAL_TAG_MAP } from '../../../../constants/dicom';

interface Props {
  requirementId: string;
  patient: RequirementPatientNode;
  study: RequirementStudyNode;
  data: RequirementSeriesNode[];
  onRefresh?: () => void;
  selectedSeriesKeys: React.Key[];
  onSelectedSeriesKeysChange: (keys: React.Key[]) => void;
  readOnly?: boolean;
  visibleTags?: DataPageVisibleTags;
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
  visibleTags,
}: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [downloadingSeriesId, setDownloadingSeriesId] = useState<string | null>(null);

  // 根据屏幕大小和模式动态计算滚动高度
  const getVerticalScrollHeight = () => {
    if (readOnly) {
      return 'calc(100vh - 290px)';
    }

    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (width <= 480) {
      return 200;
    } else if (width <= 768) {
      return 250;
    }
    return 320;
  };

  const verticalScrollHeight = getVerticalScrollHeight();
  const selectedRowKeys = useMemo(
    () => data.map((item) => item.id).filter((id) => selectedSeriesKeys.includes(id)),
    [data, selectedSeriesKeys],
  );
  const bodyPartFilters = useMemo(
    () =>
      Array.from(new Set(data.map((item) => item.bodyPart?.trim()).filter(Boolean) as string[]))
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map((value) => ({ text: value, value })),
    [data],
  );
  const diagnosisFilters = useMemo(
    () =>
      Array.from(
        new Set(
          data.flatMap((item) => (item.diagnosis ?? []).map((diagnosis) => diagnosis.trim()).filter(Boolean)),
        ),
      )
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map((value) => ({ text: value, value })),
    [data],
  );
  const clinicalTagFilters = useMemo(
    () => Object.entries(CLINICAL_TAG_MAP).map(([value, label]) => ({ text: label, value })),
    [],
  );
  const annotationStatusFilters = useMemo(
    () => Object.entries(ANNOTATION_STATUS_MAP).map(([value, label]) => ({ text: label, value })),
    [],
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

  const renderRemark = (value: string | null) => {
    if (!value) {
      return '-';
    }

    const trimmed = value.trim();
    if (trimmed.length <= 10) {
      return trimmed;
    }

    return (
      <Tooltip
        title={trimmed}
        color="#ffffff"
        styles={{ body: { color: '#000000' } }}
      >
        <span>{`${trimmed.slice(0, 10)}...`}</span>
      </Tooltip>
    );
  };

  const renderStringArray = (values: string[] | null | undefined, mapper?: Record<string, string>) => {
    if (!values || values.length === 0) {
      return '-';
    }
    return values.map((value) => mapper?.[value] || value).join('、');
  };

  return (
    <div className="pacs-nested-scroll-shell">
      <div className="pacs-nested-scroll-content">
        <Table<RequirementSeriesNode>
        className="pacs-tree-table pacs-series-table"
        rowKey="id"
        dataSource={data}
        pagination={false}
        size="small"
        showSorterTooltip={false}
        scroll={{ y: verticalScrollHeight }}
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
                {!visibleTags?.seriesUid ? (
                  <Typography.Text type="secondary" ellipsis>
                    {record.seriesUid}
                  </Typography.Text>
                ) : null}
              </div>
            ),
          }),
          {
            title: '序列 UID',
            width: 220,
            render: (_: unknown, record: RequirementSeriesNode) => record.seriesUid || '-',
            hidden: !visibleTags?.seriesUid,
          },
          {
            title: '身体部位',
            width: 140,
            filters: bodyPartFilters,
            filterSearch: true,
            onFilter: (value: boolean | React.Key, record: RequirementSeriesNode) => (record.bodyPart || '') === String(value),
            render: (_: unknown, record: RequirementSeriesNode) => record.bodyPart || '-',
            hidden: !visibleTags?.seriesBodyPart,
          },
          {
            title: '疾病诊断',
            width: 180,
            filters: diagnosisFilters,
            filterSearch: true,
            onFilter: (value: boolean | React.Key, record: RequirementSeriesNode) =>
              (record.diagnosis ?? []).some((item: string) => item === String(value)),
            render: (_: unknown, record: RequirementSeriesNode) => renderStringArray(record.diagnosis),
            hidden: !visibleTags?.seriesDiagnosis,
          },
          {
            title: '临床金标准',
            width: 220,
            filters: clinicalTagFilters,
            filterMultiple: true,
            onFilter: (value: boolean | React.Key, record: RequirementSeriesNode) =>
              (record.clinicalTags ?? []).some((item: string) => item === String(value)),
            render: (_: unknown, record: RequirementSeriesNode) => renderStringArray(record.clinicalTags, CLINICAL_TAG_MAP),
            hidden: !visibleTags?.seriesClinicalTags,
          },
          {
            title: '标注状态',
            width: 140,
            filters: annotationStatusFilters,
            filterMultiple: false,
            onFilter: (value: boolean | React.Key, record: RequirementSeriesNode) =>
              (record.annotationStatus || '') === String(value),
            render: (_: unknown, record: RequirementSeriesNode) =>
              record.annotationStatus ? ANNOTATION_STATUS_MAP[record.annotationStatus] || record.annotationStatus : '-',
            hidden: !visibleTags?.seriesAnnotationStatus,
          },
          {
            title: '来源批次',
            width: 180,
            sorter: (left: RequirementSeriesNode, right: RequirementSeriesNode) =>
              left.datasetBatch.batchNo - right.datasetBatch.batchNo,
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
            render: (value: string | null) => renderRemark(value),
          }),
          {
            title: '图像数',
            dataIndex: 'imageCount',
            width: 90,
            sorter: (left: RequirementSeriesNode, right: RequirementSeriesNode) => left.imageCount - right.imageCount,
          },
          {
            title: '上传时间',
            width: 160,
            sorter: (left: RequirementSeriesNode, right: RequirementSeriesNode) => {
              const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
              const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
              return leftTime - rightTime;
            },
            render: (_: unknown, record: RequirementSeriesNode) =>
              record.uploadedAt ? dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm') : '-',
          },
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
        ].filter((column) => !('hidden' in column) || !column.hidden)}
      />
      </div>
    </div>
  );
}

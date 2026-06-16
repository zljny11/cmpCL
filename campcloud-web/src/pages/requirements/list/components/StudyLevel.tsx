import { useMutation } from '@tanstack/react-query';
import { App, Button, Popconfirm, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../../../services/api/requirements';
import { queryClient } from '../../../../services/query-client';
import { RequirementPatientNode, RequirementStudyNode } from '../../../../types/requirements';
import { DataPageVisibleTags } from './RequirementExpandPanel';
import { downloadRequirementDicomZip } from './downloadDicomZip';
import { SeriesLevel } from './SeriesLevel';
import { withTextFilter } from './pacsTableFilters';

interface Props {
  requirementId: string;
  patient: RequirementPatientNode;
  data: RequirementStudyNode[];
  onRefresh?: () => void;
  onSeriesExpand?: () => void;
  selectedSeriesKeys: React.Key[];
  onSelectedSeriesKeysChange: (keys: React.Key[]) => void;
  readOnly?: boolean;
  visibleTags?: DataPageVisibleTags;
  allowPreview?: boolean;
  allowDownload?: boolean;
}

export function StudyLevel({
  requirementId,
  patient,
  data,
  onRefresh,
  onSeriesExpand,
  selectedSeriesKeys,
  onSelectedSeriesKeysChange,
  readOnly = false,
  visibleTags,
  allowPreview: _allowPreview = true,
  allowDownload: _allowDownload = false,
}: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [downloadingStudyId, setDownloadingStudyId] = useState<string | null>(null);
  const selectedStudyKeys = useMemo(
    () =>
      data
        .filter((study) => study.series.length > 0 && study.series.every((series) => selectedSeriesKeys.includes(series.id)))
        .map((study) => study.id),
    [data, selectedSeriesKeys],
  );

  useEffect(() => {
    const validKeys = new Set(data.map((study) => study.id));
    setExpandedRowKeys((current) => current.filter((key) => validKeys.has(String(key))));
  }, [data]);

  const deleteStudyMutation = useMutation({
    mutationFn: (studyId: string) => requirementsApi.deleteStudy(requirementId, studyId),
    onSuccess: async () => {
      message.success('检查删除成功');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
      ]);
      onRefresh?.();
    },
    onError: () => {
      message.error('检查删除失败');
    },
  });

  const handleDownloadStudy = async (record: RequirementStudyNode) => {
    if (record.series.length === 0) {
      message.warning('当前检查下没有可下载的序列');
      return;
    }

    try {
      setDownloadingStudyId(record.id);
      await downloadRequirementDicomZip(
        record.series.map((series) => series.id),
        record.studyId || record.studyDescription || record.studyUid || `study_${record.id}`,
      );
      message.success('DICOM 下载成功');
    } catch {
      message.error('DICOM 下载失败');
    } finally {
      setDownloadingStudyId(null);
    }
  };

  return (
    <div className="pacs-nested-scroll-shell">
      <div className="pacs-nested-scroll-content">
        <Table<RequirementStudyNode>
        className="pacs-tree-table pacs-study-table"
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data}
        expandedRowKeys={expandedRowKeys}
        onExpand={(expanded, record) => {
          setExpandedRowKeys((current) =>
            expanded ? [...current, record.id] : current.filter((key) => key !== record.id),
          );
          if (expanded) {
            onSeriesExpand?.();
          }
        }}
        rowSelection={
          readOnly
            ? undefined
            : {
                selectedRowKeys: selectedStudyKeys,
                columnWidth: 44,
                onSelect: (record, selected) => {
                  const seriesIds = record.series.map((series) => series.id);
                  const nextKeys = selected
                    ? [...new Set([...selectedSeriesKeys, ...seriesIds])]
                    : selectedSeriesKeys.filter((key) => !seriesIds.includes(String(key)));
                  onSelectedSeriesKeysChange(nextKeys);
                },
                getCheckboxProps: (record) => {
                  const seriesIds = record.series.map((series) => series.id);
                  const selectedCount = seriesIds.filter((id) => selectedSeriesKeys.includes(id)).length;
                  return {
                    indeterminate: selectedCount > 0 && selectedCount < seriesIds.length,
                    disabled: seriesIds.length === 0,
                  };
                },
              }
        }
        rowClassName={(record) => (expandedRowKeys.includes(record.id) ? 'pacs-expanded-row' : '')}
        expandable={{
          expandedRowRender: (record) => (
            <SeriesLevel
              requirementId={requirementId}
              patient={patient}
              study={record}
              data={record.series}
              onRefresh={onRefresh}
              selectedSeriesKeys={selectedSeriesKeys}
              onSelectedSeriesKeysChange={onSelectedSeriesKeysChange}
              readOnly={readOnly}
              visibleTags={visibleTags}
              allowPreview={_allowPreview}
              allowDownload={_allowDownload}
            />
          ),
          rowExpandable: (record) => record.series.length > 0,
        }}
        columns={[
          withTextFilter<RequirementStudyNode>('检查 ID', (record) => record.studyId || record.studyUid, {
            width: 220,
            render: (_: unknown, record: RequirementStudyNode) => (
              <div>
                <Typography.Text strong>{record.studyId || record.studyUid}</Typography.Text>
              </div>
            ),
          }),
          withTextFilter<RequirementStudyNode>('模态', (record) => record.modality, {
            width: 100,
            render: (_: unknown, record: RequirementStudyNode) => record.modality || '未知',
          }),
          withTextFilter<RequirementStudyNode>(
            '检查日期',
            (record) => (record.studyDate ? dayjs(record.studyDate).format('YYYY-MM-DD') : null),
            {
              width: 140,
              render: (_: unknown, record: RequirementStudyNode) => (record.studyDate ? dayjs(record.studyDate).format('YYYY-MM-DD') : '-'),
            },
          ),
          withTextFilter<RequirementStudyNode>('检查描述', (record) => record.studyDescription, {
            width: 220,
            dataIndex: 'studyDescription',
            render: (value: string | null) => value || '-',
          }),
          {
            title: '厂家',
            width: 160,
            render: (_: unknown, record: RequirementStudyNode) => record.manufacturer || '-',
            hidden: !visibleTags?.studyManufacturer,
          },
          {
            title: '协议',
            width: 180,
            render: (_: unknown, record: RequirementStudyNode) => record.protocolName || '-',
            hidden: !visibleTags?.studyProtocolName,
          },
          {
            title: '设备型号',
            width: 180,
            render: (_: unknown, record: RequirementStudyNode) => record.manufacturerModelName || '-',
            hidden: !visibleTags?.studyManufacturerModelName,
          },
          {
            title: '序列数',
            width: 90,
            render: (_: unknown, record: RequirementStudyNode) => record.series.length,
          },
          {
            title: '操作',
            width: readOnly ? 190 : 140,
            render: (_: unknown, record: RequirementStudyNode) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  className="pacs-link-button"
                  onClick={() => navigate(`/requirements/${requirementId}/viewer?studyId=${record.id}`)}
                >
                  查看
                </Button>
                {readOnly ? (
                  <Button
                    type="link"
                    size="small"
                    className="pacs-link-button"
                    loading={downloadingStudyId === record.id}
                    onClick={() => void handleDownloadStudy(record)}
                  >
                    下载
                  </Button>
                ) : null}
                {readOnly ? null : (
                  <Popconfirm
                    title="删除检查"
                    description="删除后将同时移除该检查下的全部序列与文件。"
                    okText="确定"
                    cancelText="取消"
                    onConfirm={() => deleteStudyMutation.mutate(record.id)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      className="pacs-link-button pacs-danger-link"
                      loading={deleteStudyMutation.isPending && deleteStudyMutation.variables === record.id}
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

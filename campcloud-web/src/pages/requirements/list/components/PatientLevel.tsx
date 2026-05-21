import { Button, Empty, Space, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RequirementPatientNode } from '../../../../types/requirements';
import { StudyLevel } from './StudyLevel';
import { withTextFilter } from './pacsTableFilters';
import { loadExpandedKeys, saveExpandedKeys } from './treeExpansionState';

interface Props {
  requirementId: string;
  data: RequirementPatientNode[];
  onRefresh?: () => void;
  readOnly?: boolean;
}

export function PatientLevel({ requirementId, data, onRefresh, readOnly = false }: Props) {
  const expandedStorageKey = `AICampCloud:tree:patients:${requirementId}`;
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>(() => loadExpandedKeys(expandedStorageKey));
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useState<React.Key[]>([]);
  const scrollShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const validKeys = new Set(data.map((patient) => patient.id));
    setExpandedRowKeys((current) => current.filter((key) => validKeys.has(String(key))));
  }, [data]);

  useEffect(() => {
    saveExpandedKeys(expandedStorageKey, expandedRowKeys);
  }, [expandedRowKeys, expandedStorageKey]);

  if (data.length === 0) {
    return <Empty description="当前需求单暂无患者层级数据" />;
  }

  const totalStudies = useMemo(() => data.reduce((sum, patient) => sum + patient.studies.length, 0), [data]);
  const totalSeries = useMemo(
    () => data.reduce((sum, patient) => sum + patient.studies.reduce((studySum, study) => studySum + study.series.length, 0), 0),
    [data],
  );
  const selectedPatientKeys = useMemo(
    () =>
      data
        .filter((patient) => {
          const seriesIds = patient.studies.flatMap((study) => study.series.map((series) => series.id));
          return seriesIds.length > 0 && seriesIds.every((id) => selectedSeriesKeys.includes(id));
        })
        .map((patient) => patient.id),
    [data, selectedSeriesKeys],
  );

  const scrollToRightEdge = useCallback(() => {
    const shell = scrollShellRef.current;
    if (!shell) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        shell.scrollLeft = shell.scrollWidth;
      });
    });
  }, []);

  return (
    <div className="pacs-tree">
      <div className="pacs-tree-summary">
        <Typography.Text>患者 {data.length}</Typography.Text>
        <Typography.Text>检查 {totalStudies}</Typography.Text>
        <Typography.Text>序列 {totalSeries}</Typography.Text>
      </div>
      <div ref={scrollShellRef} className="pacs-tree-scroll-shell">
        <div className="pacs-tree-scroll-content">
          <Table<RequirementPatientNode>
            className="pacs-tree-table pacs-patient-table"
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data}
            expandedRowKeys={expandedRowKeys}
            onExpand={(expanded, record) => {
              setExpandedRowKeys((current) =>
                expanded ? [...current, record.id] : current.filter((key) => key !== record.id),
              );
            }}
            rowSelection={
              readOnly
                ? undefined
                : {
                    selectedRowKeys: selectedPatientKeys,
                    columnWidth: 44,
                    onSelect: (record, selected) => {
                      const seriesIds = record.studies.flatMap((study) => study.series.map((series) => series.id));
                      const nextKeys = selected
                        ? [...new Set([...selectedSeriesKeys, ...seriesIds])]
                        : selectedSeriesKeys.filter((key) => !seriesIds.includes(String(key)));
                      setSelectedSeriesKeys(nextKeys);
                    },
                    getCheckboxProps: (record) => {
                      const seriesIds = record.studies.flatMap((study) => study.series.map((series) => series.id));
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
                <StudyLevel
                  requirementId={requirementId}
                  patient={record}
                  data={record.studies}
                  onRefresh={onRefresh}
                  onSeriesExpand={scrollToRightEdge}
                  selectedSeriesKeys={selectedSeriesKeys}
                  onSelectedSeriesKeysChange={setSelectedSeriesKeys}
                  readOnly={readOnly}
                />
              ),
              rowExpandable: (record) => record.studies.length > 0,
            }}
            columns={[
              withTextFilter<RequirementPatientNode>('姓名', (record) => record.patientName || record.patientUid, {
                width: 240,
                render: (_: unknown, record: RequirementPatientNode) => (
                  <div>
                    <Typography.Text strong>{record.patientName || '未命名患者'}</Typography.Text>
                  </div>
                ),
              }),
              {
                title: '性别',
                width: 90,
                render: (_: unknown, record: RequirementPatientNode) => record.sex || '未知',
              },
              withTextFilter<RequirementPatientNode>(
                '生日',
                (record) => (record.birthday ? dayjs(record.birthday).format('YYYY-MM-DD') : null),
                {
                  width: 140,
                  render: (_: unknown, record: RequirementPatientNode) =>
                    record.birthday ? dayjs(record.birthday).format('YYYY-MM-DD') : '-',
                },
              ),
              withTextFilter<RequirementPatientNode>('患者 ID', (record) => record.patientId, {
                dataIndex: 'patientId',
                width: 160,
                render: (value: string | null) => value || '-',
              }),
              {
                title: '图像总张数',
                dataIndex: 'imageCount',
                width: 120,
              },
              {
                title: '操作',
                width: 140,
                render: (_: unknown, record: RequirementPatientNode) => (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      className="pacs-link-button"
                      onClick={() => message.info(`患者 ${record.patientName || record.patientId || record.patientUid} 暂无下载能力`)}
                    >
                      下载
                    </Button>
                  </Space>
                ),
                hidden: readOnly,
              },
            ].filter((column) => !('hidden' in column) || !column.hidden)}
          />
        </div>
      </div>
    </div>
  );
}

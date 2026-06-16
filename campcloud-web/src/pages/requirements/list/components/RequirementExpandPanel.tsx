import { Alert, Button, Empty, Space, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useRequirementDataTree } from '../hooks';
import { PatientLevel } from './PatientLevel';
import '../index.less';

export type DataPageVisibleTags = {
  studyManufacturer: boolean;
  studyProtocolName: boolean;
  studyManufacturerModelName: boolean;
  seriesUid: boolean;
  seriesBodyPart: boolean;
  seriesDiagnosis: boolean;
  seriesClinicalTags: boolean;
  seriesAnnotationStatus: boolean;
};

interface Props {
  requirementId: string;
  expanded: boolean;
  readOnly?: boolean;
  visibleTags?: DataPageVisibleTags;
  allowPreview?: boolean;
  allowDownload?: boolean;
}

export function RequirementExpandPanel({
  requirementId,
  expanded,
  readOnly = false,
  visibleTags,
  allowPreview = true,
  allowDownload = false,
}: Props) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading, isError, refetch, isFetching } = useRequirementDataTree(requirementId, expanded, { page, pageSize });

  useEffect(() => {
    setPage(1);
  }, [requirementId, expanded]);

  if (isLoading || isFetching) {
    return <Spin />;
  }

  if (isError) {
    return <Alert type="error" message="三层结构加载失败" showIcon />;
  }

  if (!data?.patients?.length) {
    return <Empty description="当前页暂无患者层级数据" />;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Text type="secondary">
          患者 {data.total}，当前第 {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页
        </Typography.Text>
        <Space>
          <Button
            size="small"
            disabled={data.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            size="small"
            disabled={!data.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </Space>
      </Space>
      <PatientLevel
        requirementId={requirementId}
        data={data.patients}
        onRefresh={() => void refetch()}
        readOnly={readOnly}
        visibleTags={visibleTags}
        allowPreview={allowPreview}
        allowDownload={allowDownload}
      />
    </Space>
  );
}

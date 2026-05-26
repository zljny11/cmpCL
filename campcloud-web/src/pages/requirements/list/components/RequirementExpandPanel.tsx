import { Alert, Spin } from 'antd';
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
}

export function RequirementExpandPanel({
  requirementId,
  expanded,
  readOnly = false,
  visibleTags,
}: Props) {
  const { data, isLoading, isError, refetch } = useRequirementDataTree(requirementId, expanded);

  if (isLoading) {
    return <Spin />;
  }

  if (isError) {
    return <Alert type="error" message="三层结构加载失败" showIcon />;
  }

  return (
    <PatientLevel
      requirementId={requirementId}
      data={data?.patients ?? []}
      onRefresh={() => void refetch()}
      readOnly={readOnly}
      visibleTags={visibleTags}
    />
  );
}

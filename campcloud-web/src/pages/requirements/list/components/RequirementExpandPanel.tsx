import { Alert, Spin } from 'antd';
import { useRequirementDataTree } from '../hooks';
import { PatientLevel } from './PatientLevel';
import '../index.less';

interface Props {
  requirementId: string;
  expanded: boolean;
}

export function RequirementExpandPanel({ requirementId, expanded }: Props) {
  const { data, isLoading, isError, refetch } = useRequirementDataTree(requirementId, expanded);

  if (isLoading) {
    return <Spin />;
  }

  if (isError) {
    return <Alert type="error" message="三层结构加载失败" showIcon />;
  }

  return <PatientLevel requirementId={requirementId} data={data?.patients ?? []} onRefresh={() => void refetch()} />;
}

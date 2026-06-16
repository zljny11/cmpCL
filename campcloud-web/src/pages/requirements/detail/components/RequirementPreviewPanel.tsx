import { Button, Card, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { RequirementExpandPanel } from '../../list/components/RequirementExpandPanel';

interface Props {
  requirementId: string;
}

export function RequirementPreviewPanel({ requirementId }: Props) {
  const navigate = useNavigate();

  return (
    <Card
      title={
        <Space size={12} wrap>
          <span>文件预览</span>
          <Button type="primary" onClick={() => navigate(`/requirements/${requirementId}/upload/data?from=detail`)}>
            完整数据页
          </Button>
        </Space>
      }
    >
      <RequirementExpandPanel requirementId={requirementId} expanded readOnly />
    </Card>
  );
}

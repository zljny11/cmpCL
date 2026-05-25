import { Button, Space } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RequirementExpandPanel } from '../requirements/list/components/RequirementExpandPanel';
import '../admin/AdminRequirementDataPage.less';

export function UploadRequirementDataPage() {
  const { id: routeRequirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requirementId = routeRequirementId || searchParams.get('requirementId') || '';
  const from = searchParams.get('from') || 'upload';
  const navigate = useNavigate();

  const handleBack = () => {
    if (from === 'detail') {
      navigate(`/requirements/${requirementId}`);
    } else {
      navigate(`/requirements/${requirementId}/upload`);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="admin-requirement-data-page">
      <Space>
        <Button onClick={handleBack}>返回</Button>
      </Space>
      <RequirementExpandPanel requirementId={requirementId} expanded readOnly />
    </Space>
  );
}

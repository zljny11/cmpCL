import { Button, Result, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { RequirementExpandPanel } from '../requirements/list/components/RequirementExpandPanel';
import './AdminRequirementDataPage.less';

export function AdminRequirementDataPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="admin-requirement-data-page">
      <Space>
        <Button onClick={() => navigate(`/admin/requirements/${id}`)}>返回详情</Button>
      </Space>
      <RequirementExpandPanel requirementId={id} expanded readOnly />
    </Space>
  );
}

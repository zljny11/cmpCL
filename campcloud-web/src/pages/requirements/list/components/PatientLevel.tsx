import { Card, Empty, Typography } from 'antd';
import { RequirementPatientNode } from '../../../../types/requirements';
import { StudyLevel } from './StudyLevel';

interface Props {
  data: RequirementPatientNode[];
}

export function PatientLevel({ data }: Props) {
  if (data.length === 0) {
    return <Empty description="当前需求单暂无患者层级数据" />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.map((patient) => (
        <Card key={patient.id} size="small">
          <Typography.Text strong>{patient.patientName || patient.patientUid}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Patient ID: {patient.patientId || '-'} / {patient.sex || '未知性别'} / 图像数 {patient.imageCount}
          </Typography.Paragraph>
          <StudyLevel data={patient.studies} />
        </Card>
      ))}
    </div>
  );
}

import { Collapse, Typography } from 'antd';
import dayjs from 'dayjs';
import { RequirementStudyNode } from '../../../../types/requirements';
import { SeriesLevel } from './SeriesLevel';

interface Props {
  data: RequirementStudyNode[];
}

export function StudyLevel({ data }: Props) {
  return (
    <Collapse
      items={data.map((study) => ({
        key: study.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Typography.Text strong>{study.studyDescription || study.studyUid}</Typography.Text>
            <Typography.Text type="secondary">
              {study.modality || '未知模态'} · {study.studyDate ? dayjs(study.studyDate).format('YYYY-MM-DD') : '无日期'} ·{' '}
              {study.series.length} 个序列
            </Typography.Text>
          </div>
        ),
        children: <SeriesLevel data={study.series} />,
      }))}
    />
  );
}

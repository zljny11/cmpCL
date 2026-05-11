import { Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { RequirementSeriesNode } from '../../../../types/requirements';

interface Props {
  data: RequirementSeriesNode[];
}

export function SeriesLevel({ data }: Props) {
  return (
    <Table<RequirementSeriesNode>
      rowKey="id"
      dataSource={data}
      pagination={false}
      size="small"
      columns={[
        { title: '序列 UID', dataIndex: 'seriesUid' },
        {
          title: '序列描述',
          render: (_, record) => (
            <div>
              <Typography.Text strong>{record.seriesDescription || '未命名序列'}</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                批次 #{record.datasetBatch.batchNo} / {record.datasetBatch.uploadType}
              </Typography.Text>
            </div>
          ),
        },
        { title: '图像数', dataIndex: 'imageCount', width: 100 },
        {
          title: '上传时间',
          render: (_, record) => (record.uploadedAt ? dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm') : '-'),
        },
      ]}
    />
  );
}

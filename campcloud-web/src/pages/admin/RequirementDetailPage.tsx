import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Empty, Form, Input, List, Progress, Result, Select, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requirementsApi } from '../../services/api/requirements';
import { queryClient } from '../../services/query-client';
import { RequirementStatus } from '../../types/requirements';
import { RequirementDeliveryPanel } from '../requirements/detail/components/RequirementDeliveryPanel';
import { RequirementExpandPanel } from '../requirements/list/components/RequirementExpandPanel';
import { renderRequirementStatus, renderRequirementType } from '../requirements/list/helpers';

const statusOptions: Array<{ label: string; value: RequirementStatus }> = [
  { label: 'Processing', value: 'processing' },
  { label: 'Waiting For User', value: 'waiting_user' },
  { label: 'Completed', value: 'completed' },
];

function formatFileSize(size: number) {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${Math.max(size / 1024 / 1024, 0.01).toFixed(2)} MB`;
}

function formatEstimatedOssCost(size: number) {
  return ((size / 1024 / 1024 / 1024) * 0.5).toFixed(2);
}

function formatPullStage(stage: string) {
  switch (stage) {
    case 'queued':
      return 'Queued';
    case 'downloading':
      return 'Downloading from OSS';
    case 'persisting':
      return 'Persisting to local storage';
    case 'cleaning':
      return 'Cleaning OSS source files';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return stage;
  }
}

function getPullPercent(totalBytes: number, completedBytes: number, totalFiles: number, finishedFiles: number) {
  if (totalBytes > 0) {
    return Math.max(0, Math.min(100, Number(((completedBytes / totalBytes) * 100).toFixed(1))));
  }
  if (totalFiles > 0) {
    return Math.max(0, Math.min(100, Number(((finishedFiles / totalFiles) * 100).toFixed(1))));
  }
  return 0;
}

export function AdminRequirementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [messageForm] = Form.useForm<{ content: string }>();
  const [statusForm] = Form.useForm<{ status: RequirementStatus; reason?: string }>();
  const [watchPullProgress, setWatchPullProgress] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['admin', 'requirement-detail', id],
    queryFn: () => requirementsApi.detail(id),
    enabled: Boolean(id),
  });
  const messagesQuery = useQuery({
    queryKey: ['admin', 'requirement-messages', id],
    queryFn: () => requirementsApi.listMessages(id),
    enabled: Boolean(id),
  });
  const batchQuery = useQuery({
    queryKey: ['admin', 'requirement-batches', id],
    queryFn: () => requirementsApi.listDatasetBatches(id, { page: 1, pageSize: 100 }),
    enabled: Boolean(id),
  });
  const pullProgressQuery = useQuery({
    queryKey: ['admin', 'requirement-pull-progress', id],
    queryFn: () => requirementsApi.getRequirementDetailPullProgress(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });

  const createMessageMutation = useMutation({
    mutationFn: (payload: { content: string }) => requirementsApi.createMessage(id, payload),
    onSuccess: async () => {
      message.success('Reply sent.');
      messageForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-messages', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-messages', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { status: RequirementStatus; reason?: string }) => requirementsApi.updateStatus(id, payload),
    onSuccess: async () => {
      message.success('Requirement status updated.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });

  const pullDetailDataMutation = useMutation({
    mutationFn: () => requirementsApi.pullRequirementDetailData(id),
    onSuccess: async () => {
      setWatchPullProgress(true);
      message.success('Detail data pull started. You can track live progress below.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-pull-progress', id] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-batches', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
      ]);
    },
  });

  const data = detailQuery.data;
  const pullProgress = pullProgressQuery.data;
  const pendingBatches = batchQuery.data?.list.filter((item) => item.status === 'uploaded') ?? [];
  const pendingBytes = pendingBatches.reduce((sum, item) => sum + item.totalBytes, 0);
  const pendingFileCount = pendingBatches.reduce((sum, item) => sum + item.fileCount, 0);
  const pullFinishedFiles = (pullProgress?.completedFiles ?? 0) + (pullProgress?.failedFiles ?? 0);
  const pullPercent = pullProgress
    ? getPullPercent(pullProgress.totalBytes, pullProgress.completedBytes, pullProgress.totalFiles, pullFinishedFiles)
    : 0;
  const showPullCard = pendingBatches.length > 0 || (pullProgress?.status && pullProgress.status !== 'idle');

  useEffect(() => {
    if (pullProgress?.status === 'running') {
      setWatchPullProgress(true);
    }
  }, [pullProgress?.status]);

  useEffect(() => {
    if (!watchPullProgress || !pullProgress) {
      return;
    }
    if (pullProgress.status !== 'completed' && pullProgress.status !== 'failed') {
      return;
    }

    const refresh = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-batches', id] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', id, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'requirement-detail', id] }),
      ]);
    };

    void refresh();
    if (pullProgress.status === 'completed') {
      message.success('Detail data pull completed.');
    } else {
      message.error(pullProgress.errorMessage || 'Detail data pull failed.');
    }
    setWatchPullProgress(false);
  }, [watchPullProgress, pullProgress, id, message]);

  if (detailQuery.isError) {
    return <Result status="error" title="Failed to load requirement detail" />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Requirement Detail
        </Typography.Title>
      </div>

      {data ? (
        <>
          <Card loading={detailQuery.isLoading}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                {renderRequirementStatus(data.status)}
                <Tag color="blue">{renderRequirementType(data.type, data.typeCustom)}</Tag>
                <Tag>Created {dayjs(data.createdAt).format('YYYY-MM-DD HH:mm')}</Tag>
              </Space>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {data.title}
              </Typography.Title>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.description}</Typography.Paragraph>
            </Space>
          </Card>

          <Descriptions bordered column={2}>
            <Descriptions.Item label="Submitted By">{data.creator?.username || '-'}</Descriptions.Item>
            <Descriptions.Item label="Hospital">{data.creator?.hospitalName || '-'}</Descriptions.Item>
            <Descriptions.Item label="Contact">{data.creator?.profile?.realName || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{data.creator?.profile?.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="Status">{renderRequirementStatus(data.status)}</Descriptions.Item>
            <Descriptions.Item label="Type">{renderRequirementType(data.type, data.typeCustom)}</Descriptions.Item>
            <Descriptions.Item label="Expected Goal" span={2}>
              {data.expectedGoal || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Remark" span={2}>
              {data.remark || '-'}
            </Descriptions.Item>
          </Descriptions>

          {showPullCard ? (
            <Card title="Detail Data Pull">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {pendingBatches.length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="Pending OSS detail data is waiting to be pulled"
                    description={`Batches: ${pendingBatches.length}, files: ${pendingFileCount}, estimated size: ${formatFileSize(pendingBytes)}.`}
                  />
                ) : null}

                {pullProgress && pullProgress.status !== 'idle' ? (
                  <>
                    <Alert
                      type={pullProgress.status === 'failed' ? 'error' : pullProgress.status === 'completed' ? 'success' : 'info'}
                      showIcon
                      message={`Status: ${pullProgress.status}`}
                      description={
                        pullProgress.errorMessage
                          || `Current stage: ${formatPullStage(pullProgress.stage)}${pullProgress.currentFileName ? `, file: ${pullProgress.currentFileName}` : ''}`
                      }
                    />
                    <Progress
                      percent={pullPercent}
                      status={pullProgress.status === 'failed' ? 'exception' : pullProgress.status === 'completed' ? 'success' : 'active'}
                    />
                    <Typography.Text type="secondary">
                      {`Finished files: ${pullFinishedFiles}/${pullProgress.totalFiles}, bytes: ${formatFileSize(pullProgress.completedBytes)} / ${formatFileSize(pullProgress.totalBytes)}`}
                    </Typography.Text>
                    <List
                      size="small"
                      bordered
                      dataSource={pullProgress.batches}
                      renderItem={(item) => {
                        const batchFinishedFiles = item.completedFiles + item.failedFiles;
                        const batchPercent = getPullPercent(item.totalBytes, item.completedBytes, item.totalFiles, batchFinishedFiles);
                        return (
                          <List.Item>
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space wrap>
                                <Typography.Text strong>{`Batch #${item.batchNo}`}</Typography.Text>
                                <Tag color={item.status === 'failed' ? 'red' : item.status === 'completed' ? 'green' : 'blue'}>{item.status}</Tag>
                                <Typography.Text type="secondary">{formatPullStage(item.stage)}</Typography.Text>
                              </Space>
                              <Progress
                                percent={batchPercent}
                                size="small"
                                status={item.status === 'failed' ? 'exception' : item.status === 'completed' ? 'success' : 'active'}
                              />
                              <Typography.Text type="secondary">
                                {`Files ${batchFinishedFiles}/${item.totalFiles}, bytes ${formatFileSize(item.completedBytes)} / ${formatFileSize(item.totalBytes)}`}
                              </Typography.Text>
                              {item.currentFileName ? <Typography.Text type="secondary">{`Current file: ${item.currentFileName}`}</Typography.Text> : null}
                              {item.errorMessage ? <Typography.Text type="danger">{item.errorMessage}</Typography.Text> : null}
                            </Space>
                          </List.Item>
                        );
                      }}
                    />
                  </>
                ) : null}

                {pendingBatches.length > 0 ? (
                  <Space>
                    <Button
                      type="primary"
                      loading={pullDetailDataMutation.isPending || pullProgress?.status === 'running'}
                      disabled={pullProgress?.status === 'running'}
                      onClick={() =>
                        modal.confirm({
                          title: 'Pull requirement detail data',
                          content: `This will pull the pending DICOM files from OSS to the intranet server. Estimated egress: ${formatFileSize(pendingBytes)}. Estimated OSS cost: ${formatEstimatedOssCost(pendingBytes)}.`,
                          okText: 'Start pull',
                          cancelText: 'Cancel',
                          onOk: () => pullDetailDataMutation.mutateAsync(),
                        })
                      }
                    >
                      Pull detail data
                    </Button>
                    <Typography.Text type="secondary">
                      Before this step, uploaded files only stay in OSS and do not appear in the local data tree.
                    </Typography.Text>
                  </Space>
                ) : null}
              </Space>
            </Card>
          ) : null}

          <Card
            title={
              <Space size={12} wrap>
                <span>Requirement Data</span>
                <Button type="primary" onClick={() => navigate(`/admin/requirements/${id}/data`)}>
                  Open full data page
                </Button>
              </Space>
            }
          >
            {(data.stats?.seriesCount ?? 0) > 0 ? (
              <RequirementExpandPanel requirementId={id} expanded readOnly allowPreview allowDownload />
            ) : (
              <Empty description="No local detail data is available yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card title="Messages" loading={messagesQuery.isLoading}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {messagesQuery.data && messagesQuery.data.length > 0 ? (
                <List
                  dataSource={messagesQuery.data}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space wrap>
                          <Typography.Text strong>{item.sender.username}</Typography.Text>
                          <Tag color={item.sender.role === 'admin' ? 'blue' : 'default'}>
                            {item.sender.role === 'admin' ? 'Admin' : 'User'}
                          </Tag>
                          <Typography.Text type="secondary">{dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}</Typography.Text>
                        </Space>
                        <Typography.Paragraph style={{ marginBottom: 0 }}>{item.content}</Typography.Paragraph>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No messages yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              <Form
                form={messageForm}
                layout="vertical"
                onFinish={(values) =>
                  createMessageMutation.mutate({
                    content: values.content.trim(),
                  })
                }
              >
                <Form.Item label="Reply to user" name="content" rules={[{ required: true, message: 'Please enter a reply' }]}>
                  <Input.TextArea rows={4} placeholder="Write a message to the user" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={createMessageMutation.isPending}>
                  Send reply
                </Button>
              </Form>
            </Space>
          </Card>

          <Card title="Update Status">
            <Form form={statusForm} layout="vertical" onFinish={(values) => updateStatusMutation.mutate(values)}>
              <Form.Item label="Target status" name="status" rules={[{ required: true, message: 'Please choose a status' }]}>
                <Select options={statusOptions} placeholder="Choose a new status" />
              </Form.Item>
              <Form.Item label="Notification message" name="reason">
                <Input.TextArea rows={3} placeholder="Optional note sent to the user" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={updateStatusMutation.isPending}>
                Update status and notify user
              </Button>
            </Form>
          </Card>

          <RequirementDeliveryPanel requirementId={id} canUpload />
        </>
      ) : null}
    </Space>
  );
}

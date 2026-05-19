import {
  CloudUploadOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import type { AxiosProgressEvent } from 'axios';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import { profileApi } from '../../services/api/profile';
import type { FailedDatasetBatchFileItem, RequirementListItem } from '../../types/requirements';
import { requirementsApi } from '../../services/api/requirements';
import { queryClient } from '../../services/query-client';
import { DatasetBatchItem, DatasetBatchStatus, DatasetUploadType } from '../../types/requirements';
import { isProfileComplete } from '../../utils/profileCompletion';
import { useRequirementDataTree } from '../requirements/list/hooks';
import { PatientLevel } from '../requirements/list/components/PatientLevel';

const batchStatusColorMap: Record<DatasetBatchStatus, string> = {
  uploaded: 'blue',
  parsed: 'green',
  failed: 'red',
};

const batchStatusLabelMap: Record<DatasetBatchStatus, string> = {
  uploaded: '正在上传',
  parsed: '已解析',
  failed: '解析失败',
};

function FailedFilesPanel({
  requirementId,
  batch,
  onRetry,
}: {
  requirementId: string;
  batch: DatasetBatchItem;
  onRetry: (failedFiles: FailedDatasetBatchFileItem[]) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requirements', requirementId, 'dataset-batch-failed-files', batch.id],
    queryFn: () => requirementsApi.listDatasetBatchFailedFiles(requirementId, batch.id),
    enabled: batch.failedFileCount > 0,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <Card size="small" loading />;
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="失败文件明细加载失败"
        action={<Button size="small" onClick={() => void refetch()}>重试</Button>}
      />
    );
  }

  const failedFiles = data?.files ?? [];
  const hasLegacyFailure = batch.failedFileCount === 0 && (batch.status === 'failed' || batch.remark?.includes('解析失败'));

  return (
    <Card
      size="small"
      title={hasLegacyFailure ? '失败文件明细不可用' : `失败文件 ${failedFiles.length} 个`}
      extra={
        failedFiles.length ? (
          <Button size="small" type="primary" onClick={() => onRetry(failedFiles)}>
            重传失败文件
          </Button>
        ) : hasLegacyFailure ? (
          <Button
            size="small"
            onClick={() => {
              onRetry([]);
            }}
          >
            重新上传本批次
          </Button>
        ) : null
      }
    >
      {hasLegacyFailure ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="这是旧批次历史数据"
          description="当时系统只记录了失败数量，没有保存失败文件名和原因，所以现在无法准确指出是哪一个文件失败。可以重新上传原始文件夹，或按你的本地记录手动补传。"
        />
      ) : null}
      <List
        size="small"
        dataSource={failedFiles}
        locale={{ emptyText: hasLegacyFailure ? '历史批次没有失败明细记录' : '没有失败文件明细' }}
        renderItem={(item, index) => (
          <List.Item>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Typography.Text strong>
                {index + 1}. {item.originalName}
              </Typography.Text>
              <Typography.Text type="secondary">{item.reason}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}

export function UploadCenterPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: routeRequirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requirementId = routeRequirementId || searchParams.get('requirementId') || '';
  const [form] = Form.useForm<{ sourceName: string; remark?: string }>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [showAllSelectedFiles, setShowAllSelectedFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);
  const [expandedBatchRowKeys, setExpandedBatchRowKeys] = useState<string[]>([]);
  const [pendingBatchPreview, setPendingBatchPreview] = useState<DatasetBatchItem | null>(null);
  const [retryContext, setRetryContext] = useState<{
    batchId: string;
    batchNo: number;
    sourceName: string | null;
    failedFiles: FailedDatasetBatchFileItem[];
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; loaded: number; total: number | null } | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showFileSelectionError, setShowFileSelectionError] = useState(false);
  const hadPendingBatchRef = useRef(false);

  const resetSelectedFiles = () => {
    setFileList([]);
    setShowAllSelectedFiles(false);
    setShowFileSelectionError(false);
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const buildFileKey = (file: File) => {
    const relativePath =
      'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    return `${relativePath}::${file.size}::${file.lastModified}`;
  };

  const shouldIgnoreSelectedFile = (file: File) => {
    const relativePath =
      'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    const segments = relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) {
      return true;
    }

    return segments.some((segment) => segment === '__MACOSX' || segment === '.__MACOSX' || segment.startsWith('.'));
  };

  const syncFilesToUploadList = (files: File[], options?: { append?: boolean }) => {
    const append = options?.append ?? false;
    const visibleFiles = files.filter((file) => !shouldIgnoreSelectedFile(file));
    const nextFiles = append
      ? [
          ...fileList
            .map((file) => file.originFileObj)
            .filter((file): file is RcFile => Boolean(file)),
          ...visibleFiles,
        ]
      : visibleFiles;
    const uniqueFiles = Array.from(new Map(nextFiles.map((file) => [buildFileKey(file), file])).values());

    setFileList(
      uniqueFiles.map((file, index) => ({
        uid: `${file.name}-${file.size}-${index}`,
        name:
          'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
            ? file.webkitRelativePath
            : file.name,
        status: 'done',
        originFileObj: file as RcFile,
      })),
    );
    setShowAllSelectedFiles(false);
    setShowFileSelectionError(false);
  };

  const { data: requirement, isLoading: isRequirementLoading, isError: isRequirementError } = useQuery({
    queryKey: ['requirement-detail', requirementId],
    queryFn: () => requirementsApi.detail(requirementId),
    enabled: Boolean(requirementId),
  });
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.getProfile,
    enabled: user?.role === 'user',
  });

  const {
    data: batchData,
    isLoading: isBatchLoading,
    isError: isBatchError,
    refetch: refetchBatches,
  } = useQuery({
    queryKey: ['requirements', requirementId, 'dataset-batches', batchPage, batchPageSize],
    queryFn: () => requirementsApi.listDatasetBatches(requirementId, { page: batchPage, pageSize: batchPageSize }),
    enabled: Boolean(requirementId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.list?.some((item) => item.status === 'uploaded') ? 3000 : false;
    },
  });

  const { data: treeData, isLoading: isTreeLoading, isError: isTreeError, refetch: refetchTree } = useRequirementDataTree(
    requirementId,
    Boolean(requirementId),
  );

  const createBatchMutation = useMutation({
    mutationFn: async (values: { sourceName: string; remark?: string }) => {
      const files = fileList
        .map((file) => file.originFileObj)
        .filter((file): file is RcFile => Boolean(file));

      const nextUploadType: DatasetUploadType = (batchData?.total ?? 0) > 0 ? 'supplement' : 'initial';

      setPendingBatchPreview({
        id: `pending-${Date.now()}`,
        batchNo: 0,
        uploadType: nextUploadType,
        sourceName: values.sourceName?.trim() || null,
        fileCount: files.length,
        failedFileCount: 0,
        status: 'uploaded',
        remark: values.remark?.trim() || null,
        uploadedAt: new Date().toISOString(),
        uploader: {
          id: 'pending',
          username: '当前用户',
        },
      });
      setIsUploadingFiles(true);
      setUploadProgress({ percent: 0, loaded: 0, total: null });

      return requirementsApi.createDatasetBatch(
        requirementId,
        {
          sourceName: values.sourceName,
          remark: values.remark,
          retryBatchId: retryContext?.batchId,
          files,
        },
        {
          onUploadProgress: (event: AxiosProgressEvent) => {
            const total = event.total ?? null;
            const loaded = event.loaded;
            const percent = total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
            setUploadProgress({ percent, loaded, total });
          },
        },
      );
    },
    onSuccess: async (result) => {
      setPendingBatchPreview(null);
      setIsUploadingFiles(false);
      setUploadProgress(null);
      message.success(
        retryContext
          ? `已向批次 #${result.batchNo} 追加重传文件，后台正在异步解析`
          : `已上传 #${result.batchNo}，后台正在异步解析`,
      );
      form.resetFields();
      resetSelectedFiles();
      setRetryContext(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'dataset-batches', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'latest-requirement'] }),
      ]);
      void refetchBatches();
      void refetchTree();
    },
    onError: (error) => {
      setPendingBatchPreview(null);
      setIsUploadingFiles(false);
      setUploadProgress(null);
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      message.error(errorMessage || '上传失败');
    },
  });

  const { data: requirementListData, isLoading: isRequirementListLoading } = useQuery({
    queryKey: ['requirements', 'picker'],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 50 }),
    enabled: !requirementId,
  });

  const batchItems = pendingBatchPreview ? [pendingBatchPreview, ...(batchData?.list ?? [])] : batchData?.list ?? [];
  const hasPendingBatch = batchItems.some((item) => item.status === 'uploaded');
  const uploadProgressText = uploadProgress
    ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(2)} MB${
        uploadProgress.total ? ` / ${(uploadProgress.total / 1024 / 1024).toFixed(2)} MB` : ''
      }`
    : '';
  const visibleSelectedFiles = showAllSelectedFiles ? fileList : fileList.slice(0, 8);
  const profileCompleted =
    user?.role === 'admin'
      ? true
      : isProfileComplete({
          ...profileQuery.data,
          hospitalName: user?.hospitalName ?? null,
        });
  const batchSummary = useMemo(
    () => ({
      total: batchData?.total ?? 0,
      files: batchItems.reduce((sum, item) => sum + item.fileCount, 0),
      uploaded: batchItems.filter((item) => item.status === 'uploaded').length,
      parsed: batchItems.filter((item) => item.status === 'parsed').length,
    }),
    [batchData?.total, batchItems],
  );

  useEffect(() => {
    if (!requirementId) {
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    if (hasPendingBatch) {
      hadPendingBatchRef.current = true;
      timer = setInterval(() => {
        void refetchTree();
      }, 3000);
    } else if (hadPendingBatchRef.current) {
      hadPendingBatchRef.current = false;
      void refetchTree();
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [hasPendingBatch, refetchTree, requirementId]);

  if (!requirementId) {
    return (
      <Card title="选择需求单" loading={isRequirementListLoading}>
        <List<RequirementListItem>
          dataSource={requirementListData?.list ?? []}
          locale={{ emptyText: <Empty description="暂无需求单" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  size="small"
                  onClick={() => navigate(`/uploads?requirementId=${item.id}`)}
                >
                  进入上传
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={item.title}
                description={
                  <Space>
                    <Tag>{item.type}</Tag>
                    <Tag>{item.status}</Tag>
                    <Typography.Text type="secondary">{dayjs(item.createdAt).format('YYYY-MM-DD')}</Typography.Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    );
  }

  if (isRequirementError) {
    return <Alert type="error" showIcon message="需求信息加载失败" />;
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Modal open={isUploadingFiles} footer={null} closable={false} maskClosable={false} centered width={480}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            正在上传文件夹
          </Typography.Title>
          <Typography.Text type="secondary">
            文件正在上传到服务器，请不要关闭页面。支持将多个文件夹累计到同一批次后统一上传，上传完成后会自动进入后台异步解析。
          </Typography.Text>
          <Progress percent={uploadProgress?.percent ?? 0} status="active" />
          <Typography.Text>
            {uploadProgress
              ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(2)} MB${
                  uploadProgress.total ? ` / ${(uploadProgress.total / 1024 / 1024).toFixed(2)} MB` : ''
                }`
              : '正在准备上传'}
          </Typography.Text>
        </Space>
      </Modal>

      <Card
        loading={isRequirementLoading}
        bordered={false}
        style={{
          background: 'linear-gradient(135deg, #f4fbff 0%, #ffffff 55%, #eef6fb 100%)',
          border: '1px solid #d9e8f2',
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={14}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                数据上传中心
              </Typography.Title>
              <Space wrap>
                <Link to={`/requirements/${requirementId}`}>
                  <Button icon={<FileSearchOutlined />}>返回需求详情</Button>
                </Link>
                <Link to="/requirements">
                  <Button icon={<LinkOutlined />}>返回需求列表</Button>
                </Link>
              </Space>
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Card size="small" style={{ borderRadius: 16 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">当前需求单</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {requirement?.title || `需求单 ${requirementId}`}
                </Typography.Title>
                <Space wrap>
                  <Tag color="blue">{requirement?.type || '未定义类型'}</Tag>
                  <Tag>{requirement?.status || '未知状态'}</Tag>
                </Space>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="批次数" value={batchSummary.total} prefix={<FolderOpenOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="当前页文件数" value={batchSummary.files} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="待解析批次" value={batchSummary.uploaded} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="已解析批次" value={batchSummary.parsed} prefix={<CloudUploadOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="上传">
            {!profileCompleted ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="请先完善资料"
                description="上传数据前需要先补齐联系人、邮箱、电话、微信号、医院、科室和职称。"
                action={
                  <Button size="small" type="primary" onClick={() => navigate('/profile')}>
                    去完善资料
                  </Button>
                }
              />
            ) : null}
            {createBatchMutation.isPending ? (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`正在上传文件${uploadProgress ? ` ${uploadProgress.percent}%` : ''}`}
                description={`文件正在异步上传，请不要关闭页面。${uploadProgressText ? ` 当前进度：${uploadProgressText}` : ''} 上传完成后会自动进入后台异步解析。`}
              />
            ) : null}
            <Form
              form={form}
              layout="vertical"
              onFinish={(values) => {
                if (!profileCompleted) {
                  message.warning('请先完善资料后再上传数据');
                  navigate('/profile');
                  return;
                }
                if (fileList.length === 0) {
                  setShowFileSelectionError(true);
                  message.warning('请先选择至少一个文件夹');
                  return;
                }
                setShowFileSelectionError(false);
                createBatchMutation.mutate(values);
              }}
            >
              <Form.Item label="上传类型">
                <Input
                  value={(batchData?.total ?? 0) > 0 ? '补充上传' : '首次上传'}
                  disabled
                />
              </Form.Item>
              <Form.Item
                name="sourceName"
                label="数据标签"
                rules={[{ required: true, message: '请输入数据标签' }]}
              >
                <Input placeholder="例如男性/女性/肿瘤/肺结节" maxLength={255} />
              </Form.Item>
              <Form.Item name="remark" label="批次备注">
                <Input.TextArea
                  rows={4}
                  maxLength={255}
                  placeholder="记录数据范围、补传原因、约定事项等"
                />
              </Form.Item>
              <Form.Item
                label="上传文件"
                required
                validateStatus={showFileSelectionError && fileList.length === 0 ? 'error' : undefined}
                help={
                  showFileSelectionError && fileList.length === 0
                    ? '请先选择至少一个文件夹'
                    : `当前已选择 ${fileList.length} 个文件`
                }
              >
                <div>
                  {retryContext ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={`正在为批次 #${retryContext.batchNo} 追加重传文件`}
                      description={(
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <Typography.Text>这次上传会按同一批次问题处理，不要求文件名和上次失败记录一致。</Typography.Text>
                          {retryContext.failedFiles.length ? (
                            <Typography.Text type="secondary">
                              历史失败记录：{retryContext.failedFiles.map((item) => item.originalName).join('、')}
                            </Typography.Text>
                          ) : null}
                          <Space>
                            <Button
                              size="small"
                              onClick={() => {
                                setRetryContext(null);
                                resetSelectedFiles();
                                form.setFieldsValue({ sourceName: '', remark: '' });
                              }}
                            >
                              退出重传模式
                            </Button>
                          </Space>
                        </Space>
                      )}
                    />
                  ) : null}
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      syncFilesToUploadList(files, { append: true });
                      if (folderInputRef.current) {
                        folderInputRef.current.value = '';
                      }
                    }}
                  />
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Button onClick={() => folderInputRef.current?.click()}>
                      {fileList.length > 0 ? '继续添加文件夹' : '选择文件夹'}
                    </Button>
                    <Button
                      onClick={() => {
                        resetSelectedFiles();
                      }}
                    >
                      清空已选文件
                    </Button>
                  </Space>
                  {fileList.length > 0 ? (
                    <Card size="small" style={{ marginTop: 12 }}>
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                          <Typography.Text strong>已选择 {fileList.length} 个文件</Typography.Text>
                          <Button type="link" onClick={() => setShowAllSelectedFiles((value) => !value)}>
                            {showAllSelectedFiles ? '收起文件列表' : `展开全部文件 (${fileList.length})`}
                          </Button>
                        </Space>
                        <Typography.Text type="secondary">
                          可多次点击“{fileList.length > 0 ? '继续添加文件夹' : '选择文件夹'}”累计选择多个文件夹；重复文件会自动去重。
                        </Typography.Text>
                        <List
                          size="small"
                          dataSource={visibleSelectedFiles}
                          renderItem={(item) => (
                            <List.Item style={{ padding: '6px 0' }}>
                              <div
                                style={{
                                  width: '100%',
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(0, 1fr) 72px',
                                  gap: 12,
                                  alignItems: 'center',
                                }}
                              >
                                <Typography.Text ellipsis style={{ minWidth: 0, fontSize: 13, lineHeight: '20px' }}>
                                  {item.name}
                                </Typography.Text>
                                <Typography.Text
                                  type="secondary"
                                  style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}
                                >
                                  {item.size ? `${Math.max(item.size / 1024 / 1024, 0.01).toFixed(2)} MB` : '-'}
                                </Typography.Text>
                              </div>
                            </List.Item>
                          )}
                        />
                        {!showAllSelectedFiles && fileList.length > visibleSelectedFiles.length ? (
                          <Typography.Text type="secondary">
                            当前仅预览前 {visibleSelectedFiles.length} 个文件，其余 {fileList.length - visibleSelectedFiles.length}{' '}
                            个文件已隐藏。
                          </Typography.Text>
                        ) : null}
                      </Space>
                    </Card>
                  ) : null}
                </div>
              </Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createBatchMutation.isPending}
                >
                  {createBatchMutation.isPending
                    ? `正在上传${uploadProgress ? ` ${uploadProgress.percent}%` : ''}`
                    : '上传'}
                </Button>
                <Button
                  disabled={createBatchMutation.isPending}
                  onClick={() => {
                    form.resetFields();
                    resetSelectedFiles();
                    setRetryContext(null);
                  }}
                >
                  清空
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="上传批次列表" extra={<Button onClick={() => void refetchBatches()}>刷新</Button>}>
            {isBatchError ? <Alert type="error" showIcon message="批次列表加载失败" /> : null}
            <Table<DatasetBatchItem>
              rowKey="id"
              loading={isBatchLoading}
              dataSource={batchItems}
              expandable={{
                expandedRowKeys: expandedBatchRowKeys,
                onExpandedRowsChange: (expandedKeys) => setExpandedBatchRowKeys(expandedKeys.map((key) => String(key))),
                rowExpandable: (record) =>
                  record.failedFileCount > 0 || record.status === 'failed' || record.remark?.includes('解析失败') === true,
                expandedRowRender: (record) => (
                  <FailedFilesPanel
                    requirementId={requirementId}
                    batch={record}
                    onRetry={(failedFiles) => {
                      setRetryContext({
                        batchId: record.id,
                        batchNo: record.batchNo,
                        sourceName: record.sourceName,
                        failedFiles,
                      });
                      resetSelectedFiles();
                      form.setFieldsValue({
                        sourceName: record.sourceName || `批次 #${record.batchNo} 失败文件重传`,
                        remark: failedFiles.length
                          ? `重传批次 #${record.batchNo} 失败文件`
                          : `重新上传批次 #${record.batchNo} 原始文件`,
                      });
                    }}
                  />
                ),
              }}
              pagination={{
                current: batchPage,
                pageSize: batchPageSize,
                total: batchData?.total ?? 0,
                onChange: (page, pageSize) => {
                  setBatchPage(page);
                  setBatchPageSize(pageSize);
                },
              }}
              columns={[
                {
                  title: '批次',
                  width: 90,
                  render: (_, record) => <Typography.Text strong>#{record.batchNo}</Typography.Text>,
                },
                {
                  title: '上传类型',
                  width: 110,
                  render: (_, record) => (
                    <Tag color={record.uploadType === 'initial' ? 'geekblue' : 'gold'}>
                      {record.uploadType === 'initial' ? '首次上传' : '补充上传'}
                    </Tag>
                  ),
                },
                {
                  title: '数据标签',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Typography.Text>{record.sourceName || '未填写数据标签'}</Typography.Text>
                      <Typography.Text type="secondary">{record.remark || '无备注'}</Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: '文件数',
                  width: 120,
                  render: (_, record) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text>{record.fileCount}</Typography.Text>
                      {record.failedFileCount > 0 ? (
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                          失败 {record.failedFileCount}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  width: 140,
                  render: (_, record) => (
                    <Space direction="vertical" size={4}>
                      <Tag color={batchStatusColorMap[record.status]}>{batchStatusLabelMap[record.status]}</Tag>
                      {(record.failedFileCount > 0 || record.status === 'failed' || record.remark?.includes('解析失败')) ? (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: 'auto', textAlign: 'left' }}
                          onClick={() =>
                            setExpandedBatchRowKeys((current) =>
                              current.includes(record.id)
                                ? current.filter((key) => key !== record.id)
                                : [...current, record.id],
                            )
                          }
                        >
                          {expandedBatchRowKeys.includes(record.id) ? '收起处理' : '展开处理'}
                        </Button>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '上传人',
                  width: 120,
                  render: (_, record) => record.uploader.username,
                },
                {
                  title: '上传时间',
                  width: 168,
                  render: (_, record) => dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm'),
                },
              ]}
              locale={{
                emptyText: <Empty description="当前需求单还没有上传批次" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
              }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="文件预览">
        {batchItems.some((item) => item.status === 'uploaded') ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="存在待解析批次"
            description="上传请求已完成，后台正在异步解析并落库，列表和三层结构会自动刷新。"
          />
        ) : null}
        {isTreeError ? <Alert type="error" showIcon message="文件预览加载失败" /> : null}
        {isTreeLoading ? (
          <Card loading />
        ) : treeData?.patients?.length ? (
          <PatientLevel requirementId={requirementId} data={treeData.patients} onRefresh={() => void refetchTree()} />
        ) : (
          <Empty
            description="当前需求单暂无可预览文件"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>
    </Space>
  );
}

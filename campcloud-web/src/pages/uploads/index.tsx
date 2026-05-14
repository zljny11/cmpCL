import {
  CloudUploadOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  LinkOutlined,
  UploadOutlined,
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
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { RequirementListItem } from '../../types/requirements';
import { requirementsApi } from '../../services/api/requirements';
import { queryClient } from '../../services/query-client';
import { DatasetBatchItem, DatasetBatchStatus, DatasetUploadType } from '../../types/requirements';
import { useRequirementDataTree } from '../requirements/list/hooks';
import { PatientLevel } from '../requirements/list/components/PatientLevel';

const uploadTypeOptions: { label: string; value: DatasetUploadType }[] = [
  { label: '首次上传', value: 'initial' },
  { label: '补充上传', value: 'supplement' },
];

const batchStatusColorMap: Record<DatasetBatchStatus, string> = {
  uploaded: 'blue',
  parsed: 'green',
  failed: 'red',
};

const batchStatusLabelMap: Record<DatasetBatchStatus, string> = {
  uploaded: '已上传',
  parsed: '已解析',
  failed: '解析失败',
};

export function UploadCenterPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id: routeRequirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requirementId = routeRequirementId || searchParams.get('requirementId') || '';
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [showAllSelectedFiles, setShowAllSelectedFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);

  const syncFilesToUploadList = (files: File[]) => {
    setFileList(
      files.map((file, index) => ({
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
  };

  const { data: requirement, isLoading: isRequirementLoading, isError: isRequirementError } = useQuery({
    queryKey: ['requirement-detail', requirementId],
    queryFn: () => requirementsApi.detail(requirementId),
    enabled: Boolean(requirementId),
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
  });

  const { data: treeData, isLoading: isTreeLoading, isError: isTreeError, refetch: refetchTree } = useRequirementDataTree(
    requirementId,
    Boolean(requirementId),
  );

  const createBatchMutation = useMutation({
    mutationFn: async (values: { uploadType: DatasetUploadType; sourceName?: string; remark?: string }) => {
      const files = fileList
        .map((file) => file.originFileObj)
        .filter((file): file is RcFile => Boolean(file));

      return requirementsApi.createDatasetBatch(requirementId, {
        uploadType: values.uploadType,
        sourceName: values.sourceName,
        remark: values.remark,
        files,
      });
    },
    onSuccess: async (result) => {
      message.success(`已创建批次 #${result.batchNo}`);
      form.resetFields();
      setFileList([]);
      setShowAllSelectedFiles(false);
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'data-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
      ]);
      void refetchBatches();
      void refetchTree();
    },
    onError: () => {
      message.error('批次创建失败');
    },
  });

  const { data: requirementListData, isLoading: isRequirementListLoading } = useQuery({
    queryKey: ['requirements', 'picker'],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 50 }),
    enabled: !requirementId,
  });

  const batchItems = batchData?.list ?? [];
  const visibleSelectedFiles = showAllSelectedFiles ? fileList : fileList.slice(0, 8);
  const batchSummary = useMemo(
    () => ({
      total: batchData?.total ?? 0,
      files: batchItems.reduce((sum, item) => sum + item.fileCount, 0),
      uploaded: batchItems.filter((item) => item.status === 'uploaded').length,
      parsed: batchItems.filter((item) => item.status === 'parsed').length,
    }),
    [batchData?.total, batchItems],
  );

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
              <Typography.Text type="secondary">
                当前页面围绕需求单管理上传批次，并把批次记录与三层结构预览放在同一视图中。
              </Typography.Text>
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
            <Statistic title="待解析批次" value={batchSummary.uploaded} prefix={<UploadOutlined />} />
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
          <Card
            title="创建上传批次"
            extra={<Typography.Text type="secondary">legacy 仅复用上传交互，不复用旧模型</Typography.Text>}
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{ uploadType: 'initial' satisfies DatasetUploadType }}
              onFinish={(values) => createBatchMutation.mutate(values)}
            >
              <Form.Item
                name="uploadType"
                label="上传类型"
                rules={[{ required: true, message: '请选择上传类型' }]}
              >
                <Select options={uploadTypeOptions} />
              </Form.Item>
              <Form.Item
                name="sourceName"
                label="来源说明"
                tooltip="未上传文件时，至少填写来源说明以便保留批次记录"
              >
                <Input placeholder="例如：心内科 2026-05 第一次导出" maxLength={255} />
              </Form.Item>
              <Form.Item name="remark" label="批次备注">
                <Input.TextArea
                  rows={4}
                  maxLength={255}
                  placeholder="记录数据范围、补传原因、约定事项等"
                />
              </Form.Item>
              <Form.Item label="上传文件">
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    syncFilesToUploadList(files);
                  }}
                />
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button onClick={() => folderInputRef.current?.click()}>选择文件夹</Button>
                  <Button
                    onClick={() => {
                      setFileList([]);
                      setShowAllSelectedFiles(false);
                      if (folderInputRef.current) {
                        folderInputRef.current.value = '';
                      }
                    }}
                  >
                    清空已选文件
                  </Button>
                </Space>
                <Upload.Dragger
                  multiple
                  directory
                  beforeUpload={() => false}
                  fileList={fileList}
                  showUploadList={false}
                  onChange={({ fileList: nextFileList }) => {
                    setFileList(nextFileList);
                    setShowAllSelectedFiles(false);
                    if (folderInputRef.current) {
                      folderInputRef.current.value = '';
                    }
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">选择文件夹、选择文件，或直接拖拽到这里</p>
                  <p className="ant-upload-hint">
                    macOS 下如果系统弹窗对文件夹选择不直观，优先使用上面的“选择文件夹”按钮。
                  </p>
                </Upload.Dragger>
                {fileList.length > 0 ? (
                  <Card size="small" style={{ marginTop: 12 }}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Typography.Text strong>已选择 {fileList.length} 个文件</Typography.Text>
                        <Button type="link" onClick={() => setShowAllSelectedFiles((value) => !value)}>
                          {showAllSelectedFiles ? '收起文件列表' : `展开全部文件 (${fileList.length})`}
                        </Button>
                      </Space>
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
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={createBatchMutation.isPending}>
                  创建批次
                </Button>
                <Button
                  onClick={() => {
                    form.resetFields();
                    setFileList([]);
                    setShowAllSelectedFiles(false);
                    if (folderInputRef.current) {
                      folderInputRef.current.value = '';
                    }
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
                  title: '来源说明',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Typography.Text>{record.sourceName || '未填写来源说明'}</Typography.Text>
                      <Typography.Text type="secondary">{record.remark || '无备注'}</Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: '文件数',
                  dataIndex: 'fileCount',
                  width: 90,
                },
                {
                  title: '状态',
                  width: 110,
                  render: (_, record) => (
                    <Tag color={batchStatusColorMap[record.status]}>{batchStatusLabelMap[record.status]}</Tag>
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

      <Card
        title="三层结构预览"
        extra={<Typography.Text type="secondary">批次不作为第四层，来源信息保留在序列明细中</Typography.Text>}
      >
        {isTreeError ? <Alert type="error" showIcon message="三层结构加载失败" /> : null}
        {isTreeLoading ? (
          <Card loading />
        ) : treeData?.patients?.length ? (
          <PatientLevel requirementId={requirementId} data={treeData.patients} onRefresh={() => void refetchTree()} />
        ) : (
          <Empty
            description="当前需求单暂无三层结构数据。第 3 周期已先完成批次记录链路，后续解析落库后这里会自动呈现。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>
    </Space>
  );
}

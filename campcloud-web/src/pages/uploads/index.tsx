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
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import type { AxiosProgressEvent, AxiosResponse } from 'axios';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import { ANNOTATION_STATUS_MAP, ANNOTATION_STATUS_OPTIONS, BODY_PART_MAP, BODY_PART_OPTIONS, CLINICAL_TAG_MAP, CLINICAL_TAG_OPTIONS, MODALITY_MAP, MODALITY_OPTIONS } from '../../constants/dicom';
import { profileApi } from '../../services/api/profile';
import type { FailedDatasetBatchFileItem, RequirementListItem } from '../../types/requirements';
import { requirementsApi } from '../../services/api/requirements';
import { queryClient } from '../../services/query-client';
import { DatasetBatchItem, DatasetBatchStatus, DatasetUploadType, RequirementOssFileItem } from '../../types/requirements';
import { downloadViaBrowser } from '../../utils/browser-download';
import { isProfileComplete } from '../../utils/profileCompletion';
import { findAndParseDicomInFiles } from '../../utils/dicom-parser';

const LARGE_ZIP_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_SINGLE_DICOM_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024;
const MULTIPART_PART_UPLOAD_MAX_RETRIES = 3;

const batchStatusColorMap: Record<DatasetBatchStatus, string> = {
  uploaded: 'blue',
  parsed: 'green',
  failed: 'red',
  cleaned: 'default',
};

const batchStatusLabelMap: Record<DatasetBatchStatus, string> = {
  uploaded: 'Uploaded',
  parsed: 'Parsed',
  failed: 'Failed',
  cleaned: 'Cleaned',
};

function isZipFileName(fileName: string) {
  return fileName.trim().toLowerCase().endsWith('.zip');
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${Math.max(size / 1024 / 1024, 0.01).toFixed(2)} MB`;
}

function normalizeEtag(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/^"+|"+$/g, '') : undefined;
}

function mergeMultipartParts(parts: Array<{ partNumber: number; etag: string; size: number }> | undefined) {
  return Array.from(
    new Map(
      (parts ?? [])
        .filter((part) => part.partNumber > 0 && Boolean(part.etag))
        .map((part) => [part.partNumber, part]),
    ).values(),
  ).sort((left, right) => left.partNumber - right.partNumber);
}

function sumMultipartUploadedBytes(parts: Array<{ partNumber: number; etag: string; size: number }> | undefined) {
  return mergeMultipartParts(parts).reduce((sum, part) => sum + Math.max(part.size || 0, 0), 0);
}

type UploadSessionCacheItem = {
  fileId?: string;
  uploadId?: string;
  fileKey: string;
  relativePath: string;
  fileSize: number;
  uploadedSize: number;
  partSize?: number;
  parts?: Array<{
    partNumber: number;
    etag: string;
    size: number;
  }>;
  status: 'pending' | 'uploading' | 'uploaded' | 'consumed' | 'failed';
  updatedAt: number;
};
function getRelativePathFromFile(file: File) {
  return 'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
    ? file.webkitRelativePath
    : file.name;
}

function getUploadSessionStorageKey(requirementId: string) {
  return `campcloud-upload-sessions:${requirementId}`;
}

function readUploadSessionCache(requirementId: string) {
  if (!requirementId || typeof window === 'undefined') {
    return {} as Record<string, UploadSessionCacheItem>;
  }

  try {
    const raw = window.localStorage.getItem(getUploadSessionStorageKey(requirementId));
    if (!raw) {
      return {} as Record<string, UploadSessionCacheItem>;
    }
    const parsed = JSON.parse(raw) as Record<string, UploadSessionCacheItem>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, UploadSessionCacheItem>;
  }
}

function writeUploadSessionCache(requirementId: string, value: Record<string, UploadSessionCacheItem>) {
  if (!requirementId || typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getUploadSessionStorageKey(requirementId), JSON.stringify(value));
}

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
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: routeRequirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requirementId = routeRequirementId || searchParams.get('requirementId') || '';
  const [form] = Form.useForm<{ modality: string; bodyPart: string; diagnosis?: string[]; clinicalTags?: string[]; annotationStatus?: string; remark?: string }>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [showAllSelectedFiles, setShowAllSelectedFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMode, setUploadMode] = useState<'folder' | 'zip'>('folder');
  const [requirementPickerPage, setRequirementPickerPage] = useState(1);
  const [requirementPickerPageSize, setRequirementPickerPageSize] = useState(10);
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);
  const [expandedBatchRowKeys, setExpandedBatchRowKeys] = useState<string[]>([]);
  const [pendingBatchPreview, setPendingBatchPreview] = useState<DatasetBatchItem | null>(null);
  const [retryContext, setRetryContext] = useState<{
    batchId: string;
    batchNo: number;
    failedFiles: FailedDatasetBatchFileItem[];
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; loaded: number; total: number | null } | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showFileSelectionError, setShowFileSelectionError] = useState(false);
  const [modalityCustom, setModalityCustom] = useState('');
  const [bodyPartCustom, setBodyPartCustom] = useState('');
  const [enableAutoParseMetadata, setEnableAutoParseMetadata] = useState(true);
  const uploadSessionCacheRef = useRef<Record<string, UploadSessionCacheItem>>({});
  const resumedUploadNoticeRef = useRef<Set<string>>(new Set());

  const resetSelectedFiles = () => {
    setFileList([]);
    setShowAllSelectedFiles(false);
    setShowFileSelectionError(false);
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    if (zipInputRef.current) {
      zipInputRef.current.value = '';
    }
  };

  useEffect(() => {
    uploadSessionCacheRef.current = readUploadSessionCache(requirementId);
    resumedUploadNoticeRef.current = new Set();
  }, [requirementId]);

  useEffect(() => {
    resetSelectedFiles();
    setShowFileSelectionError(false);
    if (uploadMode === 'zip') {
      setEnableAutoParseMetadata(false);
    }
  }, [uploadMode]);

  const upsertUploadSessionCacheItem = (fileKey: string, value: UploadSessionCacheItem) => {
    uploadSessionCacheRef.current = {
      ...uploadSessionCacheRef.current,
      [fileKey]: value,
    };
    writeUploadSessionCache(requirementId, uploadSessionCacheRef.current);
  };

  const clearUploadSessionCache = () => {
    uploadSessionCacheRef.current = {};
    writeUploadSessionCache(requirementId, {});
  };

  const removeUploadSessionCacheItem = (fileKey: string) => {
    const nextCache = { ...uploadSessionCacheRef.current };
    delete nextCache[fileKey];
    uploadSessionCacheRef.current = nextCache;
    writeUploadSessionCache(requirementId, nextCache);
  };

  const uploadFileToOssInParts = async (file: RcFile, aggregateBaseLoaded: number, aggregateTotalBytes: number) => {
    const fileKey = buildFileKey(file);
    const relativePath = getRelativePathFromFile(file);
    let cacheItem = uploadSessionCacheRef.current[fileKey];

    if (cacheItem?.status === 'uploaded' && cacheItem.fileId) {
      setUploadProgress({
        loaded: Math.min(aggregateBaseLoaded + file.size, aggregateTotalBytes),
        total: aggregateTotalBytes,
        percent: aggregateTotalBytes > 0
          ? Math.min(100, Math.round(((aggregateBaseLoaded + file.size) / aggregateTotalBytes) * 100))
          : 0,
      });
      return cacheItem.fileId;
    }

    let fileId = cacheItem?.fileId;
    let uploadId = cacheItem?.uploadId;
    let partSize = cacheItem?.partSize || DEFAULT_MULTIPART_PART_SIZE_BYTES;
    let completedParts = mergeMultipartParts(cacheItem?.parts);

    const persistCache = (status: UploadSessionCacheItem['status']) => {
      const uploadedSize = Math.min(sumMultipartUploadedBytes(completedParts), file.size);
      const nextItem: UploadSessionCacheItem = {
        fileId,
        uploadId,
        fileKey,
        relativePath,
        fileSize: file.size,
        uploadedSize,
        partSize,
        parts: completedParts,
        status,
        updatedAt: Date.now(),
      };
      upsertUploadSessionCacheItem(fileKey, nextItem);
      cacheItem = nextItem;
      return nextItem;
    };

    const startNewMultipartUpload = async () => {
      if (fileId && uploadId) {
        try {
          await requirementsApi.abortRequirementOssMultipartUpload(requirementId, fileId, { uploadId });
        } catch {
        }
      }

      const uploadTicket = await requirementsApi.createRequirementOssFile(requirementId, {
        kind: 'dicom',
        fileName: relativePath,
        fileSize: file.size,
        mimeType: file.type,
      });
      const multipart = await requirementsApi.initiateRequirementOssMultipartUpload(requirementId, uploadTicket.fileId);
      fileId = uploadTicket.fileId;
      uploadId = multipart.uploadId;
      partSize = multipart.partSize || DEFAULT_MULTIPART_PART_SIZE_BYTES;
      completedParts = [];
      persistCache('pending');
    };

    if (!fileId || !uploadId) {
      await startNewMultipartUpload();
    } else {
      try {
        const serverParts = await requirementsApi.listRequirementOssMultipartParts(requirementId, fileId, uploadId);
        completedParts = mergeMultipartParts(serverParts.parts);
        persistCache(completedParts.length > 0 ? 'uploading' : 'pending');
      } catch {
        await startNewMultipartUpload();
      }
    }

    try {
      partSize = Math.max(partSize || DEFAULT_MULTIPART_PART_SIZE_BYTES, 1024 * 1024);
      let durableFileLoaded = Math.min(sumMultipartUploadedBytes(completedParts), file.size);
      setUploadProgress({
        loaded: Math.min(aggregateBaseLoaded + durableFileLoaded, aggregateTotalBytes),
        total: aggregateTotalBytes,
        percent: aggregateTotalBytes > 0
          ? Math.min(100, Math.round(((aggregateBaseLoaded + durableFileLoaded) / aggregateTotalBytes) * 100))
          : 0,
      });
      persistCache(durableFileLoaded >= file.size ? 'uploaded' : durableFileLoaded > 0 ? 'uploading' : 'pending');

      if (durableFileLoaded > 0 && !resumedUploadNoticeRef.current.has(fileKey)) {
        resumedUploadNoticeRef.current.add(fileKey);
        message.info(`检测到文件“${relativePath}”存在未完成上传，已自动从上次进度继续。`);
      }

      const totalParts = Math.max(1, Math.ceil(file.size / partSize));
      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        if (completedParts.some((part) => part.partNumber === partNumber)) {
          continue;
        }

        const partStart = (partNumber - 1) * partSize;
        const partEnd = Math.min(partStart + partSize, file.size);
        let uploadResponse: AxiosResponse | null = null;
        let lastUploadError: unknown = null;

        for (let attempt = 1; attempt <= MULTIPART_PART_UPLOAD_MAX_RETRIES; attempt += 1) {
          try {
            const signedPart = await requirementsApi.signRequirementOssMultipartPart(requirementId, fileId!, {
              uploadId: uploadId!,
              partNumber,
            });

            uploadResponse = await axios.put(signedPart.upload.url, file.slice(partStart, partEnd), {
              headers: signedPart.upload.headers,
              onUploadProgress: (event: AxiosProgressEvent) => {
                const loaded = aggregateBaseLoaded + durableFileLoaded + Math.min(event.loaded, partEnd - partStart);
                const percent = aggregateTotalBytes > 0 ? Math.min(100, Math.round((loaded / aggregateTotalBytes) * 100)) : 0;
                setUploadProgress({ loaded, total: aggregateTotalBytes, percent });
              },
            });

            if (attempt > 1) {
              message.success(`文件“${relativePath}”第 ${partNumber} 个分片重试成功。`);
            }
            lastUploadError = null;
            break;
          } catch (error) {
            lastUploadError = error;
            if (attempt < MULTIPART_PART_UPLOAD_MAX_RETRIES) {
              message.warning(`文件“${relativePath}”第 ${partNumber} 个分片上传失败，正在重试（${attempt}/${MULTIPART_PART_UPLOAD_MAX_RETRIES - 1}）。`);
            }
          }
        }

        if (!uploadResponse) {
          const errorMessage = axios.isAxiosError(lastUploadError)
            ? (lastUploadError.response?.data as { message?: string } | undefined)?.message || lastUploadError.message
            : lastUploadError instanceof Error
              ? lastUploadError.message
              : '网络连接异常';
          throw new Error(`文件“${relativePath}”第 ${partNumber} 个分片上传失败，已重试 ${MULTIPART_PART_UPLOAD_MAX_RETRIES} 次：${errorMessage}`);
        }

        const etag = normalizeEtag(uploadResponse.headers.etag as string | undefined);
        if (!etag) {
          throw new Error(`Missing ETag for multipart part ${partNumber}`);
        }

        completedParts = mergeMultipartParts([
          ...completedParts,
          {
            partNumber,
            etag,
            size: partEnd - partStart,
          },
        ]);
        durableFileLoaded = Math.min(sumMultipartUploadedBytes(completedParts), file.size);
        persistCache(durableFileLoaded >= file.size ? 'uploaded' : 'uploading');
        setUploadProgress({
          loaded: Math.min(aggregateBaseLoaded + durableFileLoaded, aggregateTotalBytes),
          total: aggregateTotalBytes,
          percent: aggregateTotalBytes > 0
            ? Math.min(100, Math.round(((aggregateBaseLoaded + durableFileLoaded) / aggregateTotalBytes) * 100))
            : 0,
        });
      }

      const completedFile = await requirementsApi.completeRequirementOssMultipartUpload(requirementId, fileId!, {
        uploadId: uploadId!,
        fileSize: file.size,
        parts: mergeMultipartParts(completedParts).map((part) => ({
          partNumber: part.partNumber,
          etag: part.etag,
        })),
      });
      fileId = completedFile.id;
      persistCache('uploaded');
      return completedFile.id;
    } catch (error) {
      if (fileId || uploadId) {
        persistCache('failed');
      } else {
        removeUploadSessionCacheItem(fileKey);
      }
      throw error;
    }
  };
  const buildFileKey = (file: File) => {
    const relativePath = getRelativePathFromFile(file);
    return `${relativePath}::${file.size}::${file.lastModified}`;
  };

  const shouldIgnoreSelectedFile = (file: File) => {
    const relativePath = getRelativePathFromFile(file);
    const segments = relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) {
      return true;
    }

    return segments.some((segment) => segment === '__MACOSX' || segment === '.__MACOSX' || segment.startsWith('.'));
  };

  const syncFilesToUploadList = async (files: File[], options?: { append?: boolean }) => {
    const append = options?.append ?? false;
    console.log('[Upload] syncFilesToUploadList called with', files.length, 'files, append=', append);

    const visibleFiles = files.filter((file) => !shouldIgnoreSelectedFile(file));
    console.log('[Upload] after filter:', visibleFiles.length, 'visible files');

    if (uploadMode === 'zip') {
      const zipFiles = visibleFiles.filter((file) => isZipFileName(file.name));
      if (zipFiles.length !== 1) {
        setShowFileSelectionError(true);
        message.warning('ZIP 上传只支持选择单个 .zip 文件');
        return;
      }
      const zipFile = zipFiles[0];
      if (zipFile.size <= LARGE_ZIP_UPLOAD_THRESHOLD_BYTES) {
        setShowFileSelectionError(true);
        message.warning('ZIP 上传仅用于超过 10GB 的批次，请直接选择文件夹上传');
        return;
      }

      setFileList([
        {
          uid: `${zipFile.name}-${zipFile.size}-0`,
          name: zipFile.name,
          status: 'done',
          size: zipFile.size,
          originFileObj: zipFile as RcFile,
        },
      ]);
      setShowAllSelectedFiles(false);
      setShowFileSelectionError(false);
      return;
    }

    const nextFiles = append
      ? [
          ...fileList
            .map((file) => file.originFileObj)
            .filter((file): file is RcFile => Boolean(file)),
          ...visibleFiles,
        ]
      : visibleFiles;
    const uniqueFiles = Array.from(new Map(nextFiles.map((file) => [buildFileKey(file), file])).values());
    const oversizeFile = uniqueFiles.find((file) => file.size > MAX_SINGLE_DICOM_FILE_BYTES);
    if (oversizeFile) {
      setShowFileSelectionError(true);
      message.warning(`单个 DICOM 文件不能超过 10GB：${oversizeFile.name}`);
      return;
    }
    const totalBytes = uniqueFiles.reduce((sum, file) => sum + file.size, 0);

    if (totalBytes > LARGE_ZIP_UPLOAD_THRESHOLD_BYTES) {
      setShowFileSelectionError(true);
      message.warning('超过 10GB 的数据只支持上传单个 ZIP 压缩包，上传后需由管理侧确认拉取详情数据');
      return;
    }

    setFileList(
      uniqueFiles.map((file, index) => ({
        uid: `${file.name}-${file.size}-${index}`,
        name: getRelativePathFromFile(file),
        status: 'done',
        size: file.size,
        originFileObj: file as RcFile,
      })),
    );
    setShowAllSelectedFiles(false);
    setShowFileSelectionError(false);

    // 仅在浏览器本地读取少量 DICOM 头信息，帮助填充表单，不触发服务端解析
    if (!append && visibleFiles.length > 0 && enableAutoParseMetadata) {
      console.log('[Upload] Starting DICOM parse for', visibleFiles.length, 'files');
      const metadata = await findAndParseDicomInFiles(visibleFiles);
      console.log('[Upload] DICOM parse result:', metadata);
      if (metadata.modality || metadata.bodyPart) {
        form.setFieldsValue({
          modality: metadata.modality || form.getFieldValue('modality'),
          bodyPart: metadata.bodyPart || form.getFieldValue('bodyPart'),
        });
      }
    } else {
      console.log('[Upload] Skip DICOM parse: append=', append, ', visibleFiles.length=', visibleFiles.length);
    }
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

  const {
    data: ossFiles = [],
    isLoading: isOssFilesLoading,
    isError: isOssFilesError,
    refetch: refetchOssFiles,
  } = useQuery({
    queryKey: ['requirements', requirementId, 'object-storage-files'],
    queryFn: () => requirementsApi.listRequirementOssFiles(requirementId),
    enabled: Boolean(requirementId),
  });

  const createBatchMutation = useMutation({
    mutationFn: async (values: { modality: string; bodyPart: string; diagnosis?: string[]; clinicalTags?: string[]; annotationStatus?: string; remark?: string }) => {
      const files = fileList
        .map((file) => file.originFileObj)
        .filter((file): file is RcFile => Boolean(file));
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

      const nextUploadType: DatasetUploadType = (batchData?.total ?? 0) > 0 ? 'supplement' : 'initial';
      const shouldShowInitialUploadNotice = user?.role === 'user' && !retryContext && nextUploadType === 'initial';

      setPendingBatchPreview({
        id: `pending-${Date.now()}`,
        batchNo: 0,
        uploadType: nextUploadType,
        sourceName: selectedRequiresManualAnalysis ? files[0]?.name ?? null : null,
        modality: values.modality,
        bodyPart: values.bodyPart,
        diagnosis: values.diagnosis || null,
        clinicalTags: values.clinicalTags || null,
        annotationStatus: values.annotationStatus || null,
        fileCount: files.length,
        totalBytes,
        requiresManualAnalysis: selectedRequiresManualAnalysis,
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
      let durableLoaded = 0;
      setUploadProgress({ percent: 0, loaded: 0, total: totalBytes });

      const uploadedFileIds: string[] = [];
      for (const file of files) {
        const uploadedFileId = await uploadFileToOssInParts(file, durableLoaded, totalBytes);
        uploadedFileIds.push(uploadedFileId);
        durableLoaded += file.size;
        setUploadProgress({
          loaded: Math.min(durableLoaded, totalBytes),
          total: totalBytes,
          percent: totalBytes > 0 ? Math.min(100, Math.round((durableLoaded / totalBytes) * 100)) : 0,
        });
      }

      const result = await requirementsApi.createDatasetBatchFromOssFiles(requirementId, {
        sourceName: selectedRequiresManualAnalysis ? files[0]?.name : undefined,
        modality: values.modality,
        bodyPart: values.bodyPart,
        diagnosis: values.diagnosis,
        clinicalTags: values.clinicalTags,
        annotationStatus: values.annotationStatus,
        remark: values.remark,
        retryBatchId: retryContext?.batchId,
        fileIds: uploadedFileIds,
      });

      return {
        result,
        shouldShowInitialUploadNotice,
      };
    },
    onSuccess: async ({ result, shouldShowInitialUploadNotice }) => {
      setPendingBatchPreview(null);
      setIsUploadingFiles(false);
      setUploadProgress(null);
      message.success(
        result.requiresManualAnalysis
          ? `已上传 #${result.batchNo}，原始 ZIP 已暂存，等待管理侧确认拉取`
          : retryContext
            ? `已向批次 #${result.batchNo} 追加重传文件，等待管理侧确认拉取详情数据`
            : `已上传 #${result.batchNo}，等待管理侧确认拉取详情数据`,
      );
      form.resetFields();
      setModalityCustom('');
      setBodyPartCustom('');
      resetSelectedFiles();
      clearUploadSessionCache();
      setRetryContext(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'dataset-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['requirements', requirementId, 'object-storage-files'] }),
        queryClient.invalidateQueries({ queryKey: ['requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'dataset-batches', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'requirement-detail', requirementId] }),
        queryClient.invalidateQueries({ queryKey: ['user-journey', 'latest-requirement'] }),
      ]);
      void refetchBatches();
      void refetchOssFiles();
      if (shouldShowInitialUploadNotice && !result.requiresManualAnalysis) {
        modal.info({
          title: '上传完成',
          content: '您已完成上传，管理侧查看需求时可按需拉取详情数据，后续如有新内容也可继续补充上传。',
          okText: '我知道了',
          centered: true,
        });
      }
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
    queryKey: ['requirements', 'picker', requirementPickerPage, requirementPickerPageSize],
    queryFn: () => requirementsApi.list({ page: requirementPickerPage, pageSize: requirementPickerPageSize }),
    enabled: !requirementId,
  });

  const batchItems = pendingBatchPreview ? [pendingBatchPreview, ...(batchData?.list ?? [])] : batchData?.list ?? [];
  const uploadProgressText = uploadProgress
    ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(2)} MB${
        uploadProgress.total ? ` / ${(uploadProgress.total / 1024 / 1024).toFixed(2)} MB` : ''
      }`
    : '';
  const visibleSelectedFiles = showAllSelectedFiles ? fileList : fileList.slice(0, 8);
  const selectedTotalBytes = useMemo(
    () =>
      fileList.reduce((sum, item) => {
        const file = item.originFileObj;
        return sum + (file?.size ?? item.size ?? 0);
      }, 0),
    [fileList],
  );
  const selectedRequiresManualAnalysis =
    uploadMode === 'zip' &&
    fileList.length === 1 &&
    isZipFileName(fileList[0]?.name ?? '') &&
    selectedTotalBytes > LARGE_ZIP_UPLOAD_THRESHOLD_BYTES;
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

  if (!requirementId) {
    return (
      <Card title="选择需求单" loading={isRequirementListLoading}>
        <List<RequirementListItem>
          dataSource={requirementListData?.list ?? []}
          pagination={{
            current: requirementPickerPage,
            pageSize: requirementPickerPageSize,
            total: requirementListData?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setRequirementPickerPage(page);
              setRequirementPickerPageSize(pageSize);
            },
          }}
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
            {selectedRequiresManualAnalysis ? '正在上传 ZIP' : '正在上传文件夹'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {selectedRequiresManualAnalysis
              ? 'ZIP 文件正在上传到服务器，请不要关闭页面。该文件超过 10GB，上传完成后仅保存原始文件，等待管理侧确认拉取。'
              : '文件正在上传到服务器，请不要关闭页面。支持将多个文件夹累计到同一批次后统一上传，上传完成后等待管理侧确认拉取详情数据。'}
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
                description={
                  selectedRequiresManualAnalysis
                    ? `文件正在异步上传，请不要关闭页面。${uploadProgressText ? ` 当前进度：${uploadProgressText}` : ''} 上传完成后仅保存原始 ZIP，管理侧可下载到本地分析。`
                    : `文件正在异步上传，请不要关闭页面。${uploadProgressText ? ` 当前进度：${uploadProgressText}` : ''} 上传完成后会自动进入后台异步解析。`
                }
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
                  message.warning(uploadMode === 'zip' ? '请先选择单个 ZIP 文件' : '请先选择至少一个文件夹');
                  return;
                }
                // 检查自定义值
                if (values.modality === 'Other' && !modalityCustom) {
                  message.warning('请输入自定义影像模态');
                  return;
                }
                if (values.bodyPart === '其他' && !bodyPartCustom) {
                  message.warning('请输入自定义检查部位');
                  return;
                }
                setShowFileSelectionError(false);
                // 将自定义值合并到表单值中
                const submitValues = {
                  ...values,
                  modality: values.modality === 'Other' ? modalityCustom : values.modality,
                  bodyPart: values.bodyPart === '其他' ? bodyPartCustom : values.bodyPart,
                };
                createBatchMutation.mutate(submitValues);
              }}
            >
              <Form.Item label="上传类型">
                <Input
                  value={(batchData?.total ?? 0) > 0 ? '补充上传' : '首次上传'}
                  disabled
                />
              </Form.Item>
              <Form.Item label="上传方式" style={{ marginBottom: 12 }}>
                <Radio.Group
                  value={uploadMode}
                  onChange={(event) => setUploadMode(event.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: '文件夹上传', value: 'folder' },
                    { label: 'ZIP 上传', value: 'zip' },
                  ]}
                />
              </Form.Item>
              <Alert
                type={uploadMode === 'zip' ? 'warning' : 'info'}
                showIcon
                style={{ marginBottom: 16 }}
                message={uploadMode === 'zip' ? 'ZIP 上传后等待管理侧确认拉取' : '文件夹上传后等待管理侧确认拉取详情数据'}
                description={
                  uploadMode === 'zip'
                    ? '仅当原始数据超过 10GB 时使用 ZIP 上传，系统会先保存原始压缩包，不会直接展开解析。'
                    : '单次累计选择的文件总大小不能超过 10GB；如果超过，请先压缩成单个 ZIP 后切换到 ZIP 上传。'
                }
              />
              <Form.Item label=" " style={{ marginBottom: 16 }}>
                <Checkbox
                  checked={enableAutoParseMetadata}
                  disabled={uploadMode === 'zip'}
                  onChange={(e) => setEnableAutoParseMetadata(e.target.checked)}
                >
                  自动识别元数据（仅在浏览器本地读取少量 DICOM 头信息，用于辅助填充影像模态和检查部位）
                </Checkbox>
              </Form.Item>
              <Form.Item
                label="上传文件"
                required
                validateStatus={showFileSelectionError && fileList.length === 0 ? 'error' : undefined}
                help={
                  showFileSelectionError && fileList.length === 0
                    ? uploadMode === 'zip'
                      ? '请先选择单个 ZIP 文件'
                      : '请先选择至少一个文件夹'
                    : `当前已选择 ${fileList.length} 个${uploadMode === 'zip' ? '文件' : '文件'}，总大小 ${formatFileSize(selectedTotalBytes)}`
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
                                setModalityCustom('');
                                setBodyPartCustom('');
                                form.setFieldsValue({ modality: '', bodyPart: '', diagnosis: undefined, clinicalTags: undefined, annotationStatus: undefined, remark: '' });
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
                      void syncFilesToUploadList(files, { append: fileList.length > 0 });
                      if (folderInputRef.current) {
                        folderInputRef.current.value = '';
                      }
                    }}
                  />
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      void syncFilesToUploadList(files, { append: false });
                      if (zipInputRef.current) {
                        zipInputRef.current.value = '';
                      }
                    }}
                  />
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Button onClick={() => (uploadMode === 'zip' ? zipInputRef.current?.click() : folderInputRef.current?.click())}>
                      {uploadMode === 'zip'
                        ? fileList.length > 0
                          ? '重新选择 ZIP'
                          : '选择 ZIP'
                        : fileList.length > 0
                          ? '继续添加文件夹'
                          : '选择文件夹'}
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
                          <Typography.Text strong>
                            已选择 {fileList.length} 个文件，总大小 {formatFileSize(selectedTotalBytes)}
                          </Typography.Text>
                          {uploadMode === 'folder' ? (
                            <Button type="link" onClick={() => setShowAllSelectedFiles((value) => !value)}>
                              {showAllSelectedFiles ? '收起文件列表' : `展开全部文件 (${fileList.length})`}
                            </Button>
                          ) : null}
                        </Space>
                        <Typography.Text type="secondary">
                          {uploadMode === 'zip'
                            ? 'ZIP 上传只保留一个压缩包，且仅支持超过 10GB 的单文件。'
                            : `可多次点击“${fileList.length > 0 ? '继续添加文件夹' : '选择文件夹'}”累计选择多个文件夹；重复文件会自动去重。`}
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
                                  {item.size ? formatFileSize(item.size) : '-'}
                                </Typography.Text>
                              </div>
                            </List.Item>
                          )}
                        />
                        {!showAllSelectedFiles && uploadMode === 'folder' && fileList.length > visibleSelectedFiles.length ? (
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
              <Card size="small" title="科研标签" style={{ marginBottom: 16 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Form.Item
                    name="modality"
                    label="影像模态"
                    rules={[{ required: true, message: '请选择影像模态' }]}
                  >
                    <Select placeholder="选择影像模态" options={MODALITY_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.modality !== currentValues.modality}
                  >
                    {({ getFieldValue }) =>
                      getFieldValue('modality') === 'Other' ? (
                        <Form.Item
                          label="自定义影像模态"
                          required
                          validateStatus={!modalityCustom ? 'error' : undefined}
                          help={!modalityCustom ? '请输入自定义影像模态' : ''}
                        >
                          <Input
                            placeholder="例如：PET、SPECT 等"
                            value={modalityCustom}
                            onChange={(e) => setModalityCustom(e.target.value)}
                            maxLength={64}
                          />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>

                  <Form.Item
                    name="bodyPart"
                    label="检查部位"
                    rules={[{ required: true, message: '请选择检查部位' }]}
                  >
                    <Select placeholder="选择检查部位" options={BODY_PART_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.bodyPart !== currentValues.bodyPart}
                  >
                    {({ getFieldValue }) =>
                      getFieldValue('bodyPart') === '其他' ? (
                        <Form.Item
                          label="自定义检查部位"
                          required
                          validateStatus={!bodyPartCustom ? 'error' : undefined}
                          help={!bodyPartCustom ? '请输入自定义检查部位' : ''}
                        >
                          <Input
                            placeholder="例如：脸部、耳朵 等"
                            value={bodyPartCustom}
                            onChange={(e) => setBodyPartCustom(e.target.value)}
                            maxLength={64}
                          />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>

                  <Form.Item name="diagnosis" label="疾病诊断">
                    <Select
                      mode="tags"
                      placeholder="输入诊断标签，回车生成"
                      maxCount={10}
                    />
                  </Form.Item>
                  <Form.Item name="clinicalTags" label="临床金标准（可多选）">
                    <Checkbox.Group options={CLINICAL_TAG_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="annotationStatus" label="标注状态（单选）">
                    <Radio.Group options={ANNOTATION_STATUS_OPTIONS} />
                  </Form.Item>
                </Space>
              </Card>
              <Form.Item name="remark" label="批次备注">
                <Input.TextArea
                  rows={4}
                  maxLength={255}
                  placeholder="记录数据范围、补传原因、约定事项等"
                />
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
                    setModalityCustom('');
                    setBodyPartCustom('');
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
                        failedFiles,
                      });
                      resetSelectedFiles();
                      form.setFieldsValue({
                        modality: record.modality || '',
                        bodyPart: record.bodyPart || '',
                        diagnosis: record.diagnosis || undefined,
                        clinicalTags: record.clinicalTags || undefined,
                        annotationStatus: record.annotationStatus || undefined,
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
                  render: (_: unknown, record: DatasetBatchItem) => <Typography.Text strong>#{record.batchNo}</Typography.Text>,
                },
                {
                  title: '上传类型',
                  width: 110,
                  render: (_: unknown, record: DatasetBatchItem) => (
                    <Tag color={record.uploadType === 'initial' ? 'geekblue' : 'gold'}>
                      {record.uploadType === 'initial' ? '首次上传' : '补充上传'}
                    </Tag>
                  ),
                },
                {
                  title: '数据标签',
                  width: 360,
                  render: (_: unknown, record: DatasetBatchItem) => (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space size={4} wrap>
                        {record.modality ? (
                          <Tag color="blue">{MODALITY_MAP[record.modality] || record.modality}</Tag>
                        ) : null}
                        {record.bodyPart ? (
                          <Tag color="cyan">{BODY_PART_MAP[record.bodyPart] || record.bodyPart}</Tag>
                        ) : null}
                      </Space>
                      {record.diagnosis && record.diagnosis.length > 0 ? (
                        <Space size={2} wrap>
                          {record.diagnosis.map((d) => (
                            <Tag key={d}>{d}</Tag>
                          ))}
                        </Space>
                      ) : null}
                      {record.sourceName ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {record.sourceName}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '文件数',
                  width: 120,
                  render: (_: unknown, record: DatasetBatchItem) => (
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
                  width: 220,
                  render: (_: unknown, record: DatasetBatchItem) => (
                    <Space direction="vertical" size={4}>
                      <Tag color={record.requiresManualAnalysis ? 'cyan' : batchStatusColorMap[record.status]}>
                        {record.requiresManualAnalysis ? '待人工分析' : batchStatusLabelMap[record.status]}
                      </Tag>
                      {record.requiresManualAnalysis && user?.role === 'admin' ? (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: 'auto', textAlign: 'left' }}
                          onClick={async () => {
                            try {
                              await downloadViaBrowser({
                                path: `/requirements/${requirementId}/dataset-batches/${record.id}/raw-file`,
                                fileName: record.sourceName || `batch-${record.batchNo}.zip`,
                              });
                            } catch {
                              message.error('原始 ZIP 下载失败');
                            }
                          }}
                        >
                          下载原始 ZIP
                        </Button>
                      ) : null}
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
                  render: (_: unknown, record: DatasetBatchItem) => record.uploader.username,
                  hidden: user?.role === 'user',
                },
                {
                  title: '上传时间',
                  width: 168,
                  render: (_: unknown, record: DatasetBatchItem) => dayjs(record.uploadedAt).format('YYYY-MM-DD HH:mm'),
                },
              ].filter((column) => !('hidden' in column) || !column.hidden)}
              locale={{
                emptyText: <Empty description="当前需求单还没有上传批次" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
              }}
            />
          </Card>
        </Col>
      </Row>

      {user?.role === 'admin' ? (
        <Card
          title="OSS 原始文件"
          extra={<Button onClick={() => void refetchOssFiles()}>刷新</Button>}
        >
        {isOssFilesError ? <Alert type="error" showIcon message="OSS 文件列表加载失败" style={{ marginBottom: 16 }} /> : null}
        <Alert
          type="info"
          showIcon
          message="已禁止管理侧直接下载 OSS 原始文件"
          description="为避免重复产生 OSS 出站费用，请使用“拉取详情数据”作为唯一 OSS 出站路径。"
          style={{ marginBottom: 16 }}
        />
        <Table<RequirementOssFileItem>
          rowKey="id"
          loading={isOssFilesLoading}
          dataSource={ossFiles}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          locale={{
            emptyText: <Empty description="当前还没有 OSS 原始文件记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          columns={[
            {
              title: '文件名',
              render: (_: unknown, record: RequirementOssFileItem) => (
                <Space direction="vertical" size={2}>
                  <Typography.Text>{record.fileName}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {record.objectKey}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: '大小',
              width: 120,
              render: (_: unknown, record: RequirementOssFileItem) => formatFileSize(record.fileSize),
            },
            {
              title: '状态',
              width: 140,
              render: (_: unknown, record: RequirementOssFileItem) => {
                const statusMap: Record<RequirementOssFileItem['status'], { color: string; label: string }> = {
                  pending_upload: { color: 'default', label: '待上传' },
                  uploaded: { color: 'blue', label: '已上传' },
                  parsing: { color: 'processing', label: '解析中' },
                  parsed: { color: 'green', label: '已解析' },
                  failed: { color: 'red', label: '失败' },
                };
                const status = statusMap[record.status];
                if (record.ossDeletedAt) {
                  return <Tag color="default">已回收</Tag>;
                }
                return <Tag color={status.color}>{status.label}</Tag>;
              },
            },
            {
              title: '上传时间',
              width: 168,
              render: (_: unknown, record: RequirementOssFileItem) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: '操作',
              width: 120,
              render: (_: unknown, record: RequirementOssFileItem) => (
                <Button
                  type="link"
                  disabled
                  onClick={async () => {
                    try {
                      throw new Error('已禁止管理侧直接下载 OSS 原始文件，请使用“拉取详情数据”');
                    } catch (error) {
                      const errorMessage = axios.isAxiosError(error)
                        ? (error.response?.data as { message?: string } | undefined)?.message
                        : error instanceof Error
                          ? error.message
                          : undefined;
                      message.error(errorMessage || 'OSS 文件下载失败');
                    }
                  }}
                >
                  下载
                </Button>
              ),
            },
          ]}
        />
        </Card>
      ) : null}
    </Space>
  );
}

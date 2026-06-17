import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatasetBatchStatus, DatasetUploadType, Prisma, RequirementOssFileKind, RequirementOssFileStatus, RequirementStatus, UserRole } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import * as dicomParser from 'dicom-parser';
import type { Readable } from 'node:stream';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateDatasetBatchFromOssFilesDto } from './dto/create-dataset-batch-from-oss-files.dto';
import { CreateDatasetBatchFromSessionsDto } from './dto/create-dataset-batch-from-sessions.dto';
import { ConfirmRequirementOssFileDto } from './dto/confirm-requirement-oss-file.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRequirementOssFileDto, RequirementOssFileKindDto } from './dto/create-requirement-oss-file.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ListRequirementDataTreeDto } from './dto/list-requirement-data-tree.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';
import {
  ENCRYPTED_MODEL_IV_LENGTH,
  ENCRYPTED_MODEL_MAGIC,
  ENCRYPTED_MODEL_VERSION,
  EncryptedModelMetadata,
  getConfiguredLicenseKeyForUser,
  getEncryptedModelSidecarPath,
  normalizeLicenseKeyBase64,
  validateModelLicenseFile,
} from './model-license';
import { UpdateRequirementStatusDto } from './dto/update-requirement-status.dto';

type UploadedBinaryFile = { originalname: string; path: string; mimetype?: string; size?: number };
type StagedUploadFile = { originalname: string; path: string; mimetype?: string; size?: number };

const execFileAsync = promisify(execFile);

type ParsedDicomRecord = {
  patientUid: string;
  patientId: string | null;
  patientName: string | null;
  sex: string | null;
  birthday: Date | null;
  studyUid: string;
  studyId: string | null;
  modality: string | null;
  studyDate: Date | null;
  studyDescription: string | null;
  seriesUid: string;
  seriesDescription: string | null;
  hospitalName: string | null;
  uploadedAt: Date | null;
  storagePath: string;
  originalname: string;
};

type FailedDatasetFileRecord = {
  originalName: string;
  reason: string;
};

type DicomSeriesMetadataSummary = {
  manufacturer: string | null;
  protocolName: string | null;
  manufacturerModelName: string | null;
  bodyPart: string | null;
};

type UploadSessionBatchSummary = {
  totalBytes: number;
  isSingleZip: boolean;
  requiresManualAnalysis: boolean;
};

type RequirementOssFileSummary = {
  id: string;
  datasetBatchId: string | null;
  kind: RequirementOssFileKind;
  status: RequirementOssFileStatus;
  objectKey: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  etag: string | null;
  modelName: string | null;
  modelVersion: string | null;
  parsedObjectKey: string | null;
  parsedPayload: Prisma.JsonValue | null;
  errorMessage: string | null;
  uploadCompletedAt: Date | null;
  pulledToLocalAt: Date | null;
  parsedAt: Date | null;
  ossDeletedAt: Date | null;
  ossDeleteError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class RequirementsService {
  private static readonly LARGE_ZIP_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024 * 1024;
  private static readonly MAX_SINGLE_DICOM_FILE_BYTES = 10 * 1024 * 1024 * 1024;
  private static readonly DEFAULT_UPLOAD_SESSION_FILE_MAX_BYTES = 20 * 1024 * 1024 * 1024;
  private static readonly DEFAULT_UPLOAD_SESSION_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;
  private static readonly DEFAULT_UPLOAD_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private readonly uploadRoots = [
    resolve(process.cwd(), 'storage', 'uploads'),
    resolve(__dirname, '..', '..', '..', '..', 'storage', 'uploads'),
  ];

  private readonly uploadSessionRoots = [
    resolve(process.cwd(), 'storage', 'upload-sessions'),
    resolve(__dirname, '..', '..', '..', '..', 'storage', 'upload-sessions'),
  ];

  private readonly deliveryRoots = [
    resolve(process.cwd(), 'storage', 'deliveries'),
    resolve(__dirname, '..', '..', '..', '..', 'storage', 'deliveries'),
  ];

  private readonly uploadSessionFileMaxBytes = this.getPositiveNumberConfig(
    'UPLOAD_SESSION_FILE_MAX_BYTES',
    RequirementsService.DEFAULT_UPLOAD_SESSION_FILE_MAX_BYTES,
  );

  private readonly uploadSessionQuotaBytes = this.getPositiveNumberConfig(
    'UPLOAD_SESSION_QUOTA_BYTES',
    RequirementsService.DEFAULT_UPLOAD_SESSION_QUOTA_BYTES,
  );

  private readonly uploadSessionRetentionMs = this.getPositiveNumberConfig(
    'UPLOAD_SESSION_RETENTION_MS',
    RequirementsService.DEFAULT_UPLOAD_SESSION_RETENTION_MS,
  );

  private readonly ossBucket = this.normalizeText(process.env.OSS_BUCKET);
  private readonly ossEndpoint = this.normalizeText(process.env.OSS_ENDPOINT);
  private readonly ossAccessKeyId = this.normalizeText(process.env.OSS_ACCESS_KEY_ID);
  private readonly ossAccessKeySecret = this.normalizeText(process.env.OSS_ACCESS_KEY_SECRET);
  private readonly ossUploadUrlExpiresSeconds = this.getPositiveIntConfig('OSS_UPLOAD_URL_EXPIRES_SECONDS', 15 * 60);
  private readonly ossDownloadUrlExpiresSeconds = this.getPositiveIntConfig('OSS_DOWNLOAD_URL_EXPIRES_SECONDS', 10 * 60);

  private readonly dataTreeMetadataSampleFiles = this.getPositiveIntConfig('DATA_TREE_METADATA_SAMPLE_FILES', 6);
  private readonly dataTreeSeriesMetadataConcurrency = this.getPositiveIntConfig('DATA_TREE_METADATA_CONCURRENCY', 4);
  private readonly pacsTagInfoMaxSeries = this.getPositiveIntConfig('PACS_TAG_INFO_MAX_SERIES', 12);
  private readonly pacsTagInfoMaxFilesPerSeries = this.getPositiveIntConfig('PACS_TAG_INFO_MAX_FILES_PER_SERIES', 200);
  private readonly pacsTagInfoSeriesConcurrency = this.getPositiveIntConfig('PACS_TAG_INFO_SERIES_CONCURRENCY', 2);
  private readonly pacsTagInfoFileConcurrency = this.getPositiveIntConfig('PACS_TAG_INFO_FILE_CONCURRENCY', 4);
  private readonly pacsDownloadMaxSeries = this.getPositiveIntConfig('PACS_DOWNLOAD_MAX_SERIES', 25);
  private readonly pacsDownloadMaxFiles = this.getPositiveIntConfig('PACS_DOWNLOAD_MAX_FILES', 4000);
  private lastUploadSessionCleanupAt = 0;

  private getPositiveIntConfig(name: string, fallback: number) {
    const raw = Number(process.env[name]);
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
  }

  private getPositiveNumberConfig(name: string, fallback: number) {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const results = new Array<R>(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
          const currentIndex = cursor;
          cursor += 1;
          results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
      }),
    );

    return results;
  }

  private async ensureRequirementAccess(userId: bigint, requirementId: bigint, role: UserRole) {
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { id: true, userId: true, title: true, status: true },
    });

    if (!requirement) {
      throw new NotFoundException('需求单不存在');
    }

    if (role !== UserRole.admin && requirement.userId !== userId) {
      throw new ForbiddenException('无权访问该需求单');
    }

    return requirement;
  }

  private normalizeText(value: string | undefined | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizePatientName(value: string | undefined | null) {
    const normalized = this.normalizeText(value);
    return normalized ? normalized.replace(/\^/g, ' ') : null;
  }

  private summarizeNotificationContent(value: string, maxLength = 120) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  private renderRequirementStatusLabel(status: RequirementStatus) {
    switch (status) {
      case RequirementStatus.pending:
        return '待响应';
      case RequirementStatus.processing:
        return '受理中（需等待）';
      case RequirementStatus.waiting_user:
        return '受理中（需补充数据）';
      case RequirementStatus.completed:
        return '已完成';
      default:
        return status;
    }
  }

  private async createNotifications(
    tx: Prisma.TransactionClient,
    userIds: bigint[],
    requirementId: bigint,
    type: string,
    title: string,
    content: string,
  ) {
    const uniqueUserIds = Array.from(new Set(userIds.map((item) => item.toString()))).map((item) => BigInt(item));
    if (uniqueUserIds.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: uniqueUserIds.map((targetUserId) => ({
        userId: targetUserId,
        requirementId,
        type,
        title,
        content,
      })),
    });
  }

  private parseDicomDate(value: string | undefined | null) {
    if (!value) {
      return null;
    }

    const normalized = value.replace(/[^0-9]/g, '').slice(0, 8);
    if (normalized.length !== 8) {
      return null;
    }

    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6));
    const day = Number(normalized.slice(6, 8));
    if (!year || !month || !day) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day));
  }

  private parseDicomDateTime(dateValue: string | undefined | null, timeValue?: string | undefined | null) {
    const date = this.parseDicomDate(dateValue);
    if (!date) {
      return null;
    }

    const normalizedTime = (timeValue ?? '').replace(/[^0-9.]/g, '');
    if (!normalizedTime) {
      return date;
    }

    const [whole, fraction] = normalizedTime.split('.');
    const hh = Number(whole.slice(0, 2) || '0');
    const mm = Number(whole.slice(2, 4) || '0');
    const ss = Number(whole.slice(4, 6) || '0');
    const ms = Number(((fraction ?? '').slice(0, 3) || '').padEnd(3, '0'));
    date.setUTCHours(hh, mm, ss, ms);
    return date;
  }

  private formatUtcDate(value: Date | null | undefined) {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }

  private formatUtcDateTime(value: Date | null | undefined) {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  private formatPatientAge(value: string | undefined | null) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }
    const matched = normalized.match(/^(\d+)([DWMY])$/i);
    if (!matched) {
      return normalized;
    }
    const [, amount, unit] = matched;
    const suffixMap: Record<string, string> = {
      D: 'D',
      W: 'W',
      M: 'M',
      Y: 'Y',
    };
    return `${Number(amount)}${suffixMap[unit.toUpperCase()]}`;
  }

  private compactTagLines(values: Array<string | null | undefined>) {
    return values
      .map((value) => this.normalizeText(value))
      .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  }

  private readDicomValue(dataSet: dicomParser.DataSet, tag: string) {
    return this.normalizeText(dataSet.string(tag));
  }

  private readFirstDicomValue(dataSet: dicomParser.DataSet, tag: string) {
    const value = this.readDicomValue(dataSet, tag);
    if (!value) {
      return null;
    }
    return value.split('\\').map((item) => item.trim()).find(Boolean) ?? null;
  }

  private formatCompactStudyDateTime(value: Date | null | undefined) {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  }

  private padTagNumber(value: string | null | undefined, width = 3) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }
    const digits = normalized.replace(/\D/g, '');
    if (!digits) {
      return normalized;
    }
    return digits.slice(-width).padStart(width, '0');
  }

  private formatMeasurement(label: string, value: string | null | undefined) {
    const normalized = this.readNumericToken(value);
    return normalized ? `${label} ${normalized}` : null;
  }

  private readNumericToken(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }
    return normalized.split('\\')[0]?.trim() || null;
  }

  private formatDurationTag(value: string | null | undefined) {
    const numeric = Number(this.readNumericToken(value));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    const minutes = Math.floor(numeric / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (numeric % 60).toFixed(2).padStart(5, '0');
    return `${minutes}.${seconds}`;
  }

  private formatFieldOfView(dataSet: dicomParser.DataSet, rows?: number, columns?: number) {
    const reconstructionDiameter = Number(this.readNumericToken(this.readDicomValue(dataSet, 'x00181100')));
    if (Number.isFinite(reconstructionDiameter) && reconstructionDiameter > 0) {
      const formatted = Number.isInteger(reconstructionDiameter)
        ? reconstructionDiameter.toString()
        : reconstructionDiameter.toFixed(1);
      return `FoV ${formatted}*${formatted}`;
    }

    const pixelSpacing = this.readDicomValue(dataSet, 'x00280030');
    if (!pixelSpacing || !rows || !columns) {
      return null;
    }

    const [rowSpacingRaw, columnSpacingRaw] = pixelSpacing.split('\\');
    const rowSpacing = Number(rowSpacingRaw);
    const columnSpacing = Number(columnSpacingRaw ?? rowSpacingRaw);
    if (!Number.isFinite(rowSpacing) || !Number.isFinite(columnSpacing)) {
      return null;
    }

    const height = rowSpacing * rows;
    const width = columnSpacing * columns;
    const format = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));
    return `FoV ${format(width)}*${format(height)}`;
  }

  private deriveImageOrientationLabel(dataSet: dicomParser.DataSet) {
    const orientation = this.readDicomValue(dataSet, 'x00200037');
    if (!orientation) {
      return null;
    }

    const values = orientation
      .split('\\')
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    if (values.length < 6) {
      return null;
    }

    const [rx, ry, rz, cx, cy, cz] = values;
    const nx = ry * cz - rz * cy;
    const ny = rz * cx - rx * cz;
    const nz = rx * cy - ry * cx;
    const abs = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
    const max = Math.max(...abs);

    if (max === abs[0]) {
      return 'Sag';
    }
    if (max === abs[1]) {
      return 'Cor';
    }
    return 'Ax';
  }

  private buildFallbackUid(prefix: 'patient' | 'study' | 'series', values: Array<string | null>) {
    const source = values.map((value) => value ?? '').join('|');
    return `${prefix}_${createHash('sha1').update(source).digest('hex')}`;
  }

  private sanitizePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'item';
  }

  private sanitizeFilename(originalname: string, index: number) {
    const extension = extname(originalname) || '.dcm';
    const base = originalname.slice(0, originalname.length - extension.length) || `file_${index + 1}`;
    return `${this.sanitizePathSegment(base)}${extension}`;
  }

  private ensureOssConfigured() {
    if (!this.ossBucket || !this.ossEndpoint || !this.ossAccessKeyId || !this.ossAccessKeySecret) {
      throw new BadRequestException('OSS 配置不完整，请先设置 OSS_BUCKET、OSS_ENDPOINT、OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET');
    }

    return {
      bucket: this.ossBucket,
      endpoint: this.ossEndpoint.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      accessKeyId: this.ossAccessKeyId,
      accessKeySecret: this.ossAccessKeySecret,
    };
  }

  private encodeOssObjectKey(objectKey: string) {
    return objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private buildOssSignedUrl(
    method: 'GET' | 'PUT' | 'DELETE',
    objectKey: string,
    expiresInSeconds: number,
    contentType = '',
  ) {
    const { bucket, endpoint, accessKeyId, accessKeySecret } = this.ensureOssConfigured();
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const resource = `/${bucket}/${objectKey}`;
    const stringToSign = [method, '', contentType, String(expires), resource].join('\n');
    const signature = createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');
    const url = new URL(`https://${bucket}.${endpoint}/${this.encodeOssObjectKey(objectKey)}`);
    url.searchParams.set('OSSAccessKeyId', accessKeyId);
    url.searchParams.set('Expires', String(expires));
    url.searchParams.set('Signature', signature);

    return {
      url: url.toString(),
      expiresAt: new Date(expires * 1000),
    };
  }

  private buildRequirementOssObjectKey(requirementId: bigint, dto: CreateRequirementOssFileDto) {
    const extension = extname(dto.fileName.trim()) || (dto.kind === RequirementOssFileKindDto.dicom ? '.dcm' : '.bin');
    if (dto.kind === RequirementOssFileKindDto.dicom) {
      return `dicom/incoming/${requirementId.toString()}/${randomUUID()}${extension.toLowerCase()}`;
    }

    const modelName = this.sanitizePathSegment(dto.modelName ?? 'model');
    const modelVersion = this.sanitizePathSegment(dto.modelVersion ?? 'v1');
    return `models/${modelName}/${modelVersion}/${randomUUID()}${extension.toLowerCase()}`;
  }

  private mapRequirementOssFile(record: {
    id: bigint;
    datasetBatchId: bigint | null;
    kind: RequirementOssFileKind;
    status: RequirementOssFileStatus;
    objectKey: string;
    originalFileName: string;
    mimeType: string | null;
    fileSize: bigint;
    etag: string | null;
    modelName: string | null;
    modelVersion: string | null;
    parsedObjectKey: string | null;
    parsedPayload: Prisma.JsonValue | null;
    errorMessage: string | null;
    uploadCompletedAt: Date | null;
    pulledToLocalAt: Date | null;
    parsedAt: Date | null;
    ossDeletedAt: Date | null;
    ossDeleteError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): RequirementOssFileSummary {
    return {
      id: record.id.toString(),
      datasetBatchId: record.datasetBatchId ? record.datasetBatchId.toString() : null,
      kind: record.kind,
      status: record.status,
      objectKey: record.objectKey,
      fileName: record.originalFileName,
      mimeType: record.mimeType,
      fileSize: Number(record.fileSize),
      etag: record.etag,
      modelName: record.modelName,
      modelVersion: record.modelVersion,
      parsedObjectKey: record.parsedObjectKey,
      parsedPayload: record.parsedPayload,
      errorMessage: record.errorMessage,
      uploadCompletedAt: record.uploadCompletedAt,
      pulledToLocalAt: record.pulledToLocalAt,
      parsedAt: record.parsedAt,
      ossDeletedAt: record.ossDeletedAt,
      ossDeleteError: record.ossDeleteError,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async fetchUrlBuffer(url: string) {
    return new Promise<Buffer>((resolvePromise, reject) => {
      const request = httpsRequest(url, { method: 'GET' }, (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          reject(new Error(`OSS GET 失败，状态码 ${response.statusCode ?? 'unknown'}`));
          response.resume();
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => resolvePromise(Buffer.concat(chunks)));
      });

      request.on('error', reject);
      request.end();
    });
  }

  private async putBufferToUrl(url: string, body: Buffer, contentType: string) {
    return new Promise<void>((resolvePromise, reject) => {
      const request = httpsRequest(url, {
        method: 'PUT',
        headers: {
          'content-length': body.byteLength,
          'content-type': contentType,
        },
      }, (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          reject(new Error(`OSS PUT 失败，状态码 ${response.statusCode ?? 'unknown'}`));
          response.resume();
          return;
        }

        response.on('data', () => undefined);
        response.on('end', () => resolvePromise());
      });

      request.on('error', reject);
      request.write(body);
      request.end();
    });
  }

  private async deleteUrl(url: string) {
    return new Promise<void>((resolvePromise, reject) => {
      const request = httpsRequest(
        url,
        {
          method: 'DELETE',
        },
        (response) => {
          if (!response.statusCode || response.statusCode >= 400) {
            reject(new Error(`OSS DELETE 失败，状态码 ${response.statusCode ?? 'unknown'}`));
            response.resume();
            return;
          }

          response.on('data', () => undefined);
          response.on('end', () => resolvePromise());
        },
      );

      request.on('error', reject);
      request.end();
    });
  }

  private async downloadUrlToFile(url: string, filePath: string) {
    await mkdir(dirname(filePath), { recursive: true });
    return new Promise<void>((resolvePromise, reject) => {
      const request = httpsRequest(url, { method: 'GET' }, (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          reject(new Error(`OSS GET 失败，状态码 ${response.statusCode ?? 'unknown'}`));
          response.resume();
          return;
        }

        const writer = createWriteStream(filePath, { flags: 'w' });
        writer.on('error', reject);
        response.on('error', reject);
        writer.on('finish', () => resolvePromise());
        response.pipe(writer);
      });

      request.on('error', reject);
      request.end();
    });
  }

  private shouldIgnoreUploadedFile(originalname: string) {
    const normalized = originalname.replace(/\\/g, '/').trim();
    if (!normalized) {
      return true;
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
      return true;
    }

    return segments.some((segment) => segment === '__MACOSX' || segment === '.__MACOSX' || segment.startsWith('.'));
  }

  private buildUploadFingerprint(relativePath: string, fileSize: number, lastModified?: number) {
    return createHash('sha1')
      .update([relativePath.replace(/\\/g, '/').trim(), fileSize.toString(), String(lastModified ?? 0)].join('|'))
      .digest('hex');
  }

  private isZipFileName(fileName: string | null | undefined) {
    const normalized = this.normalizeText(fileName);
    return Boolean(normalized && normalized.toLowerCase().endsWith('.zip'));
  }

  private sanitizeRelativeStoragePath(relativePath: string) {
    return relativePath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map((segment, index, array) =>
        index === array.length - 1 ? this.sanitizeFilename(segment, index) : this.sanitizePathSegment(segment),
      )
      .join('/');
  }

  private getUploadSessionRoot(requirementId: bigint) {
    return join(this.uploadSessionRoots[0], requirementId.toString());
  }

  private getUploadSessionFilePath(requirementId: bigint, sessionId: bigint, relativePath: string) {
    const sanitizedRelativePath = this.sanitizeRelativeStoragePath(relativePath);
    return join(this.getUploadSessionRoot(requirementId), sessionId.toString(), sanitizedRelativePath || 'file.dcm');
  }

  private getDatasetBatchRoot(requirementId: bigint, batchNo: number) {
    return join(this.uploadRoots[0], requirementId.toString(), `batch-${batchNo}`);
  }

  private getFailedDatasetFilesManifestPath(requirementId: bigint, batchNo: number) {
    return join(this.getDatasetBatchRoot(requirementId, batchNo), '_failed-files.json');
  }

  private async writeFailedDatasetFilesManifest(
    requirementId: bigint,
    batchNo: number,
    records: FailedDatasetFileRecord[],
  ) {
    const manifestPath = this.getFailedDatasetFilesManifestPath(requirementId, batchNo);
    await writeFile(manifestPath, JSON.stringify(records, null, 2), 'utf8');
  }

  private async readFailedDatasetFilesManifest(requirementId: bigint, batchNo: number) {
    const manifestPath = this.getFailedDatasetFilesManifestPath(requirementId, batchNo);
    try {
      const raw = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as FailedDatasetFileRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (item) =>
          typeof item?.originalName === 'string' &&
          item.originalName.trim() &&
          typeof item?.reason === 'string' &&
          item.reason.trim(),
      );
    } catch {
      return [];
    }
  }

  private summarizeUploadSessions(
    sessions: Array<{
      fileName: string;
      relativePath: string;
      fileSize: bigint | number;
    }>,
  ): UploadSessionBatchSummary {
    const totalBytes = sessions.reduce((sum, session) => sum + Number(session.fileSize), 0);
    const isSingleZip =
      sessions.length === 1 &&
      this.isZipFileName(sessions[0]?.fileName) &&
      this.isZipFileName(sessions[0]?.relativePath);

    return {
      totalBytes,
      isSingleZip,
      requiresManualAnalysis: isSingleZip && totalBytes > RequirementsService.LARGE_ZIP_UPLOAD_THRESHOLD_BYTES,
    };
  }

  private summarizeRequirementOssFiles(
    files: Array<{
      originalFileName: string;
      fileSize: bigint | number;
    }>,
  ): UploadSessionBatchSummary {
    const totalBytes = files.reduce((sum, file) => sum + Number(file.fileSize), 0);
    const isSingleZip = files.length === 1 && this.isZipFileName(files[0]?.originalFileName);

    return {
      totalBytes,
      isSingleZip,
      requiresManualAnalysis: isSingleZip && totalBytes > RequirementsService.LARGE_ZIP_UPLOAD_THRESHOLD_BYTES,
    };
  }

  private buildManualAnalysisRemark(remark: string | null | undefined) {
    const notice = '超10GB ZIP 已保存原始文件，未自动解析';
    return [remark?.trim(), notice].filter(Boolean).join('；');
  }

  private ensureSafePathInRoots(storagePath: string, roots: string[]) {
    const resolvedPath = resolve(storagePath);
    for (const root of roots) {
      const resolvedRoot = resolve(root);
      const pathRelative = relative(resolvedRoot, resolvedPath);
      if (!pathRelative.startsWith('..') && !pathRelative.startsWith('/')) {
        return resolvedPath;
      }
    }
    throw new BadRequestException('非法文件路径');
  }

  private ensureSafeStoragePath(storagePath: string) {
    return this.ensureSafePathInRoots(storagePath, this.uploadRoots);
  }

  private ensureSafeDeliveryPath(storagePath: string) {
    return this.ensureSafePathInRoots(storagePath, this.deliveryRoots);
  }

  private normalizeMetadataTagValue(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase() === 'none' ? null : normalized;
  }

  private async readSeriesMetadataSummary(storagePath: string | null): Promise<DicomSeriesMetadataSummary> {
    if (!storagePath) {
      return {
        manufacturer: null,
        protocolName: null,
        manufacturerModelName: null,
        bodyPart: null,
      };
    }

    try {
      const safeStoragePath = this.ensureSafeStoragePath(storagePath);
      const seriesDir = dirname(safeStoragePath);
      const entries = (await readdir(seriesDir))
        .filter((fileName) => !fileName.startsWith('.'))
        .sort((left, right) => left.localeCompare(right, 'en'))
        .slice(0, this.dataTreeMetadataSampleFiles);
      const summary: DicomSeriesMetadataSummary = {
        manufacturer: null,
        protocolName: null,
        manufacturerModelName: null,
        bodyPart: null,
      };

      for (const fileName of entries) {
        const dataSet = await this.readDicomDataSetFromPath(join(seriesDir, fileName));

        summary.manufacturer ??= this.normalizeMetadataTagValue(this.readDicomValue(dataSet, 'x00080070'));
        summary.protocolName ??= this.normalizeMetadataTagValue(this.readDicomValue(dataSet, 'x00181030'));
        summary.manufacturerModelName ??= this.normalizeMetadataTagValue(this.readDicomValue(dataSet, 'x00081090'));
        summary.bodyPart ??= this.normalizeMetadataTagValue(this.readDicomValue(dataSet, 'x00180015'));

        if (summary.manufacturer && summary.protocolName && summary.manufacturerModelName && summary.bodyPart) {
          break;
        }
      }

      return summary;
    } catch {
      return {
        manufacturer: null,
        protocolName: null,
        manufacturerModelName: null,
        bodyPart: null,
      };
    }
  }

  private mergeMetadataValues(values: Array<string | null | undefined>) {
    const uniqueValues = [...new Set(values.map((value) => this.normalizeText(value)).filter(Boolean))];
    return uniqueValues.length > 0 ? uniqueValues.join(' / ') : null;
  }

  private async listSeriesFiles(storagePath: string, requirementId: bigint, seriesId: bigint) {
    const safeStoragePath = this.ensureSafeStoragePath(storagePath);
    const seriesDir = dirname(safeStoragePath);
    const fileNames = (await readdir(seriesDir)).sort((left, right) => left.localeCompare(right, 'en'));

    return Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = join(seriesDir, fileName);
        const fileStats = await stat(filePath);
        return {
          name: fileName,
          size: fileStats.size,
          url: `/api/v1/requirements/${requirementId.toString()}/series/${seriesId.toString()}/files/${encodeURIComponent(fileName)}`,
        };
      }),
    );
  }

  private async buildSeriesViewerPayload(
    series: {
      id: bigint;
      seriesUid: string;
      seriesDescription: string | null;
      hospitalName: string | null;
      remark: string | null;
      uploadedAt: Date | null;
      imageCount: number;
      storagePath: string | null;
      datasetBatch: {
        id: bigint;
        batchNo: number;
        uploadType: string;
        sourceName: string | null;
      };
    },
    requirementId: bigint,
  ) {
    const files = series.storagePath ? await this.listSeriesFiles(series.storagePath, requirementId, series.id) : [];

    return {
      id: series.id.toString(),
      seriesUid: series.seriesUid,
      seriesDescription: series.seriesDescription,
      hospitalName: series.hospitalName,
      remark: series.remark,
      uploadedAt: series.uploadedAt,
      imageCount: series.imageCount,
      files,
      datasetBatch: {
        id: series.datasetBatch.id.toString(),
        batchNo: series.datasetBatch.batchNo,
        uploadType: series.datasetBatch.uploadType,
        sourceName: series.datasetBatch.sourceName,
      },
    };
  }

  private async deleteSeriesFiles(storagePath: string | null) {
    if (!storagePath) {
      return;
    }

    const safeStoragePath = this.ensureSafeStoragePath(storagePath);
    await rm(dirname(safeStoragePath), { recursive: true, force: true });
  }

  private async findAccessibleSeries(
    userId: bigint,
    role: UserRole,
    seriesIds: string[] = [],
    seriesUids: string[] = [],
  ) {
    const numericSeriesIds = seriesIds
      .map((value) => {
        try {
          return BigInt(value);
        } catch {
          return null;
        }
      })
      .filter((value): value is bigint => value !== null);

    const where: Prisma.SeriesWhereInput = {
      OR: [
        ...(numericSeriesIds.length > 0 ? [{ id: { in: numericSeriesIds } }] : []),
        ...(seriesUids.length > 0 ? [{ seriesUid: { in: seriesUids } }] : []),
      ],
      ...(role === UserRole.admin
        ? {}
        : {
            study: {
              patient: {
                requirement: {
                  userId,
                },
              },
            },
          }),
    };

    if (!where.OR || where.OR.length === 0) {
      return [];
    }

    return this.prisma.series.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      include: {
        study: {
          include: {
            patient: {
              select: {
                id: true,
                patientUid: true,
                patientId: true,
                patientName: true,
                sex: true,
                birthday: true,
              },
            },
          },
        },
      },
    });
  }

  private async listSeriesFileEntries(series: { id: bigint; storagePath: string | null }) {
    if (!series.storagePath) {
      return [];
    }

    const safeStoragePath = this.ensureSafeStoragePath(series.storagePath);
    const seriesDir = dirname(safeStoragePath);
    const fileNames = (await readdir(seriesDir)).sort((left, right) => left.localeCompare(right, 'en'));

    return fileNames.map((fileName) => ({
      seriesId: series.id.toString(),
      fileName,
      filePath: join(seriesDir, fileName),
    }));
  }

  private async parsePacsTagInfo(
    _series: {
      seriesUid: string;
      seriesDescription: string | null;
      hospitalName: string | null;
      study: {
        modality: string | null;
        studyDescription: string | null;
        studyDate: Date | null;
        patient: {
          patientUid: string;
          patientId: string | null;
          patientName: string | null;
          sex: string | null;
          birthday: Date | null;
        };
      };
    },
    filePath: string,
  ) {
    const dataSet = await this.readDicomDataSetFromPath(filePath);
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const patientName = this.normalizePatientName(dataSet.string('x00100010'));
    const patientId = this.readDicomValue(dataSet, 'x00100020');
    const patientSex = this.readDicomValue(dataSet, 'x00100040');
    const patientAge = this.formatPatientAge(dataSet.string('x00101010'));
    const birthday = this.formatUtcDate(this.parseDicomDate(dataSet.string('x00100030')));
    const institution = this.readDicomValue(dataSet, 'x00080080');
    const modality = this.readDicomValue(dataSet, 'x00080060');
    const seriesDescription = this.readDicomValue(dataSet, 'x0008103e');
    const protocolName = this.readDicomValue(dataSet, 'x00181030');
    const bodyPart = this.readDicomValue(dataSet, 'x00180015');
    const manufacturer = this.readDicomValue(dataSet, 'x00080070');
    const modelName = this.readDicomValue(dataSet, 'x00081090');
    const softwareVersions = this.readDicomValue(dataSet, 'x00181020');
    const studyIdTag = this.readDicomValue(dataSet, 'x00200010');
    const accessionNumber = this.readDicomValue(dataSet, 'x00080050');
    const rawStudyDate = this.readDicomValue(dataSet, 'x00080020');
    const rawStudyTime = this.readDicomValue(dataSet, 'x00080030');
    const sliceThickness = this.readDicomValue(dataSet, 'x00180050');
    const studyDateTime = this.formatUtcDateTime(
      this.parseDicomDateTime(dataSet.string('x00080020'), dataSet.string('x00080030')),
    );
    const compactStudyDateTime = this.formatCompactStudyDateTime(
      this.parseDicomDateTime(dataSet.string('x00080020'), dataSet.string('x00080030')),
    );
    const repetitionTime = this.readDicomValue(dataSet, 'x00180080');
    const echoTime = this.readDicomValue(dataSet, 'x00180081');
    const privateAcquisitionTime = this.readDicomValue(dataSet, 'x0051100a');
    const privateImageType = this.readDicomValue(dataSet, 'x00511016');
    const privateFieldOfView = this.readDicomValue(dataSet, 'x0051100c');
    const privateSpacing = this.readDicomValue(dataSet, 'x0051100d');
    const privateCoil = this.readDicomValue(dataSet, 'x0051100f');
    const privateOrientation = this.readDicomValue(dataSet, 'x0051100e');
    const privateSliceThickness = this.readDicomValue(dataSet, 'x00511017');
    const acquisitionDuration = this.formatDurationTag(
      this.readDicomValue(dataSet, 'x00189073') ?? this.readDicomValue(dataSet, 'x00181063'),
    );
    const pixelBandwidth = this.readDicomValue(dataSet, 'x00180095');
    const mrAcquisitionType = this.readDicomValue(dataSet, 'x00180023');
    const receiveCoilName = this.readDicomValue(dataSet, 'x00181250');
    const sequenceName = this.readDicomValue(dataSet, 'x00180024');
    const spacingBetweenSlices = this.readDicomValue(dataSet, 'x00180088');
    const imageOrientation = this.deriveImageOrientationLabel(dataSet);
    const patientPosition = this.readDicomValue(dataSet, 'x00185100');
    const instanceNumber = this.padTagNumber(this.readDicomValue(dataSet, 'x00200013'));
    const fieldOfView = privateFieldOfView ?? this.formatFieldOfView(dataSet, rows, columns);
    const imageTypeDescriptor =
      privateImageType ??
      this.readDicomValue(dataSet, 'x00080008')?.replace(/\\/g, '/');
    const acquisitionDescriptor = [modality === 'MR' ? 'MR' : modality, mrAcquisitionType]
      .filter(Boolean)
      .join('/');
    const diffusionDescriptor = [protocolName, imageTypeDescriptor]
      .filter((value) => value && value !== 'None')
      .join(' / ');
    const patientMetaLine = [birthday ? birthday.replace(/-/g, '') : null, patientSex, patientAge]
      .filter(Boolean)
      .join(' , ');
    const leftBottomTaLine = privateAcquisitionTime ?? (acquisitionDuration ? `TA ${acquisitionDuration}` : null);
    const leftBottomImageType = diffusionDescriptor || acquisitionDescriptor || imageTypeDescriptor;
    const rightBottomSpacing = privateSpacing ?? (spacingBetweenSlices ? `SP ${spacingBetweenSlices}` : null);
    const rightBottomSliceThickness = privateSliceThickness ?? (sliceThickness ? `SL ${sliceThickness}` : null);
    const rightBottomOrientation = privateOrientation ?? imageOrientation;
    const rightBottomCoil = privateCoil;
    const rightBottomSequence = sequenceName;
    const rightBottomWindowWidth = this.readFirstDicomValue(dataSet, 'x00281051');
    const rightBottomWindowCenter = this.readFirstDicomValue(dataSet, 'x00281050');

    return [
      this.compactTagLines([patientName, patientId, patientMetaLine, seriesDescription]),
      this.compactTagLines([
        studyIdTag ?? (compactStudyDateTime && modality ? `${modality}${compactStudyDateTime}` : compactStudyDateTime ?? modality),
        rawStudyDate,
        rawStudyTime,
        accessionNumber ?? instanceNumber,
        institution,
        modelName,
        softwareVersions,
        patientPosition,
      ]),
      this.compactTagLines([
        this.formatMeasurement('TR', repetitionTime),
        this.formatMeasurement('TE', echoTime),
        leftBottomTaLine,
        this.formatMeasurement('BW', pixelBandwidth),
        leftBottomImageType,
      ]),
      this.compactTagLines([
        rightBottomCoil ?? (receiveCoilName ? `C:${receiveCoilName}` : null),
        rightBottomSequence,
        rightBottomSpacing,
        rightBottomSliceThickness,
        fieldOfView,
        rightBottomOrientation,
        this.formatMeasurement('W', rightBottomWindowWidth),
        this.formatMeasurement('C', rightBottomWindowCenter),
        protocolName && protocolName !== 'None' ? protocolName : null,
        bodyPart,
        manufacturer,
        studyDateTime && !studyIdTag ? studyDateTime : null,
      ]),
    ];
  }

  private buildParsedDicomRecord(
    dataSet: dicomParser.DataSet,
    originalname: string,
    storagePath: string,
  ): ParsedDicomRecord {
    const patientId = this.normalizeText(dataSet.string('x00100020'));
    const patientName = this.normalizePatientName(dataSet.string('x00100010'));
    const sex = this.normalizeText(dataSet.string('x00100040'));
    const birthday = this.parseDicomDate(dataSet.string('x00100030'));
    const studyId = this.normalizeText(dataSet.string('x00200010'));
    const studyUid =
      this.normalizeText(dataSet.string('x0020000d')) ??
      this.buildFallbackUid('study', [patientId, patientName, studyId, this.normalizeText(dataSet.string('x00080020'))]);
    const seriesUid =
      this.normalizeText(dataSet.string('x0020000e')) ??
      this.buildFallbackUid('series', [studyUid, this.normalizeText(dataSet.string('x0008103e')), originalname]);
    const patientUid =
      patientId ??
      this.buildFallbackUid('patient', [
        patientName,
        sex,
        birthday ? birthday.toISOString().slice(0, 10) : null,
        studyUid,
      ]);

    return {
      patientUid,
      patientId,
      patientName,
      sex,
      birthday,
      studyUid,
      studyId,
      modality: this.normalizeText(dataSet.string('x00080060')),
      studyDate: this.parseDicomDateTime(dataSet.string('x00080020'), dataSet.string('x00080030')),
      studyDescription: this.normalizeText(dataSet.string('x00081030')),
      seriesUid,
      seriesDescription: this.normalizeText(dataSet.string('x0008103e')),
      hospitalName: this.normalizeText(dataSet.string('x00080080')),
      uploadedAt: this.parseDicomDateTime(dataSet.string('x00080020'), dataSet.string('x00080030')),
      storagePath,
      originalname,
    };
  }

  private parseDicomBuffer(buffer: Buffer, originalname: string, storagePath: string): ParsedDicomRecord {
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' });
    return this.buildParsedDicomRecord(dataSet, originalname, storagePath);
  }

  private async readDicomDataSetFromPath(filePath: string): Promise<dicomParser.DataSet> {
    const fileHandle = await open(filePath, 'r');
    try {
      const fileInfo = await fileHandle.stat();
      let targetSize = Math.min(Number(fileInfo.size), 256 * 1024);

      while (targetSize > 0) {
        const buffer = Buffer.allocUnsafe(targetSize);
        const { bytesRead } = await fileHandle.read(buffer, 0, targetSize, 0);

        try {
          return dicomParser.parseDicom(new Uint8Array(buffer.subarray(0, bytesRead)), { untilTag: 'x7fe00010' });
        } catch (error) {
          if (bytesRead >= Number(fileInfo.size)) {
            throw error;
          }
          targetSize = Math.min(Number(fileInfo.size), targetSize * 2);
        }
      }

      throw new Error('DICOM文件为空');
    } finally {
      await fileHandle.close();
    }
  }

  private async parseDicomFileFromPath(filePath: string, originalname: string, storagePath: string): Promise<ParsedDicomRecord> {
    const dataSet = await this.readDicomDataSetFromPath(filePath);
    return this.buildParsedDicomRecord(dataSet, originalname, storagePath);
  }

  private async moveFileToStorage(sourcePath: string, targetPath: string) {
    await mkdir(dirname(targetPath), { recursive: true });

    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      const maybeNodeError = error as { code?: string };
      if (maybeNodeError?.code !== 'EXDEV') {
        throw error;
      }
    }

    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }

  private async persistBatchFiles(requirementId: bigint, batchNo: number) {
    const batchRoot = join(this.uploadRoots[0], requirementId.toString(), `batch-${batchNo}`);
    await mkdir(batchRoot, { recursive: true });
    return { batchRoot };
  }

  private async persistUploadSessionStream(
    requirementId: bigint,
    sessionId: bigint,
    relativePath: string,
    stream: Readable,
    startByte: number,
  ) {
    const filePath = this.getUploadSessionFilePath(requirementId, sessionId, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    const writer = createWriteStream(filePath, {
      flags: startByte > 0 ? 'a' : 'w',
    });
    await pipeline(stream, writer);
    return filePath;
  }

  private async cleanupExpiredUploadSessions(force = false) {
    const now = Date.now();
    if (!force && now - this.lastUploadSessionCleanupAt < 5 * 60 * 1000) {
      return;
    }
    this.lastUploadSessionCleanupAt = now;

    const expiredBefore = new Date(now - this.uploadSessionRetentionMs);
    const expiredSessions = await this.prisma.uploadSession.findMany({
      where: {
        datasetBatchId: null,
        status: { in: ['pending', 'uploading', 'uploaded', 'failed'] },
        updatedAt: { lt: expiredBefore },
      },
      select: {
        id: true,
        storagePath: true,
      },
    });

    if (expiredSessions.length === 0) {
      return;
    }

    await Promise.all(
      expiredSessions.map((session) =>
        session.storagePath ? rm(session.storagePath, { force: true }).catch(() => undefined) : Promise.resolve(undefined),
      ),
    );

    await this.prisma.uploadSession.deleteMany({
      where: {
        id: {
          in: expiredSessions.map((session) => session.id),
        },
      },
    });
  }

  private async ensureUploadSessionQuota(userId: bigint, requirementId: bigint, nextFileSize: number) {
    if (nextFileSize > this.uploadSessionFileMaxBytes) {
      throw new BadRequestException(`单个上传文件不能超过 ${Math.floor(this.uploadSessionFileMaxBytes / 1024 / 1024)} MB`);
    }

    const reserved = await this.prisma.uploadSession.aggregate({
      where: {
        requirementId,
        uploadedBy: userId,
        datasetBatchId: null,
        status: { in: ['pending', 'uploading', 'uploaded', 'failed'] },
      },
      _sum: {
        fileSize: true,
      },
    });

    const reservedBytes = Number(reserved._sum.fileSize ?? 0n);
    if (reservedBytes + nextFileSize > this.uploadSessionQuotaBytes) {
      throw new BadRequestException(
        `当前需求单的暂存上传总量不能超过 ${Math.floor(this.uploadSessionQuotaBytes / 1024 / 1024 / 1024)} GB`,
      );
    }
  }

  private async readUploadedBinaryFile(file?: UploadedBinaryFile) {
    if (!file?.path) {
      throw new ForbiddenException('请上传有效的文件');
    }

    try {
      return await readFile(file.path);
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  async createUploadSession(userId: bigint, requirementId: bigint, role: UserRole, dto: CreateUploadSessionDto) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    await this.cleanupExpiredUploadSessions();

    const normalizedRelativePath = dto.relativePath.replace(/\\/g, '/').trim() || dto.fileName.trim();
    if (this.shouldIgnoreUploadedFile(normalizedRelativePath)) {
      throw new BadRequestException('隐藏文件不会被上传');
    }

    const fingerprint = this.buildUploadFingerprint(normalizedRelativePath, dto.fileSize, dto.lastModified);
    const existing = await this.prisma.uploadSession.findFirst({
      where: {
        requirementId,
        uploadedBy: userId,
        fingerprint,
        status: { in: ['pending', 'uploading', 'uploaded', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const uploadedSize = Number(existing.uploadedSize);
      const fileSize = Number(existing.fileSize);
      if (fileSize !== dto.fileSize || existing.relativePath !== normalizedRelativePath) {
        throw new ConflictException('发现同指纹但元数据不一致的上传记录，请更换文件后重试');
      }

      return {
        sessionId: existing.id.toString(),
        fileName: existing.fileName,
        relativePath: existing.relativePath,
        fileSize,
        uploadedSize,
        status: existing.status,
      };
    }

    await this.ensureUploadSessionQuota(userId, requirementId, dto.fileSize);

    const created = await this.prisma.uploadSession.create({
      data: {
        requirementId,
        uploadedBy: userId,
        fingerprint,
        fileName: dto.fileName.trim(),
        relativePath: normalizedRelativePath,
        mimeType: this.normalizeText(dto.mimeType),
        fileSize: BigInt(dto.fileSize),
        lastModifiedAt: dto.lastModified ? new Date(dto.lastModified) : null,
        storagePath: '',
      },
    });

    const storagePath = this.getUploadSessionFilePath(requirementId, created.id, normalizedRelativePath);
    await this.prisma.uploadSession.update({
      where: { id: created.id },
      data: { storagePath },
    });

    return {
      sessionId: created.id.toString(),
      fileName: created.fileName,
      relativePath: created.relativePath,
      fileSize: dto.fileSize,
      uploadedSize: 0,
      status: created.status,
    };
  }

  async getUploadSession(userId: bigint, requirementId: bigint, sessionId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    const session = await this.prisma.uploadSession.findFirst({
      where: {
        id: sessionId,
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
    });
    if (!session) {
      throw new NotFoundException('上传会话不存在');
    }

    return {
      sessionId: session.id.toString(),
      fileName: session.fileName,
      relativePath: session.relativePath,
      fileSize: Number(session.fileSize),
      uploadedSize: Number(session.uploadedSize),
      status: session.status,
      errorMessage: session.errorMessage,
    };
  }

  async uploadUploadSessionContent(
    userId: bigint,
    requirementId: bigint,
    sessionId: bigint,
    role: UserRole,
    startByte: number,
    stream: Readable,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    await this.cleanupExpiredUploadSessions();
    const session = await this.prisma.uploadSession.findFirst({
      where: {
        id: sessionId,
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
    });
    if (!session) {
      throw new NotFoundException('上传会话不存在');
    }
    if (session.status === 'consumed') {
      throw new BadRequestException('该上传会话已提交到批次，不能继续上传');
    }

    const currentSize = session.storagePath
      ? await stat(session.storagePath).then((value) => Number(value.size)).catch(() => 0)
      : 0;
    if (currentSize !== Number(session.uploadedSize)) {
      await this.prisma.uploadSession.update({
        where: { id: session.id },
        data: {
          uploadedSize: BigInt(currentSize),
          status: currentSize === Number(session.fileSize) ? 'uploaded' : currentSize > 0 ? 'uploading' : session.status,
        },
      });
    }
    if (currentSize !== startByte) {
      throw new ConflictException(`续传偏移不一致，期望从 ${currentSize} 开始`);
    }

    const storagePath = session.storagePath || this.getUploadSessionFilePath(requirementId, session.id, session.relativePath);
    await this.persistUploadSessionStream(requirementId, session.id, session.relativePath, stream, startByte);

    const nextSize = await stat(storagePath).then((value) => Number(value.size));
    if (nextSize > Number(session.fileSize)) {
      throw new BadRequestException('上传内容超过文件声明大小');
    }

    const nextStatus = nextSize === Number(session.fileSize) ? 'uploaded' : 'uploading';
    const updated = await this.prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        storagePath,
        uploadedSize: BigInt(nextSize),
        status: nextStatus,
        errorMessage: null,
      },
    });

    return {
      sessionId: updated.id.toString(),
      uploadedSize: Number(updated.uploadedSize),
      fileSize: Number(updated.fileSize),
      status: updated.status,
    };
  }

  async createRequirementOssFile(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateRequirementOssFileDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    if (dto.kind === RequirementOssFileKindDto.dicom && dto.fileSize > RequirementsService.MAX_SINGLE_DICOM_FILE_BYTES) {
      throw new BadRequestException('单个 DICOM 文件不能超过 10GB');
    }
    const { bucket } = this.ensureOssConfigured();
    const objectKey = this.buildRequirementOssObjectKey(requirementId, dto);
    const normalizedMimeType = this.normalizeText(dto.mimeType) ?? 'application/octet-stream';

    const created = await this.prisma.requirementOssFile.create({
      data: {
        requirementId,
        uploadedBy: userId,
        kind: dto.kind,
        status: RequirementOssFileStatus.pending_upload,
        objectKey,
        bucketName: bucket,
        originalFileName: dto.fileName.trim(),
        mimeType: normalizedMimeType,
        fileSize: BigInt(dto.fileSize),
        modelName: dto.kind === RequirementOssFileKindDto.model ? this.normalizeText(dto.modelName) : null,
        modelVersion: dto.kind === RequirementOssFileKindDto.model ? this.normalizeText(dto.modelVersion) : null,
      },
    });

    const signed = this.buildOssSignedUrl('PUT', objectKey, this.ossUploadUrlExpiresSeconds, normalizedMimeType);

    return {
      fileId: created.id.toString(),
      kind: created.kind,
      status: created.status,
      objectKey: created.objectKey,
      bucketName: created.bucketName,
      fileName: created.originalFileName,
      fileSize: Number(created.fileSize),
      mimeType: created.mimeType,
      upload: {
        method: 'PUT',
        url: signed.url,
        headers: {
          'Content-Type': normalizedMimeType,
        },
        expiresAt: signed.expiresAt,
      },
    };
  }

  async listRequirementOssFiles(userId: bigint, requirementId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    const items = await this.prisma.requirementOssFile.findMany({
      where: {
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.mapRequirementOssFile(item));
  }

  async completeRequirementOssFileUpload(
    userId: bigint,
    requirementId: bigint,
    fileId: bigint,
    role: UserRole,
    dto: ConfirmRequirementOssFileDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    const file = await this.prisma.requirementOssFile.findFirst({
      where: {
        id: fileId,
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
    });
    if (!file) {
      throw new NotFoundException('OSS 文件记录不存在');
    }

    if (dto.fileSize && dto.fileSize !== Number(file.fileSize)) {
      throw new ConflictException('上传完成确认的文件大小与申请上传时不一致');
    }

    const nextStatus =
      file.kind === RequirementOssFileKind.dicom ? RequirementOssFileStatus.uploaded : RequirementOssFileStatus.parsed;
    const completed = await this.prisma.requirementOssFile.update({
      where: { id: file.id },
      data: {
        status: nextStatus,
        etag: this.normalizeText(dto.etag),
        uploadCompletedAt: new Date(),
        pulledToLocalAt: null,
        parsedAt: file.kind === RequirementOssFileKind.dicom ? null : new Date(),
        ossDeletedAt: null,
        ossDeleteError: null,
        errorMessage: null,
      },
    });

    return this.mapRequirementOssFile(completed);
  }

  async authorizeRequirementOssFileDownload(userId: bigint, requirementId: bigint, fileId: bigint, role: UserRole) {
    if (role !== UserRole.admin) {
      throw new ForbiddenException('仅管理员可以下载 OSS 原始文件');
    }
    await this.ensureRequirementAccess(userId, requirementId, role);
    const file = await this.prisma.requirementOssFile.findFirst({
      where: {
        id: fileId,
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
    });
    if (!file) {
      throw new NotFoundException('OSS 文件记录不存在');
    }
    if (file.status !== RequirementOssFileStatus.uploaded && file.status !== RequirementOssFileStatus.parsed) {
      throw new BadRequestException('当前文件还不能下载');
    }

    if (file.ossDeletedAt) {
      throw new BadRequestException('OSS 原始文件已回收，无法再次下载');
    }

    const signed = this.buildOssSignedUrl('GET', file.objectKey, this.ossDownloadUrlExpiresSeconds);

    return {
      fileId: file.id.toString(),
      fileName: file.originalFileName,
      objectKey: file.objectKey,
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  private async buildStagedFilesFromRequirementOssFiles(
    files: Array<{
      objectKey: string;
      originalFileName: string;
    }>,
  ) {
    return this.mapWithConcurrency(files, 3, async (file, index) => {
      const tempDir = await mkdtemp(join(tmpdir(), 'campcloud-oss-batch-'));
      const fileName = this.sanitizeFilename(file.originalFileName, index);
      const filePath = join(tempDir, fileName);
      const download = this.buildOssSignedUrl('GET', file.objectKey, this.ossDownloadUrlExpiresSeconds);
      await this.downloadUrlToFile(download.url, filePath);
      return {
        originalname: file.originalFileName,
        path: filePath,
      };
    });
  }

  private async deleteRequirementOssObject(objectKey: string) {
    const signed = this.buildOssSignedUrl('DELETE', objectKey, this.ossDownloadUrlExpiresSeconds);
    await this.deleteUrl(signed.url);
  }

  private async cleanupRequirementOssFiles(
    files: Array<{
      id: bigint;
      objectKey: string;
    }>,
  ) {
    const pulledToLocalAt = new Date();

    await this.prisma.requirementOssFile.updateMany({
      where: { id: { in: files.map((file) => file.id) } },
      data: {
        pulledToLocalAt,
        ossDeleteError: null,
      },
    });

    await this.mapWithConcurrency(files, 3, async (file) => {
      try {
        await this.deleteRequirementOssObject(file.objectKey);
        await this.prisma.requirementOssFile.update({
          where: { id: file.id },
          data: {
            ossDeletedAt: new Date(),
            ossDeleteError: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 255) : '删除 OSS 原始文件失败';
        await this.prisma.requirementOssFile.update({
          where: { id: file.id },
          data: {
            ossDeleteError: message,
          },
        });
      }
    });
  }

  private async parseRequirementOssFile(fileId: bigint) {
    const file = await this.prisma.requirementOssFile.findUnique({
      where: { id: fileId },
    });
    if (!file || file.kind !== RequirementOssFileKind.dicom) {
      return;
    }

    await this.prisma.requirementOssFile.update({
      where: { id: file.id },
      data: {
        status: RequirementOssFileStatus.parsing,
        errorMessage: null,
      },
    });

    try {
      const download = this.buildOssSignedUrl('GET', file.objectKey, this.ossDownloadUrlExpiresSeconds);
      const buffer = await this.fetchUrlBuffer(download.url);
      const parsed = this.parseDicomBuffer(buffer, file.originalFileName, file.objectKey);
      const parsedObjectKey = `dicom/parsed/${file.requirementId.toString()}/${file.id.toString()}.json`;
      const payload = {
        fileId: file.id.toString(),
        requirementId: file.requirementId.toString(),
        objectKey: file.objectKey,
        parsedAt: new Date().toISOString(),
        dicom: {
          patientUid: parsed.patientUid,
          patientId: parsed.patientId,
          patientName: parsed.patientName,
          sex: parsed.sex,
          birthday: this.formatUtcDate(parsed.birthday),
          studyUid: parsed.studyUid,
          studyId: parsed.studyId,
          modality: parsed.modality,
          studyDate: this.formatUtcDateTime(parsed.studyDate),
          studyDescription: parsed.studyDescription,
          seriesUid: parsed.seriesUid,
          seriesDescription: parsed.seriesDescription,
          hospitalName: parsed.hospitalName,
          uploadedAt: this.formatUtcDateTime(parsed.uploadedAt),
        },
      };

      const upload = this.buildOssSignedUrl('PUT', parsedObjectKey, this.ossUploadUrlExpiresSeconds, 'application/json');
      await this.putBufferToUrl(upload.url, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), 'application/json');

      await this.prisma.requirementOssFile.update({
        where: { id: file.id },
        data: {
          status: RequirementOssFileStatus.parsed,
          parsedObjectKey,
          parsedPayload: payload,
          parsedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 255) : 'DICOM 解析失败';
      await this.prisma.requirementOssFile.update({
        where: { id: file.id },
        data: {
          status: RequirementOssFileStatus.failed,
          errorMessage: message,
        },
      });
    }
  }

  private async persistDeliveryFile(
    requirementId: bigint,
    originalname: string,
    sourcePath: string,
    modelKeyBase64: string,
  ) {
    const deliveryRoot = join(this.deliveryRoots[0], requirementId.toString());
    await mkdir(deliveryRoot, { recursive: true });
    const extension = extname(originalname).toLowerCase();
    const baseName = originalname.slice(0, originalname.length - extension.length) || 'delivery';
    const fileName = `${Date.now()}_${this.sanitizePathSegment(baseName)}.model`;
    const filePath = join(deliveryRoot, fileName);
    const modelKey = Buffer.from(modelKeyBase64, 'base64');
    const iv = randomBytes(ENCRYPTED_MODEL_IV_LENGTH);
    const cipher = createCipheriv('aes-256-cbc', modelKey, iv);
    const fileContentPrefix = Buffer.concat([
      ENCRYPTED_MODEL_MAGIC,
      Buffer.from([ENCRYPTED_MODEL_VERSION]),
      iv,
    ]);
    const modelSha256 = createHash('sha256');
    modelSha256.update(fileContentPrefix);
    await writeFile(filePath, fileContentPrefix);

    const hashStream = new Transform({
      transform: (chunk, _encoding, callback) => {
        modelSha256.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        createReadStream(sourcePath),
        cipher,
        hashStream,
        createWriteStream(filePath, { flags: 'a' }),
      );

      await this.writeEncryptedModelMetadata(filePath, {
        version: ENCRYPTED_MODEL_VERSION,
        requirementId: requirementId.toString(),
        deliveryId: null,
        authorizedUserId: null,
        authorizedUsername: null,
        authorizedHospitalName: null,
        originalFileName: originalname,
        encryptedFileName: fileName,
        modelSha256: modelSha256.digest('hex'),
        modelKey: modelKeyBase64,
        createdAt: new Date().toISOString(),
      });
      return { filePath, fileName };
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => undefined);
      await rm(getEncryptedModelSidecarPath(filePath), { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await rm(sourcePath, { force: true }).catch(() => undefined);
    }
  }

  private async writeEncryptedModelMetadata(filePath: string, metadata: EncryptedModelMetadata) {
    await writeFile(getEncryptedModelSidecarPath(filePath), JSON.stringify(metadata, null, 2), 'utf8');
  }

  private async readEncryptedModelMetadata(filePath: string) {
    const metadataPath = getEncryptedModelSidecarPath(filePath);
    const raw = await readFile(metadataPath, 'utf8');
    return JSON.parse(raw) as EncryptedModelMetadata;
  }

  private async finalizeParsedDatasetBatch(
    batch: {
      id: bigint;
      batchNo: number;
      uploadedAt: Date;
    },
    requirementId: bigint,
    remark: string | null | undefined,
    parsedRecords: ParsedDicomRecord[],
    failedCount: number,
  ) {

    if (parsedRecords.length === 0) {
      await this.prisma.datasetBatch.update({
        where: { id: batch.id },
        data: {
          status: 'failed',
          remark: remark?.trim() ? `${remark.trim()}；全部文件解析失败` : '全部文件解析失败',
        },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const record of parsedRecords) {
        const patient = await tx.patient.upsert({
          where: {
            requirementId_patientUid: {
              requirementId,
              patientUid: record.patientUid,
            },
          },
          update: {
            patientId: record.patientId ?? undefined,
            patientName: record.patientName ?? undefined,
            sex: record.sex ?? undefined,
            birthday: record.birthday ?? undefined,
            imageCount: { increment: 1 },
          },
          create: {
            requirementId,
            patientUid: record.patientUid,
            patientId: record.patientId,
            patientName: record.patientName,
            sex: record.sex,
            birthday: record.birthday,
            imageCount: 1,
          },
        });

        const study = await tx.study.upsert({
          where: {
            patientId_studyUid: {
              patientId: patient.id,
              studyUid: record.studyUid,
            },
          },
          update: {
            studyId: record.studyId ?? undefined,
            modality: record.modality ?? undefined,
            studyDate: record.studyDate ?? undefined,
            studyDescription: record.studyDescription ?? undefined,
          },
          create: {
            patientId: patient.id,
            studyUid: record.studyUid,
            studyId: record.studyId,
            modality: record.modality,
            studyDate: record.studyDate,
            studyDescription: record.studyDescription,
          },
        });

        await tx.series.upsert({
          where: {
            studyId_seriesUid_datasetBatchId: {
              studyId: study.id,
              seriesUid: record.seriesUid,
              datasetBatchId: batch.id,
            },
          },
          update: {
            seriesDescription: record.seriesDescription ?? undefined,
            hospitalName: record.hospitalName ?? undefined,
            remark: remark?.trim() || null,
            imageCount: { increment: 1 },
            storagePath: record.storagePath,
          },
          create: {
            studyId: study.id,
            datasetBatchId: batch.id,
            seriesUid: record.seriesUid,
            seriesDescription: record.seriesDescription,
            hospitalName: record.hospitalName,
            remark: remark?.trim() || null,
            imageCount: 1,
            storagePath: record.storagePath,
          },
        });
      }

      const patientIds = [...new Set(parsedRecords.map((record) => record.patientUid))];
      for (const patientUid of patientIds) {
        const patient = await tx.patient.findUnique({
          where: {
            requirementId_patientUid: {
              requirementId,
              patientUid,
            },
          },
          select: { id: true },
        });

        if (!patient) {
          continue;
        }

        const studies = await tx.study.findMany({
          where: { patientId: patient.id },
          select: { id: true },
        });

        for (const study of studies) {
          const seriesCount = await tx.series.count({ where: { studyId: study.id } });
          await tx.study.update({
            where: { id: study.id },
            data: { seriesCount },
          });
        }
      }

      await tx.datasetBatch.update({
        where: { id: batch.id },
        data: {
          status: 'parsed',
          remark:
            failedCount > 0 ? [remark?.trim(), `${failedCount} 个文件解析失败`].filter(Boolean).join('；') : remark?.trim() || null,
        },
      });
    });
  }

  private async processDatasetBatchFromStagedFiles(
    batch: {
      id: bigint;
      batchNo: number;
      uploadedAt: Date;
    },
    requirementId: bigint,
    remark: string | null | undefined,
    files: StagedUploadFile[],
  ) {
    const { batchRoot } = await this.persistBatchFiles(requirementId, batch.batchNo);
    const parsedRecords: ParsedDicomRecord[] = [];
    const failedFiles: FailedDatasetFileRecord[] = [];
    let failedCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (this.shouldIgnoreUploadedFile(file.originalname)) {
        continue;
      }

      let movedToFinalStorage = false;

      try {
        const tempRecord = await this.parseDicomFileFromPath(file.path, file.originalname, '');
        const seriesDir = join(batchRoot, this.sanitizePathSegment(tempRecord.seriesUid));
        const filename = this.sanitizeFilename(file.originalname, index);
        const storagePath = join(seriesDir, filename);
        await this.moveFileToStorage(file.path, storagePath);
        movedToFinalStorage = true;
        parsedRecords.push({ ...tempRecord, storagePath });
      } catch (error) {
        failedCount += 1;
        failedFiles.push({
          originalName: file.originalname,
          reason: error instanceof Error ? error.message : 'DICOM解析失败',
        });
      } finally {
        if (!movedToFinalStorage) {
          await rm(file.path, { force: true }).catch(() => undefined);
        }
      }
    }

    await this.writeFailedDatasetFilesManifest(requirementId, batch.batchNo, failedFiles);
    await this.finalizeParsedDatasetBatch(batch, requirementId, remark, parsedRecords, failedCount);
  }

  private async persistManualAnalysisBatchFiles(
    batch: {
      id: bigint;
      batchNo: number;
    },
    requirementId: bigint,
    remark: string | null | undefined,
    files: Array<{
      relativePath: string;
      storagePath: string;
      onPersisted?: (targetPath: string) => Promise<void>;
    }>,
  ) {
    const batchRoot = this.getDatasetBatchRoot(requirementId, batch.batchNo);
    await mkdir(batchRoot, { recursive: true });

    for (const file of files) {
      const relativeStoragePath = this.sanitizeRelativeStoragePath(file.relativePath) || 'file.zip';
      const targetPath = join(batchRoot, relativeStoragePath);
      await this.moveFileToStorage(file.storagePath, targetPath);
      await file.onPersisted?.(targetPath);
    }

    await this.writeFailedDatasetFilesManifest(requirementId, batch.batchNo, []);
    await this.prisma.datasetBatch.update({
      where: { id: batch.id },
      data: {
        status: 'parsed',
        remark: this.buildManualAnalysisRemark(remark),
      },
    });
  }

  private async persistManualAnalysisBatchFromStagedFiles(
    batch: {
      id: bigint;
      batchNo: number;
    },
    requirementId: bigint,
    remark: string | null | undefined,
    sessions: Array<{
      id: bigint;
      relativePath: string;
      storagePath: string;
    }>,
  ) {
    await this.persistManualAnalysisBatchFiles(
      batch,
      requirementId,
      remark,
      sessions.map((session) => ({
        relativePath: session.relativePath,
        storagePath: session.storagePath,
        onPersisted: async (targetPath: string) => {
          await this.prisma.uploadSession.update({
            where: { id: session.id },
            data: { storagePath: targetPath },
          });
        },
      })),
    );
  }

  async create(userId: bigint, dto: CreateRequirementDto) {
    const expectedGoal = this.normalizeText(dto.expectedGoal);
    if (!expectedGoal) {
      throw new BadRequestException('期望目标不能为空');
    }

    const requirement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.requirement.create({
        data: {
          userId,
          type: dto.type,
          typeCustom: dto.typeCustom ?? null,
          title: dto.title,
          description: dto.description,
          expectedGoal,
          remark: dto.remark,
          status: RequirementStatus.pending,
          submittedAt: new Date(),
        },
      });

      await tx.requirementStatusLog.create({
        data: {
          requirementId: created.id,
          fromStatus: null,
          toStatus: RequirementStatus.pending,
          changedBy: userId,
          changedRole: UserRole.user,
          reason: 'Requirement created',
        },
      });

      const admins = await tx.user.findMany({
        where: {
          role: UserRole.admin,
          id: { not: userId },
        },
        select: { id: true },
      });

      await this.createNotifications(
        tx,
        admins.map((item) => item.id),
        created.id,
        'new_requirement',
        '收到新的用户需求，请在管理侧查看',
        `新需求「${created.title}」已提交，请及时处理。`,
      );

      await this.mailService.queueRequirementAdminNotifications(tx, {
        requirementId: created.id,
        type: 'new_requirement',
        subject: '【AICampCloud】收到新的用户需求',
        requirementTitle: created.title,
        actionLabel: '新需求提交',
        summary: `新需求《${created.title}》已提交，请及时处理。`,
        excludeUserIds: [userId],
      });

      return created;
    });

    return {
      id: requirement.id.toString(),
      type: requirement.type,
      typeCustom: requirement.typeCustom,
      title: requirement.title,
      description: requirement.description,
      expectedGoal: requirement.expectedGoal,
      remark: requirement.remark,
      status: requirement.status,
      createdAt: requirement.createdAt,
    };
  }

  async list(userId: bigint, role: UserRole, query: ListRequirementsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.RequirementWhereInput = {
      ...(role === UserRole.admin ? {} : { userId }),
      ...(query.type ? { type: query.type } : {}),
      ...(role === UserRole.admin && query.hospitalName
        ? {
            user: {
              hospitalName: { contains: query.hospitalName },
            },
          }
        : {}),
      ...(query.status ? { status: query.status as RequirementStatus } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { description: { contains: query.keyword } },
              { type: { contains: query.keyword } },
            ],
          }
        : {}),
    };

    const [total, requirements] = await this.prisma.$transaction([
      this.prisma.requirement.count({ where }),
      this.prisma.requirement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              hospitalName: true,
            },
          },
        },
      }),
    ]);

    const items = await Promise.all(
      requirements.map(async (requirement) => {
        const [patientCount, studyCount, seriesCount, unreadNotificationCount] = await Promise.all([
          this.prisma.patient.count({ where: { requirementId: requirement.id } }),
          this.prisma.study.count({ where: { patient: { requirementId: requirement.id } } }),
          this.prisma.series.count({
            where: { study: { patient: { requirementId: requirement.id } } },
          }),
          this.prisma.notification.count({
            where: {
              userId,
              requirementId: requirement.id,
              isRead: false,
            },
          }),
        ]);

        return {
          id: requirement.id.toString(),
          title: requirement.title,
          type: requirement.type,
          status: requirement.status,
          createdAt: requirement.createdAt,
          latestMessageAt: requirement.latestMessageAt,
          patientCount,
          studyCount,
          seriesCount,
          unreadNotificationCount,
          creator: {
            id: requirement.user.id.toString(),
            username: requirement.user.username,
            hospitalName: requirement.user.hospitalName,
          },
          needsAdminReply: role === UserRole.admin ? unreadNotificationCount > 0 : false,
          pendingReplyMessageCount: role === UserRole.admin ? unreadNotificationCount : 0,
        };
      }),
    );

    return {
      list: items,
      total,
      page,
      pageSize,
    };
  }

  async detail(userId: bigint, requirementId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const requirement = await this.prisma.requirement.findUniqueOrThrow({
      where: { id: requirementId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            hospitalName: true,
            role: true,
            profile: true,
          },
        },
      },
    });

    const [patientCount, studyCount, seriesCount, latestMessage, latestDelivery] = await Promise.all([
      this.prisma.patient.count({ where: { requirementId } }),
      this.prisma.study.count({ where: { patient: { requirementId } } }),
      this.prisma.series.count({ where: { study: { patient: { requirementId } } } }),
      this.prisma.message.findFirst({
        where: { requirementId },
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { id: true, username: true, role: true } } },
      }),
      this.prisma.delivery.findFirst({
        where: { requirementId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      id: requirement.id.toString(),
      type: requirement.type,
      typeCustom: requirement.typeCustom,
      title: requirement.title,
      description: requirement.description,
      expectedGoal: requirement.expectedGoal,
      remark: requirement.remark,
      status: requirement.status,
      latestMessageAt: requirement.latestMessageAt,
      latestDeliveryAt: requirement.latestDeliveryAt,
      submittedAt: requirement.submittedAt,
      createdAt: requirement.createdAt,
      updatedAt: requirement.updatedAt,
      creator: {
        id: requirement.user.id.toString(),
        username: requirement.user.username,
        role: requirement.user.role,
        hospitalName: requirement.user.hospitalName,
        profile: requirement.user.profile
          ? {
              realName: requirement.user.profile.realName,
              email: requirement.user.profile.email,
              phone: requirement.user.profile.phone,
              wechat: requirement.user.profile.wechat,
              department: requirement.user.profile.department,
              title: requirement.user.profile.title,
            }
          : null,
      },
      stats: {
        patientCount,
        studyCount,
        seriesCount,
      },
      latestMessage: latestMessage
        ? {
            id: latestMessage.id.toString(),
            content: latestMessage.content,
            createdAt: latestMessage.createdAt,
            sender: {
              id: latestMessage.sender.id.toString(),
              username: latestMessage.sender.username,
              role: latestMessage.sender.role,
            },
          }
        : null,
      latestDelivery: latestDelivery
        ? {
            id: latestDelivery.id.toString(),
            title: latestDelivery.title,
            fileName: latestDelivery.fileName,
            isFinal: latestDelivery.isFinal,
            createdAt: latestDelivery.createdAt,
          }
        : null,
    };
  }

  async listMessages(userId: bigint, requirementId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const messages = await this.prisma.message.findMany({
      where: { requirementId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            role: true,
            hospitalName: true,
          },
        },
      },
    });

    return messages.map((item) => ({
      id: item.id.toString(),
      content: item.content,
      createdAt: item.createdAt,
      sender: {
        id: item.sender.id.toString(),
        username: item.sender.role === UserRole.admin ? '影动' : item.sender.username,
        role: item.sender.role,
        hospitalName: item.sender.hospitalName,
      },
    }));
  }

  async listDeliveries(userId: bigint, requirementId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const deliveries = await this.prisma.delivery.findMany({
      where: { requirementId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    });

    return deliveries.map((item) => ({
      id: item.id.toString(),
      title: item.title,
      description: item.description,
      fileName: item.fileName,
      isFinal: item.isFinal,
      createdAt: item.createdAt,
      uploader: {
        id: item.uploader.id.toString(),
        username: item.uploader.role === UserRole.admin ? '影动' : item.uploader.username,
        role: item.uploader.role,
      },
    }));
  }

  async createDelivery(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDeliveryDto,
    file?: UploadedBinaryFile,
  ) {
    const cleanupTempFile = async () => {
      if (file?.path) {
        await rm(file.path, { force: true }).catch(() => undefined);
      }
    };

    if (role !== UserRole.admin) {
      await cleanupTempFile();
      throw new ForbiddenException('仅管理员可上传交付');
    }

    const title = dto.title.trim();
    if (!title) {
      await cleanupTempFile();
      throw new BadRequestException('交付标题不能为空');
    }
    if (!file?.path || !file.originalname) {
      await cleanupTempFile();
      throw new BadRequestException('请上传交付文件');
    }
    if (extname(file.originalname).toLowerCase() !== '.pth') {
      await cleanupTempFile();
      throw new BadRequestException('仅支持上传 .pth 格式算法文件');
    }

    return this.prisma.$transaction(async (tx) => {
        const requirement = await tx.requirement.findUnique({
          where: { id: requirementId },
          select: {
            id: true,
            userId: true,
            title: true,
            status: true,
            user: {
              select: {
                username: true,
                hospitalName: true,
              },
            },
          },
        });

        if (!requirement) {
          throw new NotFoundException('需求单不存在');
        }

        const description = this.normalizeText(dto.description);
        const isFinal = Boolean(dto.isFinal);
        const configuredModelKey = await getConfiguredLicenseKeyForUser(requirement.userId);
        const persistedFile = await this.persistDeliveryFile(
          requirementId,
          file.originalname,
          file.path,
          configuredModelKey,
        );

        try {
          const created = await tx.delivery.create({
            data: {
              requirementId,
              uploadedBy: userId,
              title,
              description,
              fileName: persistedFile.fileName,
              fileUrl: persistedFile.filePath,
              isFinal,
            },
            include: {
              uploader: {
                select: {
                  id: true,
                  username: true,
                  role: true,
                },
              },
            },
          });

          const nextStatus = isFinal ? RequirementStatus.completed : requirement.status;

          await tx.requirement.update({
            where: { id: requirementId },
            data: {
              latestDeliveryAt: created.createdAt,
              ...(nextStatus !== requirement.status ? { status: nextStatus } : {}),
            },
          });

          if (nextStatus !== requirement.status) {
            await tx.requirementStatusLog.create({
              data: {
                requirementId,
                fromStatus: requirement.status,
                toStatus: nextStatus,
                changedBy: userId,
                changedRole: role,
                reason: '管理员已上传最终交付，需求自动完成',
              },
            });
          }

          const notificationTitle = isFinal ? '您的需求已完成最终交付，请在详情页查看' : '您的需求有新的交付，请在详情页查看';
          const notificationContent = isFinal
            ? `需求「${requirement.title}」已收到最终交付：${title}`
            : `需求「${requirement.title}」已收到新的交付：${title}`;
          await this.createNotifications(tx, [requirement.userId], requirementId, 'delivery', notificationTitle, notificationContent);
          await this.mailService.queueRequirementUserNotification(tx, {
            requirementId,
            type: 'delivery',
            subject: isFinal ? '【AICampCloud】您的需求已收到最终交付' : '【AICampCloud】您的需求有新交付',
            requirementTitle: requirement.title,
            actionLabel: isFinal ? '最终交付' : '新增交付',
            summary: notificationContent,
          });

          const metadata = await this.readEncryptedModelMetadata(persistedFile.filePath);
          await this.writeEncryptedModelMetadata(persistedFile.filePath, {
            ...metadata,
            deliveryId: created.id.toString(),
            authorizedUserId: requirement.userId.toString(),
            authorizedUsername: requirement.user?.username ?? null,
            authorizedHospitalName: requirement.user?.hospitalName ?? null,
          });

          return {
            id: created.id.toString(),
            requirementTitle: requirement.title,
            title: created.title,
            description: created.description,
            fileName: created.fileName,
            isFinal: created.isFinal,
            createdAt: created.createdAt,
            uploader: {
              id: created.uploader.id.toString(),
              username: created.uploader.username,
              role: created.uploader.role,
            },
          };
        } catch (error) {
          await rm(persistedFile.filePath, { force: true });
          await rm(getEncryptedModelSidecarPath(persistedFile.filePath), { force: true });
          throw error;
        }
      });
  }

  async createMessage(userId: bigint, requirementId: bigint, role: UserRole, dto: CreateMessageDto) {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('留言内容不能为空');
    }

    return this.prisma.$transaction(async (tx) => {
      const requirement = await tx.requirement.findUnique({
        where: { id: requirementId },
        select: { id: true, userId: true, title: true, status: true },
      });

      if (!requirement) {
        throw new NotFoundException('需求单不存在');
      }

      if (role !== UserRole.admin && requirement.userId !== userId) {
        throw new ForbiddenException('无权访问该需求单');
      }

      const created = await tx.message.create({
        data: {
          requirementId,
          senderId: userId,
          senderRole: role,
          content,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              role: true,
              hospitalName: true,
            },
          },
        },
      });

      const nextRequirementStatus =
        role === UserRole.user && requirement.status === RequirementStatus.waiting_user
          ? RequirementStatus.processing
          : requirement.status;

      await tx.requirement.update({
        where: { id: requirementId },
        data: {
          latestMessageAt: created.createdAt,
          ...(nextRequirementStatus !== requirement.status ? { status: nextRequirementStatus } : {}),
        },
      });

      if (nextRequirementStatus !== requirement.status) {
        await tx.requirementStatusLog.create({
          data: {
            requirementId,
            fromStatus: requirement.status,
            toStatus: nextRequirementStatus,
            changedBy: userId,
            changedRole: role,
            reason: '用户已补充所需数据，需求继续处理中',
          },
        });
      }

      const notificationTitle =
        role === UserRole.admin ? '您的需求有回复了，请在消息通知栏目查看' : '收到新的需求补充，请尽快处理';
      const notificationContent =
        role === UserRole.admin
          ? `需求「${requirement.title}」收到影动回复：${this.summarizeNotificationContent(content)}`
          : `${created.sender.username} 补充了需求留言：${this.summarizeNotificationContent(content)}`;

      if (role === UserRole.admin) {
        await this.createNotifications(tx, [requirement.userId], requirementId, 'message_reply', notificationTitle, notificationContent);
        await this.mailService.queueRequirementUserNotification(tx, {
          requirementId,
          type: 'message_reply',
          subject: '【AICampCloud】您的需求有新留言',
          requirementTitle: requirement.title,
          actionLabel: '管理员留言',
          summary: notificationContent,
        });
      } else {
        const admins = await tx.user.findMany({
          where: { role: UserRole.admin },
          select: { id: true },
        });
        await this.createNotifications(
          tx,
          admins.map((item) => item.id),
          requirementId,
          'message_reply',
          notificationTitle,
          notificationContent,
        );
        await this.mailService.queueRequirementAdminNotifications(tx, {
          requirementId,
          type: 'message_reply',
          subject: '【AICampCloud】收到新的需求补充消息',
          requirementTitle: requirement.title,
          actionLabel: '用户补充消息',
          summary: notificationContent,
        });
      }

      return {
        id: created.id.toString(),
        requirementTitle: requirement.title,
        content: created.content,
        createdAt: created.createdAt,
        sender: {
          id: created.sender.id.toString(),
          username: created.sender.username,
          role: created.sender.role,
          hospitalName: created.sender.hospitalName,
        },
      };
    });
  }

  async updateStatus(userId: bigint, requirementId: bigint, role: UserRole, dto: UpdateRequirementStatusDto) {
    if (role !== UserRole.admin) {
      throw new ForbiddenException('仅管理员可更新需求状态');
    }
    if (dto.status === RequirementStatus.pending) {
      throw new BadRequestException('管理侧不支持将需求状态更新为待我响应');
    }

    const reason = this.normalizeText(dto.reason);

    return this.prisma.$transaction(async (tx) => {
      const requirement = await tx.requirement.findUnique({
        where: { id: requirementId },
        select: {
          id: true,
          userId: true,
          title: true,
          status: true,
        },
      });

      if (!requirement) {
        throw new NotFoundException('需求单不存在');
      }

      const updated = await tx.requirement.update({
        where: { id: requirementId },
        data: { status: dto.status },
      });

      await tx.requirementStatusLog.create({
        data: {
          requirementId,
          fromStatus: requirement.status,
          toStatus: dto.status,
          changedBy: userId,
          changedRole: role,
          reason,
        },
      });

      const content = reason
        ? `需求「${requirement.title}」状态已更新为 ${this.renderRequirementStatusLabel(dto.status)}，说明：${reason}`
        : `需求「${requirement.title}」状态已更新为 ${this.renderRequirementStatusLabel(dto.status)}`;
      await this.createNotifications(
        tx,
        [requirement.userId],
        requirementId,
        'status_update',
        '您的需求状态有更新，请在消息通知栏目查看',
        content,
      );
      await this.mailService.queueRequirementUserNotification(tx, {
        requirementId,
        type: 'status_update',
        subject: '【AICampCloud】您的需求状态已更新',
        requirementTitle: requirement.title,
        actionLabel: '状态更新',
        summary: content,
      });

      return {
        id: updated.id.toString(),
        requirementTitle: requirement.title,
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    });
  }

  async downloadDeliveryFile(
    userId: bigint,
    requirementId: bigint,
    deliveryId: bigint,
    role: UserRole,
    licenseFile?: UploadedBinaryFile,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        requirementId,
      },
      select: {
        fileUrl: true,
        fileName: true,
      },
    });

    if (!delivery?.fileUrl || !delivery.fileName) {
      throw new NotFoundException('交付文件不存在');
    }

    const safeFilePath = this.ensureSafeDeliveryPath(delivery.fileUrl);
    try {
      await stat(safeFilePath);
    } catch {
      throw new NotFoundException('交付文件不存在');
    }

    if (role !== UserRole.admin) {
      if (!licenseFile?.path) {
        throw new ForbiddenException('请上传有效的 license 文件后再下载');
      }
      const licenseBuffer = await this.readUploadedBinaryFile(licenseFile);
      const metadata = await this.readEncryptedModelMetadata(safeFilePath).catch(() => null);
      if (!metadata) {
        throw new NotFoundException('加密模型元数据不存在');
      }
      await validateModelLicenseFile(licenseBuffer, userId, requirementId, deliveryId, metadata);
    }

    return {
      path: safeFilePath,
      fileName: delivery.fileName,
    };
  }

  async verifyDeliveryLicense(
    userId: bigint,
    requirementId: bigint,
    deliveryId: bigint,
    role: UserRole,
    licenseFile?: UploadedBinaryFile,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    if (role === UserRole.admin) {
      return {
        success: true,
        message: '管理员下载不需要 license 校验',
      };
    }

    if (!licenseFile?.path) {
      throw new ForbiddenException('请上传有效的 license 文件');
    }

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        requirementId,
      },
      select: {
        fileUrl: true,
      },
    });

    if (!delivery?.fileUrl) {
      throw new NotFoundException('交付文件不存在');
    }

    const safeFilePath = this.ensureSafeDeliveryPath(delivery.fileUrl);
    const metadata = await this.readEncryptedModelMetadata(safeFilePath).catch(() => null);
    if (!metadata) {
      throw new NotFoundException('加密模型元数据不存在');
    }

    const licenseBuffer = await this.readUploadedBinaryFile(licenseFile);
    await validateModelLicenseFile(licenseBuffer, userId, requirementId, deliveryId, metadata);

    return {
      success: true,
      message: 'license 验证成功，可以下载加密模型',
    };
  }

  async verifyUserLicense(userId: bigint, licenseFile?: UploadedBinaryFile) {
    if (!licenseFile?.path) {
      throw new ForbiddenException('请上传有效的 license 文件');
    }

    const configuredLicenseKey = await getConfiguredLicenseKeyForUser(userId);
    const uploadedLicenseKey = normalizeLicenseKeyBase64((await this.readUploadedBinaryFile(licenseFile)).toString('utf8'));
    if (configuredLicenseKey !== uploadedLicenseKey) {
      throw new ForbiddenException('当前用户不是该 license 的授权用户');
    }

    return {
      success: true,
      message: 'license 验证成功，当前账户可下载加密模型',
    };
  }

  async listNotifications(userId: bigint, query: ListNotificationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        include: {
          requirement: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      list: notifications.map((item) => ({
        id: item.id.toString(),
        type: item.type,
        title: item.title,
        content: item.content,
        isRead: item.isRead,
        readAt: item.readAt,
        createdAt: item.createdAt,
        requirement: item.requirement
          ? {
              id: item.requirement.id.toString(),
              title: item.requirement.title,
              status: item.requirement.status,
            }
          : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async markNotificationRead(userId: bigint, notificationId: bigint) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, isRead: true },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    if (notification.isRead) {
      return { success: true };
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { success: true };
  }

  async markAllNotificationsRead(userId: bigint) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }

  async dataTree(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    query: ListRequirementDataTreeDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [total, patients] = await this.prisma.$transaction([
      this.prisma.patient.count({ where: { requirementId } }),
      this.prisma.patient.findMany({
        where: { requirementId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          studies: {
            orderBy: { createdAt: 'asc' },
            include: {
              series: {
                orderBy: { createdAt: 'asc' },
                include: {
                  datasetBatch: {
                    select: {
                      id: true,
                      batchNo: true,
                      uploadType: true,
                      sourceName: true,
                      remark: true,
                      uploadedAt: true,
                      diagnosis: true,
                      clinicalTags: true,
                      annotationStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const patientsWithMetadata = await this.mapWithConcurrency(
      patients,
      this.dataTreeSeriesMetadataConcurrency,
      async (patient) => ({
        ...patient,
        studies: await this.mapWithConcurrency(
          patient.studies,
          this.dataTreeSeriesMetadataConcurrency,
          async (study) => {
            const seriesWithMetadata = await this.mapWithConcurrency(
              study.series,
              this.dataTreeSeriesMetadataConcurrency,
              async (series) => ({
                ...series,
                metadata: await this.readSeriesMetadataSummary(series.storagePath),
              }),
            );

            return {
              ...study,
              series: seriesWithMetadata,
              metadata: {
                manufacturer: this.mergeMetadataValues(seriesWithMetadata.map((series) => series.metadata.manufacturer)),
                protocolName: this.mergeMetadataValues(seriesWithMetadata.map((series) => series.metadata.protocolName)),
                manufacturerModelName: this.mergeMetadataValues(
                  seriesWithMetadata.map((series) => series.metadata.manufacturerModelName),
                ),
              },
            };
          },
        ),
      }),
    );

    return {
      requirementId: requirementId.toString(),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      patients: patientsWithMetadata.map((patient) => ({
        id: patient.id.toString(),
        patientUid: patient.patientUid,
        patientId: patient.patientId,
        patientName: patient.patientName,
        sex: patient.sex,
        birthday: patient.birthday,
        imageCount: patient.imageCount,
        studies: patient.studies.map((study) => ({
          id: study.id.toString(),
          studyUid: study.studyUid,
          studyId: study.studyId,
          modality: study.modality,
          studyDate: study.studyDate,
          studyDescription: study.studyDescription,
          manufacturer: study.metadata.manufacturer,
          protocolName: study.metadata.protocolName,
          manufacturerModelName: study.metadata.manufacturerModelName,
          seriesCount: study.seriesCount,
          series: study.series.map((series) => ({
            id: series.id.toString(),
            seriesUid: series.seriesUid,
            seriesDescription: series.seriesDescription,
            bodyPart: series.metadata.bodyPart,
            diagnosis: Array.isArray(series.datasetBatch.diagnosis) ? (series.datasetBatch.diagnosis as string[]) : null,
            clinicalTags: Array.isArray(series.datasetBatch.clinicalTags) ? (series.datasetBatch.clinicalTags as string[]) : null,
            annotationStatus: series.datasetBatch.annotationStatus,
            hospitalName: series.hospitalName,
            remark: series.remark ?? series.datasetBatch.remark,
            uploadedAt: series.uploadedAt ?? series.datasetBatch.uploadedAt,
            imageCount: series.imageCount,
            storagePath: series.storagePath,
            datasetBatch: {
              id: series.datasetBatch.id.toString(),
              batchNo: series.datasetBatch.batchNo,
              uploadType: series.datasetBatch.uploadType,
              sourceName: series.datasetBatch.sourceName,
            },
          })),
        })),
      })),
    };
  }

  async pacsGetImageIdGroups(userId: bigint, role: UserRole, seriesIds: string[] = [], seriesUids: string[] = []) {
    const seriesList = await this.findAccessibleSeries(userId, role, seriesIds, seriesUids);
    const seriesIdMap = new Map(seriesList.map((item) => [item.id.toString(), item]));
    const seriesUidMap = new Map(seriesList.map((item) => [item.seriesUid, item]));

    const orderedSeries = [
      ...seriesIds.map((id) => seriesIdMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
      ...seriesUids
        .filter((uid) => !seriesIds.some((id) => seriesIdMap.get(id)?.seriesUid === uid))
        .map((uid) => seriesUidMap.get(uid))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ];

    if (orderedSeries.length === 0) {
      throw new NotFoundException('未找到可访问的序列');
    }

    return Promise.all(orderedSeries.map((series) => this.listSeriesFileEntries(series)));
  }

  async pacsGetTagInfo(userId: bigint, role: UserRole, seriesIds: string[] = [], seriesUids: string[] = []) {
    const seriesList = await this.findAccessibleSeries(userId, role, seriesIds, seriesUids);
    const seriesIdMap = new Map(seriesList.map((item) => [item.id.toString(), item]));
    const seriesUidMap = new Map(seriesList.map((item) => [item.seriesUid, item]));

    const orderedSeries = [
      ...seriesIds.map((id) => seriesIdMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
      ...seriesUids
        .filter((uid) => !seriesIds.some((id) => seriesIdMap.get(id)?.seriesUid === uid))
        .map((uid) => seriesUidMap.get(uid))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ];

    if (orderedSeries.length === 0) {
      return [];
    }

    if (orderedSeries.length > this.pacsTagInfoMaxSeries) {
      throw new BadRequestException(`单次最多只支持读取 ${this.pacsTagInfoMaxSeries} 个序列标签`);
    }

    return this.mapWithConcurrency(
      orderedSeries,
      this.pacsTagInfoSeriesConcurrency,
      async (series) => {
        const files = (await this.listSeriesFileEntries(series)).slice(0, this.pacsTagInfoMaxFilesPerSeries);
        if (files.length === 0) {
          return [];
        }
        return this.mapWithConcurrency(
          files,
          this.pacsTagInfoFileConcurrency,
          (file) => this.parsePacsTagInfo(series, file.filePath),
        );
      },
    );
  }

  async pacsDownloadSeries(userId: bigint, role: UserRole, seriesIds: string[] = [], seriesUids: string[] = []) {
    const seriesList = await this.findAccessibleSeries(userId, role, seriesIds, seriesUids);

    if (seriesList.length === 0) {
      throw new NotFoundException('未找到可下载的序列');
    }

    if (seriesList.length > this.pacsDownloadMaxSeries) {
      throw new BadRequestException(`单次最多只支持打包下载 ${this.pacsDownloadMaxSeries} 个序列`);
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'campcloud-pacs-'));
    const zipPath = join(tempDir, `series_${Date.now()}.zip`);
    const targetDirs = seriesList
      .map((series) => (series.storagePath ? dirname(this.ensureSafeStoragePath(series.storagePath)) : null))
      .filter((dir): dir is string => Boolean(dir));

    if (targetDirs.length === 0) {
      throw new NotFoundException('序列文件不存在');
    }

    const uniqueTargetDirs = [...new Set(targetDirs)];
    const fileCounts = await Promise.all(uniqueTargetDirs.map(async (dir) => (await readdir(dir)).length));
    const totalFiles = fileCounts.reduce((sum, count) => sum + count, 0);
    if (totalFiles > this.pacsDownloadMaxFiles) {
      throw new BadRequestException(`单次最多只支持打包 ${this.pacsDownloadMaxFiles} 个文件`);
    }

    await execFileAsync('zip', ['-r', zipPath, ...uniqueTargetDirs], { cwd: '/' });

    const patientId = seriesList[0].study.patient.patientId || seriesList[0].study.patient.patientUid;

    return {
      path: zipPath,
      fileName: `series_${patientId}.zip`,
      cleanupDir: tempDir,
    };
  }

  async pacsPublicFile(seriesId: string, fileName: string) {
    let parsedSeriesId: bigint;

    try {
      parsedSeriesId = BigInt(seriesId);
    } catch {
      throw new NotFoundException('序列不存在');
    }

    const series = await this.prisma.series.findUnique({
      where: { id: parsedSeriesId },
      select: { storagePath: true },
    });

    if (!series?.storagePath) {
      throw new NotFoundException('文件不存在');
    }

    const safeStoragePath = this.ensureSafeStoragePath(series.storagePath);
    const filePath = this.ensureSafeStoragePath(join(dirname(safeStoragePath), fileName));

    try {
      await stat(filePath);
    } catch {
      throw new NotFoundException('文件不存在');
    }

    return filePath;
  }

  async previewStudy(userId: bigint, requirementId: bigint, studyId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const study = await this.prisma.study.findFirst({
      where: {
        id: studyId,
        patient: { requirementId },
      },
      include: {
        series: {
          orderBy: { createdAt: 'asc' },
          include: {
            datasetBatch: {
              select: {
                id: true,
                batchNo: true,
                uploadType: true,
                sourceName: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            patientUid: true,
            patientId: true,
            patientName: true,
          },
        },
      },
    });

    if (!study) {
      throw new NotFoundException('检查不存在');
    }

    return {
      target: {
        type: 'study' as const,
        id: study.id.toString(),
        studyUid: study.studyUid,
        studyId: study.studyId,
        modality: study.modality,
        studyDate: study.studyDate,
        studyDescription: study.studyDescription,
        patient: {
          id: study.patient.id.toString(),
          patientUid: study.patient.patientUid,
          patientId: study.patient.patientId,
          patientName: study.patient.patientName,
        },
      },
      series: await Promise.all(study.series.map((item) => this.buildSeriesViewerPayload(item, requirementId))),
    };
  }

  async previewSeries(userId: bigint, requirementId: bigint, seriesId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const series = await this.prisma.series.findFirst({
      where: {
        id: seriesId,
        study: {
          patient: {
            requirementId,
          },
        },
      },
      include: {
        datasetBatch: {
          select: {
            id: true,
            batchNo: true,
            uploadType: true,
            sourceName: true,
          },
        },
        study: {
          select: {
            id: true,
            studyUid: true,
            studyId: true,
            studyDescription: true,
          },
        },
      },
    });

    if (!series) {
      throw new NotFoundException('序列不存在');
    }

    return {
      target: {
        type: 'series' as const,
        id: series.id.toString(),
        seriesUid: series.seriesUid,
        seriesDescription: series.seriesDescription,
        study: {
          id: series.study.id.toString(),
          studyUid: series.study.studyUid,
          studyId: series.study.studyId,
          studyDescription: series.study.studyDescription,
        },
      },
      series: [await this.buildSeriesViewerPayload(series, requirementId)],
    };
  }

  async downloadSeriesFile(
    userId: bigint,
    requirementId: bigint,
    seriesId: bigint,
    fileName: string,
    role: UserRole,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const series = await this.prisma.series.findFirst({
      where: {
        id: seriesId,
        study: {
          patient: { requirementId },
        },
      },
      select: {
        storagePath: true,
      },
    });

    if (!series?.storagePath) {
      throw new NotFoundException('序列文件不存在');
    }

    const safeStoragePath = this.ensureSafeStoragePath(series.storagePath);
    const filePath = join(dirname(safeStoragePath), fileName);
    const safeFilePath = this.ensureSafeStoragePath(filePath);

    try {
      await stat(safeFilePath);
    } catch {
      throw new NotFoundException('文件不存在');
    }

    return {
      path: safeFilePath,
      fileName,
    };
  }

  async pacsGetSeries(userId: bigint, role: UserRole, seriesIds: string[] = [], seriesUids: string[] = []) {
    const seriesList = await this.findAccessibleSeries(userId, role, seriesIds, seriesUids);

    return seriesList.map((series) => ({
      patientId: series.study.patient.patientId || series.study.patient.patientUid,
      patientName: series.study.patient.patientName || series.study.patient.patientUid,
      patientSex: series.study.patient.sex || '',
      birthday: series.study.patient.birthday ? series.study.patient.birthday.toISOString() : '',
      patientAge: '',
      username: '',
      userId: 0,
      seriesId: series.id.toString(),
      seriesUID: series.seriesUid,
      seriesNumber: 0,
      seriesDesc: series.seriesDescription || series.seriesUid,
      scanMode: series.study.modality || '',
      scanTime: series.study.studyDate ? series.study.studyDate.toISOString() : '',
      imageCount: series.imageCount,
      uploadTime: series.uploadedAt ? series.uploadedAt.toISOString() : '',
      protocolName: '',
      manufacturer: '',
      institutionName: series.hospitalName || '',
      manufacturersModelName: '',
      studyDescription: series.study.studyDescription || '',
      bodyPart: '',
      hospitalName: series.hospitalName || '',
      note: series.remark || '',
    }));
  }

  async deleteStudy(userId: bigint, requirementId: bigint, studyId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const deletedSeriesPaths = await this.prisma.$transaction(async (tx) => {
      const study = await tx.study.findFirst({
        where: {
          id: studyId,
          patient: { requirementId },
        },
        include: {
          patient: {
            select: {
              id: true,
            },
          },
          series: {
            select: {
              id: true,
              imageCount: true,
              storagePath: true,
            },
          },
        },
      });

      if (!study) {
        throw new NotFoundException('检查不存在');
      }

      const imageCount = study.series.reduce((sum, item) => sum + item.imageCount, 0);

      await tx.series.deleteMany({
        where: {
          studyId: study.id,
        },
      });

      await tx.study.delete({
        where: { id: study.id },
      });

      const remainingStudyCount = await tx.study.count({
        where: { patientId: study.patient.id },
      });

      if (remainingStudyCount === 0) {
        await tx.patient.delete({
          where: { id: study.patient.id },
        });
      } else if (imageCount > 0) {
        await tx.patient.update({
          where: { id: study.patient.id },
          data: {
            imageCount: { decrement: imageCount },
          },
        });
      }

      return study.series.map((item) => item.storagePath).filter((item): item is string => Boolean(item));
    });

    await Promise.all(deletedSeriesPaths.map((item) => this.deleteSeriesFiles(item)));

    return { success: true };
  }

  async deleteSeries(userId: bigint, requirementId: bigint, seriesId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const deletedSeriesPath = await this.prisma.$transaction(async (tx) => {
      const series = await tx.series.findFirst({
        where: {
          id: seriesId,
          study: {
            patient: { requirementId },
          },
        },
        include: {
          study: {
            include: {
              patient: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!series) {
        throw new NotFoundException('序列不存在');
      }

      await tx.series.delete({
        where: { id: series.id },
      });

      const remainingSeriesCount = await tx.series.count({
        where: { studyId: series.study.id },
      });

      if (remainingSeriesCount === 0) {
        await tx.study.delete({
          where: { id: series.study.id },
        });

        const remainingStudyCount = await tx.study.count({
          where: { patientId: series.study.patient.id },
        });

        if (remainingStudyCount === 0) {
          await tx.patient.delete({
            where: { id: series.study.patient.id },
          });
        } else {
          await tx.patient.update({
            where: { id: series.study.patient.id },
            data: {
              imageCount: { decrement: series.imageCount },
            },
          });
        }
      } else {
        await tx.study.update({
          where: { id: series.study.id },
          data: { seriesCount: remainingSeriesCount },
        });
        await tx.patient.update({
          where: { id: series.study.patient.id },
          data: {
            imageCount: { decrement: series.imageCount },
          },
        });
      }

      return series.storagePath;
    });

    await this.deleteSeriesFiles(deletedSeriesPath);

    return { success: true };
  }

  async createDatasetBatch(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDatasetBatchDto,
    files: StagedUploadFile[],
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    await this.cleanupExpiredUploadSessions();

    const validFiles = files.filter((file) => !this.shouldIgnoreUploadedFile(file.originalname));
    const fileCount = validFiles.length;
    if (!dto.modality?.trim()) {
      throw new BadRequestException('请选择影像模态');
    }
    if (!dto.bodyPart?.trim()) {
      throw new BadRequestException('请选择检查部位');
    }
    if (fileCount === 0) {
      throw new BadRequestException('请上传有效文件，系统会自动忽略 .DS_Store 和其他隐藏文件');
    }

    const trimmedSourceName = dto.sourceName?.trim() || null;
    const trimmedRemark = dto.remark?.trim() || null;
    const trimmedModality = dto.modality?.trim() || null;
    const trimmedBodyPart = dto.bodyPart?.trim() || null;
    const retryBatchId = dto.retryBatchId ? BigInt(dto.retryBatchId) : null;

    const batch = await this.prisma.$transaction(async (tx) => {
      let createdOrUpdated:
        | {
            id: bigint;
            batchNo: number;
            status: DatasetBatchStatus;
            fileCount: number;
            uploadedAt: Date;
          }
        | null = null;

      if (retryBatchId) {
        const existingBatch = await tx.datasetBatch.findFirst({
          where: {
            id: retryBatchId,
            requirementId,
          },
          select: {
            id: true,
            batchNo: true,
            uploadType: true,
            fileCount: true,
          },
        });

        if (!existingBatch) {
          throw new NotFoundException('重传批次不存在');
        }

        createdOrUpdated = await tx.datasetBatch.update({
          where: { id: existingBatch.id },
          data: {
            uploadedBy: userId,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            status: 'uploaded',
            fileCount: { increment: fileCount },
            uploadedAt: new Date(),
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });
      } else {
        const lastBatch = await tx.datasetBatch.findFirst({
          where: { requirementId },
          orderBy: { batchNo: 'desc' },
          select: { batchNo: true },
        });

        createdOrUpdated = await tx.datasetBatch.create({
          data: {
            requirementId,
            uploadedBy: userId,
            batchNo: (lastBatch?.batchNo ?? 0) + 1,
            uploadType: lastBatch ? DatasetUploadType.supplement : DatasetUploadType.initial,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            fileCount,
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });
      }

      if (role === UserRole.user) {
        const requirement = await tx.requirement.findUnique({
          where: { id: requirementId },
          select: { title: true, status: true },
        });

        if (requirement?.status === RequirementStatus.waiting_user) {
          await tx.requirement.update({
            where: { id: requirementId },
            data: { status: RequirementStatus.processing },
          });
          await tx.requirementStatusLog.create({
            data: {
              requirementId,
              fromStatus: RequirementStatus.waiting_user,
              toStatus: RequirementStatus.processing,
              changedBy: userId,
              changedRole: role,
              reason: '用户已补充上传数据，需求继续处理中',
            },
          });
        }

        const admins = await tx.user.findMany({
          where: { role: UserRole.admin },
          select: { id: true },
        });
        await this.createNotifications(
          tx,
          admins.map((item) => item.id),
          requirementId,
          'data_upload',
          '收到新的用户数据上传，请在管理侧查看',
          `需求「${requirement?.title || requirementId.toString()}」有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        );
        await this.mailService.queueRequirementAdminNotifications(tx, {
          requirementId,
          type: 'data_upload',
          subject: '【AICampCloud】收到新的用户数据上传',
          requirementTitle: requirement?.title || requirementId.toString(),
          actionLabel: retryBatchId ? '用户批次重传' : '用户数据上传',
          summary: `需求《${requirement?.title || requirementId.toString()}》有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        });
      }

      return createdOrUpdated;
    });

    void this.processDatasetBatchFromStagedFiles(batch, requirementId, trimmedRemark, validFiles).catch(async () => {
      await this.prisma.datasetBatch.update({
        where: { id: batch.id },
        data: {
          status: 'failed',
          remark: trimmedRemark ? `${trimmedRemark}；后台解析失败` : '后台解析失败',
        },
      });
    });

    return {
      datasetBatchId: batch.id.toString(),
      requirementTitle:
        role === UserRole.user
          ? (await this.prisma.requirement.findUnique({
              where: { id: requirementId },
              select: { title: true },
            }))?.title ?? null
          : null,
      batchNo: batch.batchNo,
    };
  }

  async createDatasetBatchFromSessions(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDatasetBatchFromSessionsDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    await this.cleanupExpiredUploadSessions();

    const sessionIds = Array.from(new Set(dto.sessionIds.map((item) => item.trim()).filter(Boolean)));
    if (sessionIds.length === 0) {
      throw new BadRequestException('请先上传至少一个文件');
    }
    if (!dto.modality?.trim()) {
      throw new BadRequestException('请选择影像模态');
    }
    if (!dto.bodyPart?.trim()) {
      throw new BadRequestException('请选择检查部位');
    }

    const sessions = await this.prisma.uploadSession.findMany({
      where: {
        id: { in: sessionIds.map((item) => BigInt(item)) },
        requirementId,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
      orderBy: { id: 'asc' },
    });

    if (sessions.length !== sessionIds.length) {
      throw new BadRequestException('存在无效的上传会话');
    }
    if (sessions.some((session) => session.status !== 'uploaded')) {
      throw new BadRequestException('存在尚未上传完成的文件，请完成后再提交批次');
    }

    const uploadSummary = this.summarizeUploadSessions(sessions);
    if (uploadSummary.totalBytes > RequirementsService.LARGE_ZIP_UPLOAD_THRESHOLD_BYTES && !uploadSummary.requiresManualAnalysis) {
      throw new BadRequestException('超过10GB的数据仅支持上传单个 ZIP 压缩包，且系统不会自动解析');
    }
    if (sessions.some((session) => this.isZipFileName(session.fileName) || this.isZipFileName(session.relativePath)) && !uploadSummary.requiresManualAnalysis) {
      throw new BadRequestException('ZIP 上传仅支持超过10GB的单个压缩包，请直接上传文件夹');
    }

    const trimmedSourceName = dto.sourceName?.trim() || null;
    const trimmedRemark = dto.remark?.trim() || null;
    const trimmedModality = dto.modality?.trim() || null;
    const trimmedBodyPart = dto.bodyPart?.trim() || null;
    const retryBatchId = dto.retryBatchId ? BigInt(dto.retryBatchId) : null;

    const batch = await this.prisma.$transaction(async (tx) => {
      let createdOrUpdated:
        | {
            id: bigint;
            batchNo: number;
            status: DatasetBatchStatus;
            fileCount: number;
            uploadedAt: Date;
          }
        | null = null;

      if (retryBatchId) {
        const existingBatch = await tx.datasetBatch.findFirst({
          where: {
            id: retryBatchId,
            requirementId,
          },
          select: {
            id: true,
            batchNo: true,
          },
        });

        if (!existingBatch) {
          throw new NotFoundException('重传批次不存在');
        }

        createdOrUpdated = await tx.datasetBatch.update({
          where: { id: existingBatch.id },
          data: {
            uploadedBy: userId,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            status: 'uploaded',
            fileCount: { increment: sessions.length },
            uploadedAt: new Date(),
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });
      } else {
        const lastBatch = await tx.datasetBatch.findFirst({
          where: { requirementId },
          orderBy: { batchNo: 'desc' },
          select: { batchNo: true },
        });

        createdOrUpdated = await tx.datasetBatch.create({
          data: {
            requirementId,
            uploadedBy: userId,
            batchNo: (lastBatch?.batchNo ?? 0) + 1,
            uploadType: lastBatch ? DatasetUploadType.supplement : DatasetUploadType.initial,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            fileCount: sessions.length,
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });
      }

      await tx.uploadSession.updateMany({
        where: { id: { in: sessions.map((item) => item.id) } },
        data: {
          datasetBatchId: createdOrUpdated.id,
          status: 'consumed',
        },
      });

      if (role === UserRole.user) {
        const requirement = await tx.requirement.findUnique({
          where: { id: requirementId },
          select: { title: true, status: true },
        });

        if (requirement?.status === RequirementStatus.waiting_user) {
          await tx.requirement.update({
            where: { id: requirementId },
            data: { status: RequirementStatus.processing },
          });
          await tx.requirementStatusLog.create({
            data: {
              requirementId,
              fromStatus: RequirementStatus.waiting_user,
              toStatus: RequirementStatus.processing,
              changedBy: userId,
              changedRole: role,
              reason: '用户已补充上传数据，需求继续处理中',
            },
          });
        }

        const admins = await tx.user.findMany({
          where: { role: UserRole.admin },
          select: { id: true },
        });
        await this.createNotifications(
          tx,
          admins.map((item) => item.id),
          requirementId,
          'data_upload',
          '收到新的用户数据上传，请在管理侧查看',
          `需求「${requirement?.title || requirementId.toString()}」有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        );
        await this.mailService.queueRequirementAdminNotifications(tx, {
          requirementId,
          type: 'data_upload',
          subject: '【AICampCloud】收到新的用户数据上传',
          requirementTitle: requirement?.title || requirementId.toString(),
          actionLabel: retryBatchId ? '用户批次重传' : '用户数据上传',
          summary: `需求《${requirement?.title || requirementId.toString()}》有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        });
      }

      return createdOrUpdated;
    });

    if (uploadSummary.requiresManualAnalysis) {
      void this.persistManualAnalysisBatchFromStagedFiles(batch, requirementId, trimmedRemark, sessions).catch(async () => {
        await this.prisma.datasetBatch.update({
          where: { id: batch.id },
          data: {
            status: 'failed',
            remark: trimmedRemark ? `${trimmedRemark}；超10GB ZIP 保存失败` : '超10GB ZIP 保存失败',
          },
        });
      });
    } else {
      const stagedFiles: StagedUploadFile[] = sessions.map((session) => ({
        originalname: session.relativePath,
        path: session.storagePath,
      }));

      void this.processDatasetBatchFromStagedFiles(batch, requirementId, trimmedRemark, stagedFiles).catch(async () => {
        await this.prisma.datasetBatch.update({
          where: { id: batch.id },
          data: {
            status: 'failed',
            remark: trimmedRemark ? `${trimmedRemark}；后台解析失败` : '后台解析失败',
          },
        });
      });
    }

    return {
      datasetBatchId: batch.id.toString(),
      requirementTitle:
        role === UserRole.user
          ? (await this.prisma.requirement.findUnique({
              where: { id: requirementId },
              select: { title: true },
            }))?.title ?? null
          : null,
      batchNo: batch.batchNo,
      requiresManualAnalysis: uploadSummary.requiresManualAnalysis,
    };
  }

  async createDatasetBatchFromOssFiles(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDatasetBatchFromOssFilesDto,
  ) {
    return this.prepareDatasetBatchFromOssFiles(userId, requirementId, role, dto);
  }
  async prepareDatasetBatchFromOssFiles(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDatasetBatchFromOssFilesDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const fileIds = Array.from(new Set(dto.fileIds.map((item) => item.trim()).filter(Boolean)));
    if (fileIds.length === 0) {
      throw new BadRequestException('请先上传至少一个 OSS 文件');
    }
    if (!dto.modality?.trim()) {
      throw new BadRequestException('请选择影像模态');
    }
    if (!dto.bodyPart?.trim()) {
      throw new BadRequestException('请选择检查部位');
    }

    const files = await this.prisma.requirementOssFile.findMany({
      where: {
        id: { in: fileIds.map((item) => BigInt(item)) },
        requirementId,
        kind: RequirementOssFileKind.dicom,
        ...(role === UserRole.admin ? {} : { uploadedBy: userId }),
      },
      orderBy: { id: 'asc' },
    });

    if (files.length !== fileIds.length) {
      throw new BadRequestException('存在无效的 OSS 文件记录');
    }
    if (files.some((file) => file.datasetBatchId)) {
      throw new BadRequestException('存在已经提交过批次的 OSS 文件，请刷新后重试');
    }
    if (files.some((file) => file.status !== RequirementOssFileStatus.uploaded && file.status !== RequirementOssFileStatus.parsed)) {
      throw new BadRequestException('存在尚未上传完成的 OSS 文件，请稍后重试');
    }

    const uploadSummary = this.summarizeRequirementOssFiles(files);
    if (uploadSummary.totalBytes > RequirementsService.LARGE_ZIP_UPLOAD_THRESHOLD_BYTES && !uploadSummary.requiresManualAnalysis) {
      throw new BadRequestException('超过 10GB 的数据仅支持上传单个 ZIP 压缩包，且系统不会自动解析');
    }
    if (files.some((file) => this.isZipFileName(file.originalFileName)) && !uploadSummary.requiresManualAnalysis) {
      throw new BadRequestException('ZIP 上传仅支持超过 10GB 的单个压缩包，请直接上传文件夹');
    }

    const trimmedSourceName = dto.sourceName?.trim() || null;
    const trimmedRemark = dto.remark?.trim() || null;
    const trimmedModality = dto.modality?.trim() || null;
    const trimmedBodyPart = dto.bodyPart?.trim() || null;
    const retryBatchId = dto.retryBatchId ? BigInt(dto.retryBatchId) : null;

    const batch = await this.prisma.$transaction(async (tx) => {
      let createdOrUpdated:
        | {
            id: bigint;
            batchNo: number;
            status: DatasetBatchStatus;
            fileCount: number;
            uploadedAt: Date;
          }
        | null = null;

      if (retryBatchId) {
        const existingBatch = await tx.datasetBatch.findFirst({
          where: {
            id: retryBatchId,
            requirementId,
          },
          select: {
            id: true,
            batchNo: true,
          },
        });

        if (!existingBatch) {
          throw new NotFoundException('重传批次不存在');
        }

        createdOrUpdated = await tx.datasetBatch.update({
          where: { id: existingBatch.id },
          data: {
            uploadedBy: userId,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            status: 'uploaded',
            fileCount: { increment: files.length },
            uploadedAt: new Date(),
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });

        await tx.requirementOssFile.updateMany({
          where: { id: { in: files.map((file) => file.id) } },
          data: {
            datasetBatchId: existingBatch.id,
            parsedObjectKey: null,
            parsedPayload: Prisma.JsonNull,
            parsedAt: null,
            errorMessage: null,
          },
        });
      } else {
        const lastBatch = await tx.datasetBatch.findFirst({
          where: { requirementId },
          orderBy: { batchNo: 'desc' },
          select: { batchNo: true },
        });

        createdOrUpdated = await tx.datasetBatch.create({
          data: {
            requirementId,
            uploadedBy: userId,
            batchNo: (lastBatch?.batchNo ?? 0) + 1,
            uploadType: lastBatch ? DatasetUploadType.supplement : DatasetUploadType.initial,
            sourceName: trimmedSourceName,
            remark: trimmedRemark,
            modality: trimmedModality,
            bodyPart: trimmedBodyPart,
            diagnosis: dto.diagnosis && dto.diagnosis.length > 0 ? dto.diagnosis : undefined,
            clinicalTags: dto.clinicalTags && dto.clinicalTags.length > 0 ? dto.clinicalTags : undefined,
            annotationStatus: dto.annotationStatus?.trim() || null,
            fileCount: files.length,
          },
          select: {
            id: true,
            batchNo: true,
            status: true,
            fileCount: true,
            uploadedAt: true,
          },
        });

        await tx.requirementOssFile.updateMany({
          where: { id: { in: files.map((file) => file.id) } },
          data: {
            datasetBatchId: createdOrUpdated.id,
            parsedObjectKey: null,
            parsedPayload: Prisma.JsonNull,
            parsedAt: null,
            errorMessage: null,
          },
        });
      }

      if (role === UserRole.user) {
        const requirement = await tx.requirement.findUnique({
          where: { id: requirementId },
          select: { title: true, status: true },
        });

        if (requirement?.status === RequirementStatus.waiting_user) {
          await tx.requirement.update({
            where: { id: requirementId },
            data: { status: RequirementStatus.processing },
          });
          await tx.requirementStatusLog.create({
            data: {
              requirementId,
              fromStatus: RequirementStatus.waiting_user,
              toStatus: RequirementStatus.processing,
              changedBy: userId,
              changedRole: role,
              reason: '用户已补充上传数据，需求继续处理中',
            },
          });
        }

        const admins = await tx.user.findMany({
          where: { role: UserRole.admin },
          select: { id: true },
        });
        await this.createNotifications(
          tx,
          admins.map((item) => item.id),
          requirementId,
          'data_upload',
          '收到新的用户数据上传，请在管理侧确认是否拉取详情数据',
          `需求「${requirement?.title || requirementId.toString()}」有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        );
        await this.mailService.queueRequirementAdminNotifications(tx, {
          requirementId,
          type: 'data_upload',
          subject: '【AICampCloud】收到新的用户数据上传',
          requirementTitle: requirement?.title || requirementId.toString(),
          actionLabel: retryBatchId ? '用户批次重传' : '用户数据上传',
          summary: `需求《${requirement?.title || requirementId.toString()}》有${retryBatchId ? '批次重传' : '新的数据上传'}，请及时处理。`,
        });
      }

      return createdOrUpdated;
    });

    return {
      datasetBatchId: batch.id.toString(),
      requirementTitle:
        role === UserRole.user
          ? (await this.prisma.requirement.findUnique({
              where: { id: requirementId },
              select: { title: true },
            }))?.title ?? null
          : null,
      batchNo: batch.batchNo,
      requiresManualAnalysis: uploadSummary.requiresManualAnalysis,
    };
  }

  async pullRequirementDetailData(userId: bigint, requirementId: bigint, role: UserRole) {
    if (role !== UserRole.admin) {
      throw new ForbiddenException('仅管理员可以拉取需求详情数据');
    }
    await this.ensureRequirementAccess(userId, requirementId, role);

    const pendingBatches = await this.prisma.datasetBatch.findMany({
      where: {
        requirementId,
        status: DatasetBatchStatus.uploaded,
        ossFiles: {
          some: {
            kind: RequirementOssFileKind.dicom,
            status: {
              in: [RequirementOssFileStatus.uploaded, RequirementOssFileStatus.parsed],
            },
          },
        },
      },
      orderBy: [{ batchNo: 'asc' }],
      include: {
        ossFiles: {
          where: {
            kind: RequirementOssFileKind.dicom,
            status: {
              in: [RequirementOssFileStatus.uploaded, RequirementOssFileStatus.parsed],
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (pendingBatches.length === 0) {
      throw new BadRequestException('当前没有待拉取的详情数据');
    }

    const totalBytes = pendingBatches.reduce(
      (sum, batch) => sum + batch.ossFiles.reduce((batchSum, file) => batchSum + Number(file.fileSize), 0),
      0,
    );
    const fileCount = pendingBatches.reduce((sum, batch) => sum + batch.ossFiles.length, 0);
    const startedBatchIds: string[] = [];
    const skippedBatchIds: string[] = [];

    for (const batch of pendingBatches) {
      if (batch.ossFiles.length === 0) {
        skippedBatchIds.push(batch.id.toString());
        continue;
      }

      startedBatchIds.push(batch.id.toString());
      const uploadSummary = this.summarizeRequirementOssFiles(batch.ossFiles);
      const trimmedRemark = batch.remark?.trim() || null;

      await this.prisma.requirementOssFile.updateMany({
        where: {
          id: { in: batch.ossFiles.map((file) => file.id) },
        },
        data: {
          status: RequirementOssFileStatus.parsing,
          errorMessage: null,
        },
      });

      void this.buildStagedFilesFromRequirementOssFiles(
        batch.ossFiles.map((file) => ({
          objectKey: file.objectKey,
          originalFileName: file.originalFileName,
        })),
      )
        .then(async (stagedFiles) => {
          if (uploadSummary.requiresManualAnalysis) {
            await this.persistManualAnalysisBatchFiles(
              {
                id: batch.id,
                batchNo: batch.batchNo,
              },
              requirementId,
              trimmedRemark,
              stagedFiles.map((file) => ({
                relativePath: file.originalname,
                storagePath: file.path,
                })),
            );
            await this.prisma.requirementOssFile.updateMany({
              where: {
                id: { in: batch.ossFiles.map((file) => file.id) },
              },
              data: {
                status: RequirementOssFileStatus.parsed,
                errorMessage: null,
              },
            });
            await this.cleanupRequirementOssFiles(
              batch.ossFiles.map((file) => ({
                id: file.id,
                objectKey: file.objectKey,
              })),
            );
            return;
          }

          await this.processDatasetBatchFromStagedFiles(
            {
              id: batch.id,
              batchNo: batch.batchNo,
                uploadedAt: batch.uploadedAt,
            },
            requirementId,
            trimmedRemark,
            stagedFiles,
          );
          await this.prisma.requirementOssFile.updateMany({
            where: {
              id: { in: batch.ossFiles.map((file) => file.id) },
            },
            data: {
              status: RequirementOssFileStatus.parsed,
              errorMessage: null,
            },
          });
          await this.cleanupRequirementOssFiles(
            batch.ossFiles.map((file) => ({
              id: file.id,
              objectKey: file.objectKey,
            })),
          );
        })
        .catch(async () => {
          await this.prisma.requirementOssFile.updateMany({
            where: {
              id: { in: batch.ossFiles.map((file) => file.id) },
            },
            data: {
              status: RequirementOssFileStatus.failed,
              errorMessage: 'OSS 文件拉取失败',
            },
          });
          await this.prisma.datasetBatch.update({
            where: { id: batch.id },
            data: {
              status: 'failed',
              remark: trimmedRemark ? `${trimmedRemark}；OSS 文件拉取失败` : 'OSS 文件拉取失败',
            },
          });
        });
    }

    return {
      startedBatchIds,
      skippedBatchIds,
      totalBytes,
      fileCount,
    };
  }

  async listDatasetBatches(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    query: ListDatasetBatchesDto,
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = { requirementId };

    const [total, list] = await this.prisma.$transaction([
      this.prisma.datasetBatch.count({ where }),
      this.prisma.datasetBatch.findMany({
        where,
        orderBy: [{ batchNo: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          uploadSessions: {
            select: {
              fileName: true,
              relativePath: true,
              fileSize: true,
            },
          },
          ossFiles: {
            select: {
              originalFileName: true,
              fileSize: true,
            },
          },
          uploader: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      }),
    ]);

    const items = await Promise.all(
      list.map(async (item) => {
        const failedFiles = await this.readFailedDatasetFilesManifest(requirementId, item.batchNo);
        const uploadSummary = item.uploadSessions.length
          ? this.summarizeUploadSessions(item.uploadSessions)
          : this.summarizeRequirementOssFiles(item.ossFiles);
        return {
          id: item.id.toString(),
          batchNo: item.batchNo,
          uploadType: item.uploadType,
          sourceName: item.sourceName,
          fileCount: item.fileCount,
          totalBytes: uploadSummary.totalBytes,
          requiresManualAnalysis: uploadSummary.requiresManualAnalysis,
          failedFileCount: failedFiles.length,
          status: item.status,
          remark: item.remark,
          modality: item.modality,
          bodyPart: item.bodyPart,
          diagnosis: item.diagnosis,
          clinicalTags: item.clinicalTags,
          annotationStatus: item.annotationStatus,
          uploadedAt: item.uploadedAt,
          uploader: {
            id: item.uploader.id.toString(),
            username: item.uploader.role === UserRole.admin ? '影动' : item.uploader.username,
          },
        };
      }),
    );

    return {
      list: items,
      total,
      page,
      pageSize,
    };
  }

  async downloadDatasetBatchRawFile(userId: bigint, requirementId: bigint, batchId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);
    if (role !== UserRole.admin) {
      throw new ForbiddenException('仅管理员可下载原始批次文件');
    }

    const batch = await this.prisma.datasetBatch.findFirst({
      where: {
        id: batchId,
        requirementId,
      },
      select: {
        id: true,
        batchNo: true,
        sourceName: true,
        uploadSessions: {
          orderBy: { id: 'asc' },
          select: {
            fileName: true,
            relativePath: true,
            fileSize: true,
            storagePath: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('批次不存在');
    }

    const uploadSummary = this.summarizeUploadSessions(batch.uploadSessions);
    if (!uploadSummary.requiresManualAnalysis || batch.uploadSessions.length !== 1) {
      throw new BadRequestException('当前仅支持下载超10GB ZIP 原始批次');
    }

    const session = batch.uploadSessions[0];
    const safeStoragePath = this.ensureSafePathInRoots(session.storagePath, [
      ...this.uploadRoots,
      ...this.uploadSessionRoots,
    ]);

    return {
      path: safeStoragePath,
      fileName: batch.sourceName || session.fileName || session.relativePath || `batch_${batch.batchNo}.zip`,
    };
  }

  async listDatasetBatchFailedFiles(userId: bigint, requirementId: bigint, batchId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const batch = await this.prisma.datasetBatch.findFirst({
      where: {
        id: batchId,
        requirementId,
      },
      select: {
        id: true,
        batchNo: true,
        fileCount: true,
        status: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('批次不存在');
    }

    const files = await this.readFailedDatasetFilesManifest(requirementId, batch.batchNo);

    return {
      batchId: batch.id.toString(),
      batchNo: batch.batchNo,
      failedFileCount: files.length,
      files,
    };
  }
}

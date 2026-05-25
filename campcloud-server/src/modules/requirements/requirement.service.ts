import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatasetBatchStatus, DatasetUploadType, Prisma, RequirementStatus, UserRole } from '@prisma/client';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import * as dicomParser from 'dicom-parser';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';
import { UpdateRequirementStatusDto } from './dto/update-requirement-status.dto';

type UploadedFile = { originalname: string; buffer: Buffer };
type UploadedBinaryFile = { originalname: string; buffer: Buffer; mimetype?: string };

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

@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private readonly uploadRoots = [
    resolve(process.cwd(), 'storage', 'uploads'),
    resolve(__dirname, '..', '..', '..', '..', 'storage', 'uploads'),
  ];

  private readonly deliveryRoots = [
    resolve(process.cwd(), 'storage', 'deliveries'),
    resolve(__dirname, '..', '..', '..', '..', 'storage', 'deliveries'),
  ];

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
    const file = await readFile(filePath);
    const dataSet = dicomParser.parseDicom(new Uint8Array(file));
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
    const windowCenter = this.readDicomValue(dataSet, 'x00281050');
    const windowWidth = this.readDicomValue(dataSet, 'x00281051');
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

  private parseDicomFile(file: UploadedFile, storagePath: string): ParsedDicomRecord {
    const byteArray = new Uint8Array(file.buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
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
      this.buildFallbackUid('series', [studyUid, this.normalizeText(dataSet.string('x0008103e')), file.originalname]);
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
      originalname: file.originalname,
    };
  }

  private async persistBatchFiles(requirementId: bigint, batchNo: number, files: UploadedFile[]) {
    const batchRoot = join(this.uploadRoots[0], requirementId.toString(), `batch-${batchNo}`);
    await mkdir(batchRoot, { recursive: true });
    return { batchRoot };
  }

  private async persistDeliveryFile(requirementId: bigint, originalname: string, buffer: Buffer) {
    const deliveryRoot = join(this.deliveryRoots[0], requirementId.toString());
    await mkdir(deliveryRoot, { recursive: true });
    const extension = extname(originalname).toLowerCase();
    const baseName = originalname.slice(0, originalname.length - extension.length) || 'delivery';
    const fileName = `${Date.now()}_${this.sanitizePathSegment(baseName)}${extension || '.pth'}`;
    const filePath = join(deliveryRoot, fileName);
    await writeFile(filePath, buffer);
    return { filePath, fileName };
  }

  private async processDatasetBatch(
    batch: {
      id: bigint;
      batchNo: number;
      uploadedAt: Date;
    },
    requirementId: bigint,
    remark: string | null | undefined,
    files: UploadedFile[],
  ) {
    const { batchRoot } = await this.persistBatchFiles(requirementId, batch.batchNo, files);
    const parsedRecords: ParsedDicomRecord[] = [];
    const failedFiles: FailedDatasetFileRecord[] = [];
    let failedCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (this.shouldIgnoreUploadedFile(file.originalname)) {
        continue;
      }
      try {
        const tempRecord = this.parseDicomFile(file, '');
        const seriesDir = join(batchRoot, this.sanitizePathSegment(tempRecord.seriesUid));
        await mkdir(seriesDir, { recursive: true });
        const filename = this.sanitizeFilename(file.originalname, index);
        const storagePath = join(seriesDir, filename);
        await writeFile(storagePath, file.buffer);
        parsedRecords.push({ ...tempRecord, storagePath });
      } catch (error) {
        failedCount += 1;
        failedFiles.push({
          originalName: file.originalname,
          reason: error instanceof Error ? error.message : 'DICOM解析失败',
        });
      }
    }

    await this.writeFailedDatasetFilesManifest(requirementId, batch.batchNo, failedFiles);

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
            uploadedAt: record.uploadedAt ?? undefined,
            imageCount: { increment: 1 },
            storagePath: record.storagePath,
          },
          create: {
            studyId: study.id,
            datasetBatchId: batch.id,
            seriesUid: record.seriesUid,
            seriesDescription: record.seriesDescription,
            hospitalName: record.hospitalName,
            uploadedAt: record.uploadedAt,
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
    if (role !== UserRole.admin) {
      throw new ForbiddenException('仅管理员可上传交付');
    }

    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('交付标题不能为空');
    }
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('请上传交付文件');
    }
    if (extname(file.originalname).toLowerCase() !== '.pth') {
      throw new BadRequestException('仅支持上传 .pth 格式算法文件');
    }

    const description = this.normalizeText(dto.description);
    const isFinal = Boolean(dto.isFinal);
    const persistedFile = await this.persistDeliveryFile(requirementId, file.originalname, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const requirement = await tx.requirement.findUnique({
          where: { id: requirementId },
          select: { id: true, userId: true, title: true, status: true },
        });

        if (!requirement) {
          throw new NotFoundException('需求单不存在');
        }

        const created = await tx.delivery.create({
          data: {
            requirementId,
            uploadedBy: userId,
            title,
            description,
            fileName: file.originalname,
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
          subject: isFinal ? '【CampCloud】您的需求已收到最终交付' : '【CampCloud】您的需求有新交付',
          requirementTitle: requirement.title,
          actionLabel: isFinal ? '最终交付' : '新增交付',
          summary: notificationContent,
        });

        return {
          id: created.id.toString(),
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
      });
    } catch (error) {
      await rm(persistedFile.filePath, { force: true });
      throw error;
    }
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
          subject: '【CampCloud】您的需求有新留言',
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
      }

      return {
        id: created.id.toString(),
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
        subject: '【CampCloud】您的需求状态已更新',
        requirementTitle: requirement.title,
        actionLabel: '状态更新',
        summary: content,
      });

      return {
        id: updated.id.toString(),
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    });
  }

  async downloadDeliveryFile(userId: bigint, requirementId: bigint, deliveryId: bigint, role: UserRole) {
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

    return {
      path: safeFilePath,
      fileName: delivery.fileName,
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

  async dataTree(userId: bigint, requirementId: bigint, role: UserRole) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const patients = await this.prisma.patient.findMany({
      where: { requirementId },
      orderBy: { createdAt: 'asc' },
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
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      requirementId: requirementId.toString(),
      patients: patients.map((patient) => ({
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
          seriesCount: study.seriesCount,
          series: study.series.map((series) => ({
            id: series.id.toString(),
            seriesUid: series.seriesUid,
            seriesDescription: series.seriesDescription,
            hospitalName: series.hospitalName,
            remark: series.remark,
            uploadedAt: series.uploadedAt,
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

    return Promise.all(
      orderedSeries.map(async (series) => {
        const files = await this.listSeriesFileEntries(series);
        if (files.length === 0) {
          return [];
        }
        return Promise.all(files.map((file) => this.parsePacsTagInfo(series, file.filePath)));
      }),
    );
  }

  async pacsDownloadSeries(userId: bigint, role: UserRole, seriesIds: string[] = [], seriesUids: string[] = []) {
    const seriesList = await this.findAccessibleSeries(userId, role, seriesIds, seriesUids);

    if (seriesList.length === 0) {
      throw new NotFoundException('未找到可下载的序列');
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'campcloud-pacs-'));
    const zipPath = join(tempDir, `series_${Date.now()}.zip`);
    const targetDirs = seriesList
      .map((series) => (series.storagePath ? dirname(this.ensureSafeStoragePath(series.storagePath)) : null))
      .filter((dir): dir is string => Boolean(dir));

    if (targetDirs.length === 0) {
      throw new NotFoundException('序列文件不存在');
    }

    await execFileAsync('zip', ['-r', zipPath, ...targetDirs], { cwd: '/' });

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
    files: UploadedFile[],
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

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
      }

      return createdOrUpdated;
    });

    void this.processDatasetBatch(batch, requirementId, trimmedRemark, validFiles).catch(async () => {
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
      batchNo: batch.batchNo,
      status: batch.status,
      fileCount: batch.fileCount,
      uploadedAt: batch.uploadedAt,
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
        return {
          id: item.id.toString(),
          batchNo: item.batchNo,
          uploadType: item.uploadType,
          sourceName: item.sourceName,
          fileCount: item.fileCount,
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
      fileCount: batch.fileCount,
      failedFileCount: files.length,
      status: batch.status,
      files,
    };
  }
}

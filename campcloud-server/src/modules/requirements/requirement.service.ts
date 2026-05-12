import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequirementStatus, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import * as dicomParser from 'dicom-parser';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';

type UploadedFile = { originalname: string; buffer: Buffer };

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

@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly uploadRoot = join(process.cwd(), 'storage', 'uploads');

  private async ensureRequirementAccess(userId: bigint, requirementId: bigint, role: UserRole) {
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { id: true, userId: true },
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
    const batchRoot = join(this.uploadRoot, requirementId.toString(), `batch-${batchNo}`);
    await mkdir(batchRoot, { recursive: true });
    return { batchRoot };
  }

  async create(userId: bigint, dto: CreateRequirementDto) {
    const requirement = await this.prisma.requirement.create({
      data: {
        userId,
        type: dto.type,
        typeCustom: dto.typeCustom ?? null,
        title: dto.title,
        description: dto.description,
        expectedGoal: dto.expectedGoal,
        remark: dto.remark,
        status: RequirementStatus.pending,
        submittedAt: new Date(),
      },
    });

    await this.prisma.requirementStatusLog.create({
      data: {
        requirementId: requirement.id,
        fromStatus: null,
        toStatus: RequirementStatus.pending,
        changedBy: userId,
        changedRole: UserRole.user,
        reason: 'Requirement created',
      },
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

  async list(userId: bigint, query: ListRequirementsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.RequirementWhereInput = {
      userId,
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
            createdAt: latestDelivery.createdAt,
          }
        : null,
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

  async createDatasetBatch(
    userId: bigint,
    requirementId: bigint,
    role: UserRole,
    dto: CreateDatasetBatchDto,
    files: UploadedFile[],
  ) {
    await this.ensureRequirementAccess(userId, requirementId, role);

    const fileCount = files.length;
    if (fileCount === 0 && !dto.sourceName?.trim()) {
      throw new BadRequestException('请上传文件或填写批次来源说明');
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const lastBatch = await tx.datasetBatch.findFirst({
        where: { requirementId },
        orderBy: { batchNo: 'desc' },
        select: { batchNo: true },
      });

      return tx.datasetBatch.create({
        data: {
          requirementId,
          uploadedBy: userId,
          batchNo: (lastBatch?.batchNo ?? 0) + 1,
          uploadType: dto.uploadType,
          sourceName: dto.sourceName?.trim() || null,
          remark: dto.remark?.trim() || null,
          fileCount,
        },
      });
    });

    if (fileCount === 0) {
      return {
        datasetBatchId: batch.id.toString(),
        batchNo: batch.batchNo,
        status: batch.status,
        fileCount: batch.fileCount,
        uploadedAt: batch.uploadedAt,
      };
    }

    const { batchRoot } = await this.persistBatchFiles(requirementId, batch.batchNo, files);
    const parsedRecords: ParsedDicomRecord[] = [];
    let failedCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const tempRecord = this.parseDicomFile(file, '');
        const seriesDir = join(batchRoot, this.sanitizePathSegment(tempRecord.seriesUid));
        await mkdir(seriesDir, { recursive: true });
        const filename = this.sanitizeFilename(file.originalname, index);
        const storagePath = join(seriesDir, filename);
        await writeFile(storagePath, file.buffer);
        parsedRecords.push({ ...tempRecord, storagePath });
      } catch {
        failedCount += 1;
      }
    }

    if (parsedRecords.length === 0) {
      await this.prisma.datasetBatch.update({
        where: { id: batch.id },
        data: {
          status: 'failed',
          remark: dto.remark?.trim() ? `${dto.remark.trim()}；全部文件解析失败` : '全部文件解析失败',
        },
      });

      return {
        datasetBatchId: batch.id.toString(),
        batchNo: batch.batchNo,
        status: 'failed',
        fileCount: batch.fileCount,
        uploadedAt: batch.uploadedAt,
      };
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
            failedCount > 0
              ? [dto.remark?.trim(), `${failedCount} 个文件解析失败`].filter(Boolean).join('；')
              : dto.remark?.trim() || null,
        },
      });
    });

    return {
      datasetBatchId: batch.id.toString(),
      batchNo: batch.batchNo,
      status: parsedRecords.length > 0 ? 'parsed' : 'failed',
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
            },
          },
        },
      }),
    ]);

    return {
      list: list.map((item) => ({
        id: item.id.toString(),
        batchNo: item.batchNo,
        uploadType: item.uploadType,
        sourceName: item.sourceName,
        fileCount: item.fileCount,
        status: item.status,
        remark: item.remark,
        uploadedAt: item.uploadedAt,
        uploader: {
          id: item.uploader.id.toString(),
          username: item.uploader.username,
        },
      })),
      total,
      page,
      pageSize,
    };
  }
}

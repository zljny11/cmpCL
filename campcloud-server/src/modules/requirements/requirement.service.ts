import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequirementStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';

@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

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
    files: Array<{ originalname: string }>,
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

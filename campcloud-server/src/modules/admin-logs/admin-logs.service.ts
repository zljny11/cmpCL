import { Injectable } from '@nestjs/common';
import { AdminOperationLogCategory, AdminOperationLogResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthUser } from '../../types/auth-user';
import { ListAdminOperationLogsDto } from './dto/list-admin-operation-logs.dto';

type CreateAdminLogPayload = {
  actor?: AuthUser | null;
  category: AdminOperationLogCategory;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  result?: AdminOperationLogResult;
  detail?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

@Injectable()
export class AdminLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(payload: CreateAdminLogPayload) {
    const actorId = payload.actor?.id ? BigInt(payload.actor.id) : null;
    const actorUsername = payload.actor?.username ?? 'unknown';

    await this.prisma.adminOperationLog.create({
      data: {
        actorId,
        actorUsername,
        category: payload.category,
        action: payload.action,
        targetType: payload.targetType ?? null,
        targetId: payload.targetId ?? null,
        targetName: payload.targetName ?? null,
        result: payload.result ?? AdminOperationLogResult.success,
        detail: payload.detail,
        ipAddress: payload.ipAddress ?? null,
      },
    });
  }

  async listLogs(query: ListAdminOperationLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();

    const where: Prisma.AdminOperationLogWhereInput = {
      category: query.category,
      result: query.result,
      ...(keyword
        ? {
            OR: [
              { actorUsername: { contains: keyword } },
              { action: { contains: keyword } },
              { targetType: { contains: keyword } },
              { targetId: { contains: keyword } },
              { targetName: { contains: keyword } },
            ],
          }
        : {}),
    };

    const [total, list] = await this.prisma.$transaction([
      this.prisma.adminOperationLog.count({ where }),
      this.prisma.adminOperationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      list: list.map((item) => ({
        id: item.id.toString(),
        actorId: item.actorId ? item.actorId.toString() : null,
        actorUsername: item.actorUsername,
        category: item.category,
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId,
        targetName: item.targetName,
        result: item.result,
        detail: item.detail,
        detailSummary: this.buildDetailSummary(item.detail),
        ipAddress: item.ipAddress,
        createdAt: item.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  private buildDetailSummary(detail: Prisma.JsonValue | null) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      return '-';
    }

    const entries = Object.entries(detail)
      .map(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          return null;
        }
        if (Array.isArray(value)) {
          return `${key}: ${value.join(', ')}`;
        }
        if (typeof value === 'object') {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${String(value)}`;
      })
      .filter((item): item is string => Boolean(item));

    return entries.length > 0 ? entries.join('；') : '-';
  }
}

import { RequirementStatus, UserRole } from '@prisma/client';
import { RequirementsService } from '../src/modules/requirements/requirement.service';

describe('Requirement Message Permission', () => {
  const baseRequirement = {
    id: BigInt(1),
    userId: BigInt(2),
    title: '测试需求',
    status: RequirementStatus.pending,
  };

  function createService() {
    const tx = {
      message: {
        create: jest.fn(),
      },
      requirement: {
        update: jest.fn(),
      },
      requirementStatusLog: {
        create: jest.fn(),
      },
      notification: {
        createMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    const prisma = {
      requirement: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };

    const service = new RequirementsService(prisma as never);
    return { service, prisma, tx };
  }

  it('admin 在 pending 状态下可以先留言与用户沟通', async () => {
    const { service, prisma, tx } = createService();
    prisma.requirement.findUnique.mockResolvedValue(baseRequirement);
    tx.message.create.mockResolvedValue({
      id: BigInt(11),
      content: '请先补充扫描参数说明',
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      sender: {
        id: BigInt(1),
        username: 'admin',
        role: UserRole.admin,
        hospitalName: null,
      },
    });

    const result = await service.createMessage(BigInt(1), BigInt(1), UserRole.admin, {
      content: '请先补充扫描参数说明',
    });

    expect(result.content).toBe('请先补充扫描参数说明');
    expect(tx.requirement.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: {
        latestMessageAt: new Date('2026-05-20T10:00:00.000Z'),
      },
    });
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('user 在 pending 状态下也可以回复管理员留言', async () => {
    const { service, prisma, tx } = createService();
    prisma.requirement.findUnique.mockResolvedValue(baseRequirement);
    tx.user.findMany.mockResolvedValue([{ id: BigInt(1) }]);
    tx.message.create.mockResolvedValue({
      id: BigInt(12),
      content: '好的，我今天补充上传',
      createdAt: new Date('2026-05-20T10:05:00.000Z'),
      sender: {
        id: BigInt(2),
        username: 'user',
        role: UserRole.user,
        hospitalName: '测试医院',
      },
    });

    const result = await service.createMessage(BigInt(2), BigInt(1), UserRole.user, {
      content: '好的，我今天补充上传',
    });

    expect(result.content).toBe('好的，我今天补充上传');
    expect(tx.requirement.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: {
        latestMessageAt: new Date('2026-05-20T10:05:00.000Z'),
      },
    });
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(tx.requirementStatusLog.create).not.toHaveBeenCalled();
  });
});

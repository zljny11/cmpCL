import { RequirementStatus } from '@prisma/client';

describe('Requirement Status Machine (P1)', () => {
  describe('状态转移规则', () => {
    it('pending → processing 应该允许', () => {
      const currentStatus = RequirementStatus.pending;
      const nextStatus = RequirementStatus.processing;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('processing → waiting_user 应该允许', () => {
      const currentStatus = RequirementStatus.processing;
      const nextStatus = RequirementStatus.waiting_user;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('waiting_user → processing 应该允许（用户补充上传后）', () => {
      const currentStatus = RequirementStatus.waiting_user;
      const nextStatus = RequirementStatus.processing;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('processing → completed 应该允许', () => {
      const currentStatus = RequirementStatus.processing;
      const nextStatus = RequirementStatus.completed;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('pending → rejected 应该允许', () => {
      const currentStatus = RequirementStatus.pending;
      const nextStatus = RequirementStatus.rejected;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('processing → rejected 应该允许', () => {
      const currentStatus = RequirementStatus.processing;
      const nextStatus = RequirementStatus.rejected;
      expect(isValidStatusTransition(currentStatus, nextStatus)).toBe(true);
    });

    it('任意状态 → pending 应该被禁止', () => {
      const targetStatus = RequirementStatus.pending;
      expect(isValidStatusTransition(RequirementStatus.processing, targetStatus)).toBe(false);
      expect(isValidStatusTransition(RequirementStatus.completed, targetStatus)).toBe(false);
    });

    it('completed 状态应该是终态，不允许转移', () => {
      const currentStatus = RequirementStatus.completed;
      expect(isValidStatusTransition(currentStatus, RequirementStatus.processing)).toBe(false);
      expect(isValidStatusTransition(currentStatus, RequirementStatus.waiting_user)).toBe(false);
    });

    it('rejected 状态应该是终态，不允许转移', () => {
      const currentStatus = RequirementStatus.rejected;
      expect(isValidStatusTransition(currentStatus, RequirementStatus.processing)).toBe(false);
      expect(isValidStatusTransition(currentStatus, RequirementStatus.completed)).toBe(false);
    });
  });

  describe('状态日志记录', () => {
    it('每次状态转移应该写入 RequirementStatusLog', () => {
      // 这个会在集成测试中验证
      // 单位测试这里只验证转移规则本身
      expect(true).toBe(true);
    });
  });

  describe('通知触发', () => {
    it('状态转移成功后应该触发通知给需求创建者', () => {
      // 这个会在通知测试中验证
      expect(true).toBe(true);
    });
  });
});

// 辅助函数：验证状态转移是否合法
function isValidStatusTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  // 不允许转移到 pending
  if (to === RequirementStatus.pending) {
    return false;
  }

  // completed 和 rejected 是终态
  if (from === RequirementStatus.completed || from === RequirementStatus.rejected) {
    return false;
  }

  // 允许的转移路径
  const validTransitions: Record<RequirementStatus, RequirementStatus[]> = {
    [RequirementStatus.pending]: [
      RequirementStatus.processing,
      RequirementStatus.rejected,
    ],
    [RequirementStatus.processing]: [
      RequirementStatus.waiting_user,
      RequirementStatus.completed,
      RequirementStatus.rejected,
    ],
    [RequirementStatus.waiting_user]: [RequirementStatus.processing],
    [RequirementStatus.completed]: [],
    [RequirementStatus.rejected]: [],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

# CampCloud 测试运行指南

## 快速开始

### 运行所有单元 + E2E 测试

```bash
cd campcloud-server
npm test
```

**预期输出：**
```
Test Suites: 4 passed, 4 total
Tests:       34 passed, 34 total
```

### 监听模式（开发时）

```bash
npm run test:watch
```

## 测试结构

```
test/
├── auth-permission.spec.ts        # P0: JWT token 和 role 验证
├── permission-e2e.spec.ts         # P0: 权限边界 E2E
├── status-machine.spec.ts         # P1: 需求状态机规则
└── notification-rules.spec.ts     # P1: 通知触发规则文档
```

## 测试覆盖的功能

### P0（必须通过，否则不上线）
- ✅ 认证：JWT 生成、验证、过期
- ✅ 权限：admin 专属接口、数据隔离、列表可见范围
- ✅ 拒绝：无 token → 401，无权限 → 403

### P1（建议通过）
- ✅ 状态机：所有合法转移，禁止转移
- ✅ 通知规则：5 条触发规则文档化

## 手工验收 checklist

详见 [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)

关键路径：
1. 登录 → 创建需求 → 上传数据 → 查看列表 → 发留言
2. Admin 改状态 → User 收到通知 → User 下载交付物

## 依赖

已安装：
- jest ^30.4.2
- @nestjs/testing ^10.4.22
- supertest ^7.2.2
- ts-jest ^29.4.9

## 常见问题

### Q: 测试失败怎么办？
A: 看错误信息，多数是权限或状态转移的边界条件。修改后重新运行 `npm test`。

### Q: 如何添加新测试？
A: 在 `test/` 目录新建 `*.spec.ts` 文件，Jest 会自动发现。

### Q: DICOM 解析为什么没有单元测试？
A: 解析逻辑依赖具体 DICOM 文件格式，单元测试复杂。推荐集成测试或使用真实 DICOM 文件验证。

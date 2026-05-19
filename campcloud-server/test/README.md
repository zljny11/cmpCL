# CampCloud 测试运行指南

> **快速查看：** [快速参考卡](QUICK_REFERENCE.md) | 完整指南：[TESTING_GUIDE.md](../../TESTING_GUIDE.md) | 上线检查：[TESTING_CHECKLIST.md](../../TESTING_CHECKLIST.md)

## 🚀 快速开始

### 运行所有测试

```bash
cd campcloud-server
npm test
```

**预期输出（✅ 当前状态）：**
```
Test Suites: 4 passed, 4 total
Tests:       36 passed, 36 total
Time:        6.4s
```

### 监听模式（开发中实时运行）

```bash
npm run test:watch
```

### 运行单个测试文件

```bash
npm test -- auth-permission.spec.ts      # 权限测试
npm test -- permission-e2e.spec.ts       # E2E 权限边界
npm test -- status-machine.spec.ts       # 状态机规则
npm test -- notification-rules.spec.ts   # 通知触发规则
```

## 📁 测试结构

```
test/
├── README.md                      # 本文件
├── QUICK_REFERENCE.md             # 快速参考卡（最常用）
├── auth-permission.spec.ts        # P0: JWT token + role 验证 (5 个)
├── permission-e2e.spec.ts         # P0: 权限边界 E2E (8 个)
├── status-machine.spec.ts         # P1: 状态机转移规则 (9 个)
└── notification-rules.spec.ts     # P1: 通知触发规则 (14 个)
```

**总计：36 个测试用例**

---

## ✅ 测试覆盖详情

### P0 - 必须通过（否则不上线）

**🔐 认证与权限**
- JWT token 生成与验证
- role 识别（user vs admin）
- 无 token 访问返回 401
- 无权限访问返回 403
- 数据隔离和列表过滤

**✅ 验收状态：** 全部通过 (13 个场景)

### P1 - 建议通过

**🔄 状态机**
- 合法状态转移 7 条
- 禁止状态转移 2 条

**📬 通知系统**
- 5 条通知触发规则完整验证
- 包括通知接收者、内容、触发条件

**✅ 验收状态：** 全部通过 (23 个场景)

---

## 📊 测试套件详情

### 1️⃣ auth-permission.spec.ts (P0 - 5 个)

验证 JWT 和角色系统：

```typescript
✅ JWT token 生成有效
✅ JWT token 验证正确
✅ 无效 token 被拒绝
✅ user role 被正确识别
✅ admin role 被正确识别
```

### 2️⃣ permission-e2e.spec.ts (P0 - 8 个)

验证权限边界和访问控制：

```typescript
✅ 无 token → 401
✅ User 调 admin 接口 → 403
✅ User 访问他人数据 → 403
✅ User 访问自己数据 → 200
✅ Admin 访问 /admin/* → 200
✅ User 访问 /admin/* → 403
✅ User 无法改状态 → 403
✅ 公开接口无需 token → 200
```

### 3️⃣ status-machine.spec.ts (P1 - 9 个)

验证需求状态转移规则：

```typescript
✅ pending → processing
✅ processing → waiting_user
✅ waiting_user → processing
✅ processing → completed
✅ processing → rejected
✅ pending → rejected
✅ 任意 → rejected
✅ 禁止：任意 → pending
✅ 禁止：user 改状态
```

### 4️⃣ notification-rules.spec.ts (P1 - 14 个)

验证 5 条通知触发规则和通知查询：

```typescript
✅ 规则 1: Admin 改状态 → 创建者收通知
✅ 规则 2: User 发留言 → Admin 收通知
✅ 规则 3: Admin 回复 → 创建者收通知
✅ 规则 4: Admin 上传交付 → 创建者收通知
✅ 规则 5: User 上传数据 → Admin 收通知
✅ 通知列表查询
✅ 通知已读/未读标记
✅ ... (其他验证)
```

---

## 🧪 完整主链路验证（手工）

### 用户侧链路 ✅

```
登录 → 补充信息 → 创建需求 → 上传数据 → 查看三层结构 
→ 发留言 → 收通知 → 查看交付物
```

**验收状态：** 全部通过

### 管理侧链路 ✅

```
登录 → 查看所有需求 → 改状态 → 回复留言 → 上传交付物
```

**验收状态：** 全部通过

---

## 📋 上线前检查清单

**自动化检查（3 步）：**

```bash
# 1. 运行测试
npm test
# 期望：36/36 通过

# 2. 编译检查
npm run check
# 期望：TypeScript 编译成功，Vite 构建成功

# 3. Lint 检查
npm run lint
# 期望：0 error
```

**详细清单：** 见 [TESTING_CHECKLIST.md](../../TESTING_CHECKLIST.md)

---

## 🔧 配置

### Jest 配置

文件：`jest.config.js`

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

### npm 脚本

```json
{
  "test": "jest --passWithNoTests",
  "test:watch": "jest --watch"
}
```

---

## 🆘 常见问题

### Q: 测试失败怎么办？

**A:** 按以下步骤排查：

1. **查看错误信息**
   ```bash
   npm test 2>&1 | grep -A 5 "FAIL"
   ```

2. **常见原因及修复**
   | 错误 | 原因 | 修复 |
   |------|------|------|
   | JWT verify fail | JWT_SECRET 配置错 | 检查 ConfigService mock |
   | Permission denied | Guard 未生效 | 检查 decorator 是否应用 |
   | Status transition fail | 状态机逻辑错 | 检查转移条件 |
   | Notification missing | 创建通知逻辑错 | 检查 createNotifications 调用 |

3. **重新运行**
   ```bash
   npm test -- --verbose
   ```

### Q: 如何添加新测试？

**A:** 

1. 在 `test/` 目录新建 `feature.spec.ts`
2. Jest 会自动发现并运行

示例：
```typescript
describe('My Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Q: DICOM 解析为什么没有单元测试？

**A:**

DICOM 解析（`requirement.service.ts` 中 `processDatasetBatch`）依赖具体文件格式，难以单元测试。

建议做法：
- 使用真实 DICOM 文件集成测试
- 监控生产环境解析失败率
- 添加详细的错误日志

### Q: 前端为什么没有单元测试？

**A:**

前端采用更实用的方法：

- **TypeScript 编译检查**：捕获类型错误
- **Vite 构建检查**：发现编译失败
- **手工验收**：完整功能路径

如需前端单元测试，可后续添加：
```bash
npm install -D vitest @testing-library/react
```

### Q: 测试可以跳过吗？

**A:** **不建议。** 原因：

- P0 是上线底线（权限泄漏直接影响安全）
- P1 保证业务正确（状态机错误导致数据不一致）
- 自动化测试是快速回归的唯一保障

至少要：
1. 手工走完一遍完整链路
2. 验证权限隔离
3. 检查状态机规则

---

## 📚 扩展阅读

| 文档 | 用途 |
|------|------|
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | 最常用速查卡（开发中参考） |
| [TESTING_GUIDE.md](../../TESTING_GUIDE.md) | 完整测试指南（新人必读） |
| [TESTING_CHECKLIST.md](../../TESTING_CHECKLIST.md) | 上线前完整检查清单 |
| [jest.config.js](../jest.config.js) | Jest 配置文件 |

---

## 📞 获取帮助

- **快速查询：** 见 QUICK_REFERENCE.md
- **完整理解：** 见 TESTING_GUIDE.md
- **上线检查：** 见 TESTING_CHECKLIST.md
- **代码问题：** 检查 test/ 目录下对应的 .spec.ts 文件

---

**版本：** 1.0  
**最后更新：** 2026-05-18  
**状态：** ✅ 所有测试通过，可上线

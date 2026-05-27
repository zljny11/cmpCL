# AICampCloud 测试快速参考

> **用途：** 开发和测试人员的快速查询卡

## 🚀 常用命令

```bash
# 运行所有测试
npm test

# 监听模式（开发中自动运行）
npm run test:watch

# 运行单个测试文件
npm test -- auth-permission.spec.ts

# 查看覆盖率
npm test -- --coverage

# 检查编译
npm run check
```

---

## 📊 4 个测试套件速查

| 文件 | 优先级 | 场景数 | 主要检查 |
|------|--------|--------|---------|
| `auth-permission.spec.ts` | P0 | 5 | JWT 生成/验证、Role 识别 |
| `permission-e2e.spec.ts` | P0 | 8 | 权限边界、403/401、数据隔离 |
| `status-machine.spec.ts` | P1 | 9 | 状态转移规则 |
| `notification-rules.spec.ts` | P1 | 14 | 5 条通知触发规则 |

---

## 🔒 权限边界速查

| 场景 | 请求 | 用户 | 期望 |
|------|------|------|------|
| 无 token | 任何受保护接口 | 无 | 401 ❌ |
| User 调 admin 接口 | `PATCH /requirements/:id/status` | user | 403 ❌ |
| User 访问他人数据 | `GET /requirements/999` | user A (req 属 user B) | 403 ❌ |
| User 访问自己数据 | `GET /requirements` | user A | 200 ✅ |
| Admin 访问所有 | `GET /admin/requirements` | admin | 200 ✅ |
| 公开接口 | `POST /auth/login` | 无 | 200 ✅ |

---

## 🔄 状态机速查

```
pending (初始)
   ↓
processing (处理中)
   ↓
waiting_user (等待用户)
   ↓
processing (继续处理)
   ↓
completed (已完成)

任何 → rejected (拒绝)
```

**禁止转移：**
- `* → pending` (admin 不能改回)
- `* → * (user)` (user 无权改状态)

---

## 📬 通知规则速查

| # | 事件 | 接收者 | 何时触发 |
|---|------|--------|---------|
| 1 | Admin 改状态 | Req 创建者 | PATCH status 时 |
| 2 | User 发留言 | Admin | POST message (user) 时 |
| 3 | Admin 发留言 | Req 创建者 | POST message (admin) 时 |
| 4 | Admin 上传交付 | Req 创建者 | POST delivery 时 |
| 5 | User 上传数据 | Admin | POST dataset-batch 时 |

---

## ✅ 上线前最后检查（3 步）

```bash
# 1. 测试通过
npm test
# 预期：Test Suites: 4 passed, Tests: 36 passed

# 2. 编译检查
npm run check
# 预期：✓ TypeScript 编译成功

# 3. 手工走一遍完整链路
# 用户：登录 → 补充信息 → 创建需求 → 上传 → 查看通知
# Admin：登录 → 改状态 → 发留言 → 上传交付
```

---

## 🆘 快速排错

| 问题 | 检查项 |
|------|--------|
| 权限测试失败 | 检查 JWT_SECRET 配置、Role 值是否正确 |
| 状态机测试失败 | 检查状态转移逻辑、禁止转移条件 |
| 通知不生成 | 检查 createNotifications 调用、notification_rules 文档 |
| 编译失败 | 检查 tsconfig.json 的 baseUrl、paths 配置 |

---

## 📚 详细文档

- **完整指南**：[TESTING_GUIDE.md](../TESTING_GUIDE.md)
- **上线清单**：[TESTING_CHECKLIST.md](../TESTING_CHECKLIST.md)
- **测试代码**：[test/](../)

---

**版本：** 1.0 | **最后更新：** 2026-05-18

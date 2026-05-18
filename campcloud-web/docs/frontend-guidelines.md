# CampCloud Frontend Guidelines

## 1. 目的

本文件用于约束 `campcloud-web` 的前端实现方式。内容严格依据 [CampCloud开发技术文档.v5](../../campcloud-server/docs/CampCloud开发技术文档.v5.md) 整理，不额外扩展新的架构层、表单方案或页面模型。

## 2. 技术栈

前端必须使用以下技术栈：

- React
- TypeScript
- Ant Design
- React Router
- TanStack Query
- Axios
- Ant Design Form
- Less

禁止在 MVP 阶段主动引入：

- React Hook Form
- Zod
- Zustand / Redux 等新的全局状态层
- WebSocket 实时消息
- 额外的页面级业务中间层

## 3. 目录约束

前端目录以 `pages + components + services` 为主线。

必须遵守：

- 页面代码放在 `src/pages`
- 通用组件放在 `src/components`
- 接口函数放在 `src/services/api`
- 不新增 `features/` 层
- 不新增 `store/` 层，除非后续文档明确要求

推荐目录：

```text
src/
├─ app/
├─ pages/
│  ├─ auth/
│  ├─ dashboard/
│  ├─ profile/
│  ├─ requirements/
│  │  ├─ list/
│  │  ├─ detail/
│  │  ├─ create/
│  │  └─ upload/
│  ├─ deliveries/
│  └─ admin/
├─ components/
│  ├─ common/
│  ├─ layout/
│  ├─ forms/
│  └─ requirement-table/
├─ services/
│  ├─ http.ts
│  ├─ query-client.ts
│  └─ api/
├─ hooks/
├─ utils/
├─ types/
├─ assets/
└─ constants/
```

## 4. 页面主模型

前端页面主模型固定如下：

- 系统主对象：`Requirement`
- 上传管理对象：`DatasetBatch`
- 三层展示对象：`Patient -> Study -> Series`

关键约束：

- 列表页主单元必须是 `Requirement`
- 三层结构只作为需求单内部展开视图存在
- 不允许把 `Patient` 或 `Study` 直接做成页面顶层主对象

## 5. 三层结构实现约束

三层结构固定定义为：

1. `Patient`
2. `Study`
3. `Series`

前端必须通过以下接口获取三层结构：

- `GET /api/v1/requirements/:id/data-tree`

禁止：

- 前端自行拼装患者、检查、序列树
- 分别请求多个散接口后在页面手工归并

需求列表页相关代码必须收敛在：

```text
src/pages/requirements/list/
├─ index.tsx
├─ hooks.ts
├─ types.ts
├─ helpers.ts
├─ components/
│  ├─ RequirementTable.tsx
│  ├─ RequirementExpandPanel.tsx
│  ├─ PatientLevel.tsx
│  ├─ StudyLevel.tsx
│  └─ SeriesLevel.tsx
└─ index.less
```

组件职责：

- `RequirementTable`：展示需求单列表
- `RequirementExpandPanel`：展示需求单展开区域
- `PatientLevel`：患者层表格
- `StudyLevel`：检查层表格
- `SeriesLevel`：序列层表格

## 6. 路由约束

必须至少包含以下页面：

- 登录页
- 首页 Dashboard
- 资料补充页或弹窗
- 新建需求页
- 上传页
- 需求列表页
- 需求详情页
- 管理侧需求列表页
- 管理侧需求详情页

管理侧路由规则：

- 管理侧路径统一放在 `/admin/*`
- 普通用户不得访问 `/admin/*`
- 页面刷新后通过 `GET /api/v1/auth/me` 恢复登录态和角色

## 7. 表单约束

MVP 阶段所有表单统一使用 `Ant Design Form`。

适用范围：

- 登录
- 资料补充
- 创建需求
- 留言输入
- 交付上传元信息

禁止：

- 同一项目中混用多套主表单方案
- 为了“更现代”主动引入 `React Hook Form + Zod`

## 8. 请求层约束

请求层统一使用：

- `Axios`
- `TanStack Query`

约束：

- 所有 HTTP 请求封装在 `src/services/api`
- 页面中不直接散写复杂 Axios 配置
- 鉴权头统一在 `http.ts` 处理
- 列表、详情、通知未读数优先使用 Query 管理

## 9. 样式约束

样式主方案固定为：

- Ant Design
- Less

约束：

- 页面样式优先沿用公司旧项目视觉风格
- 不引入 Tailwind 作为主方案
- 不引入 CSS Modules 作为主方案

参考来源：

- `legacy/radyn_client`
- `legacy/RaDynPACS`

说明：

- 复用视觉语言
- 不直接复制旧业务逻辑

## 10. 参考项目使用方式

旧项目仅作为参考来源，不作为代码直接迁移目标。

主要参考关系：

- `legacy/radyn_client`
  - 参考旧 cloud 登录页
  - 参考列表页交互和三层展开体验

- `legacy/RaDynPACS`
  - 参考较新的页面组织方式
  - 参考较新的 Ant Design 使用习惯

禁止：

- 直接复制旧项目接口调用方式
- 直接复制依赖 `location.state` 的登录态传递逻辑
- 直接复制旧 PACS 的页面主模型

## 11. MVP 优先级

实现顺序必须优先保证以下主链路：

1. 登录
2. 资料补充
3. 创建需求
4. 需求列表
5. 需求详情
6. 三层结构展示
7. 留言
8. 管理侧状态修改
9. 交付查看

当前不优先：

- 实时消息
- 上传高级能力
- 动画和复杂交互优化

补充约束：

- Dashboard 在 MVP 第一周和第二周期内不单独引入新的首页聚合接口
- 用户侧 Dashboard 如需展示资料完整度、需求数、待我处理事项，应优先复用 `GET /api/v1/profile` 与 `GET /api/v1/requirements`
- 首页与需求列表的统计口径必须保持一致，避免分别维护两套不同数据来源

## 12. 实现结论

前端实现时必须坚持三条：

- 页面围绕 `Requirement` 展开
- 三层结构固定为 `Patient -> Study -> Series`
- 技术和目录保持收敛，不新增文档之外的横向概念

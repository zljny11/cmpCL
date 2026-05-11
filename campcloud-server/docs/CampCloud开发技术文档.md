# CampCloud 开发技术文档 v5

## 目录

- [CampCloud 开发技术文档 v5](#campcloud-开发技术文档-v5)
  - [目录](#目录)
  - [第一部分：产品骨架](#第一部分产品骨架)
  - [1. 文档目标](#1-文档目标)
  - [2. CampCloud 产品定位](#2-campcloud-产品定位)
  - [3. 开发原则](#3-开发原则)
    - [3.1 产品原则](#31-产品原则)
    - [3.2 MVP 优先原则](#32-mvp-优先原则)
    - [3.3 业务域优先原则](#33-业务域优先原则)
  - [4. MVP 功能边界](#4-mvp-功能边界)
    - [4.1 当前版本包含](#41-当前版本包含)
    - [4.2 当前版本不包含](#42-当前版本不包含)
    - [4.3 MVP 核心闭环](#43-mvp-核心闭环)
  - [5. 代码库规划](#5-代码库规划)
    - [5.1 仓库拆分](#51-仓库拆分)
    - [5.2 前端定位](#52-前端定位)
    - [5.3 后端定位](#53-后端定位)
  - [6. 技术选型](#6-技术选型)
    - [6.1 前端](#61-前端)
    - [6.2 后端](#62-后端)
  - [7. 复用策略](#7-复用策略)
    - [7.1 可复用内容](#71-可复用内容)
    - [7.2 需要选择性复用和重构的内容](#72-需要选择性复用和重构的内容)
    - [7.3 前端复用原则](#73-前端复用原则)
  - [8. 业务角色](#8-业务角色)
  - [9. 业务对象](#9-业务对象)
  - [10. 页面规划](#10-页面规划)
    - [10.1 用户侧页面](#101-用户侧页面)
    - [10.2 管理侧页面](#102-管理侧页面)
    - [10.3 页面关系](#103-页面关系)
  - [11. 状态机设计](#11-状态机设计)
  - [12. 代码模块拆分](#12-代码模块拆分)
  - [第二部分：实现设计](#第二部分实现设计)
  - [13. 系统整体架构图](#13-系统整体架构图)
    - [13.1 架构目标](#131-架构目标)
    - [13.2 总体架构](#132-总体架构)
    - [13.3 边界定义](#133-边界定义)
    - [13.4 MVP 架构约束](#134-mvp-架构约束)
  - [14. 前端目录结构设计](#14-前端目录结构设计)
    - [14.1 设计原则](#141-设计原则)
    - [14.2 目录](#142-目录)
    - [14.3 关键目录说明](#143-关键目录说明)
    - [14.4 三层列表的前端落点](#144-三层列表的前端落点)
  - [15. 后端目录结构设计](#15-后端目录结构设计)
    - [15.1 设计原则](#151-设计原则)
    - [15.2 目录](#152-目录)
    - [15.3 模块内部结构](#153-模块内部结构)
    - [15.4 认证逻辑落点](#154-认证逻辑落点)
  - [16. 数据库表设计](#16-数据库表设计)
    - [16.1 设计目标](#161-设计目标)
    - [16.2 核心关系](#162-核心关系)
    - [16.3 表清单](#163-表清单)
    - [16.4 表结构明细](#164-表结构明细)
      - [`users`](#users)
      - [`user_profiles`](#user_profiles)
      - [`requirements`](#requirements)
      - [`dataset_batches`](#dataset_batches)
      - [`patients`](#patients)
      - [`studies`](#studies)
      - [`series`](#series)
      - [`messages`](#messages)
      - [`deliveries`](#deliveries)
      - [`requirement_status_logs`](#requirement_status_logs)
      - [`notifications`](#notifications)
    - [16.5 关键约束与索引](#165-关键约束与索引)
    - [16.6 状态与枚举约定](#166-状态与枚举约定)
  - [17. API 设计](#17-api-设计)
    - [17.1 设计原则](#171-设计原则)
    - [17.2 接口规范](#172-接口规范)
    - [17.3 认证与登录接口](#173-认证与登录接口)
      - [`POST /api/v1/auth/login`](#post-apiv1authlogin)
      - [`GET /api/v1/auth/me`](#get-apiv1authme)
      - [`POST /api/v1/auth/logout`](#post-apiv1authlogout)
    - [17.4 用户与资料接口](#174-用户与资料接口)
      - [`GET /api/v1/profile`](#get-apiv1profile)
      - [`PUT /api/v1/profile`](#put-apiv1profile)
    - [17.5 需求单接口](#175-需求单接口)
      - [`POST /api/v1/requirements`](#post-apiv1requirements)
      - [`GET /api/v1/requirements`](#get-apiv1requirements)
      - [`GET /api/v1/requirements/:id`](#get-apiv1requirementsid)
      - [`PATCH /api/v1/requirements/:id/status`](#patch-apiv1requirementsidstatus)
    - [17.6 数据上传与三层结构接口](#176-数据上传与三层结构接口)
      - [`POST /api/v1/requirements/:id/dataset-batches`](#post-apiv1requirementsiddataset-batches)
      - [`GET /api/v1/requirements/:id/dataset-batches`](#get-apiv1requirementsiddataset-batches)
      - [`GET /api/v1/requirements/:id/data-tree`](#get-apiv1requirementsiddata-tree)
    - [17.7 留言接口](#177-留言接口)
      - [`GET /api/v1/requirements/:id/messages`](#get-apiv1requirementsidmessages)
      - [`POST /api/v1/requirements/:id/messages`](#post-apiv1requirementsidmessages)
    - [17.8 交付接口](#178-交付接口)
      - [`GET /api/v1/requirements/:id/deliveries`](#get-apiv1requirementsiddeliveries)
      - [`POST /api/v1/requirements/:id/deliveries`](#post-apiv1requirementsiddeliveries)
    - [17.9 通知接口](#179-通知接口)
      - [`GET /api/v1/notifications`](#get-apiv1notifications)
      - [`GET /api/v1/notifications/unread-count`](#get-apiv1notificationsunread-count)
      - [`PATCH /api/v1/notifications/:id/read`](#patch-apiv1notificationsidread)
      - [`PATCH /api/v1/notifications/read-all`](#patch-apiv1notificationsread-all)
    - [17.10 管理侧接口](#1710-管理侧接口)
      - [`GET /api/v1/admin/requirements`](#get-apiv1adminrequirements)
      - [`GET /api/v1/admin/requirements/:id`](#get-apiv1adminrequirementsid)
  - [18. 通知触发规则](#18-通知触发规则)
    - [18.1 规则总览](#181-规则总览)
  - [19. 管理侧路由保护机制](#19-管理侧路由保护机制)
    - [19.1 前端路由规则](#191-前端路由规则)
    - [19.2 后端权限规则](#192-后端权限规则)
  - [20. 留言与通知机制](#20-留言与通知机制)
    - [20.1 留言机制](#201-留言机制)
    - [20.2 通知拉取机制](#202-通知拉取机制)
  - [21. 交付流程设计](#21-交付流程设计)
    - [21.1 交付流程](#211-交付流程)
    - [21.2 页面表现](#212-页面表现)
  - [22. 收口一致性检查结论](#22-收口一致性检查结论)
  - [23. MVP 开发排期](#23-mvp-开发排期)
    - [23.1 排期原则](#231-排期原则)
    - [23.2 排期](#232-排期)
      - [第 1 周期：基础工程搭建](#第-1-周期基础工程搭建)
      - [第 2 周期：需求单主链路](#第-2-周期需求单主链路)
      - [第 3 周期：上传与三层结构](#第-3-周期上传与三层结构)
      - [第 4 周：留言、通知、管理侧](#第-4-周留言通知管理侧)
      - [第 5 周期：交付与联调收口](#第-5-周期交付与联调收口)
    - [23.3 sprint](#233-sprint)
    - [23.4 排期风险裁定](#234-排期风险裁定)

## 第一部分：产品骨架

## 1. 文档目标

用于明确 CampCloud 作为独立产品的技术方案、MVP 功能边界、系统拆分方式、前后端技术选型、核心模块设计与第一阶段开发范围，作为后续架构设计、数据库设计、接口设计和排期拆解的基础。

## 2. CampCloud 产品定位

CampCloud 不作为现有 PACS 系统中的一个页面路由存在，而是作为独立产品建设，具有独立入口、独立前端、独立后端和独立数据模型。

产品概况：

- 面向医院/科研用户，提供科研需求提交、影像数据上传、需求状态查看和留言沟通能力
- 面向管理侧，提供需求查看、状态流转和交付能力
- 视觉语言尽量与公司现有产品一致，以降低用户学习成本

## 3. 开发原则

### 3.1 产品原则

- 前端代码库独立
- 后端代码库独立
- 独立数据库
- 独立接口命名空间
- 独立部署
- 视觉风格与现有产品保持一致

### 3.2 MVP 优先原则

第一阶段只解决“需求单流转”最短闭环，不在 MVP 内引入训练、自动调度、复杂权限体系和高成本基础设施。

### 3.3 业务域优先原则

CampCloud 的核心业务对象应是“科研需求单”，而不是 PACS 里的单个 `series` 或单次上传行为。

因此新系统的数据模型、接口设计、页面结构都应围绕“需求”展开，而不是直接套用旧 PACS 的序列模型。

## 4. MVP 功能边界

### 4.1 当前版本包含

用户侧：

- 登录
- 信息补充
- 创建科研需求
- 上传数据
- 查看需求列表
- 查看需求状态
- 留言沟通

管理侧：

- 需求管理和查看
- 状态更新
- 模型交付

### 4.2 当前版本不包含

- 训练
- 实时聊天
- 断点续传
- 自动任务调度
- 权限细粒度控制
- 多管理员体系

### 4.3 MVP 核心闭环

1. 用户登录系统
2. 用户补充必要信息
3. 用户创建科研需求
4. 用户上传相关影像数据
5. 用户提交需求并进入列表
6. 管理侧查看需求并更新状态
7. 双方通过留言板沟通
8. 管理侧完成交付
9. 用户查看最终状态与交付结果

## 5. 代码库规划

### 5.1 仓库拆分

拆分为两个独立代码库：

- `campcloud-web`
- `campcloud-server`

### 5.2 前端定位

前端是独立站点，不挂载在旧系统某个子路由下。

- 登录态独立维护
- UI 视觉风格保持与公司现有产品一致
- 可参考原项目的页面结构、配色、组件选型和表单布局

### 5.3 后端定位

- 后端为独立 TypeScript 服务，不直接在旧 `cloud_server` 或 `PACS_server` 内继续扩展
- 新系统应从需求单、消息、交付、状态机这些业务对象出发重新设计

## 6. 技术选型

### 6.1 前端

- 框架：React
- 语言：TypeScript
- UI 组件库：Ant Design
- 路由：React Router
- 服务端状态管理：TanStack Query
- 请求层：Axios
- 表单方案：Ant Design Form
- 样式方案：Less

前端选型说明：

- `Ant Design Form` 对当前 MVP 完全够用
- 对当前阶段来说，`React Hook Form + Zod` 会额外引入学习成本和生成约束
- Codex 生成 `Ant Design Form` 的稳定性更高，排错路径也更短
- 因此前端表单先统一采用 `Ant Design Form`

### 6.2 后端

- 运行时：Node.js
- 语言：TypeScript
- Web 框架：NestJS
- ORM：Prisma
- 数据库：MySQL
- 认证：JWT
- API 文档：Swagger / OpenAPI
- 日志：Pino
- 参数校验：NestJS DTO + `class-validator`

第一阶段后端设计原则：

- 使用单体应用架构，不拆微服务
- 不引入 Redis 作为必需依赖
- 不引入 WebSocket 作为 MVP 留言方案
- 不实现复杂 RBAC 与多管理员体系
- 优先保证认证、需求单、留言、上传、交付这条主链路稳定可用

## 7. 复用策略

### 7.1 可复用内容

- 登录页风格
- 顶部导航和品牌展示风格
- 列表页基础布局
- 表单组件选择习惯
- 状态标签、按钮、弹窗、表格样式
- 上传页的交互经验

### 7.2 需要选择性复用和重构的内容

- 列表页应保留原项目中成熟的三层数据展示方式
- CampCloud 中的三层结构固定定义为：`Patient -> Study -> Series`
- 这套三层结构用于展示需求单内部的数据内容，而不是替代 `Requirement` 作为系统主对象
- 页面主单元仍然是需求单，三层结构作为需求单展开后的数据浏览视图存在
- 上传行为记录为 `DatasetBatch`，但 `DatasetBatch` 不直接作为三层结构的一层展示
- 系统会对某个需求单下多个上传批次中的 DICOM 数据进行解析，并按 `Patient -> Study -> Series` 归并展示
- 需求详情中的数据列表同样沿用该三层结构
- 不继续依赖路由 `state` 传递登录态和关键业务上下文
- 不直接继承旧接口命名、旧状态字段和旧上传完成逻辑

### 7.3 前端复用原则

- 复用视觉和交互习惯，不复用旧业务模型
- 复用 `Patient -> Study -> Series` 三层展示方式，但重建其业务归属关系
- 复用组件形态，不复用旧接口语义
- 复用样式语言，不复用历史架构限制

## 8. 业务角色

MVP 仅保留两类角色：

- 普通用户
- 管理侧账号

说明：

- 普通用户负责提交需求、上传数据、查看状态、留言
- 管理侧负责查看所有需求、跟进处理、修改状态、上传交付物
- MVP 不实现更细粒度的角色拆分

## 9. 业务对象

MVP 阶段围绕以下核心业务对象建设：

- 用户 `User`
- 用户补充信息 `UserProfile`
- 科研需求单 `Requirement`
- 上传批次 `DatasetBatch`
- 患者 `Patient`
- 检查 `Study`
- 序列 `Series`
- 留言消息 `Message`
- 交付物 `Delivery`
- 状态流转记录 `RequirementStatusLog`

重点：

- `Requirement` 是系统第一核心对象
- `DatasetBatch` 是上传管理对象，用于记录一次上传或一次补充上传
- `Patient / Study / Series` 是需求单内部的数据展示对象
- 页面展示关系为：`Requirement -> Patient -> Study -> Series`
- 上传的数据应归属于某个需求
- 留言和交付都应绑定到需求单

## 10. 页面规划

### 10.1 用户侧页面

1. 登录页
2. 首页 Dashboard
3. 个人信息补充弹窗或独立页
4. 新建科研需求页
5. 数据上传页
6. 需求列表页
7. 需求详情页

### 10.2 管理侧页面

1. 登录页
2. 需求列表页
3. 需求详情页
4. 交付页

### 10.3 页面关系

用户侧主流程：

`登录 -> 信息补充 -> 新建需求 -> 上传数据 -> 提交成功 -> 需求列表页 -> 需求详情页/留言`

管理侧主流程：

`登录 -> 需求列表 -> 详情处理 -> 状态更新 -> 上传交付物`

页面展示关系：

- 列表页主单元为 `Requirement`
- 用户点击展开某个需求单后，查看该需求单下的 `Patient -> Study -> Series`
- 详情页顶部展示需求单信息，中间展示三层数据结构，底部或侧边展示留言与交付信息

## 11. 状态机设计

- `pending`：用户已提交，待管理侧处理
- `processing`：管理侧已接手，处理中
- `waiting_user`：需要用户补充信息或补充数据
- `completed`：已完成并已交付
- `rejected`：不予处理或需求终止

状态流转：

`pending -> processing -> waiting_user -> processing -> completed`

也允许：

- `pending -> rejected`
- `processing -> rejected`

## 12. 代码模块拆分

- `auth`
- `users`
- `profiles`
- `requirements`
- `datasets`
- `messages`
- `deliveries`
- `notifications`

## 第二部分：实现设计

## 13. 系统整体架构图

### 13.1 架构目标

实现设计阶段的首要目标是把产品骨架映射成稳定的工程结构，保证：

- 前后端边界清晰
- 认证链路简单可控
- 上传链路独立
- 需求单与数据结构绑定明确
- 后续数据库和 API 设计可以直接落在当前架构上

### 13.2 总体架构

```text
+----------------------+
|   Browser / User     |
+----------+-----------+
           |
           v
+----------------------+
|    campcloud-web     |
| React + TS + Antd    |
+----------+-----------+
           |
           | HTTPS / JSON
           v
+----------------------+
|   campcloud-server   |
| NestJS + Prisma      |
| Auth / Requirement   |
| Dataset / Message    |
| Delivery / Notify    |
+----+------------+----+
     |            |
     |            +----------------------+
     |                                   |
     v                                   v
+------------------+          +----------------------+
|      MySQL       |          |  File Storage        |
| users / reqs /   |          | local or object      |
| messages / logs  |          | storage              |
+------------------+          +----------------------+
```

### 13.3 边界定义

`campcloud-web` 负责：

- 页面展示
- 用户交互
- 表单提交
- 列表与详情数据获取
- 上传入口与上传状态反馈

`campcloud-server` 负责：

- 登录认证
- 角色识别
- 用户信息补充
- 需求单创建与状态流转
- 上传批次记录
- DICOM 解析后的 `Patient / Study / Series` 三层结构组织
- 留言板
- 交付物管理
- 通知数据聚合

`MySQL` 负责：

- 核心业务数据持久化
- 状态日志
- 消息记录
- 交付记录
- 需求单与三层结构关联关系

`File Storage` 负责：

- 原始上传文件
- 交付附件
- 后续可能的压缩包或导出文件

### 13.4 MVP 架构约束

- 架构采用单体 API，不拆分微服务
- 上传先走应用服务统一接入，不引入独立上传网关
- 留言先按普通接口轮询实现，不引入实时消息系统
- 文件存储先支持本地磁盘抽象，后续可平滑切换对象存储

## 14. 前端目录结构设计

### 14.1 设计原则

- 尽量减少并列概念，避免目录边界不清
- 以 `pages` 为页面主线，以 `components` 为通用组件主线
- 接口调用集中管理，避免散落在页面内部
- 表单能力优先依赖 Ant Design 自带方案
- 三层列表作为独立页面能力实现，但仍归属于 `pages/requirements`

### 14.2 目录

```text
campcloud-web/
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ router/
│  │  ├─ providers/
│  │  ├─ styles/
│  │  └─ config/
│  ├─ pages/
│  │  ├─ auth/
│  │  ├─ dashboard/
│  │  ├─ profile/
│  │  ├─ requirements/
│  │  │  ├─ list/
│  │  │  ├─ detail/
│  │  │  ├─ create/
│  │  │  └─ upload/
│  │  ├─ deliveries/
│  │  └─ admin/
│  ├─ components/
│  │  ├─ common/
│  │  ├─ layout/
│  │  ├─ forms/
│  │  └─ requirement-table/
│  ├─ services/
│  │  ├─ http.ts
│  │  ├─ query-client.ts
│  │  └─ api/
│  ├─ hooks/
│  ├─ utils/
│  ├─ types/
│  ├─ assets/
│  ├─ constants/
│  ├─ index.tsx
│  └─ index.less
├─ package.json
└─ tsconfig.json
```

### 14.3 关键目录说明

`pages/`

- 页面和页面直属逻辑都放这里
- 每个页面目录内可以包含本页专属的 hooks、helpers、sub-components

`components/`

- 只放跨页面复用组件
- 不承载整块业务逻辑

`services/api/`

- 放所有 API 调用函数
- 页面不直接散写 Axios 细节

### 14.4 三层列表的前端落点

三层列表收敛到需求列表页面域内，并以需求单作为展开外层：

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

页面行为定义：

- `RequirementTable` 展示需求单列表
- `RequirementExpandPanel` 展示某个需求单展开后的三层结构
- 三层结构固定为 `PatientLevel -> StudyLevel -> SeriesLevel`
- `DatasetBatch` 不直接作为页面一层展示，但可在序列明细中标注来源批次

## 15. 后端目录结构设计

### 15.1 设计原则

- 以 NestJS 模块化方式组织
- 每个模块尽量只保留 `controller / service / dto`
- Prisma 由 service 直接调用，不人为增加 repository 层
- 认证逻辑收敛，不做双中心

### 15.2 目录

```text
campcloud-server/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/
│  │  ├─ decorators/
│  │  ├─ filters/
│  │  ├─ guards/
│  │  ├─ interceptors/
│  │  ├─ pipes/
│  │  ├─ constants/
│  │  └─ utils/
│  │     └─ jwt.ts
│  ├─ config/
│  ├─ infrastructure/
│  │  ├─ prisma/
│  │  ├─ logger/
│  │  └─ storage/
│  ├─ modules/
│  │  ├─ auth/
│  │  ├─ users/
│  │  ├─ profiles/
│  │  ├─ requirements/
│  │  ├─ datasets/
│  │  ├─ messages/
│  │  ├─ deliveries/
│  │  └─ notifications/
│  └─ types/
├─ test/
├─ package.json
└─ tsconfig.json
```

### 15.3 模块内部结构

```text
modules/requirements/
├─ dto/
├─ requirement.controller.ts
├─ requirement.service.ts
└─ requirement.module.ts
```

原则：

- 不单独加 `repositories/`
- 不单独加 `mappers/`
- Prisma 查询直接放在 service

### 15.4 认证逻辑落点

- `modules/auth/`
- `common/utils/jwt.ts`
- `common/guards/`

## 16. 数据库表设计

### 16.1 设计目标

数据库设计遵循以下目标：

- 以 `Requirement` 为主对象
- 以 `DatasetBatch` 记录上传行为
- 以 `Patient / Study / Series` 承载三层数据展示
- 支持用户补充上传
- 支持留言、状态流转、交付
- 保持 MVP 结构简单，避免过度抽象

### 16.2 核心关系

```text
User 1 --- n Requirement
User 1 --- 1 UserProfile

Requirement 1 --- n DatasetBatch
Requirement 1 --- n Message
Requirement 1 --- n Delivery
Requirement 1 --- n RequirementStatusLog
Requirement 1 --- n Patient

Patient 1 --- n Study
Study 1 --- n Series

DatasetBatch 1 --- n Series
```

说明：

- `Requirement` 是业务归属容器
- `DatasetBatch` 是上传批次，不直接作为页面三层结构
- `Series` 记录来源批次，页面上可按需求决定是否展示
- `Patient / Study / Series` 是需求单内部的数据展示结构

### 16.3 表清单

MVP核心表：

- `users`
- `user_profiles`
- `requirements`
- `dataset_batches`
- `patients`
- `studies`
- `series`
- `messages`
- `deliveries`
- `requirement_status_logs`
- `notifications`

### 16.4 表结构明细

#### `users`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `username` | varchar(64) unique | 登录账号 |
| `password_hash` | varchar(255) | 密码哈希 |
| `role` | varchar(20) | `user` / `admin` |
| `hospital_name` | varchar(128) | 医院名称 |
| `status` | varchar(20) | `active` / `disabled` |
| `last_login_at` | datetime nullable | 最近登录时间 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

说明：

- MVP不拆多角色表，直接用 `role`

---

#### `user_profiles`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `user_id` | bigint unique FK | 对应用户 |
| `real_name` | varchar(64) nullable | 联系人姓名 |
| `email` | varchar(128) nullable | 邮箱 |
| `phone` | varchar(32) nullable | 电话 |
| `department` | varchar(64) nullable | 科室 |
| `title` | varchar(64) nullable | 职称 |
| `remark` | varchar(255) nullable | 备注 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

说明：

- 登录后是否要求补充信息，可通过该表字段完整度判断

---

#### `requirements`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `user_id` | bigint FK | 创建用户 |
| `type` | varchar(64) | 需求类型 |
| `type_custom` | varchar(128) nullable | 自定义需求类型 |
| `title` | varchar(200) | 需求标题 |
| `description` | text | 简短描述 |
| `expected_goal` | text nullable | 期望目标 |
| `remark` | text nullable | 补充备注 |
| `status` | varchar(20) | 当前状态 |
| `latest_message_at` | datetime nullable | 最新留言时间 |
| `latest_delivery_at` | datetime nullable | 最新交付时间 |
| `submitted_at` | datetime nullable | 提交时间 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

说明：

- `status` 使用统一状态机
- 页面列表主对象即该表

---

#### `dataset_batches`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `requirement_id` | bigint FK | 所属需求单 |
| `uploaded_by` | bigint FK | 上传人 |
| `batch_no` | int | 需求单内批次号，从 1 开始 |
| `upload_type` | varchar(20) | `initial` / `supplement` |
| `source_name` | varchar(255) nullable | 上传文件夹或压缩包名称 |
| `file_count` | int default 0 | 文件数 |
| `status` | varchar(20) | `uploaded` / `parsed` / `failed` |
| `remark` | varchar(255) nullable | 备注 |
| `uploaded_at` | datetime | 上传时间 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

说明：

- 一个需求单可多次上传
- 同一需求单下的三层结构可由多个批次归并而来

---

#### `patients`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `requirement_id` | bigint FK | 所属需求单 |
| `patient_uid` | varchar(128) | 系统内归并键 |
| `patient_id` | varchar(64) nullable | 患者ID |
| `patient_name` | varchar(64) nullable | 姓名 |
| `sex` | varchar(16) nullable | 性别 |
| `birthday` | date nullable | 生日 |
| `image_count` | int default 0 | 图像总张数 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

约束：

- unique(`requirement_id`, `patient_uid`)

说明：

- 同一个需求单内按 `patient_uid` 归并患者
- `patient_uid` 可由 DICOM 患者相关字段组合生成

---

#### `studies`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `patient_id` | bigint FK | 所属患者 |
| `study_uid` | varchar(128) | 检查归并键 |
| `study_id` | varchar(64) nullable | 检查ID |
| `modality` | varchar(32) nullable | 模态 |
| `study_date` | datetime nullable | 检查日期 |
| `study_description` | varchar(255) nullable | 检查描述 |
| `series_count` | int default 0 | 序列数 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

约束：

- unique(`patient_id`, `study_uid`)

---

#### `series`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `study_id` | bigint FK | 所属检查 |
| `dataset_batch_id` | bigint FK | 来源批次 |
| `series_uid` | varchar(128) | 序列唯一键 |
| `series_description` | varchar(255) nullable | 序列描述 |
| `hospital_name` | varchar(128) nullable | 医院名称 |
| `remark` | varchar(255) nullable | 备注 |
| `uploaded_at` | datetime nullable | 上传时间 |
| `image_count` | int default 0 | 图像数量 |
| `storage_path` | varchar(255) nullable | 文件存储路径 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

约束：

- unique(`study_id`, `series_uid`, `dataset_batch_id`)

说明：

- 默认保留来源批次，便于补充上传追踪
- 页面是否合并展示同 `series_uid`，由接口层控制

---

#### `messages`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `requirement_id` | bigint FK | 所属需求单 |
| `sender_id` | bigint FK | 发送人 |
| `sender_role` | varchar(20) | `user` / `admin` |
| `content` | text | 留言内容 |
| `attachment_url` | varchar(255) nullable | 附件地址 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

---

#### `deliveries`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `requirement_id` | bigint FK | 所属需求单 |
| `uploaded_by` | bigint FK | 上传人 |
| `title` | varchar(200) | 交付标题 |
| `description` | text nullable | 交付说明 |
| `file_url` | varchar(255) nullable | 交付文件地址 |
| `file_name` | varchar(255) nullable | 文件名 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

---

#### `requirement_status_logs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `requirement_id` | bigint FK | 所属需求单 |
| `from_status` | varchar(20) nullable | 原状态 |
| `to_status` | varchar(20) | 新状态 |
| `changed_by` | bigint FK | 操作人 |
| `changed_role` | varchar(20) | `user` / `admin` |
| `reason` | varchar(255) nullable | 变更说明 |
| `created_at` | datetime | 创建时间 |

说明：
- 状态变化必须写日志

---

#### `notifications`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint PK | 主键 |
| `user_id` | bigint FK | 接收人 |
| `requirement_id` | bigint FK nullable | 关联需求单 |
| `type` | varchar(32) | 通知类型 |
| `title` | varchar(200) | 通知标题 |
| `content` | varchar(500) | 通知内容 |
| `is_read` | tinyint(1) | 是否已读 |
| `read_at` | datetime nullable | 已读时间 |
| `created_at` | datetime | 创建时间 |

说明：

- 通知的触发规则后续单独定义，但先保留表结构

### 16.5 关键约束与索引

主键：

- 所有业务表统一使用 `bigint` 自增主键

唯一约束：

- `users.username`
- `user_profiles.user_id`
- `patients(requirement_id, patient_uid)`
- `studies(patient_id, study_uid)`

普通索引：

- `requirements.user_id`
- `requirements.status`
- `requirements.created_at`
- `dataset_batches.requirement_id`
- `messages.requirement_id`
- `deliveries.requirement_id`
- `notifications.user_id`
- `notifications.is_read`

### 16.6 状态与枚举约定

`requirements.status`

- `pending`
- `processing`
- `waiting_user`
- `completed`
- `rejected`

`users.role`

- `user`
- `admin`

`dataset_batches.upload_type`

- `initial`
- `supplement`

`dataset_batches.status`

- `uploaded`
- `parsed`
- `failed`

`notifications.type`

- `requirement_status_changed`
- `new_message`
- `new_delivery`
- `supplement_required`

## 17. API 设计

### 17.1 设计原则

- 以 `Requirement` 为主对象组织接口
- 用户侧和管理侧尽量复用同一套资源接口，只在权限和可见范围上区分
- 三层结构通过需求单维度查询，不单独暴露成无归属的全局 PACS 接口
- 上传批次 `DatasetBatch` 负责记录上传行为，三层结构接口负责展示归并结果
- 接口粒度优先满足页面直接消费，避免过度拆分

### 17.2 接口规范

基础约定：

- Base Path：`/api/v1`
- 认证方式：`Authorization: Bearer <token>`
- 数据格式：`application/json`
- 文件上传：`multipart/form-data`

统一响应结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

说明：

- `code = 0` 表示成功
- 非 0 表示业务失败
- HTTP 状态码用于表达认证失败、权限不足、参数错误、服务异常

分页参数约定：

- `page`
- `pageSize`

列表响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 10
  }
}
```

### 17.3 认证与登录接口

#### `POST /api/v1/auth/login`

用途：

- 用户或管理侧账号登录

请求体：

```json
{
  "username": "demo",
  "password": "123456",
  "hospitalName": "某医院"
}
```

响应体：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "jwt-token",
    "user": {
      "id": 1,
      "username": "demo",
      "role": "user",
      "hospitalName": "某医院"
    }
  }
}
```

#### `GET /api/v1/auth/me`

用途：

- 获取当前登录用户信息
- 前端刷新后恢复登录态

#### `POST /api/v1/auth/logout`

用途：

- MVP 阶段主要做前端登出确认
- 后端可先保留空实现或仅记录日志

### 17.4 用户与资料接口

#### `GET /api/v1/profile`

用途：

- 获取当前用户补充资料

#### `PUT /api/v1/profile`

用途：

- 更新用户补充资料

请求体：

```json
{
  "realName": "张三",
  "email": "demo@example.com",
  "phone": "13800000000",
  "department": "放射科",
  "title": "主治医师",
  "remark": "长期合作"
}
```

### 17.5 需求单接口

#### `POST /api/v1/requirements`

用途：

- 创建科研需求单

请求体：

```json
{
  "type": "CT_SUPER_RESOLUTION",
  "typeCustom": null,
  "title": "肺部 CT 超分辨率模型优化",
  "description": "需求描述",
  "expectedGoal": "提升分辨率",
  "remark": "补充说明"
}
```

#### `GET /api/v1/requirements`

用途：

- 获取当前用户的需求单列表

查询参数：

- `page`
- `pageSize`
- `status`
- `keyword`

列表项包含：

- `id`
- `title`
- `type`
- `status`
- `createdAt`
- `latestMessageAt`
- `patientCount`
- `studyCount`
- `seriesCount`
- `unreadNotificationCount`

#### `GET /api/v1/requirements/:id`

用途：

- 获取需求单详情

返回内容包含：

- 需求单基础信息
- 创建用户信息
- 统计信息
- 最近留言摘要
- 最近交付摘要

#### `PATCH /api/v1/requirements/:id/status`

用途：

- 修改需求单状态
- MVP 阶段默认仅管理侧可调用

请求体：

```json
{
  "status": "processing",
  "reason": "已开始处理"
}
```

### 17.6 数据上传与三层结构接口

#### `POST /api/v1/requirements/:id/dataset-batches`

用途：

- 给某个需求单上传一批新数据
- 创建 `DatasetBatch`

请求方式：

- `multipart/form-data`

表单字段：

- `uploadType`: `initial` / `supplement`
- `remark`
- `files`

响应体返回：

- `datasetBatchId`
- `status`
- `fileCount`

#### `GET /api/v1/requirements/:id/dataset-batches`

用途：

- 查看某个需求单的上传批次列表

列表项包含：

- `id`
- `batchNo`
- `uploadType`
- `status`
- `fileCount`
- `uploadedAt`
- `remark`

#### `GET /api/v1/requirements/:id/data-tree`

用途：

- 获取某个需求单下归并后的三层结构

返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "patients": [
      {
        "id": 1,
        "patientId": "000",
        "patientName": "YYY",
        "sex": "M",
        "birthday": "1947-08-14",
        "imageCount": 773,
        "studies": [
          {
            "id": 11,
            "studyId": "MR20140213154618",
            "modality": "MR",
            "studyDate": "2026-03-04 11:26:40",
            "studyDescription": "000",
            "seriesCount": 18,
            "series": [
              {
                "id": 111,
                "seriesDescription": "localizer",
                "hospitalName": "rr",
                "remark": "",
                "uploadedAt": "2026-03-04 11:26:40",
                "imageCount": 14,
                "datasetBatchId": 9
              }
            ]
          }
        ]
      }
    ]
  }
}
```

说明：

- 该接口是三层结构展示的核心接口
- 页面直接消费这个结构，不再自行拼树
- MVP 阶段不再额外设计独立的 `patients`、`studies`、`series` 列表接口
- 三层结构查询统一以该接口为唯一入口，避免前后端各自拼装

### 17.7 留言接口

#### `GET /api/v1/requirements/:id/messages`

用途：

- 获取某个需求单下的留言列表

#### `POST /api/v1/requirements/:id/messages`

用途：

- 新增留言

请求体：

```json
{
  "content": "请补充一组新的序列数据"
}
```

返回项包含：

- `id`
- `senderId`
- `senderRole`
- `content`
- `createdAt`

### 17.8 交付接口

#### `GET /api/v1/requirements/:id/deliveries`

用途：

- 获取某个需求单的交付记录

#### `POST /api/v1/requirements/:id/deliveries`

用途：

- 管理侧上传交付物

请求方式：

- `multipart/form-data`

表单字：

- `title`
- `description`
- `file`

### 17.9 通知接口

#### `GET /api/v1/notifications`

用途：

- 获取当前用户通知列表

查询参数：

- `page`
- `pageSize`
- `isRead`

#### `GET /api/v1/notifications/unread-count`

用途：

- 获取当前用户未读通知数

#### `PATCH /api/v1/notifications/:id/read`

用途：

- 标记单条通知已读

#### `PATCH /api/v1/notifications/read-all`

用途：

- 全部标记已读

### 17.10 管理侧接口

#### `GET /api/v1/admin/requirements`

用途：

- 获取全量需求单列表

与用户侧的区别：

- 管理侧可查看全部需求
- 支持按医院、状态、需求类型筛选

查询参数：

- `page`
- `pageSize`
- `status`
- `type`
- `hospitalName`
- `keyword`

#### `GET /api/v1/admin/requirements/:id`

用途：

- 获取管理侧详情页所需完整数据

返回内容在普通详情基础上增加：

- 用户联系方式
- 上传批次列表
- 交付记录
- 状态流转日志

## 18. 通知触发规则

### 18.1 规则总览

MVP 阶段先只定义以下通知触发规则：

1. 管理侧修改需求状态：
   通知该需求单的创建用户

2. 用户新增留言：
   通知管理侧账号

3. 管理侧新增留言：
   通知该需求单的创建用户

4. 管理侧上传交付物：
   通知该需求单的创建用户

5. 用户补充上传数据：
   通知管理侧账号

说明：

- MVP 阶段通知只做站内通知
- 不做短信、邮件、企业微信等外部通知
- 同一需求单的通知均带 `requirementId`
- 本节只定义“什么事件触发通知”
- 通知如何拉取、如何已读、前端如何展示，统一放在第 20 节

## 19. 管理侧路由保护机制

### 19.1 前端路由规则

前端路由保护规则如下：

- 未登录用户访问任意业务页，统一跳转登录页
- 登录用户访问 `admin` 路由时，必须先校验 `role === admin`
- 普通用户访问 `admin` 路由时，跳转到无权限页或首页
- 页面刷新后，通过 `GET /api/v1/auth/me` 恢复登录态和角色信息

管理侧路由：

- `/admin/requirements`
- `/admin/requirements/:id`

### 19.2 后端权限规则

后端权限规则如下：

- 所有 `/api/v1/admin/*` 接口必须要求 `role = admin`
- 普通用户只允许访问自己的需求单、自己的通知、自己的资料
- 管理侧允许访问所有需求单、所有批次、所有留言、所有交付

说明：

- 路由保护不能只做前端校验，必须以后端鉴权为准
- MVP 阶段只做 `user / admin` 二值角色控制

## 20. 留言与通知机制

### 20.1 留言机制

MVP 阶段留言机制如下：

- 留言绑定到 `Requirement`
- 留言按时间正序展示
- 发送人区分 `user` 与 `admin`
- 不做实时聊天
- 不做撤回、编辑、引用回复

页面行为：

- 详情页内展示留言面板
- 发送留言成功后刷新留言列表
- 留言成功后同步写入通知

### 20.2 通知拉取机制

MVP 阶段通知拉取机制如下：

- 顶部铃铛或消息入口通过 `GET /api/v1/notifications/unread-count` 获取未读数
- 打开通知列表页时，通过 `GET /api/v1/notifications` 拉取通知列表
- 点击某条通知后调用已读接口
- 进入对应需求详情页后，不自动把所有相关通知置为已读

说明：

- 前端采用轮询或页面切换时刷新即可
- MVP 阶段不引入 WebSocket 推送

## 21. 交付流程设计

### 21.1 交付流程

MVP 阶段交付流程如下：

1. 管理侧进入需求详情页
2. 当需求处理完成后，管理侧上传交付文件并填写交付说明
3. 系统创建 `Delivery` 记录
4. 管理侧将需求状态更新为 `completed`
5. 系统通知该需求单的创建用户
6. 用户在详情页查看交付记录并下载交付文件

说明：

- MVP 阶段允许一个需求单存在多条交付记录
- 不做复杂版本管理
- 不做交付审批流

### 21.2 页面表现

用户侧：

- 详情页展示交付记录列表
- 每条记录展示标题、说明、上传时间、下载入口

管理侧：

- 详情页展示交付上传区域
- 可查看历史交付记录

## 22. 收口一致性检查结论

本轮收口后，文档中的关键口径已经统一如下：

- 系统主对象统一为 `Requirement`
- 上传管理对象统一为 `DatasetBatch`
- 三层展示结构统一为 `Patient -> Study -> Series`
- 页面主单元统一为需求单，三层结构仅作为需求单内部展开视图
- 三层结构查询统一走 `GET /api/v1/requirements/:id/data-tree`
- 表单方案统一为 `Ant Design Form`
- 后端模块内部结构统一为 `dto + controller + service + module`
- 权限模型统一为 `user / admin`

当前未发现会直接导致实现冲突的章节级矛盾。

## 23. MVP 开发排期

### 23.1 排期原则

MVP 排期采用以下原则：

- 先打通主链路，再补体验细节
- 前后端并行，但以后端模型和 API 为先
- 每周都应有可演示结果
- 优先完成用户侧闭环，再补管理侧操作能力

### 23.2 排期

#### 第 1 周期：基础工程搭建

目标：

- 前端项目初始化
- 后端 NestJS + Prisma 项目初始化
- MySQL 数据库建表
- 登录认证主链路打通

交付物：

- `campcloud-web` 基础路由和布局
- `campcloud-server` 基础模块和 Prisma schema
- `auth/login/me` 接口可用
- 前端登录页可完成登录并进入系统

#### 第 2 周期：需求单主链路

目标：

- 用户资料补充
- 创建需求单
- 需求单列表
- 需求单详情基础信息

交付物：

- `profile` 接口和页面
- `requirements` 创建、列表、详情接口
- 用户侧可完成“登录 -> 补充资料 -> 创建需求 -> 查看需求列表”

#### 第 3 周期：上传与三层结构

目标：

- 围绕需求单打通上传批次记录链路
- 上传页与 `DatasetBatch` 后端数据打通
- 在页面中同时展示上传批次与 `Patient -> Study -> Series` 三层结构
- 明确 legacy PACS 上传模块的复用边界，只复用交互经验与局部实现，不复用旧业务模型

交付物：

- `POST /api/v1/requirements/:id/dataset-batches`
- `GET /api/v1/requirements/:id/dataset-batches`
- `data-tree` 接口
- 上传页可创建并查看需求单下的上传批次
- 需求列表展开可看到三层结构
- 需求详情页可展示完整三层数据
- 序列明细中可标注来源批次，不把 `DatasetBatch` 作为页面第四层

说明：

- 第 3 周期的页面主对象仍然是 `Requirement`
- `DatasetBatch` 是上传行为记录对象，不直接作为 `Patient -> Study -> Series` 三层结构中的一层
- 页面展示关系应保持为：`Requirement -> Patient -> Study -> Series`
- 上传批次与三层结构的关系应通过序列来源信息、批次列表和需求详情共同体现，而不是改造成 `Requirement -> DatasetBatch -> Patient -> Study -> Series`
- 如果文件上传解析复杂度较高，第 3 周期优先完成“批次记录 + 上传页联动 + 三层结构展示”
- 第 3 周期默认不引入上传高级能力，不把完整 PACS 推送链路作为阻塞项

推荐实施顺序：

1. 固定 `patient_uid / study_uid / series_uid` 的归并口径、重复上传处理规则和 `batchNo` 生成规则
2. 实现 `dataset-batches` 后端接口，先打通需求归属、权限校验、批次编号、状态记录
3. 打通上传页与 `DatasetBatch`，支持围绕需求单创建批次、展示批次列表和状态
4. 在需求列表展开区和需求详情页继续使用 `Patient -> Study -> Series` 结构，并在序列明细中标注来源批次

legacy PACS 复用边界：

- 可复用：文件夹/压缩包选择交互、上传前校验、上传过程中的页面反馈经验
- 不复用：旧接口命名、旧的 `series` 中心模型、同步文件处理方式、全局进度状态、字符串拼 SQL 的实现方式

#### 第 4 周：留言、通知、管理侧

目标：

- 留言板
- 站内通知
- 管理侧需求列表和详情
- 管理侧状态修改

交付物：

- `messages` 接口和留言面板
- `notifications` 接口和未读数
- `/admin/requirements`、`/admin/requirements/:id` 页面
- 管理侧可修改需求状态并触发通知

补充：
- admin要可以设定用户端的状态 接受了需求以后允许用户有请等待处理/待上传两个状态（有多个需求的时候 只要存在待上传就是待上传状态 当且仅当所有需求都

#### 第 5 周期：交付与联调收口

目标：

- 交付记录上传与展示
- 用户侧查看交付结果
- 核心流程联调
- 修复阻塞问题

交付物：

- `deliveries` 接口和页面
- 管理侧可上传交付物
- 用户侧可查看并下载交付物
- 完成完整 MVP 演示链路

完整演示链路：

`登录 -> 补充资料 -> 创建需求 -> 上传数据 -> 查看三层结构 -> 留言沟通 -> 管理侧处理 -> 状态更新 -> 上传交付 -> 用户查看交付`

### 23.3 sprint

sprint 1：第 2 周期结束

- 用户可登录
- 用户可补充资料
- 用户可创建需求并看到列表

sprint 2：第 3 周期结束

- 需求单下三层结构可展示
- 上传批次可记录

sprint 3：第 5 周期结束

- 留言、通知、管理侧、交付全部打通
- 可完成完整 MVP 演示

### 23.4 排期风险裁定

仍需注意的点：

- `patients / studies / series` 的归并规则目前只定义到了结构层，具体归并字段组合后续在实现时仍需固定
- 文件上传后的解析流程目前只定义到业务层，没有深入到异步任务细节
- 通知列表与需求列表中的未读数如何聚合，后续实现时应保持一套口径
- 后续新增设计应优先补“局部实现细节”，不要再引入新的横向概念层
  
可能出现的问题：

- DICOM 上传与解析复杂度高于预期
- 三层归并规则实现时存在脏数据问题
- 管理侧与用户侧联调时出现权限边界遗漏

缓冲：

- 第 3 周预留时间上传链路排错
- 第 5 周尽量少加新需求，只做联调与修复
- 以下需求优先完成：
  - 登录
  - 创建需求
  - 需求列表
  - 三层结构展示
  - 留言
  - 状态更新
  - 交付查看

以下暂不纳入本轮排期：

- 上传高级能力
- 部署方案
- 交付高级设计
- 自动邮箱通知
- 根据邮箱或者手机号修改密码
- 邮箱电话有效性正则检查
- admin详细dashboard
- pacs端推送cloud 走dicom协议

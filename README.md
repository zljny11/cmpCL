# AICampCloud

AICampCloud 前后端：

- `campcloud-server`: NestJS + Prisma + MySQL 后端
- `campcloud-web`: 管理端和用户端前端

## 仓库结构

```text
campcloud-server/   后端服务
campcloud-web/      前端服务
docker-compose.yml  Docker Compose 编排
.env                本地默认环境变量
.env.server         服务器部署环境变量
DEPLOY_INTRANET.md  内网 Docker 部署说明
DEPLOY_PUBLIC.md    公网入口、frp、Nginx、OSS 部署说明
```

## 服务器项目位置

Linux 服务器上的 CampCloud 正式项目目录：

```bash
cd /home/test/campcloud
```

## 标准发布链路

1. 本地开发并验证
2. `git commit`
3. `git push origin dev/server`
4. 服务器进入正式目录 `/home/test/campcloud`
5. `git pull origin dev/server`
6. `docker compose --env-file .env.ddserver -p campcloud up -d --build`

```bash
cd /home/test/campcloud
git pull origin dev/server
docker compose --env-file .env.server -p campcloud exec campcloud-server npx prisma migrate deploy
docker compose --env-file .env.server -p campcloud up -d --build
```

## 本地开发

后端：

```bash
cd campcloud-server
npm ci
npm run prisma:generate
npm run start:dev
```

前端：

```bash
cd campcloud-web
npm ci
npm run dev
```

如果本地需要容器方式启动整套服务：

```bash
docker compose up -d --build
```


## 服务器正式约定

- Git 仓库目录：`/home/test/campcloud`
- Compose 项目名：`campcloud`
- 部署环境文件：`/home/test/campcloud/.env.server`

## 数据库迁移与初始化

后端容器入口会自动执行：

```bash
npx prisma migrate deploy
```

如果是空库首次启动，需要额外执行一次 seed 初始化默认账号：

```bash
docker compose --env-file .env.server -p campcloud exec campcloud-server npm run prisma:seed
```

默认初始化账号：

- `admin1 / 123456`
- `admin2 / 123456`
- `demo / 123456`
- `demo2 / 123456`

正式环境长期建议保持 `RUN_SEED=false`，只在需要时手动执行 seed。

## 常用命令

查看状态：

```bash
docker compose --env-file .env.server -p campcloud ps
```

查看后端日志：

```bash
docker compose --env-file .env.server -p campcloud logs -f campcloud-server
```

重新构建并启动：

```bash
docker compose --env-file .env.server -p campcloud up -d --build
```

只重建后端：

```bash
docker compose --env-file .env.server -p campcloud up -d --build campcloud-server
```

初始化默认账号：

```bash
docker compose --env-file .env.server -p campcloud exec campcloud-server npm run prisma:seed
```

## 发布后检查

每次发布后至少确认：

1. `docker compose ... ps` 中三个服务都正常
2. 后端日志里有 `prisma migrate deploy`
3. 登录正常
4. 管理侧日志页正常
5. 如果本次涉及文件能力，上传和下载链路正常

## 邮件信息

- AICampCloud@radynhealth.com
- radyn123_AICampCloud

## 文档索引

- [DEPLOY_INTRANET.md](DEPLOY_INTRANET.md): 内网或单机 Docker 部署
- [DEPLOY_PUBLIC.md](DEPLOY_PUBLIC.md): 公网入口、frp、Nginx、OSS 方案

## 加密模型解密说明

算法交付给用户的文件是加密后的 `.model`，不能直接用 `torch.load` 打开。

用户侧使用方式：

1. 准备三个文件：收到的交付算法 `.model`、`license.txt`、`model_loader.py`
2. 将三个文件放在同一个目录
3. 安装依赖：

```bash
pip install torch cryptography
```

4. 使用示例：

```python
from model_loader import load_encrypted_checkpoint

checkpoint = load_encrypted_checkpoint(
    model_path="delivery.model",
    license_path="license.txt",
)
print(checkpoint.keys())
```

补充说明：

- `model_loader.py` 是唯一维护版本，位于 [license/model_loader.py](license/model_loader.py)
- 若未安装 `cryptography`，loader 会回退使用系统里的 `openssl`
- 如果提示 `decrypt failed`，通常表示 `.model` 与 `license.txt` 不是同一次交付的配套文件


## DICOM 直传 OSS 分片上传说明

当前仓库里的 DICOM 上传已经改为浏览器直传 OSS 的分片上传方案。

为什么这样设计：

- 公网服务器配置较小，不适合承担大体积 DICOM 文件的中转上传。
- 文件由浏览器直接传到 OSS，服务端只负责签名、查询已上传分片和最终确认入库。
- 当前目标是务实可用，不追求特别重的工程化方案：5 GB 以下文件优先保证能稳定上传，速度可以适当慢一些。

当前行为：

- 前端会把 DICOM 文件按分片切开后上传到 OSS。
- 浏览器会把上传进度检查点保存在 `localStorage` 中，按需求 ID 和文件指纹区分。
- 如果页面刷新或网络中断，客户端会先查询 OSS 上已经存在的分片，再从最后一个已确认分片继续上传。
- 检测到可续传文件时，页面会提示一次“已从上次进度继续上传”。
- 每个分片默认最多重试 3 次，超过后才会判定该文件上传失败。
- 所有分片上传完成后，前端会调用后端完成 multipart upload，再基于这些 OSS 文件创建数据批次。

需求原始文件相关的后端接口：

- `POST /requirements/:id/object-storage-files/:fileId/multipart/init`
- `GET /requirements/:id/object-storage-files/:fileId/multipart/parts`
- `POST /requirements/:id/object-storage-files/:fileId/multipart/sign-part`
- `POST /requirements/:id/object-storage-files/:fileId/multipart/complete`
- `POST /requirements/:id/object-storage-files/:fileId/multipart/abort`

前端落点：

- `campcloud-web/src/pages/uploads/index.tsx`：分片上传主流程、续传提示、单分片重试、本地检查点缓存
- `campcloud-web/src/services/api/requirements.ts`：multipart 上传接口封装
- `campcloud-web/src/types/requirements.ts`：multipart 上传请求和返回类型

后端落点：

- `campcloud-server/src/modules/requirements/requirement.controller.ts`：multipart 上传接口入口
- `campcloud-server/src/modules/requirements/requirement.service.ts`：OSS 分片签名、分片列表查询、完成上传、取消上传
- `campcloud-server/src/modules/requirements/dto/`：multipart 相关 DTO

使用和运维注意事项：

- 这是浏览器直传 OSS 的链路，所以 OSS CORS 必须放行对应的上传方法和请求头。
- 当前实现主要面向 5 GB 以下的单文件上传，没有专门针对超大文件和高并发场景做进一步优化。
- 续传状态只保存在当前浏览器本地。清空浏览器存储，或者文件指纹变化后，会重新开始一次新上传。
- 如果某个 multipart 上传状态已经不可用，前端可以中止旧上传并重新发起一轮新的上传。

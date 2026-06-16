# 内网部署说明

本文档用于在公司内网服务器上以 Docker Compose 方式部署 CampCloud，并约束出一套长期稳定的目录和发布方式。

## 目标

- 保持当前服务可用
- 后续服务器可以直接 `git pull`
- 避免再次出现“目录名变了，Compose 项目名也跟着变，结果起了新卷”的问题

## 最终推荐形态

服务器最终统一为：

- 正式目录：`/home/test/campcloud`
- Git 分支：`dev/server`
- Compose 项目名：`campcloud`
- 部署环境文件：`.env.server`

正式发布命令固定为：

```bash
cd /home/test/campcloud
git pull origin dev/server
docker compose --env-file .env.server -p campcloud up -d --build
```

## 首次整理到最终目录

如果服务器当前还在使用过渡目录，例如：

- `/home/test/campcloud-test-next`
- `/home/test/campcloud-test-next-git`

建议单独安排一次整理窗口，把 Git 仓库整理到最终目录，而不是继续长期沿用临时目录名。

### 1. 准备最终目录

```bash
cd /home/test
git clone -b dev/server https://github.com/zljny11/cmpCL.git campcloud
cd /home/test/campcloud
```

### 2. 复制服务器环境文件

```bash
cp /home/test/campcloud-test-next-git/.env.server /home/test/campcloud/.env.server
cp /home/test/campcloud-test-next-git/.env /home/test/campcloud/.env
```

如果实际生效的是旧目录中的环境文件，就从旧目录复制，原则是“以当前正式运行环境为准”。

### 3. 先确认当前正式项目

检查当前容器和卷：

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
docker volume ls | grep campcloud
```

如果当前业务已经依赖某个旧 Compose 项目名，不要立刻改名；先让新目录接管旧项目，确认业务无误后，再安排单独的项目名收口。

## 过渡期接管旧项目

如果当前正式数据卷还挂在旧项目名，例如 `campcloud-test-next`，可以在新目录中临时继续使用旧项目名：

```bash
cd /home/test/campcloud
docker compose --env-file .env.server -p campcloud-test-next up -d --build
```

这一步的目的只有一个：让新代码安全接管旧数据卷。

注意：

- 代码目录可以变
- Compose 项目名不能随便变
- 只要项目名变了，Docker 默认就会新建另一套卷

## 收口到最终项目名

当你确认：

- 新目录代码正常
- 登录正常
- 管理端日志正常
- 数据库迁移正常

再单独安排一次窗口，把正式 Compose 项目名统一成 `campcloud`。

这一步一定要谨慎，因为它涉及容器名、网络名、卷名的切换。没有明确回滚方案之前，不要在业务恢复的同一次操作里同时完成。

## 服务器环境文件建议

`.env.server` 至少应包含：

```env
MYSQL_ROOT_PASSWORD=your-password
MYSQL_DATABASE=campcloud_test

WEB_BASE_URL=https://aicampcloud.radynhealth.com
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://aicampcloud.radynhealth.com
SWAGGER_ENABLED=true
RUN_SEED=false

FRONTEND_PORT=8088
VITE_API_BASE_URL=/api/v1

OSS_BUCKET=radyn-aicampcloud-file
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_ACCESS_KEY_ID=replace-me
OSS_ACCESS_KEY_SECRET=replace-me
OSS_UPLOAD_URL_EXPIRES_SECONDS=900
OSS_DOWNLOAD_URL_EXPIRES_SECONDS=600
```

## 日常发布

当服务器已经整理到最终目录后，后续发布统一用：

```bash
cd /home/test/campcloud
git pull origin dev/server
docker compose --env-file .env.server -p campcloud up -d --build
```

只更新后端：

```bash
docker compose --env-file .env.server -p campcloud up -d --build campcloud-server
```

只看后端日志：

```bash
docker compose --env-file .env.server -p campcloud logs -f campcloud-server
```

## 验证清单

每次发布后至少检查：

1. `docker compose ... ps` 中三个服务都正常
2. 后端日志里能看到 `prisma migrate deploy`
3. 登录正常
4. 管理侧日志页正常
5. 如果本次涉及文件能力，上传/下载链路正常

## 不要做的事

不要长期混用多个目录名：

- `/home/test/campcloud-test`
- `/home/test/campcloud-test-next`
- `/home/test/campcloud-test-next-git`

不要在不知道当前正式 Compose 项目名的前提下直接执行：

```bash
docker compose up -d --build
```

不要把“恢复线上业务”和“重构部署结构”混成一个操作步骤。

# AICampCloud

AICampCloud 分为：

- `campcloud-server`: NestJS + Prisma + MySQL 后端
- `campcloud-web`: 管理端/用户端前端

## 仓库结构

```text
campcloud-server/   后端服务
campcloud-web/      前端服务
docker-compose.yml  生产/测试容器编排
.env                本地默认环境变量
.env.server         服务器部署环境变量
DEPLOY_INTRANET.md  内网/单机 Docker 部署说明
DEPLOY_PUBLIC.md    公网入口 + frp + OSS 部署说明
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

## 标准发布链路：

1. 本地开发并验证
2. `git commit`
3. `git push origin dev/server`
4. 服务器进入正式部署目录
5. `git pull origin dev/server`
6. `docker compose --env-file .env.server -p campcloud up -d --build`

## 最终服务器约定

为避免目录名和 Compose 项目名漂移，服务器长期统一为：

- Git 仓库目录：`/home/test/campcloud`
- Compose 项目名：`campcloud`
- 部署环境文件：`/home/test/campcloud/.env.server`


## 当前服务器整理原则

如果服务器上已经存在过渡目录，例如：

- `/home/test/campcloud-test-next`
- `/home/test/campcloud-test-next-git`

请按下面原则整理，而不是直接删除旧目录：

1. 先确认当前正式运行的 Compose 项目名和数据卷
2. 再把 Git 仓库整理到最终目录 `/home/test/campcloud`
3. 切换前保证新目录使用同一套 `.env.server`
4. 在最终切换窗口内，再统一 Compose 项目名到 `campcloud`

如果当前线上已经恢复，但仍在“新 Git 目录接旧卷”的过渡状态，先保持可用，再做一次单独的目录收口，不要把“恢复业务”和“彻底整理部署”混在一次操作里。

## 数据库迁移

后端容器入口会自动执行：

```bash
npx prisma migrate deploy
```

因此正式发布时必须保证：

- 新代码已经部署到服务器
- 容器确实重新构建并重启
- 启动日志里能看到 migration 执行成功

如果新增了 Prisma migration，但服务器没有重启后端容器，数据库不会自动更新。

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

只重启后端：

```bash
docker compose --env-file .env.server -p campcloud up -d --build campcloud-server
```

## 文档索引

- [DEPLOY_INTRANET.md](DEPLOY_INTRANET.md): 内网或单机 Docker 部署
- [DEPLOY_PUBLIC.md](DEPLOY_PUBLIC.md): 公网入口、frp、Nginx、OSS 方案

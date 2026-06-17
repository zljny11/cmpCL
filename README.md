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

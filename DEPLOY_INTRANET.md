# 内网部署说明

本文档描述当前已经收口完成的内网正式部署方式。

## 当前正式形态

服务器最终统一为：

- 正式目录：`/home/test/campcloud`
- Git 分支：`dev/server`
- Compose 项目名：`campcloud`
- 环境文件：`/home/test/campcloud/.env.server`

正式发布命令固定为：

```bash
cd /home/test/campcloud
git pull origin dev/server
docker compose --env-file .env.server -p campcloud up -d --build
```

## 首次部署

### 1. 拉取代码

```bash
cd /home/test
git clone -b dev/server https://github.com/zljny11/cmpCL.git campcloud
cd /home/test/campcloud
```

### 2. 准备环境文件

- `.env`
- `.env.server`

建议 `.env.server` 内容如下：

```env
MYSQL_ROOT_PASSWORD=your-password
MYSQL_DATABASE=campcloud_test

WEB_BASE_URL=https://aicampcloud.radynhealth.com
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://aicampcloud.radynhealth.com
SWAGGER_ENABLED=true
RUN_SEED=false
MAIL_ENABLED=true
MAIL_HOST=smtp.example.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=notify@example.com
MAIL_PASS=replace-with-mail-password
MAIL_FROM=notify@example.com

FRONTEND_PORT=8088
VITE_API_BASE_URL=/api/v1

OSS_BUCKET=radyn-aicampcloud-file
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_ACCESS_KEY_ID=replace-me
OSS_ACCESS_KEY_SECRET=replace-me
OSS_UPLOAD_URL_EXPIRES_SECONDS=900
OSS_DOWNLOAD_URL_EXPIRES_SECONDS=600
```

### 3. 启动服务

```bash
cd /home/test/campcloud
docker compose --env-file .env.server -p campcloud up -d --build
```

### 4. 初始化默认账号

如果数据库是空库，执行一次：

```bash
docker compose --env-file .env.server -p campcloud exec campcloud-server npm run prisma:seed
```

## 日常发布

完整更新：

```bash
cd /home/test/campcloud
git pull origin dev/server
docker compose --env-file .env.server -p campcloud up -d --build
```

只更新后端：

```bash
docker compose --env-file .env.server -p campcloud up -d --build campcloud-server
```

查看后端日志：

```bash
docker compose --env-file .env.server -p campcloud logs -f campcloud-server
```

查看状态：

```bash
docker compose --env-file .env.server -p campcloud ps
```

## 验证清单

每次发布后至少检查：

1. `campcloud-mysql` 健康
2. `campcloud-server` 成功启动
3. 后端日志里有 `prisma migrate deploy`
4. 登录正常
5. 管理侧日志页正常

## 清理旧资源

如果已经确认正式环境只使用 `campcloud_*` 资源，可以清理历史残留卷：

```bash
docker volume rm campcloud-test-next-git_campcloud_mysql_data
docker volume rm campcloud-test-next-git_campcloud_server_storage
docker volume rm campcloud-test-next_campcloud_mysql_data
docker volume rm campcloud-test-next_campcloud_server_storage
docker volume rm campcloud-test_campcloud_mysql_data
docker volume rm campcloud-test_campcloud_server_storage
```

清理后建议确认只剩正式卷：

```bash
docker volume ls | grep campcloud
```

理想结果只剩：

- `campcloud_campcloud_mysql_data`
- `campcloud_campcloud_server_storage`

## 不要做的事

不要再长期混用这些旧目录或旧项目名：

- `/home/test/campcloud-test`
- `/home/test/campcloud-test-next`
- `/home/test/campcloud-test-next-git`
- `-p campcloud-test`
- `-p campcloud-test-next`
- `-p campcloud-test-next-git`

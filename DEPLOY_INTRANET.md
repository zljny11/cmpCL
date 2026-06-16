# 内网测试部署说明

目标：把项目部署到公司内网服务器进行测试，同时不影响服务器上已经运行的其他项目。

## 原则

1. 不停现有容器，不改现有 nginx，不抢现有端口。
2. 使用独立目录、独立 Compose 项目名、独立 `.env`。
3. 先用高位端口验证可用，再决定是否接入正式反向代理。

## 这个项目当前的部署方式

- `docker-compose.yml` 会启动 3 个服务：
  - `campcloud-mysql`
  - `campcloud-server`
  - `campcloud-web`
- 对外只暴露前端端口，默认是 `80`。
- 前端容器会把 `/api/` 代理到后端容器。

## 第一步：登录服务器，只做检查，不做修改

先确认服务器已有环境和占用情况：

```bash
hostname
whoami
pwd
docker --version
docker compose version
docker ps
ss -ltnp | grep -E ':80|:3000|:3306|:8080|:8081|:8088|:9000'
df -h
free -h
```

重点确认：

- 服务器是否已安装 Docker 和 Docker Compose。
- `80` 端口是否已经被现有项目占用。
- 是否已经有 MySQL 在宿主机 `3306` 监听。

如果已有项目正在跑，这一步不要执行任何 `stop`、`down`、`rm`。

## 第二步：上传代码到独立目录

建议使用独立目录，例如：

```bash
mkdir -p /opt/campcloud-test
```

把当前项目上传到该目录。常见方式：

```bash
scp -r ./ your_user@your_server:/opt/campcloud-test
```

或者先本地打包，再上传：

```bash
tar czf campcloud-test.tar.gz .
scp campcloud-test.tar.gz your_user@your_server:/opt/campcloud-test/
```

服务器上解压后进入目录：

```bash
cd /opt/campcloud-test
```

## 第三步：准备服务器专用环境变量

不要直接用仓库里的 `.env`，单独准备一份服务器环境：

```bash
cp .env .env.server
```

至少修改这些值：

```env
MYSQL_ROOT_PASSWORD=改成强密码
MYSQL_DATABASE=campcloud_test

JWT_SECRET=改成随机长字符串
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://服务器IP:8088
SWAGGER_ENABLED=true
RUN_SEED=false

FRONTEND_PORT=8088
VITE_API_BASE_URL=/api/v1
```

说明：

- `FRONTEND_PORT` 不要用 `80`，先改成没被占用的端口，比如 `8088`。
- `MYSQL_DATABASE` 建议用独立库名，例如 `campcloud_test`。
- `CORS_ORIGIN` 改成你实际访问的地址。
- `JWT_SECRET` 必须替换，不能保留示例值。

## 第四步：用独立项目名启动

关键点：一定要带 `-p`，给这个部署一个独立 Compose 项目名。

```bash
docker compose --env-file .env.server -p campcloud-test up -d --build
```

这样会把网络、卷、容器都隔离到 `campcloud-test` 这个项目下，不会和别的 Compose 项目混在一起。

## 第五步：启动后检查状态

```bash
docker compose --env-file .env.server -p campcloud-test ps
docker compose --env-file .env.server -p campcloud-test logs -f --tail=200
```

重点看：

- `campcloud-mysql` 是否健康。
- `campcloud-server` 是否成功执行 `prisma migrate deploy`。
- `campcloud-web` 是否正常启动。

如果只想看某一个服务日志：

```bash
docker compose --env-file .env.server -p campcloud-test logs -f campcloud-server
docker compose --env-file .env.server -p campcloud-test logs -f campcloud-web
docker compose --env-file .env.server -p campcloud-test logs -f campcloud-mysql
```

## 第六步：验证访问

在服务器本机先测：

```bash
curl -I http://127.0.0.1:8088
curl http://127.0.0.1:8088/api/v1
curl -I http://127.0.0.1:8088/api/docs
```

然后在你办公网电脑浏览器访问：

```text
http://服务器IP:8088
http://服务器IP:8088/api/docs
```

如果打不开，优先检查：

- 服务器防火墙是否放行 `8088`
- 安全组是否放行 `8088`
- `CORS_ORIGIN` 是否写对

## 第七步：需要更新版本时

```bash
cd /opt/campcloud-test
docker compose --env-file .env.server -p campcloud-test up -d --build
```

如果只是看状态：

```bash
docker compose -p campcloud-test ps
```

如果只是重启当前项目：

```bash
docker compose --env-file .env.server -p campcloud-test restart
```

## 第八步：只清理当前测试项目

如果你要下线这套测试环境：

```bash
docker compose --env-file .env.server -p campcloud-test down
```

如果连数据库卷也一起删：

```bash
docker compose --env-file .env.server -p campcloud-test down -v
```

注意：这只会操作 `campcloud-test` 这个项目，不会动其他 Compose 项目。

## 常见风险

### 1. 不要直接执行

```bash
docker compose up -d
```

原因：你如果在默认配置下直接启动，很容易和服务器上现有服务发生端口冲突，或者后续难以区分是哪个项目创建的资源。

### 2. 不要抢占 80 端口

这个项目默认 `FRONTEND_PORT=80`，但内网测试阶段应优先改成 `8088`、`18080` 之类的高位端口。

### 3. 不要复用别人的数据库

当前 Compose 会自己起一个独立 MySQL 容器。除非你明确知道公司内网已有专用测试库，否则不要连到别的业务库。

## 推荐的最小命令集

```bash
cd /opt/campcloud-test
cp .env .env.server
vi .env.server
docker compose --env-file .env.server -p campcloud-test up -d --build
docker compose --env-file .env.server -p campcloud-test ps
docker compose --env-file .env.server -p campcloud-test logs -f --tail=200
```

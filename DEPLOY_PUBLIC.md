# 公网部署说明

本文档描述 AICampCloud 当前正式的公网接入方式，以及它和内网 Docker 部署的关系。

## 部署目标

- Web 页面公网访问
- 业务 API 公网访问
- 大文件上传和下载走 OSS
- 内网服务器继续负责核心业务处理

## 当前架构

```text
公网用户
  |
https://aicampcloud.radynhealth.com
  |
阿里云 ECS + Nginx
  |
frps <=====> frpc
              |
              +---- 192.168.1.47:8088

大文件流量
用户端 / 管理端 / 内网服务
  |
  +---- 上传到 OSS
  +---- 从 OSS 下载
```

职责拆分：

- ECS: 负责域名入口、HTTPS、Nginx、frps
- 内网服务器: 负责业务后端、前端容器、数据处理、数据库
- OSS: 负责 DICOM、模型文件等大文件存储与传输

## 内网侧前提

公网部署默认建立在“内网 Docker 部署已经稳定可用”的基础上。

内网服务器应先满足：

- Git 仓库目录为 `/home/test/campcloud`
- `docker compose --env-file .env.server -p campcloud up -d --build` 可正常启动
- 本机 `http://127.0.0.1:8088` 可正常访问

## 端口规划

ECS 对公网开放：

- `80`
- `443`
- `7000`

不要对公网开放：

- `3306`
- `7500`
- `9000`

## frps 配置

ECS:

`/etc/frp/frps.toml`

```toml
bindPort = 7000

auth.method = "token"
auth.token = "replace-with-a-strong-random-token"

webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "replace-with-a-strong-password"
```

## frpc 配置

内网服务器：

`/etc/frp/frpc.toml`

```toml
serverAddr = "47.101.135.245"
serverPort = 7000

auth.method = "token"
auth.token = "replace-with-a-strong-random-token"

[[proxies]]
name = "campcloud-web"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8088
remotePort = 9000
```

如果服务监听的不是 `127.0.0.1:8088`，请改成实际地址。

## Nginx 配置

ECS:

`/etc/nginx/conf.d/aicampcloud.conf`

```nginx
server {
    listen 80;
    server_name aicampcloud.radynhealth.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aicampcloud.radynhealth.com;

    ssl_certificate /etc/letsencrypt/live/aicampcloud.radynhealth.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aicampcloud.radynhealth.com/privkey.pem;

    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    send_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## OSS 约束

公网环境下，大文件不要继续穿过 ECS 或 frp 中转。

- 前端向后端申请上传凭证
- 前端直接上传到 OSS
- 上传完成后回调后端确认
- 下载时由后端校验权限并签发临时下载地址

对象前缀：

```text
dicom/incoming/
dicom/parsed/
models/
temp/
```

命名：

```text
dicom/incoming/{requirementId}/{uuid}.dcm
dicom/parsed/{requirementId}/{uuid}.json
models/{modelName}/{version}/{uuid}.bin
temp/{requirementId}/{uuid}
```

## 发布顺序

1. 先在内网服务器完成新版本构建与验证
2. 确认 `http://127.0.0.1:8088` 正常
3. 确认 frpc 已连接
4. 确认 ECS 的 Nginx 正常代理到 `127.0.0.1:9000`
5. 再从公网域名验证登录、管理端、日志页、文件链路

## 验证清单

基础验证：

```bash
curl -I http://127.0.0.1:8088
curl -I https://aicampcloud.radynhealth.com
```

业务验证：

1. 登录正常
2. 管理端日志正常
3. 文件上传申请正常
4. 上传完成确认正常
5. 下载授权正常

## 风险提醒

不要让以下内容长期混乱存在：

- 多个服务器目录
- 多个 Compose 项目名
- 不明确的正式数据卷

当前正式约定已经固定为：

- 目录：`/home/test/campcloud`
- 项目名：`campcloud`

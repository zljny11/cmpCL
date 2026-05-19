# AICampCloud-web

AICampCloud 前端代码库。

当前约束：

- 技术栈与实现边界见 [docs/frontend-guidelines.md](./docs/frontend-guidelines.md)
- 旧项目参考位于工作区 `legacy/`

## 开发补充

- 本地启动统一使用仓库脚本：`./scripts/start-campcloud-dev.sh`
- 本地停止统一使用仓库脚本：`./scripts/stop-campcloud-dev.sh`
- 前端提交前至少执行一次检查：`npm run check`
- `requirements/:id/viewer` 为懒加载路由，涉及 `viewer`、Cornerstone、worker、wasm 相关改动后，应手动进入该页面验证一次是否可正常加载

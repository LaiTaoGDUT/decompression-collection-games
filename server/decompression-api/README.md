# decompression-api 游戏后端

本目录是解压小游戏合集的整个接口服务，统一入口为 `https://api.antcosmos.cn/decompression`。域名可供其他游戏使用，每个游戏使用独立公共路径前缀。当前提供身份验证、云存档和游玩时长统计，后续其他业务继续在本服务扩展。

**日常手动发布看 [OPERATIONS.md](OPERATIONS.md)，涉及数据库变更再看 [DATABASE.md](DATABASE.md)。** 当前线上状态和未完成验收看 [DEPLOYMENT.md](DEPLOYMENT.md)。

只在服务器本机监听的只读游戏数据页面见 [DATA_VIEWER.md](DATA_VIEWER.md)，源码在 `viewer/`，独立服务为 `decompression-data`。通过 SSH 隧道在电脑浏览器访问。

| 文件/目录 | 职责 |
| --- | --- |
| `index.cjs` | 应用启动、数据库版本检查、关闭生命周期 |
| `app.cjs` | HTTP 路由、请求校验、响应和运维健康检查 |
| `auth.cjs`、`login-providers.cjs` | 通用会话及微信、抖音等平台身份适配 |
| `migrate.cjs`、`migrations/` | 全服务的数据库版本管理和迁移 |
| `store.cjs`、`protocol.cjs`、`generated/` | 当前云存档和游戏时长业务；规则见 [CLOUD_SAVE.md](CLOUD_SAVE.md) |
| `update.sh` | 全服务统一部署、备份、迁移、检查和应用回退 |
| `decompression-api*.service`、`*.timer`、`nginx.conf` | 原生进程、备份和 HTTPS 反向代理配置模板 |
| `test.cjs`、`*.postgres.test.cjs`、`postgres.test.cjs` | 服务端验证与隔离的真实数据库测试 |

新增业务应保持清楚的路由和模块边界，复用身份、数据库连接、迁移、日志和发布流程，不另建一套服务端全局能力。新增源码或文档后检查 `project-scripts/server/package.cjs` 的发布清单，新增 SQL 通过迁移清单自动入包。

客户端目前只有两个云存档业务接口：`POST /v1/load` 与 `POST /v1/save`；外部访问时加上 `/decompression`。`GET /health`、`GET /ready` 用于运维。后续新增其他业务路由仍使用 `/decompression/` 前缀，不改变已有路由的含义。

运行环境为 Node.js 22、PostgreSQL、Nginx、systemd；API 和数据库只监听本机，由 Nginx 提供外部 HTTPS。当前原生部署使用 `/opt/decompression-api/` 和 `decompression-api.service`。数据库名和数据库角色统一为 `decompression_api`，无登录权限的 Linux 运行账号/组为 `decompression-api`。新功能不得复用或改动现有账号主键算法与持久化存档字段含义。

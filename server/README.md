# 游戏服务端

当前游戏的整个后端服务为 **decompression-api**，源码位于 [decompression-api](decompression-api/README.md)。微信、抖音等宿主平台提供登录身份，业务数据和后续其他接口由这个服务承载。云存档是当前已实现的业务模块，不是整个服务的名称。

**后续手动修改代码、打包和部署，优先看 [部署操作手册](decompression-api/OPERATIONS.md)。**

| 要做的事 | 参考文档 |
| --- | --- |
| 找服务入口、业务文件和通用能力 | [服务概览](decompression-api/README.md) |
| 改代码后测试、打包、上传、部署、查看日志、回退 | [部署操作手册](decompression-api/OPERATIONS.md) |
| 新增表/字段、数据迁移、数据库兼容与备份 | [数据库迭代手册](decompression-api/DATABASE.md) |
| 查看当前已部署情况与验收范围 | [部署记录](decompression-api/DEPLOYMENT.md) |
| 修改云存档业务规则和同步字段 | [云存档模块](decompression-api/CLOUD_SAVE.md) |

通用命令在项目根目录运行：`npm run prepare:server`、`npm run verify:server`、`npm run package:server`。只修改服务端且接口兼容时不需要重新发布小游戏；改变客户端协议或逻辑时，要同时安排客户端迭代并保留旧版兼容。

修改共享存档代码、云存档配置或游戏清单后，执行 `prepare:server` 更新服务端的 `generated/`；`verify:server` 和 `package:server` 会检查生成文件是否过期。协议生成由服务端流程管理，Cocos 微信构建无需运行服务端脚本。旧微信云开发源码和对应构建插件已移除。

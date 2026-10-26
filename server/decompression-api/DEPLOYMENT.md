# 系统 journal 日志保留策略（2026-10-26）

用户明确要求上服务器应用此前确认的约 500 MB、最长 14 天策略。通过现有 OrcaTerm 桌面 SSH 会话安装 `/etc/systemd/journald.conf.d/90-antcosmos-retention.conf`（root:root 644），配置持久存储、`SystemMaxUse=500M`、`SystemMaxFileSize=32M`、`MaxFileSec=1day`、`MaxRetentionSec=14day`。

- 北京时间 18:12:43 重启 `systemd-journald.service` 并执行 flush 成功。实际启动日志显示 `/var/log/journal/…` 当前占用 29.1M、`max 500M`，证明容量限制已被运行中的日志服务采用。
- journald、游戏 API、数据看板三个系统服务均为 active；本机及公网 `/decompression/ready` 返回 `ok=true`、`database=true`、微信登录配置有效。只重启日志服务，游戏应用版本保持 `20261026T064047Z-c3ef3ea740f7`。
- 本次配置只作用于默认 namespace 的系统 journal，玩家数据和数据库结构未改动；没有执行手动 vacuum 清理。Nginx 现有每日轮转、保留 14 份压缩归档规则继续使用。配置会在后续系统 journal 轮转与空间管理中淘汰达到清理条件的旧归档，保留期限不保证始终能查满 14 天。
- 恢复位置、配置内容、验证方法、适用范围及迁移说明已补入 [OPERATIONS.md](OPERATIONS.md) 的“系统 journal 容量与保留策略”。普通应用发布保留服务器 `/etc/` 中的策略；新服务器迁移时单独恢复。

以下为此前部署历史。

# 游戏数据看板展示优化（2026-10-26）

最终发布版本 `20261026T064047Z-c3ef3ea740f7`，发布包 SHA-256 为 `7a88fe329b240d2ef2c24b8833a7684c1faadf7e6c9eb13145c1a4f06917c1fd`。通过已授权的 OrcaTerm 桌面 SSH 会话上传代码包与校验文件，并使用固定 `/opt/decompression-api/bin/update.sh` 发布；当前回退目标是本轮首版 `20261026T063041Z-dd6fed1b61b0`，本轮改动前版本为 `20261026T021914Z-5715e13c79a6`。

- 前端重整为概览、账号存档、游玩统计三个导航视图。增加最近保存卡片、游戏排行及占比、账号前缀校验与清除、游戏名称搜索、账号详情抽屉、中文进度指标、逐关星级格子、成就和设备时长页签；完整原始字段折叠保留。刷新失败保留旧数据，分页按钮会恢复到正确状态，账号详情关闭时恢复键盘焦点。
- 使用本机 3101 合成数据预览，验证 28 个账号分页、大小写搜索、无匹配与无效前缀、按账号数排序、详情搜索、星级展开、成就、设备时长、键盘页签及 Escape 关闭、空数据库与刷新失败恢复。375px 窄屏最终验证页面及详情宽度均为 375px，表格仅在自身容器内横向滚动。预览不连接生产数据库，验收后关闭。
- 本地 TypeScript、差异检查、发布器回归与 10 项服务端 HTTP/协议测试通过；Cocos 资源刷新成功。最终发布在服务器运行真实 PostgreSQL 等共 15 项测试，全部通过，输出 `DEPLOYMENT_OK` 与 `DATA_VIEWER_OK listen=127.0.0.1:3100`。数据库版本仍为 1，`pending=[]`，API 内外网健康检查通过。
- 北京时间 14:45:48 在真实 SSH 隧道页面读取到账号 1、设备 1、时长记录 0、累计时长 0。真实账号 13 个游戏模块显示正常，例如缤纷填色普通 24 关/困难 3 关、猫咪数独普通 17 关、保护狗头 7 关和 3 个三星；成就与设备记录可正常读取。浏览器未记录警告或脚本错误。本轮仅更新展示与交互，没有修改游戏接口路径、数据库结构或玩家数据。
- 使用说明见 [DATA_VIEWER.md](DATA_VIEWER.md)，普通更新流程仍见 [OPERATIONS.md](OPERATIONS.md)。以后前端源码随同一发布包更新，发布完成后刷新电脑浏览器页面即可；无需重新构建或发布小游戏客户端。

以下为此前部署历史。

# 本机只读游戏数据页面（2026-10-26）

已发布版本 `20261026T021914Z-5715e13c79a6`，包 SHA-256 为 `5126ead595dc4b86ed8790bae561ad18305dda046e15211bb578ffe681e970ee`。代码包与校验文件通过 OrcaTerm 上传后重新校验一致；使用包内纯 `update.sh` 引导发布，固定发布工具已随成功发布更新。前一版本为 `20261025T131548Z-d594ed5b09f5`。

- 服务器上的服务端、HTTP、迁移和真实 PostgreSQL 共 15 项测试全部通过；包含查看器的汇总、进度解码、只读快照禁止写入和访问限制测试。数据库迁移仍为版本 1，`pending=[]`。游戏 API 内外网及匿名校时、无凭证保护检查通过。
- 已执行 `install-data-viewer.sh`，独立 `decompression-data.service` 启动并设为开机启动，监听地址实测为 `127.0.0.1:3100`；游戏 API 3000 与 PostgreSQL 5432 仍只监听本机。没有添加公网查看路径或开放 3100/5432 安全组端口。
- Linux 用户及 PostgreSQL 角色 `decompression-viewer` 使用本机 peer 认证，运行时无需读取游戏 API 的 `.env`。以该角色实际核对三张表，`can_read=t`、`can_write=f`；安装输出 `DATA_VIEWER_OK`。
- 2026-10-26 北京时间约 11:00 实际调用本机 `/api/overview`，返回账号 1、设备 1、时长记录 0、累计时长 0；最近存档为北京时间 2026-10-26 09:49:39.494。这些为当时的只读快照，不代表以后固定不变。未通过查看页面上传或修改玩家存档。
- 源码、发布清单、可选查看器随发布重启的流程和 [DATA_VIEWER.md](DATA_VIEWER.md) 已完成；本地 TypeScript、差异检查、Cocos 资源刷新及浏览器合成数据预览通过。合成数据预览进程和标签页已关闭。

电脑浏览器到服务器的 SSH 隧道已于 2026-10-26 验收完成：

- 用户通过腾讯云官方控制台创建并在线绑定密钥，目标仍是已有 `ubuntu` 账号；未创建专用 SSH 登录账号。用户明确授权将本次密钥交给腾讯云 OrcaTerm 托管，用于该服务器及本地转发；客户端凭据管理显示云端凭据 1 个，连接“游戏服务器 · 数据查看”已引用该托管凭据。
- 经用户完成网页会话 MFA 后，读取同一实例的 Ed25519 主机公钥指纹，与客户端提示一致。客户端已成功进入 `ubuntu@VM-0-3-ubuntu` 终端。
- 已创建并启动“游戏数据查看”本地转发：电脑 `127.0.0.1:3100` → `ubuntu@139.199.210.76` → 服务器 `127.0.0.1:3100`。客户端规则按钮实测变为“停止”，浏览器真实页面加载成功；使用时需保持客户端及该转发运行。
- 北京时间 12:38:26 实际在 Chrome 打开 `http://127.0.0.1:3100/`，显示账号 1、设备 1、累计时长 0、存档版本 1，最近保存为当天 09:49:39。展开真实账号详情可解析 13 个游戏模块和成就；例如缤纷填色普通 24 关/困难 3 关、猫咪数独普通 17 关。展开保护狗头的 7 关星级记录成功。此次操作全部为只读，没有上传或修改玩家进度。

SSH 隧道为腾讯云官方文档支持的方式，OrcaTerm 的图形端口转发目前仅桌面客户端提供。私钥未写入仓库或部署包；本机原始私钥由用户保管。

以下为此前部署历史。

# 上线前统一数据库与运行账号命名（2026-10-25）

用户确认本功能尚未上线。已实际只读核对三张业务表，存档、设备序号、游玩时长记录均为 0；没有需要维持旧部署名称的玩家数据。数据库与角色统一改为 `decompression_api`，Linux 运行账号/组统一改为 `decompression-api`，移除旧 schema 识别分支和旧路径兼容链接；既有数据库迁移与应用回退框架保留供上线后使用。

本次已完成：

- 当前运行版本为 `20261025T131548Z-d594ed5b09f5`，发布包格式为 2。压缩包 SHA-256 为 `0836a06ef406a3922b3150d83e8f7d37ff11fe67370b24812f8e9e955d0da2a3`，纯发布器 SHA-256 为 `8ebabc48cc1fb97b0c895b005f055c9e64435acba0c8d735cfa244546bcdd624`。
- 实际只读预检结果为 `saves=0`、`devices=0`、`playtime=0`。确认没有业务数据后，数据库和角色改为 `decompression_api`，Linux 用户/组改为 `decompression-api`，UID/GID 保持原值。SCRAM 密码未改变，生产环境文件只更新数据库连接中的用户名与库名。
- 在新数据库/角色下实际运行服务端和真实 PostgreSQL 共 13 项测试，全部通过；应用及内外网检查通过，新备份任务成功，迁移状态保持版本 1、`pending=[]`。Node 实际连接返回 `database=decompression_api`、`role=decompression_api`，系统账号查询显示 `decompression-api`，shell 仍为 nologin。
- 已确认旧数据库与角色 `cloud_save`、旧 Linux 用户/组 `cloud-save`、旧 `/opt/decompression-cloud-save` 兼容链接不再存在。旧系统单元、上线前旧版本和旧上传入口移入历史目录，不作为当前发布或回退目标；旧 schema 识别分支及摘要文件已从源码和新包移除。
- 当前版本作为统一命名后的初始发布基线，暂时没有 `previous` 目标；以后第二次正常发布会自动记录可回退版本。只读预检、名称切换、原密码保留和失败恢复逻辑在一次性受控维护流程中完成，不是日常部署步骤。
- 源码与文档已统一；本地业务/HTTP/发布回归验证、TypeScript、差异检查和 Cocos 资源刷新通过。没有因本次命名调整写入游戏进度，真实双手机存取仍按原记录待验收。

以下为此前部署历史。

# 游戏后端统一命名与数据库迁移（2026-10-25）

整个游戏后端服务统一为 `decompression-api`，源码 `server/decompression-api/`，通用维护脚本 `project-scripts/server/`，命令为 `prepare:server`、`verify:server`、`package:server`，发布产物位于 `local/server/releases/`。云存档是业务模块，见 `CLOUD_SAVE.md`。

主文档入口为 `server/README.md`，手动部署参考 `OPERATIONS.md`，数据库迭代参考 `DATABASE.md`。迁移由发布器在备份后执行，记录版本、SQL 摘要和兼容下限；应用启动只检查版本。现有数据库通过基线接管，保留玩家数据和账号主键。

本次已完成源码、文档及服务器切换：

- 当前运行版本为 `20261025T121250Z-d5aea0145267`，目录 `/opt/decompression-api/releases/20261025T121250Z-d5aea0145267`。固定发布入口 `/opt/decompression-api/bin/update.sh`；前一版本 `20261025T114939Z-afb55fd78a67` 已记录为回退目标。
- 代码包 SHA-256：`d4b9ea34444f646defc981f372d4d7e13cc36eea3bd071110573d398225c80d6`；纯发布工具 SHA-256：`185f400e54b18471cd9c258e725a1d558716ba64258d8839a4e6b6ceaa0831ef`，上传前后校验通过。
- 服务器发布前运行服务端和真实 PostgreSQL 共 13 项测试，全通过。新增迁移测试覆盖旧库基线接管不覆盖原记录、并发迁移只执行一次、历史摘要检查、兼容下限、不兼容拒绝与失败 SQL/迁移记录整体回滚。
- 正式数据库已完成基线接管：新增 `api_schema_migrations` 并记录版本 1；状态为 `requiredVersion=1`、`appliedVersion=1`、`minAppVersion=1`、`pending=[]`。物理库/角色 `cloud_save`、玩家数据、原账号主键算法和生产配置保留；已校验 `.env` 内容在改名过程没有变化。
- 已先用原单元完成受检发布和迁移前备份，再将原目录移至 `/opt/decompression-api`，安装并启用 `decompression-api.service` 与 `decompression-api-backup.timer`，运行新备份任务。旧 API/备份 timer 已停止并禁用；原路径作为兼容链接保留，以支持既有版本回退。
- Nginx 站点配置保留现有 HTTPS 内容，文件与启用链接改名为 `decompression-api`，配置检查和 reload 成功。外网 `/decompression/ready` 返回 200、`service: "decompression-api"`、数据库就绪、微信登录配置有效。最终过渡脚本输出 `GAME_API_RENAME_OK`。
- 本地通用发布和业务回归、服务端 HTTP/迁移规则验证、TypeScript、差异检查已通过。未在正式库尝试不兼容 SQL 或故意破坏线上服务；失败与回退场景在隔离测试中执行。真实双手机存取和客户端发布仍按原记录待验收。

以下是此前版本的历史记录，旧命名保留用于审计。

# 标准发布包部署流程（2026-10-25）

本次将日常部署改为独立 `.tar.gz` 发布包、同名 `.sha256` 和纯 `update.sh`，脚本不内嵌业务代码。打包入口仍为 `npm run package:cloud-save`，默认生成到 `local/cloud-save/releases/`。固定部署工具安装在 `/opt/decompression-cloud-save/bin/update.sh`，支持发布锁、逐文件校验、依赖准备、切换前测试、原子切换、内外网检查、自动回退和手动 `--rollback`。数据库结构变化须先规划兼容迁移。

本次已实际完成部署：

- 当前版本：`20261025T114939Z-afb55fd78a67`；前一版本：`20261025T112436Z-45ef321a-two-api`。固定工具的 `--status` 已核对这两个目标。
- 独立代码包 43,119 字节，SHA-256 为 `71fdf00397ba16dea00a8def2c11c6a69a98715b63c4809aba7d89aee081b7cd`；纯脚本 SHA-256 为 `5198f632fb8fa864c3328c9465864a164d26ede8d0fa202cbef160648c34ff8d`，已核对服务器固定工具一致。代码包、校验文件和脚本是分开上传的三个文件。
- 在服务器实际运行固定工具，包校验、切换前服务端与真实 PostgreSQL 共 9 项测试、本机就绪、外网 HTTPS 就绪、匿名仅时间获取和无凭证保护均通过，输出 `DEPLOYMENT_OK`。生产 `.env` 实测仍为 root:root 600，固定脚本为 root:root 750。
- 本地真实执行部署脚本的回归测试通过：归档/清单/文件校验、路径与链接拒绝、依赖复用及重新安装、测试失败不切换、重启/外网/错误就绪响应触发回退、手动回退及失败恢复、并发锁和 SQL 迁移拦截。宿主机服务操作使用受控替身；没有在线上故意制造故障或执行回退。
- TypeScript、`git diff --check`、云存档验证和 Cocos MCP 资源刷新通过。本次仅调整部署流程，没有改动云存档业务协议或客户端逻辑；无需为本次部署工具变化重新构建客户端。
- 仍未配置推送 Git 后自动上线，也没有配置可用的 SSH 发布密钥；当前通过用户已登录的 OrcaTerm 上传并发布。两台实体手机的真实上传与冷启动恢复仍待完整验收。

以下为此前已完成的业务接口与客户端记录。

# 两个业务接口的更新状态（2026-10-25）

客户端和服务端源码已改为 `POST /decompression/v1/load` 与 `POST /decompression/v1/save`，平台登录验证及服务器时间随本次读写完成，移除单独的时间/登录接口。门槛前使用获取接口的匿名仅时间模式，不访问玩家数据。原云存档门槛、触发、最佳进度、时长去重和冷启动日期冻结规则保留。

本次部署已完成：

- 当前线上 release 为 `/opt/decompression-cloud-save/releases/20261025T112436Z-45ef321a-two-api`，旧多平台 release 保留用于回退。数据库结构、生产环境配置与 HTTPS 无需迁移。
- 本地 TypeScript、`git diff --check`、云存档规则/网络请求/构建部署验证和服务端 8 项测试全部通过，已用 Cocos MCP 刷新资源。线上服务端与真实 PostgreSQL 共 9 项测试全部通过后才切换服务。
- 外网匿名 `POST /v1/load` 返回 200、可信日期且没有账号数据或 token；实际读档缺少凭证返回 401；旧 `/v1/time` 返回 404；`ready` 返回 200、`database: true`、`loginPlatforms: ["wechat"]`。
- 真实微信只读复验通过：临时工程仅发一次携带 `platform: "wechat"` 票据的 `POST /v1/load`，同一响应完成登录验证、日期和账号读档。新版部署后的服务日志为 `/v1/load` 200 共 2 次（匿名校验 1 次、真实微信读档 1 次），401 共 1 次（无凭证校验），没有 `/v1/save`。本次真实账号没有上传或修改进度，临时工程已关闭。
- 正式微信构建于北京时间 2026-10-25 19:23:20 成功，用时 39 秒。`build/wechatgame` 已包含 `/v1/load` 与 `/v1/save`；包体检查通过，主包 1.63 MiB、分包 8.85 MiB、合计 10.47 MiB、远程资源 63.80 MiB。客户端尚未发布，仍需按原流程发布正式工程及远程资源；两台实体手机同步尚未验收。

以下为此前版本的历史记录。

# 本次部署状态

## 多平台登录改造的后续状态

2026-10-25：客户端已改为显式发送 `{ platform, code }`；服务端已拆分平台登录适配器与统一存档鉴权，支持微信及可选抖音小游戏验证。微信原账号主键、旧 code-only 登录请求和未到期 v1 token 保持兼容，数据库结构不变。服务端 8 项测试、云存档全套验证、TypeScript、差异检查及 Cocos 资源刷新通过。

用户已解锁 Mac，并完成腾讯云终端重连所需的微信 MFA 验证。多平台增量的正式微信构建已于 2026-10-25 17:58:28 成功，用时 52 秒；包体检查通过（主包 1.63 MiB，主包加分包 10.47 MiB），构建产物中已核对包含新的平台票据客户端。

多平台增量已部署到 `/opt/decompression-cloud-save/releases/20261025T102154Z-358d8816-platforms`，`app` 已切到该版本，旧版保留以供回退。上传脚本 SHA-256 校验通过；服务器上服务端及真实 PostgreSQL 共 9 项测试全部通过，正式数据库结构不变。外网 `/decompression/ready` 已实际返回 HTTP 200、`database: true`、`loginConfigured: true`、`loginPlatforms: ["wechat"]`。抖音尚未配置密钥，未启用。

新版真实微信只读复验已通过：在保持合法域名校验开启的微信开发者工具中，显式发送 `platform: "wechat"` 换取 token，再鉴权读取账号云存档成功，界面显示服务器日期、登录及读档均通过，新账号暂无云存档。自本次版本切换起，服务日志确认 `POST /v1/login` HTTP 200 为 1 次、`GET /v1/save` HTTP 200 为 1 次，没有 `POST /v1/save`。临时测试工程已关闭并去掉自动运行入口。

本次多平台增量部署、正式微信构建及真实微信只读复验均已完成。下面保留初始微信版本的部署记录。抖音尚无真实密钥、客户端适配及真机联调，不能视为已完成抖音接入；两台实体手机的正式客户端进度同步仍需发布前验收。

## 已部署的微信版本

截至 2026-10-25 的已确认状态：

- 目标：腾讯云广州轻量应用服务器 `lhins-8xlson7l`，公网 `139.199.210.76`，2 核 2GB、50GB、5Mbps。
- 用户已完成 DNSPod 身份验证；`api.antcosmos.cn` A 记录已保存并在服务器端解析到该地址。已有 `antcosmos.cn` 的腾讯云 ICP 备案由用户确认通过。
- 服务器已安装 Node.js 22.22.1、PostgreSQL 18、Nginx、Certbot；PostgreSQL 系统集群在线。Docker 镜像拉取超时，业务采用原生部署方案。
- 客户端与服务端代码、部署脚本在本仓库；客户端地址已指向 `https://api.antcosmos.cn/decompression`。
- 本地已通过 TypeScript 编译检查、`git diff --check`、云存档规则/网络生命周期/构建插件验证、本地存档恢复验证，以及服务端 4 项协议、鉴权和 HTTP 测试。填色 2500 关与旋转圆环 384 关模型验证通过；已通过 Cocos MCP 刷新资源。
- 用户已上传并运行首次安装脚本。已修复 PostgreSQL 配置文件与发布上级目录在 `umask 077` 下的权限问题，并加入实际执行 shell 配置逻辑的回归验证。重跑安装会保留 Certbot 已启用的 HTTPS 配置。服务器 `deploy-native.sh` 与仓库一致，SHA-256 为 `ea3399f8bb4a2011a585dcf396701bffc78e7c637729c0cf8ba922fc5c8b9ef2`。
- PostgreSQL 18/main、业务数据库 `cloud_save`、专用业务账号、API systemd 服务和 Nginx 路由已实际安装并运行。`https://api.antcosmos.cn/decompression/v1/time` 外网返回 HTTP 200、正确 UTC+8 日期和 `Cache-Control: no-store`。
- 服务器上 `node --test test.cjs postgres.test.cjs` 的 5 项验证全部通过。24 个并发保存请求的测试批次约 107ms；该数字只表示小批量事务验证，不代表容量上限。
- 每日备份 timer 已启用，已生成备份。另在独立临时数据库中实际恢复 `cloud-save-20261025T063024Z.dump`，确认 `cloud_saves`、`sync_devices`、`game_playtime` 三张表恢复成功，随后清理测试库；正式数据库未被恢复演练修改。
- 用户已明确同意 Let's Encrypt v1.8 订户协议，并选择不填写邮箱。`api.antcosmos.cn` 证书已签发并安装，到期日为 2027-01-23；Certbot 自动续签 timer 已启用，指定该证书的 `renew --dry-run` 演练成功，Nginx 配置检查通过。
- HTTPS 外网验证：`/decompression/v1/time` 返回 200 且禁止缓存；HTTP 自动 301 跳转到同路径 HTTPS；未登录访问 `/decompression/v1/save` 返回 401。
- 用户提供的已有 AppSecret 已通过终端隐藏输入写入服务器配置，没有写入仓库。`/opt/decompression-cloud-save/.env` 实测为 root:root、600；HTTPS `/decompression/ready` 返回 200、`database: true`、`loginConfigured: true`。这仅代表配置完成，不等于已经验证真实微信登录。
- API 3000 与 PostgreSQL 5432 实测仅监听 127.0.0.1；Nginx 对外提供 80/443。API、数据库、Nginx、证书续签及每日备份 timer 均为 active。
- 用户已确认在微信后台保存 request 合法域名 `https://api.antcosmos.cn`。
- 已完成真实微信登录与账号读档联调：使用当前小游戏 AppID，在微信开发者工具中保持合法域名校验开启，通过 `wx.login` 取得临时 code，后端成功调用微信官方 `jscode2session` 并签发 token，随后鉴权读取存档成功。模拟器显示服务器日期 `2026-10-25`、微信登录“通过”、账号存档读取“通过：新账号暂无云存档”。
- 服务端日志核对结果：`POST /v1/login` 成功 1 次、`GET /v1/save` 成功 1 次；没有 `POST /v1/save`。本次真实账号联调未上传、修改存档或写入游玩时间。临时工程已关闭，不用于客户端发布。
- 已在 Cocos Creator 3.8.8 使用现有微信构建任务构建当前源码，2026-10-25 15:28:08 成功，用时 46 秒。产物 `build/wechatgame` 已包含 `https://api.antcosmos.cn/decompression`，AppID 正确，未声明微信云函数目录。`verify:wechat-package-size` 通过：主包 1.63 MiB、分包 8.85 MiB、上传包合计 10.47 MiB；远程资源另计 63.80 MiB。构建后 TypeScript 与 `git diff --check` 再次通过。

客户端发布与真机验收：

- 自建服务端已部署并通过真实微信身份验证与只读接口检查。正式客户端产物已更新为本次源码；后续继续修改源码时须重新构建。发布时按现有流程同步本次 `build/wechatgame/remote` 远程资源，再发布正式微信工程。临时只读联调工程不得上传或发布。
- 尚未用两台实体手机完成正式客户端的端到端验收。建议发布前使用同一微信账号：两台设备各自达到门槛；A 设备触发上传并等待成功；B 设备结束旧进程后冷启动，核对关卡、逐关最高星数、成就及本机道具/每日赠送保留；再反向验证一次。新设备未达本设备门槛时不会拉云存档，这是已确认的规则。
- 数据库并发、合并及重试去重已经自动化验证；真实账号本次只读联调不替代双手机进度同步验收。

运维备注：

- 每日本机备份及实际恢复演练已完成，备份保留 14 天；尚未配置异机备份，不能覆盖整机或磁盘损坏。
- 原腾讯云控制台及微信后台仍受浏览器站点权限限制。本次服务器通过用户已登录的 OrcaTerm 操作，微信 request 合法域名由用户保存。
- 迁移所需代码、环境配置、PostgreSQL 备份与 DNS 切换步骤见 [README.md](README.md)。迁移时使用 PostgreSQL 18 或更高版本，并保留同一 AppID 和 token 签名密钥；客户端域名及 `/decompression/` 路径可继续使用。

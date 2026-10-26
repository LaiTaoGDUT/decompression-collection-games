# 游戏后端部署操作手册

这是日常手动更新 **decompression-api** 的主入口。所有“电脑上”命令在项目根目录执行；所有“服务器上”命令在腾讯云终端或已授权 SSH 终端执行。服务概览见 [README.md](README.md)，数据库迭代见 [DATABASE.md](DATABASE.md)，完成记录见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 1. 在电脑上修改和测试

源码在 `server/decompression-api/`。新增业务接口后，修改 `app.cjs` 的路由及对应业务模块，并补上验证请求、鉴权及数据行为的测试。增加发布所需源码时同步更新 `project-scripts/server/package.cjs` 的文件清单。云存档编解码的源文件仍在 `assets/services/cloud/`，生成的 `generated/` 不手工修改。

修改 `CloudSaveCodec.ts`、`CloudSaveProjection.ts`、`assets/resources/configs/cloud-save.json` 或游戏清单后，先运行 `prepare:server`。服务端验证和打包都会拒绝使用过期生成文件；Cocos 微信构建与此流程独立，不再通过编辑器插件生成服务端协议。

```sh
npm run prepare:server
tsc --noEmit --pretty false
npm run verify:server
npm run verify:cloud-save
git diff --check
```

`verify:server` 验证发布工具和 HTTP 服务；真实 PostgreSQL 测试在服务器发布前运行，使用临时随机 schema，不操作正式玩家存档。只改其他业务时按改动范围选择相关测试。Cocos 工程改动后按 AGENTS 要求刷新资源；修改客户端逻辑还须重新构建、发布客户端。

## 2. 在电脑上生成发布包

```sh
npm run package:server
```

默认输出目录是项目里的 `local/server/releases/`。终端打印本次准确文件名、完整路径和版本：

```text
decompression-api-<版本>.tar.gz         新版服务端代码包
decompression-api-<版本>.tar.gz.sha256  同名 SHA-256 校验文件
update.sh                             纯部署脚本的副本，不包含业务代码包
```

版本由 UTC 打包时间和源码摘要组成。当前发布包格式为 2，统一数据库和运行账号之前的上线前包已归档，不直接重发，需从当前源码重新打包。包内 `release.json` 记录源码文件摘要及需要的数据库版本，不包含生产密钥、玩家数据、备份、客户端资源或 `node_modules`。不要重复使用以前的发布包部署新代码。

## 3. 上传文件到服务器

通过腾讯云终端右侧文件管理器，将本次 `.tar.gz` 和对应的 `.tar.gz.sha256` 一起上传到 `/home/ubuntu/`。只有部署器本身需要升级或首次安装固定工具时，额外上传本次 `update.sh`。已经配置 SSH 的环境也可以用 SCP/SFTP；当前没有配置 Git 推送后自动上线。

## 4. 在服务器执行部署

将下面的文件名替换为本次上传的真实文件名，不能原样保留 `<版本>`：

```sh
sudo /opt/decompression-api/bin/update.sh \
  /home/ubuntu/decompression-api-<版本>.tar.gz
```

首次安装/升级部署工具时使用新上传的纯脚本引导：

```sh
sudo bash /home/ubuntu/update.sh \
  /home/ubuntu/decompression-api-<版本>.tar.gz
```

发布顺序为：

1. 取得发布锁，校验代码包、清单、所有文件，解压到独立版本目录。
2. 复用相同锁定依赖，或按新锁定文件运行 `npm ci --omit=dev --ignore-scripts`。
3. 运行服务端及隔离 PostgreSQL 测试。
4. 计算数据库迁移计划并检查与当前应用的兼容性；有新迁移时先生成并校验备份，再在事务中执行尚未执行的迁移。
5. 检查目标应用与数据库兼容，原子切换应用链接并重启 API。
6. 检查本机就绪、外网 HTTPS、匿名取时间及无凭证存档保护。成功后记录 `DEPLOYMENT_OK`、上一个版本和固定部署工具。

**普通代码更新和兼容的数据库更新，都是上传这两个文件、执行同一条部署命令。** SQL 必须按 [数据库迭代手册](DATABASE.md) 新增版本；只改 SQL 文件或在生产库手工改表不能替代迁移。已提交的数据库变更不会因应用检查失败而自动倒退，旧应用必须保持可运行。

这是单实例重启发布，有短暂请求中断，客户端会按现有逻辑重试。发布检查不替代真实账号和双手机端到端验收。涉及 Nginx、证书、系统服务模板或凭据的改动属于额外运维变更，普通代码更新不会自动覆盖它们。

## 5. 查看版本和日志

```sh
sudo /opt/decompression-api/bin/update.sh --status
sudo systemctl status decompression-api --no-pager
sudo journalctl -u decompression-api -n 80 --no-pager
```

数据库和数据库角色为 `decompression_api`，Linux 运行账号/组为 `decompression-api`。当前版本源码在 `/opt/decompression-api/app/`；`releases/` 保留各次发布，`previous` 在有第二个成功版本后指向前一个版本（本次上线前统一命名已建立新的初始基线），`deployments.log` 记录成功发布与回退。生产配置在 `/opt/decompression-api/.env`，保持 root:root 600，不复制到仓库或聊天中。备份在 `/opt/decompression-api/backups/`。

### 系统 journal 容量与保留策略

2026-10-26 已在现有服务器安装 `/etc/systemd/journald.conf.d/90-antcosmos-retention.conf`，所有者 root:root，权限 644：

```ini
[Journal]
Storage=persistent
SystemMaxUse=500M
SystemMaxFileSize=32M
MaxFileSec=1day
MaxRetentionSec=14day
```

策略作用于默认 namespace 的整个系统 journal，包含游戏 API、数据看板和其他系统服务。日志持久保存，容量目标为 500 MiB；单文件达到 32 MiB 或一天时轮转，超出容量或保留期限的归档会被清理。14 天是保留期限上限，容量先达到限制时，实际可查询历史会更短；清理按日志文件进行，活动文件及轮转粒度可能造成少量容量或时间偏差。

此策略不限制 PostgreSQL 中的玩家存档、游玩时长，也不覆盖 Nginx/PostgreSQL 的独立文本日志。Nginx 现有 `/etc/logrotate.d/nginx` 按天轮转，保留 14 份历史日志并压缩。默认 journal 还可能转发到 syslog，独立日志文件应继续由其自己的 logrotate 规则管理。

普通应用 `update.sh` 发布和服务器重启后，此 `/etc/` 配置仍保留。迁移至新服务器时，需要单独恢复此系统配置；它不在游戏应用发布包中自动安装。复制上面的配置到同一路径后执行：

```sh
sudo systemctl restart systemd-journald.service
sudo journalctl --flush
sudo systemd-analyze cat-config systemd/journald.conf
sudo journalctl -u systemd-journald.service -n 10 --no-pager
sudo journalctl --disk-usage
```

重启日志服务使用一条 `restart` 命令以保留服务的日志流连接；之后确认日志启动信息中的 `max 500M`，以及 `decompression-api`、`decompression-data` 服务和 `/decompression/ready` 正常。调整日志策略无需重新发布游戏客户端或应用代码。

## 6. 回退应用

```sh
sudo /opt/decompression-api/bin/update.sh --rollback
```

先测试并检查数据库兼容，成功后切回前一个版本，再做内外网检查。测试/备份/迁移失败时保留当前应用；切换后检查失败时自动恢复原应用。出现 `AUTOMATIC_ROLLBACK_FAILED` 时需立即看服务日志。

**回退应用不会恢复旧数据库备份，也不会清除新写入的玩家数据。** 删除字段、删表、改变数据含义等不兼容变更须分阶段发布；迁移元数据若声明旧应用不能运行，普通发布/回退会拒绝执行。不能为绕过拒绝而修改历史迁移或伪造兼容声明。

## 7. 首次安装与迁移服务器

新服务器先准备 Node.js 22、PostgreSQL、Nginx、Certbot，将校验过的发布包解压到 `releases/<版本>/`，建立 `app` 链接，然后运行该版本中的 `deploy-native.sh` 初始化业务账号、数据库、迁移、systemd 与备份。已有服务器不重复执行首次初始化来代替日常更新。

HTTPS 和合法域名配置需按平台要求完成，申请证书的订户协议由账号持有人确认。异机迁移应在短暂停止写入后备份、恢复同一数据库并复制生产环境配置，检查新服务再切 DNS。数据库大版本至少兼容当前备份；`api_schema_migrations` 也要随整库一起迁移。当前仅有本机每日备份，尚无异机备份，不能防止整机或磁盘损坏。

## 8. 本机只读游戏数据页面

首次发布含 `viewer/` 的版本后执行 `sudo bash /opt/decompression-api/app/install-data-viewer.sh`。后续普通发布会自动重启已安装的查看器；不需要给公网接口增加路由。电脑访问、SSH 隧道和权限说明见 [DATA_VIEWER.md](DATA_VIEWER.md)。

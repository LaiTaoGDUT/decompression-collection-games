# 数据库迭代手册

数据库更新使用与代码发布相同的代码包和部署命令，发布器额外完成 **兼容检查 → 备份 → 迁移 → 切换应用**。日常操作入口见 [OPERATIONS.md](OPERATIONS.md)。

## 迁移文件与版本记录

- `migrations/0001_cloud_save.sql`：现有云存档、设备确认序号和时长表的基线。对已部署数据库使用 `CREATE ... IF NOT EXISTS` 接管，不清空玩家数据。
- `migrations/manifest.json`：按顺序声明迁移版本、SQL 文件及兼容范围。
- `api_schema_migrations`：数据库中记录已执行版本、SQL 摘要、兼容下限及执行时间。
- `migrate.cjs`：计算计划、校验历史、加数据库锁、执行事务和检查回退兼容性。

应用启动只检查需要的数据库版本，不在每次启动时擅自改表。第一次接管会在原数据库增加迁移记录表并记录基线版本。

## 示例：以后增加一个业务表

在 `migrations/` 新增 `0002_game_feedback.sql`，例如：

```sql
CREATE TABLE game_feedback (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id char(64) NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

再向 `manifest.json` 的 `migrations` 数组追加：

```json
{ "version": 2, "file": "0002_game_feedback.sql", "minAppVersion": 1 }
```

版本必须连续。`minAppVersion` 表示执行该迁移后，至少需要“声明数据库版本为几”的应用才能继续运行；新增独立表且不影响旧业务时通常保持 1。兼容声明需要开发者审查实际 SQL 和代码，工具不能自动证明业务兼容。迁移 SQL 不自带 `BEGIN`、`COMMIT` 或 `ROLLBACK`，由工具将本批 SQL 和迁移记录一起提交。

补上测试后按操作手册准备、验证、打包、上传、部署即可。SQL 文件按迁移清单自动入包，不另传 SQL、不需要在正式库手工点“执行”。示例只说明写法，目前没有上线反馈接口或这张表。

## 已执行的迁移不能改

后续修正使用 `0003_...sql` 等新文件。不要修改、删除已执行文件或重排版本；发现摘要和历史不一致，部署会停止。重复发布只执行尚未记录的版本。

数据库迁移用事务和 advisory lock 串行执行。任一语句失败，会撤销本批 SQL 和版本记录；此前已经成功提交的迁移保留。普通迁移有 5 秒锁等待、30 秒语句超时，超过时停止，不无限阻塞线上请求。大表回填、`CREATE INDEX CONCURRENTLY` 等不能放入普通事务或耗时较长的操作，需要另行设计受控方案。

## 如何处理删字段、删表和数据含义变化

采用分阶段方式：先新增兼容结构 → 发布可兼容新旧结构的代码 → 回填与核对数据 → 让客户端/旧代码退出兼容窗口 → 再安排删除旧结构。数据不可逆时单独审查和执行，不依赖应用自动回退。

普通发布会拒绝一个让当前运行版本无法回退的迁移。`minAppVersion` 变大后，旧版本的手动回退也可能被拒绝。这种情况应先发布过渡版本，明确停止写入与恢复方案，再安排不兼容操作；不要虚报 `minAppVersion` 强行发布。

## 人工查看迁移状态

在服务器上执行以下命令，只输出迁移版本信息，不输出数据库口令：

```sh
sudo bash -c 'set -a; source /opt/decompression-api/.env; set +a; cd /opt/decompression-api/app; node migrate.cjs --status'
```

真实数据库迁移回归测试使用隔离随机 schema：

```sh
sudo bash -c 'set -a; source /opt/decompression-api/.env; set +a; cd /opt/decompression-api/app; npm run test:postgres'
```

日常不要手动运行 `--apply` 绕过发布器的备份和当前应用兼容检查。仅首次初始化或已明确设计的运维流程使用该入口。

数据库及数据库角色均为 `decompression_api`，系统运行用户/组为 `decompression-api`。`cloud_saves` 是云存档业务表的名称，不是整个数据库名称；其他业务在同一游戏数据库中增加自己的表。服务名、发布包和运维入口均为 `decompression-api`。

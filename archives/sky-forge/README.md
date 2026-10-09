# 苍穹铸翼（飞机大战）归档

归档日期：2026-10-09。暂缓上架，保存当前工作区版本以备后续恢复。

游戏 ID 为 `sky-forge`，内容版本为 `1.0.0`，引擎为 Cocos Creator 3.8.8，目标平台为微信小游戏。归档前的清单状态是 `enabled: true`、`visibility: development`。

本次保存的是包含未提交改动的完整游戏文件快照；`inventory.json` 中的 `sourceCommit` 仅标识当时的 Git 基线，不代表这些游戏文件已经提交。

## 保存内容

| 目录 | 内容 | 恢复位置 |
| --- | --- | --- |
| `files/assets/games/sky-forge` 及同级 `.meta` | 全部游戏脚本、独立场景、代码 Bundle / 微信分包设置 | `assets/games/sky-forge` |
| `files/assets/game-assets/sky-forge` 及同级 `.meta` | 完整运行图片、图集、音频、材质和 Effect，保留所有 UUID | `assets/game-assets/sky-forge` |
| `files/assets/lobby-covers/visual/covers/sky-forge` 及同级 `.meta` | 大厅封面及原始导入设置 | `assets/lobby-covers/visual/covers/sky-forge` |
| `auxiliary-01.zip`、`auxiliary-02.zip`、`auxiliary-03.zip` | 798 个辅助文件：133 张原图、提示词和参考图片、89 份音频母带、参考工程、生成/验证工具、已有截图和报告 | 由恢复脚本按 `inventory.json` 的 `restorePath` 还原到各自原位置 |
| `integration` | 原游戏清单、广告配置、5 份共享文件的修改前快照和恢复补丁 | 通过补丁合并到当前共享文件 |

运行文件共 1,265 个，包括 `.meta`；其他项目不引用其中的资源 UUID。归档保留游戏 ID 和全部 `.meta`，以后恢复时可继续使用相同资源标识和玩家存档命名空间。

辅助资料采用无损 ZIP 压缩，保留原相对路径、文件内容、权限和修改时间；归档中的 798 个辅助散文件已由 3 个 ZIP 替代。完整归档从 2,076 个文件减少至 1,281 个文件，少 795 个。各压缩包约 87.1、81.0、77.8 MiB，均低于 [GitHub 的 100 MiB 单文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)，可通过普通 Git 保存。

压缩包中的工具分别恢复到 `tools/sky-forge` 和 `tools/sky-forge-v2`，原图恢复到 `output/imagegen/sky-forge-v2`，母带、截图和报告恢复到 `output/sky-forge-v2`，参考工程恢复到 `tmp/tidal-wings`。798 个辅助文件的原始副本仍在工作区原位置，归档通过 ZIP 独立保存备份。

生成器的隐藏临时目录、Python 缓存、旧版本截图合集及虚拟环境未复制进归档，它们不影响恢复运行。当前工作区不存在脚本注释所引用的 `docs/games/sky-forge/rework/DESIGN.md`，本归档以实际代码、资源及已有生成提示词为准。

## 当前工程状态

当前游戏清单已移除 `sky-forge`，公共广告配置与路由已移除其两处广告位。游戏场景、代码 Bundle、资源 Bundle 和大厅封面都已移出 `assets`，后续重新构建时不再打包飞机大战。

本目录位于 Cocos 资源目录外，也不在运行时 TypeScript 的 `assets/**/*.ts` 范围内。已有构建输出保留原样；需要重新构建才能得到不含飞机大战的新包。

归档自带 `.gitignore`，确保辅助资料 ZIP 可随归档纳入版本管理。

## 校验与恢复

在项目根目录执行以下命令。需要 Python 3.9 或更新版本及 Git。

```sh
python3 archives/sky-forge/restore.py --verify
python3 archives/sky-forge/restore.py --check
```

第一条命令校验 3 个 ZIP 的大小与 SHA-256、ZIP 内的文件清单，以及 `inventory.json` 中全部 2,068 个源文件的大小与 SHA-256；恢复脚本、补丁和说明文件也参与校验。第二条额外检查目标文件和注册补丁的冲突，两条都不修改工程，也不会解包生成辅助散文件。

决定恢复开发时执行：

```sh
python3 archives/sky-forge/restore.py --restore
```

恢复脚本先完整校验，再复制运行文件、将 ZIP 内需要恢复的辅助资料逐个写入目标位置，最后通过 `integration/re-enable.patch` 合并游戏清单、配置和广告注册。已经存在且内容一致的文件会跳过；遇到不同内容或补丁冲突会在写入前停止，避免覆盖其他游戏的后续改动。归档自身持续保留，无需手工解压。

共享文件变化较大时，参照 `integration/game-manifest.json`、`integration/ad-config.json` 与 `integration/before` 手动合并相关注册，不要把整份历史共享文件覆盖回工程。

恢复后使用 `cocos_creator_stdio` MCP 刷新资源，再检查 TypeScript、Bundle 和实际运行。恢复会沿用原来的 `development` 标记；将来决定正式上架时，再完成发布验收并调整可见性。原始 Sprite 图集后续统一使用项目的 `sprite-atlas-sources/build.py` 流程更新。

## 归档验证

完成记录见 `verification.json`。归档完整性、ZIP 内全部文件的 SHA-256、隔离目录完整恢复、目标文件冲突保护、其他游戏后续改动保留、TypeScript、Bundle 与 `git diff --check` 均通过；已通过 `cocos_creator_stdio` MCP 刷新 `db://assets`。辅助资料压缩后仅同步飞机大战归档目录的暂存内容，其他暂存内容保留。本次归档尚未提交或推送，也未重新生成发布构建。

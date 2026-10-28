# 咧咧团快跑封存

封存日期：2026-10-28。按用户要求停止当前开发并移出合集，保留当前工作区版本供以后恢复。包含本次 v52 连续关节动画、脚底接触校准、单层背景和操作手感修正；这些修改不代表视觉和玩法已获得最终认可。

游戏 ID：`meme-runner`；内容版本：`0.1.0`；引擎：Cocos Creator 3.8.8；目标平台：微信小游戏。原清单为 `enabled: true`、`visibility: development`，横屏运行。

`inventory.json` 记录 1,110 个文件的原路径、大小和 SHA-256。保存的是含未提交改动的工作区快照，`sourceCommit` 仅标识 Git 基线，不代表该版本已提交。

## 保存内容

| 位置 | 内容 |
| --- | --- |
| `files/assets/games/meme-runner` 及同级 `.meta` | 场景、脚本、代码 Bundle 和分包设置，包括最新 v52 逻辑 |
| `files/assets/game-assets/meme-runner` 及同级 `.meta` | 完整运行图集、图片、音频和原始 UUID |
| `files/assets/lobby-covers/visual/covers/meme-runner` 及同级 `.meta` | 大厅封面 |
| `files/sprite-atlas-sources/meme-runner` | 各版原始图片、图集源稿、`.meta`、提示词和 v52 制作记录 |
| `files/audio-bank-sources/meme-runner` | 音频源文件及音频包定义 |
| `integration` | 原游戏清单、云存档定义、图集分组、共享配置快照和恢复补丁 |

游戏文档、历史预览、生成与验证工具，以及 v52 玩法视频和截图不在本归档中。未保存逐帧录屏中间 PNG、Python 缓存或旧构建缓存。

## 当前工程状态

游戏清单、云存档活动配置、图集生成/压缩清单、音频构建选项和服务端生成清单已移除该游戏。场景、代码、运行资源、封面和制作源稿移至本目录，后续重新构建不会包含跑酷 Bundle。公共云存档回归改用仍在合集中的计分游戏作为样例。

没有删除玩家本地或服务端历史存档，没有部署服务端或重新发布客户端。原云存档编码 `13` 保留给 `meme-runner`，不得分配给其他游戏。现有构建产物保持原样，需重新构建才会反映封存结果。

封存前检查了 323 个资源 UUID，没有其他活动资源引用它们。本目录位于 `assets` 外，不参加 Cocos 导入或运行时 TypeScript 编译。

## 校验与恢复

在项目根目录执行：

```sh
python3 archives/meme-runner/restore.py --verify
python3 archives/meme-runner/restore.py --check
```

前者校验所有归档文件、共享配置和恢复工具；后者额外检查目标文件是否冲突、共享注册补丁能否合并，均不会修改工作区。

决定恢复开发时执行：

```sh
python3 archives/meme-runner/restore.py --restore
```

恢复脚本先完成校验和冲突预检，再恢复文件、合并共享配置。已存在且内容相同的文件会跳过；存在不同内容或共享补丁冲突时，会在写入前停止。归档自身保留不变。共享配置变化较大时，根据 `integration/game-manifest.json`、`integration/cloud-save.json`、`integration/sprite-groups.json` 和修改前快照手动合并游戏条目，重新运行服务端生成及图集工具；不要用整份旧配置覆盖新配置。

恢复后，通过 `cocos_creator_stdio` MCP 刷新资源，再执行 TypeScript、Bundle、图集和游戏验证。后续制作图集仍统一使用 `sprite-atlas-sources/build.py`。恢复沿用原来的 `development` 可见性；正式上架需另行验收。

封存检查结果见 `verification.json`。此次只完成本地封存，未提交或推送 Git。

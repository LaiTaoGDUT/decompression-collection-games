# 项目维护与生成脚本

`project-scripts/` 保存需要随项目提交 Git 的维护、校验和生成脚本：现有命令与编辑器的直接依赖，以及当前运行时代码、命中轮廓和程序贴图的生成器。

不要把任何工具代码都扔到这个目录，这个目录只存未来仍可能被使用的脚本。

## 保留清单

| 文件或目录 | 保留原因 |
| --- | --- |
| `cocos-mcp-platform-bridge.js`、`cocos-mcp-stdio-bridge.ps1` | `.mcp.json` 的 Cocos MCP 入口；Node 桥接在 Windows 上调用 PowerShell 文件，两者必须一起保存。 |
| `verify-game-bundles.js` | `npm run verify:game-bundles`，检查清单、代码分包、远程资源包、场景相机绑定与加载约束。 |
| `verify-lobby-tags.cjs` | `npm run verify:lobby-tags`，检查大厅标签配置、默认与历史排序、NEW 持久隐藏及进入请求互斥。 |
| `verify-wechat-package-size.js` | `npm run verify:wechat-package-size`，检查已生成的微信构建、分包、远程资源与包体积。 |
| `verify-fonts.cjs`、`fonts/` | `npm run verify:fonts`、`extensions/font-build-guard` 和文案补字流程的依赖。包含字体服务校验、字形覆盖校验、源码字符扫描及字库更新。 |
| `announcements/` | `npm run announcements` 与 `npm run verify:announcements`：本地编辑历史版本更新公告、设为生效、复制审核纯文本，并校验规则与访问控制。 |
| `cocos-refresh.cjs` | 文案审校与版本公告共用的 Cocos 资源刷新，经 `cocos_creator_stdio` 同一项目 MCP 刷新 `db://assets`。 |
| `copy-review/` | `npm run copy:review` 与 `npm run verify:copy-review` 的完整实现，包含页面、扫描与精确写回、建议数据、服务及校验。 |
| `generate-desktop-cleanup-hit-polygons.py`、`desktop-cleanup/generate-dessert-hit-shapes.py` | 从当前物品图集生成桌面清理的命中多边形，保留甜点与便利店物品的孔洞。后者从 `DesktopCleanupTheme.ts` 读取图集顺序，不依赖本机 `docs`。 |
| `meowdoku/build-level-bank.py` | 生成普通 `MeowdokuLevels.ts`（默认 3000 关）或 `--mode hard` 的 `MeowdokuHardLevels.ts`（SuperHard，默认 200 关，先 rank4 后 rank5）；输入 APK/XAPK 或已解密题库由调用方提供，支持 `--check`。 |
| `meowdoku/verify-modes-browser.cjs` | 使用隔离存档在 Cocos 预览回归双模式切换/续玩、一命无复活、旧关跳最新关、200 关末页及胶囊/底部安全区与长短屏布局；需要本机 Playwright，可用 `PLAYWRIGHT_MODULE` 指定路径。 |
| `meowdoku/build-board-textures.py` | 生成当前数独棋盘、叉笔画与投影贴图。棋盘保持为独立纹理；已参与 SpriteAtlas 的笔画与投影更新源图片，再统一合图。 |

Node 工具使用项目现有的 Node.js 与 TypeScript 编译器 `tsc`；Python 图片工具需要 Pillow，字体更新额外需要 fontTools 与完整的 ResourceHanRoundedCN 原字体。

## 常用命令

```sh
tsc --noEmit -p tsconfig.json
npm run verify:game-bundles
npm run verify:lobby-tags
npm run verify:fonts
npm run verify:copy-review
npm run verify:announcements
git diff --check
```

`verify:fonts` 按 `assets/resources/configs/app.json` 中的 `fonts.enabled` 和 `fonts.validateCoverage` 决定是否检查源码字形覆盖；开关关闭时会明确输出跳过原因。

大厅推广标签在 `assets/resources/configs/games.json` 的游戏条目中配置 `lobbyTags: ["new", "hot"]`，可只配置其中一种，省略或空数组则无推广标签；旧清单的 `lobbyTag` 单值仍可读取，但不能与 `lobbyTags` 混用。卡片按 NEW、HOT、最近游玩的优先级显示一个标签，与数组顺序无关。NEW 按游戏条目的 `version` 判断：只有成功打开当前内容版本后才持久隐藏，随后显示配置的 HOT；更新版本后重新显示 NEW，加载失败、旧版本游玩记录或没有版本的旧隐藏记录不会提前隐藏。访问版本记录与小游戏进度独立保存。没有任何游玩记录时按 NEW、HOT、普通游戏排序；有游玩记录后按最近游玩、未隐藏的 NEW、其余游戏的游玩时间排序，HOT 不再单独提前。

`npm run verify:lobby-tags` 验证版本升级、旧存档兼容、NEW/HOT 切换、成功进入后记录、加载失败保留 NEW 和存储重试。

微信包体积校验需要已有 `build/wechatgame` 或 `build/wechatgame-数字` 目录：

```sh
npm run verify:wechat-package-size
```

将桌面清理三套主题轮廓生成到本机目录，供检查后再更新游戏代码：

```sh
python3 project-scripts/desktop-cleanup/generate-dessert-hit-shapes.py dessert --output local/hit-shapes/Dessert.ts
python3 project-scripts/desktop-cleanup/generate-dessert-hit-shapes.py convenience --output local/hit-shapes/Convenience.ts
python3 project-scripts/desktop-cleanup/generate-dessert-hit-shapes.py fruit --output local/hit-shapes/Fruit.ts
```

不指定 `--output` 会更新游戏中当前主题的 `HitShapes.ts`；用 `--report` 可保存轮廓统计。工作台主题由 `generate-desktop-cleanup-hit-polygons.py` 生成。本次检查发现甜点和便利店的既有轮廓与当前图集重算结果不同，整理工具时未改动既有轮廓；以后重算需检查实际命中效果。

## 图集工具的位置

正式 SpriteAtlas 的源图、定义、构建及校验仍由项目已有的 [sprite-atlas-sources](../sprite-atlas-sources/README.md) 管理，入口为 [build.py](../sprite-atlas-sources/build.py)。不要将旧 `tools_copy/sprite-atlases/` 或旧散图处理脚本恢复成另一条合图流程。

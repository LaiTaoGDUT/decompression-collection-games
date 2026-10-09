# 项目维护与生成脚本

`project-scripts/` 保存需要随项目提交 Git 的维护、校验和生成脚本：现有命令与编辑器的直接依赖，以及当前运行时代码、命中轮廓和程序贴图的生成器。`tools_copy/` 是本机制作与排查备份，已由根目录 `.gitignore` 忽略。

## 保留清单

| 文件或目录 | 保留原因 |
| --- | --- |
| `cocos-mcp-platform-bridge.js`、`cocos-mcp-stdio-bridge.ps1` | `.mcp.json` 的 Cocos MCP 入口；Node 桥接在 Windows 上调用 PowerShell 文件，两者必须一起保存。 |
| `verify-game-bundles.js` | `npm run verify:game-bundles`，检查清单、代码分包、远程资源包、场景相机绑定与加载约束。 |
| `verify-wechat-package-size.js` | `npm run verify:wechat-package-size`，检查已生成的微信构建、分包、远程资源与包体积。 |
| `verify-fonts.cjs`、`fonts/` | `npm run verify:fonts`、`extensions/font-build-guard` 和文案补字流程的依赖。包含字体服务校验、字形覆盖校验、源码字符扫描及字库更新。 |
| `copy-review/` | `npm run copy:review` 与 `npm run verify:copy-review` 的完整实现，包含页面、扫描与精确写回、建议数据、服务及校验。 |
| `generate-desktop-cleanup-hit-polygons.py`、`desktop-cleanup/generate-dessert-hit-shapes.py` | 从当前物品图集生成桌面清理的命中多边形，保留甜点与便利店物品的孔洞。后者从 `DesktopCleanupTheme.ts` 读取图集顺序，不依赖本机 `docs`。 |
| `meowdoku/build-level-bank.py` | 生成 `MeowdokuLevels.ts`；输入 APK/XAPK 或已解密题库由调用方提供，支持 `--check`。 |
| `meowdoku/build-board-textures.py` | 生成当前数独棋盘、叉笔画与投影贴图。棋盘保持为独立纹理；已参与 SpriteAtlas 的笔画与投影更新源图片，再统一合图。 |

目录包含 19 个文件（含本说明）。Node 工具使用项目现有的 Node.js 与 TypeScript 编译器 `tsc`；Python 图片工具需要 Pillow，字体更新额外需要 fontTools 与完整的 ResourceHanRoundedCN 原字体。

## 常用命令

```sh
tsc --noEmit -p tsconfig.json
npm run verify:game-bundles
npm run verify:fonts
npm run verify:copy-review
git diff --check
```

`verify:fonts` 按 `assets/resources/configs/app.json` 中的 `fonts.enabled` 和 `fonts.validateCoverage` 决定是否检查源码字形覆盖；开关关闭时会明确输出跳过原因。

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

## 留在本机备份的内容

- 各小游戏历史版本的 `prepare-*`、`art-*`、`v2` 至 `v10` 制作与迁移脚本，以及已归档的 `sky-forge` 工具。
- 针对某次修改的浏览器截图、试听、性能排查、回归脚本及其缓存。
- 依赖已移除的 `docs/`、制作原图、母版、下载缓存或临时目录的图片交付与音频制作流程。当前正式图片、图集、音频和题库代码已在项目中，这些制作过程不属于运行或构建依赖。
- `__pycache__`、`.pyc` 等语言缓存。

游戏源码注释中的部分旧 `tools/audio/`、`tools/meowdoku/seed-vc/` 路径记录制作来源，对应流程仍保存在本机 `tools_copy/`；它们不会在运行或构建时被加载。

这次整理只写工作区文件，未修改 Git 暂存区。提交前将本目录加入暂存区，以覆盖之前重命名目录所产生的旧工具删除记录。

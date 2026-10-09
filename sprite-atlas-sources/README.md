# 图集源素材与制作工具

本目录集中保存 Sprite 图集的源素材、分组清单、生成记录及制作工具。原始图片、原始 `.meta`、原始手工 `.plist` 和已替换的 `.pac` 按 `<游戏>/visual/<模块>` 组织，位于 `assets` 外，不会被 Cocos 导入、打包或预加载。

新增或更新图集统一使用本目录的 `build.py`。更新素材时修改这里的源图及几何信息，不要手工修改成品图集或在游戏 Bundle 中恢复散图。保存源图片不会自动执行合图。

## 分组与成品

`manifest.json` 明确列出同一游戏、同一功能模块的分组。新增图片或调整尺寸、裁剪时，同步更新分组清单和相应几何信息，不得跨游戏或跨大厅/游戏 Bundle 合图。

当前分组覆盖八款游戏，生成 66 页 PNG + Cocos `.plist`，共有 314 个子帧。成品 PNG、`.plist` 与 `.meta` 位于 `assets/game-assets/<游戏>/visual/<模块>`。大背景、拼图照片、既有物品网格表和猫动画网格表保留独立纹理。

## 生成和压缩

需要 Python 3.9+ 和 Pillow，Cocos Creator 固定为 3.8.8。以下命令均在项目根目录执行；脚本通过自身位置定位项目和源素材，也支持从其他工作目录使用绝对路径调用。

1. `python3 sprite-atlas-sources/build.py`
2. 使用 `cocos_creator_stdio` 刷新 `db://assets`。
3. `python3 sprite-atlas-sources/build.py --sync-imports`，记录 Cocos 为新子帧分配的 UUID。如果修改了场景引用，再刷新资源。
4. `python3 sprite-atlas-sources/compress.py --dry-run`
5. `python3 sprite-atlas-sources/compress.py --in-place`
6. 使用 `cocos_creator_stdio` 再次刷新资源。
7. `python3 sprite-atlas-sources/build.py --verify`

压缩包装脚本调用项目的 [tinypng-batch skill](../.agents/skills/tinypng-batch/SKILL.md)，只处理 `compression-inputs.json` 中的成品图集，包括生成的图集及保留的既有图集。TinyPNG 在成品目录原地压缩。Key 使用项目 `local/tinypng-batch/keys.json`，缓存使用 `local/tinypng-batch/cache`；不要提交 Key、缓存或调用日志。网络访问及额度遵循该 skill 的规则。

生成器不会旋转、缩放图片。每帧有一像素边缘扩展，外加一像素透明隔离；所有页面不超过 1024 × 1024，按实际使用区域裁去页面空白。`geometry: "full"` 保留原本按整张 Texture2D 显示的几何，`geometry: "meta"` 保留之前 SpriteFrame 的裁剪、原始尺寸和偏移。`frame` 从既有手工 `.plist` 中取命名子帧。桌面大清理的按钮额外保留既有裁剪和横向切片；Cocos 元数据的边距按整数像素存储，运行时三段按钮仍使用原来的比例。

`generated.json` 记录未压缩像素的哈希和帧几何。源图未变时再次运行生成器会保留当前 PNG 字节，不会覆盖 TinyPNG 结果或重复有损压缩。分组页数减少时会清理旧页；帧跨页移动时会更新场景/Prefab 中的 UUID。每款游戏私有的 `PackedSpritePaths.ts` 将历史制作路径映射到新的子帧路径。生成记录、UUID 迁移记录、压缩输入清单和路径映射由工具维护。

## 运行时与构建验证

帧通过 `AssetService.loadSpriteFrames()` 获取：导入帧归 Bundle 所有，运行时副本保留 Rect、originalSize、offset、rotation 和九宫格，失败时清理本组副本，退出等待整个加载链完成。泡泡奇境继续按主题延迟准备资源，并借用 Bundle 中的帧。

图集 PNG 使用 Texture2D 导入，关闭 `fixAlphaTransparencyArtifacts`，子帧关闭动态合图。微信构建保持 `skipCompressTexture: true`，压缩后再交由 Cocos 生成 MD5 文件名；不得在构建后直接改写已带 MD5 的 PNG。

验证命令（构建目录替换为实际输出目录）：

```sh
node sprite-atlas-sources/verify-ownership.cjs
node sprite-atlas-sources/verify-browser.cjs
python3 sprite-atlas-sources/verify-build.py build/wechatgame-manual-atlases-20261004
```

浏览器测试读取 `COCOS_PREVIEW_URL`，需先通过 MCP 启动 Cocos 预览。截图和报告输出到 `local/manual-atlas-verification`。构建校验逐个检查 314 个帧的真实依赖和几何，核对 103 张成品图集的字节及 MD5，并确认源散图未残留。

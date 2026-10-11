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
3. `python3 sprite-atlas-sources/build.py --sync-imports`，记录 Cocos 为新子帧分配的 UUID。首次导入可能同时保留生成器的临时 ID 和 Cocos 的实际 ID；工具会优先采用实际导入 ID。如果修改了场景引用，再刷新资源。
4. `python3 sprite-atlas-sources/build.py --editor-metadata-output /tmp/sprite-atlas-editor-metadata.json`，用同步后的 ID 重建并导出生成器的完整图集元数据。
5. 对新增或更改的图集，先通过 `cocos_creator_stdio` 的 `asset_query` 查询图集身份，再用 `asset_manage` 的 `save_meta` 保存导出 JSON 中对应 URL 的元数据，最后刷新资源。元数据内容直接使用生成器输出，不手工编辑成品；这一步同步编辑器内存中的缓存，防止仅改磁盘文件后旧子帧记录又被恢复，并保留 `packable: false`。
6. `python3 sprite-atlas-sources/compress.py --dry-run --game <游戏>`，确认只列出本次改动游戏的图集。
7. `python3 sprite-atlas-sources/compress.py --in-place --game <游戏>`
8. 使用 `cocos_creator_stdio` 再次刷新资源。
9. `python3 sprite-atlas-sources/build.py --verify`

压缩包装脚本调用项目的 [tinypng-batch skill](../.agents/skills/tinypng-batch/SKILL.md)，只处理 `compression-inputs.json` 中的成品图集，包括生成的图集及保留的既有图集。不带选择条件时处理清单中的全部图集；`--game <游戏>`（可重复）只选 `assets/game-assets/<游戏>` 下的图集，也可以直接传清单中的图集文件或包含它们的目录（相对当前目录或绝对路径）。选择条件只能命中清单中的图集，命中为空时直接报错退出，拼错名称不会退回全量压缩。只压缩本次改动的图集，避免对其他游戏已压缩的成品重复有损压缩。TinyPNG 在成品目录原地压缩。Key 使用项目 `local/tinypng-batch/keys.json`，缓存使用 `local/tinypng-batch/cache`；不要提交 Key、缓存或调用日志。网络访问及额度遵循该 skill 的规则。

压缩清单从 `.plist` 的 `metadata.textureFileName` 读取实际纹理路径；缺少该字段时使用 `realTextureFileName`，保留 PNG、JPG 等实际扩展名及文件名。元数据未声明纹理或引用文件不存在时，生成器会报告对应图集和缺失路径。`build.py --verify` 同时检查压缩清单是否与当前图集引用一致；微信构建校验按源纹理的实际扩展名核对成品字节。生成器回归验证运行 `python3 sprite-atlas-sources/test_build.py`。

生成器不会旋转图片。每帧有一像素边缘扩展，外加一像素透明隔离；所有页面不超过 1024 × 1024，按实际使用区域裁去页面空白。`geometry: "full"` 保留原本按整张 Texture2D 显示的几何，`geometry: "meta"` 保留之前 SpriteFrame 的裁剪、原始尺寸和偏移。`frame` 从既有手工 `.plist` 中取命名子帧。可在帧条目中用 `resize: [宽, 高]` 按实际显示尺寸等比缩小，生成器使用 Lanczos 重采样，并同步原始尺寸、偏移和九宫格边距；源图及原始 `.meta` 保持完整，不会因重复合图继续缩小。尺寸不允许放大或改变宽高比（整数像素允许一像素舍入误差）。九宫格和重复平铺帧调整尺寸会影响实际边框厚度或平铺密度，应按游戏使用方式决定是否缩小。桌面大清理的按钮额外保留既有裁剪和横向切片；Cocos 元数据的边距按整数像素存储，运行时三段按钮仍使用原来的比例。

`generated.json` 记录未压缩像素的哈希和帧几何。源图未变时再次运行生成器会保留当前 PNG 字节，不会覆盖 TinyPNG 结果或重复有损压缩。分组页数减少时会清理旧页；帧跨页移动时会更新场景/Prefab 中的 UUID。每款游戏私有的 `PackedSpritePaths.ts` 将历史制作路径映射到新的子帧路径。生成记录、UUID 迁移记录、压缩输入清单和路径映射由工具维护。`--verify` 也会拒绝重复名称、额外子帧和动态合图标志错误，避免编辑器缓存与生成记录不一致。

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

## 图片压缩

如果需要压缩图片，不要压缩这里的原图，而是直接压缩成品图集。

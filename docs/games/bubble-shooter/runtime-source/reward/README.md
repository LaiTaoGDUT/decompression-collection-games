# 奖励运行时素材

来源：用户确认的奖励 v4。2026-09-12 用户明确允许本地脚本抠图、裁切、缩尺寸；原始生成图保留在 `art-source/reward`。

7 张 PNG 全部是真实 RGBA，四角透明，选中框内孔透明。素材源文件与正式 Bundle 文件 SHA-256 一致，总计 683,433 字节（约 667 KiB）。不把大尺寸生图原图导入游戏。

| 部件 | 像素尺寸 | 九宫格 [左,右,上,下] |
| --- | --- | --- |
| panel | 768 × 460 | [68, 68, 68, 68] |
| card | 256 × 428 | [46, 46, 46, 46] |
| button | 512 × 126 | [63, 63, 0, 0] |
| selection | 192 × 322 | [44, 44, 44, 44] |
| check | 96 × 94 | [0, 0, 0, 0] |
| subtitle | 512 × 91 | [45, 45, 0, 0] |
| cloud-title | 768 × 198 | [0, 0, 0, 0] |

SpriteFrame 关闭自动裁切，边界相对完整画布，避免透明裁切导致九宫格错位；线性过滤、clamp-to-edge、关闭 mipmap。按钮和提示底牌固定左右圆头、只拉伸中段；面板/卡片/选中框四边九宫格。勾选与标题只能等比缩放。缩小高度时应统一缩放节点，不将九宫格内容高度压到端帽以下。

正式路径：

- 通用部件：`assets/game-assets/bubble-shooter/visual/common/reward-common/`。
- 云端标题：`assets/game-assets/bubble-shooter/visual/regions/cloud/reward-cloud/`。

没有云朵烘焙进通用主体。云朵仅存在于独立云端标题，Boss 分层与场景背景继续复用已有素材。道具图标、文字、库存和状态由后续界面组装。

复现：`python3 tools/bubble-shooter/prepare-reward-assets.py`（Pillow）。生成透明 PNG、资源 meta 和尺寸清单；已存在 meta 的 UUID 保持不变，不再写入评审预览图。

已验证 7 张纹理加载、九宫格数值与不裁切设置，Cocos 页面错误为空；文件尺寸、透明角、内孔、源/Bundle 哈希一致性检查通过。TypeScript、Bundle 边界和 git diff --check 通过。临时检查图已清理。

2026-09-12 后续：正式奖励组件已接入。运行时使用本目录和正式资源 Bundle 中的 7 张素材，临时运行截图已清理。

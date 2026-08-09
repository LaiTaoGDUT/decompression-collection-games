# 素材来源台账

> 台账版本：1.5
>
> 状态：L1 + W1 方向已确认，首发大厅与 W1 核心美术可导入
>
> 视觉框架：[VISUAL_STYLE_GUIDE.md](./VISUAL_STYLE_GUIDE.md)

## 1. 状态定义

- `方向待定`：视觉单元尚未选定方向，禁止生成正式素材。
- `计划中`：方向已定但素材尚未创建。
- `待许可确认`：已有候选文件，来源或许可尚未核对，只能开发占位。
- `待处理`：来源与许可已确认，尚未完成后处理。
- `可导入`：来源、许可和处理完成，可进入开发构建。
- `候选可用`：完成真机、包体和视觉检查，可进入试玩候选构建。
- `拒绝`：来源、许可、质量或技术指标不符合要求。

`方向待定`、`计划中`、`待许可确认` 和 `拒绝` 项均不得作为候选版本正式素材。

## 2. 视觉单元

| 单元 | 当前方向 | 独立令牌 | 资源根 | Bundle |
| --- | --- | --- | --- | --- |
| 大厅 | L1 柔光收藏馆 | [LOBBY_VISUAL_SPEC.md](./LOBBY_VISUAL_SPEC.md) | `assets/lobby/visual/` | `lobby` |
| 合成大西瓜 | W1 纸片折纸果摊 | [WATERMELON_VISUAL_SPEC.md](./WATERMELON_VISUAL_SPEC.md) | `assets/games/watermelon/visual/` | `game-watermelon` |
| 公共技术层 | 无正式视觉主题 | 只保留安全区、触摸、状态和无障碍约束 | `assets/shared/` | 主包 |

## 3. 首版素材路由

| ID | 视觉所有者 | 资源名称 | 状态 | 来源策略 | 来源/许可检查 | 计划仓库路径 | Bundle | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOB-001 | 大厅 | 正式背景 | 可导入 | Codex 内置 ImageGen，`L1-LOBBY-BG-V1` | [完整生成与后处理记录](./asset-generation/L1_LOBBY_BG_V1.md)；项目原创，无外部输入 | `assets/lobby/visual/backgrounds/l1-soft-light-gallery-v1.jpg` | `lobby` | 750×1334，96,594 bytes；第 7 步完成 |
| LOB-002 | 大厅 | 品牌区装饰 | 可导入 | Cocos Label/Graphics 项目自绘 | [节点、颜色与安全区记录](./asset-generation/L1_LOBBY_BG_V1.md#5-品牌区修改记录)；项目原创 | `assets/lobby/scripts/LobbyPresentation.ts` | `lobby` | 不引用任何游戏主题；第 7 步完成 |
| LOB-003 | 大厅 | 标准卡片与整卡入口 | 可导入 | Cocos Graphics/Label/Tween 项目自绘 | 项目原创；L1 令牌由 `GameCardView` 统一绘制 | `assets/lobby/scripts/GameCardView.ts` | `lobby` | 暖奶油/鼠尾草展品档案卡、装帧阴影、类型展签与封面呼吸；无独立进入按钮，整卡点击；全部真实游戏同权重 |
| LOB-004 | 大厅 | 敬请期待卡 | 可导入 | L1 项目自绘 | 同一标准卡尺寸，静态系统数据；无外部素材 | `assets/lobby/scripts/GameCardView.ts` | `lobby` | 叠放空展卡 + 加号；无按钮、无点击、无 Manifest；实机预览确认位于列表末尾 |
| LOB-005 | 大厅展示副本 | 合成大西瓜封面 | 可导入 | Codex 程序化 SVG/Sharp 原创 V2，复用项目自有 W1 水果母版 | [V1 历史与 V2 替换记录](./asset-generation/W1_LOBBY_COVER_V1.md)；无外部输入 | `assets/lobby/visual/covers/watermelon/w1-watermelon-cover-v1.jpg` | `lobby` | 920×690，98,855 bytes；7 种折纸水果组合；不反向加载游戏 Bundle |
| LOB-006 | 大厅 | 设置入口与设置面板 | 可导入 | Cocos Graphics/Label 项目自绘 | 项目原创；只调用 Audio/Feedback/Storage/Platform 公共边界 | `assets/lobby/scripts/LobbySettingsPanel.ts` | `lobby` | 小尺寸展签入口、分层纸张弹窗、单一珊瑚侧脊、三张设置票卡与实体开关旋钮；音乐、音效、振动及失败回滚；第 9 步完成 |
| WM-001 | 合成大西瓜 | 11 级水果套图 | 可导入 | Codex 程序化 SVG/Sharp 原创；ImageGen 三次网络失败未产出 | [完整提示、失败与生成记录](./asset-generation/W1_GAME_ART_V1.md)；无外部输入 | `assets/games/watermelon/visual/fruits/` | `game-watermelon` | 11×512² 透明 PNG，场上、投放预览与下一个预览同源；全部 11 级均叠加清晰圆形双层边框；第 20 步完成 |
| WM-002 | 合成大西瓜 | 游戏背景、容器、危险线 | 可导入 | Codex 程序化 SVG/Sharp背景 + W1 Graphics | [生成与接线记录](./asset-generation/W1_GAME_ART_V1.md)；项目原创 | `assets/games/watermelon/visual/backgrounds/`、`WatermelonLayout.ts` | `game-watermelon` | 背景 750×1334；容器/边界与碰撞一致；第 20 步完成 |
| WM-003 | 合成大西瓜 | HUD、按钮、弹窗和图标 | 可导入 | W1 游戏主题 Graphics/Label 独立自绘 | 项目原创；无外部资源 | `assets/games/watermelon/scripts/WatermelonLayout.ts` | `game-watermelon` | HUD 与续玩层已接入，暂停/结果在第 24 步完成 |
| WM-004 | 合成大西瓜 | 纸屑、折片与分数动效 | 可导入 | W1 Graphics/Label/Tween 项目自绘 | 项目原创；无外部纹理 | `assets/games/watermelon/scripts/WatermelonGame.ts`、`FruitBody.ts` | `game-watermelon` | 高/中/低粒子数 8/4/0；第 22 步完成 |
| LOB-A01 | 大厅 | 大厅循环音乐与 UI 音效 | 可导入 | Codex 项目内程序化合成/编曲，种子 `0x51A7E202` | [脚本、母带、压缩、指标与试听记录](./asset-generation/AUDIO_V1.md)；无外部音频 | `assets/lobby/visual/audio/` | `lobby` | V2 保留 L1 基底并丰富低频、回应旋律和空间闪光；等待用户复听确认 |
| WM-A01 | 合成大西瓜 | 游戏循环音乐与反馈音效 | 可导入 | Codex 项目内程序化合成/编曲，同一可复现脚本的 W1 独立参数 | [完整记录](./asset-generation/AUDIO_V1.md)；无外部音频 | `assets/games/watermelon/visual/audio/` | `game-watermelon` | W1 音乐 + 12 Cue；V2 重制危险/失败，V3 丰富音乐并柔化碰撞，V4 重制投放松手 Cue；等待用户复听确认 |

## 4. 实际素材必填字段

每条素材必须补全：

- 资源名称、用途、视觉所有者和状态。
- 来源类型、官方原始地址或完整生成提示词。
- 作者、组织、工具或模型。
- 许可证/使用依据与核对日期。
- 生成或下载日期、原始文件位置。
- 裁切、抠图、调色、尺寸和压缩修改记录。
- 最终仓库路径与 Bundle。
- 真机显示、内存、包体和释放证据。

## 5. 候选构建检查

- 大厅和每个小游戏的用户可见素材都能按视觉所有者独立追溯。
- 大厅不包含游戏内 UI、水果、容器或游戏音效；游戏不引用大厅皮肤。
- 游戏封面作为大厅展示副本有明确双重归属说明，但物理文件只在 `lobby` Bundle。
- ImageGen 素材包含完整提示词、工具/模型、日期、原始输出和后处理记录。
- 外部素材包含官方地址、许可证原文和署名要求。
- 不存在来源不明、直接取自其他游戏或仍为开发占位的可见素材。
- 只有状态为 `候选可用` 的素材进入用户试玩候选构建。
- 音频除最终文件外必须同时保留可复现脚本、参数、随机种子、WAV 母带、压缩命令/设置、循环点、峰值与响度报告；缺任一关键记录不得升级为 `候选可用`。

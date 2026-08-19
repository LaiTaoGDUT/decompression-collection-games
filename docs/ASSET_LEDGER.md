# 素材台账

> 当前记录的界面图片均由用户从本地目录提供；来源和最终使用许可尚未单独确认。许可确认前不得宣称为候选发布素材。

| 素材 | 来源/修改 | 用途 | Bundle / 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 游戏背景.jpg | 用户提供；原样复制 | 全屏木桌背景 | `game-sliding-puzzle` / `visual/backgrounds/sliding-puzzle-background-v1.jpg` | 待许可确认 |
| 棋盘背景.png | 用户提供；原样复制 | 完整棋盘、木框和内槽底色 | `game-sliding-puzzle` / `visual/boards/sliding-puzzle-board-v1.png` | 待许可确认 |
| 拼图格子背景.png | 用户提供；原样复制 | V13 图片贴面下方的拼图底座 | `game-sliding-puzzle` / `visual/tiles/sliding-puzzle-tile-skin-v1.png` | 待许可确认 |
| 弹窗背景.png | 用户提供；原样复制，运行时 Sliced | 暂停、参考图、裁剪、结算弹窗 | `game-sliding-puzzle` / `visual/popups/pz1-popup-background-v1.png` | 待许可确认 |
| 返回/暂停/剪裁/参考图/相册/关闭按钮.png | 用户提供；原样复制 | 游戏内按钮图标 | `game-sliding-puzzle` / `visual/icons/pz1-*-v1.png` | 待许可确认 |
| 图标合集.png | 用户提供；裁取上排中间 512×512 图标 | 游戏图标 | `game-sliding-puzzle` / `visual/icons/sliding-puzzle-icon-v1.png` | 待许可确认 |
| 大厅游戏卡片封面.jpg | 用户提供；原样复制到大厅副本 | 大厅卡片封面 | `lobby` / `visual/covers/sliding-puzzle/sliding-puzzle-cover-v1.jpg` | 待许可确认 |
| 游戏大厅封面.jpg | 用户提供；原样复制，作为拼图预设图 | 拼图图片切片预览与棋盘方块 | `game-sliding-puzzle` / `visual/presets/preset-07-cats-cover-v1.jpg` | 待许可确认 |

## 猫咪游戏素材

| 素材 | 来源/修改 | 用途 | Bundle / 路径 | 状态 |
| --- | --- | --- | --- | --- |
| 游戏背景.jpg | 用户提供；原样替换 | 猫咪游戏全屏背景，运行时按 cover 适配 | `game-watermelon` / `visual/backgrounds/c1-cat-room-bg-v1.jpg` | 待许可确认 |
| lv1～lv11 idle-1/idle-2、lv1～lv5 drop | 用户提供；按等级映射到现有猫咪动画资源 | 1～11 级猫咪待机与下落动画；6～11 级下落状态回退对应 idle-1 | `game-watermelon` / `visual/cats/frames-c6/` | 待许可确认 |
| c1-cat-board-v2.png | 用户提供 PNG；复制为游戏内新文件名，运行时九段图 Sliced | 可变尺寸棋盘背景 | `game-watermelon` / `visual/ui/c1-cat-board-v2.png` | 待许可确认 |
| c1-cat-score-panel-v2.png、c1-cat-high-score-panel-v2.png、c1-cat-next-panel-v2.png | 用户提供；复制为游戏内新文件名，运行时九段图横向拉伸 | 主界面分数、最高分、下一只猫 HUD 背景 | `game-watermelon` / `visual/ui/c1-cat-*-panel-v2.png` | 待许可确认 |
| c1-cat-instruction-strip-v2.png | 用户提供；复制为游戏内新文件名，运行时九段图横向拉伸 | 主界面底部提示条背景 | `game-watermelon` / `visual/ui/c1-cat-instruction-strip-v2.png` | 待许可确认 |
| c1-cat-pause-button-v2.png | 用户提供；复制为游戏内新文件名，运行时按 UI 缩放 | 主界面暂停按钮 | `game-watermelon` / `visual/ui/c1-cat-pause-button-v2.png` | 待许可确认 |
| c1-cat-bubble-highlight-v2.png | 用户提供；复制为游戏内新文件名，按猫咪球尺寸缩放 | 猫咪圆球高光前景 | `game-watermelon` / `visual/ui/c1-cat-bubble-highlight-v2.png` | 待许可确认 |
| 猫咪圆球背景色配置.txt | 用户提供；已转为代码配置 | 1～11 级猫咪圆球背景颜色 | `game-watermelon` / `scripts/FruitCatalog.ts` | 已接入，来源许可待确认 |
| 大厅封面图.jpg | 用户提供；原样复制为新路径，避免复用旧导入缓存 | 大厅猫咪游戏卡片封面 | `lobby` / `visual/covers/watermelon/c1-cat-room-cover-v2.jpg` | 待许可确认 |

## 尚未导入

- V01～V06 方形预置图。
- PZ1 BGM、滑动/落槽/无效/暂停/继续/完成等音效。

## 验收记录

- 资源接入：2026-08-19，代码使用 Bundle 动态加载并保留 Graphics 回退。
- 许可、来源链接、后处理证明、真机截图和包体证据：待补。

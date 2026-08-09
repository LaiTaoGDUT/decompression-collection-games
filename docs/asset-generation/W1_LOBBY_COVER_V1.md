# W1 大西瓜大厅封面生成记录

> 记录 ID：`W1-COVER-V1`
>
> 生成日期：2026-08-09
>
> 视觉所有者：合成大西瓜 W1 / 大厅展示副本

## 1. 生成方式

- 工具：Codex 内置 ImageGen（工具未暴露具体模型版本）。
- 用途：大厅标准双列卡内的合成大西瓜封面，不作为局内水果资源。
- 来源性质：项目原创生成；未使用外部图片、商标、角色或其他合成类游戏画面作为输入。
- Bundle：物理文件只位于 `lobby`，大厅不会反向加载 `game-watermelon`。

## 2. 完整提示词

```text
Use case: stylized-concept
Asset type: production landscape cover art inside a standard two-column mobile game lobby card
Primary request: Create an original cover for a fruit merging game in W1 layered cut-paper and gentle origami style.
Scene/backdrop: abstract summer fruit stand atmosphere with warm cream paper and fresh pale-green paper layers.
Subject: a balanced compact stack of clearly distinct folded-paper fruits rising toward one large watermelon, communicating gradual merging progression without copying any existing game composition.
Style/medium: polished 2D layered cut-paper illustration, gentle origami folds, subtle paper fibers, 3 to 5 color planes per fruit, bold collision-friendly silhouettes, no faces.
Composition/framing: landscape 16:9 card-cover composition; keep the fruit stack centered and readable after a 2:1 safe crop; generous edge padding; no border; clear at approximately 275×160 pixels.
Lighting/mood: consistent soft upper-left light with restrained lower-right paper shadows; cheerful, calm summer mood.
Color palette: warm cream, leaf green, watermelon green, coral, peach, berry red, small yellow accents; restrained saturation.
Constraints: no text, no letters, no logo, no UI, no buttons, no border, no watermark, no characters, no photorealism, no plastic gloss, no sharp protruding origami points, no resemblance to existing fruit-merge game artwork. Original design only.
```

## 3. 输出与后处理

| 项目 | 记录 |
| --- | --- |
| 原始输出 | `art_sources/lobby/w1-watermelon-cover-source-v1.png` |
| 原始尺寸 | 1672×941 PNG，1,990,880 bytes |
| 修改 | 以中心略下 `centering=(0.5, 0.54)` 裁切；Lanczos 缩放为 550×320 |
| 压缩 | JPEG quality 90、optimized、progressive、4:2:2 subsampling |
| 正式文件 | `assets/lobby/visual/covers/watermelon/w1-watermelon-cover-v1.jpg` |
| 正式大小 | 45,756 bytes |
| 大厅路径 | `visual/covers/watermelon/w1-watermelon-cover-v1/texture` |

封面比例与卡内 275×160 展示区一致，不做非等比拉伸；加载失败时显示大厅统一的低对比拱形占位，不阻断游戏进入。

## 4. V2 纸片折纸一致性替换（2026-08-09）

用户反馈原封面虽有纸艺氛围，但纸片/折纸结构与游戏内正式水果不够一致。正式路径保持不变，内容替换为可复现的 W1 V2：

- 工具：项目脚本 `tools/watermelon/generate-paper-assets.js` + Sharp；固定几何和颜色参数，无外部图像输入。
- 构图：920×690 横版纸面，黄色/珊瑚/薄荷折面背景、圆形合成盘、折痕虚线与四张纸屑；组合西瓜、甜瓜、菠萝、苹果、葡萄、樱桃、草莓 7 种项目自有 W1 水果。
- 一致性：封面水果与游戏内 11 级水果来自同一 SVG 母版；大厅只保存最终 JPEG 展示副本，不运行时加载 `game-watermelon`。
- 可复现源：`art_sources/watermelon/w1-paper-v1/w1-watermelon-cover-v2.svg`。
- 正式输出：`assets/lobby/visual/covers/watermelon/w1-watermelon-cover-v1.jpg`，920×690，98,855 bytes，JPEG quality 91 progressive。
- Cocos 路径仍为 `visual/covers/watermelon/w1-watermelon-cover-v1/texture`，原 UUID 和 Manifest 无需迁移。

V1 ImageGen 输出保留为历史来源记录，但不再是当前运行封面。

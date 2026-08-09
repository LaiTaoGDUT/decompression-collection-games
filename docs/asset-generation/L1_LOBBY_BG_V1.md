# L1 大厅背景生成记录

> 记录 ID：`L1-LOBBY-BG-V1`
>
> 生成日期：2026-08-09
>
> 视觉所有者：大厅 / L1 柔光收藏馆

## 1. 生成方式

- 工具：Codex 内置 ImageGen（工具未暴露具体模型版本）。
- 用途：竖屏小游戏合集大厅正式背景。
- 来源性质：项目原创生成；未输入、临摹或拼接外部图片、游戏素材、商标或角色。
- 使用依据：本项目通过已授权的生成工具创建并保留完整生成记录；无第三方素材署名要求。

## 2. 完整提示词

```text
Use case: stylized-concept
Asset type: production background texture for a portrait mobile game collection lobby
Primary request: Create an original vertical background for L1 “Soft-Light Collection Gallery”, a quiet contemporary gallery that displays independent mini-game worlds without borrowing any game theme.
Scene/backdrop: soft ivory and warm-gray architectural space, diffused skylight glow, subtle shallow display rails and abstract empty frames only near the outer edges, with a restrained abstract arch-space motif near the upper brand zone.
Style/medium: refined matte editorial illustration, minimal depth, clean contemporary exhibition design, subtle natural paper-plaster grain, production-ready mobile game background.
Composition/framing: portrait 750:1334 composition; important details safe within the central crop; keep the entire central and middle-lower two-column card area calm, open, and very low contrast; edge architecture may crop gracefully on both shorter and taller phones; no single spotlight or featured pedestal.
Lighting/mood: soft natural overhead light, tranquil, airy, relaxing, understated.
Color palette: #F1EEE8 ivory base, #FAF8F4 soft light, warm gray #D9D3C9, extremely sparse muted brass #A9854D and sage #718375 accents.
Materials/textures: matte gallery wall, very subtle plaster/paper texture, delicate architectural lines.
Constraints: no text, no letters, no numbers, no logos, no UI buttons, no game cards, no game imagery, no characters, no fruit, no leaves, no food, no paper-fold or origami motifs, no candy colors, no neon, no heavy skeuomorphism, no thick decorative border, no watermark. Original design only. The image itself is background art, not an app screenshot.
```

## 3. 原始输出与后处理

| 项目 | 记录 |
| --- | --- |
| 原始输出 | `art_sources/lobby/l1-soft-light-gallery-source-v1.png` |
| 原始尺寸 | 941×1672 PNG，1,635,033 bytes |
| 修改 | 居中裁至精确 750:1334 比例；Lanczos 缩放到 750×1334；转换为无 Alpha JPEG |
| 压缩 | JPEG quality 88、optimized、progressive、4:2:2 subsampling |
| 正式文件 | `assets/lobby/visual/backgrounds/l1-soft-light-gallery-v1.jpg` |
| 正式大小 | 96,594 bytes |
| Cocos 导入 | `texture`，线性过滤、无 mipmap；运行时构造大厅专属 `SpriteFrame` |

原始 PNG 只用于追溯，不位于 `assets/`，不会进入运行包；正式 JPEG 位于 `lobby` Bundle。

## 4. 布局与适配

- 背景由 `LobbyPresentation` 等比 cover，任何比例下不做非等比拉伸。
- `750×1200`、`750×1334`、`750×1624` 与 `390×844` 均通过 cover 数学测试。
- 三档竖屏裁切接触表位于临时验收输出 `temp/step7-aspect-qa.jpg`；标题安全区与双列卡片区均保持低对比。
- 背景加载失败时显示 `#F1EEE8` 大厅底色，不出现空白或其他游戏皮肤。

## 5. 品牌区修改记录

- 标题、副标题不烘焙进位图，使用平台系统字体的 Cocos `Label`，保证清晰度与本地化能力。
- 抽象馆藏标记、黄铜/鼠尾草点缀与分隔线由项目内 `Graphics` 原创绘制。
- 品牌区由 `SafeArea` 管理，上边距 40；不会被状态栏、刘海或圆角屏遮挡。

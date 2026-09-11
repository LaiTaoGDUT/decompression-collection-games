# 云端软糖第四批素材记录：发射器旋转分层修正

日期：2026-09-11。工具：内置 `image_gen`。

用户指出发射器炮台需要随瞄准方向旋转。第三批的 `launcher-base-v1.png` 把云团、糖杖支撑、球槽和炮管合成一张图，结构上无法实现正确旋转，因此废弃为运行时素材，只保留为造型来源。本批从根因上改为固定底座和可旋转炮台两张互补原图。

运行时层级约定：

```text
LauncherRoot（固定位置）
├── LauncherPedestal（固定底座）
├── LauncherTurret（锚点/旋转中心 = 底部圆形转轴中心）
│   └── CurrentBubbleSlot（随炮台旋转并确定球的位置）
│       └── CurrentBubbleVisual（局部反向旋转，纹样保持正立）
├── NextBubble（不旋转）
└── SwapIcon（不旋转）
```

炮台角度、瞄准线和实际发射必须读取同一个发射方向计算结果。不能为了画面单独平滑出另一套最终角度，避免炮口方向与碰撞预览不一致；若需要视觉平滑，只能在不改变当前逻辑方向和发射锁定结果的前提下插值显示。当前球的位置跟随 `CurrentBubbleSlot`，球体视觉用炮台角度的相反值抵消继承旋转，使内部辨识纹样始终正立。

## 文件与检查结果

| 素材 | 项目文件 | 原始生成文件 | 当前判断 |
| --- | --- | --- | --- |
| 固定底座 v2 | [launcher-pedestal-v2.png](launcher-pedestal-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-acc9242e-a847-4587-a6e8-eaa490ca3128.png` | 1536 × 1024 RGB；低矮云团、糖杖承座和白色前挡边完整；不含球槽和炮管 |
| 可旋转炮台 v2 | [launcher-turret-v2.png](launcher-turret-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-aa05c5ba-27fd-4995-a5e7-6fd68d511abb.png` | 1145 × 1373 RGB；初始朝上，底部圆形转轴清楚，中心球槽留空；不含固定底座 |

两张图仍无 Alpha，棋盘格是实际像素，只能作为造型原图。透明处理后还必须统一工作画布、按固定连接点对齐，并把炮台 SpriteFrame/节点锚点准确设置到转轴中心；不能直接以图片外接矩形中心作为旋转点。

## 固定底座提示词

```text
Use case: background-extraction
Asset type: fixed lower pedestal sprite for a rotatable bubble-shooter launcher
Input images: Image 1 is the combined launcher v1 whose lower cloud and red-cream candy support must be separated; Image 2 is the approved gameplay screen and visual authority.
Primary request: Generate exactly ONE fixed launcher pedestal only. Preserve the lower portion of Image 1: one compact fluffy pearl-white cloud base with soft lavender-peach underside shading, supporting a low round red-and-cream twisted candy swivel seat. Add a small pearl-white front retaining lip at the center that can visually cover the bottom edge of a separate rotating turret. The top-center connection must be clean, symmetrical, and unobstructed so the turret's pivot can sit there.
Style/medium: polished clean soft 3D candy illustration matching the approved screen; smooth large forms; restrained gloss; warm upper-left light.
Composition/framing: centered straight-on view; compact low horizontal silhouette; generous transparent margin; entire pedestal visible; one asset only.
Constraints: genuinely transparent-background RGBA PNG; all space outside the pedestal alpha 0; anti-aliased clean edges. This is the NON-ROTATING lower layer.
Avoid: any circular ball socket, cannon barrel, current or next bubble, aiming line, swap arrows, text, badge, button, separate loose pieces, checkerboard painted into pixels, gray or white backdrop, floor shadow, grain, sparkles, watermark, sprite sheet.
```

## 可旋转炮台提示词

```text
Use case: background-extraction
Asset type: rotatable upper turret sprite for a bubble-shooter launcher
Input images: Image 1 is the combined launcher v1 and defines the pearl-white/pale-pink socket material; Image 2 is the newly separated fixed pedestal and defines the matching connection width and style; Image 3 is the approved gameplay screen and visual authority.
Primary request: Generate exactly ONE separate ROTATING upper turret in its neutral straight-up orientation. Build a compact candy cannon with a large pearl-white and pale-blush circular cradle at the upper end; its center is a genuinely empty transparent socket for the runtime current-ball sprite. A short tapered soft-pink barrel/neck runs downward from behind the cradle to one small centered round swivel axle at the very bottom. The bottom axle is the intended rotation pivot and must be visually distinct, perfectly centered on the turret's vertical firing axis, and narrow enough to tuck behind the fixed pedestal's white retaining lip. Complete all hidden geometry.
Style/medium: polished clean soft 3D candy illustration matching the approved screen; smooth rounded forms; restrained gloss; warm upper-left lighting; no metal realism.
Composition/framing: centered vertical front view, pointing exactly upward; one complete turret only; generous transparent margin; nothing cropped. Keep clear empty space around the bottom axle so its center is unambiguous for setting the Cocos node anchor/pivot.
Constraints: genuinely transparent-background RGBA PNG; outside the turret and inside the entire ball socket alpha 0; anti-aliased clean edges. This sprite rotates as one piece around the bottom axle. Do not include any part of the cloud or candy pedestal.
Avoid: current or next bubble, symbols, aiming line, swap arrows, text, button, inventory badge, cloud base, twisted candy pedestal, checkerboard painted into pixels, gray/white backdrop, extra pieces, floor shadow, grain, sparkles, watermark, sprite sheet.
```

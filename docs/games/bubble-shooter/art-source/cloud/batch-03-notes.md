# 云端软糖第三批素材记录

日期：2026-09-11。工具：内置 `image_gen`。

本批继续执行用户决定：先生产素材原图，透明问题后处理。四张输出均为 1254 × 1254 RGB PNG，无 Alpha；画面中的灰色棋盘格是实际像素，不是透明预览。因此只作为造型候选，禁止直接放入运行时资源。

## 文件与检查结果

| 素材 | 项目文件 | 原始生成文件 | 当前判断 |
| --- | --- | --- | --- |
| 通用糖霜覆盖层 | [frosting-overlay-v1.png](frosting-overlay-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-68c35c58-2b65-4d00-8f82-18f3816b5fa3.png` | 环形轮廓完整、中心留空、材质和糖针方向可用；比确认图略厚，需四色球合成预览后确认比例 |
| 糖霜碎屑 | [frosting-debris-v1.png](frosting-debris-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-65d1a762-4b9e-4bb3-8f65-f392d0ebc4f4.png` | 7 块碎屑彼此分开、材质统一，可在透明处理后切片并由代码驱动位移/旋转/淡出 |
| 发射器合并底座（废弃） | [launcher-base-v1.png](launcher-base-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-e95e4b55-dbaf-413e-b1e6-0a82225ba153.png` | 固定云底座、糖杖支撑与需要旋转的球槽/炮管烘焙在同一张图，无法正确表现瞄准旋转；只保留为造型来源，不得用于运行时 |
| 交换图标 | [swap-icon-v1.png](swap-icon-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-0b7c28db-581b-4de0-829d-f323c48183cd.png` | 双箭头轮廓清楚、缩小后应可读；当前粉色比确认图偏亮，需在发射器合成预览中校色 |

## 通用糖霜覆盖层提示词

```text
Use case: background-extraction
Asset type: reusable game sprite overlay for a bubble-shooter board
Input images: Image 1 is the approved cloud-candy screen and visual authority for the frosted bubbles; Images 2 and 3 define the exact circular bubble diameter, centered framing, lighting direction, and clean glossy rendering.
Primary request: Generate exactly ONE standalone universal cream-frosting overlay that can be placed over any of the four colored bubble sprites. Reconstruct the frosting ring seen on the frosted bubbles in Image 1: thick milky white icing around the outer perimeter, softly scalloped inner opening, a few restrained pastel candy sprinkles. The large central opening must remain empty and transparent so the underlying bubble color and symbol are clearly visible. The overlay must not contain any colored bubble, heart, star, droplet, grape symbol, or center fill.
Style/medium: polished soft 3D candy illustration, clean large shapes, smooth matte icing with subtle warm upper-left highlight and gentle lavender-peach shadow, matching the approved screen.
Composition/framing: centered circular ring, perfectly front-facing, same outer diameter and center as the reference bubble assets; generous even margin; full ring visible; no crop.
Color palette: warm milk white, faint blush and pale lavender shading; at most a few tiny pastel blue, pink, and yellow sprinkles.
Constraints: output a genuinely transparent-background RGBA PNG; both outside the frosting silhouette and the entire central opening must have alpha 0; anti-aliased clean edges; one overlay only; suitable for code compositing over every bubble color.
Avoid: gray background, checkerboard painted into the pixels, solid white center, colored ball, symbol, text, UI, shadow plane, plate, donut pastry, excessive sprinkles, grain, speckles, glitter, noise, multiple objects, sprite sheet, watermark.
```

## 糖霜碎屑提示词

```text
Use case: background-extraction
Asset type: small game particle sprite source for frosting-break feedback
Input images: Image 1 defines the exact frosting material, warm milk-white palette, pastel shading, sprinkle colors, and clean rendering; Image 2 is the approved cloud-candy game screen and overall visual authority.
Primary request: Generate one compact cluster of 7 separate broken frosting crumbs for a code-animated shatter effect. Include 4 medium irregular curved icing chips and 3 small rounded crumbs, clearly separated from each other with open space. Add only 1 or 2 tiny pastel sprinkle fragments total. Each fragment should look like a piece broken from Image 1, with a small amount of thickness, smooth matte icing, clean rounded fracture edges, soft upper-left highlight, and restrained peach-lavender underside shading.
Style/medium: polished soft 3D candy illustration, clean simple shapes readable at small size, matching the approved frosted bubble.
Composition/framing: centered loose radial cluster, every fragment separated and fully visible, generous empty margin, no overlap, no motion trails.
Constraints: genuinely transparent-background RGBA PNG; all empty space alpha 0; one cluster source image only, suitable for later slicing or particle use.
Avoid: checkerboard painted into pixels, gray or white background, complete ring, donut, cookie, colored bubble, symbols, text, UI, dust cloud, glitter, excessive sprinkles, grain, noisy texture, sharp realistic shards, shadows on a ground plane, sprite sheet grid, watermark.
```

## 发射器底座提示词

```text
Use case: background-extraction
Asset type: reusable bubble-shooter launcher base sprite
Input images: Image 1 is the approved cloud-candy normal gameplay screen and exact design authority for the bottom-center launcher; Image 2 defines the separate bubble asset and must NOT be baked into this launcher.
Primary request: Generate exactly ONE standalone launcher base reconstructed from Image 1. It is a compact front-facing candy cannon cradle: a rounded pearl-white and pale-blush circular socket/rim that leaves a large empty transparent circular opening for a runtime current-ball sprite; a short soft-pink rear barrel visible above the rim; beneath it a small twisted red-and-cream candy-cane support seated on one fluffy white cloud pedestal. Complete all portions hidden by the red ball in the approved screen so the socket is a coherent full asset. Keep the silhouette compact and vertically centered like the approved layout.
Style/medium: polished clean soft 3D candy illustration; smooth large forms; restrained highlights; gentle peach/lavender ambient shading; same lighting and scale language as the approved screen.
Composition/framing: centered, straight-on front view; one complete launcher only; generous transparent margin; nothing cropped. The circular ball opening is centered and truly empty/transparent, sized to accept the existing circular bubble sprite.
Constraints: genuinely transparent-background RGBA PNG; outside and socket opening alpha 0; anti-aliased clean edges. No current or next bubble, no heart/star/drop/grape symbol, no aiming dots or line, no target ring, no swap arrows, no UI label, no button, no inventory badge.
Avoid: checkerboard painted into pixels, gray/white background, whole gameplay screenshot, extra clouds around the canvas, weapon realism, metal, noisy texture, sprinkles, sparkles, text, watermark, multiple launchers, sprite sheet, cast shadow on a ground plane.
```

## 交换图标提示词

```text
Use case: background-extraction
Asset type: bubble-swap HUD icon sprite
Input images: Image 1 is the approved cloud-candy gameplay screen and exact authority for the two curved swap arrows beside the launcher; Image 2 defines the current launcher candidate's clean soft 3D candy material and lighting.
Primary request: Generate exactly ONE standalone swap icon made of two short thick rounded curved arrows chasing each other in a compact circular exchange symbol. Match the approved screen: friendly candy-like arrows, dusty berry-pink to soft plum gradient, subtle pale highlight along the upper-left edge, enough depth to read at small mobile size. Preserve the simple recognizable two-arrow silhouette; no surrounding button or cloud base.
Style/medium: polished clean soft 3D candy UI icon, rounded edges, smooth large forms, restrained gloss, same cloud-candy visual family.
Composition/framing: centered front-facing icon, approximately square silhouette, generous even margin, full arrowheads visible and balanced, one icon only.
Constraints: genuinely transparent-background RGBA PNG; all space outside the arrows alpha 0; anti-aliased clean edges; readable when reduced to roughly 44–56 design pixels.
Avoid: checkerboard painted into pixels, gray or white background, text, circular refresh arrow, three arrows, ball, launcher, cloud, button plate, inventory number, outlines too dark, neon glow, grain, sparkles, noise, watermark, multiple variants, sprite sheet.
```

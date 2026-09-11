# 第十四批：HUD 透明、尺寸与九宫格处理

日期：2026-09-11。

本批处理暂停按钮、单个计数空槽、计数填充珠、Boss 血条轨道与血条填充。高分辨率母版继续留在 `art-source`；运行时只使用 `runtime-source/cloud` 内的紧凑 RGBA 文件。内置生图输出仍有三张把棋盘格写进 RGB，因此规则圆形和胶囊形素材又使用解析几何 Alpha 蒙版提取，并在蓝色底上检查边缘。

## 输出

| 素材 | 最终母版 | 运行时文件 | 运行时尺寸 | 处理 |
| --- | --- | --- | ---: | --- |
| 暂停按钮 | [hud-pause-button-transparent-v2.png](hud-pause-button-transparent-v2.png) | [hud-pause-button.png](../../runtime-source/cloud/hud-pause-button.png) | 144 × 144 RGBA | 按有效 Alpha 裁切，按钮可见区 128 × 128，四周 8 像素透明边距 |
| 空计数槽 | [hud-counter-slot-empty-extracted-v3.png](hud-counter-slot-empty-extracted-v3.png) | [hud-counter-slot-empty.png](../../runtime-source/cloud/hud-counter-slot-empty.png) | 96 × 96 RGBA | 圆形解析蒙版提取；可见区 88 × 88，四周 4 像素透明边距；中央灰槽保持不透明 |
| 填充珠 | [hud-counter-bead-transparent-v2.png](hud-counter-bead-transparent-v2.png) | [hud-counter-bead.png](../../runtime-source/cloud/hud-counter-bead.png) | 64 × 64 RGBA | 按有效 Alpha 裁切；可见区 56 × 56，四周 4 像素透明边距 |
| Boss 血条轨道 | [hud-boss-health-track-extracted-v3.png](hud-boss-health-track-extracted-v3.png) | [hud-boss-health-track.png](../../runtime-source/cloud/hud-boss-health-track.png) | 192 × 96 RGBA | 胶囊解析蒙版提取；保留左右端帽与短中段，供九宫格横向伸展 |
| Boss 血条填充 | [hud-boss-health-fill-extracted-v3.png](hud-boss-health-fill-extracted-v3.png) | [hud-boss-health-fill.png](../../runtime-source/cloud/hud-boss-health-fill.png) | 128 × 64 RGBA | 胶囊解析蒙版提取；保留左右端帽与短中段，叠在轨道灰槽上方 |

轨道不再输出 512 × 96 长图，填充也不再输出 512 × 64 长图。两张图的横向长度由 Cocos 九宫格节点控制：轨道左右边界各 48 像素，填充左右边界各 32 像素。轨道高与填充高固定；血量变化使用填充节点宽度配合裁切遮罩，不能直接改变 `scaleX`。

## 生图来源

| 素材 | image_gen 输出 | 输出属性 |
| --- | --- | --- |
| 暂停按钮 | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-6ae87b2d-374f-4327-87c8-de9e95b91ebb.png` | 1254 × 1254 RGBA |
| 空计数槽 | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-a6fd6be5-0fbe-422e-9aa2-0f525337506d.png` | 1254 × 1254 RGB，棋盘格写入像素 |
| 填充珠 | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-e31b7e2c-2ab1-4dbe-a5c4-1aa87a0a1d52.png` | 1254 × 1254 RGBA |
| Boss 血条轨道 | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-ad93d2f4-ed3b-4a8b-bd97-24b65c7b3ce2.png` | 2172 × 724 RGB，棋盘格写入像素 |
| Boss 血条填充 | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-764de1e5-b594-4117-a94d-c4e4f0ecf323.png` | 2172 × 724 RGB，棋盘格写入像素 |

## 透明编辑提示词

### 暂停按钮

```text
Use case: background-extraction
Asset type: pause-button production cutout for the approved cloud-candy bubble shooter HUD
Input image: Image 1 is the edit target and exact authority for the button design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single coral-pink glossy circular pause button with two pearl-white vertical pause bars.
Invariants: preserve the circle silhouette, rim thickness, pause-bar shapes and spacing, highlights, pink gradients, glossy candy material, lighting, scale, and front-facing orientation as closely as possible.
Composition/framing: centered complete button on a square canvas with modest transparent margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; all pixels outside the circular button alpha 0; clean anti-aliased edge; one button only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, separate icon plate, text, play symbol, shadow on a floor, halo, watermark, sprite sheet.
```

### 空计数槽

```text
Use case: background-extraction
Asset type: single empty counter-slot production cutout for the approved cloud-candy bubble shooter HUD
Input image: Image 1 is the edit target and exact authority for the slot design.
Primary request: Remove only the entire gray checkerboard/background outside the slot. Return exactly the same single pearl-white and blush-pink circular socket with its recessed neutral-gray inner well kept opaque.
Invariants: preserve the outer circle, rim thickness, inner-well diameter and gray shading, highlights, pastel reflections, material, lighting, scale, and front-facing orientation as closely as possible. The gray inner well is part of the slot and must remain; only the area outside the outer rim becomes transparent.
Composition/framing: centered complete slot on a square canvas with modest transparent margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the outer ring alpha 0; inner gray well opaque; clean anti-aliased outer edge; one slot only.
Avoid: checkerboard painted into pixels, transparent center, colored bead, multiple slots, number, text, floor shadow, halo, watermark, sprite sheet.
```

### 填充珠

```text
Use case: background-extraction
Asset type: counter-fill bead production cutout for the approved cloud-candy bubble shooter HUD
Input image: Image 1 is the edit target and exact authority for the bead design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single plain coral-red glossy round bead.
Invariants: preserve the circle silhouette, coral-red color, rim, upper-left and upper-right highlights, translucency, shading, glossy candy material, scale, and front-facing orientation as closely as possible. Keep the center plain with no heart or other symbol.
Composition/framing: centered complete bead on a square canvas with modest transparent margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the bead alpha 0; clean anti-aliased edge; one bead only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, heart, star, drop, grape, number, text, floor shadow, halo, watermark, sprite sheet.
```

### Boss 血条轨道

```text
Use case: background-extraction
Asset type: stretchable Boss-health-track production cutout for the approved cloud-candy bubble shooter HUD
Input image: Image 1 is the edit target and exact authority for the empty health-track design.
Primary request: Remove only the entire gray checkerboard/background outside the long rounded track. Return exactly the same single horizontal pearl-white and blush-pink capsule frame with its recessed dark neutral-gray inner trough kept opaque.
Invariants: preserve the complete left and right rounded end caps, frame thickness, inner trough, highlights, pastel reflections, proportions, material, lighting, and front-facing orientation as closely as possible. The dark gray trough is part of the empty track and must remain.
Composition/framing: centered complete horizontal track with transparent margin on all sides; no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the track alpha 0; inner trough opaque; clean anti-aliased outer edge; no health fill.
Avoid: checkerboard painted into pixels, transparent trough, pink fill, percentage, heart icon, text, ticks, extra frame, floor shadow, halo, watermark, sprite sheet.
```

### Boss 血条填充

```text
Use case: background-extraction
Asset type: dynamic Boss-health-fill production cutout for the approved cloud-candy bubble shooter HUD
Input image: Image 1 is the edit target and exact authority for the fill design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single horizontal coral-pink glossy capsule fill bar.
Invariants: preserve both rounded end caps, thickness, pink gradient, upper highlight band, small end highlights, rim, proportions, glossy candy material, lighting, and front-facing orientation as closely as possible.
Composition/framing: centered complete horizontal fill bar with transparent margin on all sides; no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the fill bar alpha 0; clean anti-aliased edge; one fill bar only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, outer track frame, dark trough, percentage, text, ticks, heart icon, floor shadow, halo, watermark, sprite sheet.
```

## 验收结论

- 五张运行时文件均为 RGBA，画布尺寸符合上表，角落透明。
- 空计数槽中央灰面与 Boss 轨道中央灰槽保持不透明，未误挖空。
- 填充珠与空槽中心对齐后能完整覆盖灰色内凹区域。
- 轨道与填充在[固定端帽组合预览](hud-runtime-composite-review-v1.png)中没有端帽压扁、棋盘格残留或明显接缝。
- 本批只处理已确认主界面素材，没有新增页面视觉或业务代码。

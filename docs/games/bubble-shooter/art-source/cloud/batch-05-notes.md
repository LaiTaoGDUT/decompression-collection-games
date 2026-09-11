# 云端软糖第五批素材记录：HUD 首批

日期：2026-09-11。工具：内置 `image_gen`。

本批基于已确认的普通与 Boss 主界面拆分 HUD。所有动态数量、阈值和血量继续由运行时代码控制，不从效果图反推数值，也不把三个槽或某个血量比例烘焙进整图。

## 文件与检查结果

| 素材 | 项目文件 | 原始生成文件 | 尺寸/Alpha | 当前判断 |
| --- | --- | --- | --- | --- |
| 暂停按钮 | [hud-pause-button-v1.png](hud-pause-button-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-417886be-84cd-44a1-9cf3-53db007729a3.png` | 1254 × 1254 RGB | 轮廓与双竖线清楚；棋盘格需透明后处理 |
| 下压箭头 | [hud-down-arrow-v1.png](hud-down-arrow-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-e69d3627-d008-4f44-960a-d14695d3f0a6.png` | 1254 × 1254 RGBA | 已有真实 Alpha；缩小后需检查箭头边缘和色彩是否过亮 |
| 空计数槽 | [hud-counter-slot-empty-v1.png](hud-counter-slot-empty-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-adf49d07-1e11-45cd-8927-02c4509bcc02.png` | 1254 × 1254 RGB | 白色槽框与灰色凹面分明；棋盘格需透明后处理 |
| 填充珠 | [hud-counter-bead-v1.png](hud-counter-bead-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-b9fd4c42-d199-4f6e-8c37-69e6619db5c6.png` | 1254 × 1254 RGB | 无内部符号，可独立脉冲；棋盘格需透明后处理，合成时需与空槽校准直径 |
| 糖霜技能图标 | [hud-frosting-skill-v1.png](hud-frosting-skill-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-df11a22d-e3af-4296-81ea-31e7798c6c15.png` | 1254 × 1254 RGBA | 已有真实 Alpha；六枝轮廓清楚，缩小后需与计数槽一起检查占比 |
| Boss 血条轨道 | [hud-boss-health-track-v1.png](hud-boss-health-track-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-23bd9282-c83c-4132-ac2d-4187c6ad74c0.png` | 1774 × 887 RGB | 白框、粉色内沿与灰色轨道完整；棋盘格需透明后处理，中心长段供九宫格拉伸 |
| Boss 血条填充 | [hud-boss-health-fill-v1.png](hud-boss-health-fill-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-eeec0637-e8c9-4e01-aa11-918e868e6a52.png` | 2172 × 724 RGB | 独立粉色胶囊，棋盘格需透明后处理；九宫格保留圆角后由实际血量驱动宽度 |

## 运行时拆分约定

- `PauseButton` 使用独立触控节点，图片只负责视觉；位置与微信胶囊垂直对齐，并只避让胶囊实际矩形和间距。
- `ActionCounter` 由一个下压箭头、可选区域技能图标，以及按阈值动态创建的若干 `CounterSlot` 组成；每个槽以空槽为底、填充珠为上层。
- 临界脉冲只作用于已填充珠或计数组，不持续晃动棋盘；补行/施法后清空填充状态。
- Boss 血条轨道与填充条分别使用可拉伸 Sprite。填充条宽度读取真实血量比例；图片不包含数字、固定百分比或区域进度。

## 完整提示词

### 暂停按钮

```text
Use case: background-extraction
Asset type: pause button sprite for the cloud-candy bubble-shooter HUD
Input images: Image 1 is the approved gameplay screen and exact authority for the upper-left pause button; Image 2 defines the clean candy gloss and pink UI material.
Primary request: Generate exactly ONE circular pause button matching Image 1: compact berry-pink candy disk, softly domed, thin pale-pink outer rim, restrained upper-left highlight, and two centered vertical pearl-white rounded pause bars. The button must remain legible over a bright cloud background at roughly 56–64 design pixels.
Style/medium: polished clean soft 3D candy UI, rounded friendly forms, clear silhouette, low visual noise.
Composition/framing: centered front view, one complete circular button, even margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the circular button alpha 0; anti-aliased edge; pause bars are part of this button asset.
Avoid: checkerboard painted into pixels, gray/white backdrop, play triangle, stop square, text, labels, capsule, extra controls, cloud base, heavy shadow, grain, sparkles, watermark, variants, sprite sheet.
```

### 下压箭头

```text
Use case: background-extraction
Asset type: downward-action indicator icon for the cloud-candy bubble-shooter HUD
Input images: Image 1 is the approved gameplay screen and exact authority for the small downward arrow above the bubble board; Image 2 defines the clean glossy berry-pink UI material.
Primary request: Generate exactly ONE simple downward arrow icon matching Image 1. Use a compact vertical stem and broad rounded triangular arrowhead, berry-pink candy material with a restrained pale highlight and subtle plum lower shading. It communicates that bubbles will move down when the nearby counter fills.
Style/medium: polished clean soft 3D candy UI, rounded edges, simple bold silhouette readable at 36–46 design pixels.
Composition/framing: centered, pointing exactly straight down, one arrow only, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the arrow alpha 0; anti-aliased clean edge.
Avoid: checkerboard painted into pixels, gray/white backdrop, chevron only, curved arrow, multiple arrows, text, counter slots, bubbles, button plate, cloud, grain, glitter, watermark, sprite sheet.
```

### 空计数槽

```text
Use case: background-extraction
Asset type: reusable empty counter-slot sprite for normal and Boss HUD
Input images: Images 1 and 2 are the approved normal and Boss gameplay screens and exact authority for the small circular action-counter slots beside the downward arrow.
Primary request: Generate exactly ONE empty counter slot: a small front-facing circular recessed socket with a softly glossy pearl-white outer rim, a thin pale-blush inner edge, and a neutral very-light warm gray recessed center. It must be visually quiet and support a separate colored fill bead layered on top. Match the approved HUD's small slot proportions and candy softness.
Style/medium: polished clean soft 3D candy UI, rounded rim, restrained upper-left highlight, subtle lavender-peach ambient shadow, readable at roughly 28–34 design pixels.
Composition/framing: perfectly centered, front-facing circle, one slot only, even generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG outside the outer circle; the recessed center itself remains opaque light gray; anti-aliased edge.
Avoid: checkerboard painted into pixels, gray/white full backdrop, pink filled bead, numbers, text, arrow, snowflake, multiple slots, panel, cloud, strong dark outline, grain, glitter, watermark, sprite sheet.
```

### 填充珠

```text
Use case: background-extraction
Asset type: filled counter bead sprite for normal and Boss HUD
Input images: Image 1 is the approved normal gameplay screen and exact authority for the small pink filled counter circles; Image 2 defines the coral-red translucent candy material and upper-left lighting.
Primary request: Generate exactly ONE small circular coral-pink candy bead used to fill a counter slot. It is a simple smooth domed orb with a bright restrained upper-left highlight, slightly deeper berry-pink lower rim, and no internal symbol. Match the approved filled slot, clearly distinct from a full gameplay bubble through its smaller, simpler treatment.
Style/medium: polished clean soft 3D candy UI, simple bold shape, legible around 20–26 design pixels.
Composition/framing: perfectly centered front-facing circle, one bead only, even generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the bead alpha 0; anti-aliased clean edge.
Avoid: checkerboard painted into pixels, gray/white backdrop, heart/star/drop/grape symbol, number, text, slot rim, arrow, multiple beads, panel, cloud, excessive gloss, grain, glitter, watermark, sprite sheet.
```

### 糖霜技能图标

```text
Use case: background-extraction
Asset type: Boss frosting-skill HUD icon
Input images: Image 1 is the approved Boss screen and exact authority for the small blue snowflake-like skill icon between the down arrow and counter slots; Image 2 defines the lake-blue translucent candy material and lighting; Image 3 defines the frosting mechanic this icon represents.
Primary request: Generate exactly ONE compact six-branch snowflake/frosting skill icon matching Image 1. Use a symmetrical friendly rounded snowflake silhouette, icy lake-blue to pale-cyan candy material, pearl-white inner highlight, and a subtle deeper-blue edge. The shape must clearly read as “adds frosting” beside the action counter at roughly 28–34 design pixels, without resembling a separate gameplay bubble.
Style/medium: polished clean soft 3D candy HUD icon, rounded tips, simple bold geometry, restrained gloss, consistent with the cloud-candy UI.
Composition/framing: centered, front-facing, one icon only, six balanced branches, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the snowflake alpha 0; anti-aliased clean edge; no surrounding disk or button.
Avoid: checkerboard painted into pixels, gray/white backdrop, realistic sharp ice crystal, eight-point star, colored bubble, slot rim, arrow, numbers, text, cloud base, glow cloud, excessive detail, grain, glitter, watermark, multiple icons, sprite sheet.
```

### Boss 血条轨道

```text
Use case: background-extraction
Asset type: nine-slice-ready Boss health bar track and frame sprite
Input images: Image 1 is the approved Boss screen and exact authority for the horizontal health bar under the pudding king; Image 2 defines the pearl-white rim, pale-blush edge, and recessed neutral track material.
Primary request: Generate exactly ONE empty horizontal Boss health-bar track with its frame, matching Image 1. Use a long compact rounded capsule: polished pearl-white outer rim with a very thin soft-pink inner line, and an opaque recessed charcoal-gray track center. No pink health fill. Keep left and right end caps symmetrical and preserve a long uniform center section suitable for Cocos nine-slice stretching.
Style/medium: clean polished soft 3D candy HUD, restrained gloss, subtle lavender-peach shadow, readable on bright clouds.
Composition/framing: centered front-facing horizontal capsule, approximately 5:1 outer aspect ratio, one object only, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG outside the capsule; opaque recessed track; anti-aliased edge; no baked health value; simple repeatable center for nine-slice use.
Avoid: checkerboard painted into pixels, full gray/white backdrop, pink fill, numbers, text, heart icon, Boss, snowflake, slots, panel, cloud, ornate decorations, grain, glitter, watermark, multiple variants, sprite sheet.
```

### Boss 血条填充

```text
Use case: background-extraction
Asset type: nine-slice-ready dynamic Boss health fill sprite
Input images: Image 1 is the approved Boss screen and exact authority for the bright pink health fill; Image 2 defines the coral-pink candy material and highlight.
Primary request: Generate exactly ONE standalone horizontal health-fill capsule matching Image 1. Use a vivid coral-to-berry pink candy gradient, restrained upper-left glossy highlight, slightly deeper lower edge, and fully rounded left/right caps. Preserve a long visually uniform center section so Cocos can nine-slice the sprite and change its width without distorting the caps.
Style/medium: polished clean soft 3D candy HUD fill, simple and bright, no outline heavier than a subtle darker-pink edge.
Composition/framing: centered front-facing capsule, approximately 6:1 aspect ratio, one object only, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the capsule alpha 0; anti-aliased edge; no frame or background track; no fixed health percentage.
Avoid: checkerboard painted into pixels, gray/white backdrop, frame, dark track, numbers, text, heart, segments, tick marks, glow spill, grain, glitter, watermark, multiple bars, sprite sheet.
```

# 云端软糖第十二批素材记录：糖霜透明、尺寸与合成检查

日期：2026-09-11。透明编辑：内置 `image_gen`；确定性 Alpha 提取和运行时缩放：`ffmpeg`。

## 结果

| 素材 | 最终母版 | 母版规格 | 运行时文件 | 运行时规格 | 判断 |
| --- | --- | --- | --- | --- | --- |
| 糖霜覆盖层 | [frosting-overlay-transparent-v3.png](frosting-overlay-transparent-v3.png) | 1254 × 1254 RGBA | `runtime-source/cloud/frosting-overlay.png` | 176 × 176 RGBA；有效外径 160 | 外部和中心孔均为真实透明；与红球同中心叠层检查通过 |
| 七块糖霜碎屑 | [frosting-debris-extracted-v4.png](frosting-debris-extracted-v4.png) | 1254 × 1254 RGBA | `runtime-source/cloud/frosting-debris.png` | 256 × 256 RGBA | 七块分离；在浅蓝底上检查无棋盘格和明显灰边；后续切为独立 SpriteFrame |

最终覆盖层的内置生成文件为 `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-6a13a43a-e581-44fa-9b6b-6c8475309119.png`。碎屑 Alpha 重试文件为 `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-ac53a96c-7db2-48d9-ad68-5e1f9b488cff.png`，随后确定性提取为 v4。

`frosting-overlay-transparent-v2.png`、`frosting-debris-transparent-v2.png` 和 `frosting-debris-alpha-retry-v3.png` 仍是 RGB 棋盘格，只用于记录内置工具的失败结果，禁止进入运行时。覆盖层定向重试得到真实 Alpha。碎屑定向重试仍失败，因此从重试图按背景中性色差、亮度和七个已知连通区域进行确定性 Alpha 提取；提取后单独检查 Alpha 通道，再缩放，没有继续用生成模型反复重绘碎屑。

覆盖层运行时外部 Alpha 边界为 `x=8..167, y=8..167`，与四色泡泡完全一致。合成检查使用红色心形泡泡作为底层，中心纹样完整可见，糖霜环没有相对偏移或拉伸。

## 首次透明编辑提示词

### 糖霜覆盖层

```text
Use case: background-extraction
Asset type: production transparent frosting-overlay master for the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the frosting ring design.
Primary request: Remove only the entire gray checkerboard/background from both outside the ring and inside its central opening. Return exactly the same single complete circular frosting shell: glossy milky-white icing with soft peach-pink and lavender reflected shading, scalloped inner edge, gently uneven outer edge, and the same six small colored sprinkle capsules.
Invariants: preserve the ring silhouette, thickness, central opening shape, all scallops, all six sprinkle positions and colors, highlight positions, material, lighting, and front-facing orientation as closely as possible. The center must remain genuinely empty so any red, yellow, blue, or purple bubble beneath remains visible. Do not fill the opening and do not include a colored bubble.
Composition/framing: centered complete frosting ring on a square canvas with modest transparent margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; all pixels outside the frosting and throughout the central hole alpha 0; clean anti-aliased outer and inner edges; one ring only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, solid white center, colored bubble center, extra sprinkles, crumbs, shadows on a floor, halo, text, watermark, sprite sheet.
```

### 糖霜碎屑

```text
Use case: background-extraction
Asset type: production frosting-debris source for bubble clear and frosting-break feedback
Input image: Image 1 is the edit target and exact authority for the debris designs and arrangement.
Primary request: Remove only the entire gray checkerboard/background. Return the same loose cluster of exactly seven separate frosting pieces: two large upper fragments, one medium center fragment, two small side crumbs, and two large lower fragments. Preserve the yellow sprinkle on the upper-left fragment and the blue sprinkle on the lower-left fragment.
Invariants: preserve every fragment's silhouette, chipped inner edge, glossy milky-white icing, peach crumb interior, lavender/pink reflected shading, highlights, relative scale, separation, and arrangement as closely as possible. Every piece must remain fully separate with open transparent space between pieces.
Composition/framing: centered loose cluster, all seven fragments completely visible, generous transparent outer margin, no overlap and no crop.
Constraints: genuinely transparent-background RGBA PNG; all empty space alpha 0; clean anti-aliased edges; exactly seven fragments.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, complete frosting ring, complete bubble, added fragments, removed fragments, dust cloud, long motion streaks, floor shadows, text, watermark, regular sprite-sheet grid.
```

## Alpha 定向重试提示词

### 糖霜覆盖层

```text
Use case: background-extraction
Asset type: alpha-channel correction of an existing frosting-ring cutout
Input image: Image 1 is the edit target. Its frosting ring is final and must remain pixel-visually unchanged; the visible gray checkerboard is an incorrect baked background.
Primary request: Convert every gray checkerboard/background pixel outside the frosting ring and inside the central hole to actual transparency. Preserve only the existing frosting ring and its six colored sprinkles. This is an alpha-channel correction, not a redesign.
Invariants: keep the exact ring silhouette, scallops, thickness, highlights, colors, shading, sprinkle count and positions, dimensions, scale, and centered framing from Image 1. Do not redraw or modify the frosting.
Constraints: output a genuine RGBA PNG. Outside the ring alpha 0. The entire central opening alpha 0. Frosting pixels retain their original opaque/translucent appearance and clean anti-aliased inner and outer edges.
Avoid: any visible checkerboard, gray/white/black background, filled center, colored bubble, new shadow, halo, new objects, text, watermark.
```

### 糖霜碎屑

```text
Use case: background-extraction
Asset type: alpha-channel correction of an existing seven-piece frosting-debris cutout
Input image: Image 1 is the edit target. Its seven frosting fragments are final and must remain pixel-visually unchanged; the visible gray checkerboard is an incorrect baked background.
Primary request: Convert every gray checkerboard/background pixel to actual transparency. Preserve only the existing seven separate frosting fragments, including the yellow sprinkle and blue sprinkle. This is an alpha-channel correction, not a redesign.
Invariants: keep all seven exact silhouettes, chipped edges, highlights, colors, shading, relative sizes, separation, arrangement, dimensions, scale, and centered framing from Image 1. Do not merge, add, remove, redraw, or move fragments.
Constraints: output a genuine RGBA PNG. Every empty area alpha 0. Fragment pixels retain their original opaque/translucent appearance and clean anti-aliased edges.
Avoid: any visible checkerboard, gray/white/black background, complete ring, complete bubble, dust cloud, floor shadow, halo, extra fragments, text, watermark.
```

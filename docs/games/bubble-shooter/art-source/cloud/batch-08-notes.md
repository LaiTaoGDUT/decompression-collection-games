# 云端软糖第八批素材记录：Boss 合成校准与圆拳修订

日期：2026-09-11。工具：内置 `image_gen`。

本批将第七批身体、左右拳和皇冠放回已确认 Boss 主界面做比例审查。合成图仅用于检查构图关系，不是运行时整屏素材；由于内置合成会重新绘制输入，不能把它当作分层素材的逐像素叠加证明，也不能替代 `references/cloud-boss-composition-approved.png` 的批准地位。

## 合成判断

| 文件 | 状态 | 判断 |
| --- | --- | --- |
| [boss-pudding-composite-review-v1.png](boss-pudding-composite-review-v1.png) | 淘汰的第一次预览 | 941 × 1672 RGB；身体/圆拳关系自然，棋盘未下推，但皇冠最高球触碰并轻微裁切顶边 |
| [boss-pudding-composite-review-v2.png](boss-pudding-composite-review-v2.png) | 当前审查候选 | 941 × 1672 RGB；整体 Boss 缩小约 6%～8% 并略下移，皇冠完整且有天空余量，避开胶囊；血条与棋盘高度保持稳定 |

修订预览 v2 证明最终效果需要近球形圆拳。第七批 v1 双拳的三拳节起伏过强，因此淘汰，并重新生成：

| 素材 | 项目文件 | 原始生成文件 | 尺寸/Alpha | 当前判断 |
| --- | --- | --- | --- | --- |
| 左圆拳 v2 | [boss-pudding-fist-left-v2.png](boss-pudding-fist-left-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-69646a6b-db6b-4d62-a3ea-69e2173411dc.png` | 1536 × 1024 RGBA | 以单一大圆体为主、仅两个弱拳节；真实 Alpha，但外缘带轻微红色辉光，统一边缘处理时必须清理 |
| 右圆拳 v2 | [boss-pudding-fist-right-v2.png](boss-pudding-fist-right-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-369d30c7-5d73-4051-bcdf-d843938cdb17.png` | 1391 × 1131 RGB | 近球形、弱拳节、共同上左光源；棋盘格待透明后处理 |

## 合成预览提示词

### 第一次合成

```text
Use case: compositing
Asset type: full-screen Boss-layer composition review image, documentation only
Input images: Image 1 is the approved final Boss gameplay screen and the EDIT TARGET; Image 2 is the new wide body layer; Image 3 is the viewer-left fist layer; Image 4 is the viewer-right fist layer; Image 5 is the complete crown layer.
Primary request: Starting from Image 1, replace only the Pudding King character with a coherent composite built from the visual content of Images 2–5. Place the wide compact body across most of the top width, position the two fists at its lower left and lower right as in Image 1, and seat the complete crown in the center icing depression. This image is strictly a scale and placement preview for reviewing the generated layers against the approved gameplay layout.
Composition/framing: preserve Image 1's portrait full-screen composition and vertical relationships. The complete crown must remain visible below the top edge and avoid the WeChat capsule's actual rectangle. Keep the Boss body vertically compact so the health bar and 10/9 bubble board remain at the same approved heights; do not push the board or launcher downward. Fists should read as large ROUND jelly fists, with most of their mass near the outer sides and limited knuckle articulation.
Invariants: change only the Boss character assembly. Preserve the sky, islands, clouds, pause button, WeChat capsule, health bar, down arrow, frosting icon, counter slots, entire bubble board, aiming area, danger line, launcher, next ball, swap icon, three item buttons, all text, and all spacing as closely as possible. Do not change game rules, bubble colors, rows, UI labels, or health percentage.
Constraints: output one opaque portrait review image; no checkerboard; no layer labels; no guides; no added objects. Match the approved soft clean cloud-candy rendering and lighting.
Avoid: taller Boss, small Boss, cropped crown, fists with obvious human fingers, fists covering the face or health bar, moving the board down, new UI, weak point/core, armor, extra health bars, text changes, grain, noisy particles, watermark.
```

### 皇冠裁切修订

```text
Use case: precise-object-edit
Asset type: corrected full-screen Boss-layer composition review image, documentation only
Input images: Image 1 is the first composition preview and EDIT TARGET; Image 2 is the complete crown reference; Image 3 is the approved gameplay composition.
Primary request: Fix only the Pudding King assembly in Image 1 so the entire crown is clearly visible with at least a modest clean sky margin above the highest golden ball. Uniformly reduce the complete Boss assembly—body, both fists, icing, and crown—by roughly 6 to 8 percent and shift it slightly downward as one coherent group. Keep the same wide, imposing, large-face character and large round fists. The lower Boss edge must remain above the health bar with a clean cloud separation.
Invariants: preserve every non-Boss pixel and layout relationship from Image 1 as closely as possible. Do not move or resize the pause button, WeChat capsule, islands, health bar, down arrow, frosting icon, counter slots, bubble board, aim area, danger line, launcher, next ball, swap icon, item buttons, text, or background. Keep the board at exactly the same height. Preserve Boss face, colors, lighting, fist roundness, and crown design.
Constraints: one opaque portrait review image; full uncropped crown and all five golden ball tips visible; crown must avoid the WeChat capsule's actual rectangle; no new objects or guides.
Avoid: cropped crown, touching top edge, moving the board down, shrinking the Boss excessively, narrow body, small face, fists with fingers, UI changes, new text, weak point/core, watermark.
```

## 圆拳 v2 提示词

### 左圆拳

```text
Use case: background-extraction
Asset type: corrected viewer-left round fist sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the corrected full-screen composition and exact authority for the viewer-left ROUND fist silhouette, size, placement language, and lighting; Image 2 is the body layer and exact authority for jelly color/material.
Primary request: Generate exactly ONE standalone viewer-left fist matching Image 1. It must be a large, nearly spherical coral-pink translucent jelly fist: one dominant smooth round mass with only two extremely subtle soft knuckle suggestions near the lower/front edge, not a recognizable human hand. Use warm peach inner glow, berry-pink outer rim, restrained shared upper-left highlights, and a short small connection nub on the RIGHT side for overlapping the body. Complete the full hidden outline.
Style/medium: polished clean soft 3D candy illustration matching Image 2, broad smooth forms, friendly powerful round fist, low noise.
Composition/framing: centered single viewer-left fist, front three-quarter view, complete outline, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the fist alpha 0; anti-aliased edge. One fist only.
Avoid: checkerboard painted into pixels, gray/white backdrop, three or more prominent knuckles, human fingers, mitten shape, palm, nails, arm, body, crown, cloud, UI, grain, glitter, watermark, sprite sheet.
```

### 右圆拳

```text
Use case: background-extraction
Asset type: corrected viewer-right round fist sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the corrected full-screen composition and exact authority for the viewer-right ROUND fist silhouette, size, placement language, and lighting; Image 2 is the body layer and exact authority for jelly color/material.
Primary request: Generate exactly ONE standalone viewer-right fist matching Image 1. It must be a large, nearly spherical coral-pink translucent jelly fist: one dominant smooth round mass with only two extremely subtle soft knuckle suggestions near the lower/front edge, not a recognizable human hand. Preserve the shared upper-left scene light rather than mirroring highlights: warm peach inner glow, berry-pink outer rim, and a short small connection nub on the LEFT side for overlapping the body. Complete the full hidden outline.
Style/medium: polished clean soft 3D candy illustration matching Image 2, broad smooth forms, friendly powerful round fist, low noise.
Composition/framing: centered single viewer-right fist, front three-quarter view, complete outline, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the fist alpha 0; anti-aliased edge. One fist only.
Avoid: checkerboard painted into pixels, gray/white backdrop, three or more prominent knuckles, human fingers, mitten shape, palm, nails, arm, body, crown, cloud, UI, mechanically mirrored lighting, grain, glitter, watermark, sprite sheet.
```

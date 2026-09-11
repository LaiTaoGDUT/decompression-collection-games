# 云端软糖第七批素材记录：宽体布丁王核心分层

日期：2026-09-11。工具：内置 `image_gen`。

本批基于已确认的 Boss 最终构图拆分宽体布丁王。主依据为 `references/cloud-boss-composition-approved.png`，宽体造型图只辅助确认体量，放大前布局图只辅助恢复棋盘关系，不能恢复小 Boss 或下移棋盘。

## 文件与检查结果

| 素材 | 项目文件 | 原始生成文件 | 尺寸/Alpha | 当前判断 |
| --- | --- | --- | --- | --- |
| 默认表情身体 | [boss-pudding-body-v1.png](boss-pudding-body-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-09842a74-63cd-41f4-ba80-38428e0c8ee8.png` | 1774 × 887 RGB | 宽体、纵向紧凑、大脸和顶部奶油层完整；左右及下沿已补画，皇冠座留空。棋盘格待透明后处理 |
| 左拳 v1（已淘汰） | [boss-pudding-fist-left-v1.png](boss-pudding-fist-left-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-6bf20e50-a75e-43ed-b6b7-8dce7857dca9.png` | 1414 × 1112 RGB | 拳节起伏明显，偏软糖拳套，不符合最终参考的圆拳；只保留生成历史 |
| 右拳 v1（已淘汰） | [boss-pudding-fist-right-v1.png](boss-pudding-fist-right-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-8e53578c-5700-4758-86a9-ad574ea2b1c7.png` | 1393 × 1129 RGB | 同样拳节过强，只保留生成历史；当前圆拳见第八批记录 |
| 皇冠 | [boss-pudding-crown-v1.png](boss-pudding-crown-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-6c94ec19-054b-4981-8c03-64de31f82746.png` | 1536 × 1024 RGB | 五个圆头尖、中央心形宝石与底边完整，解决参考图皇冠裁切；棋盘格待透明后处理 |

## 运行时分层约定

```text
PuddingKingRoot
├── Body（默认表情；呼吸、受击整体缩放/形变）
├── FistLeft（独立前冲、回弹、抖动）
├── FistRight（独立前冲、回弹、抖动）
└── Crown（轻微滞后摆动，始终保持完整可见）
```

- 左右拳不能简单镜像同一图片，否则共同上左光源会翻转；两张图分别生成。
- 身体已经补全被拳头、云层和皇冠遮挡的区域，拳头移动时不能露出空洞。
- 默认表情暂时保留在身体图片上。呼吸、受击闪白、弹性缩放、拳头动作和皇冠滞后可由代码完成；只有合成与动效预演证明需要眨眼或表情切换时，才继续拆面部。
- 皇冠必须避开微信胶囊实际矩形，并完整显示；不能因短屏适配重新裁掉顶部。Boss 展示区高度不能把棋盘整体向下挤。
- 当前四张只是原图候选。透明处理后必须按最终效果图合成检查宽高、拳头圆度、皇冠占比、脸部位置和棋盘上沿关系，再决定是否修订。

## 完整提示词

### 默认表情身体

```text
Use case: background-extraction
Asset type: main body sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the FINAL approved Boss composition and primary authority for width, large face, compact vertical height, colors, icing, and expression; Image 2 is secondary authority for the wide imposing body shape; Image 3 is layout reference only and its smaller Boss proportions must NOT be restored.
Primary request: Generate exactly ONE standalone main body of the wide Pudding King, without either fist and without the crown. Preserve the approved character: a very wide, vertically compact coral-pink translucent jelly pudding body; huge friendly-but-determined face with two dark caramel eyes, thick expressive dark brows, rosy jelly cheeks, and an open smiling battle mouth; thick dripping warm-white cream icing across the entire top with a clean shallow center seat where a separate crown will overlap; subtle vertical jelly ridges and restrained glossy highlights. Reconstruct complete left/right body contours and lower body behind the areas hidden by fists and clouds in Image 1. The body must feel broad and powerful while leaving gameplay space below.
Style/medium: polished clean soft 3D candy illustration matching the approved screen exactly; large smooth forms, translucent coral jelly, matte creamy icing, warm upper-left lighting, low noise.
Composition/framing: centered straight-on view; broad horizontal silhouette; full icing and complete lower contour visible; generous transparent margin on all sides; nothing cropped.
Constraints: genuinely transparent-background RGBA PNG; outside the complete character body alpha 0; anti-aliased clean edge. Default face remains baked into the body for the base state. No fists, arms, crown, clouds, health bar, HUD, board bubbles, particles, background, or text.
Avoid: checkerboard painted into pixels, gray/white backdrop, small narrow Boss, tall body, angry villain grimace, extra limbs, separate facial parts, crown stub, scenery, excessive sprinkles, grain, glitter noise, watermark, multiple characters, sprite sheet.
```

### 左拳

```text
Use case: background-extraction
Asset type: viewer-left movable fist sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the final approved Boss composition and exact authority for the large fist on the viewer's LEFT; Image 2 is the newly generated body base and exact authority for jelly color, translucency, highlights, and rendering.
Primary request: Generate exactly ONE standalone viewer-left Pudding King fist. Reconstruct the approved large round jelly fist as a compact coral-pink translucent candy boxing-fist/gumdrop form with three very subtle rounded knuckle lobes, a bright restrained upper-left highlight, warm peach center glow, berry-pink outer edge, and a short inward-facing wrist connection on its RIGHT side so it can overlap the body naturally. Complete the entire silhouette hidden by the body/cloud in the reference.
Style/medium: polished clean soft 3D candy illustration exactly matching Image 2, broad smooth forms, friendly powerful shape, low noise.
Composition/framing: centered single fist, front three-quarter view appropriate for the viewer-left side, complete outline visible, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the fist alpha 0; anti-aliased clean edge. One fist only, no arm/body/crown/cloud/background/UI.
Avoid: checkerboard painted into pixels, gray/white backdrop, human fingers, nails, realistic skin, sharp knuckles, weapon, second fist, face, excessive sparkles, grain, watermark, sprite sheet.
```

### 右拳

```text
Use case: background-extraction
Asset type: viewer-right movable fist sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the final approved Boss composition and exact authority for the large fist on the viewer's RIGHT; Image 2 is the newly generated body base and exact authority for jelly color, translucency, highlights, and rendering.
Primary request: Generate exactly ONE standalone viewer-right Pudding King fist. Reconstruct the approved large round jelly fist as a compact coral-pink translucent candy boxing-fist/gumdrop form with three very subtle rounded knuckle lobes, lighting consistent with a shared upper-left scene light, warm peach center glow, berry-pink outer edge, and a short inward-facing wrist connection on its LEFT side so it can overlap the body naturally. Complete the entire silhouette hidden by the body/cloud in the reference. This is a separately lit right-side asset, not a mechanically mirrored left image.
Style/medium: polished clean soft 3D candy illustration exactly matching Image 2, broad smooth forms, friendly powerful shape, low noise.
Composition/framing: centered single fist, front three-quarter view appropriate for the viewer-right side, complete outline visible, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the fist alpha 0; anti-aliased clean edge. One fist only, no arm/body/crown/cloud/background/UI.
Avoid: checkerboard painted into pixels, gray/white backdrop, human fingers, nails, realistic skin, sharp knuckles, weapon, second fist, face, excessive sparkles, grain, watermark, sprite sheet.
```

### 皇冠

```text
Use case: background-extraction
Asset type: separate crown sprite for the cloud-candy Pudding King Boss
Input images: Image 1 is the final approved Boss composition and primary authority for the crown; Image 2 defines the exact cream icing seat, scale language, and lighting; Image 3 confirms the broad royal candy styling.
Primary request: Generate exactly ONE complete standalone Pudding King crown. Match the approved crown: a warm polished golden candy crown with five rounded-tipped points, small golden ball finials, a central raised coral-pink heart jewel, two or three restrained tiny pale candy gems along the lower band, and a softly curved base that sits naturally in the icing depression of Image 2. Reconstruct the full crown including the previously cropped top tips.
Style/medium: polished clean soft 3D candy illustration, rounded toy-like royal form, warm upper-left highlight, amber lower shading, matching the approved Boss.
Composition/framing: centered straight-on crown, complete silhouette with all tips and base visible, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the crown alpha 0; anti-aliased clean edge. Crown only, no icing, body, face, fists, cloud, background, health bar, or text.
Avoid: checkerboard painted into pixels, gray/white backdrop, sharp metal spikes, realistic jewelry, letters, excessive gems, glitter noise, floating particles, second crown, watermark, sprite sheet.
```

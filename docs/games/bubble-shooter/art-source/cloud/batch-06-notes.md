# 云端软糖第六批素材记录：三道具控件

日期：2026-09-11。工具：内置 `image_gen`。

本批基于已确认普通主界面的底部三个道具按钮进行拆分。道具图标、共用底板、库存角标分别生成；道具名称与库存数字不烘焙进图片，禁用、选中、按压和库存满态由运行时节点承担。

## 文件与检查结果

| 素材 | 项目文件 | 原始生成文件 | 尺寸/Alpha | 当前判断 |
| --- | --- | --- | --- | --- |
| 炸弹球图标 | [item-bomb-v1.png](item-bomb-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-bdb75662-f441-4fa3-8055-031969759c90.png` | 1254 × 1254 RGB | 黑色球体、金色盖/引线和黄色星徽清楚；棋盘格待透明后处理 |
| 万能球图标 | [item-wildcard-v1.png](item-wildcard-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-f62938dd-4161-4047-8bfa-e255b83f5fe9.png` | 1254 × 1254 RGB | 五色旋涡作为一颗完整球体，缩小后仍可识别；棋盘格待透明后处理 |
| 清底图标 | [item-clear-bottom-v1.png](item-clear-bottom-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-16ede4b0-2a47-490d-8ce7-cf496b2f218e.png` | 1536 × 1024 RGB | 红/奶油/金色横向包裹糖完整；棋盘格待透明后处理 |
| 共用按钮底板 | [item-button-base-v1.png](item-button-base-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-6bae37d4-1c8b-4a84-82a9-bc109ea5648c.png` | 1312 × 1199 RGBA | 已有真实 Alpha；圆形图标区和底部文字牌均为空，可供三类道具复用 |
| 库存角标底板 | [item-count-badge-v1.png](item-count-badge-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-cb630e64-179c-4eb3-9a42-70c2bada08f5.png` | 1254 × 1254 RGBA | 已有真实 Alpha；中心无数字，由运行时 Label 显示库存 |

## 运行时拆分约定

```text
ItemButton
├── ButtonBase（三区共用）
├── ItemIcon（炸弹球 / 万能球 / 清底）
├── NameLabel（运行时文本）
├── CountBadge
│   ├── BadgeBase
│   └── CountLabel（运行时库存数字）
└── StateOverlay（禁用/选中/库存满等状态）
```

- 三个道具按钮使用同一个底板 Prefab/视觉资产，不生成三份近似底板。
- 按钮按压使用轻微缩放和亮度反馈；选中态可使用外发光/描边节点；禁用和库存满态使用颜色、透明度及必要的状态提示，具体页面仍需在实现时对照确认图检查。
- 炸弹球和万能球作为本次发射替代物，取消时不消耗；清底先进入预览确认再执行。视觉按钮不能绕过稳定待发射状态锁。
- 所有文字均不进入图片，避免字体授权、清晰度和本地化被锁死。

## 完整提示词

### 炸弹球图标

```text
Use case: background-extraction
Asset type: bomb-ball consumable icon for the cloud-candy bubble-shooter
Input images: Image 1 is the approved normal gameplay screen and exact authority for the leftmost bomb icon; Image 2 defines the clean glossy candy UI rendering.
Primary request: Generate exactly ONE standalone bomb-ball icon matching Image 1: a compact near-black charcoal candy sphere with a soft glossy upper-left highlight, subtle deep-blue lower shading, one small warm-gold metal-like cap, a short curved brown fuse, and a raised honey-yellow five-point star emblem centered on the front. Friendly toy-like proportions, readable at roughly 68–82 design pixels.
Style/medium: polished clean soft 3D candy-game icon, rounded safe forms, restrained detail, no realistic weapon treatment.
Composition/framing: centered front-facing three-quarter sphere, one complete icon, generous transparent margin, fuse fully visible, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the bomb alpha 0; anti-aliased clean edge; icon only, no button base, label, number, badge, cloud, or explosion.
Avoid: checkerboard painted into pixels, gray/white backdrop, skull, flame burst, smoke, sparks, realistic grenade, text, UI panel, multiple bombs, grain, glitter, watermark, sprite sheet.
```

### 万能球图标

```text
Use case: background-extraction
Asset type: wildcard-ball consumable icon for the cloud-candy bubble-shooter
Input images: Image 1 is the approved normal gameplay screen and exact authority for the center wildcard icon; Images 2 and 3 define the glossy translucent bubble material and lighting.
Primary request: Generate exactly ONE standalone wildcard-ball icon matching Image 1: a single round glossy candy orb formed by a smooth pinwheel swirl of coral pink, grape purple, lake blue, honey yellow, and a small fresh green accent. The colors spiral cleanly toward the center while the entire object remains one coherent spherical ball with a restrained upper-left highlight. It must communicate “matches any color” without text and remain readable at roughly 68–82 design pixels.
Style/medium: polished clean soft 3D candy-game icon, smooth broad color bands, bright but harmonious, low visual noise.
Composition/framing: centered front-facing sphere, one complete icon, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the orb alpha 0; anti-aliased clean edge; icon only, no button base, label, number, badge, cloud, or extra balls.
Avoid: checkerboard painted into pixels, gray/white backdrop, flower petals, flat color wheel, lollipop stick, letters, symbols, excessive thin rainbow stripes, grain, sparkles, watermark, variants, sprite sheet.
```

### 清底图标

```text
Use case: background-extraction
Asset type: clear-bottom consumable icon for the cloud-candy bubble-shooter
Input images: Image 1 is the approved normal gameplay screen and exact authority for the rightmost clear-bottom wrapped-candy icon; Image 2 defines the red-and-cream twisted candy material and clean rendering.
Primary request: Generate exactly ONE standalone wrapped hard-candy icon matching Image 1: a short horizontal rounded candy cylinder with alternating coral-red, warm cream, and pale-gold diagonal bands, glossy but clean; one compact twisted wrapper fin at each end, symmetrical and clearly separated from the center. It represents the approved clear-bottom tool and must remain readable at roughly 72–88 design pixels.
Style/medium: polished clean soft 3D candy-game icon, rounded friendly silhouette, restrained highlights, smooth large forms.
Composition/framing: centered horizontal front view, one complete wrapped candy, generous transparent margin, both wrapper ends fully visible, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the candy alpha 0; anti-aliased clean edge; icon only, no arrows, broom, eraser, button base, label, number, badge, cloud, or cleared rows.
Avoid: checkerboard painted into pixels, gray/white backdrop, text, extra candy, realistic plastic wrapper, excessive stripes, grain, glitter, watermark, variants, sprite sheet.
```

### 共用按钮底板

```text
Use case: background-extraction
Asset type: shared consumable-item button base for the cloud-candy bubble-shooter HUD
Input images: Image 1 is the approved normal gameplay screen and exact authority for the three bottom item controls; Image 2 defines the fluffy cloud and red-cream candy materials; Image 3 defines the pearl-white/blush rim treatment.
Primary request: Generate exactly ONE empty reusable item-button base matching Image 1. It has a circular pale-peach candy icon plate at the top with a pearl-white glossy rim and a completely empty center area for a separate item icon; beneath it sits a compact fluffy white cloud pedestal; across the lower front is one blank rounded cream label plaque with a thin pale-pink rim, wide enough for runtime Chinese text. The pieces form one coherent vertical button base.
Style/medium: polished clean soft 3D cloud-candy UI, rounded friendly forms, restrained highlights, gentle lavender-peach shadow, readable at roughly 150–170 design pixels wide.
Composition/framing: centered straight-on view, one complete empty button base, generous transparent margin, nothing cropped.
Constraints: genuinely transparent-background RGBA PNG; outside the complete base alpha 0; anti-aliased clean edge. The icon plate and label plaque must be blank and unobstructed. No inventory badge.
Avoid: checkerboard painted into pixels, gray/white full backdrop, bomb, rainbow ball, wrapped candy, any icon, Chinese or Latin text, numbers, badge, selected glow, lock, extra buttons, grain, glitter, watermark, sprite sheet.
```

### 库存角标底板

```text
Use case: background-extraction
Asset type: inventory-count badge base for consumable item buttons
Input images: Image 1 is the approved normal gameplay screen and exact authority for the small red count badges at the upper-right of each item button; Image 2 defines the berry-pink candy material and pale rim.
Primary request: Generate exactly ONE small empty circular inventory badge base matching Image 1: vivid coral-berry candy disk, thin pearl-white outer rim plus a subtle darker-pink lower edge, restrained upper-left highlight, and a clean flat-enough central area reserved for a runtime white number. Do not include any numeral.
Style/medium: polished clean soft 3D candy HUD, simple bold silhouette, readable at roughly 34–42 design pixels.
Composition/framing: centered front-facing circle, one badge only, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; outside the badge alpha 0; anti-aliased clean edge; empty center.
Avoid: checkerboard painted into pixels, gray/white backdrop, number 1 or any text, plus sign, notification dot without rim, item icon, button base, cloud, strong glare through the center, grain, glitter, watermark, variants, sprite sheet.
```

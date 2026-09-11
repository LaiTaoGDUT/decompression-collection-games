# 云端软糖第九批素材记录：攻击反馈

日期：2026-09-11。工具：内置 `image_gen`。

本批补齐已确认普通/Boss 主界面所需的首组攻击反馈源图。贴图只提供可复用的静态视觉单元；能量飞行路径、错峰、糖屑运动、受击闪光、伤害聚合和对象回收全部由运行时代码承担。

| 素材 | 项目文件 | 原始生成文件 | 尺寸/Alpha | 当前判断 |
| --- | --- | --- | --- | --- |
| 能量心 v1 | [attack-energy-heart-v1.png](attack-energy-heart-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-10acb9d4-18a2-4ecd-8f02-96b0d92c8343.png` | 1254 × 1254 RGBA | 单个珊瑚粉糖果心，带短而克制的粉金渐隐光晕；未烘焙路径，可缩小后重复实例化 |
| 四色糖屑 v1 | [attack-candy-shards-v1.png](attack-candy-shards-v1.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-28620179-5f03-4822-8138-73c615b448f7.png` | 1298 × 1212 RGBA | 共八块且互不接触，珊瑚红、蜂蜜黄、湖水蓝、葡萄紫各两块；运行时使用前切为独立 SpriteFrame |

## 运行时约定

```text
BossDamageFeedback
├── EnergyMotePool     # attack-energy-heart-v1 的复用实例
└── CandyShardPool     # attack-candy-shards-v1 切分后的复用实例
```

- 能量心从本次消除或掉落区域的若干代表位置出发，沿短曲线路径错峰飞向 Boss 受击点；不生成贯穿棋盘的常驻光束。
- 视觉能量心数量用于表达力度，不与每一点伤害一一对应。逻辑层先汇总本次伤害，再在到达时触发一次受击反馈，避免大量 Session 内对象和重复结算。
- 糖屑按命中颜色优先选取，运行时随机控制初速度、旋转、缩放、位移和淡出；源图不承担运动帧。
- 两组反馈均使用对象池。暂停时暂停补间，退出或 `dispose()` 时取消未完成回调并回收全部实例，不保留已销毁节点引用。

## 完整生成提示词

### 能量心

```text
Use case: background-extraction
Asset type: reusable flying damage-energy particle for the cloud-candy Boss battle
Input images: Image 1 is the approved Boss screen and shows the small pink heart-energy trail flying toward the Boss; Image 2 defines the coral-pink glossy candy material; Image 3 defines the warm golden accent light used near the Boss.
Primary request: Generate exactly ONE compact heart-shaped energy mote. It is a small plump coral-pink translucent candy heart with a bright pearl-white upper-left highlight, a warm pale-gold inner glint, and a very soft short pink-gold aura that fades to transparent. The heart must remain readable around 16–24 design pixels. It will be instantiated several times and moved along short curved runtime paths from cleared bubbles to the Boss.
Style/medium: polished clean soft 3D candy-game particle, simple bold silhouette, restrained glow, matching the approved cloud-candy scene.
Composition/framing: centered single heart mote, front-facing, generous transparent margin for the soft aura, no crop.
Constraints: genuinely transparent-background RGBA PNG; all area beyond the fading aura alpha 0; anti-aliased clean edge; one particle only; no motion trail baked into the image.
Avoid: checkerboard painted into pixels, black/gray/white backdrop, long beam, curved path, multiple hearts, arrows, text, damage number, explosion, lens flare, sharp starburst, noisy sparkles, grain, watermark, sprite sheet.
```

### 四色糖屑

```text
Use case: background-extraction
Asset type: small candy-shard particle cluster source for bubble clear and Boss impact feedback
Input images: Image 1 is the approved normal gameplay screen and overall visual authority; Images 2–5 define the coral red, honey yellow, lake blue, and grape purple bubble colors, translucency, and highlights.
Primary request: Generate one compact loose cluster of exactly 8 separate candy fragments: two coral-red, two honey-yellow, two lake-blue, and two grape-purple. Use a balanced mix of tiny rounded triangular chips, short curved shell-like slivers, and small soft-edged rectangular shards, all clearly separated with open space. Each fragment should look like a clean translucent piece of the matching glossy bubble, with subtle thickness and a restrained upper-left highlight. These fragments will be sliced or emitted individually and animated by code.
Style/medium: polished clean soft 3D candy-game particle source, rounded safe edges, broad simple shapes readable at small size, low noise.
Composition/framing: centered loose radial arrangement; every fragment separated and fully visible; generous transparent margin; no overlap; no baked motion trails or explosion cloud.
Constraints: genuinely transparent-background RGBA PNG; all empty space alpha 0; anti-aliased clean edges; exactly 8 fragments and only the four approved colors.
Avoid: checkerboard painted into pixels, gray/white backdrop, complete bubbles, heart/star/drop/grape symbols, frosting, dust, smoke, long streaks, sharp glass, hundreds of crumbs, glitter noise, text, watermark, panel, regular sprite-sheet grid.
```

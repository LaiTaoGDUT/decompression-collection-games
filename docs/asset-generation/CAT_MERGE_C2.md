# 合成大胖橘 C2 圆形逐帧猫咪

## 目标

- 11 级猫咪均使用标准圆形安全边界，不绘制黑色或其他颜色外圈。
- 素材库每级保留 3 张待机候选帧和 1 张下落帧，共 44 张透明 PNG；运行时每级只加载变化最小的 2 张待机帧和 1 张下落帧。
- 动画通过切换 `SpriteFrame` 实现，不使用缩放、旋转、抖动或挤压模拟。
- 不同猫咪使用抱尾、抬爪、趴卧、收爪、露肚等不同基础姿态。

## 生成方式与来源

- 工具：Codex 内置 ImageGen。
- 输入参考：项目原创 C1 猫咪母版 `docs/asset-generation/sources/cat-evolution-sheet-c1-v1.png`。
- 外部版权素材：无。
- 绿幕源图：
  - `docs/asset-generation/sources/cat-frames-c2/cat-frames-levels-00-03-c2-v1.png`
  - `docs/asset-generation/sources/cat-frames-c2/cat-frames-levels-04-07-c2-v1.png`
  - `docs/asset-generation/sources/cat-frames-c2/cat-frames-levels-08-10-c2-v1.png`
- 当前正式资源：`assets/games/watermelon/visual/cats/frames-c6/`

## 最终提示词组

三次生成共用以下约束：

```text
Use case: stylized-concept
Asset type: production frame-animation sprite sheet for a commercial mobile merge game
Input image: the project-owned 11-cat evolution sheet is the exact character identity, fur-color and polished 2.5D rendering reference.
Scene/backdrop: perfectly flat uniform solid #00FF00 chroma-key background with no variation.
Frame order: four columns are exactly idle frame 1, idle frame 2, idle frame 3, falling frame.
Frame behavior: true separately drawn character-frame changes. Idle 1 is neutral; idle 2 adds a blink and ear/tail change; idle 3 changes a paw, mouth, whisker or gaze; the falling frame lifts the paws inward, widens the eyes and lowers the ears. Never simulate animation with scaling or distortion.
Geometry invariant: every frame uses the same centered circular token diameter and equal padding. Keep all important features inside the circle-safe area. The body is circular, never oval or pear-shaped.
Style/medium: premium polished 2.5D casual mobile game art with soft rounded volumes.
Constraints: no outline, border, ring, stroke, rim or badge; no shadow, floor, text, number, label, grid line, prop, watermark or extra object; no green on cats.
```

各组的角色与姿态补充：

```text
Levels 00–03, 4×4 grid: cream kitten sits with one paw near cheek; gray tabby hugs its striped tail; calico tucks its paws asymmetrically; tuxedo folds paws over its belly.
Levels 04–07, 4×4 grid: white fluffy cat rests its chin on its paws; brown tabby sits diagonally with one paw over its tail; Siamese tucks its paws close with tail curling to one side; golden shorthair raises one forepaw.
Levels 08–10, 4×3 grid: silver tabby shows one hind paw with tail tucked sideways; orange tabby lounges with one paw across its belly; the final extremely fat orange tabby sits belly-forward with both paw pads visible and its tail along the bottom.
```

## 后处理

1. 使用 ImageGen 技能自带 `remove_chroma_key.py` 自动取边缘键色、软蒙版并去绿边。
2. 按生成表格的精确行列边界裁切为独立帧。
3. 输出统一为 512×512 RGBA PNG。
4. C3 修正不再直接裁切主体：逐帧计算完整猫咪 Alpha 边界，将整只猫等比缩放并居中放入 436×436 圆形安全区，四周至少保留约 38px 透明画布。
5. 每帧只保留猫咪主体的最大连通区域，清除帧表残留碎片；正圆安全蒙版不会接触主体像素，也不叠加任何描边。
6. Cocos 运行时只切换帧，碰撞体继续使用既有 `CircleCollider2D`。

### C4 严格正圆与动画尺寸修正

- 不再按单帧分别计算缩放。同一级 4 帧先计算共同最大主体尺寸与平均中心，再统一使用同一个缩放系数和定位基准。
- 每张 512×512 PNG 使用完全一致的 456px 直径圆形 Alpha，圆外透明，圆内以对应毛色作柔和底色，不绘制描边。
- 逐像素比较同一级 4 帧 Alpha；任意差异均视为失败。最终 11 级全部通过一致性检查。
- 猫咪主体统一约束在 404×404 安全区内，耳朵、爪子与尾巴完整保留，不接触圆形裁切边界。
- 运行时只更换 `SpriteFrame`；`CatVisual` 的尺寸、缩放与角度保持不变。

### C5 半分辨率运行资源

- 以 C4 的 44 张 512×512 RGBA PNG 为唯一源文件，使用 Lanczos 重采样为 256×256。
- 不重新构图、不改变角色或动画帧；保留同等的正圆 Alpha 与帧内安全边距。
- C4 保留为无损源，运行时改用 `frames-c5/`，以减少约 75% 的像素数和纹理内存。
- “下一只猫”的 UI 预览固定为 64×64，不再继承游戏物理半径。

### C6 相切与无黑边修正

- 以 C5 的 44 张 256×256 RGBA PNG 为输入，只做确定性的边缘处理，不重新生成角色或改变逐帧动作。
- 将原先约 230px 的有效圆统一扩展为 252px，并保留 2px 透明滤波安全区；运行时按 `252 / 256` 显式补偿，使可见圆直径与 `CircleCollider2D` 完全一致。
- 采用预乘 Alpha 重采样，最外层半透明像素使用相邻毛色回填，避免透明黑像素在双线性缩放时形成黑圈。
- 同一级四帧继续共用逐像素一致的圆形 Alpha；44 张均验证为 256×256 RGBA。
- 模式：`precise-object-edit` 的项目内确定性批处理；本轮没有新增生成式提示词，沿用上文 ImageGen 角色与帧动画提示词组。
- 运行素材整理后只保留每级实际加载的两张待机帧和一张下落帧，共 33 张；未选候选帧及 C1–C5 旧代际已清理，不再保留归档副本。

### C7 最高两级辨识度修正

- 问题：`cat-09-orange-tabby` 与 `cat-10-fat-orange` 在 64px 左右的实际游戏尺寸下都呈现为橙色圆形虎斑，姿态差异不足以快速识别。
- 方案：第 10 级保持原来的大胖橘不变；第 9 级改为黑烟虎斑，以深炭黑主色、石墨灰条纹、少量奶油色口套和绿金眼睛形成强识别特征。
- ImageGen 提示词（`precise-object-edit`）：“Turn this orange tabby into a distinctive black smoke cat. Replace all orange coat fur with deep charcoal-black fur, preserve readable graphite tabby stripes, keep a small warm-ivory muzzle and chest patch, retain the green-gold eyes and pink nose, and change the token base to muted cool charcoal-purple; it must read as non-orange immediately at 64px.”
- 落地：生成结果用作黑烟/石墨/奶油配色母版；第 9 级正式三帧使用同一套确定性 HSV 色彩映射，第 10 级恢复原始素材，以保留逐帧五官、姿态、尺寸和逐像素 Alpha。

### C8 第九只猫全新形象与物理尺寸纠偏

- 用户纠偏：第九只猫不是恢复旧银渐层，而是替换为与旧形象及其余 10 只都不同的新角色；“猫咪放大”指物理尺寸和碰撞体同步变大，不是 Sprite 单独越过碰撞圆。
- 新角色：第 9 级改为“蓝灰折耳”，采用浓密纯蓝灰短绒、明显折耳、铜金色眼睛和炭黑鼻头；不含银渐层条纹、竖耳或无毛特征，也不复用灰虎斑、金渐层、暹罗、黑烟虎斑和橘猫的配色/耳型组合。
- ImageGen 模式：内置 `image_gen`，`precise-object-edit`。以原第 9 级三帧分别作为姿态/构图参考，以新睁眼帧作为角色身份参考，生成睁眼待机、闭眼待机和惊讶下落三帧。
- 核心提示词：`Replace the silver tabby completely with a brand-new blue Scottish Fold cat character; dense plush solid slate-blue fur, clearly folded small ears, round cheeks, copper-amber eyes and charcoal nose; remove every silver-tabby stripe; furry and plush, never hairless; preserve the centered circular body silhouette, frame-specific pose, padding and polished 2.5D finish.`
- 生成源：`docs/asset-generation/sources/cat-08-blue-scottish-fold-c8/`；确定性处理脚本：`tools/watermelon/process-cat-08-blue-scottish-fold.js`；运行文件仍位于 `frames-c6/`，以 `cat-08-blue-scottish-fold-*-c8-v1.png` 命名。
- 后处理：将 1254² 生成源用 Lanczos 缩放到 256²，应用完全一致的 252px 抗锯齿圆形 Alpha 与 2px 滤波安全区；三帧 Alpha 逐字节一致，旧银渐层文件已清理，不再保留归档副本。
- 物理纠偏：删除 `CAT_VISUAL_SCALE`；11 级半径统一乘以 1.12，并由同一个 `config.radius` 同时驱动节点直径、`CircleCollider2D.radius`、预览、投放夹取、出生高度和危险线计算。质量保持原配置，密度按增大后的圆面积重新计算。

## 运行时节奏

- 待机：逐级像素差异比对后，选择变化最小的 2 帧循环，每帧约 0.9–1.1 秒，不同等级使用轻微错峰。
- 下落：从投放起保持单独的下落帧，首次碰撞后回到待机循环。
- 合成：短暂显示第 3 张待机帧，不改变节点尺寸和角度。
- 大厅封面：使用等比 cover 布局并居中裁切，禁止非等比拉伸。

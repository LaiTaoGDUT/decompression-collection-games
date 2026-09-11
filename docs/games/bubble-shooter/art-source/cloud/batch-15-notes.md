# 第十五批：三个道具图标透明与尺寸处理

日期：2026-09-11。

本批处理炸弹球、万能球和清底三个道具图标。三次内置生图都再次把透明预览棋盘格写入 RGB，因此保留生图结果作为来源，再使用颜色边界、内部安全区和规则圆形蒙版提取真实 Alpha。运行时候选统一为 192 × 192 RGBA，但只统一画布和枢轴，不改变各图标自然比例。

## 输出

| 素材 | 最终透明母版 | 运行时文件 | 有效区与建议显示 | 状态 |
| --- | --- | --- | --- | --- |
| 炸弹球 | [item-bomb-extracted-v6.png](item-bomb-extracted-v6.png) | [item-bomb.png](../../runtime-source/cloud/item-bomb.png) | 画布 192 × 192；完整图标约 158 × 176；建议显示约 80 × 88 | 球体、金属圈和焦糖引线完整，白色高光未误挖空 |
| 万能球 | [item-wildcard-extracted-v3.png](item-wildcard-extracted-v3.png) | [item-wildcard.png](../../runtime-source/cloud/item-wildcard.png) | 画布 192 × 192；可见圆径 176；建议显示约 80 × 80 | 五色旋涡与中心汇聚保持原方向 |
| 清底 | [item-clear-bottom-extracted-v7.png](item-clear-bottom-extracted-v7.png) | [item-clear-bottom.png](../../runtime-source/cloud/item-clear-bottom.png) | 画布 192 × 192；完整图标约 176 × 64；建议显示约 96 × 36 | 保持横向包装比例，左右糖纸完整 |

[按钮组合检查](item-buttons-runtime-composite-review-v1.png) 使用现有 320 × 288 共用底板和 96 × 96 库存角标，以两倍纹理关系合成。三个图标均落在圆形槽内，没有压住底部文字区或右下角库存角标。按钮名称、数量、禁用态、选中态和按压反馈继续由运行时节点生成。

## 生图来源

| 素材 | 生图暂存 | image_gen 输出 | 属性 |
| --- | --- | --- | --- |
| 炸弹球 | [item-bomb-transparency-attempt-v2.png](item-bomb-transparency-attempt-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-aa53de72-f05f-4fc3-a124-2de2fb92dcd3.png` | 1254 × 1254 RGB，棋盘格写入像素 |
| 万能球 | [item-wildcard-transparency-attempt-v2.png](item-wildcard-transparency-attempt-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-792e4809-c133-4354-b60b-87aff97705d4.png` | 1254 × 1254 RGB，棋盘格写入像素 |
| 清底 | [item-clear-bottom-transparency-attempt-v2.png](item-clear-bottom-transparency-attempt-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-0dc6cd87-6dad-4228-8293-50fb39ec72d4.png` | 1254 × 1254 RGB，棋盘格写入像素 |

## 透明编辑提示词

### 炸弹球

```text
Use case: background-extraction
Asset type: bomb power-up icon production cutout for the approved cloud-candy bubble shooter item button
Input image: Image 1 is the edit target and exact authority for the icon design.
Primary request: Remove only the entire gray checkerboard/background. Return exactly the same single glossy navy-blue round candy bomb with the gold collar, short twisted caramel fuse, and plain yellow candy star on its front.
Invariants: preserve the complete bomb sphere, star shape, fuse curve and length, gold collar, navy-to-blue shading, highlights, candy material, lighting, front-facing three-quarter orientation, and proportions as closely as possible.
Composition/framing: center the complete icon on a square canvas with even transparent safety margin; no crop; keep the fuse fully visible.
Constraints: genuinely transparent-background RGBA PNG; all pixels outside the bomb, collar, fuse, and star alpha 0; clean anti-aliased edge; one icon only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, smoke, sparks, flame, explosion, text, number, button base, inventory badge, floor shadow, halo, watermark, sprite sheet.
```

### 万能球

```text
Use case: background-extraction
Asset type: wildcard power-up icon production cutout for the approved cloud-candy bubble shooter item button
Input image: Image 1 is the edit target and exact authority for the icon design.
Primary request: Remove only the entire gray checkerboard/background. Return exactly the same single glossy round five-color pinwheel candy ball with coral-red, honey-yellow, green, lake-blue, and grape-purple curved segments.
Invariants: preserve the circular silhouette, five curved color segments, clockwise pinwheel arrangement, central convergence, highlights, rim, candy translucency, lighting, scale, and front-facing orientation as closely as possible.
Composition/framing: centered complete circular icon on a square canvas with even transparent safety margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; all pixels outside the circle alpha 0; clean anti-aliased edge; one icon only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, star, question mark, text, number, button base, inventory badge, floor shadow, halo, watermark, sprite sheet.
```

### 清底

```text
Use case: background-extraction
Asset type: clear-bottom power-up icon production cutout for the approved cloud-candy bubble shooter item button
Input image: Image 1 is the edit target and exact authority for the icon design.
Primary request: Remove only the entire gray checkerboard/background. Return exactly the same single horizontally wrapped coral-red, cream, and honey-yellow striped hard candy.
Invariants: preserve the complete central oval candy body, both tied wrapper ends, red-and-cream spiral stripes, gold accents, highlights, glossy candy material, lighting, front-facing orientation, and wide proportions as closely as possible.
Composition/framing: center the complete wrapped candy on a square canvas with transparent safety margin on every side; no crop; both wrapper tips fully visible.
Constraints: genuinely transparent-background RGBA PNG; all pixels outside the wrapped candy alpha 0; clean anti-aliased edge; one icon only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, arrow, broom, eraser, text, number, button base, inventory badge, floor shadow, halo, watermark, sprite sheet.
```

## 提取与验收

- 三张生图均没有可用 Alpha，不能直接作为透明素材。
- 万能球使用圆形解析蒙版；炸弹和清底使用饱和色外边界加内部安全区补全白色高光。最终蓝底检查没有棋盘格残留或高光透明孔洞。
- 降采样前执行预乘 Alpha，缩放后恢复直通 Alpha，避免透明 RGB 中的棋盘格颜色污染边缘。
- 三张运行时图均使用 Lanczos 等比降采样和中心枢轴。清底图标只缩小，不做纵向拉伸。
- 本批只处理已确认主界面素材，没有新增页面视觉或业务代码。

# 云端软糖第十一批素材记录：四色泡泡透明与尺寸统一

日期：2026-09-11。透明母版工具：内置 `image_gen`。运行时处理：`ffmpeg` Lanczos 降采样。

四张 v1 泡泡把灰色透明预览棋盘格写进了 RGB 像素。本批分别以 v1 为编辑目标，只移除背景并保留颜色、纹样、高光与果冻材质；随后统一修正生图产生的 1%～3% 外轮廓宽高偏差，输出为 176 × 176 RGBA 固定画布。

| 颜色 | 透明母版 | 原始生成文件 | 母版尺寸/Alpha | 运行时文件 | 运行时规格 |
| --- | --- | --- | --- | --- | --- |
| 珊瑚红/心形 | [bubble-red-transparent-v2.png](bubble-red-transparent-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-222f8c03-0762-4489-923b-709513a487c1.png` | 1254 × 1254 RGBA | `runtime-source/cloud/bubble-red.png` | 176 × 176 RGBA；160 × 160 可见圆体 |
| 蜂蜜黄/星形 | [bubble-yellow-transparent-v2.png](bubble-yellow-transparent-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-cfedae07-c5f1-4ee2-9ce6-4cd35a9feaec.png` | 1254 × 1254 RGBA | `runtime-source/cloud/bubble-yellow.png` | 176 × 176 RGBA；160 × 160 可见圆体 |
| 湖水蓝/水滴 | [bubble-blue-transparent-v2.png](bubble-blue-transparent-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-d56c211a-60b3-449e-a390-b3966e8beca8.png` | 1254 × 1254 RGBA | `runtime-source/cloud/bubble-blue.png` | 176 × 176 RGBA；160 × 160 可见圆体 |
| 葡萄紫/葡萄 | [bubble-purple-transparent-v2.png](bubble-purple-transparent-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-516b2aa1-4bcc-4654-8a68-1d10c665e783.png` | 1254 × 1254 RGBA | `runtime-source/cloud/bubble-purple.png` | 176 × 176 RGBA；160 × 160 可见圆体 |

四张运行时图的非零 Alpha 边界均为 `x=8..167, y=8..167`，有效范围严格为 160 × 160。Alpha 通道单独检查为干净圆形；透明区中可能保留的隐藏 RGB 不参与渲染，并为图集边缘扩张保留颜色信息。四张中心枢轴统一为 `(0.5, 0.5)`。

## 完整生成提示词

### 红色心形泡泡

```text
Use case: background-extraction
Asset type: production cutout master for the coral-red bubble in the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the bubble design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single coral-red glossy round bubble with its centered soft pink heart emblem.
Invariants: preserve the outer circle silhouette, proportions, coral-red color, heart shape, highlight positions, rim lighting, translucency, internal shading, material, front-facing orientation, and visual scale as closely as possible. Do not redesign, recolor, sharpen, simplify, add glow, or change the emblem.
Composition/framing: center the complete bubble on a square canvas with modest transparent margin; keep it perfectly circular and uncropped.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the bubble alpha 0; clean anti-aliased edge; one bubble only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, floor shadow, external drop shadow, halo, extra particles, text, watermark, sprite sheet.
```

### 黄色星形泡泡

```text
Use case: background-extraction
Asset type: production cutout master for the honey-yellow bubble in the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the bubble design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single honey-yellow glossy round bubble with its centered soft yellow five-point star emblem.
Invariants: preserve the outer circle silhouette, proportions, honey-yellow color, star shape, highlight positions, rim lighting, translucency, internal shading, material, front-facing orientation, and visual scale as closely as possible. Do not redesign, recolor, sharpen, simplify, add glow, or change the emblem.
Composition/framing: center the complete bubble on a square canvas with modest transparent margin; keep it perfectly circular and uncropped.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the bubble alpha 0; clean anti-aliased edge; one bubble only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, floor shadow, external drop shadow, halo, extra particles, text, watermark, sprite sheet.
```

### 蓝色水滴泡泡

```text
Use case: background-extraction
Asset type: production cutout master for the lake-blue bubble in the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the bubble design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single lake-blue glossy round bubble with its centered cyan water-drop emblem.
Invariants: preserve the outer circle silhouette, proportions, lake-blue color, drop shape, highlight positions, rim lighting, translucency, internal shading, material, front-facing orientation, and visual scale as closely as possible. Do not redesign, recolor, sharpen, simplify, add glow, or change the emblem.
Composition/framing: center the complete bubble on a square canvas with modest transparent margin; keep it perfectly circular and uncropped.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the bubble alpha 0; clean anti-aliased edge; one bubble only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, floor shadow, external drop shadow, halo, extra particles, text, watermark, sprite sheet.
```

### 紫色葡萄泡泡

```text
Use case: background-extraction
Asset type: production cutout master for the grape-purple bubble in the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the bubble design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single grape-purple glossy round bubble with its centered purple grape-cluster emblem.
Invariants: preserve the outer circle silhouette, proportions, grape-purple color, grape shape, highlight positions, rim lighting, translucency, internal shading, material, front-facing orientation, and visual scale as closely as possible. Do not redesign, recolor, sharpen, simplify, add glow, or change the emblem.
Composition/framing: center the complete bubble on a square canvas with modest transparent margin; keep it perfectly circular and uncropped.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the bubble alpha 0; clean anti-aliased edge; one bubble only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, floor shadow, external drop shadow, halo, extra particles, text, watermark, sprite sheet.
```

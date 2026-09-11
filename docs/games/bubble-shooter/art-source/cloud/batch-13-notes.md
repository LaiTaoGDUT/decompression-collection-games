# 云端软糖第十三批素材记录：发射器三层运行时整理

日期：2026-09-11。透明编辑：内置 `image_gen`；确定性 Alpha 提取和运行时缩放：`ffmpeg`。

## 结果

| 层 | 最终母版 | 母版规格 | 运行时文件 | 运行时规格 | 锚点/状态 |
| --- | --- | --- | --- | --- | --- |
| 固定底座 | [launcher-pedestal-extracted-v4.png](launcher-pedestal-extracted-v4.png) | 1536 × 1024 RGBA | `runtime-source/cloud/launcher-pedestal.png` | 384 × 256 RGBA | 约 `(0.5, 0.125)`；可见 Alpha 范围 358 × 194 |
| 可旋转炮台 | [launcher-turret-extracted-v4.png](launcher-turret-extracted-v4.png) | 1145 × 1373 RGBA | `runtime-source/cloud/launcher-turret.png` | 192 × 320 RGBA | 约 `(0.5, 0.10)` 对准珍珠轴心；中心球槽透明 |
| 交换图标 | [swap-icon-transparent-v2.png](swap-icon-transparent-v2.png) | 1254 × 1254 RGBA | `runtime-source/cloud/swap-icon.png` | 96 × 96 RGBA | 中心 `(0.5, 0.5)`；两箭头之间透明 |

内置输出源分别为：

- 固定底座：`/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-d4a7c549-a26a-4e9b-936d-3227401b9ee3.png`
- 可旋转炮台：`/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-57adbeb1-bbf5-4801-83ff-cd1ce2e0a348.png`
- 交换图标：`/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-fcfa17a6-7b06-4da4-9cd3-2924ea77fd16.png`

固定底座和炮台的内置输出仍为 RGB 棋盘格，因此按物体色差、亮度与已知主体范围进行确定性 Alpha 提取，并在浅蓝底上检查边缘；交换图标直接得到真实 Alpha。三张图随后裁去无效画布、保留透明边距并做 Lanczos 降采样。

[运行时分层合成预览](launcher-runtime-composite-review-v1.png) 使用固定底座作后层，红色当前球放在炮台球槽后方，炮台环作前层。预览证明底座不需要与炮台合图，圆环能够自然压住当前球边缘。该预览只检查层级和相对比例，不是运行时整图。

运行时节点建议：

```text
LauncherRoot
├── Pedestal                 # 固定，不随瞄准旋转
├── TurretPivot              # anchor ≈ (0.5, 0.10)
│   ├── CurrentBallSocket    # 随炮台位置旋转
│   │   └── BallVisual       # local angle = -TurretPivot.angle
│   └── TurretSprite         # 位于 BallVisual 前方，圆环压住球边缘
├── NextBall
└── SwapButton
    └── SwapIcon
```

## 完整生成提示词

### 固定底座

```text
Use case: background-extraction
Asset type: fixed launcher-pedestal production cutout for the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the pedestal design.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same single fixed pedestal: the front cluster of soft white-lavender clouds, the intertwined coral-red and pale-yellow candy-cane platform, and the white curved cradle at the top.
Invariants: preserve the full silhouette, proportions, cloud count and overlap, candy stripe directions, top cradle, highlights, pastel colors, material, lighting, and front-facing orientation as closely as possible. This layer remains fixed and must not gain the rotating turret, current bubble, next bubble, swap arrows, aiming dots, or UI.
Composition/framing: centered complete pedestal, generous transparent margin, no crop.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the pedestal alpha 0; clean anti-aliased edge; one fixed pedestal only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, turret ring, pivot arm, bubble, arrows, text, floor shadow, halo, extra clouds, watermark, sprite sheet.
```

### 可旋转炮台

```text
Use case: background-extraction
Asset type: rotatable launcher-turret production cutout for the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the turret design.
Primary request: Remove only the entire gray checkerboard/background from outside the turret and from the large circular bubble socket. Return exactly the same single upright coral-pink and pearl-white turret: rear cap, large circular front ring with a genuinely empty center, tapered lower arm, and complete pearl pivot at the bottom.
Invariants: preserve the silhouette, vertical proportions, socket size, ring thickness, lower-arm taper, bottom pivot, highlight positions, colors, glossy candy material, lighting, and front-facing orientation as closely as possible. Do not insert a bubble into the socket and do not add the fixed cloud pedestal.
Composition/framing: centered full upright turret with transparent margin on all sides; keep the bottom pivot fully visible and uncropped because it defines the rotation origin.
Constraints: genuinely transparent-background RGBA PNG; every pixel outside the turret and throughout the circular socket alpha 0; clean anti-aliased outer and inner edges; one turret only.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, filled socket, bubble, cloud base, candy platform, arrows, aiming line, text, floor shadow, halo, watermark, sprite sheet.
```

### 交换图标

```text
Use case: background-extraction
Asset type: swap-control icon production cutout for the approved cloud-candy bubble shooter
Input image: Image 1 is the edit target and exact authority for the two-arrow icon.
Primary request: Remove only the entire gray checkerboard/background and return exactly the same pair of glossy berry-pink curved swap arrows, one above and one below, forming a clear circular exchange motion.
Invariants: preserve both arrow silhouettes, directions, curvature, separation, relative scale, highlight positions, pink gradient, glossy candy material, lighting, and centered arrangement as closely as possible. Keep the open center and the gap between the two arrows transparent.
Composition/framing: centered complete two-arrow icon on a square canvas with modest transparent margin; no crop.
Constraints: genuinely transparent-background RGBA PNG; all empty space alpha 0; clean anti-aliased edges; exactly two arrows.
Avoid: checkerboard painted into pixels, gray/white/black backdrop, circular button plate, text, third arrow, bubble, rotation trail, floor shadow, halo, watermark, sprite sheet.
```

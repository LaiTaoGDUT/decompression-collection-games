# 云端软糖第十批素材记录：运行时尺寸整理

日期：2026-09-11。处理工具：`ffmpeg` Lanczos 降采样；图片内容仍来自内置 `image_gen` 母版。

用户指出生成图片尺寸过大。本批将“生成母版”和“运行时纹理”明确分离：`art-source` 保留高分辨率原图，不覆盖、不丢失；`runtime-source` 保存裁切与缩放后的候选。这样既保留后续修边能力，也避免把 1254 × 1254 的箭头、角标和粒子直接装入微信小游戏。

## 处理结果

| 母版 | 母版尺寸 | 运行时文件 | 运行时尺寸 | 文件体积 |
| --- | ---: | --- | ---: | ---: |
| `background-tall-v2.png` | 809 × 1942 RGB | `runtime-source/cloud/background.png` | 750 × 1800 RGB | 约 1.1 MB |
| `attack-energy-heart-v1.png` | 1254 × 1254 RGBA | `runtime-source/cloud/attack-energy-heart.png` | 96 × 96 RGBA | 约 20 KB |
| `attack-candy-shards-v1.png` | 1298 × 1212 RGBA | `runtime-source/cloud/attack-candy-shards.png` | 256 × 256 RGBA | 约 64 KB |
| `boss-pudding-fist-left-v2.png` | 1536 × 1024 RGBA | `runtime-source/cloud/boss-pudding-fist-left.png` | 384 × 320 RGBA | 约 156 KB |
| `hud-down-arrow-v1.png` | 1254 × 1254 RGBA | `runtime-source/cloud/hud-down-arrow.png` | 128 × 128 RGBA | 约 16 KB |
| `hud-frosting-skill-v1.png` | 1254 × 1254 RGBA | `runtime-source/cloud/hud-frosting-skill.png` | 160 × 176 RGBA | 约 40 KB |
| `item-button-base-v1.png` | 1312 × 1199 RGBA | `runtime-source/cloud/item-button-base.png` | 320 × 288 RGBA | 约 92 KB |
| `item-count-badge-v1.png` | 1254 × 1254 RGBA | `runtime-source/cloud/item-count-badge.png` | 96 × 96 RGBA | 约 12 KB |

七张透明素材先按有效 Alpha 边界检测轮廓，再增加安全边距、保持比例缩放并放入固定透明画布。背景比例与批准的 750 × 1800 设计比例几乎一致，因此直接高质量归一。所有输出均已重新检查像素尺寸和 Alpha 类型，并目视确认没有拉伸或裁掉主体。

未在本批处理的素材多数仍是 RGB 棋盘格原图。它们必须先得到真实 Alpha，再按 [运行时素材规范](../../runtime-source/README.md) 的目标画布缩放；不能把棋盘格连同主体一起缩小。

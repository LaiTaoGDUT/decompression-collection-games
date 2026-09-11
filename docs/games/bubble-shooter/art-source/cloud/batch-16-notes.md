# 第十六批：宽体布丁王四层透明与尺寸处理

日期：2026-09-11。

本批完成已确认云端软糖 Boss 的身体、左拳、右拳和皇冠四层。目标是保持第七、八批冻结的宽体、大脸、双圆拳造型，同时消除生成图中的假棋盘格与左拳外发光，并直接输出适合 750 × 1334 设计基准的运行时尺寸。没有新增 Boss 造型或页面设计。

## 输出

| 层 | 最终透明母版 | 运行时文件 | 纹理尺寸 | 建议显示与锚点 |
| --- | --- | --- | ---: | --- |
| 身体 | [boss-pudding-body-extracted-v11.png](boss-pudding-body-extracted-v11.png) | [boss-pudding-body.png](../../runtime-source/cloud/boss-pudding-body.png) | 1024 × 512 RGBA | 显示宽度不超过约 720；锚点约 `(0.5, 0.06)`，靠近底部支撑线 |
| 左拳（画面左侧） | [boss-pudding-fist-left-extracted-v7.png](boss-pudding-fist-left-extracted-v7.png) | [boss-pudding-fist-left.png](../../runtime-source/cloud/boss-pudding-fist-left.png) | 384 × 320 RGBA | 显示不超过约 240 × 200；连接端锚点约 `(0.90, 0.52)` |
| 右拳（画面右侧） | [boss-pudding-fist-right-extracted-v7.png](boss-pudding-fist-right-extracted-v7.png) | [boss-pudding-fist-right.png](../../runtime-source/cloud/boss-pudding-fist-right.png) | 384 × 320 RGBA | 显示不超过约 240 × 200；连接端锚点约 `(0.10, 0.52)` |
| 皇冠 | [boss-pudding-crown-extracted-v5.png](boss-pudding-crown-extracted-v5.png) | [boss-pudding-crown.png](../../runtime-source/cloud/boss-pudding-crown.png) | 320 × 256 RGBA | 显示不超过约 180 × 144；底部中心锚点约 `(0.5, 0.08)` |

[运行时分层组合检查](boss-pudding-runtime-composite-review-v3.png) 将四层与现有背景、Boss 血条重新组合在 750 像素宽的检查画布中。结果保留完整皇冠、宽体和圆拳轮廓，四层没有棋盘格残留或明显边缘辉光。该图只验证拆层质量、遮挡关系与相对尺寸，不替代用户已经确认的 Boss 整屏主参考，也不锁定最终 Cocos 坐标或血量。

## 生图来源

内置生图尝试只用于取得更易分离背景的来源，四次输出依然是 RGB 假棋盘格，因此不能直接作为运行时素材。

| 层 | 生图暂存 | image_gen 输出 | 原始属性 |
| --- | --- | --- | --- |
| 身体 | [boss-pudding-body-transparency-attempt-v2.png](boss-pudding-body-transparency-attempt-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-488a7d87-5263-4c56-b019-4d5ea503aa43.png` | 1774 × 887 RGB，棋盘格写入像素 |
| 左拳 | [boss-pudding-fist-left-no-glow-attempt-v3.png](boss-pudding-fist-left-no-glow-attempt-v3.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-9bc0ae8f-3e91-43e1-a796-558260649ef6.png` | 1536 × 1024 RGB，棋盘格写入像素 |
| 右拳 | [boss-pudding-fist-right-transparency-attempt-v3.png](boss-pudding-fist-right-transparency-attempt-v3.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-44b2f8f8-d86d-44cf-aa7b-9ae7d386c0e7.png` | 1391 × 1131 RGB，棋盘格写入像素 |
| 皇冠 | [boss-pudding-crown-transparency-attempt-v2.png](boss-pudding-crown-transparency-attempt-v2.png) | `/Users/laitao/.codex-a/generated_images/01a08e6d-334e-7742-92f7-99f18cc0d89c/exec-8754c365-d593-4801-91f2-62a99d4699ad.png` | 1536 × 1024 RGB，棋盘格写入像素 |

## 透明提取与验收

- 身体的奶油糖霜与棋盘格灰色接近，单纯色差阈值会在糖霜内部打洞。本批先取得彩色主体候选，再用闭运算连接浅色糖霜边界，保留最大连通主体并填充被包围的内部区域，最后仅对外轮廓做轻微抗锯齿。
- 双拳和皇冠从画布边缘识别连通的低饱和棋盘格背景，只删除与边缘连通的背景区域；角色内部的白色高光、奶油反光和皇冠珠光保持不透明。
- 左拳重新从无辉光来源提取，替换第十批的旧暂存图。左右拳使用不同源图，光照和连接端方向均保留，不能运行时机械镜像。
- 四张运行时图按有效 Alpha 边界裁切后等比放入目标画布。降采样前预乘 Alpha，Lanczos 缩放后恢复直通 Alpha，避免透明像素中的棋盘格颜色污染边缘。
- 四张图均为 RGBA，四角 Alpha 为 0；有效边界分别是身体 `(8, 26, 1016, 486)`、左拳 `(8, 19, 376, 301)`、右拳 `(8, 21, 376, 299)`、皇冠 `(8, 39, 312, 216)`，保留了抗锯齿和透明安全边距。
- 身体承担默认表情、呼吸和整体受击形变；双拳分别承担蓄力、出拳和回弹；皇冠只做小幅滞后摆动。当前无需再拆眼睛和嘴部。

## 分层顺序

建议从后到前使用：背景场景 → 身体 → 皇冠 → 双拳 → Boss 血条。皇冠的节点可以挂在身体跟随节点上，但保留自己的旋转补间；双拳不要烘焙回身体。组合检查中的血条只验证上层遮挡，不代表最终布局数值。

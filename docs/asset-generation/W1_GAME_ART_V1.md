# W1 游戏美术生成与后处理记录 V1

> 日期：2026-08-09  
> 视觉所有者：合成大西瓜（W1 纸片折纸果摊）  
> Bundle：`game-watermelon`  
> 状态：可导入

## 1. 来源与许可

素材为 Codex 在项目内原创生成，不读取、采样、描摹或拼接外部图片，不基于其他合成水果游戏。实际交付源由 `tools/watermelon/generate-paper-assets.js` 使用 SVG 几何和 Sharp 光栅化生成，可在项目中使用、修改和分发；无第三方素材署名要求。

ImageGen 按冻结规范共请求三次，均在生成服务网络层返回 `network error: error sending request ... /images/generations`，没有产生图像文件。为保持步骤连续且不冒充生成成功，本版采用可复现程序化原创回退；失败请求不进入运行包。

## 2. 冻结 ImageGen 提示

### 水果套图

```text
Create one original production sprite sheet for a 2D mobile fruit merge game, W1 "summer cut-paper origami fruit stand" visual direction. Exactly eleven separate fruit sprites arranged left-to-right, top-to-bottom in a clean 4 columns x 3 rows grid, with the final bottom-right cell empty. Order: cherry, strawberry, grape cluster, dekopon mandarin, orange, apple, pear, peach, pineapple, pale green netted melon, striped watermelon. Each fruit centered entirely inside its own equal cell with generous margin and no overlap, labels, numbers, borders or faces. Layered cut paper and gentle origami folds, 3 to 5 flat folded planes, subtle paper fibers, restrained dark-brown crease lines, upper-left lighting and lower-right paper shadow. Collision-friendly silhouette, recognizable at 48 px. No plastic, clay, photorealism, sharp protrusions, text, UI or copied game art.
```

### 游戏背景

```text
Create an original vertical mobile game background for a fruit merge game, W1 summer cut-paper origami fruit stand direction, portrait 750:1334. Pale mint paper air, warm cream play area, subtle folded awning and restrained leaf shadows only around outer edges. Quiet low-contrast central play area, safe HUD and bottom instruction space. No fruit objects, confusing circles, text, logo, UI, characters, photorealism, plastic or lobby/gallery language.
```

## 3. 实际生成参数

- 脚本：`tools/watermelon/generate-paper-assets.js`
- 栅格器：Sharp（工作区内置依赖）
- 随机源：无；所有 SVG 路径、色值、折面和纸纹参数固定，输出确定。
- 原始源：`art_sources/watermelon/w1-paper-v1/*.svg`
- 水果母版：每级独立 SVG；深棕轮廓、左右明暗折面、纸纤维、统一右下投影。
- 后处理：透明边界裁切 → 等比缩放到 488px 最大边 → 居中补透明画布至 512×512 → PNG compression level 9。
- 背景：750×1334 SVG → JPEG quality 88、progressive；中央不含水果或高对比圆形。

## 4. 导出与接线

- 11 级水果：`assets/games/watermelon/visual/fruits/fruit-00...10-*-w1-v1.png`
- 游戏背景：`assets/games/watermelon/visual/backgrounds/w1-paper-fruit-stand-bg-v1.jpg`
- 水果总大小：1,143,177 bytes；背景：29,243 bytes。
- `FruitCatalog.sprite` 为每级提供 SpriteFrame 路径；场上实体与当前/下一个预览消费同一文件。
- Sprite 显示尺寸为碰撞直径的 1.04 倍，用于容纳不超过约 6% 的纸叶/果梗；主体圆形仍以配置半径作为碰撞和危险线计算依据。
- 背景按 750:1334 等比 cover，不做非等比拉伸；容器、纸签、边界和警戒线继续由 W1 Graphics 绘制。

## 5. 验证

- 11 个文件均为 512×512 透明 PNG，48px 降采样后均有安全 Alpha 覆盖。
- 11 个平均色彩签名全部不同；目视接触表确认樱桃/草莓/葡萄/两类柑橘/苹果/梨/桃/菠萝/甜瓜/西瓜轮廓与纹理可区分。
- Creator 资源库抽查樱桃、西瓜和背景均为 `cc.ImageAsset`。
- `tools/watermelon/verify-paper-assets.js` 可复现尺寸、透明度、差异和包体检查。

验证输出：`fruits=11, dimensions=512x512, alpha=passed, color_signatures=11, fruit_bytes=1143177, background=750x1334/29243B`。

# 合成大西瓜独立视觉规范：W1 纸片折纸果摊

> 状态：已冻结
>
> 版本：1.0
>
> 生效日期：2026-08-09
>
> 上位框架：[VISUAL_STYLE_GUIDE.md](./VISUAL_STYLE_GUIDE.md)

## 1. 设计概念

合成大西瓜进入一个完全独立的“夏日纸片果摊”世界：水果由多层彩纸切片和折纸折面构成，表面有克制折痕与纸张纤维，合成像两张纸片折叠重组为更大的水果。

关键词：纸片分层、折纸折面、夏日果摊、鲜活、多汁、清晰轮廓、手工触感。

禁止：大厅展馆风、写实水果、玻璃果冻、软陶 3D、蜡笔涂鸦、过度尖锐折纸、复杂写实木纹、复制现有合成水果游戏的造型或表情。

## 2. 独立色板

| 令牌 | 色值 | 用途 |
| --- | --- | --- |
| `wm.bg.sky` | `#C9E8D5` | 游戏背景上部、清凉空气感 |
| `wm.bg.cream` | `#FFF2D6` | 游戏背景与纸面 |
| `wm.paper.kraft` | `#D89A58` | 果摊纸箱、容器外层 |
| `wm.paper.light` | `#FFE2A8` | HUD 标签、浅折面 |
| `wm.ink` | `#4B2B20` | 文字、轮廓、折痕 |
| `wm.ink.deep` | `#3D2118` | 主文字和按钮文字 |
| `wm.primary` | `#F28B66` | 主操作、热情纸片 |
| `wm.primary.fold` | `#D96243` | 主操作暗折面 |
| `wm.leaf` | `#287A4E` | 继续、成功、叶片 |
| `wm.leaf.light` | `#63B879` | 浅绿色折面 |
| `wm.sun` | `#F9C74F` | 新纪录、连锁、阳光高光 |
| `wm.danger` | `#B82E3E` | 危险线、失败、破坏动作 |
| `wm.disabled` | `#C7B8A5` | 禁用纸片 |
| `wm.overlay` | `rgba(61,33,24,0.58)` | 游戏模态遮罩 |

深棕文字 `#4B2B20` 在奶油纸 `#FFF2D6` 上约 11.36:1，在阳光黄 `#F9C74F` 上约 7.99:1；白字在危险红上约 6:1、在叶绿上约 5.27:1。

水果自身使用独立固有色和 3～5 个纸张明暗折面，不强制套 UI 色板，但轮廓深度、折痕透明度和纸边厚度保持一致。

## 3. 字体与数字

首发仍使用平台系统中文字体，但通过不规则纸签、轻微旋转的数字卡和强弱分层形成游戏气质，不复用大厅的编辑式排版。

| 令牌 | 字号/行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| `wm.type.score` | 42 / 48 | 700 | 当前分数 |
| `wm.type.h1` | 40 / 50 | 700 | 暂停、失败、结算标题 |
| `wm.type.h2` | 31 / 40 | 600 | 最高分、下一个水果 |
| `wm.type.button` | 28 / 36 | 700 | 游戏内操作 |
| `wm.type.body` | 24 / 34 | 400/500 | 说明、广告结果 |
| `wm.type.meta` | 19 / 26 | 500 | 连锁、危险提示、辅助信息 |

- 分数显示在折角纸签上，数字容器固定宽度。
- 文字不得模拟难以辨认的手写体；纸片感由容器和排版建立。
- 新纪录可以使用阳光黄纸带和一次性展开动效，不持续闪烁。

## 4. 纸片与折纸造型规则

### 基础材质

- 每个元素由 2～5 层平面纸片组成，主层保持清晰完整轮廓。
- 折面使用相邻明暗色块，不用连续 3D 渐变塑造成塑料质感。
- 折痕为 2～3 像素、深棕 12%～24% 透明度；不能像裂纹或网格。
- 纸边可用 2～4 像素浅边与柔和内阴影表达厚度。
- 外投影方向统一为右下，模拟左上夏日光源；粒子和 UI 也遵循同一光向。

### 水果轮廓

- 水果物理主体保持近圆或符合目录定义的稳定轮廓；折纸尖角不得明显超出碰撞圆。
- 叶片、果蒂和纸角装饰的外伸不超过视觉直径约 6%，且不得造成可落脚或可碰撞的错觉。
- 每级水果至少有三项可区分特征：主色、整体轮廓、切片/纹理、叶片或折面方向。
- 小尺寸预览、当前水果和场上实体使用同一母版，不能出现不同造型。
- 全部 11 级水果必须保持清晰圆形边界：投放预览、“下一个”预览与场上实体统一叠加一深一浅双层圆环，圆环与物理半径一致；10 级大西瓜源 PNG 另保留深色圆形外框，任何缩放下都不能退化为无边界色块。
- 不使用统一表情脸；辨识度来自水果本身和纸片结构，避免低龄化。

### 11 级方向

| 等级 | 水果 | 折纸/纸片识别重点 |
| ---: | --- | --- |
| 0 | 樱桃 | 双圆红纸片、细折纸果梗 |
| 1 | 草莓 | 心形圆角轮廓、籽点冲孔、绿色折冠 |
| 2 | 葡萄 | 多个重叠圆纸片组成紧凑团簇，整体碰撞轮廓仍清晰 |
| 3 | 橘子 | 扁圆橙纸、顶部小叶、放射折痕 |
| 4 | 橙子 | 更饱满圆形、橙皮点纹、交叉折面，与橘子明显区分 |
| 5 | 苹果 | 双肩轮廓、深红折面、单叶果梗 |
| 6 | 梨 | 上窄下宽纸片轮廓、黄绿双色折面 |
| 7 | 桃子 | 桃心沟折痕、粉橙叠纸、单叶 |
| 8 | 菠萝 | 圆角椭圆主体、菱格折纸纹、紧凑叶冠 |
| 9 | 甜瓜 | 淡绿圆纸、克制网纹、宽幅折面 |
| 10 | 西瓜 | 深浅绿纸带、最大圆形、完整层叠瓜纹 |

## 5. 游戏背景与容器

- 背景像夏日果摊的抽象纸艺舞台：浅绿空气、奶油纸面、顶部极轻遮阳棚或叶影。
- 主玩法区域保持低对比，不能出现与水果相同大小的装饰圆形。
- 容器使用折叠牛皮纸箱/纸托盘意象；左右墙和底边厚度必须与真实碰撞边界一致。
- 危险线表现为一条红色折纸警示带，正常时低对比；连续危险计时中逐渐展开并变深，不高频闪烁。
- 视觉背景、HUD 和玩法容器全部在 `game-watermelon` Bundle，不引用大厅柔光展馆资源。

## 6. HUD、按钮与弹窗

### HUD

- 当前分数、最高分和下一个水果分别放在不同形状的折角纸签上，层级清楚但不遮挡容器。
- 暂停按钮为独立折纸标签，图标使用两片竖直纸条，不复用大厅线性图标。
- HUD 阴影和折角不改变点击区域；所有按钮触摸区不小于 88 × 88。

### 按钮

- 主按钮：珊瑚纸片 + 右下暗折面 + 深棕文字；按下时折面收窄、整体压低 3。
- 继续按钮：叶绿纸片 + 白字，广告图标与文案同时出现。
- 危险按钮：深红纸片 + 白字，重开确认不与继续同权重。
- 禁用按钮：灰褐纸片，折面和投影减少，不响应纸张弹动。
- 等待按钮：保持原纸片尺寸，显示轻量纸片翻页/三角折动，不显示虚假进度。

### 弹窗

- 暂停、失败、续玩和结算采用 2～3 层错位纸张面板，四角可以有不同折角，但正文区域必须平整。
- 弹窗不使用大厅的白色展签卡、石墨按钮或极简线性图标。
- 错误和广告失败使用可读纸条提示，不用自动消失 Toast 代替恢复操作。

## 7. 动效语言

| 令牌 | 时长 | 用途 |
| --- | ---: | --- |
| `wm.motion.press` | 80 ms | 纸片按钮压下 |
| `wm.motion.drop` | 140 ms | 投放预览释放 |
| `wm.motion.merge` | 260～360 ms | 两张纸折叠重组成下一级 |
| `wm.motion.panel` | 220 ms | 纸张面板展开/收起 |
| `wm.motion.milestone` | 360 ms | 新水果/新纪录一次性展开 |

- 合成：两个输入水果先轻压扁为纸片，沿中心折叠收拢，再展开为下一等级；结果生成和计分仍以玩法事件为准。
- 连锁：纸屑、三角折片和分数纸签向上弹出，低档设备只保留缩放与分数。
- 失败：危险带完全展开，场景纸片轻微定格，不使用强烈镜头震动。
- 续玩：越线水果像被收走的纸卡片向上折起并淡出，不播放消除得分效果。
- 所有 Tween/粒子在暂停、退出和重开时可取消并释放。

## 8. 声音方向

- 投放：纸团落在纸盒上的柔和“扑”声。
- 碰撞：短促纸板轻碰，按频率节流。
- 合成：折纸摩擦 + 清脆小木片/果汁气泡点缀。
- 连锁：逐级上扬但时长受控的纸片翻折音。
- 危险：低频纸张拉紧与短提示，不使用尖锐警报。
- 失败：纸箱合拢的低沉声。
- 续玩：纸张展开与清爽叶片声。
- 不复用大厅的展馆轻点、导视滑动和空间提示音。
- 第 23 步由 Codex 使用项目内可复现程序化脚本原创生成游戏循环音乐与全部反馈音效；纸张、纸箱和折纸重组声音均从合成参数生成，不采集或拼接外部素材。

## 9. Cocos 与资源路由

- 水果：透明 PNG 以 Texture2D 子资源加载，运行时创建并持有 SpriteFrame；场上实体与预览消费同一帧。退出时先解除 Sprite 引用并移出场上实体，在当帧 `EVENT_AFTER_DRAW` 后再统一销毁运行时帧，避免渲染提交访问已释放纹理。
- 折面和纸纹：尽量烘焙到 Sprite，避免每个水果实时材质。
- 容器/面板：九宫格、Graphics 和少量主题纹理组合。
- 折痕：Sprite 内烘焙或简单 Graphics 线条，不使用昂贵 shader。
- 游戏 HUD、暂停、失败、续玩、结算和图标 Prefab 全部位于 `assets/games/watermelon/visual/`。
- 公共 Presenter 只提供动作，正式节点由游戏主题承载；现有共享视图仅作为开发回退。

## 10. ImageGen 提示模板

### `W1-FRUIT-SET-V1`

```text
An original coherent set of eleven 2D mobile game fruit sprites made from layered cut paper and gentle origami folds: cherry, strawberry, grape, dekopon, orange, apple, pear, peach, pineapple, melon, watermelon. Each fruit has a clear mostly round collision-friendly silhouette, 3 to 5 flat folded color planes, subtle paper fibers, restrained crease lines, consistent upper-left lighting and soft lower-right paper shadow, no faces, no text, no plastic gloss, no photorealism, no sharp protruding origami points, transparent background, highly distinguishable at small size, original design not based on any existing fruit merge game.
```

### `W1-GAME-BG-V1`

```text
Vertical mobile fruit merge game background as an original summer paper-craft fruit stand, pale mint air and warm cream paper, subtle folded awning and leaf shadows around the outer edges, quiet clean central play area, layered cut-paper construction, gentle origami folds, no fruit objects in the central board, no text, no UI, no characters, no photorealism, portrait 750:1334, safe crop composition.
```

### `W1-COVER-V1`

```text
Mobile game card cover for an original fruit merging game in layered cut-paper and gentle origami style, a balanced stack of distinct folded-paper fruits leading to a large watermelon, summer fruit stand atmosphere, bold readable silhouettes, consistent upper-left light, warm cream and fresh green background, no text, no logo, no UI, no border, no resemblance to existing game artwork, clear at small card size.
```

实际生成必须保存完整提示词、模型/工具、原始输出、选图原因、抠图、色彩、尺寸和压缩记录。

## 11. 验收

- 11 级水果在小尺寸下凭轮廓、主色与纸片结构可区分。
- 折纸尖角、叶片和果蒂不明显误导碰撞边界。
- 游戏 HUD、按钮、弹窗、图标、动效和音效均为 W1 独立主题，不复用大厅 L1 皮肤。
- 纸片合成动效不改变物理、计分和结果生成时序。
- 全部正式资源位于 `game-watermelon` Bundle；大厅仅保留独立生成的封面展示副本。
- 低档设备关闭非必要纸屑和复杂投影后，核心轮廓与操作反馈仍完整。

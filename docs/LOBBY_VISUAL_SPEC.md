# 大厅独立视觉规范：L1 柔光收藏馆

> 状态：已冻结
>
> 版本：1.0
>
> 生效日期：2026-08-09
>
> 上位框架：[VISUAL_STYLE_GUIDE.md](./VISUAL_STYLE_GUIDE.md)

## 1. 设计概念

大厅是一间安静、现代、带柔和自然光的小游戏收藏馆。它负责陈列不同世界，而不是表现任何具体游戏主题。游戏封面像独立展品，卡片外框像克制的展签和收藏盒。

关键词：中性、清爽、留白、现代展陈、柔光、可扩展。

禁止：水果装饰、游戏角色、纸片折纸、糖果色堆叠、霓虹、厚重拟物、玩具化按钮、主推射灯和跨列重点展品。

## 2. 独立色板

| 令牌 | 色值 | 用途 |
| --- | --- | --- |
| `lobby.bg` | `#F1EEE8` | 全屏展馆背景 |
| `lobby.bg.light` | `#FAF8F4` | 柔光区域 |
| `lobby.surface` | `#FFFFFF` | 卡片与设置面板 |
| `lobby.surface.muted` | `#E8E4DC` | 敬请期待卡、禁用区域 |
| `lobby.text.primary` | `#242320` | 标题、卡名、按钮文字 |
| `lobby.text.secondary` | `#6A6660` | 简介、成绩、版本 |
| `lobby.border` | `#D9D3C9` | 卡片、面板细边框 |
| `lobby.divider` | `#E8E3DB` | 展签分隔线 |
| `lobby.action` | `#393733` | 进入按钮、选中状态 |
| `lobby.action.pressed` | `#1F1E1B` | 按下态 |
| `lobby.accent` | `#A9854D` | 极少量展签编号与品牌点缀 |
| `lobby.sage` | `#718375` | 成功、开关开启 |
| `lobby.error` | `#9A433A` | 错误与失败 |
| `lobby.overlay` | `rgba(32,31,29,0.52)` | 模态遮罩 |
| `lobby.disabled` | `#C9C4BB` | 禁用控件 |

正文组合 `#242320 / #F7F4EE` 约 14.32:1，白字在 `#393733` 上约 11.88:1。正式导入后继续以实际 Sprite 和透明度复测。

## 3. 字体层级

首发使用平台系统现代无衬线字体，不嵌入字体文件。视觉气质依靠充足留白、适中粗细和编辑式对齐建立。

| 令牌 | 字号/行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| `lobby.type.brand` | 50 / 62 | 600 | “解压小游戏” |
| `lobby.type.h1` | 38 / 48 | 600 | 设置、错误标题 |
| `lobby.type.card` | 30 / 38 | 600 | 游戏名称 |
| `lobby.type.button` | 26 / 34 | 600 | 卡内进入操作 |
| `lobby.type.body` | 23 / 32 | 400 | 游戏简介、错误说明 |
| `lobby.type.meta` | 19 / 26 | 400/500 | 成绩、版本、展签信息 |

- 不使用手写体、描边字和立体字。
- 产品标题最多一行；副标题最多一行；卡片简介最多两行。
- 数字成绩使用固定宽度容器，避免刷新时卡片跳动。

## 4. 形状、材质与层次

- 页面外边距 40，双列间距 24，基础间距单位 8。
- 游戏卡采用“展品档案卡”装帧：圆角 24、边框 3、左侧 10px 馆藏分类色条；设置面板圆角 24，主按钮圆角 16。
- 真实游戏卡使用暖奶油展纸，未来展品卡使用低饱和鼠尾草绿；底部信息区叠加半透明白纸层，但不得带入水果纹理。
- 每张卡允许一个大厅 L1 自有的右上档案折角和类型展签；它表达馆藏装帧，不复用 W1 水果折痕、果叶或游戏容器。
- 阴影使用 `rgba(58,48,38,0.14)`、Y=-10，建立与背景的清晰前后层；低档设备可降低透明度。
- 卡片按下缩放 0.965、时长 120ms；封面可做 1.0～1.025 的缓慢呼吸，不旋转、不改变网格位置。
- 敬请期待卡与标准卡同尺寸，使用叠放空展卡和加号表达，不显示进入按钮且不可交互。

## 5. 控件与图标

### 游戏卡

- 封面是卡片内唯一允许展示游戏独立视觉的区域。
- 外框、名称、简介、最高分和进入按钮均为大厅 L1 视觉。
- 所有真实游戏卡权重一致；合成大西瓜不获得额外描边、光效或尺寸。

### 按钮

- 主进入按钮：深叶绿背景、白字、轻量顶部纸面高光；按下缩放反馈。
- 次按钮：白底、石墨细边框、深色文字。
- 禁用：暖灰底、次级文字，无阴影。
- 等待：保持按钮宽度，使用三点或细环进度，不显示虚假百分比。

### 图标

- 使用 48×48 极简线性图标，描边 3、圆头，几何对称。
- 设置、关闭、音乐、音效和振动图标全部由大厅独立自绘，放在 `lobby` Bundle。
- 不复用合成大西瓜的折纸图标。

## 6. 品牌区与背景

- 背景表现抽象收藏馆空间：象牙白墙面、柔和顶光、轻微层板或展框暗示。
- 中部游戏网格区域保持安静，不能有穿过卡片文字的高对比线条。
- 品牌区可以使用极简馆藏编号、细线或一个抽象拱形空间符号，不使用水果叶片。
- 标题“解压小游戏”位于安全区内，副标题“随时来一局，轻松一下”弱化呈现。
- 设置入口像展馆导视按钮，不与任一游戏主题绑定。

## 7. 动效与声音方向

| 令牌 | 时长 | 用途 |
| --- | ---: | --- |
| `lobby.motion.press` | 90 ms | 卡片/按钮按下 |
| `lobby.motion.fast` | 160 ms | 状态与开关 |
| `lobby.motion.panel` | 240 ms | 设置、错误面板 |
| `lobby.motion.enter` | 280 ms | 卡片确认到加载接管 |

- 缓动以克制 ease-out 为主，不使用弹簧。
- 卡片进入等待时封面不放大，只显示状态与轻量遮罩。
- 大厅 UI 声音为柔和木质轻点、纸面滑动和低音量空间提示，不复用游戏内纸张折叠、碰撞或水果音效。
- 第 23 步由 Codex 使用项目内可复现程序化脚本原创生成大厅循环音乐与全部 UI 音效，不依赖外部音频平台或用户供稿。

## 8. Cocos 与资源路由

- 背景：小尺寸生成纹理/Sprite + 独立柔光层，避免实时模糊。
- 卡片：大厅专属九宫格 + `Button` + `Label` + 状态脚本。
- 图标：大厅专属 `Graphics` 或 SpriteFrame。
- 设置、错误、加载：大厅专属 Prefab/皮肤，行为继续调用公共服务。
- 所有正式大厅资源位于 `assets/lobby/visual/` 和 `lobby` Bundle。
- 游戏封面文件位于大厅 Bundle，但按对应小游戏主题生成并在台账标记为展示副本。

## 9. ImageGen 提示模板

### `L1-LOBBY-BG-V1`

```text
Vertical mobile game collection lobby background designed as a quiet contemporary gallery, soft ivory and warm gray architectural space, diffused skylight, subtle display rails and abstract empty frames near the outer edges, calm editorial composition, clean central area for a two-column grid of game cards, sophisticated and relaxing, minimal depth, no fruit, no characters, no text, no logos, no UI buttons, no game imagery, portrait 750:1334, important details inside a safe central crop, original design.
```

### `L1-LOBBY-DETAIL-V1`

```text
Minimal modular gallery details for a mobile game collection lobby: subtle exhibit label, abstract arch symbol, thin display rail, small brass and sage accents, warm ivory background, contemporary editorial design, no text, no fruit, no characters, transparent or clean isolated background, original design.
```

## 10. 验收

- 大厅不包含水果、折纸或任一游戏主题装饰。
- 卡片外框同尺寸同权重，敬请期待卡明确不可交互。
- 背景在常见长短屏不拉伸，中央信息区无高对比干扰。
- 所有大厅按钮、图标、设置、加载和错误呈现来自 `lobby` Bundle。
- 大厅资源无游戏 Bundle 依赖，退出游戏后能完整恢复该主题。

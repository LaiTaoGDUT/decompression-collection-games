# 猫咪合成游戏萌系素材焕新规范

## 当前状态

- UI 已从纸张/折角语言切换为软萌绘本贴纸方向。
- 猫咪、游戏背景和大厅封面暂未替换；本轮图片生成服务不可用，因此继续沿用现有运行素材。
- 当前实际加载的猫咪游戏专属位图为 `35` 张：33 张猫咪运行帧、1 张游戏背景、1 张大厅卡片封面。
- 发布完整性另需补 1 张独立入口图标。清单因此按 `36` 张最终视觉资产管理，其中 35 张替换现有文件，1 张为新增并需要接线。
- 后续生成图片时不要制作 11 只猫或多等级大图。固定使用“每次 1 只猫、1 帧”的最小任务单元，再写入现有文件名。
- 玩法、物理、计分、合成等级和输入逻辑均不因素材焕新而改变。

## 全部视觉素材总清单

| 批次 | 素材 | 数量 | 最终规格 | 当前状态 | 生成/处理方式 |
|---|---|---:|---|---|---|
| A | 11 级猫咪待机 A | 11 | 256×256 RGBA PNG | 待重绘 | 每次只生成 1 只、1 帧，作为身份母版 |
| B | 11 级猫咪待机 B | 11 | 256×256 RGBA PNG | 待重绘 | 以对应待机 A 为参考，只做极小眨眼/呼吸变化 |
| C | 11 级猫咪下落帧 | 11 | 256×256 RGBA PNG | 待重绘 | 以对应待机 A 为参考，生成单帧轻失重动作 |
| D | 游戏内猫咪房间背景 | 1 | 750×1334 RGB JPG | 待重绘 | 独立竖图请求，中央和 HUD 区域保持安静 |
| E | 大厅猫咪游戏卡片封面 | 1 | 920×690 RGB JPG | 待重绘 | 独立横图请求，使用已锁定的角色身份参考 |
| F | 猫咪游戏入口图标 | 1 | 512×512 RGBA PNG | 当前缺失，待新增和接线 | 单独生成大胖橘头像图标，不从封面机械裁切 |
| — | **最终视觉素材合计** | **36** | 33 PNG + 2 JPG + 1 PNG | 待后续生成 | 不制作包含多类素材的超大综合图 |

### 生产顺序

1. 先完成 11 张待机 A，锁定全部角色身份和统一画风。
2. 再逐只生成待机 B 和下落帧，共补齐 33 张猫咪运行帧。
3. 用已经验收的角色帧作为身份参考，分别生成大厅卡片封面和入口图标。
4. 最后生成游戏背景；背景只负责营造场景，不得与 UI 或猫咪圆形碰撞物争夺视觉注意力。
5. 写入运行目录、保留或创建 `.meta`，更新入口图标配置，完成构建与真机验收。

### 不需要额外生成图片的 UI

下列元素已由 Cocos `Graphics`、`Label` 和现有猫咪帧实时绘制，不应再生产位图，否则会增加包体并造成多套风格：

- 游戏标题软垫、版本副标题、分数/最高分/下一只信息胶囊。
- 暂停按钮图标、暂停/结算/续玩弹层、所有操作按钮。
- 游戏容器底板和边框、危险线、投放虚线、底部操作提示。
- 合成分数文字、爪印粒子、连锁与新纪录反馈。
- “下一只”和当前投放预览：直接复用猫咪待机 A，不新增缩略图文件。

实现位置：`WatermelonUiTheme.ts`、`WatermelonLayout.ts`、`WatermelonOverlayView.ts`、`WatermelonGame.ts`。

### 不属于猫咪游戏专属焕新的素材

- 大厅总背景 `lobby-arcade-warm-rays-v3.png` 和大厅中文品牌图 `lobby-cn-title-logo-v3.png` 属于整个游戏合集，不纳入猫咪游戏的 36 张清单。
- 猫咪游戏音频不属于本轮“UI 和图片”范围；现有音乐/音效继续复用。其文件名仍保留历史 `paper`/`fold` 命名，但这不会在画面中暴露折纸风格。

## 视觉方向

主题为“猫咪合合屋”：温暖、柔软、安静的萌系 2D 绘本贴纸，而不是写实宠物照片或 3D 玩具。

- 画材语言：干净的手绘色块、轻微水粉与彩铅纹理、短绒毛提示、柔和高光、清晰轮廓。
- 角色比例：圆润但保留耳朵、尾巴、爪子等非圆形轮廓；眼睛自然偏小，不使用夸张巨眼模板。
- UI 关系：猫咪圆底色与 HUD 的杏桃、薄荷、奶油、天蓝、薰衣草色形成同一套柔和色板。
- 辨识策略：毛色、脸部花纹、耳形、尾巴、姿势和一件小配饰共同区分等级；不能只靠更换圆底色。
- 禁止项：折纸、纸张折角、剪纸分层、纸纤维折痕、多边形切面、写实摄影、3D 渲染、塑料/黏土玩具、霓虹、玻璃高光、巨大动漫眼睛、文字和水印。

## 运行帧技术规范

- 共 11 个等级，每级 3 张 PNG：待机 A、待机 B、下落。
- 单张尺寸：`256 × 256`，RGBA、sRGB。
- 可见正圆直径：`252px`，四周固定 `2px` 透明滤波安全区。
- 正圆内部必须完整填充该等级的底色；猫咪内部轮廓可以不为圆形，但不得越出正圆。
- 同一只猫三帧的圆心、圆直径、底色、角色比例、光向和 Alpha 圆必须完全一致。
- 待机 A：稳定锚点姿势、睁眼。
- 待机 B：只允许眨眼、呼吸起伏、耳尖或尾尖约 `1–2%` 的小变化；禁止整体跳动、缩放或位移。
- 下落：只使用一帧；睁眼，耳朵或前爪轻微上浮以表达失重，仍保持角色身份和圆底不变。
- 现有运行逻辑按约 `0.9–1.1s/帧` 在两个待机帧间循环，下落期间固定显示第三帧；无需修改动画代码。

## 11 只猫身份表

| 等级 | ID / 中文名 | 正圆底色 | 必须保留的识别点 |
|---|---|---|---|
| 00 | `cream-kitten` / 小奶猫 | 桃奶油 `#F8D9B8` | 天蓝眼、杏桃耳尖、小杏桃领巾、一只爪靠近脸颊，幼猫比例 |
| 01 | `gray-tabby` / 灰灰 | 雾蓝 `#C9DDEA` | 冷灰毛、绿色眼、清晰额头条纹、抱住有条纹的卷尾 |
| 02 | `calico` / 三花猫 | 腮红粉 `#F3CDD2` | 不对称黑橘脸斑、琥珀眼、一只粉色肉垫爪抬起 |
| 03 | `tuxedo` / 奶牛猫 | 薄荷 `#C7E6D8` | 黑白面罩与胸口、蓝绿色小领结、前爪整齐叠放 |
| 04 | `white-fluffy` / 小白团 | 粉蓝 `#CEE5F1` | 云朵状白色颊毛、浅蓝眼、黄色星星发夹 |
| 05 | `brown-tabby` / 虎斑猫 | 燕麦米 `#E8D5BB` | 暖棕鲭鱼纹、深色粗条纹、叶绿色项圈、弯曲尾巴 |
| 06 | `siamese` / 暹罗猫 | 淡紫 `#DDD0ED` | 深可可面罩与耳朵、鲜蓝眼、薰衣草铃铛项圈 |
| 07 | `golden-shorthair` / 金渐层 | 奶油黄 `#F5E1A7` | 蜂蜜金毛尖、祖母绿眼、小珊瑚色贝雷帽 |
| 08 | `blue-scottish-fold` / 蓝灰折耳 | 灰长春花 `#BEC5DF` | 纯蓝灰绒毛、明确折耳、铜色眼、莓红项圈，不得出现虎斑纹 |
| 09 | `orange-tabby` / 黑烟虎斑 | 灰紫 `#C9BBCB` | 炭黑烟色被毛、银色围脖毛、黄色眼、奶油月牙胸斑 |
| 10 | `fat-orange` / 大胖橘 | 杏桃橙 `#F5B878` | 最大体型、鲜橘虎斑、圆肚、绿色眼、小蓝色鱼形挂袋、开心神态 |

## 小图生成工作流

1. 每次只生成“1 只猫的 1 帧”，不要请求三格图、角色表或 11 只同屏。
2. 先生成该猫的待机 A；验收角色身份、圆形底色、风格和小尺寸辨识度。
3. 将待机 A 作为高一致性参考，分别生成待机 B 和下落帧；每次只改变指定动作。
4. 输出先保留为生成源，再缩放/裁切到 `256 × 256`，套用固定 `252px` 抗锯齿正圆 Alpha。
5. 三帧逐像素核对圆形 Alpha；圆外像素必须透明，圆角不得残留底色或毛边。
6. 覆盖下表中的现有运行文件；保留对应 `.meta`，避免 Cocos UUID 和引用变化。
7. 完成一只并在 48px、64px、物理实际尺寸下验收后，再开始下一只。

### 单帧基础提示词模板

```text
Use case: stylized-concept
Asset type: one small production sprite frame for a 2D mobile cat merge game
Primary request: create one frame only for <CAT IDENTITY AND THIS FRAME ACTION>.
Style/medium: original premium soft kawaii picture-book sticker illustration; clean hand-painted 2D shapes; subtle gouache and colored-pencil texture; soft short-fur suggestion; crisp readable silhouette; natural small eyes.
Token design: center the cat inside one perfectly circular flat <DISC COLOR> background disc. The disc fills 92% of the square canvas. The cat may be non-circular but stays fully inside the disc.
Scene/backdrop: perfectly flat solid #00ff00 outside the circular disc.
Composition: one cat, one frame, centered, generous filtering safety.
Constraints: preserve the supplied character identity, proportions, accessory, face, disc, lighting and scale; readable at 48px; no cast shadow outside the disc; no text, logo, watermark, border, scenery, extra object or extra cat.
Avoid: origami, folded paper, cut paper, creases, polygons, geometric facets, photorealism, 3D render, plastic, clay, huge anime eyes.
```

待机 B 追加：

```text
Input image: idle A is the identity and layout reference.
Change only a soft blink plus a tiny 1–2% breathing or tail-tip motion. Keep the disc, body position, silhouette scale, lighting and every character feature unchanged.
```

下落帧追加：

```text
Input image: idle A is the identity and layout reference.
Create one held falling pose: eyes open, ears and both front paws lifted slightly by weightlessness. Keep the disc, body center, silhouette scale, colors, lighting and every character feature unchanged.
```

## 运行文件映射

| 等级 | 待机 A | 待机 B | 下落 |
|---|---|---|---|
| 00 | `cat-00-cream-kitten-idle-1-c6-v1.png` | `cat-00-cream-kitten-idle-2-c6-v1.png` | `cat-00-cream-kitten-fall-c6-v1.png` |
| 01 | `cat-01-gray-tabby-idle-1-c6-v1.png` | `cat-01-gray-tabby-idle-2-c6-v1.png` | `cat-01-gray-tabby-fall-c6-v1.png` |
| 02 | `cat-02-calico-idle-1-c6-v1.png` | `cat-02-calico-idle-2-c6-v1.png` | `cat-02-calico-fall-c6-v1.png` |
| 03 | `cat-03-tuxedo-idle-1-c6-v1.png` | `cat-03-tuxedo-idle-2-c6-v1.png` | `cat-03-tuxedo-fall-c6-v1.png` |
| 04 | `cat-04-white-fluffy-idle-2-c6-v1.png` | `cat-04-white-fluffy-idle-3-c6-v1.png` | `cat-04-white-fluffy-fall-c6-v1.png` |
| 05 | `cat-05-brown-tabby-idle-2-c6-v1.png` | `cat-05-brown-tabby-idle-3-c6-v1.png` | `cat-05-brown-tabby-fall-c6-v1.png` |
| 06 | `cat-06-siamese-idle-1-c6-v1.png` | `cat-06-siamese-idle-2-c6-v1.png` | `cat-06-siamese-fall-c6-v1.png` |
| 07 | `cat-07-golden-shorthair-idle-1-c6-v1.png` | `cat-07-golden-shorthair-idle-2-c6-v1.png` | `cat-07-golden-shorthair-fall-c6-v1.png` |
| 08 | `cat-08-blue-scottish-fold-idle-1-c8-v1.png` | `cat-08-blue-scottish-fold-idle-2-c8-v1.png` | `cat-08-blue-scottish-fold-fall-c8-v1.png` |
| 09 | `cat-09-orange-tabby-idle-1-c6-v1.png` | `cat-09-orange-tabby-idle-2-c6-v1.png` | `cat-09-orange-tabby-fall-c6-v1.png` |
| 10 | `cat-10-fat-orange-idle-1-c6-v1.png` | `cat-10-fat-orange-idle-2-c6-v1.png` | `cat-10-fat-orange-fall-c6-v1.png` |

运行目录：`assets/games/watermelon/visual/cats/frames-c6/`

## 场景、封面与入口图标

猫咪 33 帧完成并锁定风格后，再各用一个独立请求生成背景与封面；不要与角色帧合并生成。

### 游戏背景

- 运行文件：`assets/games/watermelon/visual/backgrounds/c1-cat-room-bg-v1.jpg`
- 尺寸：`750 × 1334` 竖屏。
- 萌系 2D 绘本猫咪房间，奶油墙面与浅木地板，猫爬架、靠垫、毛线球和小绿植只分布在外缘。
- 顶部 HUD、中央物理容器和底部指引区域必须安静、低对比、无猫、无圆球和无文字。
- 禁止写实 3D 房间、折纸、纸张折角、强透视、强光斑和中心装饰。

### 大厅封面

- 运行文件：`assets/lobby/visual/covers/watermelon/c1-fat-orange-cover-v1.jpg`
- 尺寸：`920 × 690` 横屏。
- 大胖橘居中，奶油幼猫、灰虎斑和三花猫形成清晰的等级成长环绕关系；使用与运行帧一致的绘本贴纸画法。
- 使用杏桃、薄荷、天蓝、薰衣草的柔和背景块和少量爪印/星点，不放文字、Logo、按钮或界面截图。
- 禁止巨大眼睛、写实 3D 毛发、塑料玩具质感、霓虹光环和折纸元素。

### 猫咪游戏入口图标

- 建议新增运行文件：`assets/lobby/visual/icons/watermelon/cat-merge-icon-v1.png`。
- 尺寸：`512 × 512`，RGBA PNG；有效图形保留约 8% 安全边距，兼容圆角和圆形平台蒙版。
- 主体：只出现大胖橘的头肩或上半身，保留鲜橘虎斑、绿色眼和小蓝色鱼形挂袋中的至少两个识别点。
- 背景：杏桃奶油色正圆或柔和径向色块；小尺寸下要比大厅封面更简洁、更粗轮廓。
- 不放游戏名、字母、数字、按钮、复杂房间或其他猫咪；禁止直接缩放整张大厅封面冒充图标。
- 当前 `assets/resources/configs/games.json` 中猫咪游戏的 `icon` 仍写为 `images/icon`，但仓库没有对应图片，且现有大厅卡片只加载 `cover`。生成图标后需要把配置接到实际资源路径，并验证未来入口/平台使用场景。

### 游戏背景提示词模板

```text
Use case: stylized-concept
Asset type: portrait background for a 2D mobile cat merge game
Primary request: create a warm kawaii picture-book cat room background, 750:1334 portrait.
Scene/backdrop: cream wall and pale warm wood floor; a compact cat tree, soft cushion, yarn and one small plant appear only near the outer edges.
Style/medium: original premium soft 2D picture-book illustration; subtle gouache and colored-pencil texture; clean rounded shapes; low contrast in playable regions.
Composition/framing: reserve the top HUD band, the entire central physics container, and the bottom instruction band as calm negative space. Edge decorations must survive tall- and short-screen cover crops.
Lighting/mood: diffuse warm morning light; cozy, calm, playful.
Constraints: no cats; no circular balls or objects in the central playfield; no text, logo, UI, buttons or watermark.
Avoid: origami, folded paper, cut paper, paper creases, photorealistic 3D room, strong perspective, hard sunbeams, center focal object, clutter.
```

### 大厅卡片封面提示词模板

```text
Use case: stylized-concept
Asset type: landscape lobby card cover for a 2D mobile cat merge game
Primary request: create a 4:3-ish landscape cover led by the approved large orange tabby, with the approved cream kitten, gray tabby and calico showing the merge progression.
Input images: approved cat idle-A frames are strict identity references.
Style/medium: the same premium soft kawaii picture-book sticker illustration as the runtime cat tokens.
Composition/framing: the large orange tabby is the clear central focal point; three smaller cats form a simple readable arc; preserve safe crop space for the lobby card's rounded 0.972 aspect viewport and gentle 1.025 scale animation.
Color palette: apricot, mint, sky blue, lavender and creamy white.
Constraints: preserve each approved cat identity; readable at small card size; no text, logo, UI, buttons, border or watermark.
Avoid: huge anime eyes, realistic 3D fur, plastic toy texture, neon rings, origami, excessive props or busy room scenery.
```

### 入口图标提示词模板

```text
Use case: stylized-concept
Asset type: square game entry icon
Primary request: create one iconic close-up of the approved large cheerful orange tabby for the cat merge game.
Input image: approved level-10 idle-A frame is the strict identity reference.
Style/medium: the same premium soft kawaii 2D picture-book sticker style as the runtime cat token.
Composition/framing: centered head-and-shoulders or upper body; bold silhouette; 8% safe margin; legible at 48px; compatible with circular and rounded-square masks.
Color palette: apricot orange subject on a creamy peach background with one restrained mint or sky-blue accent.
Constraints: preserve green eyes, orange tabby markings and cheerful identity; no text, letters, numbers, border, watermark, other cats or room scenery.
Avoid: cropping ears, tiny details, huge anime eyes, photorealism, 3D, plastic, clay, origami or folded-paper motifs.
```

## UI 对齐信息

- 主题变量：`assets/games/watermelon/scripts/WatermelonUiTheme.ts`
- 主 HUD 与容器：`assets/games/watermelon/scripts/WatermelonLayout.ts`
- 暂停/结果层：`assets/games/watermelon/scripts/WatermelonOverlayView.ts`
- 续玩层、瞄准线与合成爪印特效：`assets/games/watermelon/scripts/WatermelonGame.ts`
- UI 使用奶油白表面、杏桃主操作、薄荷继续、薰衣草描边、黄油高光和梅子灰文字；全部为圆角软垫/胶囊语言，不再使用纸张折角。

## 验收清单

- [ ] 总交付为 36 张：33 张猫咪帧、1 张游戏背景、1 张大厅卡片封面、1 张入口图标。
- [ ] 33 张运行 PNG 齐全，尺寸均为 256²。
- [ ] 所有素材外轮廓为 252px 正圆，四周 2px 透明安全区。
- [ ] 每只猫三帧 Alpha、圆心和底色完全一致。
- [ ] 两张待机帧差异小而可见，循环没有整体跳动。
- [ ] 下落只使用一帧，触地后自然切回待机循环。
- [ ] 11 只猫在 48px 下仍可通过毛色、脸纹、耳形、姿势或配饰快速区分。
- [ ] 没有折纸、剪纸、折角、几何切面、写实 3D 或巨大动漫眼睛。
- [ ] 背景中央不干扰物理圆和危险线，封面与运行角色风格一致。
- [ ] 游戏背景为 750×1334 JPG，在短屏和长屏 cover 裁切后边缘装饰不侵入游玩区。
- [ ] 大厅卡片封面为 920×690 JPG，在圆角遮罩和 1.025 缓慢缩放时主体不被裁掉。
- [ ] 入口图标为 512×512 RGBA PNG，在 48px 和圆形蒙版下仍清晰，并已接入真实配置路径。
- [ ] 程序绘制的 HUD、按钮、弹层、危险线、投放引导和爪印特效不再新增重复位图。
- [ ] 通过 Cocos Creator Web/微信构建，并确认猫咪碰撞半径、视觉尺寸和投放预览在实际画面中一致。
- [ ] Cocos Creator Web/微信构建成功，桌面和移动端实际画面通过。

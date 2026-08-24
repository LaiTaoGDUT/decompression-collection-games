# 《桌面大清理》图片生成记录

## 记录信息

- 生成日期：2026-08-23
- 生成方式：OpenAI ImageGen（Codex `image_gen` 工具）
- 所属视觉单元：`game-catch`；大厅图标与封面为大厅展示副本
- 授权与使用条件：以生成时所用 OpenAI 服务条款及项目发行前法务复核为准；仓库中未声明第三方素材授权
- 共通禁止项：不出现鹅、锅、现有游戏标题或标志、真实商标、品牌包装、可辨识文字、水印、参考游戏 UI、在世艺术家或可识别作品风格模仿

## 游戏物件透明图集

- 仓库文件：`assets/games/catch/visual/items/desktop-cleanup-items-atlas-v1.png`
- 输出标识：`exec-f2c60f98-99a2-4396-8e3b-a46ee667c0b6.png`
- 完整提示词：

```text
Create one production-ready transparent PNG sprite atlas for an original mobile puzzle game called “Desktop Cleanup”. Exact layout: a perfectly aligned 4 by 4 grid of equal square cells, with no visible grid lines and a truly transparent background. Put exactly one isolated object centered inside each of the first 14 cells in row-major order: 1 blue capped pen, 2 coral red wooden pencil, 3 mustard yellow rounded eraser, 4 mint sticky-note stack with no writing, 5 dark navy binder clip, 6 orange tape roll, 7 teal USB flash drive with no logo, 8 cream wireless-earbuds case with no brand, 9 coral keyboard keycap with no character, 10 purple soft stress ball, 11 round cork coaster, 12 blue spiral notebook with a blank cover, 13 translucent cyan ruler with no numbers, 14 golden lucky star badge. Cells 15 and 16 must be completely empty and transparent. Original soft polymer-clay miniature art direction, warm matte surfaces, thick rounded silhouettes, consistent top-down three-quarter camera, soft upper-left key light and short lower-right soft shadow. Each object must fit fully inside its own cell with generous transparent padding, never cross a cell boundary, remain clearly identifiable at 80–120 px, and have no shared cast-shadow plate. No text, letters, numbers, logos, trademarks, watermarks, border, UI, background, desk, hands, goose, cooking pot, photorealism, thin sharp metal highlights, extra objects, duplicate objects, or fake transparency checkerboard.
```

- 人工检查：文件为 RGBA；透明通道同时包含 0 与 255；前 14 格为独立物件，末两格透明；运行时按 4×4 等分裁切。

## 游戏竖屏背景

- 仓库文件：`assets/games/catch/visual/backgrounds/desktop-cleanup-desk-v1.jpg`
- 输出标识：`exec-8a01ae31-381b-4890-babd-ac9f5e7a10cd.png`
- 完整提示词：

```text
Create an original 9:16 vertical mobile-game background for “Desktop Cleanup”, with no UI and no text. A warm dark-walnut desktop rendered as a handcrafted soft polymer-clay miniature, viewed from a consistent top-down three-quarter angle. Place one large clean warm-cream rounded rectangular work mat in the center, leaving generous dark desk space above and below for responsive HUD and tool controls. Add only a few subtle peripheral clay details near the extreme edges—tiny rounded tape marks, soft crumbs, or shallow organizing-tray hints—so the central mat remains uncluttered and safe for a dense pile of interactive sprites. Palette: walnut brown, warm cream, tiny restrained accents of coral, teal, mustard and lilac. Matte tactile surfaces, soft upper-left studio light, short lower-right shadows, calm cozy organization mood. The image must work with cover cropping on tall and short phones, so keep all important decoration away from the crop edges and keep the center readable. No objects from the gameplay atlas on the mat, no goose, no cooking pot, no hands, no characters, no brand, no logo, no letters, no numbers, no watermark, no interface panels, no buttons, no photorealism, no perspective grid, no copied game composition.
```

## 大厅方形图标

- 仓库文件：`assets/lobby/visual/icons/catch/desktop-cleanup-icon-v1.jpg`
- 输出标识：`exec-7688fa60-d873-4584-af62-46347b9f0199.png`
- 完整提示词：

```text
Create a square 1:1 mobile-game lobby icon for an original game named “Desktop Cleanup”. Use a bold, instantly readable soft polymer-clay miniature composition: one golden lucky star badge in front, a mint blank sticky-note stack and a coral red pencil behind it, arranged as a compact single silhouette. Warm cream rounded inset tile over a dark walnut clay desk, with a thick mustard rim and a short soft shadow. Matte tactile surfaces, thick rounded edges, soft upper-left lighting, friendly cozy organization mood, strong readability at 96 px. Keep generous safe padding for rounded-square masking. No text, letters, numbers, brand marks, logo typography, goose, cooking pot, hands, UI buttons, clutter, fake watermark, photorealism, or imitation of any existing game icon.
```

## 大厅横向封面

- 仓库文件：`assets/lobby/visual/covers/catch/desktop-cleanup-cover-v1.jpg`
- 输出标识：`exec-cd55602b-8d52-402d-a3e1-2f1b5aba13da.png`
- 完整提示词：

```text
Create an original landscape 4:3 lobby cover illustration for the mobile puzzle game “Desktop Cleanup”. Show a warm dark-walnut soft-clay work desk with a cream organizing mat. On the left-middle, a charming but manageable pile of rounded miniature desk objects is being sorted into a neat shallow tray on the right: a blue pen, coral pencil, mint sticky notes, orange tape, teal USB, cream earbuds case, purple stress ball, cork coaster and a golden lucky star badge. Use a top-down three-quarter camera, matte polymer-clay materials, soft upper-left lighting, short lower-right shadows, and a warm coral–teal–mustard accent palette. The visual story must be “mess becoming calm”, with a clear diagonal flow from pile to organized tray. Preserve generous safe crop margins, especially at the top and both sides; no text is needed. No goose, cooking pot, hands, characters, existing game UI, logos, letters, numbers, branded packaging, watermark, photorealism, chaotic tiny clutter, or imitation of a recognizable game cover.
```

## 已确认游戏界面效果参考

- 仓库文件：`art_sources/桌面大清理/desktop-cleanup-gameplay-ui-reference-v2.png`
- 生成日期：2026-08-24
- 输出标识：`exec-0c7cc166-f351-44f4-8fac-726580ddba33.png`
- 输入 1：首版宽松铺满桌垫的界面概念图 `exec-69f0167b-f95d-4f8b-8a53-d3b2aa89ac61.png`，作为编辑目标。
- 输入 2：`assets/games/catch/visual/items/desktop-cleanup-items-atlas-v1.png`，只作为物品身份与材质参考。
- 选择理由：用户确认第二版的紧凑深层堆叠方向；该图只作为布局和视觉层级对照，不进入运行时 Bundle。
- 完整编辑提示词：

```text
Use case: precise-object-edit
Asset type: high-fidelity portrait mobile game gameplay screen concept revision
Input images: Image 1 is the edit target and current approved visual baseline; Image 2 is only a supporting stationery identity and material reference.
Primary request: Change only the arrangement and occlusion geometry of the stationery objects in the central gameplay area of Image 1. The current objects are much too widely spread across the mat. Replace them with one compact, deep, heavily overlapped multi-layer stack.
Required stack geometry: Center the stack on the upper-middle of the cream play mat. Its footprint should be a compact rounded oval, no wider than about 55–60% of the screen and no taller than about 40–45% of the screen, leaving clearly visible empty cream mat around all four sides. Keep every individual object large, about the same scale as Image 1. Create the sense of many z-index layers—approximately 10–14 tightly interleaved layers—not a broad surface scatter and not separate piles. Objects in successive layers should overlap by roughly 60–85%.
Occlusion behavior: The bottom layers must be almost completely buried by the layers above them, with only tiny corners, tips, short ruler ends, clip handles, or thin colored slivers visible. Middle layers should be mostly covered, revealing only 20–45% of each item. Only around 10–15 topmost or outer-edge objects should have a sufficiently exposed surface to look clickable. The visual must immediately communicate that clearing upper objects will gradually reveal many hidden objects underneath. Use strong contact shadows at every overlap to make layer order unambiguous.
View: Maintain the same top-down/three-quarter game camera. This is dense 2D gameplay layering with depth and occlusion, not a realistic tall tower viewed from the side. Keep random rotations and natural crossings. Compact central silhouette; high density; deep burial.
Preserve unchanged: Keep Image 1's walnut desk, lamp, plant, peripheral props, cream mat, exact "02:36" timer, help button, pause button, graphical badge, seven-slot tray, two collected items, flying-item motion trail, three bottom prop buttons, palette, lighting, material style, aspect ratio, safe areas, and overall UI positions. Preserve the soft-clay stationery identities and silhouette-tight edges.
Constraints: one compact stack only; large objects; many deeply occluding layers; clear top-to-bottom reveal logic.
Avoid: objects filling the whole mat; wide loose scatter; grid; rows; multiple clusters; isolated objects around the mat; shallow single layer; evenly visible objects; small objects; actual vertical tower; changing the HUD; extra text; gray item cards; white sticker outlines; watermark.
```

## v2 可拆分运行时组件

### 记录与来源

- 生成日期：2026-08-24
- 生成方式：OpenAI ImageGen（Codex 内置 `image_gen` 工具）
- 原始选定结果目录：`art_sources/桌面大清理/v2-components/`
- 确定性处理脚本：`tools/build-desktop-cleanup-v2-assets.py`
- 制作目的：把效果图中与屏幕比例相关的元素拆成独立资源；木纹背景只负责全屏 `cover`，桌垫随正方形物品区单独缩放，HUD、道具栏、七格收纳槽和三消烟雾均由透明图片还原。
- 共同视觉方向：原创软质聚合物黏土微缩玩具；暖奶油色、珊瑚红、青绿色、芥末金与深海军蓝；圆润厚实轮廓、哑光表面、左上柔光与右下短阴影。除标题图形中的物件本身外，不出现品牌、可辨识包装、商标、水印、鹅、锅、人物、手、第三方游戏 UI 或艺术家风格模仿。

### 选定输出清单

| 原始文件 | 原始尺寸 / 模式 | ImageGen 输出标识 | 用途 |
| --- | --- | --- | --- |
| `backdrop-wood-v2.png` | 941×1672 / RGB | `exec-8f571ff8-e533-4dc4-bdaf-9fb97f1c2355` | 不含桌垫的竖屏木纹背景 |
| `playmat-v2.png` | 1254×1254 / RGBA | `exec-14e06c83-f8c3-4fd0-a00e-7f84f5819db5` | 与正方形物品区一起缩放的独立桌垫 |
| `item-blue-marker-v2.png` | 1254×1254 / RGBA | `exec-4de563fc-1837-4bbe-a908-88a6d20b008d` | 紧凑蓝色粗头笔 |
| `item-red-pencil-stub-v2.png` | 1254×1254 / RGBA | `exec-629030a8-3dd0-4d2f-b443-8466e866d615` | 短粗珊瑚红铅笔 |
| `item-binder-clip-v2.png` | 1254×1254 / RGBA | `exec-42ebb27e-cadc-40b5-8b36-27a6358c5b62` | 紧凑深蓝票夹 |
| `item-orange-tape-v2.png` | 1254×1254 / RGBA | `exec-88d8e9ee-5889-467e-9414-ee380d9a02bf` | 厚实橙色胶带卷 |
| `item-teal-usb-v2.png` | 1254×1254 / RGBA | `exec-8e35bce1-e108-4a7e-a295-be7235391949` | 短粗青绿 U 盘 |
| `item-set-square-v2.png` | 1254×1254 / RGBA | `exec-15595b4c-6d6b-47c7-84d8-86415512aaab` | 低长宽比透明青色三角尺 |
| `match-smoke-v1.png` | 1254×1254 / RGBA | `exec-c69ff46f-5508-4bd6-9d31-0432d7be492d` | 三个同类物品汇聚后的消失烟雾 |
| `hud-help-v2.png` | 1254×1254 / RGBA | `exec-c75aa611-e11e-4e7f-b223-797c955557d2` | 顶部帮助按钮 |
| `hud-pause-v2.png` | 1254×1254 / RGBA | `exec-9e8bbf3c-f2d6-4756-b3ed-f3a71339769f` | 顶部暂停按钮 |
| `hud-title-emblem-v2.png` | 1774×887 / RGBA | `exec-395a2487-6606-464c-9c25-4a95e0ceb5d2` | 顶部无文字标题徽章 |
| `hud-timer-plate-v2.png` | 2172×724 / RGBA | `exec-ca8a0a40-7687-438f-9b6f-fd3516b87f1c` | 顶部计时器空底板，数字由运行时叠加 |
| `slot-tray-7-v2.png` | 2068×760 / RGBA | `exec-2ab79519-6052-4e8a-b932-df0a0d70aedf` | 精确七格的底部收纳槽 |
| `tool-return-v2.png` | 1254×1254 / RGBA | `exec-2e4d1471-7dd2-4486-acb4-db61a5531867` | 撤回道具卡 |
| `tool-magnet-v2.png` | 1254×1254 / RGBA | `exec-97333c06-ced5-4e24-839f-be4f568d3bb1` | 磁铁道具卡；这是重新生成后选定的有效版本 |
| `tool-shuffle-v2.png` | 1254×1254 / RGBA | `exec-f210762c-555b-4a32-8867-1568e45c6102` | 洗牌道具卡 |

### 背景与桌垫生成规格

背景完整提示词：

```text
Create a production-ready 9:16 vertical background plate for the original mobile puzzle game “Desktop Cleanup”. Show only a seamless warm dark-walnut desktop surface, viewed almost top-down with a very subtle three-quarter depth cue. Use broad calm wood grain, softly rounded handmade-clay texture, warm vignette, soft upper-left studio light and restrained lower-right shading. The image will be cover-cropped on phones, so make the texture continuous to every edge and keep its visual center neutral. Critical separation requirement: do not include any cream play mat, board, tray, stationery, pile, HUD, button, icon, title, timer, slot, character, hand, text, logo, watermark or peripheral prop. The desk background must remain usable behind an independently positioned square play-mat sprite on every aspect ratio. No photorealism, perspective grid, seams or copied game composition.
```

独立桌垫完整提示词：

```text
Create one isolated square play-mat sprite for an original portrait mobile puzzle game. A large warm beige-to-cream padded desk mat with an almost-square rounded-rectangle silhouette, very large corner radius, thick soft edge, subtle fabric-and-polymer-clay texture, faint inner highlight and short soft shadow directly below/right. Camera is almost top-down, matching a soft-clay miniature game. Keep the entire mat centered and fully visible with even transparent padding. The inner surface must be plain and spacious because many interactive stationery sprites will be layered over it. Output a true transparent-background RGBA PNG. No wood background, desk, stationery, pile, slots, UI, text, border outside the mat, checkerboard, white halo, logo or watermark.
```

### 紧凑文具生成规格

以下共同提示词与每件物品的专属段落拼接使用；每次只生成一件物品：

```text
Create one production-ready isolated stationery sprite for an original mobile matching game. True transparent RGBA background; exactly one object; square canvas; object centered and fully visible with generous but not excessive transparent padding. Original soft polymer-clay miniature style, thick rounded silhouette, warm matte tactile surface, consistent almost top-down three-quarter camera, soft upper-left key light and a compact lower-right contact shadow attached to the object. Optimize the silhouette for pixel-accurate alpha hit testing at small mobile sizes: compact, chunky, low aspect ratio, no long thin appendages, no detached parts, no extreme concavities, and no decorative outline or card behind it. No text, numbers, logo, brand, watermark, desk, mat, UI, hand, extra object, fake transparency checkerboard, gray frame or white sticker border.
```

- `item-blue-marker-v2.png` 专属段落：

```text
Object: one short chunky capped blue marker pen, oriented on a mild diagonal. Make it visibly a pen but unusually compact: broad rounded barrel, large rounded cap, approximately 2.1:1 overall length-to-width ratio, with no exposed thin tip or clip. Navy-blue body with a restrained cyan accent ring, no writing and no logo.
```

- `item-red-pencil-stub-v2.png` 专属段落：

```text
Object: one short thick coral-red wooden pencil stub, oriented on a mild diagonal. Use a blunt chunky body, broad sharpened wood section, rounded dark graphite point and oversized pink eraser with mustard-gold ferrule. Keep the silhouette around 2.2:1, not long or needle-thin; no printed marks.
```

- `item-binder-clip-v2.png` 专属段落：

```text
Object: one compact dark navy binder clip seen from above at a slight three-quarter angle. Make the triangular body broad and rounded, with two short thick clay-like handles folded close to the body so the silhouette stays contiguous and easy to hit. No long wire loops, sharp metal glints or detached handle segments.
```

- `item-orange-tape-v2.png` 专属段落：

```text
Object: one thick orange adhesive-tape roll, nearly circular, with a large warm-cream cardboard center and a small visible loose tab that remains broad and attached to the ring. Use coral-orange and mustard accents, substantial depth and a compact shadow. No dispenser, label or detached strip.
```

- `item-teal-usb-v2.png` 专属段落：

```text
Object: one short chunky teal USB flash drive, approximately 1.7:1 in silhouette. Use a rounded polymer-clay body and a broad short cream-metal connector; keep the connector visually attached and avoid tiny holes or thin details. No logo, capacity text, lanyard or cap separated from the body.
```

- `item-set-square-v2.png` 专属段落：

```text
Object: one compact translucent cyan set square rather than a long ruler. Use a broad rounded right-triangle silhouette with thick safe edges and one large softened triangular opening; low aspect ratio and no narrow points. Keep translucency readable against both light and dark surfaces. No ticks, measurements, numbers, letters or brand.
```

### HUD、收纳槽与道具卡生成规格

以下共同提示词与对应组件的专属段落拼接使用：

```text
Create one isolated production-ready mobile-game UI component for the original “Desktop Cleanup” visual system. True transparent RGBA background, exactly one centered component, all edges fully visible with safe padding. Match the approved cozy handcrafted soft polymer-clay UI: warm cream inset surfaces, coral-red rims, mustard-gold structural accents, teal/navy symbols, rounded thick forms, soft upper-left highlight and short lower-right shadow. Front-facing game-UI camera, high readability at phone size. No external background, desk, mat, unrelated props, watermark, brand, photorealism, thin outlines, fake checkerboard or copied interface.
```

- `hud-help-v2.png` 专属段落：

```text
Component: one circular help button. Thick coral rim, warm-cream inset face, one large centered raised navy question-mark symbol. No other text, badge or ornament.
```

- `hud-pause-v2.png` 专属段落：

```text
Component: one circular pause button matching the help button in diameter, rim, depth and lighting. Thick coral rim, warm-cream inset face, two large centered raised navy vertical pause bars. No letters or extra icon.
```

- `hud-title-emblem-v2.png` 专属段落：

```text
Component: one compact horizontal graphical title emblem with no typography. Arrange a large golden star medal over a mint blank sticky-note stack, with a short chunky coral pencil crossing diagonally. Build one cohesive overlapping silhouette, warm celebratory but not noisy, readable around 180×90 UI units. No words, letters, numeric marks or separate background plaque.
```

- `hud-timer-plate-v2.png` 专属段落：

```text
Component: one wide pill-shaped timer plate, approximately 3:1. Thick coral rounded rim, warm-cream clean inset center and one small mustard-gold round rivet near each end. Keep the entire central area empty and evenly lit for runtime-rendered “MM:SS” numerals. Do not render digits, colon, clock symbol or text.
```

- `slot-tray-7-v2.png` 专属段落：

```text
Component: one long shallow warm-cream collection tray containing exactly seven equal rounded-square recessed wells in a single horizontal row. All seven wells must be clearly separated, identical in size, evenly spaced and empty. Use a thick outer body, soft inset shadows and restrained edge highlights; approximately 4.6:1 overall. No eighth well, item, number, label, button or colored border.
```

- `tool-return-v2.png` 专属段落：

```text
Component: one complete square prop card. Rounded mustard-gold outer frame, warm-cream inset face, a large raised teal curved return/undo arrow centered. Add one small coral circular question-mark help badge overlapping the upper-right corner and one blank coral circular count badge overlapping the lower-right corner. Keep the count badge empty for runtime text. No label or number.
```

- `tool-magnet-v2.png` 专属段落：

```text
Component: one complete square prop card matching the return card exactly in proportions and construction. Center one large raised red horseshoe magnet with cream tips. Include the same coral question-mark help badge at upper right and blank coral count badge at lower right. Keep every part inside one compact silhouette; no label, number, lightning bolt or detached particles.
```

- `tool-shuffle-v2.png` 专属段落：

```text
Component: one complete square prop card matching the other two cards exactly. Center two thick raised teal crossing shuffle arrows with broad rounded arrowheads. Include the same coral question-mark help badge at upper right and blank coral count badge at lower right. No label, number, cards, dice or extra particles.
```

### 三消烟雾生成规格

```text
Create one isolated match-disappear smoke effect sprite for an original soft-clay mobile puzzle game. True transparent RGBA square canvas. Form a compact circular ring of overlapping warm-cream rounded smoke puffs with a readable open center, plus a few short teardrop wisps and small celebratory clay stars/dots in coral, teal and mustard. The effect represents three collected objects converging and vanishing, so it should feel soft, quick and cheerful rather than explosive. Keep every particle inside generous transparent padding and use one cohesive centered silhouette suitable for scale, rotation and alpha animation in code. No stationery object, text, number, logo, background, frame, fire, dark soot, photorealism or fake checkerboard.
```

### 确定性处理与运行时输出

- `tools/build-desktop-cleanup-v2-assets.py` 是唯一重建入口；它读取上述选定原图，不再调用模型，因此相同输入会得到相同的裁切、缩放、排版和 Alpha 命中数据。
- 背景：木纹图用 Lanczos 重采样并导出为 `assets/games/catch/visual/backgrounds/desktop-cleanup-backdrop-v2.jpg`（750×1334，progressive JPEG）；桌垫保留最大连通 Alpha，居中输出为 `assets/games/catch/visual/backgrounds/desktop-cleanup-playmat-v2.png`（1024×1024 RGBA）。
- 文具：六件新素材替换旧图集中不适合精确点击的细长物件，其余八件沿用 v1；全部按同一规则裁切、留白并排入 `assets/games/catch/visual/items/desktop-cleanup-items-atlas-v2.png`（1536×1536，4×4、单格 384）。脚本同时生成 `desktop-cleanup-items-hitmask-v2.json`，每件物品使用 96×96 位图、Alpha 阈值 176，运行时据此执行素材级命中，而不是矩形热区猜测。
- UI：帮助/暂停输出 256×256，标题徽章 512×256，计时底板 768×256，七格槽 1264×272，三张道具卡各 384×384；文件均位于 `assets/games/catch/visual/ui/`，保留透明边缘，数字和次数由运行时单独叠加。
- 特效：烟雾居中整理为 `assets/games/catch/visual/vfx/desktop-cleanup-match-smoke-v1.png`（512×512 RGBA），运行时负责三个槽内物件先汇聚、再播放烟雾缩放/旋转/淡出的时序。

## 导入前复核

- 发行格式优化：使用 Pillow 12.3.0 的 Lanczos 重采样与渐进式 JPEG 导出；背景为 `750×1334 / quality 86`，封面为 `1024×768 / quality 88`，图标为 `512×512 / quality 92`。该步骤只改变尺寸与压缩格式，不改变生成内容；透明物件图集保持原始 PNG Alpha。
- Cocos 刷新后确认四张图片生成独立 `.meta`，游戏内两张资源只归 `game-catch`，大厅两张只归大厅资源目录。
- 在目标手机尺寸检查透明边缘、缩略辨识度、封面裁切和背景 cover；不合格的生成结果不得只靠代码遮盖问题。
- 若后续重新生成或编辑，新增输出标识、完整提示词、编辑记录和人工选择理由，不覆盖本记录。

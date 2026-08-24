# 《无尽剑域》精英怪物图片生成记录

## 记录信息

- 生成日期：2026-08-24
- 生成方式：OpenAI ImageGen（Codex 内置 `image_gen` 工具）
- 状态：`待许可确认`；尚未导入 `game-endless-sword` Bundle，也未完成真机验收
- 规格：每只精英一张 `2048×512` RGBA PNG，四帧横排，单帧 `512×512`，统一朝右
- 帧序：迈步、并拢、对侧迈步、并拢；第二、四帧可作为静止过渡帧
- 统一布局：最大主体包围盒 `456×456`，水平居中，脚底基线 `y=480`，四周保留透明安全边距
- 风格锚点：`art_sources/无尽剑域/主角/主角(256x256).png`
- 敌人参考：`art_sources/无尽剑域/普通怪物/魔甲卫` 与 `阵法师`，仅参考渲染密度、轮廓和序列帧构图
- 授权与使用条件：以生成时所用 OpenAI 服务条款及项目发行前法务复核为准；参考图均来自本仓库当前项目素材
- Hurtbox：本批只冻结图像画布、帧序、缩放与基线，具体 hurtbox 须在玩法接入前结合运行时显示比例逐只冻结

## 选定输出

| 编号 | 精英 | 仓库文件 | ImageGen 输出标识 | 后处理 |
| --- | --- | --- | --- | --- |
| EL01 | 血煞剑奴 | `血煞剑奴/血煞剑奴4帧（帧大小：512x512）.png` | `exec-a8a8536c-63c0-46ea-ac36-46a0c1fa36aa.png` | 标准规则 |
| EL02 | 雷狱妖将 | `雷狱妖将/雷狱妖将4帧（帧大小：512x512）.png` | `exec-11728d71-f2e1-4c6e-a9aa-a2ce55403b76.png` | 标准规则 |
| EL03 | 吞灵鬼王 | `吞灵鬼王/吞灵鬼王4帧（帧大小：512x512）.png` | `exec-bafe5993-b848-4c67-81ab-f4fc91d4f0f5.png` | 标准规则 |

## 确定性后处理

- 内置生成结果未按请求直接输出目标画布，并将透明棋盘格烘焙进 RGB 背景，不能直接接入。
- `tools/normalize-generated-sprite-sheet.ps1` 从画布边界恢复 Alpha，识别四个主体连通组，按从左到右排序，使用整张图统一缩放并对齐共同基线，最终导出 `2048×512 / RGBA`。
- 三张统一使用 `-MaxContentDimension 456 -Baseline 480`，所以同一张 Sheet 内不会因动作相位发生缩放或锚点跳动。
- 该处理只改变透明通道、画布、每格位置、统一缩放和基线，不重绘角色，也不混拼不同生成结果。

## 完整提示词

### EL01 血煞剑奴

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile game elite-enemy four-frame walking Sprite Sheet
Input images: Image 1 is the primary rendering-style and 3/4 top-down camera reference; Image 2 is only the enemy palette, outline quality, and four-frame layout/scale reference. Do not copy either character's identity, armor, shield, clothing, or props.
Primary request: Generate EL01 血煞剑奴 as ONE horizontal four-frame Sprite Sheet for an original Chinese xianxia survivor game.
Subject: the exact same lean, vicious male sword thrall in all four frames, corrupted by blood-sha energy; dark muted crimson bare upper torso with tasteful non-gory shadow markings, branching antique-dark-gold cracks, black-red trousers and wraps, burning dim crimson eyes, long wild dark hair; one hand grips an oversized elongated dark-red curved saber. Clear elite silhouette, larger and more imposing than ordinary enemies.
Animation: four readable phases of one seamless right-facing walk cycle in order: leading-leg step, gathered neutral passing pose, opposite-leg step, gathered neutral passing pose. Frames 2 and 4 must be compact transition/idle-compatible poses. Change only limb, hair tip, cloth tip, and saber swing phase; preserve exact identity, anatomy, costume, weapon design, camera, proportions, colors, and scale.
Style/medium: original polished hand-painted 2D anime xianxia game sprite, 3/4 top-down view about 45 degrees, clean dark outlines, controlled detail, crisp small-screen silhouette; match references' rendering density without imitating any copyrighted character.
Composition/framing: strict 4:1 horizontal strip with four equal invisible cells; one complete isolated character per cell, facing screen-right; identical apparent size; centered horizontally in each cell; feet on one shared baseline; generous transparent padding; no overlap and no cropping; weapon stays fully inside its own cell.
Color palette: charcoal black, muted dark crimson, restrained antique dark gold; crimson eye glow and gold cracks are the only bright accents. Do not use the hero's cyan-white-gold palette.
Background: genuinely transparent alpha, isolated sprite only.
Constraints: exactly four full-body frames and exactly one character per frame; coherent design across every frame; no cast shadow, no ground, no scenery, no panel borders, no checkerboard, no grid, no labels, no text, no logo, no watermark, no blood splatter or gore.
Avoid: photorealism, 3D render, MMO concept-art plate, front-facing portrait, changing sword hands, extra weapons, duplicated limbs, inconsistent costume, perspective changes.
```

### EL02 雷狱妖将

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile game elite-enemy four-frame walking Sprite Sheet
Input images: Image 1 is the primary rendering-style and 3/4 top-down camera reference; Image 2 is only the enemy palette, outline quality, and four-frame layout/scale reference. Do not copy either character's identity, shield, armor motifs, or props.
Primary request: Generate EL02 雷狱妖将 as ONE horizontal four-frame Sprite Sheet for an original Chinese xianxia survivor game.
Subject: the exact same imposing thunder-prison demon general in all four frames; layered heavy armor in deep black-purple and muted violet, upward-curving twin horns on the helmet, narrow violet eye glow, and a compact short ji halberd whose head condenses restrained purple lightning. Small violet electric arcs jump only between armor plates and around the weapon head. Broad armored silhouette, clearly elite and larger than ordinary enemies.
Animation: four readable phases of one seamless right-facing heavy walk cycle in order: leading-leg step, gathered neutral passing pose, opposite-leg step, gathered neutral passing pose. Frames 2 and 4 must be compact transition/idle-compatible poses. Change only limbs, short cloth tabs, halberd angle, and electric-arc phase; preserve exact identity, armor construction, horn shape, weapon design, camera, proportions, colors, and scale.
Style/medium: original polished hand-painted 2D anime xianxia game sprite, 3/4 top-down view about 45 degrees, clean dark outlines, controlled detail, crisp small-screen silhouette; match references' rendering density without imitating any copyrighted character.
Composition/framing: strict 4:1 horizontal strip with four equal invisible cells; one complete isolated character per cell, facing screen-right; identical apparent size; centered horizontally in each cell; feet on one shared baseline; generous transparent padding; no overlap and no cropping; halberd and lightning stay fully inside their own cell.
Color palette: near-black purple, muted violet, small dark-metal accents; lightning purple is the only bright color. Do not use the hero's cyan-white-gold palette.
Background: genuinely transparent alpha, isolated sprite only.
Constraints: exactly four full-body frames and exactly one character per frame; coherent design across every frame; no shield; no cast shadow, no ground, no scenery, no panel borders, no checkerboard, no grid, no labels, no text, no logo, no watermark.
Avoid: photorealism, 3D render, thick MMO realism, front-facing portrait, giant polearm crossing cells, extra weapons, duplicated limbs, inconsistent armor, perspective changes, excessive lightning bloom.
```

### EL03 吞灵鬼王

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile game elite-enemy four-frame walking Sprite Sheet
Input images: Image 1 is the primary rendering-style and 3/4 top-down camera reference; Image 2 is only the dark enemy rendering, outline quality, and four-frame layout reference. Do not copy either character's identity, clothing, hood, magic disk, or props.
Primary request: Generate EL03 吞灵鬼王 as ONE horizontal four-frame Sprite Sheet for an original Chinese xianxia survivor game.
Subject: the exact same obese spirit-devouring ghost king in all four frames; dark desaturated teal skin, massive round belly, short sturdy legs, ragged black-teal waist cloth, a huge grinning mouth occupying nearly half the face with non-gory blunt ghost teeth, small sinister eyes; inside the mouth a restrained cyan-green soul-energy vortex is visible. Around the neck hangs a necklace of luminous soul-flame bone beads. Heavy, top-heavy elite silhouette, clearly larger than ordinary enemies.
Animation: four readable phases of one seamless right-facing lumbering walk cycle in order: leading-leg step with belly sway, gathered neutral passing pose, opposite-leg step with opposite sway, gathered neutral passing pose. Frames 2 and 4 must be compact transition/idle-compatible poses. Change only limbs, belly/cloth secondary motion, bead swing, and vortex phase; preserve exact identity, anatomy, necklace design, camera, proportions, colors, and scale.
Style/medium: original polished hand-painted 2D anime xianxia game sprite, 3/4 top-down view about 45 degrees, clean dark outlines, controlled detail, crisp small-screen silhouette; slightly grotesque but playful and non-gory; match references' rendering density without imitating any copyrighted character.
Composition/framing: strict 4:1 horizontal strip with four equal invisible cells; one complete isolated monster per cell, facing screen-right; identical apparent size; centered horizontally in each cell; feet on one shared baseline; generous transparent padding; no overlap and no cropping; necklace and glow stay within their own cell.
Color palette: dark muted teal, black-green, dim bone gray; cyan-green vortex and soul beads are restrained bright accents. Do not use the hero's cyan-white-gold palette.
Background: genuinely transparent alpha, isolated sprite only.
Constraints: exactly four full-body frames and exactly one monster per frame; coherent design across every frame; no cast shadow, no ground, no scenery, no panel borders, no checkerboard, no grid, no labels, no text, no logo, no watermark, no blood or gore.
Avoid: photorealism, 3D render, horror realism, dismemberment, changing mouth/face design, extra characters or souls, duplicated limbs, inconsistent necklace, perspective changes, oversized glow obscuring silhouette.
```

## QA 结果

- 3 张均为 `2048×512 / Format32bppArgb`，Alpha 同时包含 `0` 与 `255`。
- 每张四格均非空，所有可见像素均未接触整张画布或单格边界，未发现跨格串帧。
- 三张均保持统一朝右、统一身份、整张 Sheet 统一缩放以及共同脚底基线 `y=480`。
- 图片仅位于 `art_sources`，因此本次未执行 Cocos 资源刷新或浏览器运行验收。

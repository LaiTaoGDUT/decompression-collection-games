# 《无尽剑域》普通怪物 E05～E11 图片生成记录

## 记录信息

- 生成日期：2026-08-24
- 生成方式：OpenAI ImageGen（Codex 内置 `image_gen` 工具）
- 状态：`待许可确认`；尚未导入 `game-endless-sword` Bundle，也未完成真机验收
- 规格：每只怪物一张 `2048×512` RGBA PNG，四帧横排，单帧 `512×512`，统一朝右
- 风格锚点：`art_sources/无尽剑域/主角/主角(256x256).png`
- 现有敌人参考：妖鼠、鬼火、腐尸、魔弩傀儡的已交付四帧图
- 授权与使用条件：以生成时所用 OpenAI 服务条款及项目发行前法务复核为准；参考图均来自本仓库当前项目素材
- Hurtbox：本批只冻结图像画布和帧序，具体 hurtbox 须在 T2.4 接入前结合运行时显示比例逐只冻结

## 选定输出

| 编号 | 怪物 | 仓库文件 | ImageGen 输出标识 | 后处理 |
| --- | --- | --- | --- | --- |
| E05 | 狂狼妖 | `狂狼妖/狂狼妖4帧（帧大小：512x512）.png` | `exec-fc5d2418-9d5d-4975-a9c6-80398137e800.png` | 标准规则 |
| E06 | 裂魂虫 | `裂魂虫/裂魂虫4帧（帧大小：512x512）.png` | `exec-8c31b112-41c9-41c9-80cc-e3d2debec11c.png` | 标准规则 |
| E07 | 阵法师 | `阵法师/阵法师4帧（帧大小：512x512）.png` | `exec-41853a61-75c4-48ca-b1e1-2e83ee7b46b4.png` | 标准规则 |
| E08 | 魔甲卫 | `魔甲卫/魔甲卫4帧（帧大小：512x512）.png` | `exec-8d1899d5-0bc2-490a-8a58-43ab9e4bb2b5.png` | 标准规则 |
| E09 | 毒蛊师 | `毒蛊师/毒蛊师4帧（帧大小：512x512）.png` | `exec-abcf866a-2e8d-428f-9758-e844180cc1bb.png` | 标准规则 |
| E10 | 魂虫 | `魂虫/魂虫4帧（帧大小：512x512）.png` | `exec-93f2dc12-4023-43d7-80c3-0e1af97cf31e.png` | 保留浅色内部区域；较小占比 |
| E11 | 鬼火怪 | `鬼火怪/鬼火怪4帧（帧大小：512x512）.png` | `exec-9eed448f-1970-4833-af93-be6c6f0bf79f.png` | 保留浅色内部区域；较小占比 |

E05 首次输出 `exec-2adc13a9-df16-49d4-b8e3-762f2e08707c.png` 因画布和帧间距不满足接入要求未选用；随后定向编辑得到上表版本。

## 确定性后处理

- 内置生成结果为 `1774×887 / RGB`，并将透明棋盘格烘焙进背景，不能直接接入。
- `tools/normalize-generated-sprite-sheet.ps1` 从背景边界恢复 Alpha，识别四个主体连通组，按从左到右排序，使用整张图统一缩放并对齐共同基线，最终导出 `2048×512 / RGBA`。
- E10、E11 主体包含大面积浅色发光区域，使用 `-PreserveLightInteriors` 防止身体高光被误判为背景。
- 该处理只改变透明通道、画布、每格位置、统一缩放和基线，不重绘怪物，也不混拼不同生成结果。

## 完整提示词

### E05 狂狼妖

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Images 2–5 are existing enemy sprite-sheet references. Match their anime Chinese-xianxia rendering, clean heavy dark outline, restrained detail density, silhouette readability, 3/4 top-down camera, and subdued dark palette. Do not copy their subjects.
Primary request: Generate the E05 狂狼妖 complete four-frame running sprite sheet as one image.
Subject: one demonized giant wolf with lean athletic body, deep charcoal-gray fur, restrained dark-purple markings, small bone spines along the back, yellow slit-pupil eyes, low crouched predatory stance, facing screen-right.
Animation frames left to right: 1) foreleg stride and hind-leg push; 2) airborne compact gathered pose; 3) opposite foreleg stride and opposite hind-leg push; 4) airborne compact gathered pose. Frames 2 and 4 are distinct transition phases, not duplicates.
Style/medium: polished anime 2D game sprite, Chinese xianxia fantasy, clean closed silhouette, controlled cel shading, dark low-saturation monster colors, readable when displayed small among 160 enemies.
Composition/framing: exact 4:1 horizontal sprite sheet, target canvas 2048×512, four equal 512×512 cells. Exactly one complete wolf in each cell. All four wolves must have identical identity, anatomy, scale, camera angle, right-facing direction, body center, and ground baseline; only limb and body motion phase changes. Center each wolf within its cell and leave safe transparent padding around ears, tail, paws and spines. No frame overlap and no extra spacing bands.
Background: genuinely transparent alpha background.
Constraints: exactly four frames in a single row; no grid lines, dividers, labels, borders, scene, ground, cast shadow, text, watermark, extra creature, detached body parts, cropped tail or paws. Do not render a checkerboard or white background. Do not vary camera, zoom, proportions, costume, colors or facing direction between frames. Original asset only.
```

选定版本的定向编辑提示词：

```text
Edit the previously generated four-frame demon wolf sprite sheet only.

Primary request: preserve the four wolf drawings, their identity, colors, outlines, poses, order, scale relationships, and right-facing direction exactly. Remove the entire visible gray-and-white checkerboard and replace it with genuine alpha transparency; the exported PNG must contain a real alpha channel, not a painted checkerboard and not a solid white background.

Recompose only the canvas and spacing into an exact 4:1 horizontal sprite sheet with four equal square cells in one row, target 2048×512. Put exactly one existing wolf pose in each cell, centered consistently. Align the paws/ground contact to one common baseline. Keep safe transparent padding around tail, ears, paws, and back spines. Do not crop any part of a wolf. Do not add or redraw limbs, effects, shadows, borders, dividers, grid lines, text, labels, watermark, scene, or extra creature.

This is a production game asset. Preserve the subject artwork; change only background transparency, canvas aspect ratio, per-cell centering, and baseline alignment.
```

### E06 裂魂虫

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Images 2–5 are existing enemy-sheet style references. Match their anime Chinese-xianxia rendering, clean heavy dark outline, controlled cel shading, restrained detail, 3/4 top-down camera, and silhouette readability. Do not copy their subjects.
Primary request: Generate the E06 裂魂虫 complete four-frame crawling sprite sheet as one image.
Subject: one elongated segmented soul worm, three to four fleshy spectral segments, subdued dark-purple body, one tiny pale-white soul-flame eye point on each segment, split mouth with small fine spines, unsettling but not gory, facing screen-right.
Animation frames left to right: 1) body fully extended forward; 2) body compressed and curled; 3) opposite wave extension; 4) compressed curl with a distinct phase. Exactly the same creature identity and number of segments in all frames.
Composition/framing: exact 4:1 horizontal sheet, target 2048×512, four equal 512×512 cells. Exactly one worm in each cell. All frames identical scale, camera, right-facing direction, color and body baseline; only crawling phase changes. Center each frame and leave safe padding.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames, one row; no scene, ground, shadow, effects, grid, dividers, labels, border, text, watermark, extra creature, cropped body, detached segments, anatomy drift, camera or zoom change. Dark low-saturation palette; clear closed silhouette readable at small mobile-game size; original asset only.
```

### E07 阵法师

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Images 2–5 are existing enemy-sheet style references. Match their anime Chinese-xianxia rendering, strong clean dark outline, controlled cel shading, restrained detail, 3/4 top-down camera, and silhouette readability. Do not copy their subjects.
Primary request: Generate the E07 阵法师 complete four-frame walking sprite sheet as one image.
Subject: one fallen formation mage facing screen-right, most of the body hidden by a dark teal hooded cloak, only two dim ghost-green eyes visible under the hood, holding one small glowing dark-red formation disc in front of the body, fluttering robe hem. The formation disc is the only strong bright accent.
Animation frames left to right: 1) rightward step; 2) feet and robe gathered neutral transition; 3) opposite rightward step; 4) a second gathered transition with subtle different robe phase.
Composition/framing: exact 4:1 horizontal sheet, target 2048×512, four equal 512×512 cells. Exactly one complete mage in each cell, identical identity, costume, scale, camera, right-facing direction and foot baseline. Only limbs and cloak phase change. Center each frame with safe padding.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames in one row; no scene, ground, cast shadow, spell circle on ground, extra props, extra arms, grid, dividers, labels, border, text, watermark, cropping, anatomy/costume drift, camera or zoom change. Dark low-saturation palette, clean silhouette readable when small; original asset only.
```

### E08 魔甲卫

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Images 2–5 are existing enemy-sheet style references. Match their anime Chinese-xianxia rendering, strong clean dark outline, controlled cel shading, restrained detail, 3/4 top-down camera, and silhouette readability. Use the wooden crossbow puppet only for rendering density and pose language, not subject design.
Primary request: Generate the E08 魔甲卫 complete four-frame heavy walking sprite sheet as one image.
Subject: one broad heavy demonic guard facing screen-right, matte black heavy armor with restrained dark-gold trim and beast-mask shoulder plates, one small tower shield held on the forward arm, dim red eyes through the helmet slit, thick powerful silhouette, restrained metallic highlights.
Animation frames left to right: 1) heavy forward step; 2) feet gathered neutral transition; 3) opposite heavy step; 4) second gathered transition with subtly different shield/armor weight shift.
Composition/framing: exact 4:1 horizontal sheet, target 2048×512, four equal 512×512 cells. Exactly one complete guard in each cell, identical armor design, shield, scale, camera, right-facing direction and foot baseline; only gait phase changes. Center each frame and keep all armor and shield inside safe padding.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames in one row; no weapon other than the small tower shield, no scene, ground, cast shadow, aura, extra character, extra limb, grid, dividers, labels, border, text, watermark, cropping, armor redesign, camera or zoom change. Dark low-saturation palette; readable strong silhouette at small mobile size; original asset only.
```

### E09 毒蛊师

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Images 2–5 are existing enemy-sheet style references. Match their anime Chinese-xianxia rendering, strong clean dark outline, controlled cel shading, restrained detail, 3/4 top-down camera, and silhouette readability. Do not copy their subjects.
Primary request: Generate the E09 毒蛊师 complete four-frame walking sprite sheet as one image.
Subject: one eerie poison-gu cultivator facing screen-right, ragged dark-green long robe, half of the face covered by a small pale mask, two glowing deep-purple poison gourds hanging at the waist, holding/tossing one compact dark-purple poison orb in the forward hand. The purple poison objects are restrained accents, not a large VFX cloud.
Animation frames left to right: 1) rightward step; 2) feet and robe gathered neutral transition; 3) opposite rightward step; 4) second gathered transition with subtle distinct robe and hand phase.
Composition/framing: exact 4:1 horizontal sheet, target 2048×512, four equal 512×512 cells. Exactly one complete poison cultivator in each cell, identical identity, mask, gourds, orb, costume, scale, camera, right-facing direction and foot baseline. Only gait and robe phase change. Center each frame with safe transparent padding.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames in one row; no scene, ground, cast shadow, poison cloud, extra props, extra character, extra limbs, grid, dividers, labels, border, text, watermark, cropping, costume drift, camera or zoom change. Dark low-saturation palette; clear small-size silhouette; no gore; original asset only.
```

### E10 魂虫

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game derived enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project rendering-style anchor. Image 2 is the newly designed adult 裂魂虫 and the mandatory species/anatomy reference. Image 3 is only a reference for small luminous-spirit readability. Create a juvenile derivative of Image 2, not a new unrelated creature.
Primary request: Generate the E10 魂虫 complete four-frame fast-crawling sprite sheet as one image.
Subject: one tiny juvenile soul-worm larva clearly related to Image 2: a much smaller, slimmer body with two or three soft segments, translucent pale cyan-white spectral flesh, no eyes, one softly glowing soul-flame core inside the front segment, no large mouth and no gore, facing screen-right. Its silhouette must read as roughly one-third the mass of the adult monster while remaining legible.
Animation frames left to right: 1) small body extended; 2) compact curl; 3) opposite wave extension; 4) distinct compact curl. Preserve the same juvenile identity and exact segment count in every frame.
Style/medium: same anime Chinese-xianxia 2D game-sprite rendering as references, clean dark outline, controlled cel shading, restrained details, 3/4 top-down camera.
Composition/framing: exact 4:1 horizontal sprite sheet, target 2048×512, four equal 512×512 cells. Exactly one larva in each cell; identical scale, camera, right-facing direction, glow color and floating/crawling baseline; only motion phase changes. Center each frame and intentionally leave generous safe transparent space to preserve its small-creature scale.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames, one row; no scene, ground, cast shadow, aura field, extra creature, extra eye, detached segments, grid, dividers, labels, border, text, watermark, cropping, anatomy drift, camera or zoom change. Original asset only.
```

### E11 鬼火怪

```text
Use case: stylized-concept
Asset type: production-ready 2D mobile-game derived enemy sprite sheet for Cocos Creator
Input images: Image 1 is the primary project style anchor; Image 3 is the existing full-size ghost-flame enemy and the key species reference. Match the project line weight, rendering density and camera. Preserve clear kinship with Image 3 without duplicating its exact silhouette.
Primary request: Generate the E11 鬼火怪 complete four-frame fast-floating sprite sheet as one image.
Subject: one small juvenile ghost-flame spirit, brighter and distinctly smaller-looking than the full-size ghost flame, vivid but controlled ghost-green flame, short compact flame tail, one mischievous tiny dark face inside the flame core, facing screen-right.
Animation frames left to right: 1) calm compact flame; 2) flame stretches forward with a short trailing tail; 3) a second calm phase with subtle flame-tip shift; 4) flame contracts and gathers with a distinct phase.
Composition/framing: exact 4:1 horizontal sheet, target 2048×512, four equal 512×512 cells. Exactly one small flame in each cell, identical identity, scale, palette, camera, right-facing direction and floating baseline. Only flame phase changes. Center each frame, intentionally occupy less of the cell than a normal enemy, while remaining readable at small size.
Background: genuine alpha transparency, never draw a checkerboard.
Constraints: exactly four frames in one row; no scene, ground, shadow, aura field, extra flame, detached decorative particles far from the body, grid, dividers, labels, border, text, watermark, cropping, face/identity drift, camera or zoom change. Clean dark outline and original asset only.
```

## QA 结果

- 7 张均为 `2048×512 / Format32bppArgb`，Alpha 同时包含 `0` 与 `255`。
- 每张四格均非空，所有可见像素均未接触单格边界，未发现跨格串帧。
- 四帧均保持统一朝右、统一身份、统一缩放与共同基线；E10/E11 保留小型衍生怪占比。
- 图片仅位于 `art_sources`，因此本次未执行 Cocos 资源刷新或浏览器运行验收。

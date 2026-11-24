# 慢慢数独 · 简约手账封面 v4

日期：2026-11-04。按用户「简约耐看」及「保留游戏美术风格」反馈，使用内置 `image_gen.imagegen`，以v3的简洁构图为编辑目标、真实对局截图为风格参考。

构图仍只有居中的4×4棋盘和浅鼠尾草绿底色；恢复游戏的暖棉纸、褐色手写数字、暖灰褐手绘格线、绿色答案和蜜桃色描边选中格。通过纸与墨的材质保持手账风格，不增加植物、铅笔、桌面等道具。

原图：`cozy-cover-v4-original.png`，1448×1086，4:3。
生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，保留原有路径和UUID。

按750宽大厅的实际封面槽308.025×231.01875等比缩至308×231，然后使用tinypng-batch压缩最终JPG。独立纹理，不修改Sprite图集。

## 输入图

1. 编辑目标：v3封面，对应源图 `cozy-cover-v3-original.png`，使用其已缩放生产图。
2. 风格参考：`local/cozy-sudoku-fidelity/v9/02-game-9x9.png`，真实游戏对局截图；只参考材质、笔触及颜色。

## 完整提示词

```text
Use case: style-transfer
Asset type: final 4:3 landscape cover for the cozy Sudoku game 慢慢数独.
Input image 1 is the EDIT TARGET: the current minimalist cover. Preserve its simple composition: ONE large centered front-facing 4x4 Sudoku board, generous side margins, same clues and blank cells, no added props.
Input image 2 is a STYLE REFERENCE ONLY: the real game screenshot. Match its warm handmade journal art, creamy cotton-paper surface, rounded hand-ink brown numerals, soft sage-green answer numerals, warm taupe grid and peach outlined selection. Do not copy any HUD, interface controls, decoration or words from image 2.
Primary change: keep the minimalist cover structure but make its actual materials and marks look like the game's warm hand-painted art. It must feel like a quiet close-up of the game's paper Sudoku, not a generic flat productivity app.
Specific changes:
- Replace cold ivory with the same warm cream paper found behind the real game's grid. Very subtle natural cotton-paper fibers and a soft handmade page edge; keep paper bright and clean, no dirty yellow ageing.
- Change the background to a softly painted muted sage notebook cover with very subtle matte material, no weave pattern. Two calm surfaces total: cream paper and sage ground.
- Replace the geometric dark green numerals with rounded cocoa-brown hand-ink digits that closely match the numeral shapes in image 2. Natural stroke variation but highly legible. Keep the two green answer digits sage green #60794F. No scratchy ink or calligraphy.
- Replace the mechanically straight gray grid with careful slightly hand-drawn warm taupe lines, thin cell divisions and modestly stronger 2x2 center separators; one continuous softly rounded outer border. Grid must remain straight-on, exactly 4 rows by 4 columns, equal square cells.
- The blank row3 column3 is the selected cell: pale peach paper interior and a soft peach rounded outline, like the exact game's selected-cell style. No hard solid orange block.
- A tiny soft contact shadow under the paper, restrained softness, no thick rim or 3D bevel.
Numerals MUST remain as in the target:
row1: 1, EMPTY, 3, 4.
row2: 3, 4, green 1, EMPTY.
row3: EMPTY, 1, selected EMPTY, 3.
row4: 4, 3, green 2, EMPTY.
Art direction: minimal composition, warm hand-painted journal materials, gentle human-made marks. The visual character comes from paper, ink and color, not objects or embellishments.
Keep the full 4:3 landscape canvas. No titles or other text, no plants, leaves, flowers, wood desk, pencil, coffee, paperclip, notebook rings, tape, buttons, icons, character, floating tile, glows or extra elements. No viewpoint change, rotation, perspective or composition redesign.
```

生成文件ID：`exec-a45635a2-ea10-47ab-8dfa-1d342be71487`。


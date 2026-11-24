# 慢慢数独 · 晨光手账封面 v2

日期：2026-11-04。使用内置 `image_gen.imagegen` 生成并定点修正，没有使用 CLI。

主题继续采用「晨光手账」：棉纸、淡橡木、鼠尾草绿、可可色墨迹与蜜桃色选中格。以完整 9×9 棋盘和绿色铅笔作为主体，减少边缘杂物，在大厅小卡片中突出数独玩法。

原图：`cozy-cover-v2-original.png`（1448 × 1086，4:3）。
生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，延用现有资源路径和 UUID。

按大厅 750 宽基准计算：左右各 36、列间距 12、两列卡宽 333；封面宽为 333 × (320 − 24) / 320 = 308.025，高为宽 × 3/4 = 231.01875。原图等比缩小为 308 × 231，然后用 tinypng-batch 压缩最终 JPG；本封面为独立纹理，不修改游戏 Sprite 图集。

## 生成提示词

```text
Use case: ads-marketing
Asset type: final production lobby cover illustration for the cozy Sudoku mini-game 慢慢数独, displayed as a small 4:3 landscape card, NOT a screenshot.
Primary request: A beautiful, inviting close-up of a Sudoku puzzle on a handmade cream-paper journal resting on a pale sage linen mat over a light natural oak desk. Make the numeric puzzle instantly recognizable at thumbnail size. Preserve the game's established morning-journal art direction: cotton paper, brown hand-ink numerals, sage green answers, peach selected square, gentle botanical accents.
Style/medium: polished tactile hand-painted editorial illustration with realistic paper and soft ambient shadows, charming stationery art, refined quiet game key art. Creamy bright daylight and a subtle hint of watercolor. Not a photograph, not plastic 3D.
Composition: EXACT 4:3 landscape full-bleed artwork. Close overhead camera with very slight natural rotation. One complete square 9x9 Sudoku grid occupies about 78% of image HEIGHT and 59% of WIDTH, centered slightly left; keep all four corners and a generous cream-paper margin visible. Visible sage journal cover along the left and bottom edges, a small metal paperclip near the upper left journal edge. One elegantly painted sage-green wooden pencil with natural sharpened tip lies diagonally along the RIGHT paper margin, its tip pointing inward toward a highlighted cell. Only a small soft eucalyptus sprig peeks in at the top-left outer corner, with two tiny ivory flowers; leave the remaining composition clean. Soft leaf shadow from morning light, no large dark shadows. Large clear numeric puzzle is the focal point, minimal surrounding props.
Grid: exactly 9 rows and 9 columns, fine warm gray-brown lines and distinctly stronger 3x3 block borders. Sparse clues in dark cocoa rounded handwritten numerals, a few filled answers in sage green. Use these row clues, where a dot means an EMPTY cell and must NOT be printed: row1 "53..7...."; row2 "6..195..."; row3 ".98....6."; row4 "8...6...3"; row5 "4..8.3..1"; row6 "7...2...6"; row7 ".6....28."; row8 "...419..5"; row9 "....8..79". You may add sage answer 4 at row1 column3, sage 1 at row3 column1, sage 5 at row5 column5, sage 4 at row7 column9 and sage 3 at row9 column1. One empty cell row4 column6 has a gentle peach fill and peach rounded outline, no glow explosion. The writing must feel natural, clearly inked with high legibility.
Palette: warm off-white #FAF5E9, sage #819475, pale linen #C3CBB1, cocoa #4A3E34, muted peach #EFAE86, light honey oak. Balanced clean color; avoid yellow cast or brown muddiness.
Constraints: no Chinese text, no English text, no title, no slogans, no letters, no icons, no button, no interface, no hands, no animals, no coffee cup, no extra scattered number tiles, no rewards, no stars, no sparkles, no watermark. Only Sudoku numerals within the board. No notebook rings or spiral binding, no clutter. Deliver a single finished 4:3 cover, not a mockup showing a card on another background.
```

生成文件 ID：`exec-ceacbb0f-e8d7-4284-b770-70588e177a5f`。

## 数字位置修正提示词

参考图：第一版生成图，仅作为编辑目标。

```text
Use case: precise-object-edit.
Edit target: the supplied 4:3 Sudoku journal cover.
Change ONE numeral position only: in the FIRST/TOP row of the 9x9 grid, the dark brown 7 is currently in column 6; move that single dark brown 7 ONE CELL LEFT to column 5 (the exact center column of the full grid). Erase the old 7 from column 6 and restore the same clean paper there. Final top row must be: 5, 3, green 4, EMPTY, dark 7, EMPTY, EMPTY, EMPTY, EMPTY. Ensure the 7 is centered in column5. Do not change the position of any grid lines.
Everything else is invariant: preserve the exact 4:3 canvas, composition, crop, camera angle, all other numerals, ink style, complete 9x9 grid, paper, green pencil, peach empty selected cell, sage journal, leaves, flowers, paperclip, oak, shadows and colors. No other changes, no added words or title.
```

最终文件 ID：`exec-74477096-e0fe-4da9-9267-3d1964ff5e12`。


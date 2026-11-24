# 慢慢数独 · 简约桌面封面 v5

日期：2026-11-04。按用户「棋盘外面给个背景」反馈，使用内置 `image_gen.imagegen`，在v4基础上仅更换棋盘外背景。

保留4×4棋盘、暖棉纸、褐色手写数字、绿色答案及蜜桃色描边选中格；外部新增浅木色桌面和窄边鼠尾草绿亚麻衬底，呼应真实游戏材质。没有增加摆件或装饰，继续保持简约构图。

原图：`cozy-cover-v5-original.png`，1448×1086，4:3。
生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，保留原有路径和UUID。

按750宽大厅的实际封面槽308.025×231.01875等比缩至308×231，然后使用tinypng-batch压缩最终JPG。独立纹理，不修改Sprite图集。

## 输入图

1. 编辑目标：v4封面的已缩放生产图，对应原图 `cozy-cover-v4-original.png`。
2. 风格参考：`local/cozy-sudoku-fidelity/v9/02-game-9x9.png`，仅参考桌面与亚麻材质。

## 完整提示词

```text
Use case: precise-object-edit.
Primary request: Add a calm, simple illustrated tabletop background OUTSIDE the Sudoku board. Preserve the current cover's simple composition and the real game's warm journal art style.
Input image 1 is the EDIT TARGET: the current 4:3 minimal hand-painted Sudoku cover.
Input image 2 is a STYLE REFERENCE ONLY: the actual game screen, for its pale oak and muted sage linen background materials. Do not copy its plants, coffee, controls, title, text, or extra objects.

Change ONLY the area outside the ivory Sudoku board:
- Replace the current plain pale-green ground with a softly illustrated light natural oak tabletop, a restrained warm beige wood tone with just a few delicate broad horizontal grain lines.
- Directly under the board, show a narrow border of muted sage-green linen, echoing the game's notebook backing. Only a thin clean margin around the paper, about 2–3% of the image height. Do not make a large green rectangle fill the background.
- Add a small soft contact shadow where the paper rests on the linen and the linen rests on the wood. Gentle diffuse morning light, evenly readable, no dramatic shadows.
- The visible wood in the side margins should be quiet and uncluttered, with warm ivory/beige rather than saturated orange. Simplified hand-painted texture, no photographic detail.

Absolute invariants: preserve the exact 4:3 canvas, camera, framing, board size and position, full 4x4 grid, irregular paper edge, cream cotton-paper texture, warm brown hand-ink numeral shapes, two sage green answers, selected empty cell with peach rounded outline, all existing digits and blank cell positions. Keep the original board pixel-aligned in appearance. Do not redraw or reinterpret any numbers or the grid. No rotation, perspective changes, enlargement or cropping.

The entire image still contains only three simple material areas: paper Sudoku board, a narrow sage linen backing, and pale oak background. No added objects. No plants, leaves, flowers, coffee, pencil, eraser, paperclip, notebook rings, tape, hands, animals, icons, words, titles, watermark, confetti, sparkles or leaf shadows. Do not introduce decorative patterns or make the background busy.
```

生成文件ID：`exec-746b8ac0-9390-425e-bbfc-2d269ba9b85e`。


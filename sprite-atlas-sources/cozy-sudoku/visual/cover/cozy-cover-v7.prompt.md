# 慢慢数独 · 晨光温度计封面 v7

日期：2026-11-05。按用户「封面优化」反馈并选择「突出玩法、只带一个特殊规则」方向，使用 Cursor `GenerateImage` 在 v6 活页手账构图上重做。

与大厅其他封面对比，v6 低饱和、低对比，缩略图像一张通用数独截图。v7 保留活页纸、装订环、格纹胶带、植物纸贴和折角，新增清晨窗光与右上角树叶光影提高层次；棋盘缩小以露出完整页边；第2列加入游戏同款淡雾蓝灰温度计（单一底部球泡、等宽圆头细管），作为区别于普通数独的视觉焦点。

原图：`cozy-cover-v7-original.png`，1152×864，4:3。
生成草稿：`cozy-cover-v7-draft.jpg`（第二轮输出，温度计形状正确但球泡缺少数字）。原图在草稿上用像素合成补入球泡上的绿色 1：字形与颜色直接取自同图第3行第3列的绿色 1，按球泡外接框居中；其余像素未改动。第三轮生图把第3行第2列的 2 改成了 1，题面失效，已弃用。
生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，保留现有路径和UUID。

按750宽大厅的实际封面槽308.025×231.01875等比缩至308×231，随后使用tinypng-batch压缩最终JPG（31086 → 28056 字节）。独立纹理，无需更改Sprite图集。

## 题面

温度计自第4行第2列（球泡）向上至第1行第2列，数字自下而上严格递增，因此第2列只能是 1、2、3、4。给定数字（褐色）：第1行 1、3；第2行第4列 1；第3行 4、3；第4行第3列 2。绿色为已填答案：温度计上的 1、2 与第3行第3列 1。蜜桃色选中格为温度计上的第2行第2列。唯一解：

```text
1 4 3 2
2 3 4 1
4 2 1 3
3 1 2 4
```

## 输入图

1. 构图与材质：v6 原图 `cozy-cover-v6-original.png`。
2. 温度计样式：真实对局截图 `local/cozy-sudoku-review/v12-final/recipe-thermo-straight.png`。

以下两轮提示词按会话记录整理，措辞与实际调用可能略有出入，要素一致。

## 第一轮提示词

```text
A finished 4:3 landscape lobby cover illustration for a cozy hand-journal Sudoku mobile game. It must read clearly as a small thumbnail (308x231 px) next to bright, saturated game covers.

Reference image 1 is the current cover: keep its art direction (cream cotton-paper journal page on a sage-green fabric journal cover, three antique-brass binder rings at the left, a short sage gingham washi tape at the top edge, a small watercolor olive sprig on a torn peach paper scrap at the lower right with a folded page corner, cocoa hand-inked digits, sage-green answer digits, rounded peach selected cell). Redesign it to be livelier and more distinctive.
Reference image 2 is the real game screen: copy EXACTLY the look of its thermometer rule: a pale misty blue-gray round bulb with a slightly darker blue-gray outline, and a uniform rounded pale blue-gray tube about one third of a cell wide; digits are drawn ON TOP of the bulb and tube.

Composition: close overhead view of the open journal at a gentle 4-degree angle, slightly zoomed out compared with reference 1 so the whole page, its rounded corners and two offset page layers at the bottom are fully visible, with a thin border of the sage fabric cover around it and a sliver of warm light-oak desk at the edges. Bright, fresh early-morning window light from the upper right: a soft warm sunlit glow over the page and delicate, blurred dappled leaf shadows falling across the upper-right corner of the page (not over the digits). Gentle soft drop shadows under the page layers for depth. Clearly more contrast and color than reference 1, but still soft and calm, never neon.

The 4x4 Sudoku grid is hand-inked directly on the page, centered, about 62% of image height, square, cocoa brown ink lines with slightly thicker lines dividing four 2x2 boxes, rounded outer corners. A THERMOMETER runs vertically through the whole SECOND column: the round bulb sits in the BOTTOM cell of column 2, and the tube rises straight up through the cells above it to the top cell of column 2, ending in a rounded cap. It is the most eye-catching special element.

Exact grid content (EMPTY means clean blank paper, no marks):
row1: cocoa 1, EMPTY (thermo tube), cocoa 3, EMPTY
row2: EMPTY, selected cell with pale peach interior and rounded peach outline over the thermo tube, EMPTY, cocoa 1
row3: cocoa 4, sage-green 2 on the thermo tube, sage-green 1, cocoa 3
row4: EMPTY, sage-green 1 on the thermo bulb, cocoa 2, EMPTY
Digits are large, rounded, friendly handwritten numerals, very legible.

Palette: warm off-white paper #FFF8EC, cocoa #433831, sage #6F8A5A, peach #F2B791, misty blue-gray #BFD0D6 with outline #7E949B, antique brass, light oak. Style: polished hand-painted game illustration with soft gouache and watercolor stationery texture, tactile cotton paper. Hierarchy: Sudoku with thermometer first, journal page second, tape and sprig accents third.

Constraints: no title, no text, no letters, no labels, no UI buttons, no stars, no glow effects, no hands, no characters, no pencil, no cup, no extra props or clutter. Only digits inside the puzzle. Full-bleed illustration, no mockup frame.
```

## 第二轮提示词（以第一轮输出为编辑对象，参考图 2 不变）

```text
Edit reference image 1 (the cover draft). Keep EVERYTHING identical: composition, journal page, binder rings, gingham washi tape, leaf shadows, peach paper scrap with olive sprig, folded corner, desk, lighting, grid lines, every digit and its color and position, and the peach selected cell.

Only redraw the thermometer in the second column so it matches reference image 2 (the real game) exactly:
- REMOVE the round knob at the TOP of the tube. The top end must be just the tube itself ending in a simple rounded cap of the SAME width as the tube, inside the top cell of column 2. There is only ONE bulb, at the bottom.
- Keep the single round bulb in the bottom cell of column 2, under the green digit 1, about 70% of the cell width.
- Make the tube a little wider: about one third of a cell wide, perfectly uniform width, straight, joining the bulb smoothly.
- Flat matte painted look like a soft gouache paper cut-out: pale misty blue-gray fill #C3D2D7 with a thin slightly darker blue-gray outline #7E949B on the bulb and tube. NO glass, NO glossy highlights, NO reflections, NO transparency, NO 3D shading.
- Digits stay drawn on top of the tube and bulb. The peach selected cell outline sits on top of the tube in row 2.

No text, no extra elements.
```

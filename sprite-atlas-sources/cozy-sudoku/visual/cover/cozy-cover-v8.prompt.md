# 慢慢数独 · 温度计与奇偶格封面 v8

日期：2026-11-05。用户反馈 v7 的温度计「有点丑」、画面单调，并要求再加一种规则。v7 的温度计由生图模型自行绘制，粗描边、圆头越出格子，与局内样式不一致；v8 改为生图只负责手账背景，规则和数字全部用局内图集原件合成。

- 底图：`cozy-cover-v8-base.jpg`，1152×864，以 v7 草稿为编辑对象生成的空白网格页，保留晨光、树叶光影、胶带、装订环与植物纸贴。
- 原图：`cozy-cover-v8-original.png`，由 `tools/cozy-sudoku/compose-cover.py` 从底图合成，可直接重跑复现。
- 生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，保留现有路径和UUID；等比缩至308×231后使用tinypng-batch压缩（31800 → 28719 字节）。独立纹理，无需更改Sprite图集。

## 合成规则

脚本读取 `assets/game-assets/cozy-sudoku/visual` 下的成品图集，按底图实测网格线逐线线性拟合定位格子（手绘网格略有倾斜），叠放顺序与局内一致：选中格 `cell-selected` → 奇偶底纹 `parity-odd/even` → 温度计 `thermo-pipe/joint/bulb` → 手绘数字 `digit-N`/`digit-N-green`。

为在308×231缩略图中可读，封面相对局内做了三处加强：奇偶底纹不透明度由45%提高到80%，温度计管宽由0.22格加到0.26格、球泡由0.64格加到0.68格，温度计颜色整体压暗14%。其余比例与局内相同（数字墨迹高0.52格、底纹0.70格、选中格为格宽减3）。叠加层最后乘以底图自身的光照（先滤除细网格线再模糊），使右上角树叶光影自然落在底纹和数字上。

## 题面

由 `tools/cozy-sudoku/design-cover-puzzle.py` 穷举4×4解并验证唯一。L形温度计：球泡第4行第2列 → 第3行第2列 → 第3行第3列，数字沿管递增。奇偶格：圆形（奇数）第1行第1列、第3行第4列；方形（偶数）第1行第4列、第3行第1列。

给定数字（褐色）：第1行第3列 3；第2行第1列 3、第4列 2；第4行第1列 4、第4列 3。已填答案（绿色）：球泡 1、第3行第2列 3、第1行第1列 1。选中格为温度计末端第3行第3列。唯一解：

```text
1 2 3 4
3 4 1 2
2 3 4 1
4 1 2 3
```

## 底图提示词（参考图：`cozy-cover-v7-draft.jpg`，4:3）

```text
Edit the reference image (a cozy hand-journal Sudoku game cover). Keep EVERYTHING identical: camera, composition, cream journal page with offset page layers, sage fabric journal cover, three brass binder rings on the left, sage gingham washi tape at the top, warm morning window light, soft dappled leaf shadows in the upper right corner, peach torn paper scrap with watercolor olive sprig and folded corner at the lower right, light oak desk edges, and the hand-inked cocoa 4x4 grid with thicker lines dividing four 2x2 boxes and rounded outer corners, at exactly the same size and position.

The ONLY change: make every one of the 16 grid cells completely EMPTY clean cream paper. Remove ALL digits, remove the blue-gray thermometer tube and bulb entirely, remove the peach selected cell. Inside the grid there must be nothing but the inked grid lines on clean paper with the same subtle paper texture and warm light. Grid lines stay crisp and evenly spaced, all cells equal squares.

No text, no numbers, no symbols, no new objects.
```

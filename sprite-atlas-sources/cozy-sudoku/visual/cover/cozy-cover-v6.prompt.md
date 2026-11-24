# 慢慢数独 · 活页手账封面 v6

日期：2026-11-05。按用户「类似手账背景」反馈，使用内置 `image_gen.imagegen` 重新构图，以真实关卡地图的手账页面为主要美术参考；此前封面只参考题面与数字颜色。

棋盘直接绘在完整活页纸上，保留暖棉纸、褐色手写数字、绿色答案和蜜桃色选中描边。背景由装订环、叠纸页边、格纹胶带、一张植物纸贴及折角体现手账氛围；棋盘仍是主体，不增加杯子、铅笔或场景摆件。

原图：`cozy-cover-v6-original.png`，1448×1086，4:3。
生产资源：`assets/lobby-covers/visual/covers/cozy-sudoku/cozy-sudoku-cover.jpg`，保留现有路径和UUID。

按750宽大厅的实际封面槽308.025×231.01875等比缩至308×231，随后使用tinypng-batch压缩最终JPG。独立纹理，无需更改Sprite图集。

## 输入图

1. 主要美术参考：`local/cozy-sudoku-fidelity/v9/01-map.png`，真实游戏手账选关页。
2. 仅参考题面与数字颜色：v5已缩放封面，对应原图 `cozy-cover-v5-original.png`。

## 完整提示词

```text
Use case: ads-marketing.
Asset type: a beautiful finished 4:3 landscape lobby cover for the warm hand-journal Sudoku game 慢慢数独. It must be inviting and readable at thumbnail size.
Input image 1 is the game's actual hand-journal screen: use as the PRIMARY ART-DIRECTION reference for the creamy journal paper, illustrated stationery, ink, watercolor detail, sage / peach palette and tactile layering.
Input image 2 is the previous rejected cover: use ONLY for the 4x4 Sudoku clue arrangement and brown / green numeral colors. Completely redesign its presentation. Do not retain its isolated square board on an empty wooden ground.

Primary request: an attractive, restrained HAND-JOURNAL composition. The Sudoku is drawn directly on the warm paper page of a real illustrated journal. Give the cover the charm of a thoughtfully composed journal spread, while keeping one strong focus and just a few meaningful details.

Composition: landscape 4:3; close overhead view of a cream-paper journal page on a sage fabric cover, at a subtle 3-degree natural angle. The journal page fills almost the whole image. At the far left, show a narrow hint of the journal spine and THREE small antique-brass binder rings to unmistakably establish the journal. Show the creamy page edges and a couple of offset page layers at the bottom. Very little desk visible, just a quiet slim warm-beige perimeter.
The 4x4 Sudoku grid is hand-inked directly INTO the central paper page, NOT a separate raised square game tile or board. It is the clear dominant subject: about 72% of image height, centered slightly left, with a comfortable blank paper margin around every grid edge. Large cocoa handwritten digits and a peach outlined empty cell. Keep the complete grid visible and square, with slightly thicker central lines dividing four 2x2 blocks.
Journal details, strictly limited to TWO small accent groups: one short torn strip of pale sage gingham washi tape near the upper paper edge, and one small watercolor olive sprig on a torn peach paper scrap tucked at the LOWER RIGHT page margin. Add a modest folded page corner nearby. These accents occupy very little area and must not overlap the grid or numbers. Quiet blank paper between accents. No filler marks.

Exact grid, EMPTY means show clean blank paper:
row1: dark 1, EMPTY, dark 3, dark 4.
row2: dark 3, dark 4, sage-green 1, EMPTY.
row3: EMPTY, dark 1, EMPTY selected with pale peach interior and rounded peach outline, dark 3.
row4: dark 4, dark 3, sage-green 2, EMPTY.

Style: polished hand-painted game illustration with soft gouache / watercolor stationery character, tactile bright cotton paper, delicate warm shadows, gently irregular brown ink. Match the reference game's natural hand-journal aesthetic. Warm off-white paper, cocoa #433831 digits, muted sage #82906E, peach #F2B791, a little antique brass. Bright soft window light; fresh and cozy, not antique, stained, dark or sepia.
Keep a simple hierarchy: Sudoku first, paper journal second, tiny tape and botanical accent third. Give the page enough layered material and editorial asymmetry to feel lovingly journaled, not a generic app grid or a placemat.

Constraints: NO title, English or Chinese lettering, captions, labels, UI controls, trophies, stars, glows, floating number tiles, hands, characters, pencil, coffee, desk clutter, photorealistic decoration, elaborate scenery or a collage of many objects. Only digits inside the puzzle. Do not produce a product mockup with extra surrounding canvas. Full-bleed final 4:3 illustration.
```

生成文件ID：`exec-7cd23dbd-5006-4623-881b-abdfbab5f514`。


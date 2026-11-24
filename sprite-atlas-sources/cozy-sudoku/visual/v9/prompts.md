# v9 棋盘规则材质

使用内置imagegen生成，参考真实Cocos棋盘截图，输出透明背景的2列×3行组件表。最终原图为 `board-rules-original.png`，经过透明边缘修订。初稿保留在 `board-rules-draft-glow.png`，仅记录生成过程，未用于游戏。

## 完整提示词

Use case: stylized-concept.
Asset type: production transparent sprite sheet of six small 2D board-rule components for a cozy handwritten watercolor Sudoku game. The attached game screenshot is a STYLE REFERENCE for the warm paper, muted ink and gentle handmade aesthetic; do not copy its glossy bright blue thermometer. Render only the isolated components, no UI mockup.
Composition: exactly TWO columns by THREE rows, generous transparent gutters between every cell. Keep every component completely inside its own cell.
Top left: a perfectly round thermometer start bulb, flat very pale muted blue-gray wash #DDE8E8, a delicate muted blue-gray rim #A9BCBE. Filled center is nearly opaque and almost uniform so a dark game numeral stays readable over it. No neck, no gloss, no white shiny highlight, no shadow.
Top right: one horizontal rectangular tube strip, aspect about 6:1. Entire inner surface is the SAME pale blue-gray #DDE8E8 as bulb, nearly uniform opaque watercolor wash; softly antialiased top/bottom edges; open straight cut ends, no outline at either end. No dark rim, no caps, no 3D. This texture must join and tile seamlessly.
Middle left: a solid circular round tube junction/end cap, same pale blue-gray #DDE8E8 and same flat opaque fill as strip, no outline, no shine, no shadow. Perfectly round.
Middle right: a hollow perfectly circular arrow-sum ring, muted sage-green fine hand-ink outline #8F9F79, stroke about 4% of diameter, TRUE TRANSPARENT empty center and outside. No colored fill, no number, no shadow.
Bottom left: one small clean open arrowhead pointing RIGHT ( > ), two rounded sage-green ink strokes #8F9F79 with consistent weight matching the ring. True transparency; do not add a shaft or tail.
Bottom right: a small square/symmetric circular patch of warm ivory paper #FFF8E9, solid center fading smoothly to fully transparent soft feathered edges. No outline, no glow, no shadow or distinct silhouette. This is an unobtrusive backing behind dark numerals over rule lines.
All six are clean, restrained, readable at small mobile size, matte 2D watercolor / hand-ink. Actual transparent background. No letters, numbers, labels, grids, decorations, buttons, glitter, glass/plastic highlights, or cast shadows.

## 透明边缘修订提示词

Use case: precise-object-edit.
Edit target: the supplied transparent six-component sprite sheet.
Keep the exact two-column/three-row layout, the same six shapes, soft matte watercolor texture and muted pale blue-gray / sage / ivory colors.
Make ONE production cleanup: remove all unwanted colored fog, glow, blur and aura around the first FIVE components. Their backgrounds must be literal zero-alpha transparency. Keep only the sharply defined circular bulb, rectangular tube strip, small circular junction, thin circular ring and right-facing open arrowhead themselves. Antialias only within about ONE pixel of their silhouettes. No ambient halos or shadows. Empty gutters must be fully transparent all the way between every sprite.
Critically: the sage ring's entire INNER circle must be fully transparent too; no green wash inside it. The blue strip has a uniform opaque interior right up to its straight cut ends and must tile cleanly.
The sixth object, bottom right, is a small ivory paper backing: keep a solid pale ivory center and a modest feathered edge confined closely to the patch itself; reduce the giant luminous surrounding glow. No glow or light cast on anything.
Do not add grid, numbers, labels, outlines on the strip/junction, extra components, gradients across the canvas, drop shadows, glass/plastic shine, or backgrounds. True transparent PNG cutouts suitable for packing directly into a mobile game sprite atlas.

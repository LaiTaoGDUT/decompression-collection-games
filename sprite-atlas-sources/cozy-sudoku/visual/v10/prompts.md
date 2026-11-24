# v10 · 奇偶格、不等号、对角线

使用内置 `image_gen.imagegen`；最终原稿为 [new-rules-original.png](new-rules-original.png)。透明输出，保留真实 Alpha。

生成结果：`exec-9a2abd21-b2b6-4eef-a068-0253e6afa4cf.png`，已从生成目录复制进项目。

```text
Use case: stylized-concept. Asset type: production sprite sheet for a calm watercolor paper sudoku game named 慢慢数独. Generate exactly FOUR isolated game sprites on a genuinely transparent background, arranged as a spacious regular 2-column by 2-row sheet, each sprite entirely in its own quadrant and with generous transparent gutters. No labels or text. Top-left: a pale dusty peach filled circle, flat lightly speckled watercolor wash on cotton paper, perfectly round, very subtle irregular pigment edge, no border. Top-right: a pale muted blue-gray filled square with very slightly rounded corners, same watercolor paper texture, no border. These two markers will sit behind dark brown sudoku digits: keep them pale and readable but visibly different shapes. Bottom-left: one clean dark warm brown greater-than sign >, balanced hand-inked strokes with rounded tips, upright, centered; no shadow and no other mark. Bottom-right: one long thin perfectly horizontal pale straw-yellow watercolor ribbon strip, approximately 6:1 aspect ratio, flat uniform thickness through its middle, barely feathered edges, no outline, no highlights, no shadows. The ribbon will be tiled as diagonal sudoku bands. Restrained warm cream, peach, gray-blue and straw pigments; simple handmade stationery aesthetic, no objects, no decorative leaves, no plastic, no glow, no white rectangular background. Keep all four sprites flat and front-facing with actual alpha transparency.
```

原稿 1536×1024。按实际透明留白裁出 4 帧，按 750 宽设计基准的最大显示尺寸等比缩小，使用 `sprite-atlas-sources/build.py` 合成 `visual/v10/new-rules` 图集。对角线取金色条中段作平铺材质；纸纹和符号均来自生图，实时网格、位置、旋转和教学数字由游戏数据驱动。

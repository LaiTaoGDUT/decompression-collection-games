# 路线版选关定稿与拆图

使用内置 imagegen。用户选定 `map-approved-original.png`（exec-4048a458）作为选关页定稿，保留每页六关、蛇形路线和圆形关卡。原始文件在本目录，合图配置由 `tools/cozy-sudoku/build-art.py` 生成。

输出对应：paper → `map-paper-original.png`（exec-f986088b），route → `map-route-original.png`（exec-2ad35ed0），pieces → `map-pieces-original.png`（exec-b613e047）。前两项由 image-resize 等比转换到750×1334；背景使用cover，透明路线使用contain。图集统一从这些母版裁切和缩小，不用程序重绘美术。

+## paper

Use case: precise-object-edit. Production asset extraction from the attached APPROVED mobile game screen. Keep the original portrait canvas/aspect and exact pixel-aligned composition. Extract only the clean ivory cotton-paper notebook BACKGROUND with its very thin dark sage spine and three brass loops along the far left. Preserve the exact paper color, lighting and fine texture. Erase every UI element: all title/caption lettering, all numerals, circles, checks, labels/tape, arrows, trail dashes, all buttons. Also erase BOTH watercolor scenic vignettes (left stone stairs and right cottage), all plants, flowers and leaves. Seamlessly restore continuous blank paper under the erased objects. Remove the small bottom horizontal wooden strip so paper bleeds right through the bottom edge. The central95% of the page is uninterrupted blank ivory paper top-to-bottom. Preserve only the thin far-left binding and loops. No redesign, no new marks, no gradient blocks, no text, no frames or UI. Opaque background.

## route

Use case: background-extraction. Production bitmap extraction, the supplied approved screenshot is the exact EDIT TARGET. Keep the same portrait aspect ratio and relative positions on the same canvas. Extract ONLY these existing objects at their original size and placement: (1) the brown dashed meandering route connecting the six level buttons, preserving exact hand-ink curves and tiny dash irregularities; (2) the watercolor stone steps/greenery vignette on the middle LEFT, with its naturally fading outer paint edges; (3) the cottage/greenery vignette on the lower RIGHT, plus the few tiny drifting leaves below it. Preserve the exact approved artwork, color, texture, scale and placement; no redesign. Remove ALL paper, book/spine/loops, ALL six numbered circular buttons including their backgrounds, numbers, shadows, glows, checkmarks and times, the new-rule note and its arrow, top title/leaves/back button, and the entire pagination/footer. Where circular nodes used to cover the route, leave a TRANSPARENT round gap of the original circle diameter; do not add any new lines crossing those gaps. No ghost numbers, circles or checkmarks. The original route and the two peripheral illustrations must be the only visible objects; everything else has genuine zero alpha. Canvas must retain generous original blank/transparent space around the exact-position objects. Background removal only, no rearrangement or sprite sheet.

## pieces

Use case: background-extraction. Extract the exact UI materials from this approved cozy Sudoku screen into ONE neatly organized production sprite sheet, TWO columns and THREE rows, six isolated objects total, broad transparent gutters. Portrait3:4 aspect with enough pixels to preserve fine details. Preserve actual approved materials, drawn strokes, paper fibers, colors, text style and silhouettes; do not reinterpret. Each object fully isolated on TRUE TRANSPARENT background:
ROW1 LEFT: the exact Chinese handwritten title “小日子数独” together with only its small olive sprigs to both sides; erase all notebook paper, the subtitle and back button. Title is the only remaining lettering anywhere on this sheet.
ROW1 RIGHT: exact peach torn washi new-rule note with blue gingham tape and lower-left tiny olive sprig. ERASE the entire black wording and all annotation arrow lines, fill with the existing peach paper. Blank note, same slight upward tilt.
ROW2 LEFT: exact cream round normal level token from level3/5, thin irregular brown pencil rim and tiny contact shadow. ERASE number, check seal and time completely. Plain clean blank circle.
ROW2 RIGHT: exact current level6 round peach token, delicate orange double rim and three small orange sun rays at upper-right. ERASE ONLY the number6 and dashed trail. Preserve orange silhouette, warm glow and rays, no numeral.
ROW3 LEFT: exact large sage green primary capsule button from the bottom, including its thin double cream/brown border, subtle paper texture and small ivory botanical sprigs at left and right. ERASE all text and the white right arrow, preserving green fill under them. Entire button, no cropping.
ROW3 RIGHT: one exact sage green circular completed-check seal with its white tick, cropped from a completed node. No underlying level circle, digit or paper.
No other components, no labels, no grid lines, no paper background, no extra ink, no captions except the specified title, no container shadows. Genuinely transparent alpha between and outside all six objects. Keep each shape's natural aspect ratio.


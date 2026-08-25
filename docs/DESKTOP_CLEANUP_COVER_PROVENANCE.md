# 《桌面大清理》大厅封面素材记录

- 资产：`assets/lobby/visual/covers/catch/desktop-cleanup-cover-v1.jpg`
- 用途：大厅游戏卡片封面；属于大厅展示副本，不进入 `game-catch` 游戏 Bundle。
- 生成方式：内置 `image_gen` 直接生成，未使用 `image-prompt`。
- 生成日期：2026-08-25
- 生成输出：`exec-eaa95f8e-5d8d-4cf7-81cd-b06d98bf6cbf.png`
- 原始输出：`/Users/laitao/.codex/generated_images/01a0385c-9bc3-7ae0-b6e8-9f7d78439040/exec-eaa95f8e-5d8d-4cf7-81cd-b06d98bf6cbf.png`
- 交付格式：转换为 JPEG 后覆盖原有 `desktop-cleanup-cover-v1.jpg`，保留现有资源路径和 `.meta` 引用。
- 设计调整：从单纯的桌面静物改为玩法可读的关键画面；上方为可挑选的杂物堆，下方为七格收纳槽，前三格放置三个同类金色花朵徽章并用柔和亮点表示完成匹配，剩余四格为空。
- 验收：封面无中文、英文、数字、Logo、品牌标识、水印或其他文字；主体没有被裁切，七格槽体可辨识，画面适合大厅卡片缩略图。

## 最终生成提示词

```text
Use case: stylized-concept
Asset type: gameplay-readable lobby cover art for a portrait mobile puzzle game card
Input images: Image 1: current clean cover as a visual style and palette reference; do not preserve its static arrangement
Primary request: create a polished replacement cover that makes the gameplay instantly understandable without any words. Show a colorful, slightly messy pile of soft-clay desktop objects on the upper and central area of a cream desk mat, with clearly distinct objects to sort: mint notebooks, coral pencils, teal rounded gadgets, purple round objects, and mustard-gold flower/star tokens. In the lower foreground, show a tactile seven-slot cream collection tray with exactly three matching mustard-gold flower/star tokens already placed together in the first three slots, while the other four slots remain empty. Make the matching action feel satisfying with a subtle soft glow and tiny clay sparkle particles around the completed trio, plus two or three matching gold tokens still visible in the pile so the player understands “find three of a kind and place them into the tray”. The contrast between the messy pile and the orderly bottom tray should communicate the cleanup-and-match loop at a glance.
Scene/backdrop: warm walnut tabletop, cream desk mat, simple cozy desk context only at the far edges
Style/medium: polished 3D soft-clay miniature game key art, tactile handmade surfaces, rounded edges, premium mobile-game cover
Composition/framing: landscape 4:3, slightly elevated three-quarter view, gameplay pile in upper two-thirds, seven-slot tray clearly visible along lower foreground, centered and readable at small card size, safe margins for card cropping
Lighting/mood: warm afternoon desk-lamp glow, gentle soft shadows, cheerful, satisfying, clear action hierarchy
Color palette: walnut brown, cream, mint green, coral orange, teal blue, purple, mustard gold
Materials/textures: matte polymer clay, soft wood, slightly raised tray slots, clean polished highlights
Text (verbatim): none
Constraints: absolutely no text, no Chinese characters, no English letters, no numbers, no writing-like glyphs, no logos, no brand marks, no watermark, no title plate, no labels, no signage; use exactly seven tray slots, exactly three matching gold tokens in adjacent tray slots, four empty slots; illustration-only gameplay key art
Avoid: static still-life composition, objects hiding the tray, dense unreadable clutter, cropped main objects, fake UI text, random glyphs, arrows made of writing, branded devices, checkerboard background
```

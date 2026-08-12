# 商业休闲游戏大厅 V2 生成记录

> 记录 ID：`LOBBY-ARCADE-V2`
>
> 生成日期：2026-08-11
>
> 视觉所有者：大厅

## 方向与参考

用户提供一张竖屏小游戏大厅截图作为风格和构图参考。正式资源只复用其高层视觉语言：蓝粉光束背景、顶部立体游戏 Logo、明亮商业休闲游戏质感；没有复制截图中的游戏封面、角色、商标或卡片内容。

## 正式资源

| 资源 | 路径 | 处理 |
| --- | --- | --- |
| 蓝粉光束背景 | `assets/lobby/visual/backgrounds/lobby-arcade-rays-v2.png` | ImageGen 原创输出，缩放至 750×1334，无 Alpha |
| 中文大厅 Logo | `assets/lobby/visual/branding/lobby-cn-title-logo-v3.png` | 以项目自有 V2 Logo 为编辑目标，将文字替换为“休闲解压 / 小游戏大全”；绿色键控抠图、柔化边缘、去溢色，缩放至 768×512 透明 PNG |
| 暖色大厅背景 V3 | `assets/lobby/visual/backgrounds/lobby-arcade-warm-rays-v3.png` | ImageGen 基于项目自有 V2 背景进行 `lighting-weather` 编辑；保持中央留白与边缘手柄构图，改为珊瑚橙、杏色、暖金和奶油色，缩放至 750×1334 RGB |

## 背景提示词

```text
Create an original high-polish commercial casual-game lobby background using the user image only as a style and composition reference: luminous sky-blue lower field blending into pink near the top, broad diagonal light rays, tiny sharp star sparkles, glossy atmospheric bloom, clean central logo and card zones, and partial abstract controller silhouettes cropped at the extreme edges. Portrait 750:1334, premium mobile-game 2.5D illustration. No text, logo, cards, buttons, copied game imagery, characters, or watermark.
```

## 中文 Logo 编辑提示词

```text
Replace only the English lettering in the project-owned V2 logo. The top line must read exactly “休闲解压”. The bottom line must read exactly “小游戏大全”. Preserve the compact two-line composition, chunky rounded 2.5D lettering, royal-blue layered outline, glossy highlights, controller, stars, confetti, silhouette, lighting and bevel depth. Top line golden yellow to coral orange; bottom line vivid sky blue. Flat #00FF00 chroma-key background; no English letters, extra Chinese characters, existing game logos, or watermark.
```

## 暖色背景 V3 编辑提示词

```text
Use case: lighting-weather
Asset type: production portrait background for a commercial casual mobile-game lobby
Input image: the existing project-owned lobby background is the edit target. Preserve its overall composition, diagonal light-ray direction, clean central negative space for the Chinese logo and two game cards, small sharp sparkles, and partially cropped game-controller props at the extreme left and lower-right edges.
Primary request: regenerate the background in a clearly warm, premium commercial palette. Replace the cold cyan/blue field and neon magenta cast with luminous apricot, peach, coral, warm cream, soft golden yellow, and restrained rosy-orange gradients. Make the center bright warm ivory, the top a richer sunset peach/coral glow, and the lower area a light honey-cream/soft apricot atmosphere. Keep enough color saturation and contrast that the lobby does not look washed out.
Style/medium: polished 2.5D casual mobile-game illustration, glossy atmospheric bloom, high-end app-store-ready finish.
Composition/framing: portrait 750:1334; keep the center and card zones uncluttered; edge props must remain secondary and cropped.
Lighting/mood: cheerful, cozy, energetic, warm morning/sunset arcade glow.
Constraints: background only; no text, no logo, no cards, no UI panels, no buttons, no characters, no cats, no game cover art, no watermark. Do not modify or recreate the settings modal or the cat-game cover. Avoid dominant blue, cyan, purple, or magenta. Preserve the original aspect ratio and functional negative-space layout.
```

执行模式：Codex 内置 ImageGen。

## 验证

- 两张资源均已由 Cocos 资源数据库导入到 `lobby` Bundle。
- Logo 透明边缘与中文文字拼写已人工检查。
- 大厅脚本通过 TypeScript 检查；背景与 Logo 使用运行时 Texture 路径加载。

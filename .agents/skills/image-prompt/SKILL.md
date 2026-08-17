---

name: image-prompt
description: Analyze the current project and generate high-quality image generation prompts   for use in ChatGPT. Use this skill whenever the project needs new image assets,   UI assets, game art, icons, backgrounds, characters, effects, textures, or other   visual resources. Do NOT generate images directly. Output prompts that the user   can copy into ChatGPT to generate the required images.

---

# Image Prompt Skill

## Purpose

This skill is used when the current project requires image assets.

The goal is NOT to generate images directly.

Instead:

1. Analyze the current project.
2. Understand the asset's actual usage.
3. Inspect existing visual assets and styles when available.
4. Determine appropriate visual specifications.
5. Generate a high-quality image generation prompt.
6. Let the user copy the prompt into ChatGPT to generate the image.

## Critical Rule

**NEVER generate images directly.**

Do NOT:

- Call image generation models.
- Call GPT-Image or other image generation APIs.
- Use image generation MCP/tools.
- Spend image-generation credits.
- Automatically create image assets through external generation services.

Even if image generation tools are available, DO NOT use them.

Your responsibility ends at producing the image generation prompt.

---

# Workflow

When the user requests a new visual asset, follow this process.

## Step 1 — Understand the Asset

Determine what the asset actually is.

Examples:

- Game character
- Enemy
- NPC
- Item
- Weapon
- Skill icon
- UI icon
- Button
- Panel
- Card
- Background
- Scene
- Decoration
- Particle/effect texture
- Hit effect
- Explosion
- Slash effect
- Logo
- Promotional image
- Loading image
- Sprite
- Texture

Do not immediately write a generic prompt.

First understand how the asset will actually be used.

---

## Step 2 — Inspect the Project

When possible, inspect the current project before generating the prompt.

Look for:

- Existing image assets
- Similar assets
- UI screenshots
- Art style
- Color palette
- Character proportions
- Line style
- Shading style
- Camera angle
- Perspective
- Asset dimensions
- Naming conventions
- Target platform
- Rendering engine
- Existing design documentation

Prefer matching the existing project over inventing a new visual style.

If the project already contains a visually similar asset, use it as the primary style reference.

---

## Step 3 — Determine Usage

Understand where the generated image will appear.

For example:

### Game UI

Determine:

- Actual display size
- Whether the image is stretched
- Whether it needs 9-slice support
- Whether text will be placed over it
- Whether it needs transparent margins
- Whether it must remain readable at small sizes

### Game Object

Determine:

- Camera perspective
- Character orientation
- Required silhouette
- Animation compatibility
- Whether the object needs transparent background
- Whether it will overlap other objects

### Visual Effect

Determine:

- Effect center
- Direction
- Energy flow
- Required empty space
- Additive blending compatibility
- Whether black background or transparent background is preferable

### Background

Determine:

- Aspect ratio
- Camera perspective
- Playable area
- Foreground/background separation
- Whether UI will cover parts of the image
- Areas that should remain visually quiet

---

# Image Specifications

Determine appropriate specifications before writing the final prompt.

Consider:

## Dimensions

Prefer dimensions based on actual usage.

Examples:

- Icon: 1:1
- Character portrait: 1:1 / 3:4
- Mobile game screen: 9:16
- Landscape game background: 16:9
- Banner: based on actual UI dimensions

If the project contains exact dimensions, use them.

Do not invent arbitrary dimensions when they can be determined from the project.

---

## Background

Explicitly determine whether the asset requires:

- Transparent background
- Solid background
- Scene background
- No background

For standalone game assets, icons, characters, items, and effects:

**Prefer transparent background unless the project indicates otherwise.**

If transparency is required, explicitly state:

> isolated asset, transparent background, no environment, no background objects

---

## Composition

Specify:

- Subject position
- Direction
- Camera angle
- Perspective
- Empty space
- Cropping
- Relative scale
- Center of gravity

Avoid prompts that leave important composition decisions completely unspecified.

---

# Style Matching

Style consistency is more important than making a single asset visually impressive.

When existing assets are available, analyze:

- Shape language
- Edge softness
- Line thickness
- Saturation
- Contrast
- Lighting
- Material rendering
- Texture density
- Detail density
- Perspective
- Proportions

Describe these characteristics explicitly in the prompt.

Avoid vague descriptions such as:

> beautiful game art

Prefer concrete descriptions such as:

> soft hand-painted 2D game illustration, slightly exaggerated proportions, clean silhouette, low-detail texture, warm muted palette, soft directional lighting, subtle edge highlights

---

# Game Asset Principles

For game projects, prioritize usability over illustration quality.

The generated asset should:

1. Have a clear silhouette.
2. Remain readable at its actual display size.
3. Avoid unnecessary tiny details.
4. Match surrounding assets.
5. Avoid excessive lighting effects.
6. Avoid uncontrolled background elements.
7. Avoid text unless explicitly required.
8. Avoid watermarks.
9. Avoid decorative elements that interfere with gameplay.
10. Be easy to integrate into the game engine.

---

# UI Asset Principles

For UI assets:

- Keep shapes clean.
- Preserve readable boundaries.
- Avoid excessive texture noise.
- Avoid fake text.
- Avoid random symbols.
- Avoid unnecessary highlights.
- Avoid overly realistic materials unless the project uses them.
- Leave sufficient safe areas for text when required.

If the asset will contain dynamic text, DO NOT generate the text as part of the image.

Generate the visual container only.

---

# Prompt Construction

The final image prompt should contain these sections when relevant:

1. Asset identity
2. Usage
3. Main subject
4. Composition
5. Art style
6. Color
7. Lighting
8. Material
9. Perspective
10. Background
11. Technical constraints
12. Elements to avoid

The prompt should describe the desired result positively and precisely.

Do not overload the prompt with meaningless adjectives.

---

# Reference Images

If the project contains reference images, mention them explicitly in the final instructions.

For example:

> Use the provided reference image as the primary visual style reference. Match its color palette, proportions, rendering style, lighting softness, outline treatment, and level of detail.

If multiple references exist, explain what should be taken from each reference.

Example:

> Reference image 1: use its overall art style and color palette. Reference image 2: use its composition and character pose. Do not copy unrelated objects from either reference.

---

# Output Format

Always output the result in the following format.

## Asset

Briefly state what asset is being created and where it will be used.

## Recommended Settings

- Aspect ratio:
- Recommended size:
- Background:
- Asset type:
- Reference image\(s\), if any:

## ChatGPT Image Prompt

Provide ONE complete prompt that can be copied directly into ChatGPT.

The prompt should be self-contained.

The user should NOT need to rewrite it before using it.

## Notes

Only include notes when necessary.

Examples:

- Recommended cropping instructions
- Engine integration considerations
- Whether additional variants should be generated
- Whether the asset should later be manually cleaned up

---

# Prompt Language

By default, output the final image-generation prompt in **Chinese**.

Use clear and natural language optimized for ChatGPT image generation.

English terminology may be used when it improves precision, especially for:

- camera terminology
- rendering terminology
- game-development terminology
- aspect ratios
- visual-effect terminology

Do not translate established technical terms unnaturally.

---

# Example

User request:

> 给我做一个敌方棋子落盘时的冲击特效。

Expected behavior:

First inspect the project's chess pieces, board, effects, and visual style.

Then output something similar to:

## Asset

敌方棋子落盘瞬间使用的 2D 冲击特效，显示在棋子底部。

## Recommended Settings

- Aspect ratio: 1:1
- Recommended size: 1024×1024
- Background: Transparent
- Asset type: 2D VFX texture

## ChatGPT Image Prompt

生成一个用于中国象棋休闲游戏的 2D 落子冲击特效素材。

画面中央是棋子快速落到木质棋盘后产生的一圈短促冲击效果，以中心向外扩散。冲击主体由浅色尘雾、细小木屑和非常克制的圆形冲击波组成，力量集中在中心区域，外围迅速衰减。

整体风格需要与轻度国风、温暖木质感的休闲游戏一致，不要做成写实爆炸，也不要出现魔法能量、闪电或金属火花。

俯视视角，特效中心位于画面正中央，四周保留充足透明空间。轮廓清晰，在手机游戏中缩小显示后仍然能够辨认。

只生成冲击特效本身，不生成棋子，不生成棋盘，不生成场景，不生成文字。

透明背景，独立游戏素材，1:1 正方形构图，高分辨率。

避免：写实爆炸、火焰、金属火花、复杂烟雾、大量粒子、文字、水印、棋子、棋盘、背景场景。

## Notes

建议生成后作为独立 VFX 贴图使用，在游戏中通过缩放 + 透明度衰减动画实现落子冲击效果。

---

# Final Rule

Whenever the user asks for an image asset:

**Analyze first → generate prompt → stop.**

Never proceed to image generation automatically.

Only provide the prompt for the user to take to ChatGPT.
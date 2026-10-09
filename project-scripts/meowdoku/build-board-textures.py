#!/usr/bin/env python3
"""生成猫咪数独棋盘的果冻质感贴图，材质参数按大厅封面实测取值。

封面格子放大看是
一块**微微鼓起的软板**，没有侧壁：中间是平的顶面，四边一圈约 8% 宽的圆润斜边；
光从右上来，上边、右边的斜边亮，左边、下边略暗；右上圆角一小段亮光；
底边一道很细的暗线，几乎没有投影。

产物：

1. `meowdoku-tile-v2.png`：512×256 图集，按 `MEOWDOKU_TILE.sheet` 切两帧。
   - 帧 0 `body`：灰度本体，运行时按区域色染色（乘法）。顶面灰度 1 = 色板原色，
     背光的斜边略暗，外圈是极淡的投影。
   - 帧 1 `gloss`：白色高光（向光斜边 + 四周外缘细亮线 + 右上圆角的柔和弧形高光），不染色，叠在本体之上。
   斜边明暗按「斜边法线 · 光照方向」计算，斜率越靠外越陡。
   两帧都以边长 `BODY` 的方块为格子本体，四周留 `MARGIN` 给投影，
   运行时节点尺寸 = 格子边长 × FRAME / BODY。
2. `meowdoku-cross-bar-v2.png`：叉的单根笔画（胶囊形），截面做成圆鼓鼓的柱面明暗。
   明暗只取决于到中轴的距离，旋转 ±45° 后两根笔画受光一致；运行时整体染色
   （白叉 / 错误红叉共用）。
3. `meowdoku-cross-shadow-v1.png`：单根笔画的柔和投影（白色 + alpha，运行时染成投影色），
   四周按笔画粗细 × `CROSS_SHADOW_PAD` 留边给模糊。运行时每根笔画一张，两张都排在两根笔画之前绘制
   （投影只落在格子上，不压另一根笔画），按屏幕向下偏移，显隐与生长长度和笔画同步。

用法：
    python3 project-scripts/meowdoku/build-board-textures.py
    python3 project-scripts/meowdoku/build-board-textures.py --preview out.png  # 额外输出染色预览

棋盘保留为运行时独立纹理；叉笔画和投影写入 sprite-atlas-sources 下的源图片，
再通过 sprite-atlas-sources/build.py 生成正式图集。
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
EFFECT_DIR = ROOT / 'assets/game-assets/meowdoku/visual/effect'
SOURCE_EFFECT_DIR = ROOT / 'sprite-atlas-sources/meowdoku/visual/effect'
TILE_OUTPUT = EFFECT_DIR / 'meowdoku-tile-v2.png'
CROSS_OUTPUT = SOURCE_EFFECT_DIR / 'meowdoku-cross-bar-v2.png'
CROSS_SHADOW_OUTPUT = SOURCE_EFFECT_DIR / 'meowdoku-cross-shadow-v1.png'

# 与 MeowdokuTheme.ts `MEOWDOKU_TILE` 保持一致。
FRAME = 252
PAD = 2
BODY = 212
MARGIN = (FRAME - BODY) // 2

SS = 3  # 超采样倍数，抗锯齿后再缩小
CORNER = 0.13  # 圆角 / 边长
BEVEL = 0.07  # 斜边宽度 / 边长
LIGHT = (0.7, -0.7)  # 光照方向（图像坐标，y 向下）：右上方
BEVEL_LIGHT = 0.48  # 向光斜边的白色高光 alpha
BEVEL_SHADE = 0.12  # 背光斜边的压暗量
BEVEL_PROFILE = 0.6  # 坡度曲线指数：<1 时斜边是一条均匀的窄带，与顶面之间有清楚的内轮廓
RIM_LINE = 0.014  # 向光外缘细亮线宽度 / 边长
RIM_LINE_LIGHT = 0.42
RIM_LINE_AMBIENT = 0.35  # 背光一侧的外缘细亮线也保留这一比例，四周都有一圈亮边
EDGE_LINE = 0.012  # 外缘细暗线宽度 / 边长
EDGE_LINE_SHADE = 0.1
# 右上圆角的柔和弧形高光：沿圆角走一小段，落在斜边中部，不是硬边的光点。
CORNER_GLINT_ALPHA = 0.5
CORNER_GLINT_SPREAD = 0.22  # 角度范围：法线与右上方向夹角余弦低于 1 - 该值时为 0
CORNER_GLINT_CENTER = 0.42  # 高光带在斜边中的位置（0 = 外缘，1 = 内轮廓）
CORNER_GLINT_WIDTH = 0.28  # 高光带宽度（斜边宽度的比例，高斯半宽）
SHADOW_DY = 0.015
SHADOW_BLUR = 0.02
SHADOW_ALPHA = 0.14

CROSS_EDGE_VALUE = 0.86  # 柱面最暗处（边缘）灰度
# 与 MeowdokuTheme.ts `MEOWDOKU_MARK` 一致：笔画长 / 粗相对格宽（格宽 100、顶面 95）。
BAR_LENGTH = 0.64
BAR_THICKNESS = 0.19
# 贴图长宽比必须等于笔画长宽比，否则圆头会被拉扁。
CROSS_SIZE = (64, round(64 * BAR_LENGTH / BAR_THICKNESS))
# 叉的投影：与 MeowdokuTheme.ts `MEOWDOKU_MARK.shadowPadRatio` 一致，四周各留笔画粗细 × 该比例给模糊。
CROSS_SHADOW_PAD = 0.45
CROSS_SHADOW_BLUR = 0.16  # 模糊半径 / 笔画粗细
# 预览用的投影参数，与 `MEOWDOKU_MARK.shadowOffsetRatio`、`MEOWDOKU_COLORS.markShadow` 一致。
PREVIEW_SHADOW_OFFSET = 0.035
PREVIEW_SHADOW_RGBA = (110, 60, 60, 70)


def rounded_mask(size: int, box: tuple[int, int, int, int], radius: int) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=max(0, radius), fill=255)
    return mask


def scale_alpha(mask: Image.Image, factor: float) -> Image.Image:
    return mask.point(lambda v: round(v * factor))


def gray_layer(value: Image.Image, alpha: Image.Image) -> Image.Image:
    return Image.merge('RGBA', (value, value, value, alpha))


def rounded_box_sdf(x: float, y: float, half: float, radius: float) -> tuple[float, float, float]:
    """圆角正方形的有符号距离（内部为负）及向外法线。坐标以方块中心为原点。"""
    qx, qy = abs(x) - (half - radius), abs(y) - (half - radius)
    sx, sy = (1.0 if x >= 0 else -1.0), (1.0 if y >= 0 else -1.0)
    if qx > 0 and qy > 0:
        length = math.hypot(qx, qy)
        return length - radius, sx * qx / length, sy * qy / length
    if qx > qy:
        return qx - radius, sx, 0.0
    return qy - radius, 0.0, sy


def build_tile_frames() -> tuple[Image.Image, Image.Image]:
    size = FRAME * SS
    center = size / 2
    half = BODY * SS / 2
    radius = CORNER * BODY * SS
    bevel = BEVEL * BODY * SS
    edge_line = EDGE_LINE * BODY * SS
    rim_line = RIM_LINE * BODY * SS
    lx, ly = LIGHT
    norm = math.hypot(lx, ly)
    lx, ly = lx / norm, ly / norm

    value = Image.new('L', (size, size), 0)
    alpha = Image.new('L', (size, size), 0)
    gloss_alpha = Image.new('L', (size, size), 0)
    vpix, apix, gpix = value.load(), alpha.load(), gloss_alpha.load()
    for py in range(size):
        y = py + 0.5 - center
        for px_ in range(size):
            x = px_ + 0.5 - center
            dist, nx, ny = rounded_box_sdf(x, y, half, radius)
            if dist > 0:
                continue
            apix[px_, py] = 255
            shade = 1.0
            highlight = 0.0
            depth = -dist  # 到外缘的距离
            if depth < bevel:
                # 斜边：坡度 × 法线与光照夹角余弦；指数 < 1 让斜边与顶面之间出现清楚的内轮廓。
                slope = (1 - depth / bevel) ** BEVEL_PROFILE
                facing = nx * lx + ny * ly
                if facing > 0:
                    highlight = BEVEL_LIGHT * slope * facing
                else:
                    shade -= BEVEL_SHADE * slope * -facing
            if depth < edge_line:
                shade -= EDGE_LINE_SHADE * (1 - depth / edge_line)
            if depth < rim_line:
                facing_rim = RIM_LINE_AMBIENT + (1 - RIM_LINE_AMBIENT) * max(0.0, nx * lx + ny * ly)
                highlight += RIM_LINE_LIGHT * (1 - depth / rim_line) * facing_rim
            if depth < bevel:
                toward = (nx - ny) / math.sqrt(2)  # 法线与右上方向夹角余弦
                angular = max(0.0, (toward - (1 - CORNER_GLINT_SPREAD)) / CORNER_GLINT_SPREAD)
                if angular > 0:
                    band = math.exp(-((depth / bevel - CORNER_GLINT_CENTER) / CORNER_GLINT_WIDTH) ** 2)
                    highlight += CORNER_GLINT_ALPHA * angular * angular * (3 - 2 * angular) * band
            vpix[px_, py] = round(255 * max(0.0, shade))
            gpix[px_, py] = round(255 * min(1.0, highlight))

    gloss_alpha = ImageChops.multiply(gloss_alpha, alpha)

    body = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    box = (center - half, center - half, center + half - 1, center + half - 1)
    shadow_alpha = rounded_mask(size, tuple(round(v + (SHADOW_DY * BODY * SS if i % 2 else 0))
                                            for i, v in enumerate(box)), round(radius))
    shadow_alpha = scale_alpha(shadow_alpha.filter(ImageFilter.GaussianBlur(SHADOW_BLUR * BODY * SS)), SHADOW_ALPHA)
    body = Image.alpha_composite(body, gray_layer(Image.new('L', (size, size), 90), shadow_alpha))
    body = Image.alpha_composite(body, gray_layer(value, alpha))
    gloss = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    gloss.putalpha(gloss_alpha)

    def shrink(image: Image.Image) -> Image.Image:
        return image.resize((FRAME, FRAME), Image.LANCZOS)

    return shrink(body), shrink(gloss)


def build_tile_sheet() -> Image.Image:
    body, gloss = build_tile_frames()
    stride = FRAME + PAD * 2
    sheet = Image.new('RGBA', (stride * 2, stride), (0, 0, 0, 0))
    sheet.paste(body, (PAD, PAD))
    sheet.paste(gloss, (stride + PAD, PAD))
    return sheet


def build_cross_bar() -> Image.Image:
    """胶囊形笔画：灰度只随到中轴线段的距离变化，截面是一段圆柱。"""
    width, height = CROSS_SIZE
    w, h = width * SS, height * SS
    pad = 2 * SS
    radius = w / 2 - pad
    cx = w / 2
    top_c, bottom_c = pad + radius, h - pad - radius
    value = Image.new('L', (w, h), 0)
    alpha = Image.new('L', (w, h), 0)
    vpix, apix = value.load(), alpha.load()
    for y in range(h):
        cy = min(max(y + 0.5, top_c), bottom_c)
        for x in range(w):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
            if d >= 1:
                continue
            apix[x, y] = 255
            vpix[x, y] = round(255 * (CROSS_EDGE_VALUE + (1 - CROSS_EDGE_VALUE) * math.sqrt(1 - d * d)))
    bar = Image.merge('RGBA', (value, value, value, alpha))
    return bar.resize((width, height), Image.LANCZOS)


def build_cross_shadow() -> Image.Image:
    """单根笔画的投影：与笔画同形的胶囊，四周留边后高斯模糊；白色 + alpha，运行时染成投影色。"""
    thickness, length = CROSS_SIZE
    pad = round(thickness * CROSS_SHADOW_PAD)
    width, height = thickness + pad * 2, length + pad * 2
    alpha = Image.new('L', (width * SS, height * SS), 0)
    ImageDraw.Draw(alpha).rounded_rectangle(
        (pad * SS, pad * SS, (pad + thickness) * SS - 1, (pad + length) * SS - 1),
        radius=thickness * SS // 2, fill=255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(thickness * CROSS_SHADOW_BLUR * SS))
    shadow = Image.new('RGBA', alpha.size, (255, 255, 255, 0))
    shadow.putalpha(alpha)
    return shadow.resize((width, height), Image.LANCZOS)


def render_preview(sheet: Image.Image, cross: Image.Image, shadow: Image.Image, path: Path) -> None:
    """按区域色板在白色棋盘上排两行，前三格叠上白叉，检查染色效果。"""
    palette = ['#CDA400', '#D36F8F', '#8979DA', '#F89BE5', '#FA9D5C', '#FBD983',
               '#5076A5', '#A5C6E7', '#38A9C0', '#2A8C53', '#8BD57D', '#A86D4A']
    stride = FRAME + PAD * 2
    body = sheet.crop((PAD, PAD, PAD + FRAME, PAD + FRAME))
    gloss = sheet.crop((stride + PAD, PAD, stride + PAD + FRAME, PAD + FRAME))
    bar_w = round(BODY * BAR_THICKNESS / 0.95)
    bar_h = round(BODY * BAR_LENGTH / 0.95)
    bar = cross.resize((bar_w, bar_h), Image.LANCZOS)
    pad = round(bar_w * CROSS_SHADOW_PAD)
    shadow_bar = shadow.resize((bar_w + pad * 2, bar_h + pad * 2), Image.LANCZOS)
    shadow_alpha = shadow_bar.getchannel('A').point(lambda v: round(v * PREVIEW_SHADOW_RGBA[3] / 255))
    shadow_bar = Image.new('RGBA', shadow_bar.size, PREVIEW_SHADOW_RGBA[:3] + (255,))
    shadow_bar.putalpha(shadow_alpha)
    offset = round(BODY * PREVIEW_SHADOW_OFFSET / 0.95)
    pitch = round(BODY * 108 / 95)
    cols = 6
    canvas = Image.new('RGBA', (pitch * cols + 40, pitch * 2 + 40), (255, 255, 255, 255))
    for index, hex_color in enumerate(palette):
        rgb = tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
        tinted = ImageChops.multiply(body, Image.new('RGBA', body.size, rgb + (255,)))
        tinted.putalpha(body.getchannel('A'))
        x = 20 + (index % cols) * pitch + (pitch - FRAME) // 2
        y = 20 + (index // cols) * pitch + (pitch - FRAME) // 2
        canvas.alpha_composite(tinted, (x, y))
        canvas.alpha_composite(gloss, (x, y))
        if index % cols < 3:
            cx, cy = x + FRAME // 2, y + FRAME // 2
            # 与运行时一致：两根笔画的投影先画，再画两根笔画。
            for angle in (45, -45):
                rotated_shadow = shadow_bar.rotate(angle, resample=Image.BICUBIC, expand=True)
                canvas.alpha_composite(rotated_shadow, (cx - rotated_shadow.width // 2,
                                                        cy + offset - rotated_shadow.height // 2))
            for angle in (45, -45):
                rotated = bar.rotate(angle, resample=Image.BICUBIC, expand=True)
                canvas.alpha_composite(rotated, (cx - rotated.width // 2, cy - rotated.height // 2))
    canvas.convert('RGB').save(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    sheet = build_tile_sheet()
    sheet.save(TILE_OUTPUT, optimize=True)
    cross = build_cross_bar()
    cross.save(CROSS_OUTPUT, optimize=True)
    shadow = build_cross_shadow()
    shadow.save(CROSS_SHADOW_OUTPUT, optimize=True)
    for path, image in ((TILE_OUTPUT, sheet), (CROSS_OUTPUT, cross), (CROSS_SHADOW_OUTPUT, shadow)):
        print(f'{path.relative_to(ROOT)} {image.size}')
    if args.preview:
        render_preview(sheet, cross, shadow, args.preview)
        print(args.preview)


if __name__ == '__main__':
    main()

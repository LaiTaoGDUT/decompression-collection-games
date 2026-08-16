"""Split the generated Chess Endless masters into deterministic Cocos assets.

The two checked-in source masters are intentionally preserved under
``art_sources``.  This script only crops, scales and composes shipping assets;
it never invents a second visual style.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art_sources" / "chess-endless" / "generated" / "v1"
SOURCE_V2 = ROOT / "art_sources" / "chess-endless" / "generated" / "v2"
GAME = ROOT / "assets" / "games" / "chess-endless" / "visual"
LOBBY = ROOT / "assets" / "lobby" / "visual"

ATLAS = SOURCE / "chess-ui-atlas-v1.png"
TABLETOP = SOURCE / "chess-tabletop-master-v1.png"
RICH_BACKGROUND = SOURCE_V2 / "chess-rich-background-master-v2.png"


TILES = (
    ("pieces/piece_player_base.png", (384, 384)),
    ("pieces/piece_enemy_base.png", (384, 384)),
    ("pieces/piece_general_base.png", (384, 384)),
    ("icons/icon_revive.png", (256, 256)),
    ("icons/icon_item_cross_slash.png", (256, 256)),
    ("icons/icon_item_freeze.png", (256, 256)),
    ("icons/icon_item_delay.png", (256, 256)),
    ("icons/icon_item_banish.png", (256, 256)),
    ("icons/icon_item_teleport.png", (256, 256)),
    ("ui/ui_item_card_bg.png", (360, 440)),
    ("ui/ui_item_slot.png", (256, 256)),
    ("ui/ui_reinforcement_panel.png", (640, 210)),
    ("vfx/vfx_ink_particle.png", (256, 256)),
    ("vfx/vfx_light_particle.png", (256, 256)),
    ("vfx/vfx_talisman.png", (256, 256)),
    ("vfx/vfx_wood_chip.png", (256, 256)),
)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def contain(image: Image.Image, size: tuple[int, int], padding_ratio: float = 0.055) -> Image.Image:
    target_w, target_h = size
    padding = round(min(target_w, target_h) * padding_ratio)
    available = (max(1, target_w - padding * 2), max(1, target_h - padding * 2))
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    copy = image.copy()
    copy.thumbnail(available, Image.Resampling.LANCZOS)
    result.alpha_composite(copy, ((target_w - copy.width) // 2, (target_h - copy.height) // 2))
    return result


def remove_small_alpha_islands(image: Image.Image, keep_ratio: float = 0.0035) -> Image.Image:
    """Drop isolated generation flecks while retaining the authored silhouette."""
    result = image.copy()
    alpha = result.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] <= 18:
                visited[offset] = 1
                continue
            stack = [(x, y)]
            visited[offset] = 1
            component: list[tuple[int, int]] = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for neighbor_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for neighbor_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        neighbor_offset = neighbor_y * width + neighbor_x
                        if visited[neighbor_offset]:
                            continue
                        visited[neighbor_offset] = 1
                        if pixels[neighbor_x, neighbor_y] > 18:
                            stack.append((neighbor_x, neighbor_y))
            components.append(component)

    if not components:
        return result
    largest = max(len(component) for component in components)
    minimum = max(18, round(largest * keep_ratio))
    keep = {point for component in components if len(component) >= minimum for point in component}
    cleaned_alpha = Image.new("L", alpha.size, 0)
    cleaned_pixels = cleaned_alpha.load()
    for x, y in keep:
        cleaned_pixels[x, y] = pixels[x, y]
    result.putalpha(cleaned_alpha)
    return result


def split_atlas() -> dict[str, Image.Image]:
    atlas = Image.open(ATLAS).convert("RGBA")
    outputs: dict[str, Image.Image] = {}
    for index, (relative, size) in enumerate(TILES):
        column = index % 4
        row = index // 4
        left = round(column * atlas.width / 4)
        top = round(row * atlas.height / 4)
        right = round((column + 1) * atlas.width / 4)
        bottom = round((row + 1) * atlas.height / 4)
        tile = remove_small_alpha_islands(
            atlas.crop((left, top, right, bottom)),
            0.0018 if relative.startswith("vfx/") else 0.0035,
        )
        alpha_box = tile.getchannel("A").getbbox()
        if not alpha_box:
            raise RuntimeError(f"Atlas tile {index + 1} has no visible pixels")
        tile = tile.crop(alpha_box)
        output = contain(tile, size)
        save_png(output, GAME / relative)
        outputs[relative] = output

    # The generated square slot is also the source of the larger board frame.
    # Cocos uses it as a nine-slice border, so the texture stays compact.
    board_frame = outputs["ui/ui_item_slot.png"].copy()
    save_png(board_frame, GAME / "boards" / "img_board_frame.png")
    return outputs


def cover_crop(image: Image.Image, size: tuple[int, int], center_y: float = 0.5) -> Image.Image:
    target_ratio = size[0] / size[1]
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_h = image.height
        crop_w = round(crop_h * target_ratio)
    else:
        crop_w = image.width
        crop_h = round(crop_w / target_ratio)
    left = (image.width - crop_w) // 2
    top = round((image.height - crop_h) * center_y)
    top = max(0, min(image.height - crop_h, top))
    return image.crop((left, top, left + crop_w, top + crop_h)).resize(size, Image.Resampling.LANCZOS)


def load_font(size: int, text: str = "棋") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/STXINGKA.TTF"),
        Path("C:/Windows/Fonts/STKAITI.TTF"),
        Path("C:/Windows/Fonts/simkai.ttf"),
        Path("C:/Windows/Fonts/simfang.ttf"),
        Path("C:/Windows/Fonts/msyh.ttc"),
    )
    for candidate in candidates:
        if candidate.exists():
            font = ImageFont.truetype(str(candidate), size=size)
            if font.getmask(text).getbbox():
                return font
    return ImageFont.load_default()


def draw_centered(draw: ImageDraw.ImageDraw, text: str, center: tuple[int, int], font, fill, stroke=0) -> None:
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(
        (center[0] - width / 2, center[1] - height / 2 - box[1]),
        text,
        font=font,
        fill=fill,
        stroke_width=stroke,
        stroke_fill=(35, 24, 17, 170),
    )


def piece_with_character(base: Image.Image, character: str, size: int, color: tuple[int, int, int, int]) -> Image.Image:
    result = contain(base, (size, size), 0.02)
    draw = ImageDraw.Draw(result)
    draw_centered(
        draw,
        character,
        # The raised top face is centered slightly above the square texture.
        # Keep the calligraphy strictly inside that circle rather than centering
        # it against the full (shadow-bearing) sprite bounds.
        (size // 2, round(size * 0.445)),
        load_font(round(size * 0.285), character),
        color,
        max(1, round(size / 240)),
    )
    return result


def make_piece_assets(parts: dict[str, Image.Image]) -> None:
    """Bake every chess glyph into its sprite so UI never mixes image and live text."""
    player_color = (245, 229, 179, 255)
    enemy_color = (163, 48, 38, 255)
    general_color = (255, 226, 158, 255)
    normal = {
        "pawn": "卒",
        "advisor": "士",
        "elephant": "象",
        "horse": "马",
        "cannon": "炮",
        "rook": "車",
    }
    save_png(
        piece_with_character(parts["pieces/piece_player_base.png"], "車", 384, player_color),
        GAME / "pieces" / "piece_player_rook.png",
    )
    for name, character in normal.items():
        save_png(
            piece_with_character(parts["pieces/piece_enemy_base.png"], character, 384, enemy_color),
            GAME / "pieces" / f"piece_enemy_{name}.png",
        )
    save_png(
        piece_with_character(parts["pieces/piece_general_base.png"], "将", 384, general_color),
        GAME / "pieces" / "piece_enemy_general.png",
    )


def make_logo(width: int = 720, height: int = 230) -> Image.Image:
    logo = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wash = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    wash_draw = ImageDraw.Draw(wash)
    wash_draw.rounded_rectangle((32, 32, width - 32, height - 38), radius=34, fill=(20, 44, 40, 210))
    wash = wash.filter(ImageFilter.GaussianBlur(2.2))
    logo.alpha_composite(wash)
    draw = ImageDraw.Draw(logo)
    draw_centered(draw, "棋逢对手", (width // 2, height // 2), load_font(88), (247, 226, 177, 255), 1)
    return logo


def make_board_backplate(tabletop: Image.Image) -> None:
    size = (900, 1080)
    plate = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((34, 38, 866, 1054), radius=54, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    plate.alpha_composite(shadow)
    draw = ImageDraw.Draw(plate)
    draw.rounded_rectangle((25, 20, 875, 1040), radius=58, fill=(16, 48, 42, 255), outline=(189, 139, 63, 255), width=12)
    draw.rounded_rectangle((44, 39, 856, 1021), radius=45, outline=(233, 200, 126, 210), width=4)
    quiet_table = tabletop.crop((115, 300, tabletop.width - 110, 1305))
    wood = cover_crop(quiet_table, (760, 910), 0.48).convert("RGBA")
    wood = ImageEnhance.Contrast(wood).enhance(0.88)
    wood = ImageEnhance.Color(wood).enhance(0.72)
    mask = Image.new("L", wood.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, wood.width - 1, wood.height - 1), radius=34, fill=255)
    wood.putalpha(mask)
    plate.alpha_composite(wood, (70, 75))
    draw = ImageDraw.Draw(plate)
    draw.rounded_rectangle((66, 71, 834, 993), radius=38, outline=(92, 48, 28, 170), width=6)
    for x, y, flip_x, flip_y in ((62, 67, 1, 1), (838, 67, -1, 1), (62, 997, 1, -1), (838, 997, -1, -1)):
        points = [(x, y), (x + 76 * flip_x, y), (x, y + 76 * flip_y)]
        draw.polygon(points, fill=(187, 126, 50, 210))
        draw.arc((x - 42, y - 42, x + 42, y + 42), 0, 360, fill=(247, 218, 150, 220), width=4)
    save_png(plate, GAME / "boards" / "img_board_backplate.png")
    save_png(wood, GAME / "boards" / "img_board_main.png")


def make_round_icon(symbol: str, filename: str) -> None:
    size = 192
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((18, 22, 174, 178), fill=(0, 0, 0, 110))
    icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)))
    draw = ImageDraw.Draw(icon)
    draw.ellipse((15, 12, 177, 174), fill=(19, 55, 48, 255), outline=(226, 188, 105, 255), width=8)
    draw.ellipse((29, 26, 163, 160), outline=(126, 78, 38, 230), width=4)
    draw_centered(draw, symbol, (96, 91), load_font(76, symbol), (247, 226, 177, 255), 1)
    save_png(icon, GAME / "ui" / filename)


def glow_ring(size: int, inner: tuple[int, int, int], outer: tuple[int, int, int]) -> Image.Image:
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = Image.new("RGBA", result.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for step in range(9):
        inset = 24 + step * 8
        alpha = max(8, 72 - step * 7)
        gd.ellipse((inset, inset, size - inset, size - inset), outline=(*outer, alpha), width=10)
    result.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
    draw = ImageDraw.Draw(result)
    draw.ellipse((54, 54, size - 54, size - 54), outline=(*inner, 235), width=8)
    draw.ellipse((68, 68, size - 68, size - 68), outline=(255, 235, 173, 190), width=3)
    return result


def make_vfx_assets() -> None:
    vfx = GAME / "vfx"

    capture = glow_ring(320, (242, 193, 92), (202, 55, 36))
    d = ImageDraw.Draw(capture)
    for angle in range(0, 360, 30):
        import math
        rad = math.radians(angle)
        a = (160 + math.cos(rad) * 62, 160 + math.sin(rad) * 62)
        b = (160 + math.cos(rad) * 142, 160 + math.sin(rad) * 142)
        d.line((a, b), fill=(255, 220, 128, 235), width=8)
    save_png(capture, vfx / "vfx_capture_burst.png")

    combo = Image.new("RGBA", (720, 300), (0, 0, 0, 0))
    combo.alpha_composite(glow_ring(300, (248, 202, 93), (198, 49, 35)), (210, 0))
    cd = ImageDraw.Draw(combo)
    cd.arc((55, 42, 665, 254), 198, 342, fill=(239, 193, 91, 210), width=11)
    cd.arc((92, 67, 628, 232), 20, 160, fill=(179, 45, 33, 205), width=8)
    save_png(combo, vfx / "vfx_combo_burst.png")

    arrival = Image.new("RGBA", (720, 420), (0, 0, 0, 0))
    arrival.alpha_composite(glow_ring(420, (251, 201, 91), (170, 31, 25)), (150, 0))
    ad = ImageDraw.Draw(arrival)
    ad.polygon(((52, 210), (240, 132), (480, 132), (668, 210), (480, 288), (240, 288)), fill=(91, 15, 15, 190), outline=(244, 207, 124, 240))
    ad.line((80, 210, 640, 210), fill=(255, 225, 157, 150), width=5)
    save_png(arrival, vfx / "vfx_general_arrival.png")

    general_kill = arrival.copy()
    kd = ImageDraw.Draw(general_kill)
    kd.line((160, 338, 560, 82), fill=(255, 241, 196, 250), width=20)
    kd.line((160, 82, 560, 338), fill=(255, 241, 196, 250), width=20)
    kd.line((160, 338, 560, 82), fill=(200, 49, 29, 230), width=7)
    kd.line((160, 82, 560, 338), fill=(200, 49, 29, 230), width=7)
    save_png(general_kill, vfx / "vfx_general_kill.png")

    slash = Image.new("RGBA", (900, 170), (0, 0, 0, 0))
    sd = ImageDraw.Draw(slash)
    sd.polygon(((18, 98), (760, 48), (892, 80), (760, 113), (18, 122)), fill=(255, 242, 202, 240))
    sd.line((28, 116, 855, 74), fill=(191, 48, 31, 230), width=12)
    slash = slash.filter(ImageFilter.GaussianBlur(1.2))
    save_png(slash, vfx / "vfx_cross_slash.png")

    beam = Image.new("RGBA", (140, 720), (0, 0, 0, 0))
    bp = beam.load()
    for y in range(beam.height):
        fade_y = (1 - y / beam.height) ** 0.35
        for x in range(beam.width):
            distance = abs(x - beam.width / 2) / (beam.width / 2)
            alpha = int(max(0, 1 - distance) ** 2 * 220 * fade_y)
            bp[x, y] = (255, 224, 132, alpha)
    save_png(beam.filter(ImageFilter.GaussianBlur(3)), vfx / "vfx_reward_beam.png")

    shadow = Image.new("RGBA", (320, 180), (0, 0, 0, 0))
    sh = ImageDraw.Draw(shadow)
    sh.ellipse((32, 76, 288, 158), fill=(17, 38, 34, 150), outline=(228, 184, 89, 150), width=5)
    save_png(shadow.filter(ImageFilter.GaussianBlur(4)), vfx / "vfx_spawn_shadow.png")

    danger = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    dd = ImageDraw.Draw(danger)
    dd.polygon(((80, 14), (146, 80), (80, 146), (14, 80)), fill=(161, 42, 31, 92), outline=(235, 115, 69, 190), width=7)
    dd.ellipse((57, 57, 103, 103), outline=(255, 207, 112, 210), width=6)
    save_png(danger, vfx / "vfx_danger_marker.png")

    palettes = {
        "cross": ((239, 196, 91), (180, 45, 28)),
        "freeze": ((168, 225, 232), (42, 116, 132)),
        "delay": ((244, 193, 78), (112, 73, 30)),
        "banish": ((248, 214, 137), (156, 45, 33)),
        "teleport": ((177, 223, 196), (25, 91, 75)),
    }
    for name, (inner, outer) in palettes.items():
        save_png(glow_ring(384, inner, outer), vfx / f"vfx_item_{name}.png")

    guard = glow_ring(384, (229, 207, 137), (29, 92, 75))
    guard_draw = ImageDraw.Draw(guard)
    guard_draw.polygon(
        ((192, 70), (292, 116), (274, 250), (192, 316), (110, 250), (92, 116)),
        fill=(24, 78, 66, 168),
        outline=(247, 224, 159, 238),
    )
    guard_draw.arc((117, 103, 267, 270), 195, 345, fill=(247, 224, 159, 235), width=8)
    save_png(guard, vfx / "vfx_general_guard.png")

    def chest(opened: bool) -> Image.Image:
        image = Image.new("RGBA", (420, 340), (0, 0, 0, 0))
        if opened:
            image.alpha_composite(glow_ring(320, (255, 224, 128), (198, 58, 30)), (50, -36))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((80, 155, 340, 292), radius=28, fill=(112, 42, 24, 255), outline=(239, 194, 90, 255), width=12)
        if opened:
            draw.polygon(((83, 151), (120, 70), (320, 70), (337, 151)), fill=(139, 49, 26, 255), outline=(245, 207, 116, 255))
        else:
            draw.rounded_rectangle((80, 92, 340, 191), radius=30, fill=(139, 49, 26, 255), outline=(245, 207, 116, 255), width=12)
        draw.rectangle((190, 146, 230, 224), fill=(232, 180, 73, 255), outline=(255, 230, 151, 255), width=4)
        return image

    save_png(chest(False), vfx / "vfx_reward_chest_closed.png")
    save_png(chest(True), vfx / "vfx_reward_chest_open.png")


def make_ui_surfaces(tabletop: Image.Image) -> None:
    make_round_icon("卷", "icon_rules.png")
    make_round_icon("Ⅱ", "icon_pause.png")
    make_round_icon("?", "icon_help.png")
    make_round_icon("×", "icon_close.png")

    hud = Image.new("RGBA", (720, 132), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hud)
    hd.rounded_rectangle((18, 14, 702, 118), radius=38, fill=(17, 48, 42, 224), outline=(213, 170, 87, 218), width=4)
    hd.line((150, 112, 570, 112), fill=(246, 220, 158, 80), width=3)
    save_png(hud, GAME / "ui" / "ui_hud_ribbon.png")

    reinforcement = Image.new("RGBA", (720, 150), (0, 0, 0, 0))
    rd = ImageDraw.Draw(reinforcement)
    rd.rounded_rectangle((14, 10, 706, 140), radius=31, fill=(233, 213, 168, 232), outline=(125, 77, 38, 205), width=5)
    rd.polygon(((14, 42), (64, 10), (14, 10)), fill=(25, 67, 58, 230))
    rd.polygon(((706, 108), (656, 140), (706, 140)), fill=(25, 67, 58, 230))
    save_png(reinforcement, GAME / "ui" / "ui_reinforcement_panel_v2.png")

    general = reinforcement.copy()
    gd = ImageDraw.Draw(general)
    gd.rounded_rectangle((18, 14, 702, 136), radius=27, outline=(181, 43, 31, 245), width=10)
    save_png(general, GAME / "ui" / "ui_reinforcement_general.png")

    panel = Image.new("RGBA", (700, 920), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle((20, 18, 680, 902), radius=42, fill=(246, 231, 194, 250), outline=(77, 49, 29, 230), width=8)
    pd.rounded_rectangle((38, 36, 662, 884), radius=31, outline=(191, 133, 57, 190), width=3)
    pd.line((80, 108, 620, 108), fill=(164, 59, 42, 160), width=3)
    save_png(panel, GAME / "ui" / "ui_modal_panel.png")

    card = Image.new("RGBA", (300, 430), (0, 0, 0, 0))
    c = ImageDraw.Draw(card)
    c.rounded_rectangle((12, 10, 288, 420), radius=34, fill=(241, 221, 178, 250), outline=(115, 72, 36, 225), width=7)
    c.rounded_rectangle((28, 26, 272, 404), radius=25, outline=(199, 147, 68, 180), width=3)
    save_png(card, GAME / "ui" / "ui_reward_card.png")


def make_lobby_cover(rich: Image.Image, logo: Image.Image) -> None:
    # The cover is based on a newly generated, integrated tabletop scene rather
    # than a collage of the runtime background and individual piece sprites.
    cover = cover_crop(rich, (920, 690), 0.06).convert("RGBA")
    grade = Image.new("RGBA", cover.size, (0, 0, 0, 0))
    gp = grade.load()
    for y in range(cover.height):
        alpha = int(150 * max(0, 1 - y / 360)) + int(80 * max(0, (y - 560) / 130))
        for x in range(cover.width):
            gp[x, y] = (5, 28, 24, min(190, alpha))
    cover = Image.alpha_composite(cover, grade)
    logo_small = contain(logo, (610, 190), 0.03)
    cover.alpha_composite(logo_small, (155, 12))
    save_png(cover, LOBBY / "covers" / "chess-endless" / "chess-endless-cover-v1.png")


def make_scenes(parts: dict[str, Image.Image]) -> None:
    tabletop = Image.open(TABLETOP).convert("RGB")
    rich = Image.open(RICH_BACKGROUND).convert("RGB")
    background = cover_crop(rich, (750, 1334), 0.50)
    save_png(background.convert("RGBA"), GAME / "backgrounds" / "img_home_background.png")

    # Use the quiet center of the same generated wood master for the gameplay
    # surface so the board and surrounding room never disagree in grain/palette.
    board = cover_crop(tabletop.crop((115, 300, tabletop.width - 110, 1305)), (900, 1000), 0.48)
    board = ImageEnhance.Contrast(board).enhance(0.86)
    board = ImageEnhance.Color(board).enhance(0.82)
    save_png(board.convert("RGBA"), GAME / "boards" / "img_board_main.png")

    logo = make_logo()
    save_png(logo, GAME / "ui" / "img_logo.png")
    make_board_backplate(tabletop)
    make_ui_surfaces(tabletop)
    make_vfx_assets()
    make_lobby_cover(rich, logo)

    icon = Image.new("RGBA", (320, 320), (27, 50, 46, 255))
    icon_draw = ImageDraw.Draw(icon)
    icon_draw.ellipse((20, 20, 300, 300), fill=(231, 205, 147, 255), outline=(187, 65, 48, 255), width=12)
    icon_piece = piece_with_character(parts["pieces/piece_player_base.png"], "車", 260, (245, 229, 179, 255))
    icon.alpha_composite(icon_piece, (30, 30))
    save_png(icon, LOBBY / "icons" / "chess-endless" / "chess-endless-icon-v1.png")


def main() -> None:
    if not ATLAS.exists() or not TABLETOP.exists() or not RICH_BACKGROUND.exists():
        raise FileNotFoundError("Chess Endless generated masters are missing")
    parts = split_atlas()
    make_piece_assets(parts)
    make_scenes(parts)
    game_count = len(list(GAME.rglob("*.png")))
    lobby_count = len(list((LOBBY / "covers" / "chess-endless").rglob("*.png"))) + len(
        list((LOBBY / "icons" / "chess-endless").rglob("*.png"))
    )
    print(
        f"chess_visuals={game_count + lobby_count} game={game_count} lobby={lobby_count} "
        f"source_atlas={ATLAS.relative_to(ROOT)} source_tabletop={TABLETOP.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()

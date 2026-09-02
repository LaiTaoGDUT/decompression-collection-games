from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art_sources" / "涂鸦跃层"
OUTPUT = ROOT / "assets" / "games" / "doodle-jump" / "visual"
TILE_SIZE = (750, 1334)


def save_game_png(image: Image.Image, destination: Path, colors: int = 192) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    quantized = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    quantized.save(destination, optimize=True)


def save_transition_png(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    quantized = image.convert("RGB").quantize(
        colors=256,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    quantized.save(destination, optimize=True)


def prepare_alpha_asset(
    source: Path,
    padding: int = 1,
    alpha_threshold: int = 0,
    max_edge: int | None = None,
    keep_center_component: bool = False,
) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    if keep_center_component:
        connected = alpha.point(lambda value: 255 if value > max(2, alpha_threshold) else 0)
        ImageDraw.floodfill(connected, (image.width // 2, image.height // 2), 128)
        component = connected.point(lambda value: 255 if value == 128 else 0)
        cleaned_alpha = Image.new("L", image.size, 0)
        cleaned_alpha.paste(alpha, mask=component)
        image.putalpha(cleaned_alpha)
        alpha = cleaned_alpha
    visible_alpha = alpha if alpha_threshold <= 0 else alpha.point(
        lambda value: 255 if value > alpha_threshold else 0,
    )
    bbox = visible_alpha.getbbox()
    if bbox is None:
        raise ValueError(f"No visible pixels in {source}")
    left, top, right, bottom = bbox
    crop = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    cropped = image.crop(crop)
    if max_edge is not None and max(cropped.size) > max_edge:
        scale = max_edge / max(cropped.size)
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return cropped


def trim_alpha(
    source: Path,
    destination: Path,
    padding: int = 1,
    alpha_threshold: int = 0,
    max_edge: int | None = None,
    keep_center_component: bool = False,
) -> None:
    cropped = prepare_alpha_asset(
        source,
        padding=padding,
        alpha_threshold=alpha_threshold,
        max_edge=max_edge,
        keep_center_component=keep_center_component,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(destination, optimize=True)


def split_generated_propeller_hat(
    source: Path,
    cap_destination: Path,
    blades_destination: Path,
) -> None:
    """Split the approved generated hat around a shared rotor hub anchor."""
    image = prepare_alpha_asset(
        source,
        padding=16,
        alpha_threshold=2,
        max_edge=512,
        keep_center_component=True,
    )
    scale_x = image.width / 512
    scale_y = image.height / 375
    point = lambda x, y: (round(x * scale_x), round(y * scale_y))
    blade_mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(blade_mask)
    draw.polygon(
        [point(0, 0), point(249, 0), point(243, 71), point(216, 94), point(0, 116)],
        fill=255,
    )
    draw.polygon(
        [point(263, 0), point(512, 0), point(512, 116), point(296, 94), point(269, 71)],
        fill=255,
    )
    draw.ellipse((*point(224, 23), *point(288, 73)), fill=255)
    source_alpha = image.getchannel("A")
    blade_alpha = Image.new("L", image.size, 0)
    blade_alpha.paste(source_alpha, mask=blade_mask)
    blades_layer = image.copy()
    blades_layer.putalpha(blade_alpha)

    cap = image.copy()
    cap_alpha = source_alpha.copy()
    cap_alpha.paste(0, mask=blade_mask)
    cap_draw = ImageDraw.Draw(cap_alpha)
    cap_draw.rectangle((*point(0, 0), *point(512, 72)), fill=0)
    cap_draw.polygon(
        [point(0, 72), point(225, 72), point(216, 98), point(188, 112), point(0, 120)],
        fill=0,
    )
    cap_draw.polygon(
        [point(287, 72), point(512, 72), point(512, 120), point(324, 112), point(296, 98)],
        fill=0,
    )
    cap_alpha = cap_alpha.point(lambda value: value if value > 8 else 0)
    cap.putalpha(cap_alpha)
    clean_cap = Image.new("RGBA", cap.size, (0, 0, 0, 0))
    clean_cap.paste(cap, mask=cap_alpha.point(lambda value: 255 if value > 0 else 0))
    cap = clean_cap
    cap_bbox = cap_alpha.getbbox()
    if cap_bbox is None:
        raise ValueError(f"No cap pixels in {source}")
    cap_padding = round(8 * max(scale_x, scale_y))
    left, top, right, bottom = cap_bbox
    cap_crop = cap.crop((
        max(0, left - cap_padding),
        max(0, top - cap_padding),
        min(cap.width, right + cap_padding),
        min(cap.height, bottom + cap_padding),
    ))
    cap_destination.parent.mkdir(parents=True, exist_ok=True)
    cap_crop.save(cap_destination, optimize=True)

    hub_x, hub_y = point(256, 56)
    rotor_width = image.width
    rotor_height = round(132 * scale_y)
    rotor = Image.new("RGBA", (rotor_width, rotor_height), (0, 0, 0, 0))
    rotor.alpha_composite(
        blades_layer,
        (rotor_width // 2 - hub_x, rotor_height // 2 - hub_y),
    )
    blades_destination.parent.mkdir(parents=True, exist_ok=True)
    rotor.save(blades_destination, optimize=True)


def prepare_generated_rocket(source: Path, destination: Path) -> None:
    """Remove the generated checkerboard and cut a true-alpha porthole."""
    image = Image.open(source).convert("RGBA")
    mask = Image.new("L", image.size, 0)
    source_pixels = image.load()
    mask_pixels = mask.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, _ = source_pixels[x, y]
            if max(red, green, blue) - min(red, green, blue) > 10 \
                    or max(red, green, blue) < 180:
                mask_pixels[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(7))
    mask = mask.filter(ImageFilter.GaussianBlur(1.1))
    draw = ImageDraw.Draw(mask)
    scale_x = image.width / 1024
    scale_y = image.height / 1536
    draw.ellipse(
        (
            round(358 * scale_x),
            round(512 * scale_y),
            round(666 * scale_x),
            round(833 * scale_y),
        ),
        fill=0,
    )
    image.putalpha(mask)
    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped = prepare_alpha_asset_from_image(image, padding=12, max_edge=768)
    cropped.save(destination, optimize=True)


def prepare_alpha_asset_from_image(
    image: Image.Image,
    padding: int = 1,
    max_edge: int | None = None,
) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("No visible pixels in generated image")
    left, top, right, bottom = bbox
    cropped = image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))
    if max_edge is not None and max(cropped.size) > max_edge:
        scale = max_edge / max(cropped.size)
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return cropped


def split_transparent_grid(
    source: Path,
    destinations: tuple[Path, ...],
    columns: int = 2,
    rows: int = 2,
    max_edge: int = 384,
) -> None:
    """Split an evenly spaced transparent sprite sheet into trimmed sprites."""
    if len(destinations) != columns * rows:
        raise ValueError("Destination count must match the grid cell count")
    image = Image.open(source).convert("RGBA")
    for index, destination in enumerate(destinations):
        column = index % columns
        row = index // columns
        left = round(column * image.width / columns)
        right = round((column + 1) * image.width / columns)
        top = round(row * image.height / rows)
        bottom = round((row + 1) * image.height / rows)
        cell = image.crop((left, top, right, bottom))
        alpha = cell.getchannel("A").point(lambda value: 255 if value > 2 else 0)
        bbox = alpha.getbbox()
        if bbox is None:
            raise ValueError(f"No visible pixels in grid cell {index} of {source}")
        sprite = cell.crop(bbox)
        if max(sprite.size) > max_edge:
            scale = max_edge / max(sprite.size)
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                Image.Resampling.LANCZOS,
            )
        destination.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(destination, optimize=True)


def normalize_bottom_center_frames(
    sources: tuple[Path, ...],
    destinations: tuple[Path, ...],
    padding: int = 6,
    alpha_threshold: int = 8,
) -> None:
    """Put related frames on one bottom-center-aligned RGBA canvas."""
    if len(sources) != len(destinations):
        raise ValueError("Source and destination frame counts must match")
    cropped: list[Image.Image] = []
    for source in sources:
        image = Image.open(source).convert("RGBA")
        alpha = image.getchannel("A").point(
            lambda value: 255 if value > alpha_threshold else 0,
        )
        bbox = alpha.getbbox()
        if bbox is None:
            raise ValueError(f"No visible pixels in {source}")
        cropped.append(image.crop(bbox))
    canvas_width = max(image.width for image in cropped) + padding * 2
    canvas_height = max(image.height for image in cropped) + padding * 2
    for image, destination in zip(cropped, destinations):
        canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
        canvas.alpha_composite(
            image,
            ((canvas_width - image.width) // 2, canvas_height - padding - image.height),
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(destination, optimize=True)


def normalize_animation_pair(
    sources: tuple[Path, Path],
    destinations: tuple[Path, Path],
    padding: int = 6,
    alpha_threshold: int = 8,
) -> None:
    normalize_bottom_center_frames(
        sources,
        destinations,
        padding=padding,
        alpha_threshold=alpha_threshold,
    )


def bake_platform_shadow(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"No visible pixels in {source}")
    bake_platform_shadow_from_image(image.crop(bbox), destination)


def bake_platform_shadow_from_image(image: Image.Image, destination: Path) -> None:
    padding = 14
    offset = (6, 7)
    canvas_size = (image.width + padding * 2, image.height + padding * 2)
    alpha_canvas = Image.new("L", canvas_size, 0)
    alpha_canvas.paste(image.getchannel("A"), (padding + offset[0], padding + offset[1]))
    blurred = alpha_canvas.filter(ImageFilter.GaussianBlur(radius=5))
    shadow_alpha = blurred.point(lambda value: round(value * 0.28))
    shadow = Image.new("RGBA", canvas_size, (42, 45, 46, 0))
    shadow.putalpha(shadow_alpha)
    shadow.alpha_composite(image, (padding, padding))
    final_bbox = shadow.getchannel("A").getbbox()
    if final_bbox is None:
        raise ValueError(f"Failed to bake shadow for {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shadow.crop(final_bbox).save(destination, optimize=True)


def prepare_generated_vertical_platform(source: Path, destination: Path) -> None:
    """Remove a generated pale checkerboard, then apply the shared platform shadow."""
    image = Image.open(source).convert("RGBA")
    candidate = Image.new("L", image.size, 0)
    source_pixels = image.load()
    candidate_pixels = candidate.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, _ = source_pixels[x, y]
            if max(red, green, blue) - min(red, green, blue) > 12 \
                    or max(red, green, blue) < 232:
                candidate_pixels[x, y] = 255
    candidate = candidate.filter(ImageFilter.MaxFilter(5))
    ImageDraw.floodfill(candidate, (image.width // 2, image.height // 2), 128)
    component = candidate.point(lambda value: 255 if value == 128 else 0)
    component = component.filter(ImageFilter.GaussianBlur(0.8))
    image.putalpha(component)
    cleaned = prepare_alpha_asset_from_image(image, padding=8, max_edge=384)
    bake_platform_shadow_from_image(cleaned, destination)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def make_vertical_tile(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    half = cover(image, (TILE_SIZE[0], TILE_SIZE[1] // 2))
    tile = Image.new("RGBA", TILE_SIZE)
    tile.paste(half, (0, 0))
    tile.paste(half.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, half.height))
    save_game_png(tile, destination)


def make_graph_paper_tile(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    half = cover(image, (TILE_SIZE[0], TILE_SIZE[1] // 2))
    tile = Image.new("RGBA", TILE_SIZE)
    tile.paste(half, (0, 0))
    tile.paste(half.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, half.height))
    tile = ImageEnhance.Contrast(tile).enhance(1.16)
    tile = ImageEnhance.Color(tile).enhance(1.06)
    destination.parent.mkdir(parents=True, exist_ok=True)
    tile.save(destination, optimize=True)


def make_transition(lower: Path, upper: Path, destination: Path) -> None:
    lower_image = Image.open(lower).convert("RGBA")
    upper_image = Image.open(upper).convert("RGBA")
    mask = Image.new("L", TILE_SIZE)
    pixels = mask.load()
    for y in range(TILE_SIZE[1]):
        upper_weight = 255 - round(y * 255 / (TILE_SIZE[1] - 1))
        for x in range(TILE_SIZE[0]):
            pixels[x, y] = upper_weight
    transition = Image.composite(upper_image, lower_image, mask)
    save_transition_png(transition, destination)


def make_breakable_halves(source: Path, left: Path, right: Path) -> None:
    image = Image.open(source).convert("RGBA")
    split = image.width // 2
    left_image = Image.new("RGBA", image.size, (0, 0, 0, 0))
    right_image = Image.new("RGBA", image.size, (0, 0, 0, 0))
    left_image.paste(image.crop((0, 0, split, image.height)), (0, 0))
    right_image.paste(image.crop((split, 0, image.width, image.height)), (split, 0))
    left_image.save(left, optimize=True)
    right_image.save(right, optimize=True)


def main() -> None:
    normalize_bottom_center_frames(
        (
            SOURCE / "主角" / "player_runtime_prototype.png",
        ),
        (
            OUTPUT / "player" / "player-jumping-trimmed.png",
        ),
        padding=8,
    )
    split_generated_propeller_hat(
        SOURCE / "主角" / "player_propeller_hat_generated.png",
        OUTPUT / "player" / "player-propeller-hat-cap.png",
        OUTPUT / "player" / "player-propeller-hat-blades.png",
    )
    trim_alpha(
        SOURCE / "主角" / "player_jetpack_generated.png",
        OUTPUT / "player" / "player-jetpack.png",
        padding=12,
        alpha_threshold=2,
        max_edge=640,
        keep_center_component=True,
    )
    prepare_generated_rocket(
        SOURCE / "主角" / "player_rocket_generated.png",
        OUTPUT / "player" / "player-rocket.png",
    )
    transparent_assets = {
        SOURCE / "主角" / "shield_overlay.png": OUTPUT / "player" / "shield-overlay.png",
        SOURCE / "道具" / "pickups" / "pickup_trampoline.png": OUTPUT / "items" / "pickup-trampoline.png",
        SOURCE / "道具" / "pickups" / "pickup_jetpack.png": OUTPUT / "items" / "pickup-jetpack.png",
        SOURCE / "道具" / "pickups" / "pickup_propeller_hat.png": OUTPUT / "items" / "pickup-propeller-hat.png",
        SOURCE / "道具" / "pickups" / "pickup_rocket.png": OUTPUT / "items" / "pickup-rocket.png",
        SOURCE / "道具" / "pickups" / "pickup_shield.png": OUTPUT / "items" / "pickup-shield.png",
        SOURCE / "特效" / "common_vfx" / "pickup_sparkles.png": OUTPUT / "effects" / "item-pickup-sparkles.png",
        SOURCE / "特效" / "common_vfx" / "fall_drag_streaks.png": OUTPUT / "effects" / "player-fall-drag-streaks.png",
        SOURCE / "特效" / "common_vfx" / "screen_wrap_afterimages.png": OUTPUT / "effects" / "player-screen-wrap-afterimages.png",
        SOURCE / "特效" / "item_motion_vfx" / "jetpack_flames.png": OUTPUT / "effects" / "jetpack-flames.png",
        SOURCE / "特效" / "item_motion_vfx" / "jetpack_paper_scraps.png": OUTPUT / "effects" / "jetpack-paper-scraps.png",
        SOURCE / "特效" / "item_motion_vfx" / "rocket_flame.png": OUTPUT / "effects" / "rocket-flame.png",
        SOURCE / "特效" / "item_motion_vfx" / "rocket_paper_scraps.png": OUTPUT / "effects" / "rocket-paper-scraps.png",
        SOURCE / "特效" / "item_motion_vfx" / "rocket_paper_trail.png": OUTPUT / "effects" / "rocket-paper-trail.png",
        SOURCE / "特效" / "item_motion_vfx" / "shield_pulse.png": OUTPUT / "effects" / "shield-pulse.png",
        SOURCE / "特效" / "item_motion_vfx" / "resurrection_pulse.png": OUTPUT / "effects" / "resurrection-pulse.png",
        SOURCE / "特效" / "item_motion_vfx" / "head_start_burst.png": OUTPUT / "effects" / "head-start-burst.png",
        SOURCE / "特效" / "item_motion_vfx" / "spring_rebound.png": OUTPUT / "effects" / "spring-rebound.png",
        SOURCE / "特效" / "item_motion_vfx" / "trampoline_rebound.png": OUTPUT / "effects" / "trampoline-rebound.png",
        SOURCE / "UI" / "hud_components" / "score_card.png": OUTPUT / "ui" / "hud" / "score-card.png",
        SOURCE / "UI" / "hud_components" / "height_card.png": OUTPUT / "ui" / "hud" / "height-card.png",
        SOURCE / "UI" / "hud_components" / "pause_button.png": OUTPUT / "ui" / "hud" / "pause-button.png",
        SOURCE / "UI" / "hud_components" / "item_progress_bar_fill.png": OUTPUT / "ui" / "hud" / "item-progress-fill.png",
        SOURCE / "UI" / "hud_components" / "sensor_error_bar.png": OUTPUT / "ui" / "hud" / "sensor-error-bar.png",
        SOURCE / "UI" / "hud_components" / "retry_button.png": OUTPUT / "ui" / "hud" / "retry-button.png",
        SOURCE / "UI" / "hud_components" / "back_button.png": OUTPUT / "ui" / "hud" / "back-button.png",
        SOURCE / "UI" / "hud_components" / "play_again_button.png": OUTPUT / "ui" / "hud" / "play-again-button.png",
        SOURCE / "UI" / "overlay_panels" / "loading_panel.png": OUTPUT / "ui" / "panels" / "loading-panel.png",
        SOURCE / "UI" / "overlay_panels" / "sensor_calibration_panel.png": OUTPUT / "ui" / "panels" / "sensor-calibration-panel.png",
        SOURCE / "UI" / "overlay_panels" / "ready_panel.png": OUTPUT / "ui" / "panels" / "ready-panel.png",
        SOURCE / "UI" / "overlay_panels" / "pause_panel.png": OUTPUT / "ui" / "panels" / "pause-panel.png",
        SOURCE / "UI" / "overlay_panels" / "sensor_error_panel.png": OUTPUT / "ui" / "panels" / "sensor-error-panel.png",
        SOURCE / "UI" / "overlay_panels" / "revive_confirmation_panel.png": OUTPUT / "ui" / "panels" / "revive-confirmation-panel.png",
        SOURCE / "UI" / "overlay_panels" / "results_panel.png": OUTPUT / "ui" / "panels" / "results-panel.png",
        SOURCE / "UI" / "overlay_panels" / "missing_resource_panel.png": OUTPUT / "ui" / "panels" / "missing-resource-panel.png",
        SOURCE / "UI" / "tutorial_illustrations" / "tutorial_sensor_tilt.png": OUTPUT / "ui" / "tutorial" / "sensor-tilt.png",
        SOURCE / "UI" / "tutorial_illustrations" / "tutorial_paper_plane_shot.png": OUTPUT / "ui" / "tutorial" / "paper-plane-shot.png",
        SOURCE / "UI" / "tutorial_illustrations" / "tutorial_hazard_symbols.png": OUTPUT / "ui" / "tutorial" / "hazard-symbols.png",
        SOURCE / "道具" / "hud_icons" / "hud_spring.png": OUTPUT / "ui" / "item-icons" / "spring.png",
        SOURCE / "道具" / "hud_icons" / "hud_trampoline.png": OUTPUT / "ui" / "item-icons" / "trampoline.png",
        SOURCE / "道具" / "hud_icons" / "hud_jetpack.png": OUTPUT / "ui" / "item-icons" / "jetpack.png",
        SOURCE / "道具" / "hud_icons" / "hud_propeller_hat.png": OUTPUT / "ui" / "item-icons" / "propeller-hat.png",
        SOURCE / "道具" / "hud_icons" / "hud_rocket.png": OUTPUT / "ui" / "item-icons" / "rocket.png",
        SOURCE / "道具" / "hud_icons" / "hud_shield.png": OUTPUT / "ui" / "item-icons" / "shield.png",
        SOURCE / "道具" / "hud_icons" / "hud_head_start.png": OUTPUT / "ui" / "item-icons" / "head-start.png",
        SOURCE / "投射物" / "paper_plane_projectile" / "paper_plane.png": OUTPUT / "projectiles" / "paper-plane-trimmed.png",
        SOURCE / "投射物" / "paper_plane_projectile" / "aim_reticle.png": OUTPUT / "projectiles" / "aim-reticle-trimmed.png",
        SOURCE / "投射物" / "paper_plane_projectile" / "projectile_trail.png": OUTPUT / "projectiles" / "paper-plane-trail.png",
        SOURCE / "平台" / "state_vfx" / "platform_vfx_breakable_cracks.png": OUTPUT / "platform-effects" / "breakable-cracks.png",
        SOURCE / "平台" / "state_vfx" / "platform_vfx_disappearing_fade.png": OUTPUT / "platform-effects" / "disappearing-fade.png",
        SOURCE / "平台" / "state_vfx" / "platform_vfx_explosive_countdown.png": OUTPUT / "platform-effects" / "explosive-countdown.png",
        SOURCE / "平台" / "state_vfx" / "platform_vfx_explosion_fragments.png": OUTPUT / "platform-effects" / "explosion-fragments.png",
        SOURCE / "特效" / "common_vfx" / "paper_plane_hit_scratches.png": OUTPUT / "effects" / "enemy-hit-scratch.png",
        SOURCE / "特效" / "common_vfx" / "enemy_defeat_fragments.png": OUTPUT / "effects" / "enemy-defeat-fragments.png",
        SOURCE / "特效" / "failure_vfx" / "enemy_contact_impact.png": OUTPUT / "effects" / "player-enemy-contact-impact.png",
        SOURCE / "特效" / "failure_vfx" / "falling_failure.png": OUTPUT / "effects" / "failure-falling.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_ufo_complete.png": OUTPUT / "hazards" / "ufo.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_tractor_beam.png": OUTPUT / "hazards" / "ufo-beam.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_lock_target.png": OUTPUT / "hazards" / "ufo-lock-target.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_tractor_tether.png": OUTPUT / "hazards" / "ufo-tether.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_black_hole_ring.png": OUTPUT / "hazards" / "black-hole-ring.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_black_hole_core.png": OUTPUT / "hazards" / "black-hole-core.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_bear_trap.png": OUTPUT / "hazards" / "bear-trap.png",
        SOURCE / "危险物" / "hazard_frames" / "hazard_trap_trigger_flash.png": OUTPUT / "hazards" / "bear-trap-flash.png",
        SOURCE / "特效" / "failure_vfx" / "ufo_capture.png": OUTPUT / "effects" / "failure-ufo-capture.png",
        SOURCE / "特效" / "failure_vfx" / "black_hole_suction.png": OUTPUT / "effects" / "failure-black-hole-suction.png",
        SOURCE / "特效" / "failure_vfx" / "bear_trap_trigger.png": OUTPUT / "effects" / "failure-bear-trap-trigger.png",
    }
    for source, destination in transparent_assets.items():
        trim_alpha(source, destination)
    trim_alpha(
        SOURCE / "UI" / "overlay_panels" / "rules_panel.png",
        OUTPUT / "ui" / "panels" / "rules-panel.png",
        padding=0,
    )
    trim_alpha(
        SOURCE / "UI" / "hud_components" / "item_progress_bar_fill.png",
        OUTPUT / "ui" / "hud" / "item-progress-fill.png",
        alpha_threshold=5,
        max_edge=360,
    )
    trim_alpha(
        SOURCE / "危险物" / "hazard_frames" / "hazard_ufo_complete.png",
        OUTPUT / "hazards" / "ufo.png",
        alpha_threshold=18,
        max_edge=320,
    )
    trim_alpha(
        SOURCE / "UI" / "hud_components" / "rules_button.png",
        OUTPUT / "ui" / "hud" / "rules-button.png",
        max_edge=270,
    )
    for enemy_type in ("small", "large", "hover"):
        normalize_animation_pair(
            (
                SOURCE / "敌人" / "enemy_frames" / f"enemy_{enemy_type}_01.png",
                SOURCE / "敌人" / "enemy_frames" / f"enemy_{enemy_type}_02.png",
            ),
            (
                OUTPUT / "enemies" / f"enemy-{enemy_type}-01.png",
                OUTPUT / "enemies" / f"enemy-{enemy_type}-02.png",
            ),
        )
    trim_alpha(
        SOURCE / "特效" / "generated" / "landing_paper_debris_v3.png",
        OUTPUT / "effects" / "landing-paper-debris-v3.png",
        alpha_threshold=12,
    )

    platform_sources = {
        "normal": "platform_normal.png",
        "moving": "platform_moving.png",
        "breakable": "platform_breakable.png",
        "disappearing": "platform_disappearing.png",
        "shifting": "platform_shifting.png",
        "exploding": "platform_explosive.png",
    }
    for platform_type, filename in platform_sources.items():
        bake_platform_shadow(
            SOURCE / "平台" / "base" / filename,
            OUTPUT / "platforms" / f"platform-{platform_type}-shadowed-v2.png",
        )
    prepare_generated_vertical_platform(
        SOURCE / "平台" / "generated" / "platform_vertical_moving_source_v1.png",
        OUTPUT / "platforms" / "platform-vertical-moving-shadowed-v1.png",
    )
    trim_alpha(
        SOURCE / "平台" / "generated" / "platform_spiked_source_v1.png",
        OUTPUT / "platforms" / "platform-spiked-shadowed-v1.png",
        padding=4,
        alpha_threshold=2,
        max_edge=420,
        keep_center_component=True,
    )

    breakable = OUTPUT / "platforms" / "platform-breakable-shadowed-v2.png"
    make_breakable_halves(
        breakable,
        OUTPUT / "platforms" / "platform-breakable-left.png",
        OUTPUT / "platforms" / "platform-breakable-right.png",
    )

    decor_root = SOURCE / "背景" / "background_decor_v2"
    decor_output = OUTPUT / "backgrounds" / "decor-v2"
    decor_sheets = {
        "warm-decor-sheet.png": (
            "warm-binder-clip.png",
            "warm-push-pin.png",
            "warm-paperclip.png",
            "warm-pencil-spiral.png",
        ),
        "sky-decor-sheet.png": (
            "sky-sun.png",
            "sky-kite.png",
            "sky-rainbow.png",
            "sky-wind.png",
        ),
        "cloud-decor-sheet.png": (
            "cloud-lightning.png",
            "cloud-rain.png",
            "cloud-warning-zigzag.png",
            "cloud-moon-wind.png",
        ),
        "star-decor-sheet.png": (
            "star-constellation.png",
            "star-moon.png",
            "star-planet.png",
            "star-comet.png",
        ),
    }
    for sheet_name, sprite_names in decor_sheets.items():
        split_transparent_grid(
            decor_root / sheet_name,
            tuple(decor_output / name for name in sprite_names),
        )

    source_root = SOURCE / "背景"
    background_root = OUTPUT / "backgrounds" / "parallax-v2"
    warm = background_root / "base-warm-tile.png"
    sky = background_root / "base-sky-tile.png"
    cloud = background_root / "base-cloud-tile.png"
    star = background_root / "base-star-tile.png"
    make_graph_paper_tile(source_root / "background_warm_paper.png", warm)
    make_vertical_tile(source_root / "background_sky_blue.png", sky)
    make_vertical_tile(source_root / "background_cloud_dark.png", cloud)
    make_vertical_tile(source_root / "background_star_scrapbook.png", star)
    make_transition(warm, sky, background_root / "transition-warm-sky.png")
    make_transition(sky, cloud, background_root / "transition-sky-cloud.png")
    make_transition(cloud, star, background_root / "transition-cloud-star.png")


if __name__ == "__main__":
    main()

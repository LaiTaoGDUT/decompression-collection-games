from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art_sources" / "桌面大清理" / "v2-components"
VISUAL = ROOT / "assets" / "games" / "catch" / "visual"
OLD_ATLAS = VISUAL / "items" / "desktop-cleanup-items-atlas-v1.png"

ITEM_TYPES = (
    "blue-pen",
    "red-pencil",
    "yellow-eraser",
    "mint-notes",
    "binder-clip",
    "orange-tape",
    "teal-usb",
    "cream-earbuds",
    "coral-keycap",
    "purple-stress-ball",
    "round-coaster",
    "spiral-notebook",
    "clear-ruler",
    "lucky-badge",
)

NEW_ITEM_SOURCES = {
    "blue-pen": "item-blue-marker-v2.png",
    "red-pencil": "item-red-pencil-stub-v2.png",
    "binder-clip": "item-binder-clip-v2.png",
    "orange-tape": "item-orange-tape-v2.png",
    "teal-usb": "item-teal-usb-v2.png",
    "clear-ruler": "item-set-square-v2.png",
}

RESAMPLE = Image.Resampling.LANCZOS


def alpha_bbox(image: Image.Image, threshold: int = 4) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    binary = alpha.point(lambda value: 255 if value >= threshold else 0)
    return binary.getbbox() or (0, 0, image.width, image.height)


def keep_largest_alpha_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    source = alpha.load()
    visited = bytearray(width * height)
    largest: list[tuple[int, int]] = []
    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index] or source[start_x, start_y] < threshold:
                continue
            component: list[tuple[int, int]] = []
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            visited[start_index] = 1
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    index = ny * width + nx
                    if visited[index] or source[nx, ny] < threshold:
                        continue
                    visited[index] = 1
                    queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    if not largest:
        return rgba
    mask = Image.new("L", rgba.size, 0)
    mask_pixels = mask.load()
    for x, y in largest:
        mask_pixels[x, y] = source[x, y]
    rgba.putalpha(mask)
    return rgba


def fit_rgba(
    image: Image.Image,
    size: tuple[int, int],
    padding: tuple[int, int] = (0, 0),
    clean_largest: bool = False,
) -> Image.Image:
    rgba = image.convert("RGBA")
    if clean_largest:
        rgba = keep_largest_alpha_component(rgba)
    rgba = rgba.crop(alpha_bbox(rgba))
    available_width = max(1, size[0] - padding[0] * 2)
    available_height = max(1, size[1] - padding[1] * 2)
    scale = min(available_width / rgba.width, available_height / rgba.height)
    resized = rgba.resize(
        (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))),
        RESAMPLE,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2),
    )
    return canvas


def source_item(item_type: str, old_atlas: Image.Image) -> Image.Image:
    new_name = NEW_ITEM_SOURCES.get(item_type)
    if new_name:
        return Image.open(SOURCE / new_name).convert("RGBA")
    index = ITEM_TYPES.index(item_type)
    cell_width = old_atlas.width // 4
    cell_height = old_atlas.height // 4
    column = index % 4
    row = index // 4
    return old_atlas.crop((
        column * cell_width,
        row * cell_height,
        (column + 1) * cell_width,
        (row + 1) * cell_height,
    )).convert("RGBA")


def mask_rows(cell: Image.Image, grid_size: int = 96, threshold: int = 176) -> list[str]:
    alpha = cell.getchannel("A")
    rows: list[str] = []
    for row in range(grid_size):
        values: list[str] = []
        y0 = row * alpha.height // grid_size
        y1 = max(y0 + 1, (row + 1) * alpha.height // grid_size)
        for nibble_start in range(0, grid_size, 4):
            nibble = 0
            for offset in range(4):
                column = nibble_start + offset
                x0 = column * alpha.width // grid_size
                x1 = max(x0 + 1, (column + 1) * alpha.width // grid_size)
                region = alpha.crop((x0, y0, x1, y1))
                solid = sum(value >= threshold for value in region.get_flattened_data())
                required = max(1, round(region.width * region.height * 0.25))
                if solid >= required:
                    nibble |= 1 << (3 - offset)
            values.append(format(nibble, "x"))
        rows.append("".join(values))
    return rows


def build_items() -> None:
    destination = VISUAL / "items"
    destination.mkdir(parents=True, exist_ok=True)
    old_atlas = Image.open(OLD_ATLAS).convert("RGBA")
    cell_size = 384
    atlas = Image.new("RGBA", (cell_size * 4, cell_size * 4), (0, 0, 0, 0))
    masks: dict[str, dict[str, object]] = {}
    for index, item_type in enumerate(ITEM_TYPES):
        cell = fit_rgba(source_item(item_type, old_atlas), (cell_size, cell_size), (26, 26))
        atlas.alpha_composite(cell, ((index % 4) * cell_size, (index // 4) * cell_size))
        masks[item_type] = {"rows": mask_rows(cell)}
    atlas.save(destination / "desktop-cleanup-items-atlas-v2.png", optimize=True)
    payload = {
        "version": 2,
        "gridSize": 96,
        "alphaThreshold": 176,
        "types": masks,
    }
    (destination / "desktop-cleanup-items-hitmask-v2.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def build_backgrounds() -> None:
    destination = VISUAL / "backgrounds"
    destination.mkdir(parents=True, exist_ok=True)
    backdrop = Image.open(SOURCE / "backdrop-wood-v2.png").convert("RGB")
    backdrop.resize((750, 1334), RESAMPLE).save(
        destination / "desktop-cleanup-backdrop-v2.jpg",
        quality=88,
        optimize=True,
        progressive=True,
    )
    playmat = fit_rgba(
        Image.open(SOURCE / "playmat-v2.png"),
        (1024, 1024),
        (28, 28),
        clean_largest=True,
    )
    playmat.save(destination / "desktop-cleanup-playmat-v2.png", optimize=True)


def build_ui() -> None:
    destination = VISUAL / "ui"
    destination.mkdir(parents=True, exist_ok=True)
    jobs = {
        "desktop-cleanup-hud-help-v2.png": ("hud-help-v2.png", (256, 256), (8, 8)),
        "desktop-cleanup-hud-pause-v2.png": ("hud-pause-v2.png", (256, 256), (8, 8)),
        "desktop-cleanup-title-emblem-v2.png": ("hud-title-emblem-v2.png", (512, 256), (14, 14)),
        "desktop-cleanup-timer-plate-v2.png": ("hud-timer-plate-v2.png", (768, 256), (12, 10)),
        "desktop-cleanup-slot-tray-7-v2.png": ("slot-tray-7-v2.png", (1264, 272), (12, 10)),
        "desktop-cleanup-tool-return-v2.png": ("tool-return-v2.png", (384, 384), (8, 8)),
        "desktop-cleanup-tool-magnet-v2.png": ("tool-magnet-v2.png", (384, 384), (8, 8)),
        "desktop-cleanup-tool-shuffle-v2.png": ("tool-shuffle-v2.png", (384, 384), (8, 8)),
    }
    for output_name, (source_name, size, padding) in jobs.items():
        rendered = fit_rgba(Image.open(SOURCE / source_name), size, padding, clean_largest=True)
        rendered.save(destination / output_name, optimize=True)


def build_vfx() -> None:
    destination = VISUAL / "vfx"
    destination.mkdir(parents=True, exist_ok=True)
    smoke = fit_rgba(Image.open(SOURCE / "match-smoke-v1.png"), (512, 512), (18, 18))
    smoke.save(destination / "desktop-cleanup-match-smoke-v1.png", optimize=True)


def main() -> None:
    build_backgrounds()
    build_items()
    build_ui()
    build_vfx()


if __name__ == "__main__":
    main()

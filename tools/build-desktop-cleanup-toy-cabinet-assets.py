#!/usr/bin/env python3
"""把《童年玩具柜》透明源图制作成运行时图集和离线命中掩码。"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art_sources" / "桌面大清理" / "主题-童年玩具柜" / "desktop-cleanup-toy-cabinet-source-v2.png"
VISUAL = ROOT / "assets" / "games" / "catch" / "visual" / "items"
ATLAS = VISUAL / "desktop-cleanup-toy-cabinet-items-atlas-v2.png"
HITMASK = VISUAL / "desktop-cleanup-toy-cabinet-items-hitmask-v2.json"

ITEM_TYPES = (
    "wooden-block",
    "rubiks-cube",
    "spinning-top",
    "yo-yo",
    "wind-up-robot",
    "toy-car",
    "puzzle-piece",
    "marble-pouch",
    "pinwheel",
    "toy-horn",
    "toy-drum",
    "teddy-bear",
    "toy-telescope",
    "baby-rattle",
    "wind-up-key",
    "paper-airplane",
    "ring-toss",
    "finger-skateboard",
    "toy-dinosaur",
    "star-medal",
)

ATLAS_COLUMNS = 4
ATLAS_ROWS = 5
ATLAS_CELL_SIZE = 384
ATLAS_PADDING = 22
HITMASK_GRID_SIZE = 96
HITMASK_ALPHA_THRESHOLD = 176
RESAMPLE = Image.Resampling.LANCZOS


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """返回透明图的有效包围盒，并保留所有相连/不相连的可见部件。"""
    bbox = image.convert("RGBA").getchannel("A").getbbox()
    return bbox or (0, 0, image.width, image.height)


def fit_rgba(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA").crop(alpha_bbox(image))
    available = ATLAS_CELL_SIZE - ATLAS_PADDING * 2
    scale = min(available / max(1, rgba.width), available / max(1, rgba.height))
    resized = rgba.resize(
        (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))),
        RESAMPLE,
    )
    canvas = Image.new("RGBA", (ATLAS_CELL_SIZE, ATLAS_CELL_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((ATLAS_CELL_SIZE - resized.width) // 2, (ATLAS_CELL_SIZE - resized.height) // 2),
    )
    return canvas


def mask_rows(cell: Image.Image) -> list[str]:
    alpha = cell.getchannel("A")
    rows: list[str] = []
    for row in range(HITMASK_GRID_SIZE):
        values: list[str] = []
        y0 = row * alpha.height // HITMASK_GRID_SIZE
        y1 = max(y0 + 1, (row + 1) * alpha.height // HITMASK_GRID_SIZE)
        for nibble_start in range(0, HITMASK_GRID_SIZE, 4):
            nibble = 0
            for offset in range(4):
                column = nibble_start + offset
                x0 = column * alpha.width // HITMASK_GRID_SIZE
                x1 = max(x0 + 1, (column + 1) * alpha.width // HITMASK_GRID_SIZE)
                region = alpha.crop((x0, y0, x1, y1))
                solid = sum(value >= HITMASK_ALPHA_THRESHOLD for value in region.getdata())
                required = max(1, round(region.width * region.height * 0.25))
                if solid >= required:
                    nibble |= 1 << (3 - offset)
            values.append(format(nibble, "x"))
        rows.append("".join(values))
    return rows


def object_boxes(source: Image.Image) -> list[tuple[int, int, int, int]]:
    """按 Alpha 连通主体找出 20 个玩具，避免固定行边界切掉跨格物件。"""
    alpha = source.getchannel("A")
    width, height = source.size
    pixels = alpha.load()
    threshold = 8
    visited = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []
    for start_y in range(height):
        for start_x in range(width):
            start = start_y * width + start_x
            if visited[start] or pixels[start_x, start_y] < threshold:
                continue
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            visited[start] = 1
            min_x = max_x = start_x
            min_y = max_y = start_y
            while queue:
                x, y = queue.popleft()
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for next_x, next_y in (
                    (x - 1, y),
                    (x + 1, y),
                    (x, y - 1),
                    (x, y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if visited[index] or pixels[next_x, next_y] < threshold:
                        continue
                    visited[index] = 1
                    queue.append((next_x, next_y))
            if (max_x - min_x + 1) * (max_y - min_y + 1) > 100:
                # A small margin preserves the faint anti-aliased edge that
                # sits below the component threshold without touching a
                # neighboring toy.
                boxes.append((
                    max(0, min_x - 2),
                    max(0, min_y - 2),
                    min(width, max_x + 3),
                    min(height, max_y + 3),
                ))
    if len(boxes) != len(ITEM_TYPES):
        raise ValueError(f"透明源图应有 {len(ITEM_TYPES)} 个玩具主体，实际找到 {len(boxes)} 个")
    by_vertical_position = sorted(
        boxes,
        key=lambda box: ((box[1] + box[3]) / 2, (box[0] + box[2]) / 2),
    )
    ordered: list[tuple[int, int, int, int]] = []
    for row_start in range(0, len(by_vertical_position), ATLAS_COLUMNS):
        row = by_vertical_position[row_start:row_start + ATLAS_COLUMNS]
        ordered.extend(sorted(row, key=lambda box: (box[0] + box[2]) / 2))
    return ordered


def build() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"找不到透明源图：{SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1024, 1536):
        raise ValueError(f"源图尺寸发生变化，期望 1024×1536，实际为 {source.size}")
    if source.getchannel("A").getbbox() is None:
        raise ValueError("源图没有有效 Alpha 内容")

    VISUAL.mkdir(parents=True, exist_ok=True)
    boxes = object_boxes(source)
    atlas = Image.new(
        "RGBA",
        (ATLAS_COLUMNS * ATLAS_CELL_SIZE, ATLAS_ROWS * ATLAS_CELL_SIZE),
        (0, 0, 0, 0),
    )
    masks: dict[str, dict[str, object]] = {}
    for index, (item_type, box) in enumerate(zip(ITEM_TYPES, boxes)):
        cell = fit_rgba(source.crop(box))
        atlas.alpha_composite(
            cell,
            ((index % ATLAS_COLUMNS) * ATLAS_CELL_SIZE, (index // ATLAS_COLUMNS) * ATLAS_CELL_SIZE),
        )
        masks[item_type] = {"rows": mask_rows(cell)}

    atlas.save(ATLAS, optimize=True)
    HITMASK.write_text(
        json.dumps(
            {
                "version": 1,
                "gridSize": HITMASK_GRID_SIZE,
                "alphaThreshold": HITMASK_ALPHA_THRESHOLD,
                "types": masks,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"built {ATLAS}")
    print(f"built {HITMASK}")


if __name__ == "__main__":
    build()

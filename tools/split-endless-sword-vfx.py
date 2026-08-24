#!/usr/bin/env python3
"""Split the generated Endless Sword VFX atlas into clean 256x256 textures.

The source is kept as an art-source record. It is a 1254x1254 RGBA image with
17 effects arranged as 4 + 4 + 4 + 5 cells. The generated image contains faint
baked grid lines, occasional effects crossing a nominal cell boundary, and
low-alpha noise around transparent edges. This tool assigns strong connected
components to their nearest VFX cell, keeps a small local glow halo, and fits
each isolated effect into a centered 256x256 texture.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


OUTPUT_SIZE = 256
INTERIOR_MARGIN = 3
ALPHA_THRESHOLD = 16
CORE_ALPHA_THRESHOLD = 32
CORE_BBOX_PADDING = 16
MAX_CONTENT_SIZE = 240
ROW_COLUMN_COUNTS = (4, 4, 4, 5)

VFX_NAMES = (
    "hit-spark-v1",
    "sword-slash-v1",
    "lightning-v1",
    "fire-explode-v1",
    "fire-field-v1",
    "ice-burst-v1",
    "seal-impact-v1",
    "black-hole-v1",
    "meteor-v1",
    "star-field-v1",
    "wind-trail-v1",
    "xp-pickup-v1",
    "heal-v1",
    "shield-v1",
    "boss-summon-v1",
    "boss-die-v1",
    "realm-break-v1",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--alpha-threshold", type=int, default=ALPHA_THRESHOLD)
    parser.add_argument("--interior-margin", type=int, default=INTERIOR_MARGIN)
    return parser.parse_args()


def cell_ranges(width: int, height: int) -> list[tuple[int, int, int, int]]:
    """Return nominal cell rectangles in row-major order."""

    ranges: list[tuple[int, int, int, int]] = []
    row_count = len(ROW_COLUMN_COUNTS)
    for row, column_count in enumerate(ROW_COLUMN_COUNTS):
        y0 = round(row * height / row_count)
        y1 = round((row + 1) * height / row_count)
        for column in range(column_count):
            x0 = round(column * width / column_count)
            x1 = round((column + 1) * width / column_count)
            ranges.append((x0, y0, x1, y1))
    return ranges


def cell_for_point(x: int, y: int, width: int, height: int) -> int:
    row_count = len(ROW_COLUMN_COUNTS)
    row = min(row_count - 1, y * row_count // height)
    column_count = ROW_COLUMN_COUNTS[row]
    column = min(column_count - 1, x * column_count // width)
    return sum(ROW_COLUMN_COUNTS[:row]) + column


def label_core_components(
    alpha: list[int],
    width: int,
    height: int,
    threshold: int,
) -> list[tuple[list[int], list[int]]]:
    """Label strong pixels and return their cell ownership candidates."""

    core = bytearray(1 if value >= threshold else 0 for value in alpha)
    labels = [-1] * (width * height)
    components: list[tuple[list[int], list[int]]] = []
    for start in range(width * height):
        if not core[start] or labels[start] >= 0:
            continue
        component_id = len(components)
        queue: deque[int] = deque([start])
        labels[start] = component_id
        points: list[int] = []
        cell_counts = [0] * len(VFX_NAMES)
        while queue:
            index = queue.popleft()
            points.append(index)
            x = index % width
            y = index // width
            cell_counts[cell_for_point(x, y, width, height)] += 1
            for offset_y in (-1, 0, 1):
                neighbor_y = y + offset_y
                if not 0 <= neighbor_y < height:
                    continue
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    if not 0 <= neighbor_x < width:
                        continue
                    neighbor = neighbor_y * width + neighbor_x
                    if core[neighbor] and labels[neighbor] < 0:
                        labels[neighbor] = component_id
                        queue.append(neighbor)
        components.append((points, cell_counts))
    return components


def assign_core_pixels(
    components: list[tuple[list[int], list[int]]],
    width: int,
    height: int,
    ranges: list[tuple[int, int, int, int]],
) -> list[int]:
    """Assign strong pixels to a VFX, splitting components that cross cells."""

    centers = [
        ((x0 + x1) / 2, (y0 + y1) / 2)
        for x0, y0, x1, y1 in ranges
    ]
    assigned = [-1] * (width * height)
    for points, cell_counts in components:
        dominant_cell = max(range(len(VFX_NAMES)), key=cell_counts.__getitem__)
        dominant_ratio = cell_counts[dominant_cell] / len(points)
        if dominant_ratio >= 0.68:
            for index in points:
                assigned[index] = dominant_cell
            continue
        for index in points:
            x = index % width
            y = index // width
            assigned[index] = min(
                range(len(VFX_NAMES)),
                key=lambda cell: (centers[cell][0] - x) ** 2
                + (centers[cell][1] - y) ** 2,
            )
    return assigned


def clean_pixel(pixel: tuple[int, int, int, int], threshold: int) -> tuple[int, int, int, int]:
    return pixel if pixel[3] >= threshold else (0, 0, 0, 0)


def build_separator_mask(
    width: int,
    height: int,
    ranges: list[tuple[int, int, int, int]],
    margin: int,
) -> bytearray:
    """Build a mask for the narrow baked divider bands between cells."""

    mask = bytearray(width * height)
    for x0, y0, x1, y1 in ranges:
        if x0 > 0:
            for y in range(y0, y1):
                for x in range(max(0, x0 - margin + 1), min(width, x0 + margin)):
                    mask[y * width + x] = 1
        if x1 < width:
            for y in range(y0, y1):
                for x in range(max(0, x1 - margin + 1), min(width, x1 + margin)):
                    mask[y * width + x] = 1
        if y0 > 0:
            for y in range(max(0, y0 - margin + 1), min(height, y0 + margin)):
                for x in range(x0, x1):
                    mask[y * width + x] = 1
        if y1 < height:
            for y in range(max(0, y1 - margin + 1), min(height, y1 + margin)):
                for x in range(x0, x1):
                    mask[y * width + x] = 1
    return mask


def extract_content(
    source_pixels: list[tuple[int, int, int, int]],
    assigned: list[int],
    cell: int,
    cell_range: tuple[int, int, int, int],
    width: int,
    height: int,
    alpha_threshold: int,
    interior_margin: int,
    separator_mask: bytearray,
) -> Image.Image:
    """Extract one cell, including its own overflow and a local glow halo."""

    core_points = [
        index for index, owner in enumerate(assigned) if owner == cell
    ]
    if not core_points:
        raise ValueError(f"no VFX content detected for cell {cell + 1}")

    core_xs = [index % width for index in core_points]
    core_ys = [index // width for index in core_points]
    padding = CORE_BBOX_PADDING
    bbox_x0 = max(0, min(core_xs) - padding)
    bbox_y0 = max(0, min(core_ys) - padding)
    bbox_x1 = min(width - 1, max(core_xs) + padding)
    bbox_y1 = min(height - 1, max(core_ys) + padding)
    cell_x0, cell_y0, cell_x1, cell_y1 = cell_range
    halo_x0 = cell_x0 + (interior_margin if cell_x0 > 0 else 0)
    halo_y0 = cell_y0 + (interior_margin if cell_y0 > 0 else 0)
    halo_x1 = cell_x1 - (interior_margin if cell_x1 < width else 0)
    halo_y1 = cell_y1 - (interior_margin if cell_y1 < height else 0)

    selected: list[tuple[int, tuple[int, int, int, int]]] = []
    for index, pixel in enumerate(source_pixels):
        if pixel[3] < alpha_threshold:
            continue
        x = index % width
        y = index // width
        is_owned_core = assigned[index] == cell and not separator_mask[index]
        is_local_halo = (
            bbox_x0 <= x <= bbox_x1
            and bbox_y0 <= y <= bbox_y1
            and halo_x0 <= x < halo_x1
            and halo_y0 <= y < halo_y1
        )
        if is_owned_core or is_local_halo:
            selected.append((index, clean_pixel(pixel, alpha_threshold)))

    if not selected:
        raise ValueError(f"all pixels were removed for cell {cell + 1}")
    xs = [index % width for index, _ in selected]
    ys = [index // width for index, _ in selected]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    content_width = x1 - x0
    content_height = y1 - y0
    content = Image.new("RGBA", (content_width, content_height), (0, 0, 0, 0))
    content_pixels = [(0, 0, 0, 0)] * (content_width * content_height)
    for index, pixel in selected:
        source_x = index % width
        source_y = index // width
        content_pixels[(source_y - y0) * content_width + source_x - x0] = pixel
    content.putdata(content_pixels)
    return content


def fit_texture(content: Image.Image) -> Image.Image:
    scale = min(
        MAX_CONTENT_SIZE / content.width,
        MAX_CONTENT_SIZE / content.height,
        1,
    )
    resized = content.resize(
        (
            max(1, round(content.width * scale)),
            max(1, round(content.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    texture = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    texture.alpha_composite(
        resized,
        ((OUTPUT_SIZE - resized.width) // 2, (OUTPUT_SIZE - resized.height) // 2),
    )
    texture.putdata(
        [
            (red, green, blue, alpha) if alpha else (0, 0, 0, 0)
            for red, green, blue, alpha in texture.get_flattened_data()
        ]
    )
    return texture


def split_atlas(
    source_path: Path,
    output_dir: Path,
    *,
    alpha_threshold: int,
    interior_margin: int,
) -> list[Path]:
    source = Image.open(source_path).convert("RGBA")
    width, height = source.size
    if width != height:
        raise ValueError(f"VFX atlas must be square, got {source.size}")
    if len(VFX_NAMES) != sum(ROW_COLUMN_COUNTS):
        raise ValueError("VFX name count does not match the atlas row layout")
    if width < max(ROW_COLUMN_COUNTS) * (interior_margin * 2 + 1):
        raise ValueError("interior margin is too large for the source atlas")

    ranges = cell_ranges(width, height)
    separator_mask = build_separator_mask(
        width,
        height,
        ranges,
        max(interior_margin * 2, 6),
    )
    source_pixels = list(source.get_flattened_data())
    alpha = [pixel[3] for pixel in source_pixels]
    components = label_core_components(
        alpha,
        width,
        height,
        CORE_ALPHA_THRESHOLD,
    )
    assigned = assign_core_pixels(components, width, height, ranges)

    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for index, name in enumerate(VFX_NAMES):
        texture = fit_texture(
            extract_content(
                source_pixels,
                assigned,
                index,
                ranges[index],
                width,
                height,
                alpha_threshold,
                interior_margin,
                separator_mask,
            )
        )

        output_path = output_dir / f"{name}.png"
        texture.save(output_path, format="PNG", optimize=True)
        outputs.append(output_path)
    return outputs


def main() -> None:
    args = parse_args()
    if not 0 <= args.alpha_threshold < 255:
        raise SystemExit("--alpha-threshold must be between 0 and 254")
    if args.interior_margin < 0:
        raise SystemExit("--interior-margin must not be negative")

    outputs = split_atlas(
        args.input,
        args.output_dir,
        alpha_threshold=args.alpha_threshold,
        interior_margin=args.interior_margin,
    )
    print(f"split {len(outputs)} VFX textures at {args.output_dir}")
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()

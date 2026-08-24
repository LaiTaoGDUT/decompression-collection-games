#!/usr/bin/env python3
"""把 3×2 透明道具图集拆成六张可追溯的 RGBA 源图。"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


ITEM_NAMES = (
    "teal-wireless-mouse",
    "cream-alarm-clock",
    "coral-candle-jar",
    "mustard-glasses-case",
    "mint-compact-mirror",
    "purple-mini-speaker",
)
GRID_COLUMNS = 3
GRID_ROWS = 2


def clear_fully_transparent_rgb(image: Image.Image) -> Image.Image:
    """Discard hidden background RGB while preserving the supplied alpha exactly."""
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    return rgba


def keep_largest_alpha_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    """Discard isolated generator specks while preserving anti-aliased alpha values."""
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
                for nx in range(x - 1, x + 2):
                    for ny in range(y - 1, y + 2):
                        if nx == x and ny == y or not (0 <= nx < width and 0 <= ny < height):
                            continue
                        index = ny * width + nx
                        if visited[index] or source[nx, ny] < threshold:
                            continue
                        visited[index] = 1
                        queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    if not largest:
        raise ValueError("cell does not contain an alpha component")
    keep = bytearray(width * height)
    for x, y in largest:
        keep[y * width + x] = 1
    for y in range(height):
        for x in range(width):
            if not keep[y * width + x]:
                source[x, y] = 0
    rgba.putalpha(alpha)
    return rgba


def remove_small_alpha_components(image: Image.Image, threshold: int = 8, minimum_size: int = 64) -> Image.Image:
    """Remove tiny 4-connected specks without cutting away meaningful detached details."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    source = alpha.load()
    visited = bytearray(width * height)
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
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    index = ny * width + nx
                    if visited[index] or source[nx, ny] < threshold:
                        continue
                    visited[index] = 1
                    queue.append((nx, ny))
            if len(component) < minimum_size:
                for x, y in component:
                    source[x, y] = 0
    rgba.putalpha(alpha)
    return rgba


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="3×2 transparent RGBA 图集")
    parser.add_argument("output", type=Path, help="六张 RGBA 源图目录")
    args = parser.parse_args()

    with Image.open(args.input) as image:
        atlas = image.convert("RGBA")
    expected_size = (1536, 1024)
    if atlas.size != expected_size:
        raise ValueError(f"expected {expected_size}, got {atlas.size}")
    if atlas.getchannel("A").getextrema() == (0, 0):
        raise ValueError("input atlas does not contain visible alpha")

    cell_width = atlas.width // GRID_COLUMNS
    cell_height = atlas.height // GRID_ROWS
    args.output.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(ITEM_NAMES):
        column = index % GRID_COLUMNS
        row = index // GRID_COLUMNS
        cell = atlas.crop((
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width,
            (row + 1) * cell_height,
        ))
        cleaned = clear_fully_transparent_rgb(
            remove_small_alpha_components(keep_largest_alpha_component(cell))
        )
        cleaned.save(
            args.output / f"item-{name}-v4.png",
            optimize=True,
        )


if __name__ == "__main__":
    main()

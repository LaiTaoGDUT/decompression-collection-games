#!/usr/bin/env python3
"""Normalize one 4x4 Boss sprite sheet into the production 2048x2048 format.

The source images in art_sources/无尽剑域/boss are AI-generated 1254x1254 sheets.
This tool keeps the source untouched, removes baked checkerboard backgrounds when
needed, extracts the 16 grid cells, applies one shared scale, and aligns every
frame to a common bottom-center anchor.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass, field
from array import array
from pathlib import Path

from PIL import Image


GRID_SIZE = 4
FRAME_SIZE = 512
DEFAULT_MAX_CONTENT = 448
DEFAULT_BASELINE = 480
DEFAULT_ALPHA_THRESHOLD = 8
# The source subjects are 30k–90k pixels per frame; the neighboring-pose leaks
# are below this threshold. Keeping only substantial connected islands removes
# those leaks without touching the body.
MIN_ISLAND_AREA = 10000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-content", type=int, default=DEFAULT_MAX_CONTENT)
    parser.add_argument("--baseline", type=int, default=DEFAULT_BASELINE)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    return parser.parse_args()


def checkerboard_candidate(pixel: tuple[int, int, int]) -> bool:
    minimum = min(pixel)
    maximum = max(pixel)
    return minimum >= 90 and maximum - minimum <= 100


def strict_checkerboard_pixel(pixel: tuple[int, int, int]) -> bool:
    minimum = min(pixel)
    maximum = max(pixel)
    return minimum >= 230 and maximum - minimum <= 18


def flood_background(image: Image.Image) -> bytearray:
    """Find checkerboard pixels connected to the slot boundary.

    The broad test removes gray anti-aliased checkerboard pixels. A second pass
    removes large enclosed strict-gray islands, which covers holes between armor
    plates without deleting small light details inside the character.
    """

    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = list(rgb.getdata())
    background = bytearray(width * height)
    queue: deque[int] = deque()

    def enqueue(index: int) -> None:
        if not background[index] and checkerboard_candidate(pixels[index]):
            background[index] = 1
            queue.append(index)

    for x in range(width):
        enqueue(x)
        enqueue((height - 1) * width + x)
    for y in range(height):
        enqueue(y * width)
        enqueue(y * width + width - 1)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        if x > 0:
            enqueue(index - 1)
        if x + 1 < width:
            enqueue(index + 1)
        if y > 0:
            enqueue(index - width)
        if y + 1 < height:
            enqueue(index + width)

    visited = bytearray(width * height)
    for start in range(width * height):
        if background[start] or visited[start] or not strict_checkerboard_pixel(pixels[start]):
            continue

        component: list[int] = []
        visited[start] = 1
        queue.append(start)
        while queue:
            index = queue.popleft()
            component.append(index)
            x = index % width
            y = index // width
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
                    if (
                        not background[neighbor]
                        and not visited[neighbor]
                        and strict_checkerboard_pixel(pixels[neighbor])
                    ):
                        visited[neighbor] = 1
                        queue.append(neighbor)

        if len(component) >= 128:
            for index in component:
                background[index] = 1
                queue.append(index)
            while queue:
                index = queue.popleft()
                x = index % width
                y = index // width
                for neighbor in (
                    index - 1 if x > 0 else None,
                    index + 1 if x + 1 < width else None,
                    index - width if y > 0 else None,
                    index + width if y + 1 < height else None,
                ):
                    if neighbor is not None:
                        enqueue(neighbor)

    return background


def threshold_alpha(alpha: Image.Image, threshold: int) -> Image.Image:
    return alpha.point(lambda value: value if value > threshold else 0)


@dataclass
class Component:
    area: int = 0
    sum_x: int = 0
    sum_y: int = 0
    min_x: int = field(default=10**9)
    min_y: int = field(default=10**9)
    max_x: int = field(default=-1)
    max_y: int = field(default=-1)
    cells: set[int] = field(default_factory=set)
    cell_counts: dict[int, int] = field(default_factory=dict)

    @property
    def center_x(self) -> float:
        return self.sum_x / self.area

    @property
    def center_y(self) -> float:
        return self.sum_y / self.area


def cell_for_point(x: int, y: int, width: int, height: int) -> int:
    column = min(GRID_SIZE - 1, x * GRID_SIZE // width)
    row = min(GRID_SIZE - 1, y * GRID_SIZE // height)
    return row * GRID_SIZE + column


def build_foreground_mask(
    source: Image.Image,
    *,
    alpha_threshold: int,
) -> tuple[Image.Image, bytearray, bool]:
    rgba = source.convert("RGBA")
    has_alpha = "A" in source.getbands()
    if has_alpha:
        alpha = threshold_alpha(rgba.getchannel("A"), alpha_threshold)
        foreground = bytearray(1 if value > alpha_threshold else 0 for value in alpha.getdata())
    else:
        background = flood_background(source)
        alpha = Image.new("L", source.size)
        alpha.putdata([0 if background[index] else 255 for index in range(source.width * source.height)])
        foreground = bytearray(0 if background[index] else 1 for index in range(source.width * source.height))
    rgba.putalpha(alpha)
    return rgba, foreground, has_alpha


def label_components(
    foreground: bytearray,
    width: int,
    height: int,
) -> tuple[array, list[Component]]:
    labels = array("i", [-1]) * (width * height)
    components: list[Component] = []
    queue: deque[int] = deque()

    for start in range(width * height):
        if not foreground[start] or labels[start] >= 0:
            continue
        component_id = len(components)
        component = Component()
        components.append(component)
        labels[start] = component_id
        queue.append(start)
        while queue:
            index = queue.popleft()
            x = index % width
            y = index // width
            component.area += 1
            component.sum_x += x
            component.sum_y += y
            component.min_x = min(component.min_x, x)
            component.min_y = min(component.min_y, y)
            component.max_x = max(component.max_x, x)
            component.max_y = max(component.max_y, y)
            cell = cell_for_point(x, y, width, height)
            component.cells.add(cell)
            component.cell_counts[cell] = component.cell_counts.get(cell, 0) + 1
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
                    if foreground[neighbor] and labels[neighbor] < 0:
                        labels[neighbor] = component_id
                        queue.append(neighbor)
    return labels, components


def build_group_labels(
    labels: array,
    components: list[Component],
    width: int,
    height: int,
) -> array:
    """Assign every connected component/pixel to one of the 16 frame groups.

    Most source frames are separate components. Where adjacent frames touch or
    cross a nominal grid line, the component is split pixel-by-pixel by the
    nearest per-cell visual anchor, preventing a neighboring frame's tail or
    wing from leaking into the output slot.
    """

    anchor_sums = [[0, 0, 0] for _ in range(GRID_SIZE * GRID_SIZE)]
    for index, component_id in enumerate(labels):
        if component_id < 0:
            continue
        x = index % width
        y = index // width
        cell = cell_for_point(x, y, width, height)
        anchor_sums[cell][0] += 1
        anchor_sums[cell][1] += x
        anchor_sums[cell][2] += y

    anchors: list[tuple[float, float]] = []
    for cell, (area, sum_x, sum_y) in enumerate(anchor_sums):
        if area == 0:
            raise ValueError(f"sprite content was not detected in frame {cell + 1:02d}")
        anchors.append((sum_x / area, sum_y / area))

    group_labels = array("b", [-1]) * (width * height)
    for index, component_id in enumerate(labels):
        if component_id < 0 or components[component_id].area < 4:
            continue
        x = index % width
        y = index // width
        component = components[component_id]
        dominant_cell, dominant_count = max(
            component.cell_counts.items(),
            key=lambda item: item[1],
        )
        # A single pose can legitimately cross a nominal grid line. Keep that
        # whole connected subject together when one cell clearly owns most of
        # its pixels; only split genuinely balanced touching poses.
        if len(component.cells) == 1 or dominant_count / component.area >= 0.68:
            candidates = (dominant_cell,)
        else:
            candidates = range(GRID_SIZE * GRID_SIZE)
        group_labels[index] = min(
            candidates,
            key=lambda cell: (anchors[cell][0] - x) ** 2 + (anchors[cell][1] - y) ** 2,
        )
    return group_labels


def isolated_group_frames(
    rgba: Image.Image,
    group_labels: array,
    alpha_threshold: int,
) -> list[Image.Image]:
    width, height = rgba.size
    groups: list[Image.Image] = []
    rgba_data = list(rgba.getdata())
    bounds = [[width, height, -1, -1] for _ in range(GRID_SIZE * GRID_SIZE)]
    for index, group in enumerate(group_labels):
        if group < 0:
            continue
        x = index % width
        y = index // width
        bounds[group][0] = min(bounds[group][0], x)
        bounds[group][1] = min(bounds[group][1], y)
        bounds[group][2] = max(bounds[group][2], x)
        bounds[group][3] = max(bounds[group][3], y)

    for group in range(GRID_SIZE * GRID_SIZE):
        min_x, min_y, max_x, max_y = bounds[group]
        if max_x < min_x or max_y < min_y:
            raise ValueError(f"sprite content was not assigned to frame {group + 1:02d}")

        frame_width = max_x - min_x + 1
        frame_height = max_y - min_y + 1
        frame = Image.new("RGBA", (frame_width, frame_height), (0, 0, 0, 0))
        frame_data: list[tuple[int, int, int, int]] = []
        for local_y in range(frame_height):
            source_y = min_y + local_y
            for local_x in range(frame_width):
                source_x = min_x + local_x
                source_index = source_y * width + source_x
                if group_labels[source_index] == group:
                    frame_data.append(rgba_data[source_index])
                else:
                    frame_data.append((0, 0, 0, 0))
        frame.putdata(frame_data)
        frame = remove_small_islands(frame, alpha_threshold)
        groups.append(frame)
    return groups


def remove_small_islands(frame: Image.Image, alpha_threshold: int) -> Image.Image:
    """Remove cross-slot fragments left after a touching component is split."""

    alpha = frame.getchannel("A")
    foreground = bytearray(1 if value > alpha_threshold else 0 for value in alpha.getdata())
    labels, components = label_components(foreground, frame.width, frame.height)
    alpha_data = list(alpha.getdata())
    for index, component_id in enumerate(labels):
        if component_id < 0 or components[component_id].area < MIN_ISLAND_AREA:
            alpha_data[index] = 0
    frame.putalpha(Image.frombytes("L", frame.size, bytes(alpha_data)))
    bounds = frame.getchannel("A").point(
        lambda value: 255 if value > alpha_threshold else 0
    ).getbbox()
    if bounds is None:
        raise ValueError("all sprite pixels were removed while cleaning cross-slot fragments")
    return frame.crop(bounds)


def normalize_sheet(
    source_path: Path,
    output_path: Path,
    *,
    max_content: int,
    baseline: int,
    alpha_threshold: int,
) -> dict[str, object]:
    source = Image.open(source_path)
    rgba, foreground, has_alpha = build_foreground_mask(
        source,
        alpha_threshold=alpha_threshold,
    )
    labels, components = label_components(foreground, source.width, source.height)
    group_labels = build_group_labels(labels, components, source.width, source.height)
    contents = isolated_group_frames(rgba, group_labels, alpha_threshold)
    bounds = [(content.width, content.height) for content in contents]
    max_width = max(width for width, _ in bounds)
    max_height = max(height for _, height in bounds)
    scale = min(max_content / max_width, max_content / max_height)
    sheet = Image.new("RGBA", (FRAME_SIZE * GRID_SIZE, FRAME_SIZE * GRID_SIZE), (0, 0, 0, 0))

    for index, content in enumerate(contents):
        row, column = divmod(index, GRID_SIZE)
        destination_width = max(1, round(content.width * scale))
        destination_height = max(1, round(content.height * scale))
        resized = content.resize(
            (destination_width, destination_height),
            Image.Resampling.LANCZOS,
        )
        destination_x = column * FRAME_SIZE + (FRAME_SIZE - destination_width) // 2
        destination_y = row * FRAME_SIZE + baseline - destination_height
        if destination_y < row * FRAME_SIZE:
            raise ValueError("normalized content would exceed the top of its frame")
        if destination_y + destination_height > (row + 1) * FRAME_SIZE:
            raise ValueError("normalized content would exceed the bottom of its frame")
        sheet.alpha_composite(resized, (destination_x, destination_y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="PNG", optimize=True)
    return {
        "source": str(source_path),
        "output": str(output_path),
        "source_size": source.size,
        "output_size": sheet.size,
        "has_alpha": has_alpha,
        "max_source_content": (max_width, max_height),
        "scale": round(scale, 6),
        "content_bounds": bounds,
        "frame_size": FRAME_SIZE,
        "max_content": max_content,
        "baseline": baseline,
    }


def main() -> None:
    args = parse_args()
    if args.max_content <= 0 or args.max_content > FRAME_SIZE:
        raise SystemExit("--max-content must be between 1 and 512")
    if not 0 < args.baseline <= FRAME_SIZE:
        raise SystemExit("--baseline must be between 1 and 512")
    if not 0 <= args.alpha_threshold < 255:
        raise SystemExit("--alpha-threshold must be between 0 and 254")

    result = normalize_sheet(
        args.input,
        args.output,
        max_content=args.max_content,
        baseline=args.baseline,
        alpha_threshold=args.alpha_threshold,
    )
    print(result)


if __name__ == "__main__":
    main()

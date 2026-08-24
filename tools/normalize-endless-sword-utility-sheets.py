#!/usr/bin/env python3
"""Normalize the generated Endless Sword utility art into fixed-cell sheets.

The six source images are kept as art-source records.  They contain multiple
transparent assets laid out by an image generator, so their canvas sizes and
spacing are not suitable for direct SpriteFrame slicing.  This tool extracts
the semantic slots, removes low-alpha edge noise, and writes deterministic
transparent sprite sheets with a shared scale inside each compatible group.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "art_sources" / "无尽剑域"
ALPHA_THRESHOLD = 8


@dataclass(frozen=True)
class SheetSpec:
    source: Path
    output: Path
    regions: tuple[tuple[int, int, int, int], ...]
    cell_width: int
    cell_height: int
    columns: int
    rows: int
    max_content_width: int
    max_content_height: int
    placement: str = "center"
    bottom_margin: int = 16
    component_grid: bool = False


def clean_source(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    pixels = [
        pixel if pixel[3] > ALPHA_THRESHOLD else (0, 0, 0, 0)
        for pixel in image.get_flattened_data()
    ]
    image.putdata(pixels)
    return image


def crop_content(image: Image.Image, region: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = region
    if not (0 <= x0 < x1 <= image.width and 0 <= y0 < y1 <= image.height):
        raise ValueError(f"region {region} is outside source {image.size}")
    cropped = image.crop(region)
    bbox = cropped.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"region {region} has no visible content")
    return cropped.crop(bbox)


def grid_component_contents(
    image: Image.Image,
    regions: tuple[tuple[int, int, int, int], ...],
) -> tuple[Image.Image, ...]:
    """Extract grid cells by connected-component ownership.

    A generated glow can cross a nominal grid line even when the actual asset
    is well separated. Assigning whole alpha components to their dominant cell
    keeps those glows together and prevents a neighboring asset's thin edge
    from appearing as a vertical strip in the output cell.
    """

    if not regions:
        raise ValueError("at least one grid region is required")
    x0 = min(region[0] for region in regions)
    y0 = min(region[1] for region in regions)
    x1 = max(region[2] for region in regions)
    y1 = max(region[3] for region in regions)
    work = image.crop((x0, y0, x1, y1))
    local_regions = tuple(
        (left - x0, top - y0, right - x0, bottom - y0)
        for left, top, right, bottom in regions
    )
    centers = [
        ((left + right) / 2, (top + bottom) / 2)
        for left, top, right, bottom in local_regions
    ]
    pixels = list(work.get_flattened_data())
    labels = [-1] * len(pixels)
    components: list[tuple[list[int], list[int]]] = []

    def nearest_cell(x: int, y: int) -> int:
        return min(
            range(len(centers)),
            key=lambda index: (centers[index][0] - x) ** 2
            + (centers[index][1] - y) ** 2,
        )

    def cell_for_point(x: int, y: int) -> int:
        for index, (left, top, right, bottom) in enumerate(local_regions):
            if left <= x < right and top <= y < bottom:
                return index
        return nearest_cell(x, y)

    for start, pixel in enumerate(pixels):
        if pixel[3] <= ALPHA_THRESHOLD or labels[start] >= 0:
            continue
        component_id = len(components)
        queue: deque[int] = deque([start])
        labels[start] = component_id
        points: list[int] = []
        cell_counts = [0] * len(regions)
        while queue:
            index = queue.popleft()
            points.append(index)
            x = index % work.width
            y = index // work.width
            cell_counts[cell_for_point(x, y)] += 1
            for offset_y in (-1, 0, 1):
                neighbor_y = y + offset_y
                if not 0 <= neighbor_y < work.height:
                    continue
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    if not 0 <= neighbor_x < work.width:
                        continue
                    neighbor = neighbor_y * work.width + neighbor_x
                    if pixels[neighbor][3] > ALPHA_THRESHOLD and labels[neighbor] < 0:
                        labels[neighbor] = component_id
                        queue.append(neighbor)
        components.append((points, cell_counts))

    assigned: list[list[int]] = [[] for _ in regions]
    for points, cell_counts in components:
        dominant = max(range(len(regions)), key=cell_counts.__getitem__)
        if cell_counts[dominant] / len(points) >= 0.62:
            assigned[dominant].extend(points)
            continue
        for index in points:
            assigned[nearest_cell(index % work.width, index // work.width)].append(index)

    result: list[Image.Image] = []
    for group, points in enumerate(assigned):
        if not points:
            raise ValueError(f"grid region {group + 1} has no visible content")
        xs = [index % work.width for index in points]
        ys = [index // work.width for index in points]
        left, top, right, bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
        width = right - left
        height = bottom - top
        content_pixels = [(0, 0, 0, 0)] * (width * height)
        for index in points:
            x = index % work.width
            y = index // work.width
            content_pixels[(y - top) * width + x - left] = pixels[index]
        content = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        content.putdata(content_pixels)
        result.append(content)
    return tuple(result)


def grid_regions(
    image: Image.Image,
    columns: int,
    rows: int,
    region: tuple[int, int, int, int] | None = None,
) -> tuple[tuple[int, int, int, int], ...]:
    """Split a source region into proportional row-major cells."""

    if region is None:
        x0, y0, x1, y1 = 0, 0, image.width, image.height
    else:
        x0, y0, x1, y1 = region
    result: list[tuple[int, int, int, int]] = []
    for row in range(rows):
        top = y0 + round(row * (y1 - y0) / rows)
        bottom = y0 + round((row + 1) * (y1 - y0) / rows)
        for column in range(columns):
            left = x0 + round(column * (x1 - x0) / columns)
            right = x0 + round((column + 1) * (x1 - x0) / columns)
            result.append((left, top, right, bottom))
    return tuple(result)


def anchored_vertical_regions(
    image: Image.Image,
    centers: tuple[int, ...],
) -> tuple[Image.Image, ...]:
    """Assign visible pixels to the nearest semantic vertical anchor.

    The two boss bars have overlapping glow bands in the source artwork.  A
    nearest-anchor split keeps those glows with their own bar instead of
    letting a rectangular crop leak one bar into the next frame.
    """

    if not centers:
        raise ValueError("at least one vertical anchor is required")
    source_pixels = list(image.get_flattened_data())
    labels = [-1] * len(source_pixels)
    components: list[list[int]] = []
    for start, pixel in enumerate(source_pixels):
        if pixel[3] <= ALPHA_THRESHOLD or labels[start] >= 0:
            continue
        component_id = len(components)
        queue: deque[int] = deque([start])
        labels[start] = component_id
        points: list[int] = []
        while queue:
            index = queue.popleft()
            points.append(index)
            x = index % image.width
            y = index // image.width
            for offset_y in (-1, 0, 1):
                neighbor_y = y + offset_y
                if not 0 <= neighbor_y < image.height:
                    continue
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    if not 0 <= neighbor_x < image.width:
                        continue
                    neighbor = neighbor_y * image.width + neighbor_x
                    if source_pixels[neighbor][3] > ALPHA_THRESHOLD and labels[neighbor] < 0:
                        labels[neighbor] = component_id
                        queue.append(neighbor)
        components.append(points)

    groups: list[list[tuple[int, tuple[int, int, int, int]]]] = [
        [] for _ in centers
    ]
    for points in components:
        center_y = sum(index // image.width for index in points) / len(points)
        group = min(range(len(centers)), key=lambda item: abs(centers[item] - center_y))
        groups[group].extend((index, source_pixels[index]) for index in points)

    result: list[Image.Image] = []
    for group_index, points in enumerate(groups):
        if not points:
            raise ValueError(f"vertical anchor {group_index + 1} has no content")
        xs = [index % image.width for index, _ in points]
        ys = [index // image.width for index, _ in points]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
        width = x1 - x0
        height = y1 - y0
        pixels = [(0, 0, 0, 0)] * (width * height)
        for index, pixel in points:
            x = index % image.width
            y = index // image.width
            pixels[(y - y0) * width + x - x0] = pixel
        content = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        content.putdata(pixels)
        result.append(content)
    return tuple(result)


def pack_sheet(contents: tuple[Image.Image, ...], spec: SheetSpec) -> None:
    expected_count = spec.columns * spec.rows
    if len(contents) != expected_count:
        raise ValueError(
            f"{spec.output.name}: expected {expected_count} frames, got {len(contents)}"
        )

    max_width = max(content.width for content in contents)
    max_height = max(content.height for content in contents)
    scale = min(
        spec.max_content_width / max_width,
        spec.max_content_height / max_height,
    )
    sheet = Image.new(
        "RGBA",
        (spec.columns * spec.cell_width, spec.rows * spec.cell_height),
        (0, 0, 0, 0),
    )

    for index, content in enumerate(contents):
        width = max(1, round(content.width * scale))
        height = max(1, round(content.height * scale))
        resized = content.resize((width, height), Image.Resampling.LANCZOS)
        row, column = divmod(index, spec.columns)
        cell_x = column * spec.cell_width
        cell_y = row * spec.cell_height
        x = cell_x + (spec.cell_width - width) // 2
        if spec.placement == "bottom":
            y = cell_y + spec.cell_height - spec.bottom_margin - height
        elif spec.placement == "center":
            y = cell_y + (spec.cell_height - height) // 2
        else:
            raise ValueError(f"unsupported placement: {spec.placement}")
        if x < cell_x or x + width > cell_x + spec.cell_width:
            raise ValueError(f"frame {index + 1} exceeds horizontal cell bounds")
        if y < cell_y or y + height > cell_y + spec.cell_height:
            raise ValueError(f"frame {index + 1} exceeds vertical cell bounds")
        sheet.alpha_composite(resized, dest=(x, y))

    sheet.putdata(
        [
            pixel if pixel[3] > ALPHA_THRESHOLD else (0, 0, 0, 0)
            for pixel in sheet.get_flattened_data()
        ]
    )
    spec.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(spec.output, format="PNG", optimize=True)
    print(
        f"wrote {spec.output} ({sheet.width}x{sheet.height}, "
        f"{len(contents)} frames, scale={scale:.4f})"
    )


def build_specs() -> tuple[SheetSpec, ...]:
    decorations = SOURCE_ROOT / "装饰物" / "Codex 图像 2026年8月24日 17_07_41.png"
    buttons = SOURCE_ROOT / "按钮与图标" / "Codex 图像 2026年8月24日 17_34_39.png"
    warnings = SOURCE_ROOT / "警示与阵法" / "Codex 图像 2026年8月24日 17_08_15.png"
    bars = SOURCE_ROOT / "血条与经验条" / "Codex 图像 2026年8月24日 17_33_32.png"
    frames = SOURCE_ROOT / "图标框与标签底" / "Codex 图像 2026年8月24日 17_49_07.png"
    pickups = SOURCE_ROOT / "拾取物" / "Codex 图像 2026年8月24日 17_49_21.png"

    decoration_cells = grid_regions(Image.open(decorations), 3, 2)
    warning_cells = grid_regions(Image.open(warnings), 2, 2)
    pickup_cells = (
        grid_regions(Image.open(pickups), 4, 1, (0, 0, 1254, 627))
        + grid_regions(Image.open(pickups), 3, 1, (0, 627, 1254, 1254))
    )
    button_panel_cells = ((0, 0, 1254, 463), (0, 463, 1254, 820))
    button_icon_cells = grid_regions(Image.open(buttons), 4, 1, (0, 820, 1254, 1254))
    frame_cells = grid_regions(Image.open(frames), 2, 1, (0, 0, 1536, 645))
    tag_cells = grid_regions(Image.open(frames), 2, 1, (0, 680, 1536, 1024))

    return (
        SheetSpec(
            decorations,
            SOURCE_ROOT / "装饰物" / "decorations-spritesheet-v1.png",
            decoration_cells,
            512,
            512,
            3,
            2,
            448,
            448,
            "bottom",
            component_grid=True,
        ),
        SheetSpec(
            buttons,
            SOURCE_ROOT / "按钮与图标" / "buttons-spritesheet-v1.png",
            button_panel_cells,
            1024,
            512,
            2,
            1,
            960,
            384,
        ),
        SheetSpec(
            buttons,
            SOURCE_ROOT / "按钮与图标" / "icons-spritesheet-v1.png",
            button_icon_cells,
            256,
            256,
            4,
            1,
            224,
            224,
            component_grid=True,
        ),
        SheetSpec(
            warnings,
            SOURCE_ROOT / "警示与阵法" / "warnings-spritesheet-v1.png",
            warning_cells,
            512,
            512,
            4,
            1,
            448,
            448,
            component_grid=True,
        ),
        SheetSpec(
            bars,
            SOURCE_ROOT / "血条与经验条" / "hp-xp-bars-spritesheet-v1.png",
            tuple((0, 0, 0, 0) for _ in range(4)),
            1024,
            256,
            1,
            4,
            960,
            224,
        ),
        SheetSpec(
            bars,
            SOURCE_ROOT / "血条与经验条" / "boss-bars-spritesheet-v1.png",
            tuple((0, 0, 0, 0) for _ in range(2)),
            1536,
            256,
            1,
            2,
            1440,
            224,
        ),
        SheetSpec(
            frames,
            SOURCE_ROOT / "图标框与标签底" / "icon-frames-spritesheet-v1.png",
            frame_cells,
            256,
            256,
            2,
            1,
            224,
            224,
            component_grid=True,
        ),
        SheetSpec(
            frames,
            SOURCE_ROOT / "图标框与标签底" / "tags-spritesheet-v1.png",
            tag_cells,
            768,
            256,
            2,
            1,
            720,
            224,
            component_grid=True,
        ),
        SheetSpec(
            pickups,
            SOURCE_ROOT / "拾取物" / "pickups-spritesheet-v1.png",
            pickup_cells,
            256,
            256,
            4,
            2,
            224,
            224,
            component_grid=True,
        ),
    )


def main() -> None:
    loaded: dict[Path, Image.Image] = {}
    for spec in build_specs():
        if spec.source not in loaded:
            loaded[spec.source] = clean_source(spec.source)

    for spec in build_specs():
        source = loaded[spec.source]
        if spec.source == SOURCE_ROOT / "血条与经验条" / "Codex 图像 2026年8月24日 17_33_32.png":
            centers = (75, 210, 370, 515, 675, 875)
            all_bars = anchored_vertical_regions(source, centers)
            if spec.output.name.startswith("hp-xp"):
                contents = all_bars[:4]
            else:
                contents = all_bars[4:]
        elif spec.component_grid:
            contents = grid_component_contents(source, spec.regions)
            if spec.output.name == "pickups-spritesheet-v1.png":
                contents += (Image.new("RGBA", (1, 1), (0, 0, 0, 0)),)
        else:
            contents = tuple(crop_content(source, region) for region in spec.regions)
        pack_sheet(contents, spec)


if __name__ == "__main__":
    main()

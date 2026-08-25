#!/usr/bin/env python3
"""从《桌面大清理》物品图集生成运行时使用的外轮廓多边形。

脚本只在离线制作阶段读取图片 Alpha。运行时不会加载或查询 Alpha 掩码，
而是把这里生成的多边形点写入 DesktopCleanupGame.ts 的标记区间。

默认用法：

    python3 tools/generate-desktop-cleanup-hit-polygons.py

更新图集后可以指定输入图；如果调整了图集中的物品顺序，用 --names 按从左到右、
从上到下的顺序传入名称。新增物品时还要同步更新当前主题的
DesktopCleanupTheme.ts 物品目录。
"""

from __future__ import annotations

import argparse
from math import hypot
from pathlib import Path
from typing import Sequence

try:
    from PIL import Image, ImageFilter
except ImportError as error:  # pragma: no cover - this is an offline tool guard.
    raise SystemExit('需要 Pillow：请先安装 Pillow 后再运行此脚本。') from error


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / 'assets/games/catch/visual/items/desktop-cleanup-items-atlas-v2.png'
DEFAULT_TARGET = ROOT / 'assets/games/catch/scripts/DesktopCleanupGame.ts'
DEFAULT_ITEM_NAMES = (
    'blue-pen',
    'red-pencil',
    'yellow-eraser',
    'mint-notes',
    'binder-clip',
    'orange-tape',
    'teal-usb',
    'cream-earbuds',
    'coral-keycap',
    'purple-stress-ball',
    'round-coaster',
    'spiral-notebook',
    'clear-ruler',
    'lucky-badge',
    'teal-wireless-mouse',
    'cream-alarm-clock',
    'coral-candle-jar',
    'mustard-glasses-case',
    'mint-compact-mirror',
    'purple-mini-speaker',
)
BEGIN_MARKER = '// BEGIN GENERATED DESKTOP CLEANUP HIT POLYGONS'
END_MARKER = '// END GENERATED DESKTOP CLEANUP HIT POLYGONS'
Point = tuple[int, int]
Edge = tuple[Point, Point]


def largest_component(
    alpha: Sequence[int],
    image_width: int,
    cell_x: int,
    cell_y: int,
    cell_width: int,
    cell_height: int,
    threshold: int,
) -> set[int]:
    """返回当前图集格中 Alpha 达标的最大 4 连通主体。"""
    mask = bytearray(cell_width * cell_height)
    for local_y in range(cell_height):
        source_start = (cell_y + local_y) * image_width + cell_x
        target_start = local_y * cell_width
        for local_x in range(cell_width):
            mask[target_start + local_x] = int(alpha[source_start + local_x] >= threshold)

    seen = bytearray(len(mask))
    best: set[int] = set()
    for start, filled in enumerate(mask):
        if not filled or seen[start]:
            continue
        queue = [start]
        seen[start] = 1
        component = {start}
        cursor = 0
        while cursor < len(queue):
            current = queue[cursor]
            cursor += 1
            local_x = current % cell_width
            local_y = current // cell_width
            for neighbor_x, neighbor_y in (
                (local_x - 1, local_y),
                (local_x + 1, local_y),
                (local_x, local_y - 1),
                (local_x, local_y + 1),
            ):
                if not (0 <= neighbor_x < cell_width and 0 <= neighbor_y < cell_height):
                    continue
                neighbor = neighbor_y * cell_width + neighbor_x
                if mask[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    component.add(neighbor)
                    queue.append(neighbor)
        if len(component) > len(best):
            best = component

    if not best:
        raise ValueError(
            f'图集格 ({cell_x}, {cell_y}, {cell_width}, {cell_height}) 没有达到 Alpha 阈值的主体。'
        )
    return best


def boundary_loops(component: set[int], cell_width: int, cell_height: int) -> list[list[Point]]:
    """从像素主体边缘追踪外轮廓和内部环，调用方只取面积最大的环。"""
    edges: list[Edge] = []
    for index in component:
        local_x = index % cell_width
        local_y = index // cell_width
        if local_y == 0 or index - cell_width not in component:
            edges.append(((local_x, local_y), (local_x + 1, local_y)))
        if local_x == cell_width - 1 or index + 1 not in component:
            edges.append(((local_x + 1, local_y), (local_x + 1, local_y + 1)))
        if local_y == cell_height - 1 or index + cell_width not in component:
            edges.append(((local_x + 1, local_y + 1), (local_x, local_y + 1)))
        if local_x == 0 or index - 1 not in component:
            edges.append(((local_x, local_y + 1), (local_x, local_y)))

    outgoing: dict[Point, Point] = {}
    for start, end in edges:
        if start in outgoing:
            raise ValueError('轮廓出现分叉，请降低 Alpha 阈值或检查图集中的孤立像素。')
        outgoing[start] = end

    unvisited = set(outgoing)
    loops: list[list[Point]] = []
    while unvisited:
        start = unvisited.pop()
        current = start
        loop = [start]
        while True:
            end = outgoing.get(current)
            if end is None:
                raise ValueError('轮廓边缘无法闭合。')
            loop.append(end)
            current = end
            if current == start:
                break
            if current not in unvisited:
                raise ValueError('轮廓边缘重复或无法闭合。')
            unvisited.remove(current)
        loops.append(loop)
    return loops


def close_boundary_gaps(
    component: set[int],
    cell_width: int,
    cell_height: int,
) -> set[int]:
    """Close one-pixel diagonal gaps from anti-aliased generated edges."""
    mask = Image.new('L', (cell_width, cell_height), 0)
    pixels = mask.load()
    for index in component:
        pixels[index % cell_width, index // cell_width] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    return {
        index
        for index, value in enumerate(mask.getdata())
        if value >= 128
    }


def polygon_area(points: Sequence[Point]) -> float:
    return 0.5 * sum(
        left_x * right_y - right_x * left_y
        for (left_x, left_y), (right_x, right_y) in zip(points, points[1:])
    )


def point_line_distance(point: Point, start: Point, end: Point) -> float:
    start_x, start_y = start
    end_x, end_y = end
    point_x, point_y = point
    delta_x = end_x - start_x
    delta_y = end_y - start_y
    length = hypot(delta_x, delta_y)
    if length == 0:
        return hypot(point_x - start_x, point_y - start_y)
    return abs(
        delta_y * point_x
        - delta_x * point_y
        + end_x * start_y
        - end_y * start_x
    ) / length


def simplify_open_polygon(points: Sequence[Point], epsilon: float) -> list[Point]:
    """用 Ramer–Douglas–Peucker 保留接近像素边缘的关键顶点。"""
    if len(points) <= 2:
        return list(points)
    start = points[0]
    end = points[-1]
    furthest_index = 0
    furthest_distance = -1.0
    for index, point in enumerate(points[1:-1], 1):
        distance = point_line_distance(point, start, end)
        if distance > furthest_distance:
            furthest_distance = distance
            furthest_index = index
    if furthest_distance > epsilon:
        left = simplify_open_polygon(points[:furthest_index + 1], epsilon)
        right = simplify_open_polygon(points[furthest_index:], epsilon)
        return left[:-1] + right
    return [start, end]


def extract_polygon(
    alpha: Sequence[int],
    image_width: int,
    cell_x: int,
    cell_y: int,
    cell_width: int,
    cell_height: int,
    threshold: int,
    epsilon: float,
) -> list[Point]:
    component = largest_component(
        alpha,
        image_width,
        cell_x,
        cell_y,
        cell_width,
        cell_height,
        threshold,
    )
    try:
        loops = boundary_loops(component, cell_width, cell_height)
    except ValueError:
        # Generated sprites can contain a one-pixel diagonal contact at a
        # rounded edge. Close that raster seam before tracing the outline;
        # the correction is below the runtime hitmask resolution.
        component = close_boundary_gaps(component, cell_width, cell_height)
        loops = boundary_loops(component, cell_width, cell_height)
    outer = max(loops, key=lambda loop: abs(polygon_area(loop)))
    simplified = simplify_open_polygon(outer, epsilon)[:-1]
    if len(simplified) < 3:
        raise ValueError('提取出的外轮廓顶点少于 3 个。')
    return simplified


def format_polygon(name: str, points: Sequence[Point]) -> list[str]:
    lines = [f"    '{name}': Object.freeze({{ outer: defineHitPolygon(["]
    for start in range(0, len(points), 8):
        row = points[start:start + 8]
        lines.append('        ' + ', '.join(f'[{x}, {y}]' for x, y in row) + ',')
    lines.append('    ]) }),')
    return lines


def render_generated_block(
    polygons: Sequence[tuple[str, Sequence[Point]]],
    cell_size: int,
    threshold: int,
    epsilon: float,
) -> str:
    lines = [
        BEGIN_MARKER,
        f'// Generated from {cell_size}px cells; atlas Alpha >= {threshold}; RDP epsilon: {epsilon:g} source px.',
    ]
    for name, points in polygons:
        lines.extend(format_polygon(name, points))
    lines.extend(['});', END_MARKER])
    return '\n'.join(lines)


def replace_generated_block(source: str, generated: str) -> str:
    begin = source.find(BEGIN_MARKER)
    if begin < 0:
        raise ValueError(f'目标文件缺少标记：{BEGIN_MARKER}')
    line_start = source.rfind('\n', 0, begin) + 1
    end = source.find(END_MARKER, begin + len(BEGIN_MARKER))
    if end < 0:
        raise ValueError(f'目标文件缺少标记：{END_MARKER}')
    line_end = source.find('\n', end)
    if line_end < 0:
        line_end = len(source)
    else:
        line_end += 1
    return source[:line_start] + generated + '\n' + source[line_end:]


def resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT, help='4 列 RGBA 物品图集。')
    parser.add_argument('--target', type=Path, default=DEFAULT_TARGET, help='写入生成区间的 TypeScript 文件。')
    parser.add_argument('--columns', type=int, default=4, help='图集列数，默认 4。')
    parser.add_argument('--rows', type=int, default=5, help='图集行数，默认 5。')
    parser.add_argument('--alpha-threshold', type=int, default=176, help='主体 Alpha 阈值，默认 176。')
    parser.add_argument('--epsilon', type=float, default=1.2, help='RDP 简化误差，单位为源图像素，默认 1.2。')
    parser.add_argument(
        '--names',
        nargs='+',
        default=list(DEFAULT_ITEM_NAMES),
        help='按图集从左到右、从上到下传入物品名称；不传则使用当前 14 种物品。',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = resolve_path(args.input)
    target_path = resolve_path(args.target)
    if args.columns <= 0 or args.rows <= 0:
        raise SystemExit('图集行列数必须为正数。')
    if not 0 <= args.alpha_threshold <= 255:
        raise SystemExit('Alpha 阈值必须在 0–255 之间。')
    if args.epsilon <= 0:
        raise SystemExit('RDP epsilon 必须大于 0。')
    if len(args.names) > args.columns * args.rows:
        raise SystemExit('物品名称数量超过图集格子数量。')

    with Image.open(input_path) as image:
        rgba = image.convert('RGBA')
        image_width, image_height = rgba.size
        if image_width % args.columns != 0 or image_height % args.rows != 0:
            raise SystemExit('图集尺寸必须能被行列数整除。')
        cell_width = image_width // args.columns
        cell_height = image_height // args.rows
        alpha = list(rgba.getchannel('A').getdata())

    polygons: list[tuple[str, Sequence[Point]]] = []
    for index, name in enumerate(args.names):
        cell_x = (index % args.columns) * cell_width
        cell_y = (index // args.columns) * cell_height
        polygons.append((
            name,
            extract_polygon(
                alpha,
                image_width,
                cell_x,
                cell_y,
                cell_width,
                cell_height,
                args.alpha_threshold,
                args.epsilon,
            ),
        ))

    source = target_path.read_text(encoding='utf-8')
    updated = replace_generated_block(
        source,
        render_generated_block(polygons, cell_width, args.alpha_threshold, args.epsilon),
    )
    target_path.write_text(updated, encoding='utf-8')
    print(f'已生成 {len(polygons)} 个物品多边形：{target_path}')


if __name__ == '__main__':
    main()

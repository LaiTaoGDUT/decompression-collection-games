"""晴空糖环固定题库。从分支、共享卡扣的环路和双向滑杆构造盘面。"""
import json
import math
import random
from pathlib import Path
from typing import NamedTuple

COLORS = (0xEC8F2E, 0x32AFDD, 0x984BE0, 0xDD433E, 0x6AC53E, 0x4E77DD, 0x23A468)
MODE_COUNTS = {'normal': 400, 'hard': 100}
CHALLENGE_INTERVAL = 10
PITCH = 3.95
TUBE = .22  # visible half-width
CLASP = .39  # radial clearance from the neighbouring tube's centre line
INTERLOCKED = ('twin', 'spine', 'ladder', 'corner', 'grid')


def point(x, y):
    return {'x': round(x, 6), 'y': round(y, 6)}


def polar(radius, degrees):
    a = math.radians(degrees)
    return point(radius * math.cos(a), radius * math.sin(a))


def direction(a, b):
    return round(math.degrees(math.atan2(b['y'] - a['y'], b['x'] - a['x'])), 4) % 360


def circular_distance(a, b):
    return abs((a - b + 180) % 360 - 180)


def motifs(hard, number):
    if (hard and number % 30 == 14) or (not hard and number % 50 == 19):
        return 'rail', True
    group, slot = divmod(number - 1, CHALLENGE_INTERVAL)
    phrase = (slot + 3 * group) % 9
    loop = shared = False
    if hard or number >= 3:
        loop = slot == 9 or phrase in ((0, 2, 3, 5, 7, 8) if hard else (1, 3, 5, 7))
        shared = slot == 9 or phrase in (2, 4, 5, 7, 8)
    shape = ''
    if loop:
        if slot == 9 and ((hard and group % 3 == 2) or (not hard and group >= 7 and group % 4 == 3)):
            shape = 'paired'
        elif number >= 10 and (number + group) % 5 == 1:
            shape = 'perimeter8'
        elif number >= 10 and (number + group) % 3 == 0:
            shape = 'hexagon'
        else:
            shape = 'square'
        # Introduce the common clasp in a small board before combining it with longer rails.
        phases = ((2, 3, 5, 8), (0, 3, 7, 8)) if hard else ((3, 5), (1, 7))
        if (hard or number >= 6) and shape != 'paired' and (slot == 9 or phrase in phases[group % 2]):
            if not hard and number < 20:
                shape = 'twin'
            elif slot == 9 and number >= (40 if hard else 100) and group % 3 == 0:
                shape = 'grid'
            else:
                shapes = ('twin', 'spine', 'ladder', 'corner') if hard or number >= 60 else ('twin', 'spine', 'ladder')
                shape = shapes[(slot + group // 2 + group) % len(shapes)]
    return shape, shared


def grow(count, hexagonal, branching, min_depth, rng, shape):
    """Seed alternating clasp owners around a circuit, then grow its surrounding branches."""
    square = [(0, 0), (1, 0), (1, 1), (0, 1)]
    if shape in INTERLOCKED:
        # Adjacent faces use one physical clasp per shared edge. On a spine two edges are common.
        cols, rows = {'twin': (2, 3), 'ladder': (2, 4)}.get(shape, (3, 3))
        cells = [(x - 1, y - 1) for y in range(rows) for x in range(cols)
                 if not (shape == 'corner' and x == 2 and y == 2)]
        cycles = []
    elif shape == 'paired':
        cells = square + [(-1, 0), (-2, 0), (-2, -1), (-1, -1)]
        cycles = [(0, 1, 2, 3), (5, 6, 7, 4)]
    elif shape == 'hexagon':
        cells = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]
        cycles = [tuple(range(6))]
    elif shape == 'perimeter8':
        cells = [(0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]
        cycles = [tuple(range(8))]
    elif shape == 'rail':
        cells, cycles = [(0, -1), (0, 0), (0, 1), (0, 2)], []
    elif shape:
        cells, cycles = square, [tuple(range(4))]
    else:
        cells, cycles = [(0, 0)], []
    if len(cells) > count:
        return None
    fixed_edges = [(source, cycle[(i + step) % len(cycle)]) for cycle in cycles
                   for i, source in enumerate(cycle) if i % 2 == 0 for step in (-1, 1)]
    if shape in INTERLOCKED:
        parity = rng.randrange(2)
        for i, (x, y) in enumerate(cells):
            for dx, dy in ((1, 0), (0, 1)):
                neighbour = (x + dx, y + dy)
                if neighbour not in cells or (shape == 'spine' and dx and y == 0):
                    continue
                j = cells.index(neighbour)
                fixed_edges.append((i, j) if (x + y) % 2 == parity else (j, i))
    if shape == 'paired':
        fixed_edges.append((0, 4))
    sinks = {b for _, b in fixed_edges}
    parents = [-1, 0, 1, 2] if shape == 'rail' else [-1] * len(cells)
    hexagonal = shape == 'hexagon' if shape else hexagonal
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if hexagonal:
        steps += [(1, -1), (-1, 1)]
    occupied = set(cells)
    while len(cells) < count:
        frontier = []
        for index, (x, y) in enumerate(cells):
            # Grow a backbone first, then attach alternative branches.
            if index in sinks or (not shape and len(cells) <= min_depth and index != len(cells) - 1):
                continue
            if parents.count(index) >= branching:
                continue
            for dx, dy in steps:
                u, v = x + dx, y + dy
                if (u, v) in occupied or abs(u + v / 2 if hexagonal else u) > 2.6 or abs(v) > (5 if count >= 17 else 4):
                    continue
                if sum((u + a, v + b) in occupied for a, b in steps) == 1:
                    frontier.append((index, (u, v)))
        if not frontier:
            return None
        parent, cell = rng.choice(frontier)
        cells.append(cell)
        parents.append(parent)
        occupied.add(cell)
    tilt = math.radians(rng.choice([-30, -15, 0, 15, 30]))
    positions = []
    for u, v in cells:
        x = u + v / 2 if hexagonal else u
        y = v * math.sqrt(3) / 2 if hexagonal else v
        positions.append(point(PITCH * (x * math.cos(tilt) - y * math.sin(tilt)),
                               PITCH * (x * math.sin(tilt) + y * math.cos(tilt))))
    return positions, parents, fixed_edges


def add_pin(ring, heading, radius, target, links):
    angle = round((heading - ring['angle']) % 360, 3)
    pin = dict(featureId=f"clasp_{len(ring['pins']) + 1}", angleDeg=angle, rotDeg=angle,
               radius=round(radius, 4), mouthSize=point(CLASP * 2, .56),
               prongs=[dict(offset=s * CLASP, halfThick=.035, halfLen=.28) for s in (-1, 1)])
    ring['pins'].append(pin)
    links.append(dict(sourceRingId=ring['id'], pinFeatureId=pin['featureId'], targetPartId=target))


class Grip(NamedTuple):
    host: int
    mount: float
    reach: float


class Bar(NamedTuple):
    grips: tuple[Grip, ...]
    center: dict
    axis: float
    half: float


def bar_layout(hard, number, group, slot):
    """Number of ring-obstructed exits per bar: zero, one or both."""
    if number == 1 and not hard:
        return (0,)
    if slot == 9:
        return (2, 2, 1) if hard else (2, 1, 0) if group >= 12 else (2, 1)
    if hard:
        patterns = [(2, 1), (2, 0), (2, 2), (2, 1, 0), (2, 2, 1)]
        return patterns[(slot + group) % (5 if group >= 4 else 4)]
    patterns = [(1,), (2,), (0, 1), (2,), (1, 1), (2, 0), (1,), (2, 1), (0, 1)]
    return patterns[(max(number - 2, 0) if not group else slot + group) % len(patterns)]


def obstructed_ends(c, ux, uy, half, positions, radii, hosts):
    sides = set()
    for i, other in enumerate(positions):
        if i in hosts:
            continue
        dx, dy = other['x'] - c['x'], other['y'] - c['y']
        along, across = dx * ux + dy * uy, abs(dx * uy - dy * ux)
        if math.hypot(max(0, abs(along) - half - .18), across) < radii[i] + TUBE + .22:
            return None
        if across < radii[i] - .18:
            sides.add(1 if along > 0 else -1)
    return len(sides)


def shared_bars(positions, radii):
    """Run a straight rail through separately spaced jaws along a common tangent."""
    for first, p in enumerate(positions):
        for last in range(first + 1, len(positions)):
            q = positions[last]
            dx, dy = q['x'] - p['x'], q['y'] - p['y']
            span = math.hypot(dx, dy)
            if span > PITCH * 3.05:
                continue
            ux, uy = dx / span, dy / span
            for side in (-1, 1):
                nx, ny = -side * uy, side * ux
                reach = max(radii[first], radii[last]) + .70
                cx, cy = (p['x'] + q['x']) / 2 + reach * nx, (p['y'] + q['y']) / 2 + reach * ny
                c = point(cx, cy)
                half = round(span / 2 + .94, 3)
                grips = []
                for i, r in enumerate(positions):
                    x, y = cx - r['x'], cy - r['y']
                    normal, along = x * nx + y * ny, x * ux + y * uy
                    if abs(along) <= span / 2 + .01 and radii[i] + .54 <= abs(normal) <= radii[i] + 1.03:
                        heading = math.degrees(math.atan2(ny, nx)) + (180 if normal < 0 else 0)
                        grips.append(Grip(i, heading % 360, round(abs(normal), 4)))
                hosts = {g.host for g in grips}
                blocked = obstructed_ends(c, ux, uy, half, positions, radii, hosts)
                # A second jaw aimed straight through an adjacent rim would stack on the ring-to-ring clasp.
                if blocked is not None and all(not any(
                        i != g.host and math.hypot(r['x'] - positions[g.host]['x'], r['y'] - positions[g.host]['y']) < PITCH + .08
                        and circular_distance(g.mount, direction(positions[g.host], r)) < 25
                        for i, r in enumerate(positions)) for g in grips):
                    yield Bar(tuple(grips), c, math.degrees(math.atan2(uy, ux)) % 360, half), blocked


def place_bars(wanted, positions, radii, rng, fixed_edges, shared, prefer_long, four_grips, guarded_rail):
    sinks = {b for _, b in fixed_edges}
    used = set()
    shared_bar = None
    if shared:
        rails = [(rail, ends) for rail, ends in shared_bars(positions, radii)
                 if (not four_grips or len(rail.grips) >= 4) and (not guarded_rail or ends == 2)]
        if not rails:
            return None
        rng.shuffle(rails)
        # On a strong beat, prefer a rail that needs clearance; on others allow an early release of several rings.
        desired_ends = 2 if prefer_long else wanted[-1]
        rails.sort(key=lambda item: (prefer_long and len(item[0].grips) < 3, abs(item[1] - desired_ends), item[0].half > 5.5))
        shared_bar = rails[0][0]
        used.update(g.host for g in shared_bar.grips)
        wanted = wanted[:-1]
    choices = {kind: [] for kind in set(wanted)}
    for host, pos in enumerate(positions):
        if host in sinks or host in used:
            continue
        for mount in range(0, 360, 15):
            radial = polar(1, mount)
            c = point(pos['x'] + (radii[host] + .85) * radial['x'],
                      pos['y'] + (radii[host] + .85) * radial['y'])
            blocked = obstructed_ends(c, -radial['y'], radial['x'], 1.44, positions, radii, (host,))
            if blocked in choices:
                choices[blocked].append(Bar((Grip(host, mount, radii[host] + .85),), c, (mount + 90) % 360, 1.44))
    selected = [shared_bar] if shared_bar else []
    for kind in sorted(wanted, reverse=True):
        available = [bar for bar in choices[kind] if bar.grips[0].host not in used and all(
            math.hypot(bar.center['x'] - prior.center['x'], bar.center['y'] - prior.center['y'])
            > bar.half + prior.half + .72 for prior in selected)]
        if not available:
            return None
        chosen = rng.choice(available)
        used.add(chosen.grips[0].host)
        selected.append(chosen)
    return selected


def facing_clasps(parents, children, bars, required, prefer_fork, rng, fixed_edges):
    """Reverse the outgoing clasps at selected joints so several neighbours grip one gap."""
    hosts = {grip.host for bar in bars for grip in bar.grips}
    hosts.update(v for edge in fixed_edges for v in edge)
    required = max(0, required - len({b for _, b in fixed_edges}))
    candidates = [i for i, row in enumerate(children) if i not in hosts and row and len(row) + (i != 0) >= 2]
    rng.shuffle(candidates)
    if prefer_fork:
        candidates.sort(key=lambda i: len(children[i]) + (i != 0) < 3)

    def select(remaining, chosen):
        if len(chosen) == required:
            return chosen
        for j, joint in enumerate(remaining):
            if len(remaining) - j < required - len(chosen):
                break
            if all(parents[other] != joint and parents[joint] != other for other in chosen):
                result = select(remaining[j+1:], chosen + [joint])
                if result:
                    return result
        return None

    joints = select(candidates, [])
    if joints is None:
        return None
    return fixed_edges + [(child, host) if host in joints else (host, child)
                          for child, host in enumerate(parents) if host >= 0]


def traps_terminal_ring(bars, positions, radii, edges):
    # A parked rail can pin the last ring of its own branch against the very jaw that must release it.
    # Keep that ring's turning space clear when the rail already needs a guard removed at either end.
    degree = [0] * len(positions)
    for source, target in edges:
        degree[source] += 1
        degree[target] += 1
    for bar in bars:
        if len(bar.grips) != 1:
            continue
        host = bar.grips[0].host
        leaves = [target for source, target in edges if source == host and degree[target] == 1]
        if not leaves:
            continue
        angle = math.radians(bar.axis)
        ux, uy = math.cos(angle), math.sin(angle)
        if obstructed_ends(bar.center, ux, uy, bar.half, positions, radii, (host,)) != 2:
            continue
        for leaf in leaves:
            dx = positions[leaf]['x'] - bar.center['x']
            dy = positions[leaf]['y'] - bar.center['y']
            if abs(dx * uy - dy * ux) < radii[leaf] + TUBE + .18:
                return True
    return False


def design(mode, number, attempt=0, opening=None, turn_leaves=False, ring_count=None):
    hard = mode == 'hard'
    intro = not hard and number <= 2
    shape, shared = motifs(hard, number)
    edition = 920000 if hard else 910000
    if shape in INTERLOCKED:
        edition += 20000
    level_id = (890000 if intro else edition) + number
    rng = random.Random(level_id * 10501 + attempt)
    group, slot = divmod(number - 1, CHALLENGE_INTERVAL)
    peak = slot == CHALLENGE_INTERVAL - 1
    tier = group // (2 if hard else 4)
    wanted = bar_layout(hard, number, group, slot)
    if (peak and number >= 10) or (hard and slot in (2, 6)) or (not hard and group >= 2 and slot in (3, 7)):
        wanted += (0,) * max(0, (5 if hard and peak and tier >= 2 else 4) - len(wanted))
    if opening is not None:
        wanted = (1,) * opening + (2,) * (len(wanted) - opening)
    if hard:
        count = 14 + tier + (6 if peak else slot // 3)
        gap = 74 - 2 * tier - (18 if peak else slot)
    else:
        count = ([2, 4, 5, 6, 6, 7, 8, 8, 9, 12][slot] if group == 0
                 else 7 + tier + (7 if peak else slot // 2))
        gap = ([102, 92, 90, 88, 86, 84, 82, 80, 78, 70][slot] if group == 0
               else 88 - 2 * tier - (18 if peak else slot * 1.5))
    if ring_count is not None:
        count = ring_count
    if shape in ('hexagon', 'perimeter8') and count < (6 if shape == 'hexagon' else 8) + 2:
        shape = 'square'
    if shape in ('spine', 'ladder', 'corner', 'grid') and count < 10:
        shape = 'twin'
    min_depth = min(count - 1, (4 if hard else 1) + tier // 2 + (3 if peak else slot // 4))
    grid = grow(count, number % 4 in (1, 2), 3, min_depth, rng, shape)
    if not grid:
        return None
    positions, parents, fixed_edges = grid
    radii = [rng.choice([1.4, 1.55, 1.7]) for _ in positions]
    children = [[j for j, p in enumerate(parents) if p == i] for i in range(count)]
    guarded_rail = opening == 0 or number % (20 if hard else 50) == (10 if hard else 30)
    bars = place_bars(wanted, positions, radii, rng, fixed_edges, shared, peak or number % 3 == 0,
                      shape == 'rail', guarded_rail)
    if bars is None:
        return None
    joints = (2 + tier // 2 + int(peak) if hard else
              0 if number == 1 else 1 + int(peak) + min(2, tier // 3))
    edges = facing_clasps(parents, children, bars, joints, peak or number % 3 == 0, rng, fixed_edges) if joints else [(0, 1)]
    if edges is None:
        return None
    if turn_leaves:
        # A leaf can hold the neighbouring rim. Its gap then has to be approached from the junction.
        degree = [0] * count
        for a, b in edges:
            degree[a] += 1
            degree[b] += 1
        hosts = {grip.host for bar in bars for grip in bar.grips}
        loose = [i for i, (a, b) in enumerate(edges) if degree[b] == 1 and degree[a] > 1 and b not in hosts]
        if not loose:
            return None
        for i in rng.sample(loose, min(3, len(loose))):
            a, b = edges[i]
            edges[i] = b, a
    if (shape in INTERLOCKED or turn_leaves) and traps_terminal_ring(bars, positions, radii, edges):
        return None
    rings, links, pulls, bombs = [], [], [], []
    for i, pos in enumerate(positions):
        incoming = [direction(pos, positions[a]) for a, b in edges if b == i]
        mounts = [direction(pos, positions[b]) for a, b in edges if a == i]
        mounts += [g.mount for bar in bars for g in bar.grips if g.host == i]
        # Both rounded endcaps must pass the half-width of the jaw with some room for the player's aim.
        min_width = 2 * math.ceil(math.degrees(math.asin((TUBE + .28 + .06) / radii[i])))
        width = gap if intro or i == 0 else max(min_width, gap + ((i + number) % 3 - 1) * 12)
        # Four cardinal clasps leave a 90-degree sector for the opening's initial pose.
        if i != 0 and shape in INTERLOCKED and len(incoming) + len(mounts) >= 4:
            width = min(width, 56)
        if joints:
            # The rim must visibly cover every incoming clasp. Leave the outgoing claws attached to solid rim.
            choices = [a for a in range(0, 360, 15) if all(circular_distance(a, heading) >= width / 2 + 15
                                                           for heading in incoming + mounts)]
            if incoming and mounts:
                # Once the child branches leave, the remaining claws must clear the parent
                # throughout the turn from the starting gap to its incoming clasp.
                heading = incoming[0]
                choices = [a for a in choices if all(
                    circular_distance(heading + ((a - heading + 180) % 360 - 180) * t / 12, mount) > 38
                    for mount in mounts for t in range(13))]
        else:
            heading = incoming[0] if i else 0
            choices = [(heading + sign * offset) % 360 for sign in (-1, 1) for offset in (60, 75, 90, 105, 120, 135, 150)
                       if all(circular_distance(heading + sign * offset, mount) > gap / 2 + 12 for mount in mounts)]
        if not choices:
            return None
        angle = round(rng.choice(choices), 3)
        rings.append(dict(id=f'ring_{i+1}', index=i+1, **pos, angle=angle,
                          inner=round(radii[i]-TUBE, 3), outer=round(radii[i]+TUBE, 3),
                          gapWidth=width, gapDir=0, renderGap=width, pins=[], hardBlocks=[]))
    for source, target in reversed(edges):
        owner = rings[source]
        add_pin(owner, direction(owner, rings[target]), PITCH - radii[target], rings[target]['id'], links)
    for grips, center, axis, half in bars:
        bar = dict(id=f'slide_bar_{len(pulls)+1}', **center, angle=axis, dragAxis=0,
                   positive=True, negative=True, moveThreshold=.7,
                   polyLocal=[point(-half+.16, -.18), point(half-.16, -.18), point(half, 0),
                              point(half-.16, .18), point(-half+.16, .18), point(-half, 0)])
        pulls.append(bar)
        for host, mount, reach in grips:
            add_pin(rings[host], mount, reach, bar['id'], links)
    palette = list(COLORS)
    rng.shuffle(palette)
    colors = [palette[i % len(palette)] for i in range(count + len(pulls))]
    level = dict(id=level_id, rings=rings, links=links, pullObjects=pulls, fixedObjects=[], guides=[], bombs=bombs)
    return level, colors


# Layouts whose first geometric candidate failed the physical route or recovery checks.
LAYOUT_ATTEMPTS = {
    'normal': {
        6: 3, 10: 43, 20: 14, 30: 330, 50: 1, 67: 1, 80: 38, 90: 23,
        110: 56, 150: 4, 158: 7, 170: 9, 210: 2, 221: 1, 230: 12, 254: 1,
        267: 6, 270: 11, 280: 6, 290: 7, 298: 1, 318: 2, 330: 14, 350: 3,
        352: 2, 364: 2, 370: 1, 389: 1, 390: 28, 398: 2,
    },
    'hard': {
        3: 10, 7: 8, 10: 159, 27: 2, 53: 5, 69: 2, 86: 8, 91: 2,
    },
}


ARRANGEMENTS = json.loads(Path(__file__).with_name('arrangements.json').read_text())


def arrange(level, mode, number, recipe):
    """Remove each authored bridge together with its physical jaws."""
    edition = (960000 if mode == 'hard' else 950000) + 20000 * (recipe.get('revision', 1) - 1)
    level['id'] = edition + number
    for bridge in recipe.get('bridges', []):
        source, target = (f'ring_{i}' for i in bridge)
        link = next((l for l in level['links'] if l['sourceRingId'] == source and l['targetPartId'] == target), None)
        if link is None:
            return False
        level['links'].remove(link)
        owner = next(r for r in level['rings'] if r['id'] == source)
        owner['pins'] = [p for p in owner['pins'] if p['featureId'] != link['pinFeatureId']]
    return True


def candidate_for(mode, number, attempt):
    recipe = ARRANGEMENTS[mode].get(str(number))
    if recipe is None:
        return design(mode, number, attempt)
    candidate = design(mode, number, attempt, recipe.get('opening'), recipe.get('turnLeaves', False), recipe.get('rings'))
    if candidate and arrange(candidate[0], mode, number, recipe):
        return candidate
    return None


def make_level(mode, number):
    recipe = ARRANGEMENTS[mode].get(str(number))
    selected = recipe['seed'] if recipe is not None else LAYOUT_ATTEMPTS[mode].get(number)
    for attempt in (range(10000) if selected is None else (selected,)):
        result = candidate_for(mode, number, attempt)
        if result:
            return result
    raise ValueError(f'No valid layout for {mode} {number}')

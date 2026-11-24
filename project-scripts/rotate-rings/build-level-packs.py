#!/usr/bin/env python3
"""生成并打包晴空糖环的原创棋盘、碰撞轮廓和渲染网格。"""
import argparse
import json
import math
import subprocess
import struct
import zlib
from functools import lru_cache
from pathlib import Path

from campaign import ARRANGEMENTS, CHALLENGE_INTERVAL, CLASP, MODE_COUNTS, TUBE, candidate_for, make_level, point, polar

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'assets/game-assets/rotate-rings/configs'
BANK_SIZE = 16


def compressed(raw):
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    body = compressor.compress(raw) + compressor.flush()
    return b'RRZ1' + struct.pack('<II', len(raw), zlib.adler32(raw)) + body


def archive(records):
    """RRA1: 每项为 ID、偏移、长度；内部 RRZ1 独立解压，避免展开全部关卡。"""
    offset = 8 + len(records) * 12
    entries = []
    for key, payload in records:
        entries.append(struct.pack('<III', key, offset, len(payload)))
        offset += len(payload)
    return b'RRA1' + struct.pack('<I', len(records)) + b''.join(entries) + b''.join(payload for _, payload in records)


@lru_cache(maxsize=None)
def ring_contour(radius, gap):
    """Outline the same tube and rounded endcaps used by the ceramic arc."""
    start, end = gap / 2, 360 - gap / 2
    steps = math.ceil((end - start) / 7)
    angles = [start + (end - start) * i / steps for i in range(steps + 1)]

    def cap(deg, offset):
        center = polar(radius, deg)
        result = []
        for i in range(1, 8):
            p = polar(TUBE, deg + offset + i * 180 / 8)
            result.append(point(center['x'] + p['x'], center['y'] + p['y']))
        return result

    return [[polar(radius + TUBE, a) for a in angles] + cap(end, 0)
            + [polar(radius - TUBE, a) for a in reversed(angles)] + cap(start, 180)]


class Mesh:
    def __init__(self):
        self.vertices = []
        self.indices = []

    def strip(self, points, width, length, style):
        first = len(self.vertices)
        for i, (x, y, tx, ty, u) in enumerate(points):
            for sign, v in ((1, 65535), (-1, 0)):
                self.vertices.append(struct.pack('<4fH2hbb', x + sign * ty * width, y - sign * tx * width,
                                                 u, length, v, round(tx * 32767), round(ty * 32767), -1, style))
            if i:
                a = first + (i - 1) * 2
                self.indices.extend((a, a + 1, a + 2, a + 1, a + 3, a + 2))

    def line(self, x, y, angle, length, width, style):
        tx, ty = math.cos(angle), math.sin(angle)
        if style < 0:
            # The rectangular clasp sprite occupies the middle half of its UV region.
            x -= tx * length / 2
            y -= ty * length / 2
            length *= 2
        self.strip([(x, y, tx, ty, 0), (x + tx * length, y + ty * length, tx, ty, length)],
                   width, length, style)

    def encode(self):
        return (struct.pack('<HH', len(self.vertices), len(self.indices)) + b''.join(self.vertices)
                + struct.pack('<' + 'H' * len(self.indices), *self.indices))


def ring_mesh(ring):
    mesh = Mesh()
    radius = round((ring['outer'] + ring['inner']) / 2, 3)
    start = math.radians(ring['gapWidth'] / 2)
    span = 2 * math.pi - start * 2
    # Path coordinates match createRingArcMesh and the ceramic material's two cap regions.
    cap = TUBE * 2
    length = span * radius + cap * 2
    path = []
    for i in range(49):
        a = start + span * i / 48
        x, y = math.cos(a), math.sin(a)
        path.append((radius * x, radius * y, -y, x, cap + span * radius * i / 48))
    for i, sign in ((0, -1), (-1, 1)):
        x, y, tx, ty, _ = path[i]
        p = (x + sign * tx * cap, y + sign * ty * cap, tx, ty, 0 if sign < 0 else length)
        if sign < 0:
            path.insert(0, p)
        else:
            path.append(p)
    mesh.strip(path, TUBE * 2, length, 2)
    for pin in ring['pins']:
        a = math.radians(pin['angleDeg'])
        x, y = math.cos(a), math.sin(a)
        reach = pin['radius']
        # A glazed crosspiece lies over the neighbouring tube, with a jaw at each edge.
        mesh.line(radius * x, radius * y, a, reach + CLASP - radius, .21, -1)
        for sign in (-1, 1):
            at = reach + sign * CLASP
            mesh.line(at * x + y * .28, at * y - x * .28, a + math.pi / 2, .56, .12, -1)
    return mesh.encode()


def packed_json(obj):
    return json.dumps(obj, separators=(',', ':')).encode('ascii')


def select_layouts(mode, start, stop):
    """Find a playable seed for each slot under its authored arrangement constraints."""
    with subprocess.Popen(['node', str(Path(__file__).with_name('solve-board.cjs'))],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE) as solver:
        for number in range(start, stop + 1):
            rejected = False
            for attempt in range(10000):
                candidate = candidate_for(mode, number, attempt)
                if candidate is None:
                    continue
                level = candidate[0]
                for ring in level['rings']:
                    radius = round((ring['inner'] + ring['outer']) / 2, 3)
                    ring['bodyLocal'] = ring_contour(radius, ring['gapWidth'])
                solver.stdin.write(packed_json(dict(mode=mode, number=number, level=level)) + b'\n')
                solver.stdin.flush()
                answer = solver.stdout.readline()
                if not answer:
                    raise RuntimeError('Candidate solver exited')
                if answer == b'ok\n':
                    if rejected or str(number) in ARRANGEMENTS[mode]:
                        print(f'{mode} {number} {attempt}', flush=True)
                    break
                rejected = True
            else:
                raise ValueError(f'No playable layout for {mode} {number}')
        solver.stdin.close()


def build():
    modes = {'normal': [], 'hard': []}
    meshes, bodies = {}, {}
    boards = []
    seen = set()

    for mode, count in MODE_COUNTS.items():
        for number in range(1, count + 1):
            level, colors = make_level(mode, number)
            rings, pulls = level['rings'], level['pullObjects']
            fingerprint = packed_json([rings, level['links'], pulls, level['bombs']])
            if fingerprint in seen:
                raise ValueError(f'Duplicate board: {mode} {number}')
            seen.add(fingerprint)
            refs = []
            for part, color in zip(rings + pulls, colors):
                if 'pins' in part:
                    radius = round((part['outer'] + part['inner']) / 2, 3)
                    shape = packed_json(ring_contour(radius, part['gapWidth']))
                    part['bodyIndex'] = bodies.setdefault(shape, len(bodies))
                    geometry = ring_mesh(part)
                else:
                    bar = Mesh()
                    half = max(p['x'] for p in part['polyLocal']) + .18
                    bar.line(-half, 0, 0, 2 * half, .36, 2)
                    geometry = bar.encode()
                refs.append([part['id'], meshes.setdefault(geometry, len(meshes)), color])
            boards.append((level, refs))
            summary = dict(id=level['id'], rings=len(rings), pulls=len(pulls),
                           links=len(level['links']), bombs=len(level['bombs']))
            if number % CHALLENGE_INTERVAL == 0:
                summary['challenge'] = True
            modes[mode].append(summary)
    # Similar arc vertices compress together. Small banks limit how much one board inflates.
    shapes = sorted(meshes, key=lambda shape: shape[4:256])
    banks = []
    indices = {}
    for first in range(0, len(shapes), BANK_SIZE):
        bank = shapes[first:first + BANK_SIZE]
        for i, shape in enumerate(bank, first):
            indices[meshes[shape]] = i
        raw = b'RRG3' + struct.pack('<IHH', first, len(bank), 0)
        raw += b''.join(struct.pack('<I', len(shape)) + shape for shape in bank)
        banks.append((first // BANK_SIZE, compressed(raw)))
    records = []
    for level, refs in boards:
        for ref in refs:
            ref[1] = indices[ref[1]]
        records.append((level['id'], compressed(packed_json([level, refs]))))
    index = dict(version=2, modes=modes, packing=dict(version=2, meshCount=len(meshes),
                 bankSize=BANK_SIZE, collisionShapeCount=len(bodies)))
    return {'levels.bin': archive(records), 'geometry.bin': archive(banks),
            'collisions.bin': compressed(b'[' + b','.join(bodies) + b']'),
            'index.json': packed_json(index) + b'\n'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--select-layouts', choices=tuple(MODE_COUNTS))
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--stop', type=int)
    args = parser.parse_args()
    if args.select_layouts:
        select_layouts(args.select_layouts, args.start, args.stop or MODE_COUNTS[args.select_layouts])
        raise SystemExit(0)
    for name, data in build().items():
        path = DEST / name
        if not path.exists() or path.read_bytes() != data:
            if args.check:
                raise SystemExit(f'Out of date: {path}')
            path.write_bytes(data)
        print(f'{name}: {len(data):,} bytes')

#!/usr/bin/env python3
"""原形状逐字节去重、独立无损压缩，再按索引合入关卡与网格两个原生文件。"""
import hashlib
import json
import struct
import uuid
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'local/rotate-rings-build-source/configs'
DEST = ROOT / 'assets/game-assets/rotate-rings/configs'
BANK_SIZE = 64


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


def emit(relative, data, importer='buffer'):
    path = DEST / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)
    meta = path.with_suffix(path.suffix + '.meta')
    if not meta.exists():
        meta.write_text(json.dumps({'ver': '1.0.3' if importer == 'buffer' else '2.0.0',
            'importer': importer, 'imported': True,
            'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, f'rotate-rings/packed/{relative}')),
            'files': ['.json', '.bin'] if importer == 'buffer' else ['.json'],
            'subMetas': {}, 'userData': {}}, indent=2) + '\n')
    return len(data)


def read_meshes(path):
    data = path.read_bytes()
    if data[:4] != b'RRM2':
        raise ValueError(f'Original RRM2 source required: {path}')
    count = struct.unpack_from('<H', data, 4)[0]
    offset = 8
    for _ in range(count):
        length = data[offset]
        offset += 1
        name = data[offset:offset + length].decode('ascii')
        offset += length
        color = int.from_bytes(data[offset:offset + 3], 'big')
        offset += 3
        vertices, indices = struct.unpack_from('<HH', data, offset)
        size = 4 + vertices * 24 + indices * 2
        shape = data[offset:offset + size]
        if len(shape) != size:
            raise ValueError(f'Truncated mesh: {path}/{name}')
        offset += size
        yield name, color, shape
    if offset != len(data):
        raise ValueError(f'Unexpected original mesh tail: {path}')


def build():
    catalog = json.loads((SOURCE / 'index.json').read_text())
    shapes, lookup, level_refs = [], {}, {}
    raw_mesh_bytes = 0
    ids = [summary['id'] for mode in ('normal', 'hard') for summary in catalog['modes'][mode]]
    for level_id in ids:
        source = SOURCE / f'visual-level{level_id}.bin'
        raw_mesh_bytes += source.stat().st_size
        refs = []
        for name, color, shape in read_meshes(source):
            fingerprint = hashlib.sha256(shape).digest()
            index = lookup.get(fingerprint)
            if index is None:
                index = len(shapes)
                lookup[fingerprint] = index
                shapes.append(shape)
            elif shapes[index] != shape:
                raise ValueError('Geometry fingerprint collision')
            refs.append([name, index, color])
        level_refs[level_id] = refs
    mesh_packs = []
    for first in range(0, len(shapes), BANK_SIZE):
        bank = shapes[first:first + BANK_SIZE]
        raw = b'RRG3' + struct.pack('<IHH', first, len(bank), 0)
        raw += b''.join(struct.pack('<I', len(shape)) + shape for shape in bank)
        mesh_packs.append((first // BANK_SIZE, compressed(raw)))
    mesh_bytes = emit('geometry.bin', archive(mesh_packs))
    raw_logic_bytes = 0
    level_packs = []
    collisions, collision_lookup = [], {}
    bomb_kinds = {'ring': 0, 'pull': 0, 'board': 0}
    for level_id in ids:
        source = SOURCE / f'level{level_id}.json'
        raw_logic_bytes += source.stat().st_size
        level = json.loads(source.read_text())
        for ring in level['rings']:
            body = ring.pop('bodyLocal')
            fingerprint = json.dumps(body, separators=(',', ':'))
            if fingerprint not in collision_lookup:
                collision_lookup[fingerprint] = len(collisions)
                collisions.append(body)
            ring['bodyIndex'] = collision_lookup[fingerprint]
        for bomb in level['bombs']:
            bomb_kinds['ring' if bomb.get('ringId') else 'pull' if bomb.get('pullId') else 'board'] += 1
        raw = json.dumps([level, level_refs[level_id]], ensure_ascii=True, separators=(',', ':')).encode('ascii')
        level_packs.append((level_id, compressed(raw)))
    level_bytes = emit('levels.bin', archive(level_packs))
    collision_bytes = emit('collisions.bin', compressed(json.dumps(collisions, separators=(',', ':')).encode('ascii')))
    catalog['packing'] = {'version': 2, 'meshCount': len(shapes), 'bankSize': BANK_SIZE, 'collisionShapeCount': len(collisions)}
    index_bytes = emit('index.json', (json.dumps(catalog, separators=(',', ':')) + '\n').encode(), 'json')
    # 原始导入数据只作为离线构建输入；旧生产文件不能继续占据 JSON 合包或原生资源目录。
    for pattern in ('level*.json', 'level*.json.meta', 'visual-level*.bin', 'visual-level*.bin.meta'):
        for path in DEST.glob(pattern):
            path.unlink()
    # 合包生成成功后只清理旧生成物；原始关卡与网格继续保存在 assets 外。
    for directory in ('levels', 'geometry'):
        folder = DEST / directory
        for path in folder.glob('*.bin'):
            path.unlink()
            path.with_suffix('.bin.meta').unlink(missing_ok=True)
        if folder.is_dir() and not any(folder.iterdir()):
            folder.rmdir()
            folder.with_suffix('.meta').unlink(missing_ok=True)
    report = {'levels': len(ids), 'meshInstances': sum(map(len, level_refs.values())), 'uniqueMeshes': len(shapes),
        'meshBanks': len(mesh_packs), 'nativeFiles': 3, 'archiveEntries': len(level_packs) + len(mesh_packs), 'originalLogicBytes': raw_logic_bytes,
        'originalMeshBytes': raw_mesh_bytes, 'packedLevelBytes': level_bytes, 'packedMeshBytes': mesh_bytes,
        'catalogBytes': index_bytes, 'collisionShapes': len(collisions), 'collisionBytes': collision_bytes,
        'totalPackedBytes': level_bytes + mesh_bytes + index_bytes + collision_bytes,
        'geometrySha256': hashlib.sha256(b''.join(shapes)).hexdigest(), 'bankSize': BANK_SIZE,
        'bombs': sum(bomb_kinds.values()), 'bombKinds': bomb_kinds}
    (ROOT / 'rotate-rings-sources/level-packs.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    build()

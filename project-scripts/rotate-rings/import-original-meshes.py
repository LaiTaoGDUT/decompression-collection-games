#!/usr/bin/env python3
"""保留 Unity 原网格、路径 UV、切线及原色，交由原材质公式渲染。"""
import json
import struct
import uuid
from pathlib import Path
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'tmp/rotate-rings/apk/assets/yoo/DefaultPackage'
DEST = ROOT / 'local/rotate-rings-build-source/configs'
DEST.mkdir(parents=True, exist_ok=True)
count = 0
size = 0
for file in sorted(PACKAGE.glob('*physiclevelscene_level*.bundle')):
    number = file.name.split('physiclevelscene_level')[1].split('_')[0]
    env = UnityPy.load(str(file))
    meshes = {}
    for obj in env.objects:
        if obj.type.name != 'Mesh':
            continue
        mesh = obj.read()
        prefix = next((p for p in ['RingSegment_Ring_', 'ArrowRibbon_Stick_'] if mesh.m_Name.startswith(p)), None)
        if prefix is None:
            continue
        handler = MeshHandler(mesh); handler.process()
        vertices = []
        for i, (x, y, z) in enumerate(handler.m_Vertices):
            u, v = handler.m_UV0[i][:2]
            length, style = handler.m_UV1[i][:2]
            if abs(z - (-.001 if style < 0 else 0)) > 1e-7:
                raise ValueError(f'Unsupported original layer depth: {number}/{mesh.m_Name}')
            tx, ty, _, handedness = handler.m_Tangents[i]
            normal = handler.m_Normals[i]
            if abs(normal[0]) > .001 or abs(normal[1]) > .001 or normal[2] < .999:
                raise ValueError(f'Non-planar original mesh: {number}/{mesh.m_Name}')
            if not 0 <= v <= 1 or abs(style - round(style)) > .001 or not -127 <= style <= 127:
                raise ValueError(f'Unsupported original UV: {number}/{mesh.m_Name}')
            # 原 UV.x 是路径距离，并非图集归一化坐标；不能在导入时改写。
            vertices.append((x, y, u, length, round(v * 65535),
                round(max(-1, min(1, tx)) * 32767), round(max(-1, min(1, ty)) * 32767),
                round(handedness), round(style)))
        color = handler.m_Colors[0]
        meshes[mesh.m_Name.removeprefix(prefix)] = {
            'vertices': vertices, 'indices': list(handler.m_IndexBuffer),
            'color': '#' + ''.join(f'{round(c):02X}' for c in color[:3]),
        }
        count += 1
    # 独立 native BufferAsset，不进入 Cocos merge_all_json 的整包 JSON。
    data = bytearray(b'RRM2') + struct.pack('<HH', len(meshes), 0)
    for part_id, mesh in meshes.items():
        name = part_id.encode('ascii')
        vertex_count = len(mesh['vertices'])
        if len(name) > 255 or vertex_count > 65535 or len(mesh['indices']) > 65535:
            raise ValueError(f'Mesh exceeds format limits: {number}/{part_id}')
        data.extend(struct.pack('<B', len(name))); data.extend(name)
        data.extend(bytes.fromhex(mesh['color'][1:]))
        data.extend(struct.pack('<HH', vertex_count, len(mesh['indices'])))
        for vertex in mesh['vertices']:
            data.extend(struct.pack('<4fH2hbb', *vertex))
        data.extend(struct.pack('<' + 'H' * len(mesh['indices']), *mesh['indices']))
    path = DEST / f'visual-level{number}.bin'
    path.write_bytes(data); size += len(data)
    meta = path.with_suffix('.bin.meta')
    if not meta.exists():
        meta.write_text(json.dumps({'ver': '1.0.3', 'importer': 'buffer', 'imported': True,
            'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, f'rotate-rings/mesh/{number}')),
            'files': ['.json', '.bin'], 'subMetas': {}, 'userData': {}}, indent=2) + '\n')
    for obsolete in [DEST / f'visual-level{number}.json', DEST / f'visual-level{number}.json.meta']:
        if obsolete.exists(): obsolete.unlink()
print(f'Imported {count} original ring/pull meshes, {size:,} bytes in per-level assets')

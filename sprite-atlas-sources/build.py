#!/usr/bin/env python3
"""Build the explicitly grouped Cocos PNG/plist atlases in manifest.json.

Requires Pillow. Authoring images live outside assets, so prepareBundle cannot
download both the source images and the atlas. Unchanged pages retain their
existing (Tinify-compressed) bytes. Optional manifest resize keeps authoring
images intact. No rotation or palette conversion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import shutil
import uuid
from pathlib import Path

from PIL import Image

ATLAS_ROOT = Path(__file__).resolve().parent
ROOT = ATLAS_ROOT.parent
SOURCE_ROOT = ATLAS_ROOT
NAMESPACE = uuid.UUID('546fffe5-66ed-4f10-8e76-d1a4d6f3be58')


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def stable_uuid(name):
    return str(uuid.uuid5(NAMESPACE, name))


def compressed_uuid(value):
    base, *suffix = value.split('@')
    digits = base.replace('-', '')
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    result = digits[:2]
    for i in range(2, 32, 3):
        number = int(digits[i:i + 3], 16)
        result += alphabet[number >> 6] + alphabet[number & 63]
    return result + ('@' + suffix[0] if suffix else '')


def imported_frame_ids(meta):
    """Prefer Cocos' child identity over our pre-import provisional identity.

    The first plist import may retain the MD5(name) entry and append the real
    importer entry. Either entry can come first, so insertion order cannot
    determine which ID to preserve on subsequent builds.
    """
    result = {}
    for sid, child in meta.get('subMetas', {}).items():
        name = child.get('name')
        if child.get('importer') != 'sprite-frame' or not isinstance(name, str):
            continue
        provisional = hashlib.md5(name.encode()).hexdigest()[:5]
        if name not in result or (result[name] == provisional and sid != provisional):
            result[name] = sid
    return result


def source_file(game, relative):
    archived = SOURCE_ROOT / game / relative
    if not archived.exists():
        original = ROOT / 'assets/game-assets' / game / relative
        if not original.exists():
            raise FileNotFoundError(original)
        archived.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, archived)
    return archived


def load_frame(game, entry):
    source = source_file(game, entry['source'])
    meta = read_json(source_file(game, entry['source'] + '.meta'))
    image = Image.open(source).convert('RGBA')
    data = dict(next((m['userData'] for m in meta['subMetas'].values()
                      if m['importer'] == 'sprite-frame'), {}))
    old_uuids = [m['uuid'] for m in meta['subMetas'].values()
                 if m['importer'] == 'sprite-frame']
    aliases = [str(Path(entry['source']).with_suffix('')) + '/texture',
               str(Path(entry['source']).with_suffix('')) + '/spriteFrame']
    if 'frame' in entry:
        atlas_path = str(Path(entry['source']).with_suffix('.plist'))
        atlas_meta = read_json(source_file(game, atlas_path + '.meta'))
        part = next(m for m in atlas_meta['subMetas'].values() if m['name'] == entry['frame'])
        data = dict(part['userData'])
        source_file(game, atlas_path)
        old_uuids = [part['uuid']]
        aliases = [str(Path(atlas_path).with_suffix('')) + '/' + entry['frame']]
    elif entry.get('geometry', 'full') == 'full':
        data.update(trimX=0, trimY=0, width=image.width, height=image.height,
                    rawWidth=image.width, rawHeight=image.height, offsetX=0, offsetY=0, rotated=False)
    if 'crop' in entry:
        x, y, w, h = entry['crop']
        data.update(trimX=x, trimY=y, width=w, height=h, rawWidth=w, rawHeight=h,
                    offsetX=0, offsetY=0, rotated=False)
    if data.get('rotated'):
        raise ValueError('Rotated authoring frame needs explicit unpacking: ' + str(source))
    rect = [int(data[k]) for k in ('trimX', 'trimY', 'width', 'height')]
    x, y, w, h = rect
    if min(x, y) < 0 or min(w, h) <= 0 or x + w > image.width or y + h > image.height:
        raise ValueError(f'Invalid source rectangle: {source}: {rect}')
    pixels = image.crop((x, y, x + w, y + h))
    data.update(entry.get('insets', {}))
    if 'resize' in entry:
        size = entry['resize']
        if (not isinstance(size, list) or len(size) != 2
                or any(type(v) is not int or v <= 0 for v in size)):
            raise ValueError(f'Invalid resize dimensions: {source}: {size}')
        rw, rh = size
        if rw > w or rh > h or abs(rw * h - rh * w) > max(w, h):
            raise ValueError(f'Resize must downsample proportionally: {source}: {size}')
        sx, sy = rw / w, rh / h
        pixels = pixels.resize((rw, rh), Image.Resampling.LANCZOS)
        data.update(width=rw, height=rh,
                    rawWidth=max(rw, round(data['rawWidth'] * sx)),
                    rawHeight=max(rh, round(data['rawHeight'] * sy)),
                    offsetX=data.get('offsetX', 0) * sx,
                    offsetY=data.get('offsetY', 0) * sy)
        for side, scale in [('Top', sy), ('Bottom', sy), ('Left', sx), ('Right', sx)]:
            key = 'border' + side
            data[key] = round(data.get(key, 0) * scale)
    name = entry.get('name', source.stem + ('-' + entry['frame'] if 'frame' in entry else ''))
    return dict(name=name, image=pixels, data=data, aliases=aliases, old_uuids=old_uuids,
                source=entry['source'], source_rect=rect)


def contains(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and a[0] + a[2] >= b[0] + b[2] and a[1] + a[3] >= b[1] + b[3]


def pack(frames, limit):
    remaining = sorted(frames, key=lambda f: (-max(f['image'].size), -f['image'].width * f['image'].height, f['name']))
    pages = []
    while remaining:
        free = [(0, 0, limit, limit)]
        placed = []
        pending = []
        for frame in remaining:
            w, h = (v + 4 for v in frame['image'].size)
            choices = [(min(r[2] - w, r[3] - h), max(r[2] - w, r[3] - h), r[1], r[0], r)
                       for r in free if w <= r[2] and h <= r[3]]
            if not choices:
                pending.append(frame)
                continue
            r = min(choices)[-1]
            used = (r[0], r[1], w, h)
            frame = dict(frame, x=r[0] + 2, y=r[1] + 2)
            placed.append(frame)
            split = []
            ux, uy, uw, uh = used
            for fx, fy, fw, fh in free:
                if ux >= fx + fw or ux + uw <= fx or uy >= fy + fh or uy + uh <= fy:
                    split.append((fx, fy, fw, fh))
                    continue
                if ux > fx: split.append((fx, fy, ux - fx, fh))
                if ux + uw < fx + fw: split.append((ux + uw, fy, fx + fw - ux - uw, fh))
                if uy > fy: split.append((fx, fy, fw, uy - fy))
                if uy + uh < fy + fh: split.append((fx, uy + uh, fw, fy + fh - uy - uh))
            free = [a for i, a in enumerate(split) if not any(contains(b, a) for j, b in enumerate(split) if i != j and (a != b or j < i))]
        if not placed:
            raise ValueError(f'Frame exceeds {limit}px: {remaining[0]["name"]}')
        width = max(f['x'] + f['image'].width + 2 for f in placed)
        height = max(f['y'] + f['image'].height + 2 for f in placed)
        pages.append((placed, width, height))
        remaining = pending
    return pages


def build_group(game, group, previous, outputs, mapping, rewrites, editor_metadata=None):
    frames = [load_frame(game, entry) for entry in group['frames']]
    if len({f['name'] for f in frames}) != len(frames):
        raise ValueError('Duplicate frame name: ' + group['path'])
    for index, (placed, width, height) in enumerate(pack(frames, group.get('maxSize', 1024))):
        path = group['path'] + ('' if index == 0 else '-' + str(index + 1))
        output = ROOT / 'assets/game-assets' / game / path
        output.parent.mkdir(parents=True, exist_ok=True)
        atlas_uuid = stable_uuid(game + '/' + path + '.plist')
        image_uuid = stable_uuid(game + '/' + path + '.png')
        texture_uuid = image_uuid + '@6c48a'
        canvas = Image.new('RGBA', (width, height))
        plist_frames = {}
        metas = {}
        records = []
        existing_meta = read_json(output.with_suffix('.plist.meta')) if output.with_suffix('.plist.meta').exists() else {}
        # Preserve the actual importer identity, even when Cocos appended it
        # after the provisional entry, and write its intended packing settings.
        existing_ids = imported_frame_ids(existing_meta)
        for f in placed:
            x, y = f['x'], f['y']
            pixels = f['image']
            w, h = pixels.size
            canvas.paste(pixels, (x, y))
            # One pixel extrusion, surrounded by another transparent pixel.
            canvas.paste(pixels.crop((0, 0, w, 1)), (x, y - 1))
            canvas.paste(pixels.crop((0, h - 1, w, h)), (x, y + h))
            canvas.paste(pixels.crop((0, 0, 1, h)), (x - 1, y))
            canvas.paste(pixels.crop((w - 1, 0, w, h)), (x + w, y))
            for dx, dy, sx, sy in [(-1, -1, 0, 0), (w, -1, w - 1, 0), (-1, h, 0, h - 1), (w, h, w - 1, h - 1)]:
                canvas.putpixel((x + dx, y + dy), pixels.getpixel((sx, sy)))
            d = f['data']
            rw, rh = d['rawWidth'], d['rawHeight']
            ox, oy = d.get('offsetX', 0), d.get('offsetY', 0)
            plist_frames[f['name']] = dict(frame=f'{{{{{x},{y}}},{{{w},{h}}}}}', offset=f'{{{ox},{oy}}}',
                                           rotated=False, sourceColorRect=f'{{{{{(rw-w)/2+ox},{(rh-h)/2-oy}}},{{{w},{h}}}}}', sourceSize=f'{{{rw},{rh}}}')
            sid = existing_ids.get(f['name'], hashlib.md5(f['name'].encode()).hexdigest()[:5])
            sf_uuid = atlas_uuid + '@' + sid
            user_data = dict(trimThreshold=1, rotated=False, offsetX=ox, offsetY=oy, trimX=x, trimY=y,
                             width=w, height=h, rawWidth=rw, rawHeight=rh, packable=False, pixelsToUnit=100,
                             pivotX=d.get('pivotX', .5), pivotY=d.get('pivotY', .5), meshType=0,
                             vertices={k: [] for k in ('rawPosition', 'indexes', 'uv', 'nuv', 'minPos', 'maxPos')},
                             isUuid=True, imageUuidOrDatabaseUri=texture_uuid, atlasUuid=atlas_uuid, trimType='custom')
            # Cocos's plist importer stores pixel borders as integers.
            for side in ('Top', 'Bottom', 'Left', 'Right'): user_data['border' + side] = int(d.get('border' + side, 0))
            metas[sid] = dict(importer='sprite-frame', uuid=sf_uuid, displayName='', id=sid, name=f['name'],
                              userData=user_data, ver='1.0.12', imported=True, files=['.json'], subMetas={})
            for alias in f['aliases']:
                if alias in mapping: raise ValueError('Duplicate source alias: ' + alias)
                mapping[alias] = path + '/' + f['name']
            for old_uuid in f['old_uuids']: rewrites[old_uuid] = sf_uuid
            records.append(dict(source=f['source'], sourceRect=f['source_rect'], name=f['name'], uuid=sf_uuid,
                                rect=[x, y, w, h], originalSize=[rw, rh], offset=[ox, oy],
                                insets={s: user_data['border' + s] for s in ('Top', 'Bottom', 'Left', 'Right')}))
        raw_hash = hashlib.sha256(canvas.tobytes() + str(canvas.size).encode()).hexdigest()
        key = game + '/' + path
        png = output.with_suffix('.png')
        if previous.get(key, {}).get('rawHash') != raw_hash or not png.exists():
            canvas.save(png, optimize=True)
        texture_meta = dict(importer='texture', uuid=texture_uuid, displayName=output.name, id='6c48a', name='texture',
                            userData=dict(wrapModeS='clamp-to-edge', wrapModeT='clamp-to-edge', minfilter='linear', magfilter='linear',
                                          mipfilter='none', anisotropy=0, isUuid=True, imageUuidOrDatabaseUri=image_uuid, visible=False),
                            ver='1.0.22', imported=True, files=['.json'], subMetas={})
        write_json(output.with_suffix('.png.meta'), dict(ver='1.0.27', importer='image', imported=True, uuid=image_uuid,
                   files=['.json', '.png'], subMetas={'6c48a': texture_meta},
                   userData=dict(type='texture', fixAlphaTransparencyArtifacts=False, hasAlpha=True, redirect=texture_uuid)))
        output.with_suffix('.plist').write_bytes(plistlib.dumps(dict(frames=plist_frames, metadata=dict(
            format=2, realTextureFileName=png.name, textureFileName=png.name, size=f'{{{width},{height}}}'))))
        atlas_meta = dict(ver='1.0.8', importer='sprite-atlas', imported=True, uuid=atlas_uuid,
                          files=['.json'], subMetas=metas,
                          userData=dict(atlasTextureName=png.name, format=2, uuid=atlas_uuid, textureUuid=texture_uuid))
        write_json(output.with_suffix('.plist.meta'), atlas_meta)
        if editor_metadata is not None:
            editor_metadata['db://assets/game-assets/' + game + '/' + path + '.plist'] = atlas_meta
        outputs[key] = dict(rawHash=raw_hash, imageUuid=image_uuid, size=[width, height], frames=records)


def rewrite_references(rewrites):
    replacements = dict(rewrites)
    replacements.update({compressed_uuid(k): compressed_uuid(v) for k, v in rewrites.items()})
    count = 0
    for pattern in ('*.scene', '*.prefab'):
        for path in (ROOT / 'assets').rglob(pattern):
            text = path.read_text()
            for old, new in replacements.items(): text = text.replace('"' + old + '"', '"' + new + '"')
            if text != path.read_text():
                path.write_text(text)
                count += 1
    return count


def collect_compression_inputs(games):
    inputs = set()
    for game in games:
        for plist in (ROOT / 'assets/game-assets' / game).rglob('*.plist'):
            metadata = plistlib.loads(plist.read_bytes()).get('metadata', {})
            filename = metadata.get('textureFileName') or metadata.get('realTextureFileName')
            if not isinstance(filename, str) or not filename.strip():
                raise ValueError(f'Atlas metadata does not declare a texture file: {plist}')
            texture = plist.parent / filename
            if not texture.is_file():
                raise FileNotFoundError(f'Atlas texture does not exist: {plist}: {texture}')
            inputs.add(str(texture.relative_to(ROOT)))
    for game, pattern in [('catch', 'visual/items/*.png'), ('meowdoku', 'visual/cat/*.png'),
                          ('meowdoku', 'visual/effect/meowdoku-tile-v2.png')]:
        inputs.update(str(p.relative_to(ROOT)) for p in (ROOT / 'assets/game-assets' / game).glob(pattern))
    return sorted(inputs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Validate imported atlas geometry without modifying anything.')
    parser.add_argument('--sync-imports', action='store_true', help='Record Cocos-assigned child UUIDs after asset refresh.')
    parser.add_argument('--editor-metadata-output', type=Path,
                        help='Export generated atlas metadata for saving through the running Cocos asset database.')
    args = parser.parse_args()
    manifest = read_json(ATLAS_ROOT / 'manifest.json')
    state_path = ATLAS_ROOT / 'generated.json'
    previous = read_json(state_path) if state_path.exists() else {}
    if args.sync_imports:
        rewrites = {}
        for key, page in previous.items():
            game, relative = key.split('/', 1)
            meta = read_json((ROOT / 'assets/game-assets' / game / relative).with_suffix('.plist.meta'))
            imported_ids = imported_frame_ids(meta)
            for frame in page['frames']:
                imported = meta['subMetas'][imported_ids[frame['name']]]['uuid']
                if frame['uuid'] != imported: rewrites[frame['uuid']] = imported
                frame['uuid'] = imported
        changed = rewrite_references(rewrites)
        write_json(state_path, previous)
        migrations_path = ATLAS_ROOT / 'uuid-migrations.json'
        migrations = read_json(migrations_path)
        migrations = {old: rewrites.get(new, new) for old, new in migrations.items()}
        migrations.update(rewrites)
        write_json(migrations_path, migrations)
        print(f'Synchronized {len(rewrites)} imported frame UUIDs; rewired {changed} scene/prefab files.')
        return
    if args.verify:
        if read_json(ATLAS_ROOT / 'compression-inputs.json') != collect_compression_inputs(manifest['games']):
            raise ValueError('Compression input list is stale; run sprite-atlas-sources/build.py to regenerate it.')
        for key, page in previous.items():
            game, relative = key.split('/', 1)
            root = ROOT / 'assets/game-assets' / game / relative
            with Image.open(root.with_suffix('.png')) as image:
                assert image.size == tuple(page['size']), key
            meta = read_json(root.with_suffix('.plist.meta'))
            imported_frames = [m for m in meta['subMetas'].values() if m['importer'] == 'sprite-frame']
            imported_names = [m['name'] for m in imported_frames]
            assert len(imported_names) == len(set(imported_names)), (key, 'duplicate imported frame names')
            assert set(imported_names) == {f['name'] for f in page['frames']}, (key, 'unexpected imported frames')
            for f in page['frames']:
                sub = next(m for m in meta['subMetas'].values() if m['name'] == f['name'])
                d = sub['userData']
                assert [d[k] for k in ('trimX', 'trimY', 'width', 'height')] == f['rect'], (key, f['name'], 'rect')
                assert [d[k] for k in ('rawWidth', 'rawHeight')] == f['originalSize'], (key, f['name'], 'size')
                assert [d[k] for k in ('offsetX', 'offsetY')] == f['offset'], (key, f['name'], 'offset')
                assert all(d['border' + s] == f['insets'][s] for s in f['insets']), (key, f['name'], 'insets')
                assert sub['uuid'] == f['uuid'], (key, f['name'], 'uuid')
                assert d['imageUuidOrDatabaseUri'] == page['imageUuid'] + '@6c48a', (key, f['name'], 'texture')
                assert not d['packable'], (key, f['name'], 'repacking')
        print(f'Validated {len(previous)} pages / {sum(len(p["frames"]) for p in previous.values())} imported frames and compression inputs.')
        return
    outputs, rewrites = {}, {}
    editor_metadata = {} if args.editor_metadata_output else None
    for game, groups in manifest['games'].items():
        mapping = {}
        for group in groups: build_group(game, group, previous, outputs, mapping, rewrites, editor_metadata)
        script = ROOT / 'assets/games' / game / 'scripts/PackedSpritePaths.ts'
        script.write_text('// Generated by sprite-atlas-sources/build.py. Source keys are authoring identifiers.\n'
                          + 'export const PACKED_SPRITE_PATHS: Readonly<Record<string, string>> = Object.freeze('\
                          + json.dumps(dict(sorted(mapping.items())), ensure_ascii=False, indent=4) + ');\n')
        # Archive the original import inputs before removing them from the runtime Bundle.
        for group in groups:
            for entry in group['frames']:
                paths = [entry['source'], entry['source'] + '.meta']
                if 'frame' in entry: paths += [str(Path(entry['source']).with_suffix('.plist')), str(Path(entry['source']).with_suffix('.plist.meta'))]
                for relative in paths:
                    original = ROOT / 'assets/game-assets' / game / relative
                    if original.exists():
                        source_file(game, relative)
                        original.unlink()
        # These games now use imported plist frames in preview and builds alike.
        for pac in (ROOT / 'assets/game-assets' / game).rglob('*.pac'):
            for path in [pac, Path(str(pac) + '.meta')]:
                if path.exists():
                    source_file(game, str(path.relative_to(ROOT / 'assets/game-assets' / game)))
                    path.unlink()
    # Preserve serialized references when a frame changes atlas page on rebuild.
    current_frames = {(key.split('/')[0], f['source'], f['name']): f['uuid']
                      for key, page in outputs.items() for f in page['frames']}
    for key, page in previous.items():
        for frame in page['frames']:
            new_uuid = current_frames.get((key.split('/')[0], frame['source'], frame['name']))
            if new_uuid and new_uuid != frame['uuid']: rewrites[frame['uuid']] = new_uuid
    changed = rewrite_references(rewrites)
    # A smaller group on the next run must not leave obsolete PNG pages in the Bundle.
    for key in previous.keys() - outputs.keys():
        game, relative = key.split('/', 1)
        output = ROOT / 'assets/game-assets' / game / relative
        for suffix in ('.png', '.png.meta', '.plist', '.plist.meta'):
            path = output.with_suffix(suffix)
            if path.exists(): path.unlink()
    write_json(state_path, outputs)
    write_json(ATLAS_ROOT / 'uuid-migrations.json', rewrites)
    write_json(ATLAS_ROOT / 'compression-inputs.json', collect_compression_inputs(manifest['games']))
    if args.editor_metadata_output:
        write_json(args.editor_metadata_output, editor_metadata)
    print(f'Built {len(outputs)} pages / {sum(len(p["frames"]) for p in outputs.values())} frames; rewired {changed} scene/prefab files.')


if __name__ == '__main__':
    main()

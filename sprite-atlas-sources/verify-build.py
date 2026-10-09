#!/usr/bin/env python3
"""Validate Cocos 3.8.8 WeChat atlas dependencies and native PNG bytes."""
import hashlib
import json
import sys
from pathlib import Path

from build import ATLAS_ROOT, ROOT, SOURCE_ROOT, compressed_uuid, read_json

build = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'build/wechatgame-manual-atlases-20261004'
games = read_json(ATLAS_ROOT / 'manifest.json')['games']
catalog = read_json(ROOT / 'assets/resources/configs/games.json')['games']
configs, imports, bundles, statistics = {}, {}, {}, {}
for game in games:
    entry = next(g for g in catalog if g['id'] == ('game2048' if game == 'twenty48' else game))
    bundles[game] = build / 'remote' / entry['resourceBundle']
    configs[game] = read_json(next(bundles[game].glob('config.*.json')))
    imports[game] = {}
    for pack in configs[game]['packs']:
        imports[game][pack] = read_json(next((bundles[game] / 'import').rglob(pack + '*.json')))
    images = [p for p in bundles[game].rglob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')]
    statistics[game] = dict(files=len(images), bytes=sum(p.stat().st_size for p in images))

verified = 0
for key, page in read_json(ATLAS_ROOT / 'generated.json').items():
    game, path = key.split('/', 1)
    cfg = configs[game]
    for frame in page['frames']:
        child_path = path + '/' + frame['name']
        asset_id = next(int(k) for k, p in cfg['paths'].items()
                        if p[0] == child_path and cfg['types'][p[1]] == 'cc.SpriteFrame')
        assert cfg['uuids'][asset_id] in (frame['uuid'], compressed_uuid(frame['uuid'])), child_path
        pack, indices = next((p, ids) for p, ids in cfg['packs'].items() if asset_id in ids)
        data = imports[game][pack]
        section = data[5][indices.index(asset_id)]
        geometry = section[0][0]
        assert list(geometry['rect'].values()) == frame['rect'], child_path
        assert list(geometry['originalSize'].values()) == frame['originalSize'], child_path
        assert list(geometry['offset'].values()) == frame['offset'], child_path
        assert not geometry['rotated'] and not geometry['packable'], child_path
        assert geometry['capInsets'] == [frame['insets'][s] for s in ('Left', 'Top', 'Right', 'Bottom')], child_path
        dependencies = [data[1][i] for i in section[-1]]
        dependencies = [cfg['uuids'][d] if isinstance(d, int) else d for d in dependencies]
        texture = page['imageUuid'] + '@6c48a'
        assert any(d in (texture, compressed_uuid(texture)) for d in dependencies), (child_path, dependencies)
        verified += 1

inputs = read_json(ATLAS_ROOT / 'compression-inputs.json')
for relative in inputs:
    source = ROOT / relative
    image_uuid = read_json(Path(str(source) + '.meta'))['uuid']
    game = source.parts[len(ROOT.parts) + 2]
    files = list((bundles[game] / 'native').rglob(image_uuid + '.*.png'))
    assert len(files) == 1 and files[0].read_bytes() == source.read_bytes(), relative
    assert hashlib.md5(source.read_bytes()).hexdigest().startswith(files[0].name.split('.')[-2]), relative

# Packed sources must not survive as additional native files in their old Bundle.
for game in games:
    native = {p.name.split('.')[0] for p in (bundles[game] / 'native').rglob('*.png')}
    sources = {entry['source'] for group in games[game] for entry in group['frames']}
    for source in sources:
        old_uuid = read_json(SOURCE_ROOT / game / (source + '.meta'))['uuid']
        assert old_uuid not in native, (game, source, 'duplicated source texture')

report = dict(games=statistics, preservedAtlases=len(inputs), verifiedFrames=verified,
              files=sum(s['files'] for s in statistics.values()), bytes=sum(s['bytes'] for s in statistics.values()))
print(json.dumps(report, ensure_ascii=False, indent=2))
(ROOT / 'local/manual-atlas-verification/build-image-stats.json').write_text(json.dumps(report, indent=2) + '\n')

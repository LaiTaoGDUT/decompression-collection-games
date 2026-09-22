"""Normalize approved generated sprites to circular 256px RGBA assets.

Only background, alpha, crop and dimensions are processed locally, as authorized.
Source artwork and generation prompts remain archived per theme.
"""
import argparse
import json
import uuid
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/games/bubble-shooter/art-source/bubbles-hd'
DEST = ROOT / 'assets/game-assets/bubble-shooter/visual/regions'
SIZE = 256
KEYS = ('red', 'yellow', 'blue', 'purple', 'support')


@lru_cache(maxsize=1)
def circular_alpha():
    # Analytic circle coverage avoids a one-value asymmetry from separable image resizing.
    radius = SIZE / 2
    values = []
    for y in range(SIZE):
        for x in range(SIZE):
            distance = ((x + .5 - radius) ** 2 + (y + .5 - radius) ** 2) ** .5
            if distance <= radius - 1:
                value = 255
            elif distance >= radius + 1:
                value = 0
            else:
                samples = sum((x + (sx + .5) / 8 - radius) ** 2 +
                    (y + (sy + .5) / 8 - radius) ** 2 <= radius ** 2
                    for sy in range(8) for sx in range(8))
                value = round(255 * samples / 64)
            values.append(value)
    result = Image.new('L', (SIZE, SIZE))
    result.putdata(values)
    return result


def round_sprite(source):
    image = Image.open(source).convert('RGBA')
    alpha = image.getchannel('A')
    if alpha.getextrema()[0] != 0:
        raise ValueError(f'{source}: missing transparent background')
    # Remove tiny disconnected specks without changing subject pixels.
    mask = alpha.point(lambda v: 255 if v >= 192 else 0)
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    center = (image.width // 2, image.height // 2)
    if mask.getpixel(center) != 255:
        raise ValueError(f'{source}: transparent center')
    ImageDraw.floodfill(mask, center, 128)
    core = mask.point(lambda v: 255 if v == 128 else 0)
    bounds = core.getbbox()
    x0, y0, x1, y1 = bounds
    if min(x1 - x0, y1 - y0) < min(image.size) * .65:
        raise ValueError(f'{source}: unexpectedly small subject {bounds}')
    # Two source pixels remove antialias fringe; normalize the slight generated ellipse.
    bounds = (x0 + 2, y0 + 2, x1 - 2, y1 - 2)
    crop = image.crop(bounds).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    circle = circular_alpha()
    # The surface is opaque even when the painted material depicts clear water/glass.
    inside = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(inside).ellipse((6, 6, SIZE - 7, SIZE - 7), fill=255)
    holes = ImageChops.multiply(crop.getchannel('A').point(lambda v: 255 if v < 128 else 0), inside)
    if sum(holes.histogram()[128:]) > SIZE * SIZE * .001:
        raise ValueError(f'{source}: holes inside sphere')
    crop.putalpha(circle)
    return crop, bounds


def folder_meta(folder):
    folder.mkdir(parents=True, exist_ok=True)
    meta = folder.with_name(folder.name + '.meta')
    if not meta.exists():
        meta.write_text(json.dumps({'ver': '1.2.0', 'importer': 'directory', 'imported': True,
            'uuid': str(uuid.uuid4()), 'files': [], 'subMetas': {}, 'userData': {}}, indent=2) + '\n')


def write_meta(target):
    meta_path = target.with_name(target.name + '.meta')
    template_path = DEST / 'cloud/bubbles/bubble-red.png.meta'
    data = json.loads((meta_path if meta_path.exists() else template_path).read_text())
    old_uid = data['uuid']
    uid = old_uid if meta_path.exists() else str(uuid.uuid4())
    data = json.loads(json.dumps(data).replace(old_uid, uid))
    for sub in data['subMetas'].values():
        sub['displayName'] = target.stem
        if sub['importer'] == 'sprite-frame':
            sub['userData'].update(width=SIZE, height=SIZE, rawWidth=SIZE, rawHeight=SIZE,
                trimX=0, trimY=0, offsetX=0, offsetY=0, trimType='custom', rotated=False,
                borderTop=0, borderBottom=0, borderLeft=0, borderRight=0)
            sub['userData'].pop('vertices', None)
    meta_path.write_text(json.dumps(data, indent=2) + '\n')
    return uid


def bind_support(uid):
    path = ROOT / 'assets/games/bubble-shooter/scenes/BubbleShooter.scene'
    scene = json.loads(path.read_text())
    component = next(o for o in scene if 'audioSlots' in o)
    component['supportFrame'] = None  # Loaded by current region through AssetService.
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + '\n')


def atlas(folder, region):
    target = folder / (region + '-bubbles.pac')
    if target.exists():
        return
    target.write_text('{\n  "__type__": "cc.SpriteAtlas"\n}\n')
    data = json.loads((DEST / 'cloud/bubbles/cloud-bubbles.pac.meta').read_text())
    data['uuid'] = str(uuid.uuid4())
    target.with_name(target.name + '.meta').write_text(json.dumps(data, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--region', choices=['cloud', 'ocean', 'toy', 'magic'])
    args = parser.parse_args()
    regions = [args.region] if args.region else ['cloud', 'ocean', 'toy', 'magic']
    for region in regions:
        folder_meta(DEST / region)
        folder = DEST / region / 'bubbles'
        folder_meta(folder)
        report = []
        for key in KEYS:
            source = SOURCE / region / (key + '.png')
            sprite, bounds = round_sprite(source)
            target = folder / ('bubble-' + key + '.png')
            sprite.save(target, optimize=True)
            uid = write_meta(target)
            if region == 'cloud' and key == 'support':
                bind_support(uid)
            report.append({'key': key, 'source': str(source.relative_to(ROOT)), 'crop': bounds,
                'runtime': str(target.relative_to(ROOT)), 'size': SIZE, 'bytes': target.stat().st_size})
        (SOURCE / region / 'processing.json').write_text(json.dumps(report, indent=2) + '\n')
        atlas(folder, region)
        print(region, '5 sprites processed; 256x256, circular alpha, no padding')


if __name__ == '__main__':
    main()

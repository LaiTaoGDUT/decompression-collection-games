"""Deterministic matte/crop/downscale for the user-approved reward v4 sources.

User authorized local pixel processing on 2026-09-12. Never overwrites art sources.
Requires Pillow only. Run from any directory; only runtime-source and Bundle
assets are written to the repository.
"""
from pathlib import Path
import json
import uuid
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / 'docs/games/bubble-shooter/art-source/reward'
OUTPUT = ROOT / 'docs/games/bubble-shooter/runtime-source/reward'
BUNDLE = ROOT / 'assets/game-assets/bubble-shooter/visual'
def fill_holes(mask):
    outside = mask.copy()
    ImageDraw.floodfill(outside, (0, 0), 128)
    return outside.point(lambda v: 0 if v == 128 else 255)


def component(mask, seed):
    result = mask.copy()
    assert result.getpixel(seed) == 255, ('Foreground seed missing', seed)
    ImageDraw.floodfill(result, seed, 128)
    return result.point(lambda v: 255 if v == 128 else 0)


def matte(name, image):
    rgb = image.convert('RGB')
    r, g, b = rgb.split()
    w, h = image.size
    if name == 'card':
        # Source alpha has disconnected opaque flecks; retain the actual card only.
        mask = image.getchannel('A').point(lambda v: 255 if v > 128 else 0)
        mask = component(mask, (w // 2, h // 2))
        mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        mask = fill_holes(mask)
    elif name in ('panel', 'button', 'selection'):
        # Checker pixels are neutral; foreground rim is warm (panel) or pink.
        diff = ImageChops.subtract(r, b if name == 'panel' else g)
        mask = diff.point(lambda v: 255 if v > (22 if name == 'panel' else 110 if name == 'selection' else 90) else 0)
        # Join subpixel gaps in white rim highlights before selecting the object.
        mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
        if name == 'selection':
            # The solid rim has red >= 245; checker-tinted glow is darker.
            # Include white rim highlights, without carrying the baked glow pattern.
            mask = r.point(lambda v: 255 if v >= 245 else 0)
            mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
            outer = fill_holes(mask)
            hole = component(ImageChops.invert(mask), (w // 2, h // 2))
            hole = hole.filter(ImageFilter.MaxFilter(3))
            mask = ImageChops.subtract(outer, hole)
        else:
            mask = fill_holes(mask)
            mask = component(mask, (w // 2, h // 2))
        # Remove mixed checker/foreground fringe before alpha resampling.
        mask = mask.filter(ImageFilter.MinFilter(3))
    else:
        # These sources were intentionally generated on black. Foreground is connected.
        value = ImageChops.lighter(ImageChops.lighter(r, g), b)
        mask = value.point(lambda v: 255 if v > 40 else 0)
        mask = component(mask, (w // 2, h // 2))
        mask = fill_holes(mask)
        mask = mask.filter(ImageFilter.MinFilter(3))
    assert mask.getbbox() and mask.getpixel((0, 0)) == 0
    # Feather less than one source pixel; downsampling supplies final antialiasing.
    alpha = mask.filter(ImageFilter.GaussianBlur(0.55))
    image = rgb.convert('RGBA')
    image.putalpha(alpha)
    return image.crop(alpha.getbbox())


def prepare(name, maximum):
    image = matte(name, Image.open(SOURCES / f'{name}-source-v1.png'))
    image.thumbnail((maximum[0] - 8, maximum[1] - 8), Image.Resampling.LANCZOS)
    padded = Image.new('RGBA', (image.width + 8, image.height + 8))
    padded.alpha_composite(image, (4, 4))
    # Fully transparent texels have no hidden checker/black pixels.
    pixels = [(0, 0, 0, 0) if a == 0 else (r, g, b, a) for r, g, b, a in padded.get_flattened_data()]
    padded.putdata(pixels)
    return padded


def write_meta(path, image, border):
    template = json.loads((BUNDLE / 'hud/hud-boss-health-track.png.meta').read_text())
    meta_path = Path(str(path) + '.meta')
    ident = json.loads(meta_path.read_text())['uuid'] if meta_path.exists() else str(uuid.uuid4())
    template['uuid'] = ident
    template['userData']['redirect'] = ident + '@6c48a'
    for suffix, sub in template['subMetas'].items():
        sub['uuid'] = ident + '@' + suffix
        sub['displayName'] = path.stem
        sub['userData']['imageUuidOrDatabaseUri'] = ident + ('@6c48a' if suffix == 'f9941' else '')
    data = template['subMetas']['f9941']['userData']
    w, h = image.size
    data.update(width=w, height=h, rawWidth=w, rawHeight=h, trimX=0, trimY=0,
                offsetX=0, offsetY=0, trimType='none', borderLeft=border[0],
                borderRight=border[1], borderTop=border[2], borderBottom=border[3])
    data['vertices'] = {
        'rawPosition': [-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
        'indexes': [0,1,2,2,1,3], 'uv': [0,h,w,h,0,0,w,0],
        'nuv': [0,0,1,0,0,1,1,1], 'minPos': [-w/2,-h/2,0], 'maxPos': [w/2,h/2,0],
    }
    meta_path.write_text(json.dumps(template, indent=2) + '\n')


def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    records = {}
    spec = {
        'panel': ((768,512),(68,68,68,68)),
        'card': ((256,448),(46,46,46,46)),
        'button': ((512,128),None),
        'selection': ((192,336),(44,44,44,44)),
        'check': ((96,96),(0,0,0,0)),
        'subtitle': ((512,96),None),
        'cloud-title': ((768,224),(0,0,0,0)),
    }
    for name,(maximum,border) in spec.items():
        image = prepare(name, maximum)
        border = border or (image.height//2,image.height//2,0,0)
        assert image.getchannel('A').getextrema() == (0,255)
        assert image.width>border[0]+border[1] and image.height>border[2]+border[3]
        if name == 'selection':
            assert image.getpixel((image.width//2,image.height//2))[3] == 0
        path = OUTPUT / f'reward-{name}.png'
        image.save(path,optimize=True)
        folder = BUNDLE / ('reward-cloud' if name == 'cloud-title' else 'reward-common')
        folder.mkdir(exist_ok=True)
        target = folder / path.name
        target.write_bytes(path.read_bytes())
        write_meta(target,image,border)
        records[name] = {'width':image.width,'height':image.height,'border':border,'bytes':path.stat().st_size,
                         'bundle':str(target.relative_to(ROOT))}
    (OUTPUT / 'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps(records,indent=2))


if __name__ == '__main__':
    main()

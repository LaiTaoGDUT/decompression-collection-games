"""Check runtime sprite geometry/metadata and produce an asset review sheet (not a browser capture)."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'assets/game-assets/bubble-shooter/visual/regions'
REGIONS = ['cloud', 'ocean', 'toy', 'magic']
KEYS = ['red', 'yellow', 'blue', 'purple', 'support']
sheet = Image.new('RGB', (1150, 1060), '#f4f7fb')
draw = ImageDraw.Draw(sheet)
uids, hashes = set(), set()
total = 0
for row, region in enumerate(REGIONS):
    draw.text((20, 34 + row * 255), region.upper(), fill='#31445b')
    for col, key in enumerate(KEYS):
        path = DEST / region / 'bubbles' / ('bubble-' + key + '.png')
        image = Image.open(path)
        assert image.mode == 'RGBA' and image.size == (256, 256), str(path)
        alpha = image.getchannel('A')
        assert alpha.getbbox() == (0, 0, 256, 256), 'circle must touch every image edge'
        assert ImageChops.difference(alpha, alpha.transpose(Image.Transpose.FLIP_LEFT_RIGHT)).getbbox() is None
        assert ImageChops.difference(alpha, alpha.transpose(Image.Transpose.ROTATE_90)).getbbox() is None
        for x, y in [(0, 0), (255, 0), (0, 255), (255, 255)]:
            assert alpha.getpixel((x, y)) == 0, 'corners must be transparent'
        for y in range(256):
            for x in range(256):
                radius = ((x - 127.5) ** 2 + (y - 127.5) ** 2) ** .5
                if radius < 124:
                    assert alpha.getpixel((x, y)) == 255, 'no transparent holes inside the sphere'
                elif radius > 131:
                    assert alpha.getpixel((x, y)) == 0, 'no external shadows or noise'
        meta = json.loads(path.with_name(path.name + '.meta').read_text())
        assert meta['uuid'] not in uids
        uids.add(meta['uuid'])
        frame = next(s for s in meta['subMetas'].values() if s['importer'] == 'sprite-frame')
        for field in ['width', 'height', 'rawWidth', 'rawHeight']:
            assert frame['userData'][field] == 256
        for field in ['trimX', 'trimY', 'offsetX', 'offsetY']:
            assert frame['userData'][field] == 0
        assert frame['uuid'] == meta['uuid'] + '@f9941'
        hashes.add(hashlib.sha256(image.tobytes()).hexdigest())
        total += path.stat().st_size
        x, y = 110 + col * 205, 12 + row * 255
        thumb = image.resize((184, 184), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y), thumb)
        draw.text((x, y + 188), key, fill='#31445b')
        # Design-size and high-density comparison remains in the same contact sheet.
        small = image.resize((55, 55), Image.Resampling.LANCZOS)
        sheet.paste(small, (x + 105, y + 192), small)
assert len(hashes) == 20, 'each theme/color needs distinct artwork'
scene = json.loads((ROOT / 'assets/games/bubble-shooter/scenes/BubbleShooter.scene').read_text())
assert next(o for o in scene if 'audioSlots' in o)['supportFrame'] is None
assert all(o.get('_spriteFrame') is None for o in scene if o['__type__']=='cc.Sprite'), 'sprites must load through regional bindings'
review = ROOT / 'docs/games/bubble-shooter/references/bubbles-hd-production-review.png'
sheet.save(review, optimize=True)
print(f'20 unique circular 256px RGBA sprites verified, total {total / 1024:.1f} KiB; scene has no eager sprite dependencies.')
print(review)

"""Rebuild after changing the packed head art. Requires Pillow, NumPy and SciPy."""
import plistlib
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


bundle = Path(__file__).resolve().parents[2] / 'assets/game-assets/cube-away'
atlas = bundle / 'visual/mint/snake_heads'
frames = plistlib.loads(atlas.with_suffix('.plist').read_bytes())['frames']
alpha = Image.open(atlas.with_suffix('.png')).convert('RGBA').getchannel('A')
# Each 128px tile spans 1.28 cells. Alpha encodes 0 to 0.25 cells of distance.
# Match the decal sizes in CubeAwaySnakeMesh and trace the same alpha cutoff as the shader.
size, supersample = 128, 4
result = Image.new('RGBA', (size * 2, size), 'white')
for i, (pose, width, height) in enumerate([('side', 78, 64), ('front', 64, 70)]):
    frame = frames['snake_head_' + pose]
    assert not frame['rotated']
    x, y, w, h = map(int, re.findall(r'\d+', frame['frame']))
    art = alpha.crop((x, y, x + w, y + h))
    plane = Image.new('L', (size * supersample, size * supersample))
    plane.paste(art.resize((width * supersample, height * supersample), Image.Resampling.BILINEAR),
                ((size - width) * supersample // 2, (size - height) * supersample // 2))
    outside = np.asarray(plane) < .46 * 255
    distance = np.maximum(0, distance_transform_edt(outside) - .5) / (25 * supersample)
    encoded = Image.fromarray((distance.clip(0, 1) * 255).round().astype('uint8'))
    tile = Image.new('RGBA', (size, size), 'white')
    tile.putalpha(encoded.resize(tile.size, Image.Resampling.BOX))
    result.paste(tile, (i * size, 0))
result.save(bundle / 'materials/snake-head-distance.png', optimize=True)

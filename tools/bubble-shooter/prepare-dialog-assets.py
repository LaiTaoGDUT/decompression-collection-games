"""Authorized local background removal and sizing of approved dialog v2 artwork."""
from pathlib import Path
import importlib.util, json
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reward', Path(__file__).with_name('prepare-reward-assets.py'))
reward = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reward)
source = ROOT / 'docs/games/bubble-shooter/art-source/dialog'
output = ROOT / 'docs/games/bubble-shooter/runtime-source/dialog'
bundle = ROOT / 'assets/game-assets/bubble-shooter/visual/common/dialog-common'
output.mkdir(exist_ok=True); bundle.mkdir(exist_ok=True)
records = {}
for name in ('panel', 'primary', 'secondary'):
    image = Image.open(source / f'{name}-source-v1.png').convert('RGB')
    r, g, b = image.split()
    if name == 'panel':
        # The generated checker is neutral; its continuous pink rim defines the silhouette.
        mask = ImageChops.subtract(r, g).point(lambda v: 255 if v > 12 else 0)
        mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
        mask = reward.fill_holes(mask)
    else:
        mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 40 else 0)
    mask = reward.component(mask, (image.width // 2, image.height // 2))
    mask = reward.fill_holes(mask).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.5))
    image = image.convert('RGBA'); image.putalpha(mask); image = image.crop(mask.getbbox())
    image.thumbnail((504, 632 if name == 'panel' else 120), Image.Resampling.LANCZOS)
    padded = Image.new('RGBA', (image.width + 8, image.height + 8)); padded.alpha_composite(image, (4, 4))
    padded.putdata([(r,g,b,a) if a else (0,0,0,0) for r,g,b,a in padded.get_flattened_data()])
    border = (44,44,44,44) if name == 'panel' else (36,36,36,36)
    filename = f'dialog-{name}.png'
    padded.save(output / filename); padded.save(bundle / filename)
    reward.write_meta(bundle / filename, padded, border)
    records[name] = dict(width=padded.width, height=padded.height, border=border, bytes=(output / filename).stat().st_size)
(output / 'manifest.json').write_text(json.dumps(records, indent=2)+'\n')
print(json.dumps(records, indent=2))

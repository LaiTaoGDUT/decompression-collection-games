"""Crop/resize approved Shark King cutouts, preserving alpha and Cocos UUIDs."""
from pathlib import Path
import json, shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/games/bubble-shooter/art-source/ocean/shark-v6'
DEST = ROOT / 'assets/game-assets/bubble-shooter/visual/regions/ocean'
ARCHIVE = ROOT / 'docs/games/bubble-shooter/runtime-source/ocean/shark-v6'
ARCHIVE.mkdir(parents=True, exist_ok=True)
manifest = {}
for key, maximum in [('body',768),('staff-arm',768),('right-arm',384),('crown',256),('celebration',1024)]:
    source = key+'-rear-grip-raw.png' if key in ('staff-arm','celebration') else key+'-raw.png'
    raw = Image.open(SOURCE / source).convert('RGBA')
    # Generated RGB contains hidden glow, while its alpha already isolates the sprite.
    # Drop only near-invisible alpha noise, retaining antialiased contours.
    raw.putalpha(raw.getchannel('A').point(lambda a: 0 if a < 8 else a))
    bounds = raw.getchannel('A').getbbox()
    im = raw.crop(bounds)
    im.thumbnail((maximum,maximum),Image.Resampling.LANCZOS)
    name = 'reward/celebration' if key == 'celebration' else 'boss/boss-'+key
    target = DEST / (name+'.png')
    im.save(target,optimize=True)
    shutil.copy2(target,ARCHIVE/target.name)
    meta = target.with_suffix('.png.meta')
    data = json.loads(meta.read_text())
    w,h = im.size
    d = data['subMetas']['f9941']['userData']
    d.update(trimX=0,trimY=0,width=w,height=h,rawWidth=w,rawHeight=h,offsetX=0,offsetY=0,packable=False,trimType='custom')
    d['vertices']={'rawPosition':[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0], 'indexes':[0,1,2,2,1,3], 'uv':[0,h,w,h,0,0,w,0], 'nuv':[0,0,1,0,0,1,1,1], 'minPos':[-w/2,-h/2,0], 'maxPos':[w/2,h/2,0]}
    meta.write_text(json.dumps(data,indent=2)+'\n')
    manifest[key]={'source':source,'crop':list(bounds),'sourceSize':list(raw.size),'size':[w,h]}
    print(key,manifest[key])
(ARCHIVE/'layers.json').write_text(json.dumps(manifest,indent=2)+'\n')

"""Crop/resize the approved water divider, preserving its alpha and Cocos UUID."""
from pathlib import Path
import json
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'docs/games/bubble-shooter/art-source/ocean/water-divider-v3/raw.png'
target=ROOT/'assets/game-assets/bubble-shooter/visual/regions/ocean/backgrounds/reef.png'
im=Image.open(source).convert('RGBA')
assert im.getchannel('A').getextrema()[0]==0, 'Expected transparent sprite'
im.putalpha(im.getchannel('A').point(lambda a: 0 if a<8 else a))
bounds=im.getchannel('A').getbbox()
im=im.crop(bounds)
im=im.resize((1024,round(im.height*1024/im.width)),Image.Resampling.LANCZOS)
im.save(target,optimize=True)
meta=target.with_suffix('.png.meta');data=json.loads(meta.read_text())
u=data['subMetas']['f9941']['userData']
u.update(width=im.width,height=im.height,rawWidth=im.width,rawHeight=im.height,trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='custom',packable=False)
u.pop('vertices',None)
meta.write_text(json.dumps(data,indent=2)+'\n')
(source.parent/'processing.json').write_text(json.dumps({'crop':bounds,'size':im.size,'target':str(target.relative_to(ROOT))},indent=2)+'\n')
print(im.size)

"""Authorized chroma-key / crop / resize; retain approved illustration and lettering."""
from pathlib import Path
import shutil, json, uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'docs/games/bubble-shooter/art-source/ocean/reward/celebration-green.png'
im=Image.open(source).convert('RGBA');pixels=[]
for r,g,b,original_alpha in im.getdata():
    dominance=g-max(r,b)
    a=1 if dominance<30 else max(0, min(1, (210-dominance)/180))
    if a<.015: pixels.append((0,0,0,0));continue
    if a<1:
        r=min(255,round(r/a));b=min(255,round(b/a));g=max(0,min(255,round((g-255*(1-a))/a)))
    pixels.append((r,g,b,round(a*original_alpha)))
im.putdata(pixels);im=im.crop(im.getchannel('A').getbbox());im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
outputs=[('reward/celebration',im)]
for name,image in outputs:
    target=ROOT/f'assets/game-assets/bubble-shooter/visual/regions/ocean/{name}.png';target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
    archive=ROOT/f'docs/games/bubble-shooter/runtime-source/ocean/{name}.png';archive.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,archive)
    template=ROOT/'assets/game-assets/bubble-shooter/visual/regions/ocean/boss/boss-right-arm.png.meta'
    data=json.loads(template.read_text());old=data['uuid'];meta=target.with_suffix('.png.meta');uid=json.loads(meta.read_text())['uuid'] if meta.exists() else str(uuid.uuid4())
    data=json.loads(json.dumps(data).replace(old,uid).replace('boss-right-arm',target.stem));w,h=image.size
    d=data['subMetas']['f9941']['userData'];d.update(trimX=0,trimY=0,width=w,height=h,rawWidth=w,rawHeight=h,offsetX=0,offsetY=0,packable=False,trimType='custom')
    d['vertices']={'rawPosition':[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0], 'indexes':[0,1,2,2,1,3], 'uv':[0,h,w,h,0,0,w,0], 'nuv':[0,0,1,0,0,1,1,1], 'minPos':[-w/2,-h/2,0], 'maxPos':[w/2,h/2,0]}
    meta.write_text(json.dumps(data,indent=2)+'\n');print(name,image.size)

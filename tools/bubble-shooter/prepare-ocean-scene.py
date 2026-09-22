"""Crop/resize approved cutouts, preserve aspect and alpha, create stable Cocos metadata."""
from pathlib import Path
from PIL import Image,ImageFilter,ImageChops
import json,uuid
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'docs/games/bubble-shooter/art-source/ocean/scene'
DEST=ROOT/'assets/game-assets/bubble-shooter/visual/regions/ocean'
JOBS={'background':('backgrounds/background',750),'reef':('backgrounds/reef',1024),'turret':('launcher/turret',384),'base':('launcher/base',384),'pause':('hud/pause',128),'down':('hud/down',128),'swap':('hud/swap',128),'item-base':('hud/item-base',192)}
template=json.loads((DEST.parent/'cloud/backgrounds/cloud-transition.png.meta').read_text())
JOBS.update({'health-track':('hud/health-track',768),'health-fill':('hud/health-fill',768)})
report=[]
for key,(relative,width) in JOBS.items():
 image=Image.open(SOURCE/(key+'.png')).convert('RGBA')
 if key=='background':
  image=image.resize((750,1800),Image.Resampling.LANCZOS);bounds=None
 else:
  alpha=image.getchannel('A');assert alpha.getextrema()[0]==0,f'{key}: no transparency'
  if key in ('base','health-fill','health-track'):
   # This source contains translucent background glow; isolate opaque object and feather only its perimeter.
   mask=alpha.point(lambda a:255 if a>=220 else 0).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1))
   image.putalpha(ImageChops.multiply(alpha,mask))
  else:image.putalpha(alpha.point(lambda a:0 if a<8 else a))
  bounds=image.getchannel('A').getbbox();image=image.crop(bounds)
  image=image.resize((width,round(width*image.height/image.width)),Image.Resampling.LANCZOS)
 target=DEST/(relative+'.png');target.parent.mkdir(parents=True,exist_ok=True)
 foldermeta=target.parent.with_name(target.parent.name+'.meta')
 if not foldermeta.exists():foldermeta.write_text(json.dumps({'ver':'1.2.0','importer':'directory','imported':True,'uuid':str(uuid.uuid4()),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
 image.save(target,optimize=True)
 path=target.with_name(target.name+'.meta')
 data=json.loads(path.read_text()) if path.exists() else json.loads(json.dumps(template).replace(template['uuid'],str(uuid.uuid4())))
 for sub in data['subMetas'].values():
  sub['displayName']=target.stem
  if sub['importer']=='texture':sub['userData'].update(wrapModeS='clamp-to-edge',wrapModeT='clamp-to-edge')
  if sub['importer']=='sprite-frame':
   sub['userData'].update(width=image.width,height=image.height,rawWidth=image.width,rawHeight=image.height,trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='custom',rotated=False)
   sub['userData'].pop('vertices',None)
   if key.startswith('health-'):
    sub['userData'].update(borderLeft=image.height//2,borderRight=image.height//2,borderTop=0,borderBottom=0)
 path.write_text(json.dumps(data,indent=2)+'\n');report.append({'key':key,'crop':bounds,'size':image.size,'bytes':target.stat().st_size})
(SOURCE/'processing.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

"""Normalize approved imagegen cloud cutouts; preserve artwork and feathered alpha."""
import json, shutil, uuid
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'docs/games/bubble-shooter/art-source/cloud-foreground'
DEST=ROOT/'assets/game-assets/bubble-shooter/visual/regions/cloud/foreground'
SOURCE.mkdir(parents=True,exist_ok=True);DEST.mkdir(parents=True,exist_ok=True)
meta=DEST.with_name(DEST.name+'.meta')
if not meta.exists():meta.write_text(json.dumps({'ver':'1.2.0','importer':'directory','imported':True,'uuid':str(uuid.uuid4()),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
template=json.loads((DEST.parent/'backgrounds/cloud-transition.png.meta').read_text())
refs=[];report=[]
for key in ['a','b','c']:
 source=SOURCE/f'cloud-{key}.png';image=Image.open(source).convert('RGBA');alpha=image.getchannel('A')
 assert alpha.getextrema()[0]==0,'source must contain real transparency'
 # Remove barely visible background speckles only. Retain all soft visible edges.
 image.putalpha(alpha.point(lambda a:0 if a<5 else a))
 bounds=image.getchannel('A').getbbox();image=image.crop(bounds)
 image.thumbnail((496,496),Image.Resampling.LANCZOS)
 result=Image.new('RGBA',(image.width+16,image.height+16));result.paste(image,(8,8))
 target=DEST/f'cloud-{key}.png';result.save(target,optimize=True)
 path=target.with_name(target.name+'.meta');data=json.loads(path.read_text()) if path.exists() else json.loads(json.dumps(template).replace(template['uuid'],str(uuid.uuid4())))
 for sub in data['subMetas'].values():
  sub['displayName']=target.stem
  if sub['importer']=='texture':sub['userData'].update(wrapModeS='clamp-to-edge',wrapModeT='clamp-to-edge')
  if sub['importer']=='sprite-frame':
   sub['userData'].update(width=result.width,height=result.height,rawWidth=result.width,rawHeight=result.height,trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='custom',rotated=False)
   sub['userData'].pop('vertices',None)
 path.write_text(json.dumps(data,indent=2)+'\n')
 refs.append({'__uuid__':data['uuid']+'@f9941','__expectedType__':'cc.SpriteFrame'})
 report.append({'key':key,'crop':bounds,'size':result.size,'bytes':target.stat().st_size})
scene_path=ROOT/'assets/games/bubble-shooter/scenes/BubbleShooter.scene';scene=json.loads(scene_path.read_text())
next(o for o in scene if 'audioSlots' in o)['foregroundFrames']=[]
scene_path.write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n')
(SOURCE/'processing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report));print('Three foreground SpriteFrames prepared for regional loading.')

"""Process the approved world-v1 artwork: alpha/crop/size only, stable Cocos UUIDs."""
from pathlib import Path
import json, uuid, runpy
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'docs/games/bubble-shooter/art-source/ocean/world-v1'
DEST = ROOT/'assets/game-assets/bubble-shooter/visual/regions/ocean'
ARCHIVE = ROOT/'docs/games/bubble-shooter/runtime-source/ocean/world-v1'
ARCHIVE.mkdir(parents=True, exist_ok=True)
round_sprite = runpy.run_path(str(ROOT/'tools/bubble-shooter/prepare-themed-bubbles.py'))['round_sprite']
jobs = {k:('bubbles/bubble-'+k,256) for k in ['red','yellow','blue','purple','support']}
jobs.update({'background':('backgrounds/background',750),'reef':('backgrounds/reef',1024),
    'turret':('launcher/turret',384),'base':('launcher/base',384),'pause':('hud/pause',128),
    'down':('hud/down',128),'swap':('hud/swap',128),'item-base':('hud/item-base',192),
    'fish':('decoration/fish',256),'seaweed':('decoration/seaweed',256),
    'water-bubbles':('foreground/water-bubbles',384),'water-current':('foreground/water-current',512)})
template=json.loads((DEST/'launcher/turret.png.meta').read_text())
report=[]
for key,(name,width) in jobs.items():
    source=SOURCE/(key+'.png')
    if name.startswith('bubbles/'):
        im,bounds=round_sprite(source)
    else:
        im=Image.open(source).convert('RGBA')
        if key=='background':
            im=ImageOps.fit(im,(750,1800),method=Image.Resampling.LANCZOS);bounds=None
        else:
            alpha=im.getchannel('A');assert alpha.getextrema()[0]==0,key+' missing transparency'
            im.putalpha(alpha.point(lambda a:0 if a<8 else a))
            bounds=im.getchannel('A').getbbox();im=im.crop(bounds)
            im=im.resize((width,round(width*im.height/im.width)),Image.Resampling.LANCZOS)
    target=DEST/(name+'.png');target.parent.mkdir(parents=True,exist_ok=True)
    foldermeta=target.parent.with_name(target.parent.name+'.meta')
    if not foldermeta.exists():foldermeta.write_text(json.dumps({'ver':'1.2.0','importer':'directory','imported':True,'uuid':str(uuid.uuid4()),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
    im.save(target,optimize=True)
    archive=ARCHIVE/(name+'.png');archive.parent.mkdir(parents=True,exist_ok=True);im.save(archive,optimize=True)
    meta=target.with_suffix('.png.meta')
    data=json.loads(meta.read_text()) if meta.exists() else json.loads(json.dumps(template).replace(template['uuid'],str(uuid.uuid4())))
    for sub in data['subMetas'].values():
        sub['displayName']=target.stem
        if sub['importer']=='texture':sub['userData'].update(wrapModeS='clamp-to-edge',wrapModeT='clamp-to-edge')
        if sub['importer']=='sprite-frame':
            sub['userData'].update(width=im.width,height=im.height,rawWidth=im.width,rawHeight=im.height,trimX=0,trimY=0,offsetX=0,offsetY=0,trimType='custom',rotated=False,borderLeft=0,borderRight=0,borderTop=0,borderBottom=0,packable=name.startswith('bubbles/'))
            sub['userData'].pop('vertices',None)
    meta.write_text(json.dumps(data,indent=2)+'\n')
    report.append({'key':key,'crop':bounds,'size':im.size,'bytes':target.stat().st_size})
(SOURCE/'processing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

# The approved water divider supersedes the original carved reef.
runpy.run_path(str(ROOT/'tools/bubble-shooter/prepare-ocean-water-divider.py'))

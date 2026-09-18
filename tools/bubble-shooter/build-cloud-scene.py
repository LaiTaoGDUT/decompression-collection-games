"""Build the approved cloud interface with native Cocos nodes and SpriteFrames.
Run once on the entry skeleton; refuses to overwrite an already populated scene.
No raster pixels are generated or modified.
"""
import copy
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / 'assets/games/bubble-shooter/scenes/BubbleShooter.scene'
ASSETS = ROOT / 'assets/game-assets/bubble-shooter/visual'
objects = json.loads(SCENE.read_text())
assert not objects[3]['_children'], 'Scene already populated; edit existing nodes in Cocos.'
node_template = copy.deepcopy(objects[3])
transform_template = copy.deepcopy(objects[4])
sprite_template = next(x for x in json.loads((ROOT / 'assets/games/chess-endless/scenes/ChessEndless.scene').read_text()) if x['__type__'] == 'cc.Sprite')
label_template = next(x for x in json.loads((ROOT / 'assets/games/chess-endless/scenes/ChessEndless.scene').read_text()) if x['__type__'] == 'cc.Label')

def add_component(node_id, template):
    obj = copy.deepcopy(template)
    obj['node'] = {'__id__': node_id}
    obj['_id'] = str(uuid.uuid4())
    idx = len(objects)
    objects.append(obj)
    objects[node_id]['_components'].append({'__id__': idx})
    return obj

def node(name, parent, x=0, y=0, width=750, height=1140, anchor=(.5,.5)):
    obj = copy.deepcopy(node_template)
    obj.update(_name=name, _id=str(uuid.uuid4()), _children=[], _components=[], _parent={'__id__':parent})
    obj['_lpos'].update(x=x,y=y,z=0)
    idx=len(objects)
    objects.append(obj)
    objects[parent]['_children'].append({'__id__':idx})
    tr=add_component(idx,transform_template)
    tr['_contentSize'].update(width=width,height=height)
    tr['_anchorPoint'].update(x=anchor[0],y=anchor[1])
    return idx

def sprite(name,parent,path,x,y,width,height,anchor=(.5,.5),sliced=False):
    idx=node(name,parent,x,y,width,height,anchor)
    meta=json.loads((ASSETS/(path+'.png.meta')).read_text())
    frame=next(v for v in meta['subMetas'].values() if v['importer']=='sprite-frame')
    sp=add_component(idx,sprite_template)
    sp.update(_spriteFrame={'__uuid__':frame['uuid'],'__expectedType__':'cc.SpriteFrame'},_type=1 if sliced else 0,_sizeMode=0,_isTrimmedMode=False)
    return idx

def label(name,parent,text,x,y,size=24):
    idx=node(name,parent,x,y,140,40)
    lb=add_component(idx,label_template)
    lb.update(_string=text,_fontSize=size,_lineHeight=size+5,_actualFontSize=size,_overflow=1)
    lb['_color'].update(r=99,g=48,b=99,a=255)
    return idx

bg=sprite('Background',3,'backgrounds/background',0,0,750,1800)
env=node('Environment',3)
sprite('IslandLeft',env,'backgrounds/island-left',-235,535,280,280)
sprite('IslandRight',env,'backgrounds/island-right',235,535,280,280)
sprite('Foreground',3,'backgrounds/foreground-bottom',0,-667,750,320,(.5,0))
play=node('Playfield',3)
# This is a visual fixture, not a generated round or balance configuration.
counter=node('Counter',play,0,478,200,48)
sprite('DownArrow',counter,'hud/hud-down-arrow',-72,0,42,42)
sprite('PendingRow',counter,'hud/hud-insert-row',-126,0,42,42)
skill=sprite('BossSkill',counter,'hud/hud-frosting-skill',-126,0,36,40)
objects[skill]['_active']=False
for i in range(3):
    sprite('Slot'+str(i),counter,'hud/hud-counter-slot-empty',-24+i*42,0,34,34)
    if i<2:sprite('Bead'+str(i),counter,'hud/hud-counter-bead',-24+i*42,0,24,24)
board=node('Board',play)
colors=['red','yellow','blue','purple']
for row in range(6):
    count=10-row%2
    for col in range(count):
        x=(col-(count-1)/2)*72
        y=410-row*72*(3**.5)/2
        ball=sprite(f'Bubble-{row}-{col}',board,'bubbles/bubble-'+colors[(row*3+col)%4],x,y,72,72)
        if (row,col) in {(0,1),(1,6),(2,8),(5,5)}:
            sprite('Frosting',ball,'bubbles/frosting-overlay',0,0,72,72)
node('AimFeedback',play)
node('DangerLine',play,0,-210,720,4)
launcher=node('Launcher',play,0,-408,260,170)
sprite('Pedestal',launcher,'launcher/launcher-pedestal',0,0,192,128,(.5,.125))
pivot=node('TurretPivot',launcher,0,42,96,160,(.5,.1))
sprite('CurrentBall',pivot,'bubbles/bubble-red',0,72,72,72)
sprite('TurretArtwork',pivot,'launcher/launcher-turret',0,0,96,160,(.5,.1))
sprite('NextBall',launcher,'bubbles/bubble-blue',150,65,64,64)
sprite('Swap',launcher,'launcher/swap-icon',102,78,44,44)
items=node('Items',play,0,-506,620,128)
for i,(key,text) in enumerate([('bomb','炸弹球'),('wildcard','万能球'),('clear-bottom','清底')]):
    base=sprite('Item-'+key,items,'items/item-button-base',(i-1)*205,0,144,130)
    sprite('Icon',base,'items/item-'+key,0,22,80,80)
    label('Name',base,text,0,-39,23)
    sprite('Badge',base,'items/item-count-badge',54,52,36,36)
    label('Count',base,'1',54,52,22)
node('Vfx',play)
pause=sprite('Pause',3,'hud/hud-pause-button',-327,610,64,64)
# Hidden authoring group for reviewing the approved boss composition.
boss=node('Boss',play,0,430,720,310)
objects[boss]['_active']=False
sprite('Body',boss,'boss/boss-pudding-body',0,30,570,285,(.5,.06))
sprite('LeftFist',boss,'boss/boss-pudding-fist-left',-200,110,190,158,(.90,.52))
sprite('RightFist',boss,'boss/boss-pudding-fist-right',200,110,190,158,(.10,.52))
sprite('Crown',boss,'boss/boss-pudding-crown',0,240,128,102,(.5,.08))
# Scale complete nine-slice nodes uniformly; corner width is defined in texture pixels.
for name,path,width,height in [('HealthTrack','track',850,96),('HealthFill','fill',810,64)]:
    bar=sprite(name,boss,'hud/hud-boss-health-'+path,0,0,width,height,sliced=True)
    objects[bar]['_lscale'].update(x=.5,y=.5)
SCENE.write_text(json.dumps(objects,ensure_ascii=False,indent=2)+'\n')
print(f'Built {sum(o["__type__"]=="cc.Node" for o in objects)} scene nodes.')

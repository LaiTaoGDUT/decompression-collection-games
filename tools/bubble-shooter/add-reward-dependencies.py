"""One-time addition of serialized reward SpriteFrame dependencies; keeps source scene nodes intact."""
import json,copy,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=ROOT / Path('assets/games/bubble-shooter/scenes/BubbleShooter.scene');a=json.loads(p.read_text());root=next(i for i,x in enumerate(a) if x.get('_name')=='GameRoot' and x.get('__type__')=='cc.Node')
if any(x.get('_name')=='RewardAssets' for x in a):raise SystemExit('already present')
nt=copy.deepcopy(a[root]);tr=next(x for x in a if x.get('__type__')=='cc.UITransform');sp=next(x for x in a if x.get('__type__')=='cc.Sprite')
def node(name,parent):
 n=copy.deepcopy(nt);i=len(a);n.update(_name=name,_id=str(uuid.uuid4()),_children=[],_components=[],_parent={'__id__':parent},_active=False);n['_lpos'].update(x=0,y=0,z=0);a.append(n);a[parent]['_children'].append({'__id__':i});return i
def comp(i,t):
 c=copy.deepcopy(t);c.update(node={'__id__':i},_id=str(uuid.uuid4()));j=len(a);a.append(c);a[i]['_components'].append({'__id__':j});return c
r=node('RewardAssets',root)
for key in ['panel','card','button','selection','check','subtitle','cloud-title','attack-heart']:
 folder='reward-cloud' if key=='cloud-title' else 'reward-common';asset_path = 'vfx/attack-energy-heart' if key == 'attack-heart' else folder+'/reward-'+key; m=json.loads((ROOT / Path('assets/game-assets/bubble-shooter/visual/'+asset_path+'.png.meta')).read_text());i=node(key,r);c=comp(i,tr);c['_contentSize'].update(width=10,height=10);c=comp(i,sp);c['_spriteFrame']={'__uuid__':m['subMetas']['f9941']['uuid'],'__expectedType__':'cc.SpriteFrame'}
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')

from pathlib import Path
from PIL import Image
import json,uuid,copy
root=Path('assets/game-assets/bubble-shooter/visual/regions/cloud/items');source=root/'item-button-base.png';im=Image.open(source);print(im.size)
# Crop the existing approved name plaque, no new visual style.
im.crop((58,210,262,283)).save(root/'item-name-plate.png')
target=root/'item-name-plate.png.meta';template=json.loads((root/'item-button-base.png.meta').read_text());uid=json.loads(target.read_text())['uuid'] if target.exists() else str(uuid.uuid4());old=template['uuid'];m=json.loads(json.dumps(template).replace(old,uid).replace('item-button-base','item-name-plate'))
d=m['subMetas']['f9941']['userData'];w,h=204,73;d.update(trimX=0,trimY=0,width=w,height=h,rawWidth=w,rawHeight=h,offsetX=0,offsetY=0,trimType='custom',borderLeft=35,borderRight=35,borderTop=25,borderBottom=25)
d.pop('vertices',None);target.write_text(json.dumps(m,indent=2)+'\n')
p=Path('assets/games/bubble-shooter/scenes/BubbleShooter.scene');s=json.loads(p.read_text())
for parent in [268,283,298]:
 if any(s[n['__id__']].get('_name')=='NamePlate' for n in s[parent]['_children']):continue
 start=len(s);node=copy.deepcopy(s[271]);ui=copy.deepcopy(s[272]);sprite=copy.deepcopy(s[273]);node['_name']='NamePlate';node['_parent']={'__id__':parent};node['_components']=[{'__id__':start+1},{'__id__':start+2}];node['_lpos']['y']=-44;node['_id']=str(uuid.uuid4());ui['node']={'__id__':start};ui['_contentSize'].update(width=144,height=48);sprite['node']={'__id__':start};sprite['_spriteFrame']['__uuid__']=uid+'@f9941';sprite['_type']=1
 s.extend([node,ui,sprite]);s[parent]['_children'].insert(1,{'__id__':start})
p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')

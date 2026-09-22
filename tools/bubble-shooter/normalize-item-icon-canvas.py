"""Keep approved artwork, resize only inside a shared transparent canvas. Idempotent."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[2]
assets=root/'assets/game-assets/bubble-shooter/visual/common/items'
source=root/'docs/games/bubble-shooter/art-source/cloud/item-icon-sizing'
source.mkdir(parents=True,exist_ok=True)
for key,extent in [('bomb',192),('wildcard',160),('clear-bottom',160)]:
    target=assets/f'item-{key}.png';original=source/target.name
    if not original.exists(): original.write_bytes(target.read_bytes())
    im=Image.open(original).convert('RGBA').resize((extent,extent),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(192,192));canvas.alpha_composite(im,((192-extent)//2,(192-extent)//2));canvas.save(target)
    meta=Path(str(target)+'.meta');data=json.loads(meta.read_text());frame=data['subMetas']['f9941']['userData']
    frame.update(trimType='custom',trimX=0,trimY=0,width=192,height=192,rawWidth=192,rawHeight=192,offsetX=0,offsetY=0)
    frame.pop('vertices',None);meta.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

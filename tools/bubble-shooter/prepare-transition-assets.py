"""User-authorized chroma key, crop and resize of approved transition artwork."""
from pathlib import Path
from PIL import Image, ImageFilter
import shutil
ROOT=Path(__file__).resolve().parents[2]
for name,source,width in [('boss-alert','boss-alert-green',1024),('cloud-curtain','cloud-curtain-green',512)]:
 im=Image.open(ROOT/f'docs/games/bubble-shooter/art-source/transition/{source}.png').convert('RGB')
 rgba=[]
 for r,g,b in im.getdata():
  dominance=g-max(r,b)
  a=1 if dominance<10 else max(0,min(1,1-dominance/255))
  if a<.015:rgba.append((255,255,255,0));continue
  # Undo the green matte in partially covered edge pixels, not just the alpha channel.
  rr=min(255,round(r/a));bb=min(255,round(b/a));gg=max(0,min(255,round((g-255*(1-a))/a)))
  rgba.append((rr,min(gg,max(rr,bb)+2),bb,round(a*255)))
 out=Image.new('RGBA',im.size);out.putdata(rgba)
 if name=='cloud-curtain':
  # Neutralize the narrow matte fringe around white clouds; keep interior shading untouched.
  edge=out.getchannel('A').filter(ImageFilter.MinFilter(11));clean=[]
  for (r,g,b,a),near in zip(out.getdata(),edge.getdata()):
   tone=max(235,r,g,b)
   clean.append((tone,tone,tone,a) if a and near<255 else (r,g,b,a))
  out.putdata(clean)
 if name=='boss-alert':out=out.crop(out.getchannel('A').getbbox())
 out=out.resize((width,round(out.height*width/out.width)),Image.Resampling.LANCZOS)
 dest=ROOT/f'assets/game-assets/bubble-shooter/visual/common/transition/{name}.png';out.save(dest)
 shutil.copy2(dest,ROOT/f'docs/games/bubble-shooter/runtime-source/transition/{name}.png')
 print(name,out.size,out.getchannel('A').getextrema())
 if name=='cloud-curtain':
  alpha=out.getchannel('A');prefix=min(next((x for x in range(out.width) if alpha.getpixel((x,y))<254),out.width) for y in range(out.height))
  print('minimum fully opaque prefix:',prefix/out.width)

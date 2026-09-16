"""Matte the approved cloud strip; user authorized local transparency/size processing."""
from pathlib import Path
import shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'docs/games/bubble-shooter/art-source/cloud/cloud-transition-green-v1.png'
im=Image.open(source).convert('RGB')
pixels=[]
for r,g,b in im.getdata():
    a=max(0,min(1,(90-(g-max(r,b)))/70))
    pixels.append((r,min(g,max(r,b)+10),b,round(a*255)))
out=Image.new('RGBA',im.size);out.putdata(pixels)
box=out.getchannel('A').getbbox();top,bottom=box[1],box[3]
data=[]
for i,(r,g,b,a) in enumerate(pixels):
    f=max(0,min(1,(bottom-i//im.width)/100));f=f*f*(3-2*f)
    data.append((r,g,b,round(a*f)))
out.putdata(data)
out=out.crop((0,max(0,top-6),im.width,bottom+3))
out=out.resize((1024,round(out.height*1024/out.width)),Image.Resampling.LANCZOS)
dest=ROOT/'assets/game-assets/bubble-shooter/visual/regions/cloud/backgrounds/cloud-transition.png';out.save(dest)
shutil.copy2(dest,ROOT/'docs/games/bubble-shooter/runtime-source/cloud/cloud-transition.png')
print(out.size,out.getchannel('A').getextrema())

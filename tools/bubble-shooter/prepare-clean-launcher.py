"""Authorized alpha cleanup and size normalization of imagegen's stem-free head."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageFilter
import shutil
root=Path(__file__).resolve().parents[2]
im=Image.open(root/'docs/games/bubble-shooter/art-source/cloud/launcher-clean/head-raw.png').convert('RGBA')
w,h=im.size;a=bytearray(im.getchannel('A').tobytes());seen=bytearray(w*h);largest=[]
for i in range(w*h):
 if seen[i] or a[i]<80:continue
 q=deque([i]);seen[i]=1;part=[]
 while q:
  j=q.popleft();part.append(j);x,y=j%w,j//w
  for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if 0<=nx<w and 0<=ny<h:
    k=ny*w+nx
    if not seen[k] and a[k]>=80:seen[k]=1;q.append(k)
 if len(part)>len(largest):largest=part
alpha=bytearray(w*h)
for i in largest:alpha[i]=a[i]
im.putalpha(Image.frombytes('L',im.size,bytes(alpha)).filter(ImageFilter.MinFilter(3)))
im=im.crop(im.getchannel('A').getbbox());im.thumbnail((180,220),Image.Resampling.LANCZOS)
out=Image.new('RGBA',(192,236));out.alpha_composite(im,((192-im.width)//2,8))
dest=root/'assets/game-assets/bubble-shooter/visual/regions/cloud/launcher/launcher-head.png';out.save(dest)
shutil.copy2(dest,root/'docs/games/bubble-shooter/runtime-source/cloud/launcher-head.png')
print(out.size,out.getchannel('A').getbbox())

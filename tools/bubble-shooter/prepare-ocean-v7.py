"""Crop, remove generated background, and resize approved v7 Boss layers.

Coordinates seed enclosed background only in the frozen raw images.
Original v8 files are historical and never overwritten by this script.
"""
from collections import deque
from pathlib import Path
import json
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/games/bubble-shooter/art-source/ocean/v7'
DEST = ROOT / 'docs/games/bubble-shooter/runtime-source/ocean/v7'
DEST.mkdir(parents=True, exist_ok=True)


def remove_background(image, seeds, protected=()):
    if image.mode == 'RGBA' and image.getchannel('A').getextrema()[0] == 0:
        return image.copy()
    image = image.convert('RGBA')
    w, h = image.size
    pixels = image.load()
    seen = bytearray(w * h)
    queue = deque()
    def enqueue(x, y):
        i = y * w + x
        if seen[i]:
            return
        seen[i] = 1
        if any(((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1 for cx,cy,rx,ry in protected):
            return
        r, g, b, _ = pixels[x, y]
        if min(r, g, b) > 145 and max(r, g, b) - min(r, g, b) < 28:
            queue.append((x, y))
    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)
    for x, y in seeds:
        enqueue(x, y)
    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x-1,y), (x+1,y), (x,y-1), (x,y+1)):
            if 0 <= nx < w and 0 <= ny < h:
                enqueue(nx, ny)
    return image

def keep_largest_shape(image):
    # Tool-generated alpha may contain detached dust. Keep the connected sprite.
    w, h = image.size
    alpha = bytearray(image.getchannel('A').tobytes())
    seen = bytearray(w * h)
    largest = []
    for start in range(w * h):
        if seen[start] or alpha[start] < 24:
            continue
        seen[start] = 1
        queue = deque([start])
        component = []
        while queue:
            i = queue.popleft()
            component.append(i)
            x, y = i % w, i // w
            for nx, ny in ((x-1,y), (x+1,y), (x,y-1), (x,y+1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and alpha[j] >= 24:
                        seen[j] = 1
                        queue.append(j)
        if len(component) > len(largest):
            largest = component
    cleaned = bytearray(w * h)
    for i in largest:
        cleaned[i] = alpha[i]
    image.putalpha(Image.frombytes('L', image.size, bytes(cleaned)))
    return image

manifest = {}
for name, maximum, seeds in (
    ('boss-body', 768, [(1080,700), (990,1100)]),
    ('boss-staff-arm', 768, [(400,630)]),
    ('boss-right-arm', 384, []),
    ('boss-grab-arm', 512, []),
    ('boss-crown', 384, []),
):
    source = SOURCE / f'{name}-raw.png'
    raw = Image.open(source)
    # White pearls touch pale background along antialiased edges; retain their interiors.
    protected = [(244,663,64,82), (1170,798,48,76)] if name == 'boss-crown' else []
    image = remove_background(raw, seeds, protected)
    image.putalpha(image.getchannel('A').filter(ImageFilter.MinFilter(3)))
    image = keep_largest_shape(image)
    bounds = image.getchannel('A').getbbox()
    image = image.crop(bounds)
    image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    image.save(DEST / f'{name}.png', optimize=True)
    manifest[name] = {'source':str(source.relative_to(ROOT)), 'sourceSize':list(raw.size),
        'crop':list(bounds), 'size':list(image.size), 'status':'pending-assembly'}
    print(name, image.size, image.getchannel('A').getextrema())
(DEST / 'layers.json').write_text(json.dumps(manifest, indent=2) + '\n')

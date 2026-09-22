"""Prepare the approved insert-row HUD artwork and attach it to the Counter node."""
from collections import deque
from pathlib import Path
import copy
import json
import uuid

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GENERATED = Path(
    "/Users/laitao/.codex-a/generated_images/01a0a964-7105-79b1-bc59-5c9ea29062a4/"
    "exec-9bde68bf-3586-4258-b320-7ed213a99eda.png"
)
SOURCE_DIR = ROOT / "docs/games/bubble-shooter/art-source/cloud/hud"
ASSET_DIR = ROOT / "assets/game-assets/bubble-shooter/visual/common/hud"
SOURCE = SOURCE_DIR / "hud-insert-row-v2-raw.png"
TARGET = ASSET_DIR / "hud-insert-row.png"


def clean_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = alpha.size
    mask = alpha.load()
    seen = set()
    keep = set()
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or mask[x, y] < 8:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            component = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and mask[nx, ny] >= 8:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            if len(component) >= 100:
                keep.update(component)
    if not keep:
        return rgba
    cleaned = Image.new("RGBA", rgba.size)
    source_pixels = rgba.load()
    output_pixels = cleaned.load()
    for x, y in keep:
        output_pixels[x, y] = source_pixels[x, y]
    return cleaned


def make_meta(target: Path, name: str, uid: str) -> None:
    template = json.loads((ASSET_DIR / "hud-down-arrow.png.meta").read_text())
    old_uid = template["uuid"]
    data = json.loads(json.dumps(template).replace(old_uid, uid).replace("hud-down-arrow", name))
    frame = next(value["userData"] for value in data["subMetas"].values() if value["importer"] == "sprite-frame")
    frame.update(trimX=6, trimY=6, width=116, height=116, rawWidth=128, rawHeight=128,
                 offsetX=0, offsetY=0, trimType="custom", borderTop=0, borderBottom=0,
                 borderLeft=0, borderRight=0)
    frame.pop("vertices", None)
    target.with_name(target.name + ".meta").write_text(json.dumps(data, indent=2) + "\n")


def attach_scene(uid: str) -> None:
    scene_path = ROOT / "assets/games/bubble-shooter/scenes/BubbleShooter.scene"
    scene = json.loads(scene_path.read_text())
    counter_id = next(index for index, node in enumerate(scene) if node.get("_name") == "Counter")
    counter = scene[counter_id]
    if any(scene[child["__id__"]].get("_name") == "PendingRow" for child in counter["_children"]):
        return
    down_id = next(child["__id__"] for child in counter["_children"] if scene[child["__id__"]].get("_name") == "DownArrow")
    down = scene[down_id]
    down_transform = scene[down["_components"][0]["__id__"]]
    down_sprite = scene[down["_components"][1]["__id__"]]
    node_id = len(scene)
    transform_id = node_id + 1
    sprite_id = node_id + 2
    node = copy.deepcopy(down)
    node["_name"] = "PendingRow"
    node["_id"] = str(uuid.uuid4())
    node["_components"] = [{"__id__": transform_id}, {"__id__": sprite_id}]
    node["_lpos"] = {"__type__": "cc.Vec3", "x": -126, "y": 0, "z": 0}
    transform = copy.deepcopy(down_transform)
    transform["node"] = {"__id__": node_id}
    transform["_id"] = str(uuid.uuid4())
    transform["_contentSize"] = {"__type__": "cc.Size", "width": 42, "height": 42}
    sprite = copy.deepcopy(down_sprite)
    sprite["node"] = {"__id__": node_id}
    sprite["_id"] = str(uuid.uuid4())
    sprite["_spriteFrame"] = None  # Runtime SceneBindings resolves the common icon.
    scene.extend([node, transform, sprite])
    counter["_children"].append({"__id__": node_id})
    scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    if not GENERATED.exists():
        raise FileNotFoundError(GENERATED)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE.write_bytes(GENERATED.read_bytes())
    cleaned = clean_alpha(Image.open(GENERATED))
    bbox = cleaned.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Approved insert-row image has no visible pixels")
    cropped = cleaned.crop(bbox)
    cropped.thumbnail((116, 116), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (128, 128))
    canvas.alpha_composite(cropped, ((128 - cropped.width) // 2, (128 - cropped.height) // 2))
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(TARGET)
    uid = str(uuid.uuid4())
    make_meta(TARGET, "hud-insert-row", uid)
    attach_scene(uid)
    print(f"prepared {TARGET} with uuid {uid}")


if __name__ == "__main__":
    main()

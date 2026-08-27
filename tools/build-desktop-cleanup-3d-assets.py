"""Build the production low-poly 3D catalog for Desktop Cleanup in Blender.

Run this script inside Blender (the repository uses Blender MCP background mode).
It intentionally creates a fresh scene, writes the editable .blend source, exports
one GLB catalog, and renders a contact sheet used for visual QA.
"""

from __future__ import annotations

import math
import os
import random
import json
from pathlib import Path

import bpy
from mathutils import Matrix


ROOT = Path(os.environ.get("DESKTOP_CLEANUP_REPO", Path(__file__).resolve().parents[1]))
SOURCE_DIR = ROOT / "art_sources" / "桌面大清理" / "3d"
RUNTIME_DIR = ROOT / "assets" / "games" / "catch-3d" / "models"
BLEND_PATH = SOURCE_DIR / "desktop-cleanup-items-v1.blend"
GLB_PATH = RUNTIME_DIR / "desktop-cleanup-items-v1.glb"
BASECOLOR_AO_PATH = RUNTIME_DIR / "desktop-cleanup-clay-basecolor-ao-v1.png"
ROUGHNESS_PATH = RUNTIME_DIR / "desktop-cleanup-clay-roughness-v1.png"
CONTACT_SHEET_PATH = SOURCE_DIR / "desktop-cleanup-items-contact-sheet-v1.png"
COLLIDER_CONFIG_PATH = RUNTIME_DIR / "desktop-cleanup-item-colliders-v1.json"
PROVENANCE_PATH = SOURCE_DIR / "desktop-cleanup-items-v1.provenance.json"

PALETTE = {
    "ink": (0.055, 0.070, 0.105, 1.0),
    "cream": (0.940, 0.835, 0.640, 1.0),
    "white": (0.985, 0.945, 0.835, 1.0),
    "blue": (0.025, 0.185, 0.800, 1.0),
    "sky": (0.055, 0.405, 0.900, 1.0),
    "red": (0.900, 0.055, 0.045, 1.0),
    "coral": (0.900, 0.215, 0.170, 1.0),
    "mint": (0.250, 0.820, 0.620, 1.0),
    "teal": (0.010, 0.600, 0.670, 1.0),
    "yellow": (1.000, 0.590, 0.020, 1.0),
    "gold": (1.000, 0.440, 0.000, 1.0),
    "orange": (1.000, 0.230, 0.025, 1.0),
    "purple": (0.430, 0.075, 0.850, 1.0),
    "wood": (0.520, 0.245, 0.095, 1.0),
    "metal": (0.440, 0.470, 0.520, 1.0),
}

ATLAS_COLUMNS = 4
ATLAS_SIZE = 256
ATLAS_TILE_SIZE = ATLAS_SIZE // ATLAS_COLUMNS
PALETTE_UV_TILES = {
    color_name: (index % ATLAS_COLUMNS, index // ATLAS_COLUMNS)
    for index, color_name in enumerate(PALETTE)
}

# Compound primitives are authored in item-local, center-of-mass space.  The
# same data is stored as non-rendering Blender empties for source inspection and
# emitted as JSON so Cocos can create primitive colliders without MeshCollider.
COLLIDER_SPECS = {
    "blue-pen": [
        {"shape": "box", "center": [0, 0, 0], "size": [0.62, 2.55, 0.62]},
    ],
    "red-pencil": [
        {"shape": "box", "center": [0, 0, 0], "size": [0.60, 2.92, 0.60]},
    ],
    "yellow-eraser": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.24, 1.92, 0.62]},
    ],
    "mint-notes": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.52, 1.50, 0.40]},
    ],
    "binder-clip": [
        {"shape": "box", "center": [0, -0.05, -0.12], "size": [1.44, 1.08, 0.62]},
        {"shape": "box", "center": [0, 0.05, 0.40], "size": [1.70, 0.72, 0.38]},
    ],
    "orange-tape": [
        {"shape": "sphere", "center": [0, 0.18, 0.14], "radius": 0.77},
        {"shape": "box", "center": [0, -0.72, -0.22], "size": [0.86, 0.96, 0.22]},
    ],
    "teal-usb": [
        {"shape": "box", "center": [0, 0.24, 0.08], "size": [0.98, 1.58, 0.54]},
        {"shape": "box", "center": [0, -0.82, -0.02], "size": [0.72, 0.66, 0.38]},
    ],
    "cream-earbuds": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.45, 1.45, 0.78]},
    ],
    "coral-keycap": [
        {"shape": "box", "center": [0, 0, -0.03], "size": [1.45, 1.45, 0.66]},
    ],
    "purple-stress-ball": [
        {"shape": "sphere", "center": [0, 0, 0], "radius": 0.57},
    ],
    "round-coaster": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.46, 1.46, 0.32]},
    ],
    "spiral-notebook": [
        {"shape": "box", "center": [0.02, 0, -0.02], "size": [1.50, 1.90, 0.50]},
        {"shape": "box", "center": [-0.72, 0, 0.12], "size": [0.20, 1.66, 0.28]},
    ],
    "clear-ruler": [
        {"shape": "box", "center": [0, -0.52, 0], "size": [1.38, 0.24, 0.24]},
        {"shape": "box", "center": [-0.43, 0.20, 0], "size": [1.38, 0.24, 0.24], "rotation": [0, 0, 60]},
        {"shape": "box", "center": [0.43, 0.20, 0], "size": [1.38, 0.24, 0.24], "rotation": [0, 0, -60]},
    ],
    "lucky-badge": [
        {"shape": "sphere", "center": [0, 0.12, 0.12], "radius": 0.70},
        {"shape": "box", "center": [-0.24, -0.68, -0.20], "size": [0.38, 0.82, 0.20], "rotation": [0, 0, -9]},
        {"shape": "box", "center": [0.24, -0.68, -0.20], "size": [0.38, 0.82, 0.20], "rotation": [0, 0, 9]},
    ],
    "teal-wireless-mouse": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.38, 1.82, 0.68]},
    ],
    "cream-alarm-clock": [
        {"shape": "box", "center": [0, -0.02, -0.08], "size": [1.44, 1.30, 1.08]},
        {"shape": "sphere", "center": [-0.43, 0.04, 0.66], "radius": 0.20},
        {"shape": "sphere", "center": [0.43, 0.04, 0.66], "radius": 0.20},
    ],
    "coral-candle-jar": [
        {"shape": "box", "center": [0, 0, -0.04], "size": [1.36, 1.36, 1.22]},
    ],
    "mustard-glasses-case": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.34, 2.05, 0.68]},
    ],
    "mint-compact-mirror": [
        {"shape": "sphere", "center": [0, 0.34, 0.08], "radius": 0.64},
        {"shape": "box", "center": [0, -0.68, -0.05], "size": [0.46, 1.12, 0.38]},
    ],
    "purple-mini-speaker": [
        {"shape": "box", "center": [0, 0, 0], "size": [1.62, 1.18, 1.08]},
    ],
}


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    # Blender 5.x exposes the realtime renderer as BLENDER_EEVEE.  Using the
    # older 4.x enum makes background generation fail before any assets exist.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1536
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    bpy.context.preferences.filepaths.save_version = 0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("DesktopCleanupWorld")
    scene.world.color = (0.018, 0.024, 0.038)


def create_roughness_texture() -> bpy.types.Image:
    size = 256
    rng = random.Random(20260826)
    image = bpy.data.images.new("desktop-cleanup-clay-roughness-v1", size, size, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    pixels = []
    for y in range(size):
        for x in range(size):
            wave = math.sin(x * 0.27) * math.cos(y * 0.19) * 0.018
            value = max(0.68, min(0.90, 0.79 + wave + (rng.random() - 0.5) * 0.045))
            pixels.extend((value, value, value, 1.0))
    image.pixels.foreach_set(pixels)
    image.update()
    image.filepath_raw = str(ROUGHNESS_PATH)
    image.file_format = "PNG"
    image.save()
    return image


def create_basecolor_ao_atlas() -> bpy.types.Image:
    """Bake the shared palette and soft contact AO into one deterministic atlas."""
    rng = random.Random(20260827)
    image = bpy.data.images.new(
        "desktop-cleanup-clay-basecolor-ao-v1",
        ATLAS_SIZE,
        ATLAS_SIZE,
        alpha=False,
    )
    image.colorspace_settings.name = "sRGB"
    pixels = [0.0] * (ATLAS_SIZE * ATLAS_SIZE * 4)
    for color_name, color in PALETTE.items():
        tile_x, tile_y = PALETTE_UV_TILES[color_name]
        for local_y in range(ATLAS_TILE_SIZE):
            for local_x in range(ATLAS_TILE_SIZE):
                u = (local_x + 0.5) / ATLAS_TILE_SIZE
                v = (local_y + 0.5) / ATLAS_TILE_SIZE
                # A soft edge darkening acts as baked ambient contact shading,
                # while low-amplitude deterministic noise keeps the clay from
                # reading as flat plastic after mobile texture filtering.
                center_weight = max(0.0, math.sin(math.pi * u) * math.sin(math.pi * v))
                ao = 0.84 + 0.16 * math.pow(center_weight, 0.32)
                grain = (rng.random() - 0.5) * 0.016
                shade = max(0.80, min(1.0, ao + grain))
                x = tile_x * ATLAS_TILE_SIZE + local_x
                y = tile_y * ATLAS_TILE_SIZE + local_y
                offset = (y * ATLAS_SIZE + x) * 4
                pixels[offset:offset + 4] = [
                    color[0] * shade,
                    color[1] * shade,
                    color[2] * shade,
                    color[3],
                ]
    image.pixels.foreach_set(pixels)
    image.update()
    image.filepath_raw = str(BASECOLOR_AO_PATH)
    image.file_format = "PNG"
    image.save()
    return image


def create_shared_material(
    basecolor_ao_image: bpy.types.Image,
    roughness_image: bpy.types.Image,
) -> bpy.types.Material:
    material = bpy.data.materials.new("MAT_desktop_cleanup_soft_clay")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (1, 1, 1, 1)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.8
    basecolor_texture = nodes.new("ShaderNodeTexImage")
    basecolor_texture.name = "SharedClayBaseColorAO"
    basecolor_texture.image = basecolor_ao_image
    basecolor_texture.interpolation = "Linear"
    links.new(basecolor_texture.outputs["Color"], principled.inputs["Base Color"])
    roughness_texture = nodes.new("ShaderNodeTexImage")
    roughness_texture.name = "SharedClayRoughness"
    roughness_texture.image = roughness_image
    roughness_texture.interpolation = "Linear"
    links.new(roughness_texture.outputs["Color"], principled.inputs["Roughness"])
    return material


def assign_palette_uv(obj: bpy.types.Object, color_name: str) -> None:
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    tile_x, tile_y = PALETTE_UV_TILES[color_name]
    coordinates = [vertex.co for vertex in mesh.vertices]
    min_x = min((coordinate.x for coordinate in coordinates), default=0.0)
    max_x = max((coordinate.x for coordinate in coordinates), default=1.0)
    min_y = min((coordinate.y for coordinate in coordinates), default=0.0)
    max_y = max((coordinate.y for coordinate in coordinates), default=1.0)
    width = max(1e-6, max_x - min_x)
    height = max(1e-6, max_y - min_y)
    # Keep a generous gutter because Cocos samples the shared atlas with
    # linear filtering while the physics props rotate.  The eraser's thin
    # orange frame is especially sensitive to a neighboring palette tile
    # leaking into a texel; 8px leaves a stable 48px interior per tile.
    padding = 8.0 / ATLAS_SIZE
    tile_uv_size = 1.0 / ATLAS_COLUMNS
    for loop in mesh.loops:
        coordinate = mesh.vertices[loop.vertex_index].co
        local_u = (coordinate.x - min_x) / width
        local_v = (coordinate.y - min_y) / height
        uv_layer.data[loop.index].uv = (
            tile_x * tile_uv_size + padding + local_u * (tile_uv_size - padding * 2),
            tile_y * tile_uv_size + padding + local_v * (tile_uv_size - padding * 2),
        )


def finish_mesh(obj: bpy.types.Object, color_name: str, material: bpy.types.Material) -> bpy.types.Object:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_palette_uv(obj, color_name)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj.select_set(False)
    return obj


def cube(parent, name, location, scale, color, material, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    if bevel > 0:
        modifier = obj.modifiers.new("SoftClayBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish_mesh(obj, color, material)


def cylinder(parent, name, location, radius, depth, color, material, rotation=(0, 0, 0), vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    bevel = obj.modifiers.new("SoftClayBevel", "BEVEL")
    bevel.width = min(radius * 0.12, depth * 0.10)
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish_mesh(obj, color, material)


def sphere(parent, name, location, scale, color, material, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    return finish_mesh(obj, color, material)


def cone(parent, name, location, radius1, radius2, depth, color, material, rotation=(0, 0, 0), vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    return finish_mesh(obj, color, material)


def torus(parent, name, location, major_radius, minor_radius, color, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    return finish_mesh(obj, color, material)


def create_root(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def star(parent, name, location, outer, inner, depth, color, material):
    vertices = []
    for z in (-depth / 2, depth / 2):
        for i in range(10):
            radius = outer if i % 2 == 0 else inner
            angle = math.radians(90 + i * 36)
            vertices.append((math.cos(angle) * radius, math.sin(angle) * radius, z))
    faces = [tuple(range(10)), tuple(range(10, 20))]
    for i in range(10):
        j = (i + 1) % 10
        faces.append((i, j, 10 + j, 10 + i))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    bevel = obj.modifiers.new("StarBevel", "BEVEL")
    bevel.width = depth * 0.28
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish_mesh(obj, color, material)


def join_item(root: bpy.types.Object, item_type: str) -> None:
    meshes = [child for child in root.children_recursive if child.type == "MESH"]
    if not meshes:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = f"MESH_{item_type}"
    merged.parent = root
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    minimum = [min(vertex.co[index] for vertex in merged.data.vertices) for index in range(3)]
    maximum = [max(vertex.co[index] for vertex in merged.data.vertices) for index in range(3)]
    center = [(minimum[index] + maximum[index]) * 0.5 for index in range(3)]
    merged.data.transform(Matrix.Translation(tuple(-value for value in center)))
    merged.data.update()
    root["ground_offset"] = (maximum[2] - minimum[2]) * 0.5
    root["dimensions"] = [maximum[index] - minimum[index] for index in range(3)]
    merged.select_set(False)


def add_collider_proxies(root: bpy.types.Object, item_type: str) -> None:
    specs = COLLIDER_SPECS[item_type]
    root["collider_count"] = len(specs)
    for index, spec in enumerate(specs):
        shape = spec["shape"]
        proxy = bpy.data.objects.new(f"COLLIDER_{item_type}_{index}_{shape}", None)
        bpy.context.scene.collection.objects.link(proxy)
        proxy.parent = root
        proxy.location = spec["center"]
        rotation = spec.get("rotation", [0, 0, 0])
        proxy.rotation_euler = tuple(math.radians(value) for value in rotation)
        proxy.empty_display_type = "SPHERE" if shape == "sphere" else "CUBE"
        if shape == "sphere":
            proxy.empty_display_size = spec["radius"]
        elif shape == "box":
            proxy.empty_display_size = 1.0
            proxy.scale = tuple(value * 0.5 for value in spec["size"])
        else:
            proxy.empty_display_size = spec["radius"]
            direction = spec["direction"]
            axis_scale = spec["height"] * 0.5 / spec["radius"]
            proxy.scale = (
                axis_scale if direction == "x" else 1,
                axis_scale if direction == "y" else 1,
                axis_scale if direction == "z" else 1,
            )
        proxy.show_name = True
        proxy.hide_render = True
        proxy["desktop_cleanup_collider"] = True
        for key, value in spec.items():
            proxy[key] = value


def write_collider_config() -> None:
    def to_cocos_spec(source):
        spec = dict(source)
        x, y, z = source["center"]
        spec["center"] = [x, z, -y]
        if "size" in source:
            size_x, size_y, size_z = source["size"]
            spec["size"] = [size_x, size_z, size_y]
        if "direction" in source:
            spec["direction"] = {"x": "x", "y": "z", "z": "y"}[source["direction"]]
        if "rotation" in source:
            spec["rotation"] = [0, source["rotation"][2], 0]
        return spec

    payload = {
        "schemaVersion": 1,
        "unit": "meter",
        "coordinateSystem": "cocos-y-up",
        "items": {
            item_type: [to_cocos_spec(spec) for spec in specs]
            for item_type, specs in COLLIDER_SPECS.items()
        },
    }
    COLLIDER_CONFIG_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_blue_pen(root, mat):
    cylinder(root, "barrel", (0, 0, 0.24), 0.26, 1.65, "white", mat, (math.pi / 2, 0, 0))
    cylinder(root, "cap", (0, 1.02, 0.24), 0.31, 0.52, "blue", mat, (math.pi / 2, 0, 0))
    cone(root, "tip", (0, -1.00, 0.24), 0.25, 0.08, 0.48, "blue", mat, (math.pi / 2, 0, 0))
    cube(root, "clip", (0.25, 1.0, 0.34), (0.06, 0.38, 0.055), "blue", mat, 0.04)


def build_red_pencil(root, mat):
    cylinder(root, "body", (0, 0, 0.24), 0.28, 1.75, "red", mat, (math.pi / 2, 0, 0), 6)
    cone(root, "wood_tip", (0, -1.08, 0.24), 0.28, 0.06, 0.58, "cream", mat, (math.pi / 2, 0, 0), 12)
    cone(root, "graphite", (0, -1.39, 0.24), 0.065, 0.01, 0.18, "ink", mat, (math.pi / 2, 0, 0), 12)
    cylinder(root, "ferrule", (0, 1.02, 0.24), 0.30, 0.30, "gold", mat, (math.pi / 2, 0, 0))
    cylinder(root, "eraser", (0, 1.26, 0.24), 0.30, 0.26, "coral", mat, (math.pi / 2, 0, 0))


def build_eraser(root, mat):
    cube(root, "eraser", (0, 0, 0.24), (0.58, 0.95, 0.24), "white", mat, 0.22)
    # The old sleeve intersected the eraser through most of its volume.  Its
    # coplanar faces flickered under the mobile depth buffer.  Make it a thin,
    # slightly oversized band with separated outer faces instead.
    cube(root, "sleeve", (0, 0, 0.29), (0.64, 0.99, 0.105), "yellow", mat, 0.08)


def build_notes(root, mat):
    for i in range(4):
        cube(root, f"sheet_{i}", (0.02 * i, -0.02 * i, 0.10 + i * 0.075), (0.74, 0.72, 0.055), "mint", mat, 0.09)


def build_clip(root, mat):
    cube(root, "clip_body", (0, 0, 0.30), (0.72, 0.54, 0.30), "ink", mat, 0.11)
    for x in (-0.48, 0.48):
        torus(root, f"wire_{x}", (x, 0, 0.52), 0.34, 0.045, "metal", mat, (math.pi / 2, 0, 0))


def build_tape(root, mat):
    torus(root, "tape_roll", (0, 0.12, 0.39), 0.53, 0.22, "orange", mat)
    cylinder(root, "core", (0, 0.12, 0.39), 0.28, 0.24, "cream", mat)
    cube(root, "tail", (0, -0.73, 0.11), (0.42, 0.50, 0.08), "orange", mat, 0.10)


def build_usb(root, mat):
    cube(root, "body", (0, 0.20, 0.24), (0.48, 0.78, 0.24), "teal", mat, 0.20)
    cube(root, "plug", (0, -0.83, 0.20), (0.35, 0.32, 0.16), "metal", mat, 0.04)
    cylinder(root, "button", (0, 0.10, 0.51), 0.12, 0.05, "white", mat)


def build_earbuds(root, mat):
    cube(root, "case", (0, 0, 0.30), (0.72, 0.72, 0.30), "white", mat, 0.28)
    cube(root, "lid", (0, 0.18, 0.58), (0.69, 0.42, 0.12), "cream", mat, 0.20)


def build_keycap(root, mat):
    cube(root, "key", (0, 0, 0.30), (0.72, 0.72, 0.30), "coral", mat, 0.16)
    star(root, "star", (0, 0, 0.64), 0.34, 0.17, 0.10, "yellow", mat)


def build_ball(root, mat):
    sphere(root, "ball", (0, 0, 0.55), (0.56, 0.56, 0.56), "purple", mat)


def build_coaster(root, mat):
    cylinder(root, "coaster", (0, 0, 0.13), 0.72, 0.26, "wood", mat, vertices=28)
    torus(root, "rim", (0, 0, 0.28), 0.52, 0.045, "cream", mat)


def build_notebook(root, mat):
    cube(root, "pages", (0.05, 0, 0.20), (0.67, 0.90, 0.18), "cream", mat, 0.10)
    cube(root, "cover", (0.08, 0, 0.39), (0.72, 0.94, 0.10), "sky", mat, 0.11)
    for y in (-0.65, -0.22, 0.22, 0.65):
        torus(root, f"ring_{y}", (-0.67, y, 0.44), 0.12, 0.025, "metal", mat, (math.pi / 2, 0, 0))


def build_ruler(root, mat):
    # Three rounded bars form the recognizable triangular set-square silhouette.
    for angle, loc in ((0, (0, -0.52, 0.16)), (math.radians(60), (-0.43, 0.20, 0.16)), (math.radians(-60), (0.43, 0.20, 0.16))):
        bar = cube(root, f"ruler_bar_{angle}", loc, (0.68, 0.10, 0.10), "teal", mat, 0.08)
        bar.rotation_euler[2] = angle
        bpy.context.view_layer.objects.active = bar
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def build_badge(root, mat):
    cylinder(root, "medal", (0, 0.10, 0.22), 0.68, 0.22, "gold", mat, vertices=28)
    cylinder(root, "inset", (0, 0.10, 0.35), 0.53, 0.08, "orange", mat, vertices=28)
    star(root, "badge_star", (0, 0.10, 0.44), 0.46, 0.22, 0.11, "yellow", mat)
    for x in (-0.23, 0.23):
        ribbon = cube(root, f"ribbon_{x}", (x, -0.64, 0.10), (0.18, 0.43, 0.08), "red", mat, 0.05)
        ribbon.rotation_euler[2] = -0.16 if x < 0 else 0.16


def build_mouse(root, mat):
    sphere(root, "mouse_body", (0, 0, 0.32), (0.70, 0.92, 0.34), "mint", mat)
    cube(root, "base", (0, 0.05, 0.15), (0.62, 0.80, 0.10), "cream", mat, 0.18)
    cylinder(root, "wheel", (0, -0.18, 0.66), 0.09, 0.18, "white", mat, (math.pi / 2, 0, 0), 16)


def build_clock(root, mat):
    cube(root, "clock_body", (0, 0, 0.53), (0.72, 0.62, 0.53), "white", mat, 0.28)
    cylinder(root, "face", (0, -0.64, 0.56), 0.50, 0.06, "cream", mat, (math.pi / 2, 0, 0), 28)
    for angle, length in ((0.55, 0.34), (-0.85, 0.25)):
        hand = cube(root, f"hand_{angle}", (0, -0.70, 0.56), (0.035, length, 0.035), "ink", mat, 0.02)
        hand.rotation_euler[0] = math.pi / 2
        hand.rotation_euler[1] = angle
    for x in (-0.43, 0.43):
        sphere(root, f"bell_{x}", (x, 0.02, 1.13), (0.18, 0.18, 0.14), "yellow", mat)
        sphere(root, f"foot_{x}", (x, -0.02, 0.05), (0.14, 0.16, 0.10), "yellow", mat)


def build_candle(root, mat):
    cylinder(root, "jar", (0, 0, 0.48), 0.67, 0.96, "coral", mat, vertices=28)
    cylinder(root, "wax", (0, 0, 0.98), 0.56, 0.06, "cream", mat, vertices=28)
    cylinder(root, "wick", (0, 0, 1.10), 0.025, 0.24, "wood", mat, vertices=10)


def build_glasses_case(root, mat):
    cube(root, "case_bottom", (0, 0, 0.28), (0.66, 1.02, 0.28), "yellow", mat, 0.30)
    cube(root, "case_lid", (0, 0.04, 0.51), (0.64, 0.94, 0.17), "gold", mat, 0.28)


def build_mirror(root, mat):
    cylinder(root, "mirror_frame", (0, 0.30, 0.22), 0.62, 0.18, "mint", mat, vertices=28)
    cylinder(root, "mirror", (0, 0.30, 0.33), 0.49, 0.06, "white", mat, vertices=28)
    cube(root, "handle", (0, -0.66, 0.20), (0.22, 0.58, 0.16), "mint", mat, 0.20)
    cylinder(root, "button", (0, -0.50, 0.40), 0.07, 0.05, "cream", mat)


def build_speaker(root, mat):
    cube(root, "speaker_body", (0, 0, 0.48), (0.80, 0.58, 0.48), "purple", mat, 0.22)
    cube(root, "grille", (0, -0.59, 0.48), (0.62, 0.05, 0.31), "ink", mat, 0.09)
    for x in (-0.32, 0, 0.32):
        cylinder(root, f"button_{x}", (x, 0.08, 1.00), 0.09, 0.06, "purple", mat, vertices=14)


BUILDERS = {
    "blue-pen": build_blue_pen,
    "red-pencil": build_red_pencil,
    "yellow-eraser": build_eraser,
    "mint-notes": build_notes,
    "binder-clip": build_clip,
    "orange-tape": build_tape,
    "teal-usb": build_usb,
    "cream-earbuds": build_earbuds,
    "coral-keycap": build_keycap,
    "purple-stress-ball": build_ball,
    "round-coaster": build_coaster,
    "spiral-notebook": build_notebook,
    "clear-ruler": build_ruler,
    "lucky-badge": build_badge,
    "teal-wireless-mouse": build_mouse,
    "cream-alarm-clock": build_clock,
    "coral-candle-jar": build_candle,
    "mustard-glasses-case": build_glasses_case,
    "mint-compact-mirror": build_mirror,
    "purple-mini-speaker": build_speaker,
}


def add_contact_sheet_environment(roots: list[bpy.types.Object]) -> tuple[bpy.types.Object, list[tuple[bpy.types.Object, tuple]]]:
    transforms = []
    columns = 4
    for index, root in enumerate(roots):
        transforms.append((root, (root.location.copy(), root.rotation_euler.copy(), root.scale.copy())))
        row = index // columns
        column = index % columns
        root.location = (
            (column - 1.5) * 3.3,
            (2 - row) * 3.1,
            float(root.get("ground_offset", 0)),
        )
        root.rotation_euler = (0, 0, math.radians(-12 + (index % 3) * 12))

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.04))
    plane = bpy.context.object
    plane.name = "ContactSheetGround"
    ground_mat = bpy.data.materials.new("MAT_contact_sheet_ground")
    ground_mat.diffuse_color = (0.055, 0.035, 0.028, 1)
    plane.data.materials.append(ground_mat)

    bpy.ops.object.light_add(type="AREA", location=(-5.5, -4.0, 11.0))
    key = bpy.context.object
    key.data.energy = 1700
    key.data.shape = "DISK"
    key.data.size = 7.0
    bpy.ops.object.light_add(type="AREA", location=(6.0, 2.0, 7.0))
    fill = bpy.context.object
    fill.data.energy = 850
    fill.data.size = 6.0

    bpy.ops.object.camera_add(location=(0, -20.5, 20.5))
    camera = bpy.context.object
    camera.name = "ContactSheetCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 16.8
    direction = mathutils.Vector((0, 0, 0.6)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    return plane, transforms


def render_contact_sheet(roots: list[bpy.types.Object]) -> None:
    global mathutils
    import mathutils

    plane, transforms = add_contact_sheet_environment(roots)
    bpy.context.scene.render.filepath = str(CONTACT_SHEET_PATH)
    bpy.ops.render.render(write_still=True)
    for root, (location, rotation, scale) in transforms:
        root.location = location
        root.rotation_euler = rotation
        root.scale = scale
    for obj in [plane, bpy.data.objects.get("ContactSheetCamera")]:
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in [obj for obj in list(bpy.data.objects) if obj.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    ground_material = bpy.data.materials.get("MAT_contact_sheet_ground")
    if ground_material is not None:
        bpy.data.materials.remove(ground_material)


def write_provenance() -> None:
    payload = {
        "schemaVersion": 1,
        "assetId": "desktop-cleanup-items-v1",
        "authorship": "original-procedural-low-poly-models",
        "licenseScope": "project-owned-original-assets",
        "generator": "tools/build-desktop-cleanup-3d-assets.py",
        "blenderVersion": bpy.app.version_string,
        "sourceBlend": str(BLEND_PATH.relative_to(ROOT)),
        "runtimeGlb": str(GLB_PATH.relative_to(ROOT)),
        "sharedBaseColorAoTexture": str(BASECOLOR_AO_PATH.relative_to(ROOT)),
        "sharedRoughnessTexture": str(ROUGHNESS_PATH.relative_to(ROOT)),
        "colliderConfig": str(COLLIDER_CONFIG_PATH.relative_to(ROOT)),
        "contactSheet": str(CONTACT_SHEET_PATH.relative_to(ROOT)),
        "itemTypes": list(BUILDERS.keys()),
        "itemCount": len(BUILDERS),
        "colliderProxyCount": sum(len(specs) for specs in COLLIDER_SPECS.values()),
        "dynamicMeshColliderAllowed": False,
    }
    PROVENANCE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()
    basecolor_ao = create_basecolor_ao_atlas()
    roughness = create_roughness_texture()
    material = create_shared_material(basecolor_ao, roughness)
    write_collider_config()
    roots = []
    for item_type, builder in BUILDERS.items():
        root = create_root(f"ITEM_{item_type}")
        builder(root, material)
        join_item(root, item_type)
        add_collider_proxies(root, item_type)
        roots.append(root)

    render_contact_sheet(roots)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    write_provenance()
    backup_path = Path(str(BLEND_PATH) + "1")
    if backup_path.exists():
        backup_path.unlink()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Verify the Cat Merge cute-refresh runtime images without native dependencies."""

from __future__ import annotations

import json
import importlib.util
import sys
from pathlib import Path

from PIL import Image, ImageChops

PROCESSOR_PATH = Path(__file__).with_name("process-cat-cute-refresh-assets.py")
SPEC = importlib.util.spec_from_file_location("cat_cute_refresh_processor", PROCESSOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {PROCESSOR_PATH}")
PROCESSOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROCESSOR
SPEC.loader.exec_module(PROCESSOR)

ROOT = PROCESSOR.ROOT
BACKGROUND_TARGET = PROCESSOR.BACKGROUND_TARGET
CATS = PROCESSOR.CATS
COVER_TARGET = PROCESSOR.COVER_TARGET
FRAME_ROOT = PROCESSOR.FRAME_ROOT
ICON_TARGET = PROCESSOR.ICON_TARGET


EXPECTED_BBOX = (2, 2, 254, 254)


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def verify_frames() -> None:
    expected_names: set[str] = set()
    for cat in CATS:
        names = (cat.idle_a, cat.idle_b, cat.fall)
        expected_names.update(names)
        alpha_channels: list[Image.Image] = []
        for name in names:
            path = FRAME_ROOT / name
            if not path.exists():
                fail(f"missing frame {path}")
            image = Image.open(path)
            if image.size != (256, 256) or image.mode != "RGBA":
                fail(f"{name}: expected 256x256 RGBA, got {image.size} {image.mode}")
            alpha = image.getchannel("A")
            if alpha.getbbox() != EXPECTED_BBOX:
                fail(f"{name}: alpha bbox is {alpha.getbbox()}, expected {EXPECTED_BBOX}")
            if any(image.getpixel(point)[3] != 0 for point in ((0, 0), (255, 0), (0, 255), (255, 255))):
                fail(f"{name}: a corner is not transparent")
            if image.getpixel((128, 128))[3] != 255:
                fail(f"{name}: center is not opaque")
            alpha_channels.append(alpha)

        if any(ImageChops.difference(alpha_channels[0], alpha).getbbox() for alpha in alpha_channels[1:]):
            fail(f"{cat.source_name}: the three alpha masks differ")
        if not ImageChops.difference(
            Image.open(FRAME_ROOT / cat.idle_a).convert("RGB"),
            Image.open(FRAME_ROOT / cat.idle_b).convert("RGB"),
        ).getbbox():
            fail(f"{cat.source_name}: idle A and B are identical")

    actual_names = {path.name for path in FRAME_ROOT.glob("cat-*.png")}
    if actual_names != expected_names:
        fail(
            "runtime frame set mismatch: "
            f"missing={sorted(expected_names - actual_names)}, "
            f"extra={sorted(actual_names - expected_names)}"
        )
    print("frames=33, size=256x256, mode=RGBA, alpha=252px, masks=matched")


def verify_scene(path: Path, size: tuple[int, int], mode: str, label: str) -> None:
    if not path.exists():
        fail(f"missing {label}: {path}")
    image = Image.open(path)
    if image.size != size or image.mode != mode:
        fail(f"{label}: expected {size} {mode}, got {image.size} {image.mode}")
    print(f"{label}={size[0]}x{size[1]} {mode}")


def verify_manifest() -> None:
    manifest = ROOT / "assets/resources/configs/games.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    watermelon = next(game for game in data["games"] if game["id"] == "watermelon")
    expected = "visual/icons/watermelon/cat-merge-icon-v1/texture"
    if watermelon.get("icon") != expected:
        fail(f"watermelon icon path is {watermelon.get('icon')!r}, expected {expected!r}")
    print("manifest_icon=connected")


def main() -> None:
    verify_frames()
    verify_scene(BACKGROUND_TARGET, (750, 1334), "RGB", "background")
    verify_scene(COVER_TARGET, (920, 690), "RGB", "cover")
    verify_scene(ICON_TARGET, (512, 512), "RGBA", "icon")
    verify_manifest()
    print("cat_cute_refresh=ok")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Normalize generated Cat Merge artwork into Cocos runtime assets."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from math import hypot
from pathlib import Path
from statistics import median
from typing import Iterable

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tmp/imagegen/cat-merge-source"
FRAME_ROOT = ROOT / "assets/games/watermelon/visual/cats/frames-c6"
BACKGROUND_TARGET = (
    ROOT / "assets/games/watermelon/visual/backgrounds/c1-cat-room-bg-v1.jpg"
)
COVER_TARGET = (
    ROOT / "assets/lobby/visual/covers/watermelon/c1-fat-orange-cover-v1.jpg"
)
ICON_TARGET = (
    ROOT / "assets/lobby/visual/icons/watermelon/cat-merge-icon-v1.png"
)


@dataclass(frozen=True)
class CatAsset:
    source_name: str
    color: tuple[int, int, int]
    idle_a: str
    idle_b: str
    fall: str


CATS = (
    CatAsset(
        "cat-00-cream-kitten.png",
        (0xF8, 0xD9, 0xB8),
        "cat-00-cream-kitten-idle-1-c6-v1.png",
        "cat-00-cream-kitten-idle-2-c6-v1.png",
        "cat-00-cream-kitten-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-01-gray-tabby.png",
        (0xC9, 0xDD, 0xEA),
        "cat-01-gray-tabby-idle-1-c6-v1.png",
        "cat-01-gray-tabby-idle-2-c6-v1.png",
        "cat-01-gray-tabby-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-02-calico.png",
        (0xF3, 0xCD, 0xD2),
        "cat-02-calico-idle-1-c6-v1.png",
        "cat-02-calico-idle-2-c6-v1.png",
        "cat-02-calico-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-03-tuxedo.png",
        (0xC7, 0xE6, 0xD8),
        "cat-03-tuxedo-idle-1-c6-v1.png",
        "cat-03-tuxedo-idle-2-c6-v1.png",
        "cat-03-tuxedo-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-04-white-fluffy.png",
        (0xCE, 0xE5, 0xF1),
        "cat-04-white-fluffy-idle-2-c6-v1.png",
        "cat-04-white-fluffy-idle-3-c6-v1.png",
        "cat-04-white-fluffy-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-05-brown-tabby.png",
        (0xE8, 0xD5, 0xBB),
        "cat-05-brown-tabby-idle-2-c6-v1.png",
        "cat-05-brown-tabby-idle-3-c6-v1.png",
        "cat-05-brown-tabby-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-06-siamese.png",
        (0xDD, 0xD0, 0xED),
        "cat-06-siamese-idle-1-c6-v1.png",
        "cat-06-siamese-idle-2-c6-v1.png",
        "cat-06-siamese-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-07-golden-shorthair.png",
        (0xF5, 0xE1, 0xA7),
        "cat-07-golden-shorthair-idle-1-c6-v1.png",
        "cat-07-golden-shorthair-idle-2-c6-v1.png",
        "cat-07-golden-shorthair-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-08-blue-scottish-fold.png",
        (0xBE, 0xC5, 0xDF),
        "cat-08-blue-scottish-fold-idle-1-c8-v1.png",
        "cat-08-blue-scottish-fold-idle-2-c8-v1.png",
        "cat-08-blue-scottish-fold-fall-c8-v1.png",
    ),
    CatAsset(
        "cat-09-smoke-tabby.png",
        (0xC9, 0xBB, 0xCB),
        "cat-09-orange-tabby-idle-1-c6-v1.png",
        "cat-09-orange-tabby-idle-2-c6-v1.png",
        "cat-09-orange-tabby-fall-c6-v1.png",
    ),
    CatAsset(
        "cat-10-fat-orange.png",
        (0xF5, 0xB8, 0x78),
        "cat-10-fat-orange-idle-1-c6-v1.png",
        "cat-10-fat-orange-idle-2-c6-v1.png",
        "cat-10-fat-orange-fall-c6-v1.png",
    ),
)


def _content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Find the generated circular token, ignoring transparent or flat surround."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 16:
        bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
        if bbox:
            return bbox

    rgb = rgba.convert("RGB")
    key = Image.new("RGB", rgb.size, _border_color(rgba)[:3])
    difference = ImageChops.difference(rgb, key).convert("L")
    bbox = difference.point(lambda value: 255 if value > 28 else 0).getbbox()
    if not bbox:
        raise ValueError("Could not detect a token against the chroma-key surround")
    return bbox


def _border_color(image: Image.Image) -> tuple[int, int, int, int]:
    inset_x = max(1, image.width // 100)
    inset_y = max(1, image.height // 100)
    samples = (
        image.getpixel((inset_x, inset_y)),
        image.getpixel((image.width - inset_x - 1, inset_y)),
        image.getpixel((inset_x, image.height - inset_y - 1)),
        image.getpixel((image.width - inset_x - 1, image.height - inset_y - 1)),
    )
    return tuple(round(median(pixel[channel] for pixel in samples)) for channel in range(4))


def _square_crop(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = bbox
    side = min(max(right - left, bottom - top), image.width, image.height)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    crop_left = round(center_x - side / 2)
    crop_top = round(center_y - side / 2)
    crop_left = max(0, min(crop_left, image.width - side))
    crop_top = max(0, min(crop_top, image.height - side))
    return image.crop((crop_left, crop_top, crop_left + side, crop_top + side))


def _is_surround(
    pixel: tuple[int, int, int, int],
    border_color: tuple[int, int, int, int],
) -> bool:
    red, green, blue, alpha = pixel
    near_border = max(
        abs(red - border_color[0]),
        abs(green - border_color[1]),
        abs(blue - border_color[2]),
    ) < 22
    return alpha < 24 or near_border or (
        green > 178 and green > red * 1.55 and green > blue * 1.55
    )


def _normalize_cat_frame(
    source: Path,
    target: Path,
    disc_color: tuple[int, int, int],
    alpha_mask: Image.Image,
) -> None:
    generated = Image.open(source).convert("RGBA")
    border_color = _border_color(generated)
    cropped = _square_crop(generated, _content_bbox(generated))
    token = cropped.resize((252, 252), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (256, 256), (*disc_color, 0))
    canvas.paste(token, (2, 2))
    pixels = canvas.load()
    mask_pixels = alpha_mask.load()
    for y in range(256):
        for x in range(256):
            source_pixel = pixels[x, y]
            alpha = mask_pixels[x, y]
            in_filtering_ring = hypot(x + 0.5 - 128, y + 0.5 - 128) >= 121.5
            if alpha < 255 or in_filtering_ring or _is_surround(source_pixel, border_color):
                red, green, blue = disc_color
            else:
                red, green, blue = source_pixel[:3]
            pixels[x, y] = (red, green, blue, alpha)

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, format="PNG", optimize=True)


def process_cats() -> None:
    for cat in CATS:
        targets_and_sources = (
            (cat.idle_a, SOURCE_ROOT / "idle-a" / cat.source_name),
            (cat.idle_b, SOURCE_ROOT / "idle-b" / cat.source_name),
            (cat.fall, SOURCE_ROOT / "fall" / cat.source_name),
        )
        missing = [str(source) for _, source in targets_and_sources if not source.exists()]
        if missing:
            raise FileNotFoundError("Missing generated source(s): " + ", ".join(missing))

        mask = Image.open(FRAME_ROOT / cat.idle_a).convert("RGBA").getchannel("A")
        for target_name, source in targets_and_sources:
            _normalize_cat_frame(source, FRAME_ROOT / target_name, cat.color, mask)


def _fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_width, target_height = size
    target_ratio = target_width / target_height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif source_ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    return image.resize(size, Image.Resampling.LANCZOS)


def _save_jpeg(source: Path, target: Path, size: tuple[int, int]) -> None:
    image = _fit_cover(Image.open(source).convert("RGB"), size)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="JPEG", quality=93, subsampling=0, optimize=True)


def process_scenes() -> None:
    _save_jpeg(
        SOURCE_ROOT / "scenes/cat-room-bg-source.png",
        BACKGROUND_TARGET,
        (750, 1334),
    )
    _save_jpeg(
        SOURCE_ROOT / "scenes/fat-orange-cover-source.png",
        COVER_TARGET,
        (920, 690),
    )

    icon = _fit_cover(
        Image.open(SOURCE_ROOT / "scenes/cat-merge-icon-source.png").convert("RGBA"),
        (512, 512),
    )
    ICON_TARGET.parent.mkdir(parents=True, exist_ok=True)
    icon.save(ICON_TARGET, format="PNG", optimize=True)


def _requested_modes(arguments: argparse.Namespace) -> Iterable[str]:
    if not arguments.cats and not arguments.scenes:
        return ("cats", "scenes")
    return tuple(
        mode for mode, enabled in (("cats", arguments.cats), ("scenes", arguments.scenes)) if enabled
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cats", action="store_true", help="process the 33 cat frames")
    parser.add_argument("--scenes", action="store_true", help="process background, cover, and icon")
    arguments = parser.parse_args()

    for mode in _requested_modes(arguments):
        if mode == "cats":
            process_cats()
        else:
            process_scenes()
        print(f"processed={mode}")


if __name__ == "__main__":
    main()

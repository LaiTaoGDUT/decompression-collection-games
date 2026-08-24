#!/usr/bin/env python3
"""Merge the normalized Endless Sword VFX textures into a fixed 4x5 sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CELL_SIZE = 256
COLUMNS = 4
ROWS = 5
VFX_NAMES = (
    "hit-spark-v1",
    "sword-slash-v1",
    "lightning-v1",
    "fire-explode-v1",
    "fire-field-v1",
    "ice-burst-v1",
    "seal-impact-v1",
    "black-hole-v1",
    "meteor-v1",
    "star-field-v1",
    "wind-trail-v1",
    "xp-pickup-v1",
    "heal-v1",
    "shield-v1",
    "boss-summon-v1",
    "boss-die-v1",
    "realm-break-v1",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    expected_size = (CELL_SIZE, CELL_SIZE)
    sheet = Image.new(
        "RGBA",
        (COLUMNS * CELL_SIZE, ROWS * CELL_SIZE),
        (0, 0, 0, 0),
    )

    for index, name in enumerate(VFX_NAMES):
        source = args.input_dir / f"{name}.png"
        if not source.is_file():
            raise FileNotFoundError(f"missing VFX texture: {source}")
        with Image.open(source) as image:
            frame = image.convert("RGBA")
        if frame.size != expected_size:
            raise ValueError(
                f"{source} must be {CELL_SIZE}x{CELL_SIZE}, got {frame.size}"
            )
        row, column = divmod(index, COLUMNS)
        sheet.alpha_composite(frame, dest=(column * CELL_SIZE, row * CELL_SIZE))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, format="PNG", optimize=True)
    print(
        f"wrote {args.output} ({sheet.width}x{sheet.height}, "
        f"{len(VFX_NAMES)} populated cells, "
        f"{COLUMNS * ROWS - len(VFX_NAMES)} transparent cells)"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build deterministic audio banks without re-encoding original MP3 files."""
import argparse
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(__file__).resolve().parent / "bubble-shooter"
DESTINATION = ROOT / "assets/game-assets/bubble-shooter/audio-banks"
GROUPS = ("common", "cloud", "ocean", "toy", "magic")
MAGIC = b"AUDIOBNK"


def build():
    banks = {name: [] for name in GROUPS}
    for source in sorted(SOURCE.rglob("*.mp3")):
        relative = source.relative_to(SOURCE)
        if source.stem.endswith("-music"):
            raise ValueError(f"Music must stay independent: {relative}")
        parts = relative.parts
        group = "common" if parts[:2] == ("visual", "common") else parts[2]
        if group not in banks:
            raise ValueError(f"Unknown audio group: {relative}")
        banks[group].append((relative.with_suffix("").as_posix(), source.read_bytes()))
    results = {}
    for name, clips in banks.items():
        if not clips:
            raise ValueError(f"Empty audio bank: {name}")
        index, payload, offset = {}, [], 0
        for path, data in clips:
            if not data:
                raise ValueError(f"Empty audio: {path}")
            index[path] = {"offset": offset, "length": len(data)}
            payload.append(data)
            offset += len(data)
        encoded_index = json.dumps(index, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        results[name] = (MAGIC + struct.pack("<I", len(encoded_index))
                         + encoded_index + b"".join(payload), len(clips))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed banks against all source bytes")
    args = parser.parse_args()
    results = build()
    if not args.check:
        DESTINATION.mkdir(parents=True, exist_ok=True)
    total_count, total_bytes = 0, 0
    for name, (content, count) in results.items():
        destination = DESTINATION / f"{name}.bin"
        if args.check:
            if not destination.exists() or destination.read_bytes() != content:
                raise SystemExit(f"Stale audio bank: {destination}; run python3 audio-bank-sources/build.py")
        elif not destination.exists() or destination.read_bytes() != content:
            destination.write_bytes(content)
        print(f"{name}: {count} effects, {len(content):,} bytes")
        total_count += count
        total_bytes += len(content)
    print(f"{'Verified' if args.check else 'Built'} {len(results)} banks: {total_count} effects, {total_bytes:,} bytes.")


if __name__ == "__main__":
    main()

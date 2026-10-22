#!/usr/bin/env python3
"""Build deterministic audio banks without re-encoding original MP3 files."""
import argparse
import json
import struct
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(__file__).resolve().parent / "bubble-shooter"
DESTINATION = ROOT / "assets/game-assets/bubble-shooter/audio-banks"
GROUPS = ("common", "cloud", "ocean", "toy", "magic")
MAGIC = b"AUDIOBNK"


def build(game="bubble-shooter"):
    if game != "bubble-shooter":
        source_root = SOURCE.parent / game
        manifest = json.loads((source_root / "banks.json").read_text())
        banks, seen = {}, set()
        for name, paths in manifest.items():
            if not name or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in name):
                raise ValueError(f"Invalid bank name: {name}")
            clips = []
            for key in paths:
                relative = Path(key)
                if not key.isascii() or relative.is_absolute() or ".." in relative.parts or relative.suffix or key in seen:
                    raise ValueError(f"Invalid or duplicate audio path: {key}")
                seen.add(key)
                clips.append((key, (source_root / relative.with_suffix(".mp3")).read_bytes()))
            banks[name] = clips
    else:
        banks = bubble_banks()
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


def bubble_banks():
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
    return banks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game", choices=("bubble-shooter", "rotate-rings", "flappy-dunk", "pingpong", "meme-runner", "city-bloxx"), default="bubble-shooter")
    parser.add_argument("--check", action="store_true", help="verify committed banks against all source bytes")
    args = parser.parse_args()
    results = build(args.game)
    destination_root = DESTINATION if args.game == "bubble-shooter" else ROOT / f"assets/game-assets/{args.game}/visual/audio"
    if not args.check:
        destination_root.mkdir(parents=True, exist_ok=True)
    total_count, total_bytes = 0, 0
    for name, (content, count) in results.items():
        destination = destination_root / f"{name}.bin"
        if args.check:
            if not destination.exists() or destination.read_bytes() != content:
                raise SystemExit(f"Stale audio bank: {destination}; run python3 audio-bank-sources/build.py --game {args.game}")
        elif not destination.exists() or destination.read_bytes() != content:
            destination.write_bytes(content)
        meta = destination.with_suffix('.bin.meta')
        if not args.check and not meta.exists():
            meta.write_text(json.dumps({'ver': '1.0.3', 'importer': 'buffer', 'imported': True,
                'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, f'audio-bank/{args.game}/{name}')),
                'files': ['.bin', '.json'], 'subMetas': {}, 'userData': {}}, indent=2) + '\n')
        print(f"{name}: {count} effects, {len(content):,} bytes")
        total_count += count
        total_bytes += len(content)
    print(f"{'Verified' if args.check else 'Built'} {len(results)} banks: {total_count} effects, {total_bytes:,} bytes.")


if __name__ == "__main__":
    main()

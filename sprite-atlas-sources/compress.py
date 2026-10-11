#!/usr/bin/env python3
"""Run the project's tinypng-batch skill on the reviewed final atlas list.

Without a selection every atlas in ``compression-inputs.json`` is processed.
Restrict the run with ``--game <name>`` (atlases under ``assets/game-assets/<name>``)
and/or explicit files or directories; only atlases listed in
``compression-inputs.json`` can be selected, and a selector that matches nothing
is an error, so a typo never widens the run to other games.

    python3 sprite-atlas-sources/compress.py --dry-run --game cyblockbees
    python3 sprite-atlas-sources/compress.py --in-place assets/game-assets/cyblockbees/visual/game
"""
import argparse
import json
import os
import ssl
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
inputs = [root / path for path in json.loads(Path(__file__).with_name('compression-inputs.json').read_text())]

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('targets', nargs='*', help='Listed atlas files or directories containing them')
parser.add_argument('--game', action='append', default=[], help='Select atlases of assets/game-assets/<game> (repeatable)')
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--output')
mode.add_argument('--in-place', action='store_true')
parser.add_argument('--keys-file')
parser.add_argument('--strategy', choices=('ordered', 'round-robin'))
parser.add_argument('--monthly-limit')
parser.add_argument('--cache-dir', default=str(root / 'local/tinypng-batch/cache'))
parser.add_argument('--exclude', action='append', default=[])
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()


def resolve(target: str) -> Path:
    path = Path(target)
    return (path if path.is_absolute() else Path.cwd() / path).resolve()


selectors = [resolve(target) for target in args.targets]
selectors += [root / 'assets' / 'game-assets' / game for game in args.game]
selected = inputs
if selectors:
    selected, errors = [], []
    for selector in selectors:
        matches = [path for path in inputs if path == selector or selector in path.parents]
        if not matches:
            errors.append(f'{os.path.relpath(selector, root)}: not a listed atlas in compression-inputs.json')
        selected.extend(path for path in matches if path not in selected)
    if errors:
        parser.error('; '.join(errors))

passthrough = []
if args.output:
    passthrough += ['--output', args.output]
if args.in_place:
    passthrough.append('--in-place')
for name in ('keys_file', 'strategy', 'monthly_limit'):
    value = getattr(args, name)
    if value is not None:
        passthrough += ['--' + name.replace('_', '-'), value]
for pattern in args.exclude:
    passthrough += ['--exclude', pattern]
if args.dry_run:
    passthrough.append('--dry-run')

# Some macOS Python installations ship without their configured CA file.
# Use the system trust store; TLS certificate verification remains enabled.
if not ssl.get_default_verify_paths().cafile and Path('/etc/ssl/cert.pem').is_file():
    os.environ.setdefault('SSL_CERT_FILE', '/etc/ssl/cert.pem')
raise SystemExit(subprocess.call([
    sys.executable, '-u', str(root / '.agents/skills/tinypng-batch/scripts/compress.py'),
    '--cache-dir', args.cache_dir, *passthrough,
    *(str(path) for path in selected),
], cwd=root))

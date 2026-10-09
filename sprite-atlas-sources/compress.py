#!/usr/bin/env python3
"""Run the project's tinypng-batch skill on the reviewed final atlas list."""
import json
import os
import ssl
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
inputs = json.loads(Path(__file__).with_name('compression-inputs.json').read_text())
# Some macOS Python installations ship without their configured CA file.
# Use the system trust store; TLS certificate verification remains enabled.
if not ssl.get_default_verify_paths().cafile and Path('/etc/ssl/cert.pem').is_file():
    os.environ.setdefault('SSL_CERT_FILE', '/etc/ssl/cert.pem')
raise SystemExit(subprocess.call([
    sys.executable, '-u', str(root / '.agents/skills/tinypng-batch/scripts/compress.py'),
    '--cache-dir', str(root / 'local/tinypng-batch/cache'), *sys.argv[1:],
    *(str(root / path) for path in inputs),
], cwd=root))

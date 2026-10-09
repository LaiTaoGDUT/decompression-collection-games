"""Update the two shipped fonts, keeping the published character set monotonic.
Usage: python project-scripts/fonts/update-fonts.py /path/to/original-CN-TTF-directory
Requires fonttools==4.65.0, Node.js, tsc, rg. Never fetches fonts automatically.
"""
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[2]
source_dir = Path(sys.argv[1])
font_dir = root / 'assets/shared-fonts/fonts'
coverage_file = font_dir / 'coverage.json'
coverage = set(json.loads(coverage_file.read_text())['characters'])
tsc = Path(subprocess.check_output(['which', 'tsc'], text=True).strip()).resolve()
typescript = tsc.parent.parent / 'lib/typescript.js'
with tempfile.TemporaryDirectory() as temp:
    scanned = Path(temp) / 'scan.json'
    subprocess.run(['node', str(root / 'project-scripts/fonts/collect-text.cjs'), str(root), str(typescript), str(scanned)], cwd=root, check=True)
    project = json.loads(scanned.read_text())
    requested = coverage | set(project['characters'])
    originals = {w: TTFont(source_dir / f'ResourceHanRoundedCN-{w}.ttf', recalcTimestamp=False) for w in ['Regular', 'Bold']}
    shared = set.intersection(*(set(f.getBestCmap()) for f in originals.values()))
    missing = requested - {chr(cp) for cp in shared}
    # Decorative star / close symbols absent from the source use system-font labels.
    unexpected = missing - {'✦', '✕'}
    if unexpected:
        raise SystemExit('Source fonts cannot cover: ' + ''.join(sorted(unexpected)))
    retained = requested - missing
    prepared = []
    for weight, font in originals.items():
        source_cmap = font.getBestCmap()
        options = subset.Options(); options.recalc_timestamp = False
        options.name_IDs = ['*']; options.name_languages = ['*']; options.name_legacy = True
        sub = subset.Subsetter(options); sub.populate(unicodes=[ord(c) for c in retained]); sub.subset(font)
        # wx.loadFont returns the internal family. Cocos selects our two real
        # weight assets with Canvas synthetic bold disabled, so sharing a family
        # makes both assets render whichever file WeChat registered last.
        # Give each file one distinct, whitespace-free family/full/PostScript name.
        family = f'DecompressionUIRounded{weight}Level1'
        names = {1: family, 2: weight, 3: family+'-v2', 4: family, 6: family, 16: family, 17: weight}
        for record in font['name'].names:
            if record.nameID in names: record.string = names[record.nameID].encode(record.getEncoding())
        for ident, name in names.items(): font['name'].setName(name, ident, 3, 1, 0x409)
        target = Path(temp) / (weight.lower()+'.ttf'); font.save(target)
        actual = TTFont(target).getBestCmap()
        assert all(ord(c) in actual for c in retained)
        prepared.append((target, font_dir / target.name))
    # Complete both outputs before replacing any shipped file. Do not rewrite unchanged files.
    for src, dst in prepared:
        data = src.read_bytes()
        if not dst.exists() or dst.read_bytes() != data: dst.write_bytes(data)
        print(dst.name, len(data), hashlib.sha256(data).hexdigest())
    actual_shared = set.intersection(*(set(TTFont(dst).getBestCmap()) for _, dst in prepared))
    text = json.dumps({'characters': ''.join(chr(cp) for cp in sorted(actual_shared))}, ensure_ascii=False)+'\n'
    if coverage_file.read_text() != text: coverage_file.write_text(text)
    print('Added characters:', ''.join(sorted(retained - coverage)) or '(none)')

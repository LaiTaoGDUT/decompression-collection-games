const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve('.');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'game2048-layout-'));

try {
    const compile = spawnSync('tsc', [
        path.join(root, 'assets/games/twenty48/scripts/Game2048Layout.ts'),
        '--target', 'ES2020',
        '--module', 'commonjs',
        '--skipLibCheck',
        '--rootDir', root,
        '--outDir', tempRoot,
    ], { encoding: 'utf8' });
    if (compile.status !== 0) {
        process.stderr.write(compile.stderr || compile.stdout || 'tsc failed.\n');
        process.exitCode = compile.status || 1;
        return;
    }

    const layout = require(path.join(
        tempRoot,
        'assets/games/twenty48/scripts/Game2048Layout.js',
    ));
    const cover = layout.calculateGame2048BackgroundCover(750, 1624);
    assert(cover.width >= 750 && cover.height === 1624, 'Background cover must fill the viewport.');
    assert(Math.abs(cover.width / cover.height - 750 / 1334) < 1e-9,
        'Background cover must preserve the source aspect ratio.');

    const normal = layout.calculateGame2048Layout(750, 1334);
    assert.strictEqual(normal.fitScale, 1, 'Design viewport must keep a 1:1 fit-width scale.');
    assert.strictEqual(normal.boardScale, normal.fitScale,
        'A sufficiently tall viewport must keep the design board scale.');
    const boardHorizontalMargin = (750 - layout.GAME_2048_BOARD_NODE_SIZE) / 2;
    assert(boardHorizontalMargin > 0 && boardHorizontalMargin <= 24,
        'Normal board outer margin must stay small while remaining inside the design width.');

    const short = layout.calculateGame2048Layout(750, 700, { safeBottom: 24 });
    assert(short.boardScale < short.fitScale, 'Short viewport must shrink the board.');
    const boardBottom = short.boardY - layout.GAME_2048_BOARD_NODE_SIZE / 2 * short.boardScale;
    const hintBottom = short.hintY - short.hintHeight / 2;
    assert(boardBottom >= -700 / 2 + short.safeBottom - 0.01,
        'Scaled board must stay above the bottom safe area.');
    assert(hintBottom >= -700 / 2 + short.safeBottom - 0.01,
        'Scaled board hint must stay above the bottom safe area.');

    const asymmetric = layout.calculateGame2048Layout(750, 1334, { safeLeft: 32, safeRight: 8 });
    assert.strictEqual(asymmetric.contentX, 12, 'Asymmetric safe areas must shift the content center.');
    assert.strictEqual(asymmetric.titleX, asymmetric.contentX);
    assert.strictEqual(asymmetric.boardX, asymmetric.contentX);

    console.log('game2048_layout=passed, cover=uniform, fit_width=passed, short_board=scaled_to_safe_bottom, asymmetric_safe_center=passed');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

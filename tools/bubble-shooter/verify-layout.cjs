const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-layout-'));
try {
    execFileSync('tsc', [
        'assets/games/bubble-shooter/scripts/BubbleShooterLayout.ts',
        '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck',
    ], { cwd: root, stdio: 'pipe' });
    const { calculateBubbleShooterLayout } = require(path.join(out, 'games/bubble-shooter/scripts/BubbleShooterLayout.js'));
    for (const height of [1000, 1334, 1625, 1800]) {
        const platform = {
            safeArea: { left: 40, right: 710, top: 44, bottom: height - 48, width: 670, height: height - 92 },
            topRightReservedArea: { left: 500, right: 730, top: 50, bottom: 110, width: 230, height: 60 },
        };
        const layout = calculateBubbleShooterLayout(750, height, platform);
        assert(layout.playY + 502 * layout.scale <= height / 2 - 122 - 70);
        assert(layout.playY - 550 * layout.scale >= -height / 2 + 48);
        assert(layout.bossY + 342 * layout.bossScale <= height / 2 - 12, 'Decorative crown fits screen');
        assert(layout.healthY - 16 * layout.scale * .48 > layout.playY + 502 * layout.scale, 'Independent health bar clears counter');
        assert(371 * layout.bossScale < 375, 'Boss fists fit horizontally');
        if (height >= 1334) assert(720 * layout.scale >= 690, 'Standard/tall board occupies at least 92% of screen width');
        assert(layout.backgroundWidth >= 750 && layout.backgroundHeight >= height);
        assert(Math.abs(layout.backgroundWidth / layout.backgroundHeight - 750 / 1800) < 1e-9);
        const fullWidth = calculateBubbleShooterLayout(750, height, {
            ...platform, safeArea: { ...platform.safeArea, left: 0, right: 750, width: 750 },
        });
        assert.deepEqual(layout, fullWidth, 'Horizontal system safe areas must not shrink the game.');
    }
    console.log('BubbleShooter: short/standard/tall screens, vertical safety, cover ratio and full width passed.');
} finally {
    fs.rmSync(out, { recursive: true, force: true });
}

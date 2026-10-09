// Shared by npm verification and the Cocos onBeforeBuild hook.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
function compilerPath() {
    const paths = [root];
    // Cocos desktop/build workers can use the editor's bundled compiler even
    // when they were launched without a terminal's PATH or global tsc.
    if (process.resourcesPath) paths.push(path.join(process.resourcesPath, 'app.asar.unpacked'));
    try { return require.resolve('typescript', { paths }); } catch (_) { /* CLI fallback */ }
    const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
    return path.resolve(path.dirname(compiler), '../lib/typescript.js');
}
function verifyCoverage() {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/app.json'), 'utf8'));
    if (!config.fonts?.enabled) { console.log('font_coverage=skipped: fonts disabled'); return; }
    if (config.fonts.validateCoverage === false) { console.log('font_coverage=skipped: fonts.validateCoverage=false'); return; }
    const { collectProjectText } = require('./collect-text.cjs');
    const scan = collectProjectText(root, compilerPath());
    const covered = new Set(Array.from(JSON.parse(fs.readFileSync(path.join(root, 'assets/shared-fonts/fonts/coverage.json'), 'utf8')).characters));
    // These source-font-missing decorative labels intentionally use system fonts.
    const systemOnly = new Map([
        ['✦', ['assets/lobby/scripts/LobbySettingsPanel.ts']],
        ['✕', ['assets/games/sky-forge/scripts/view/SfCodex.ts', 'assets/games/sky-forge/scripts/view/SfHangar.ts',
            'assets/games/sky-forge/scripts/view/SfPlaneList.ts', 'assets/games/sky-forge/scripts/view/SfUpgrade.ts']],
    ]);
    const missing = Array.from(scan.characters).filter(c => !covered.has(c)
        && !(systemOnly.has(c) && scan.origins[c].every(origin =>
            systemOnly.get(c).some(file => origin.startsWith(file + ':')))));
    if (missing.length) throw Error('字体缺字：\n' + missing.map(c => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}: ${scan.origins[c].join(', ')}`).join('\n') + '\n请运行 project-scripts/fonts/update-fonts.py 更新字库后重建。');
    console.log(`font_coverage=passed: ${scan.files.length} files; ${covered.size} shipped characters`);
}
module.exports = { verifyCoverage };
if (require.main === module) { try { verifyCoverage(); } catch (error) { console.error(error.message); process.exitCode = 1; } }

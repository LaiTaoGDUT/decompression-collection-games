/** Run actual save readers and cloud projection without rendering or player storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
const ts = require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
const compile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
function load(file, dependencies = {}) {
    const context = { exports: {}, require: name => {
        assert.ok(Object.hasOwn(dependencies, name), `Missing dependency ${name}`);
        return dependencies[name];
    } };
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, file), 'utf8')), context);
    return context.exports;
}
const normal = load('assets/games/meowdoku/scripts/MeowdokuLevels.ts');
const hard = load('assets/games/meowdoku/scripts/MeowdokuHardLevels.ts', { './MeowdokuLevels': normal });
const codec = load('assets/services/cloud/CloudSaveCodec.ts');
const { projectGame, restoreGame, moduleRank } = load('assets/services/cloud/CloudSaveProjection.ts', {
    './CloudSaveCodec': codec,
});
const schema = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/cloud-save.json'), 'utf8'))
    .games.find(game => game.gameId === 'meowdoku');
const source = ts.createSourceFile('game.ts', fs.readFileSync(path.join(root,
    'assets/games/meowdoku/scripts/MeowdokuGame.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'MeowdokuGame');
const names = ['readSave', 'readClearedLevel', 'readGeniusClears', 'isValidCellSnapshot', 'levelIndexOf',
    'clampLevel', 'clearPendingProgress', 'levelDefinitions', 'lifeLimit', 'mergeLevelChallengeHistory'];
const methods = cls.members.filter(node => node.name && names.includes(node.name.getText(source)))
    .map(node => node.getText(source));
assert.equal(methods.length, names.length);
const version = source.statements.filter(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(d => d.name.getText(source) === 'MEOWDOKU_DATA_VERSION'))
    .map(node => node.getText(source)).join('\n');
const context = { exports: {}, ...normal, ...hard, MEOWDOKU_DEFAULT_LIVES: 3 };
vm.runInNewContext(compile(`${version}\nclass Probe { ${methods.join('\n')} } exports.Probe = Probe;`), context);
function read(custom, requestedMode, dataVersion = schema.dataVersion) {
    const game = new context.exports.Probe();
    game.context = { gameId: 'meowdoku', services: { storage: {
        getGameData: () => ({ dataVersion, playCount: 0, custom }),
    } } };
    game.readSave(requestedMode);
    return game;
}
const level = game => game.levelDefinitions()[game.levelIndex].level;
const plain = value => JSON.parse(JSON.stringify(value));

// Missing continuation must use confirmed clears, never the trophy target or an unlocked-only record.
for (const cleared of [0, 499, 500, 501, 2000, 3000]) {
    assert.equal(level(read({ meowdokuCleared: cleared })), Math.min(cleared + 1, schema.numbers[0].max));
}
assert.equal(level(read({ meowdokuUnlocked: 501 })), 1);
for (const progress of [null, [], {}, { level: '501' }, { level: 0 }, { level: -1 }, { level: NaN },
    { level: Infinity }, { level: 502 }, { level: schema.numbers[0].max + 1 }, { level: 1.5 }]) {
    assert.equal(level(read({ meowdokuCleared: 500, meowdokuProgress: progress })), 501);
    const game = read({ meowdokuCleared: 500, meowdokuProgress: {
        ...progress, cells: Array(100).fill('mark'), lives: 1, score: 99, combo: 2, stepsUsed: 12,
        challenge: { manualMarksUsed: true, draftUsed: true, wrongGuessMade: true },
    } });
    assert.equal(level(game), 501);
    assert.equal(game.pendingLevelCells, undefined, 'An invalid level cannot lend its board to the fallback level');
    assert.equal(game.pendingChallenge, undefined);
    assert.equal(game.pendingLives, undefined);
    assert.equal(game.pendingScoreValue, undefined);
    assert.deepEqual(plain(game.levelChallengeHistories), {});
}
// Deliberate replay is valid, including replaying level 1 after earning the trophy.
for (const current of [1, 12, 500, 501]) {
    const size = normal.MEOWDOKU_LEVELS[current - 1].size;
    const cells = Array(size * size).fill('empty'); cells[1] = 'mark';
    const game = read({ meowdokuCleared: 500, meowdokuProgress: {
        level: current, cells, lives: 2, score: 180, combo: 3, stepsUsed: 5,
    } });
    assert.equal(level(game), current);
    assert.deepEqual(plain(game.pendingLevelCells), cells);
    assert.equal(game.pendingLives, 2);
    assert.equal(game.pendingScoreValue, 180);
}
const dual = { meowdokuCleared: 500, meowdokuHard: { cleared: 24 } };
assert.equal(level(read(dual, 'normal')), 501);
assert.equal(level(read(dual, 'hard')), 25);

// A local catalog edit invalidates only state that describes the replaced board.
for (const [mode, levels] of [['normal', normal.MEOWDOKU_LEVELS], ['hard', hard.MEOWDOKU_HARD_LEVELS]]) {
    const changed = levels.find(p => p.revision === 1), unchanged = levels.find(p => !p.revision);
    assert.ok(changed && unchanged);
    const cases = [
        [changed, undefined, false], [unchanged, undefined, true], [changed, changed.revision, true],
        [unchanged, 1, true],
    ];
    if (mode === 'hard') {
        const latest = levels.find(p => p.revision === 2);
        assert.ok(latest);
        cases.push([latest, undefined, false], [latest, 1, false], [latest, 2, true]);
    }
    for (const [definition, revision, resumes] of cases) {
        const { level: current, size } = definition;
        const cells = Array(size*size).fill('empty'); cells[1] = 'mark';
        const usage = { manualMarksUsed:true, draftUsed:false, wrongGuessMade:false };
        const progress = { level:current, cells, lives:1, score:50, challenge:usage };
        const history = { [current]:usage }, fails = { [current]:2 }, honors = { [current]:true };
        const custom = mode === 'normal' ? {
            meowdokuBankRevision:revision, meowdokuCleared:current, meowdokuProgress:progress,
            meowdokuChallengeHistory:history, meowdokuFails:fails, meowdokuGeniusClears:honors,
        } : { meowdokuHard:{ bankRevision:revision, cleared:current, progress, fails, geniusClears:honors, challengeHistory:history } };
        const game = read(custom,mode);
        assert.equal(level(game),current);
        assert.equal(game.clearedLevel,current);
        assert.equal(game.geniusClearedLevels[current],true);
        assert.equal(game.pendingScoreValue,resumes ? 50 : undefined);
        assert.equal(game.failCounts[current],resumes ? 2 : undefined);
        assert.equal(!!game.levelChallengeHistories[current],resumes);
        assert.deepEqual(game.pendingLevelCells && plain(game.pendingLevelCells),resumes ? cells : undefined);
    }
}

// Production client/server projection keeps both complete banks beyond the trophy boundary.
assert.equal(schema.numbers[0].max, normal.MEOWDOKU_LEVELS.length);
assert.equal(schema.numbers[1].max, hard.MEOWDOKU_HARD_LEVELS.length);
for (const cleared of [499, 500, 501, 2000, 2999, 3000, 3500]) {
    const save = { dataVersion: schema.dataVersion, playCount: 12, custom: {
        meowdokuCleared: cleared, meowdokuHard: { cleared: schema.numbers[1].max },
    } };
    const payload = projectGame(schema, save), restored = restoreGame(schema, payload);
    assert.equal(moduleRank(schema, payload), cleared + schema.numbers[1].max);
    assert.equal(restored.custom.meowdokuCleared, cleared);
    assert.equal(restored.custom.meowdokuUnlocked, Math.min(cleared + 1, schema.numbers[0].max));
    assert.equal(level(read(restored.custom, 'normal')), Math.min(cleared + 1, schema.numbers[0].max));
    assert.equal(level(read(restored.custom, 'hard')), schema.numbers[1].max);
}
assert.equal(hard.MEOWDOKU_HARD_LEVELS.length, 300);
const extended = restoreGame(schema, codec.encodeModule([0, 275]));
assert.equal(extended.custom.meowdokuHard.unlocked, 276);
assert.equal(level(read(extended.custom, 'hard')), 276);
for (const oldVersion of [7, 8]) {
    assert.equal(level(read(dual, 'normal', oldVersion)), 1);
    assert.equal(level(read(dual, 'hard', oldVersion)), 1);
    assert.equal(projectGame(schema, { dataVersion: oldVersion, playCount: 12, custom: dual }), undefined);
}
console.log('PASS: save version reset, fallback and replay, independent modes, and both complete cloud banks.');

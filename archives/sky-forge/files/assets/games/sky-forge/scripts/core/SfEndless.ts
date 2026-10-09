import type { LevelDef, WaveEvent } from './SfLevelTypes';
import { CHAPTERS } from './SfLevels';
import { SfRandom } from './SfRandom';

/**
 * 无尽模式（DESIGN.md §1）：每段约 70 秒编队 + 1 个 Boss，段数越高越难。
 * 每 3 段（小 / 中 / 大 Boss 一轮）使用同一章节：编队从该章关卡里随机抽取 12 秒左右的片段拼接，
 * Boss 取该章同级别的 Boss，场景也换成该章；章节按已开放顺序轮换，起始章节由种子决定。
 * 大 Boss 位有 2% 概率换成隐藏 Boss。
 */
export function endlessSector(sector: number, seed: number): { level: LevelDef; difficulty: number } {
    const rng = new SfRandom(seed + sector * 7919);
    const open = CHAPTERS.filter(c => c.available);
    const first = new SfRandom(seed).int(0, open.length - 1);
    const chapter = open[(first + Math.floor((sector - 1) / 3)) % open.length];
    const levels = chapter.levels;
    const waves: WaveEvent[] = [];
    let t = 0;
    while (t < 66) {
        const source = rng.pick(levels);
        const start = rng.range(0, Math.max(1, source.bossAt - 18));
        const segment = source.waves.filter(w => w.t >= start && w.t < start + 12);
        for (const w of segment) waves.push({ ...w, t: t + (w.t - start) });
        t += 12;
        if (rng.chance(0.35)) {
            waves.push({ t: t - 4, f: 'carrier', e: 'carrier', side: rng.sign() as -1 | 1, drop: rng.pick(['main', 'wing', 'special', 'fire']) });
        }
    }
    if (rng.chance(0.25)) waves.push({ t: rng.range(20, 50), f: 'mimic', e: 'mimic', side: rng.sign() as -1 | 1 });
    // Boss 按小 / 中 / 大循环，取本章同级别的 Boss；大 Boss 位有 2% 概率换成隐藏 Boss。
    const tier = (sector - 1) % 3 === 0 ? 'small' : (sector - 1) % 3 === 1 ? 'mid' : 'big';
    const pool = levels.filter(l => l.tier === tier).map(l => l.boss);
    let boss = rng.pick(pool);
    if (tier === 'big' && rng.chance(0.02)) boss = `${boss}-hidden`;
    const level: LevelDef = {
        id: 'endless', chapter: chapter.id, index: sector, number: 4 + sector, name: `无尽 · 第 ${sector} 段`,
        boss, tier: boss.indexOf('hidden') > 0 ? 'hidden' : tier, bossAt: 70, waves, scroll: 78 + Math.min(40, sector * 3),
        starScore: 0,
    };
    return { level, difficulty: 3 + sector * 1.25 };
}

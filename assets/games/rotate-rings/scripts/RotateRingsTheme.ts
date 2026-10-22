import { ORIGINAL_RING_CONFIG as SOURCE } from './RotateRingsOriginalConfig';

/** 冻结主题「晴空糖环」：休闲卡通、轻立体糖果质感，全部图片素材为本作自绘（生图）后合图。
 * 色板：桃奶油底、天蓝主色、橙色强调（困难模式与当前关）、白色卡片配天蓝粗描边、深蓝灰文字与图标。
 * 控件：胶囊按钮（顶部高光 + 厚底边）、陶瓷 C 形环关卡格（与棋盘圆环同一材质）、圆形白钮、白卡弹窗配蓝色标题条。
 * 本作没有分数与星级：关内顶部只显示关卡号与解环进度条；通关为全屏结算页，只有「下一关」一个按钮。
 * 圆环沿用原网格、法线与阴影距离场以保证形状不变；表面贴图与七色釉色按本主题重绘，烘焙原色统一经 ringSkinColor 转换。
 * 入场波浪/受阻回弹、弹窗和连击沿用原动画曲线；三档连击女声独立复制猫咪数独对应成品，音效与配音走本游戏音效合包。
 */
export const RING_THEME = Object.freeze({
    name: '晴空糖环', background: '#FFF3E6', ink: '#2F3D5C', muted: '#7884A0',
    primary: '#3D9BFF', hard: '#FF8A3A', gold: '#FFC83D',
    /** 主色加深：全屏通关页白字标题的描边。 */
    primaryDeep: '#1E6FD0', hardDeep: '#D9621A',
    lockedText: '#A3AEC2', disabledTint: '#C5CCDA', dim: '#2A3350', shadow: '#2F3D5C',
    /** 未解锁关卡格的陶瓷釉色、关内进度条底槽色。 */
    lockedRing: '#D9DEE8', track: '#E9DCCD',
    /** 棋盘物件的投影：向右下偏移（棋盘单位），网格与精灵共用颜色和透明度；偏移与柔化足以读出物件离开盘面的高度。 */
    boardShadow: { offsetX: .07, offsetY: -.22, softness: .42, spread: -.14, alpha: .34 },
    colors: ['#FF9A3C', '#3CC0F0', '#A46AF2', '#FF5B60', '#86D45A', '#5A82FF', '#FF74B4'],
    modeNames: { normal: '普通模式', hard: '困难模式' },
});
/** 关卡网格烘焙的原七色 → 本主题七色；原绿色换成粉色。 */
const RING_SKIN_PALETTE: Readonly<Record<string, string>> = Object.freeze({
    '#EC8F2E': RING_THEME.colors[0], '#32AFDD': RING_THEME.colors[1], '#984BE0': RING_THEME.colors[2],
    '#DD433E': RING_THEME.colors[3], '#6AC53E': RING_THEME.colors[4], '#4E77DD': RING_THEME.colors[5],
    '#23A468': RING_THEME.colors[6],
});
export function ringSkinColor(baked: string): string {
    const color = RING_SKIN_PALETTE[baked.toUpperCase()];
    if (!color) throw new Error(`Unknown RotateRings baked color: ${baked}`);
    return color;
}
/** 声音「晴空瓷环」：真实瓷盘/玻璃录音做材质声，竖琴、颤音琴、拨弦按 D 大调做乐音；关内与选关两首原创循环。
 * 制作脚本见 tools/audio/rotate-rings；连击三档女声沿用独立复制的猫咪数独成品。 */
export const RING_AUDIO = Object.freeze({
    bundle: 'game-rotate-rings-assets', alwaysLoad: true, music: 'visual/audio/rings-play-loop-v2', musicVolume: .5,
    packedEffects: 'visual/audio/rings-effects',
    cues: { uiButton: 'visual/audio/rings-ui-tap-v2', drop: Array.from({ length: 5 }, (_, i) => `visual/audio/rings-turn-${i + 1}-v2`),
        collision: 'visual/audio/rings-blocked-v2', milestone: 'visual/audio/rings-win-v2',
        // merge：卡扣脱开但没有部件消除时的轻提示；只有真正消除才播放 record 碎裂声。
        fold: 'visual/audio/rings-slide-v2', merge: 'visual/audio/rings-unlatch-v2',
        toggle: 'visual/audio/rings-hint-v2', voice1: 'visual/audio/rr_vo_good',
        voice2: 'visual/audio/rr_vo_great', voice3: 'visual/audio/rr_vo_excellent',
        record: Array.from({ length: 3 }, (_, i) => `visual/audio/rings-break-${i + 1}-v2`), danger: 'visual/audio/rings-bomb-v2',
        voice9: 'visual/audio/rings-start-v2' },
    pooledCues: ['drop', 'collision', 'fold', 'merge', 'record', 'danger'] as const,
});
/** 选关页循环（与关内同一主题旋律的竖琴版）。 */
export const RING_TITLE_MUSIC = 'visual/audio/rings-title-loop-v2';

/** 保留三档评价规则；Nice/Great/Excellent 与本游戏独立复制的女声一一对应。 */
export const RING_ENCOURAGEMENTS = Object.freeze([
    { key: 'good', text: 'Nice', color: '#4CC25B', voice: 'voice1' },
    { key: 'great', text: 'Great', color: '#3D9BFF', voice: 'voice2' },
    { key: 'excellent', text: 'Excellent', color: '#A46AF2', voice: 'voice3' },
] as const);
export type RingEncouragementKey = typeof RING_ENCOURAGEMENTS[number]['key'];

/** 原版 GameplayOperationScoreCalculator：本次消除件数分 + 连续消除奖励 + 未消除间隔扣分（不计穿环分）；
 * 总分低于 41 不提示，41–59 Nice，60–80 Great，81 起 Excellent。streak 为含本次的连续消除操作数，misses 为本次之前连续未消除的操作数。 */
export function ringComboTier(streak: number, released: number, misses: number): number {
    const c = SOURCE.comboScore, pick = (values: readonly number[], index: number) => values[Math.max(0, Math.min(values.length - 1, index))];
    const score = pick(c.releaseScores, released - 1) + pick(c.streakBonuses, streak - 1) + pick(c.missPenalties, misses);
    return c.thresholds.filter(threshold => score >= threshold).length - 1;
}

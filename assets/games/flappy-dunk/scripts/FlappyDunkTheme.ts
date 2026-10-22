import type { DunkParticlePalette } from './FlappyDunkParticles';

/** Frozen theme「Flappy Dunk · 月夜天台」(docs/games/flappy-dunk-moonlit-rooftop.md).
 * A quiet city night on the rooftops, played from dusk to dawn. Light comes only from
 * warm windows, street lamps and the moon: no neon tubes, glowing signs or neon pink/purple.
 * Chalk score glyphs, painted ball/wings/net/fan/amulet, grey rims tinted at runtime.
 */
export const DUNK_THEME = Object.freeze({
    name: 'Flappy Dunk · 月夜天台',
    ink: '#F4EBD0', muted: '#9AA6BF', inkDark: '#1B2236',
    panel: '#1F2A40', panelLine: '#3C4C6E', secondary: '#2E3C5C', veil: '#0B1020',
    lamp: '#FFC872', lampDim: '#C98B4A', moon: '#F4EBD0', moonlight: '#CFE0F5',
    rim: '#E2562F', rimInverted: '#8FB3D9', shield: '#A8E0D6',
    /** Floor and top bands sit a step lighter than the nearest silhouettes, capped by a moonlit concrete edge. */
    roof: '#182033', roofEdge: '#2A3654', roofCap: '#56668A', roofCapLight: '#B9C4DC', courtLine: '#F2EEE6',
    silhouetteShade: '#05070F',
    danger: '#E06A5A', white: '#FFFFFF',
    difficulties: ['普通', '困难', '极限'],
    /** In-game call-outs, drawn with the chalk bitmap font (Chinese glyphs included in the atlas). */
    hud: { swish: '空心入网', shield: '护盾生效', combo: '连击×' },
    failure: { floor: '落到天台上了', roof: '撞上电线了', miss: '错过篮圈了', direction: '穿圈方向反了', hazard: '被排风扇打到了' },
});

/** Swish-chain tiers. The original recolours the ball (orange → gold → navy); here the chain climbs one
 * tier every two swishes through five: painted orange, amber gold (×2–3), moonlight blue (×4–5), pearl
 * silver (×6–7) and ember red (×8 and up). The ball frame, its glow, ribbon trail and sparks share the tier colour. */
export const DUNK_CHAIN_TIERS = Object.freeze([
    { ball: 'Ball', trail: DUNK_THEME.moon, trailAlpha: .32, core: false, glow: 0, sparks: '' },
    { ball: 'Ball_2', trail: DUNK_THEME.lamp, trailAlpha: .55, core: true, glow: .42, sparks: 'trailGold' },
    { ball: 'Ball_3', trail: '#9EC3F0', trailAlpha: .6, core: true, glow: .5, sparks: 'trail2' },
    { ball: 'Ball_4', trail: '#E8EEF8', trailAlpha: .65, core: true, glow: .55, sparks: 'trailSilver' },
    { ball: 'Ball_5', trail: '#FF7A4A', trailAlpha: .7, core: true, glow: .62, sparks: 'trailEmber' },
]);
export function dunkChainTier(multiplier: number): number {
    return Math.min(DUNK_CHAIN_TIERS.length - 1, Math.floor(Math.max(1, multiplier) / 2));
}

/** One time-of-day stage; the city falls asleep as the score climbs, then dawn breaks. */
export interface DunkTimeStage {
    readonly score: number; readonly name: string;
    readonly skyTop: string; readonly skyBottom: string;
    /** Share of windows lit, 0–1. */ readonly lit: number;
    /** Star opacity, 0–1. */ readonly stars: number;
    /** Moon height above the skyline, 0 (low) – 1 (zenith). */ readonly moonHeight: number;
    readonly moonAlpha: number;
}

export const DUNK_TIME_STAGES: readonly DunkTimeStage[] = Object.freeze([
    { score: 0, name: '黄昏', skyTop: '#3B3F6B', skyBottom: '#E98A5C', lit: .2, stars: 0, moonHeight: .1, moonAlpha: .35 },
    { score: 50, name: '蓝调时刻', skyTop: '#2A3566', skyBottom: '#6F7FB0', lit: .45, stars: .25, moonHeight: .35, moonAlpha: .8 },
    { score: 100, name: '入夜', skyTop: '#1E2850', skyBottom: '#3D4C7E', lit: .7, stars: .7, moonHeight: .65, moonAlpha: 1 },
    { score: 150, name: '深夜', skyTop: '#151D3D', skyBottom: '#2B3762', lit: .6, stars: 1, moonHeight: 1, moonAlpha: 1 },
    { score: 200, name: '午夜', skyTop: '#0F1530', skyBottom: '#1F2850', lit: .35, stars: 1, moonHeight: 1, moonAlpha: 1 },
    { score: 250, name: '凌晨', skyTop: '#121A36', skyBottom: '#33406A', lit: .2, stars: .6, moonHeight: .7, moonAlpha: 1 },
    { score: 300, name: '破晓', skyTop: '#2A3462', skyBottom: '#8C8DB4', lit: .1, stars: .25, moonHeight: .35, moonAlpha: .7 },
    { score: 350, name: '晨曦', skyTop: '#4C5A8C', skyBottom: '#F2B38A', lit: .05, stars: 0, moonHeight: .15, moonAlpha: .2 },
]);
export const DUNK_TIME_TRANSITION = 1.2;
/** Silhouette layers darken the mid-sky hue towards silhouetteShade by these shares (far → near). */
export const DUNK_SKYLINE_SHADE = Object.freeze({ far: .45, mid: .62, near: .78 });
/** The city is pushed back: its hue loses this share of saturation and lit windows stay dim,
 * so the warm ball, rims and lamp-yellow UI never melt into the background. */
export const DUNK_SKYLINE_DESATURATE = .55;
export const DUNK_WINDOW_ALPHA = Object.freeze([.3, .42, .5]);

/** Native particle groups recoloured to the night palette; alpha and timing keep the source curves.
 * `glow` scales the alpha of additive emitters only: on the night sky additive light blooms far more than
 * on the original desert, so glows are dimmed rather than resized. Only the chain trails around the ball
 * are reshaped: `size` and `spread` keep their sparks small and close to the ball instead of a loose cloud. */
export const DUNK_PARTICLE_PALETTE: DunkParticlePalette = Object.freeze({
    jump: { tint: [DUNK_THEME.moon] },
    score: { tint: [DUNK_THEME.white], life: [DUNK_THEME.lamp, DUNK_THEME.moon] },
    swish: { tint: [DUNK_THEME.lamp], life: [DUNK_THEME.lamp, DUNK_THEME.moon, DUNK_THEME.lampDim], glow: .5 },
    power: { tint: [DUNK_THEME.moon], life: [DUNK_THEME.moonlight, DUNK_THEME.moon, DUNK_THEME.lampDim], glow: .5 },
    trail1: { tint: [DUNK_THEME.lamp], life: [DUNK_THEME.lamp, DUNK_THEME.lampDim], spread: .5 },
    trail2: { tint: [DUNK_THEME.moonlight], life: [DUNK_THEME.white, DUNK_THEME.moonlight, '#9EC3F0'], glow: .55, size: .6, spread: .35 },
    /** ×2 embers: the same tight spark emitters as ×3, in lamp gold. */
    trailGold: { source: 'trail2', tint: [DUNK_THEME.lamp], life: ['#FFF1C9', DUNK_THEME.lamp, DUNK_THEME.lampDim], glow: .5, size: .5, spread: .3 },
    trailSilver: { source: 'trail2', tint: [DUNK_THEME.white], life: [DUNK_THEME.white, '#E8EEF8', DUNK_THEME.moonlight], glow: .6, size: .6, spread: .4 },
    trailEmber: { source: 'trail2', tint: ['#FF7A4A'], life: ['#FFE1B0', '#FF7A4A', '#C23A1E'], glow: .6, size: .65, spread: .45 },
    fireBack: { tint: [DUNK_THEME.lampDim, DUNK_THEME.lamp], glow: .55 },
    fireFront: { tint: [DUNK_THEME.lampDim, DUNK_THEME.lamp], glow: .55 },
    /** Up arrows under an upside-down rim: bright moonlight so they read against the dark city. */
    inverted: { tint: [DUNK_THEME.moonlight] },
    shieldLost: { tint: [DUNK_THEME.shield], life: [DUNK_THEME.shield, DUNK_THEME.moon], glow: .6 },
});

export const DUNK_AUDIO = Object.freeze({
    bundle: 'game-flappy-dunk-assets', alwaysLoad: true,
    packedEffects: 'visual/audio/dunk-effects',
    cues: { drop: ['visual/audio/jump-1', 'visual/audio/jump-2', 'visual/audio/jump-3'],
        uiButton: 'visual/audio/ui-tap-v1', collision: 'visual/audio/rim', merge: 'visual/audio/score',
        chain: 'visual/audio/swish', milestone: 'visual/audio/shield', failure: 'visual/audio/finish' },
    pooledCues: ['drop', 'uiButton', 'collision', 'merge', 'chain', 'milestone', 'failure'] as const,
});

/** Night ambience: distant traffic hum, sparse insects, wind on the railings. */
export const DUNK_AMBIENCE = Object.freeze({ path: 'visual/audio/night-ambience-loop-v1', volume: .3, fadeSeconds: 1 });

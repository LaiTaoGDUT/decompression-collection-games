import type { Side } from './SlingPuckModel';

/** Frozen theme: 冰台 — pale ash wood, frost blue rink, calm navy gradient, coral/turquoise accents.
 * Floating pictograms, small digits, round lacquer controls; no large menu panels or HUD plaques.
 * Local play mirrors each player's controls and messages across the same physical arena.
 */
export const SLING_THEME = Object.freeze({
    name: '冰台',
    table: '#102B47', ink: '#1E2228', inkSoft: '#4A515B',
    teal: '#20D9ED', tealDeep: '#138CA6', coral: '#FF8069', coralDeep: '#DA4E42',
    brass: '#E2B660', white: '#FFFFFF', paper: '#F4EEE4', muted: '#B5CDDF', faint: '#819EB7',
    ice: '#EAF6FF', danger: '#FF6B57', good: '#7FE3B0', shade: '#050607',
});

export const SIDE_COLOR: Readonly<Record<Side, string>> = Object.freeze({ south: SLING_THEME.teal, north: SLING_THEME.coral });
export const SIDE_DEEP: Readonly<Record<Side, string>> = Object.freeze({ south: SLING_THEME.tealDeep, north: SLING_THEME.coralDeep });

export const SLING_FRAMES = Object.freeze({
    table: 'visual/materials/slate',
    board: 'visual/board/ice-table',
    nearRail: 'visual/board/near-rail',
    divider: 'visual/board/divider',
    puck: 'visual/objects/puck',
    puckIvory: 'visual/objects/puck-ivory',
    ring: 'visual/objects/puck-ring',
    shadow: 'visual/objects/puck-shadow',
    glow: 'visual/objects/soft-glow',
    ripple: 'visual/objects/ripple',
    shard: 'visual/objects/ice-shard',
    twinkle: 'visual/objects/twinkle',
    buttonRound: 'visual/ui/button-round',
    buttonPrimary: 'visual/ui/button-primary',
    trophy: 'visual/ui/trophy',
    medalSouth: 'visual/ui/medal-south',
    medalNorth: 'visual/ui/medal-north',
    medalBot: 'visual/ui/medal-bot',
    logo: 'visual/ui/logo',
    miniBoard: 'visual/ui/mini-board',
    modeRobot: 'visual/ui/mode-robot',
    modeToken: 'visual/ui/mode-token',
    modePlayers: 'visual/ui/mode-players',
    chipOn: 'visual/ui/chip-on',
    chipOff: 'visual/ui/chip-off',
    countdownMedal: 'visual/ui/countdown-medal',
    tutorialHand: 'visual/ui/tutorial-hand',
});
export type SlingFrame = keyof typeof SLING_FRAMES;

/** Design size of the slate table, cover-filled without stretching. */
export const SLING_TABLE = Object.freeze({ width: 750, height: 1334 });

/** Sound direction: a cold, glassy arena. Puck clacks and rail thumps are short synthesised hits with
 * an ice-hall reverb tail; the band is a rubbery twang; the gate is an airy whoosh with a bright shimmer;
 * crowd-free stingers on a mallet/bell kit in E minor. Music: an original 112 BPM electro-pop loop kept
 * under the effects. Rendered by tools/sling-puck/make-audio.py; cue keys are generic slots:
 * collision = puck on puck (variant by impulse), drop = rail/divider thump, toggle = band launch
 * (variant by power), chain = gate pass, record = clean shot, merge / danger = round won / lost,
 * milestone / failure = match won / lost, popup = countdown tick, continue = round start,
 * fold = puck grab, uiButton = button tap.
 */
export const SLING_AUDIO = Object.freeze({
    bundle: 'game-sling-puck-assets', alwaysLoad: true,
    music: 'visual/audio/ice-table-loop-v1', musicVolume: .32,
    packedEffects: 'visual/audio/sling-puck-effects',
    cues: {
        collision: ['visual/audio/clack-soft-v1', 'visual/audio/clack-hard-v1'],
        drop: ['visual/audio/rail-v1'],
        toggle: ['visual/audio/launch-soft-v1', 'visual/audio/launch-hard-v1'],
        chain: 'visual/audio/gate-v1', record: 'visual/audio/clean-v1',
        merge: 'visual/audio/round-win-v1', danger: 'visual/audio/round-lose-v1',
        milestone: 'visual/audio/match-win-v1', failure: 'visual/audio/match-lose-v1',
        popup: 'visual/audio/tick-v1', continue: 'visual/audio/go-v1',
        fold: 'visual/audio/grab-v1', uiButton: 'visual/audio/ui-tap-v1',
    },
    pooledCues: ['collision', 'drop', 'toggle', 'chain', 'record', 'merge', 'danger', 'milestone', 'failure',
        'popup', 'continue', 'fold', 'uiButton'] as const,
});

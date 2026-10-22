/** Frozen visual ownership: 夜场中央台 (Night Session · Center Court).
 * Keywords: tournament night session, spotlight, claret sports floor, ITTF blue
 * table, orange match ball, red vs black rubber, wooden handles, flip scoreboard.
 * Composition: arena floor image cover-fills the screen; the blue table floats in a
 * spotlight with a drop shadow and front apron; the HUD is a charcoal flip scoreboard
 * with cream number cards, binder rings and 7 progress pips per side, flanked by
 * dark glass round buttons. Panels are dark glass with a warm gold hairline;
 * primary actions are orange pills with a pressed lip. Score changes flip the card;
 * points show a short centre-court banner. No looping UI effects compete with play.
 */
export const PINGPONG_THEME = Object.freeze({
    name: '夜场中央台',
    floor: '#2A0E16', floorDeep: '#14060B',
    table: '#1E56B0', tableSheen: '#2D6BCB', tableApron: '#0F2D66', tableShadow: '#07020A', tableLine: '#F4F6FA',
    net: '#0B1222', netTape: '#F4F6FA', netPost: '#2B2F38',
    ball: '#FF8A24', ballRim: '#B9501A', ballHighlight: '#FFF1DE', ballShadow: '#04102B', trail: '#FFC88E',
    impact: '#FFFFFF',
    red: '#E53A2F', black: '#2B2B33', blackAccent: '#B7BCC8',
    board: '#17131A', boardEdge: '#2E2830', card: '#F3EDE2', cardShade: '#DCD3C4', cardInk: '#1A1619', ring: '#8B8592',
    cream: '#FFF3E2', gold: '#E8B86A', muted: '#C7A5AB', faint: '#8E6D74',
    glass: '#1A0B11', glassEdge: '#5B3A3F', shade: '#080205',
    orange: '#FF8A24', orangeLip: '#B8561A', orangeInk: '#2A1208',
    difficulties: ['入门', '进阶', '高手'],
});
/** Sound direction: an indoor hall at night. Racket hits and table bounces are strikes cut from a
 * recorded rally (credited in THIRD_PARTY_NOTICES.md), SoundFont marimba in D major and applause that
 * dies away into one shared hall reverb. Music: an original 100 BPM neo-soul groove in D major
 * (electric piano, fingered bass, brushes, jazz guitar), kept under the effects.
 * Rendered by tools/pingpong/make-audio.py and make-music.py; cue keys are generic slots:
 * collision = racket hit (variant 0/1/2 by stroke power), drop = table bounce, popup = match start
 * chord, fold = scoreboard flip, merge / danger = point won / lost,
 * milestone / failure = match won / lost, uiButton = button tap.
 */
export const PINGPONG_AUDIO = Object.freeze({
    bundle: 'game-pingpong-assets', alwaysLoad: true,
    music: 'visual/audio/court-groove-loop-v1', musicVolume: .3,
    packedEffects: 'visual/audio/pingpong-effects',
    cues: {
        collision: ['visual/audio/hit-soft-v1', 'visual/audio/hit-mid-v1', 'visual/audio/hit-hard-v1'],
        drop: ['visual/audio/bounce-1-v1', 'visual/audio/bounce-2-v1'],
        popup: 'visual/audio/match-start-v1', fold: 'visual/audio/flip-v1',
        merge: 'visual/audio/point-win-v1', danger: 'visual/audio/point-lose-v1',
        milestone: 'visual/audio/match-win-v1', failure: 'visual/audio/match-lose-v1', uiButton: 'visual/audio/ui-tap-v1',
    },
    pooledCues: ['collision', 'drop', 'popup', 'fold', 'merge', 'danger', 'milestone', 'failure', 'uiButton'] as const,
});
/** Stroke power (model shot.power) at which the medium and hard racket sounds take over. */
export const PINGPONG_HIT_TIERS = Object.freeze([.2, .55]);

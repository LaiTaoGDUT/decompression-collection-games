import type { PlaneId } from '../core/SfTypes';

export type SoundLane = 'shot' | 'impact' | 'critical' | 'ui';
export interface SoundCue {
    gain: number;
    interval: number;
    lane: SoundLane;
    priority: number;
    duck: number;
    hold: number;
}

const cue = (gain: number, interval: number, lane: SoundLane, priority = 0, duck = 1, hold = 0): SoundCue =>
    ({ gain, interval, lane, priority, duck, hold });

/** 机体明确声明武器声音，新增机体时由 TypeScript 检查覆盖；不拼接文件名猜资源。 */
export const PLANE_AUDIO: Readonly<Record<PlaneId, { main: string; wing: string; special: string; ultimate: string; engine: string }>> = {
    vanguard: { main: 'shot-vanguard', wing: 'shot-wing-light', special: 'rocket', ultimate: 'ultimate-heavy', engine: 'amb-engine-light' },
    thunder: { main: 'shot-thunder', wing: 'shot-wing-heavy', special: 'shot-special-heavy', ultimate: 'ultimate-heavy', engine: 'amb-engine-heavy' },
    falcon: { main: 'shot-falcon', wing: 'missile', special: 'missile', ultimate: 'ultimate-heavy', engine: 'amb-engine-light' },
    lightning: { main: 'shot-lightning', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-storm', engine: 'amb-engine-energy' },
    frost: { main: 'shot-frost', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-energy', engine: 'amb-engine-energy' },
    phantom: { main: 'shot-phantom', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-energy', engine: 'amb-engine-energy' },
    dawn: { main: 'shot-dawn', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-energy', engine: 'amb-engine-energy' },
    wildgoose: { main: 'shot-wildgoose', wing: 'shot-wing-light', special: 'rocket', ultimate: 'ultimate-heavy', engine: 'amb-engine-light' },
    blackhole: { main: 'shot-blackhole', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-energy', engine: 'amb-engine-energy' },
    swordfish: { main: 'shot-swordfish', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-blade', engine: 'amb-engine-light' },
    dragon: { main: 'shot-dragon', wing: 'shot-wing-heavy', special: 'rocket', ultimate: 'ultimate-storm', engine: 'amb-engine-heavy' },
    chakram: { main: 'shot-chakram', wing: 'shot-wing-energy', special: 'shot-special-energy', ultimate: 'ultimate-blade', engine: 'amb-engine-energy' },
};

export const CUES: Readonly<Record<string, SoundCue>> = {
    'shot-vanguard': cue(.4, .12, 'shot'), 'shot-thunder': cue(.48, .18, 'shot'), 'shot-falcon': cue(.34, .11, 'shot'),
    'shot-lightning': cue(.4, .14, 'shot'), 'shot-frost': cue(.4, .14, 'shot'), 'shot-phantom': cue(.4, .14, 'shot'),
    'shot-dawn': cue(.4, .3, 'shot'), 'shot-wildgoose': cue(.4, .12, 'shot'), 'shot-blackhole': cue(.46, .18, 'shot'),
    'shot-swordfish': cue(.48, .18, 'shot'), 'shot-dragon': cue(.5, .3, 'shot'), 'shot-chakram': cue(.5, .18, 'shot'),
    'shot-wing-light': cue(.18, .18, 'shot'), 'shot-wing-heavy': cue(.24, .24, 'shot'), 'shot-wing-energy': cue(.2, .2, 'shot'),
    'shot-special-energy': cue(.3, .3, 'shot'), 'shot-special-heavy': cue(.36, .35, 'shot'),
    rocket: cue(.38, .25, 'shot', 1), missile: cue(.36, .25, 'shot', 1), 'enemy-shot': cue(.14, .15, 'shot'),
    'hit-metal': cue(.56, .09, 'impact', 1), 'hit-wood': cue(.48, .09, 'impact', 1), 'hit-soft': cue(.44, .09, 'impact', 1),
    'shield-hit': cue(.34, .13, 'impact', 1), 'explo-s': cue(.52, .09, 'impact', 1), 'explo-m': cue(.64, .15, 'impact', 1),
    'explo-l': cue(.76, .25, 'impact', 1), 'explo-boss': cue(.94, 1, 'critical', 3, .42, .45),
    chain: cue(.57, .16, 'impact', 1), graze: cue(.22, .12, 'impact'), cancel: cue(.2, .14, 'impact'), lock: cue(.24, .12, 'impact'),
    'pickup-coin': cue(.24, .08, 'impact'), 'pickup-part': cue(.58, .16, 'impact', 1), assemble: cue(.73, .3, 'critical', 2),
    'part-full': cue(.7, .3, 'critical', 2), 'part-lost': cue(.69, .3, 'critical', 2, .78, .14),
    hurt: cue(.96, .3, 'critical', 3, .78, .12), dead: cue(.96, 1, 'critical', 3, .58, .22), revive: cue(.82, .8, 'critical', 3, .78, .12),
    buff: cue(.68, .5, 'critical', 2), repair: cue(.72, .4, 'critical', 2),
    'ultimate-ready': cue(.74, .8, 'critical', 2, .86, .08), ultimate: cue(.7, .8, 'critical', 3, .72, .16),
    'ultimate-heavy': cue(.82, .8, 'critical', 3), 'ultimate-storm': cue(.8, .8, 'critical', 3),
    'ultimate-energy': cue(.78, .8, 'critical', 3), 'ultimate-blade': cue(.78, .8, 'critical', 3),
    'ultimate-end': cue(.48, .3, 'critical', 2), 'laser-end': cue(.18, .2, 'shot'), 'breath-end': cue(.18, .2, 'shot'),
    warning: cue(.72, .6, 'critical', 3, .78, .16), 'boss-phase': cue(.86, .9, 'critical', 3, .72, .16),
    'boss-part': cue(.8, .5, 'critical', 2, .72, .16), heartbeat: cue(.26, 1.1, 'critical', 2),
    thunder: cue(.21, 2, 'impact', 1), flyby: cue(.12, 3, 'impact'), seagull: cue(.08, 8, 'impact'),
    'ui-tap': cue(.4, .06, 'ui'), 'ui-confirm': cue(.52, .08, 'ui', 1), 'ui-back': cue(.42, .08, 'ui'),
    'ui-deny': cue(.46, .2, 'ui', 2), 'ui-swipe': cue(.26, .12, 'ui'), 'ui-upgrade': cue(.67, .3, 'ui', 2),
    'ui-unlock': cue(.75, .6, 'ui', 2), 'coin-big': cue(.57, .35, 'ui', 1),
    'star-1': cue(.6, .12, 'ui', 1), 'star-2': cue(.66, .12, 'ui', 1), 'star-3': cue(.72, .12, 'ui', 1),
    'jingle-win': cue(.72, 1, 'critical', 3), 'jingle-lose': cue(.66, 1, 'critical', 3),
};

export const MENU_MUSIC = ['bgm-hangar'];
export const BATTLE_MUSIC = ['bgm-battle', 'bgm-boss', 'bgm-rage'];
export const UI_AUDIO = ['ui-tap', 'ui-confirm', 'ui-back', 'ui-deny', 'ui-swipe', 'ui-upgrade', 'ui-unlock', 'coin-big', 'star-1', 'star-2', 'star-3'];
export const CONTINUOUS_AUDIO = ['laser-loop', 'breath-loop', 'ultimate-loop'];
export const AMBIENCE_AUDIO = [
    'amb-ch1', 'amb-ch2', 'amb-ch3', 'amb-ch4', 'amb-ch5', 'amb-ch6',
    'amb-engine-light', 'amb-engine-heavy', 'amb-engine-energy', 'amb-boss', 'amb-boss-rage',
];
export const COMBAT_AUDIO = Object.keys(CUES).filter(key => UI_AUDIO.indexOf(key) < 0).concat(CONTINUOUS_AUDIO);
export const ALL_AUDIO = UI_AUDIO.concat(MENU_MUSIC, COMBAT_AUDIO, BATTLE_MUSIC, AMBIENCE_AUDIO);
/** 所有声音在进入小游戏时就绪，机库与出击统一使用本 Session 的缓存。 */
export const BOOT_AUDIO = ALL_AUDIO;

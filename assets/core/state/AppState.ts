/** 应用在任一时刻必须处于且只能处于其中一个状态。 */
export const APP_STATES = [
    'booting',
    'lobby',
    'loading-game',
    'playing',
    'paused',
    'leaving-game',
    'error',
] as const;

export type AppState = (typeof APP_STATES)[number];

/**
 * 应用状态的唯一合法转换表。
 * 状态机实现必须以此表为依据，不得在业务层声明额外转换。
 */
export const APP_STATE_TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
    booting: ['lobby', 'error'],
    lobby: ['loading-game'],
    'loading-game': ['playing', 'error'],
    playing: ['paused', 'leaving-game'],
    paused: ['playing', 'leaving-game'],
    'leaving-game': ['lobby', 'error'],
    error: ['lobby', 'loading-game'],
};

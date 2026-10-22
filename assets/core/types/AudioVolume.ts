export const AUDIO_VOLUME_MIN_LEVEL = 1;
export const AUDIO_VOLUME_MAX_LEVEL = 10;
export const AUDIO_VOLUME_DEFAULT_LEVEL = 7;

export function isAudioVolumeLevel(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value)
        && value >= AUDIO_VOLUME_MIN_LEVEL && value <= AUDIO_VOLUME_MAX_LEVEL;
}

/** 缺失或无效的存档等级采用默认值；交互输入按十个整数档位归一化。 */
export function normalizeAudioVolumeLevel(value: unknown, fallback = AUDIO_VOLUME_DEFAULT_LEVEL): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(AUDIO_VOLUME_MIN_LEVEL, Math.min(AUDIO_VOLUME_MAX_LEVEL, Math.round(value)));
}

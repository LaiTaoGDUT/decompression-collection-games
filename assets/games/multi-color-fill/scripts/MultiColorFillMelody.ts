/**
 * 滑动音阶：迁移自原作 108_FILL2 的 `FillController.PlayNote` / `PickMelody` 与 `SoundAscender`。
 *
 * 原作每格只播放同一个音色 `Marimba_C`（C5），用 AudioSource.pitch 变调；每关从 6 段旋律
 * （`fourPlusNonPlusBach`：巴赫前奏曲 + 4 段五声 + 1 段非五声）里随机挑一段，且不与上一关相同。
 * - 五声 / 非五声：路线第 n 格（从 0 起）弹 `table[n % len] + 12 * floor(n / len)` 半音，退格同样按新长度取音；
 * - 巴赫（BachPreludeAlwaysForward）：与路线长度无关，每弹一个音前进一位，240 音循环；
 * - Unity AudioSource.pitch 上限 3.0（+19 半音），更高的音一律钳到 +19。
 * 半音表由原作 global-metadata.dat 中的 float 倍率还原（全部是精确的十二平均律）。
 * 音频：`visual/audio/notes/fill-note-XX-v1` 为 −10…+19 半音共 30 个，由 tools/audio/multi-color-fill/sfx.py 生成。
 */

/** 原作 `NoteVolume` 默认档（AB 设置 22 = −1 → 表首项 0.5）。 */
export const FILL_NOTE_VOLUME = .5;
export const FILL_NOTE_LOWEST = -10;
export const FILL_NOTE_HIGHEST = 19;

const PENTATONIC_A = Object.freeze([2, 4, 7, 9, 4, 7, 9, 12, 7, 9, 12, 14, 9, 12, 14, 16, 12, 14, 16, 19]);
const PENTATONIC_B = Object.freeze([0, 2, 4, 7, 2, 4, 7, 9, 4, 7, 9, 12, 7, 9, 12, 14, 9, 12, 14, 16]);
const PENTATONIC_C = Object.freeze([-1, 2, 4, 7, 2, 4, 7, 9, 4, 7, 9, 11, 7, 9, 11, 14, 9, 11, 14, 16]);
const PENTATONIC_D = Object.freeze([-1, 2, 4, 7, 2, 4, 7, 11, 4, 7, 11, 14, 7, 11, 14, 16]);
const NON_PENTATONIC = Object.freeze([0, 2, 4, 7, 2, 4, 5, 9, 4, 5, 7, 11, 5, 7, 9, 12, 7, 9, 11, 14, 9, 11, 12, 16, 11, 12, 14, 17]);
/** 巴赫《C 大调前奏曲》BWV 846 开头 30 小节的分解和弦。 */
const BACH_PRELUDE = Object.freeze([
    0, 4, 7, 12, 16, 7, 12, 16, 0, 4, 7, 12, 16, 7, 12, 16, 0, 2, 9, 14, 17, 9, 14, 17, 0, 2, 9, 14, 17, 9, 14, 17,
    -1, 2, 7, 14, 17, 7, 14, 17, -1, 2, 7, 14, 17, 7, 14, 17, 0, 4, 7, 12, 16, 7, 12, 16, 0, 4, 7, 12, 16, 7, 12, 16,
    0, 4, 9, 16, 21, 9, 16, 21, 0, 4, 9, 16, 21, 9, 16, 21, 0, 2, 6, 9, 14, 6, 9, 14, 0, 2, 6, 9, 14, 6, 9, 14,
    -1, 2, 7, 14, 19, 7, 14, 19, -1, 2, 7, 14, 19, 7, 14, 19, -1, 0, 4, 7, 12, 4, 7, 12, -1, 0, 4, 7, 12, 4, 7, 12,
    -3, 0, 4, 7, 12, 4, 7, 12, -3, 0, 4, 7, 12, 4, 7, 12, -10, -3, 2, 6, 12, 2, 6, 12, -10, -3, 2, 6, 12, 2, 6, 12,
    -5, -1, 2, 7, 11, 2, 7, 11, -5, -1, 2, 7, 11, 2, 7, 11, -5, -2, 4, 7, 13, 4, 7, 13, -5, -2, 4, 7, 13, 4, 7, 13,
    -7, -3, 2, 9, 14, 2, 9, 14, -7, -3, 2, 9, 14, 2, 9, 14, -7, -4, 2, 5, 11, 2, 5, 11, -7, -4, 2, 5, 11, 2, 5, 11,
    -8, -5, 0, 7, 12, 0, 7, 12, -8, -5, 0, 7, 12, 0, 7, 12,
]);

/** null 表示巴赫：按播放次数前进，不看路线长度。 */
const MELODIES: readonly (readonly number[] | null)[] = Object.freeze([
    null, PENTATONIC_A, PENTATONIC_B, PENTATONIC_C, PENTATONIC_D, NON_PENTATONIC,
]);

export class MultiColorFillMelody {
    private current = -1;
    private bachPosition = 0;

    constructor(private readonly random: () => number = Math.random) {}

    /** 新关卡换旋律（原作 MelodyChangesEvery 默认每关），不与上一关相同；巴赫从头开始。 */
    pick(): void {
        let next = Math.floor(this.random() * MELODIES.length);
        if (next === this.current) next = (next + 1 + Math.floor(this.random() * (MELODIES.length - 1))) % MELODIES.length;
        this.current = next;
        this.bachPosition = 0;
    }

    /** 路线第 index 格（从 0 起）应弹的音，返回音频素材序号（0 = −10 半音）。 */
    noteFor(index: number): number {
        if (this.current < 0) this.pick();
        const table = MELODIES[this.current];
        let semitone: number;
        if (table) {
            const n = Math.max(0, Math.floor(index));
            semitone = table[n % table.length] + 12 * Math.floor(n / table.length);
        } else {
            semitone = BACH_PRELUDE[this.bachPosition % BACH_PRELUDE.length];
            this.bachPosition += 1;
        }
        return Math.min(FILL_NOTE_HIGHEST, Math.max(FILL_NOTE_LOWEST, semitone)) - FILL_NOTE_LOWEST;
    }

    /** 不属于路线的单个提示音（提示按钮、每日赠送）：原作基准音 C5。 */
    get rootNote(): number { return -FILL_NOTE_LOWEST; }
}

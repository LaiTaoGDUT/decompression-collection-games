import type { BundleAudioBankConfig } from '../../../services/audio/BundleAudioBank';
import { MEOWDOKU_RESOURCE_BUNDLE } from './MeowdokuTheme';

/**
 * 猫咪数独的音频注册表。
 *
 * 常规音效取自原作 APK 的 `assets/audio/` 里的原始 Ogg 文件
 * （`sound_manager.gd` 的 `Kind` → 文件映射），转成 mp3 后放进资源 Bundle。
 * 连招鼓励语由原配音经 AI 变声器 Seed-VC 离线转成女声（保留原配音的咬字、节奏和音高走向）；
 * 制作脚本：`tools/meowdoku/seed-vc/`，说明见 `docs/games/meowdoku/audio-source/README.md`。
 * 常规音效已逐条试听更新过一轮：每条在原作音效的基础上出几个候选，试听选定后才替换。
 * 制作脚本：`tools/meowdoku/build-sfx.py`，每条换成了哪个候选都登记在脚本的
 * `ADOPTED` 里（`original` 表示试听后保留原作）。
 *
 * 公共 `FeedbackService` 的 Cue 词表是全局约定，小游戏只把原作自己的音效
 * 映射到已有的 Cue 上，不新增 Cue：
 *
 * | 原作 Kind | 公共 Cue | 时机 |
 * | --- | --- | --- |
 * | `BTN_CLICK` | `uiButton` | 圆形按钮、自动标记开关 |
 * | `MARK_X` / `MARK_X_SOFT_*` | `toggle` | 打叉（三个变体轮播） |
 * | `UNMARK_X` | `drop` | 取消标记 |
 * | `MARK_CAT` | `merge` | 放猫（原作 `meow_feedback` 默认关闭，所以只有落子音，没有猫叫） |
 * | `MARK_WRONG` | `collision` | 放错位置（服务层带 80ms 节流） |
 * | `AUTO_X_MARK` | `chain` | 自动补叉 |
 * | `ALL_CLEARED` | `milestone` | 全部找到 |
 * | `LEVEL_WIN` | `record` | 过关 |
 * | `BOARD_ENTER` | `popup` | 新一关棋盘出现 |
 *
 * 背景音乐用原作主旋律 `bgm_meowdoku_melody.ogg`。
 */
export const MEOWDOKU_AUDIO_BANK: BundleAudioBankConfig = Object.freeze({
    bundle: MEOWDOKU_RESOURCE_BUNDLE,
    music: 'visual/music/meowdoku-melody-v1',
    cues: Object.freeze({
        uiButton: 'visual/audio/meowdoku-button-v1',
        toggle: Object.freeze([
            'visual/audio/meowdoku-mark-x-1-v1',
            'visual/audio/meowdoku-mark-x-2-v1',
            'visual/audio/meowdoku-mark-x-3-v1',
        ]),
        drop: 'visual/audio/meowdoku-unmark-x-v1',
        // 原作 `meow_feedback` 默认档是 DISABLED：放猫只有 MARK_CAT，没有随机猫叫。
        merge: 'visual/audio/meowdoku-mark-cat-v1',
        collision: 'visual/audio/meowdoku-mark-wrong-v1',
        // 自动补叉。
        chain: 'visual/audio/meowdoku-auto-mark-v1',
        // 连击鼓励语：原作 `combo_voice` 默认档（VALUE_REAL_MALE_B_TEXT2）的组合是
        // combo 3~8 用 S6 组（nice / great / perfect / excellent / amazing / unbelievable），
        // 9~12 用 S10 组（unreal / insane / epic / breathtaking）；
        // 本项目保留原配音的表演与资源时长，使用由原声变声得到的女声版本。
        // 这里按「鼓励图 1~10」编号注册成独立 cue，保证图和声音永远同一档。
        voice1: 'visual/audio/meowdoku-combo-1-v1',
        voice2: 'visual/audio/meowdoku-combo-2-v1',
        voice3: 'visual/audio/meowdoku-combo-3-v1',
        voice4: 'visual/audio/meowdoku-combo-4-v1',
        voice5: 'visual/audio/meowdoku-combo-5-v1',
        voice6: 'visual/audio/meowdoku-combo-6-v1',
        voice7: 'visual/audio/meowdoku-combo-7-v1',
        voice8: 'visual/audio/meowdoku-combo-8-v1',
        voice9: 'visual/audio/meowdoku-combo-9-v1',
        voice10: 'visual/audio/meowdoku-combo-10-v1',
        milestone: 'visual/audio/meowdoku-all-cleared-v1',
        record: 'visual/audio/meowdoku-level-win-v1',
        popup: 'visual/audio/meowdoku-board-enter-v1',
        // 提示道具。
        continue: 'visual/audio/meowdoku-use-hint-v1',
        // 生命值耗尽。
        failure: 'visual/audio/meowdoku-level-fail-v1',
    }),
});

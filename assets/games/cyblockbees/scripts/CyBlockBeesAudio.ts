import type { BundleAudioBankConfig } from '../../../services/audio/BundleAudioBank';
import { CYBLOCKBEES_RESOURCE_BUNDLE } from './CyBlockBeesTheme';

/**
 * CyBlockBees 的音频注册表。
 *
 * 声音方向「蜂巢贴纸」：木琴/钟琴一样圆润的打击乐、卡通化的弹簧与气泡、毛茸茸的蜂鸣。
 * 全部由 `project-scripts/cyblockbees/build-audio.py` 程序化合成，重跑即可再生成。
 *
 * 公共 `FeedbackService` 的 Cue 词表是全局约定，小游戏只把音效映射到已有 Cue 上，不新增 Cue：
 *
 * | 音效 | 公共 Cue | 时机 |
 * | --- | --- | --- |
 * | `ui-tap` | `uiButton` | 按钮、选关 |
 * | `pen-down` | `drop` | 落笔 |
 * | `line-done` | `fold` | 松手成线 |
 * | `hive-pop` / `puff` | `popup` | 蜂巢抖动、破碎烟雾 |
 * | `bee-bonk` | `toggle` | 蜜蜂撞到线 |
 * | `metal-1..4` | `collision` | 刀锋、地刺、锯齿轮 |
 * | `water-plop` | `merge` | 蜜蜂入水 |
 * | `spider-tick-1..4` | `chain` | 蜘蛛踏步 |
 * | `dog-yelp` | `danger` | 狗头被蜇 |
 * | `fail` | `failure` | 关卡失败 |
 * | `win` | `record` | 关卡成功 |
 * | `splash` | `continue` | 入水 |
 * | `boom-1` / `boom-2` | `milestone` | 炸弹、黑球 |
 *
 * 蜂群循环 `bee-buzz-loop` 由游戏的 AudioVoiceScope 管理，完成有效画线后播放，暂停、结算和退出时同步停止。
 */
export const CYBLOCKBEES_BEE_LOOP = 'visual/audio/bee-buzz-loop-v2';

export const CYBLOCKBEES_AUDIO_BANK: BundleAudioBankConfig = Object.freeze({
    bundle: CYBLOCKBEES_RESOURCE_BUNDLE,
    cues: Object.freeze({
        uiButton: 'visual/audio/ui-tap-v2',
        drop: 'visual/audio/pen-down-v2',
        fold: 'visual/audio/line-done-v2',
        popup: Object.freeze([
            'visual/audio/hive-pop-v2',
            'visual/audio/puff-v2',
        ]),
        toggle: 'visual/audio/bee-bonk-v2',
        collision: Object.freeze([
            'visual/audio/metal-1-v2',
            'visual/audio/metal-2-v2',
            'visual/audio/metal-3-v2',
            'visual/audio/metal-4-v2',
        ]),
        merge: 'visual/audio/water-plop-v2',
        chain: Object.freeze([
            'visual/audio/spider-tick-1-v2',
            'visual/audio/spider-tick-2-v2',
            'visual/audio/spider-tick-3-v2',
            'visual/audio/spider-tick-4-v2',
        ]),
        danger: 'visual/audio/dog-yelp-v2',
        failure: 'visual/audio/fail-v2',
        record: 'visual/audio/win-v2',
        continue: 'visual/audio/splash-v2',
        milestone: Object.freeze([
            'visual/audio/boom-1-v2',
            'visual/audio/boom-2-v2',
        ]),
    }),
});

import type { AudioClip } from 'cc';
import type { Platform } from '../../platform/Platform';
import type { AudioEffectScope, AudioService } from '../audio/AudioService';
import type { PackedAudioEffect } from '../audio/PackedAudioBank';
import type { StorageService, UserSettings } from '../storage/StorageService';

export type FeedbackCue =
    | 'drop'
    | 'uiButton'
    | 'popup'
    | 'toggle'
    | 'collision'
    | 'merge'
    | 'fold'
    | 'chain'
    | 'milestone'
    | 'danger'
    | 'failure'
    | 'continue'
    | 'record'
    /** 连击鼓励语（原作 `combo_voice`）：`voice1` = Nice … `voice10` = Breathtaking。 */
    | 'voice1'
    | 'voice2'
    | 'voice3'
    | 'voice4'
    | 'voice5'
    | 'voice6'
    | 'voice7'
    | 'voice8'
    | 'voice9'
    | 'voice10';

export interface FeedbackPlayOptions {
    /** 同一 cue 的最短反馈间隔（毫秒），合并密集碰撞的音效和振动。 */
    readonly minIntervalMs?: number;
    /** 距上一次任意平台振动的最短间隔（毫秒）；未到间隔时仍播放音效，只跳过振动。 */
    readonly minVibrateIntervalMs?: number;
    /** 保留音效，仅在当前反馈上关闭平台振动。 */
    readonly vibrate?: boolean;
    /** 本次播放的音量（0-1），默认 1；仅影响音效，不影响振动。 */
    readonly volume?: number;
    /**
     * 指定播放该 cue 的第几个素材（按素材数取模），用于让音高跟随玩法状态（如路线第几格）；
     * 指定时不推进默认的轮播顺序。
     */
    readonly variant?: number;
}

/** 小游戏反馈公共边界：玩法不直接调用音频实例或平台振动 API。 */
export class FeedbackService {
    private readonly sounds = new Map<FeedbackCue, readonly (AudioClip | PackedAudioEffect)[]>();
    private readonly soundScopes = new Map<FeedbackCue, AudioEffectScope>();
    private readonly sequence = new Map<FeedbackCue, number>();
    private readonly lastPlayedAt = new Map<FeedbackCue, number>();
    private lastVibratedAt = -Infinity;

    constructor(
        private readonly audio: AudioService,
        private readonly platform: Platform,
        private readonly storage: StorageService,
        private readonly now: () => number = Date.now,
    ) {}

    registerSound(cue: FeedbackCue, clip: AudioClip | PackedAudioEffect): void {
        this.registerSounds(cue, [clip]);
    }

    registerSounds(cue: FeedbackCue, clips: readonly (AudioClip | PackedAudioEffect)[], scope?: AudioEffectScope): void {
        this.sounds.set(cue, Object.freeze([...clips]));
        if (scope) this.soundScopes.set(cue, scope); else this.soundScopes.delete(cue);
        this.sequence.set(cue, 0);
    }

    unregisterSound(cue: FeedbackCue): void {
        this.sounds.delete(cue);
        this.soundScopes.delete(cue);
        this.sequence.delete(cue);
        this.lastPlayedAt.delete(cue);
    }

    play(cue: FeedbackCue, options: FeedbackPlayOptions = {}): void {
        const now = this.now();
        const interval = Math.max(cue === 'collision' ? 80 : 0, options.minIntervalMs ?? 0);
        if (interval > 0 && now - (this.lastPlayedAt.get(cue) ?? -Infinity) < interval) {
            return;
        }
        this.lastPlayedAt.set(cue, now);
        const clips = this.sounds.get(cue) ?? [];
        const variant = options.variant, pinned = variant !== undefined && Number.isFinite(variant);
        const index = pinned ? Math.max(0, Math.floor(variant)) : this.sequence.get(cue) ?? 0;
        const clip = clips.length > 0 ? clips[index % clips.length] : undefined;

        if (clip) {
            // 全量对齐原作音量：`mark_wrong_1.ogg` 在 `SoundManager.play` 里也是原音量
            // （原来这里压到 0.62，听感像「没有音效」）。
            const volume = Math.max(0, Math.min(1, options.volume ?? 1)), scope = this.soundScopes.get(cue);
            if (scope) scope.play(clip, volume); else this.audio.playEffect(clip, volume);
            if (!pinned) this.sequence.set(cue, index + 1);
        }

        if (options.vibrate === false || !this.storage.snapshot.settings.vibrationEnabled
            || now - this.lastVibratedAt < (options.minVibrateIntervalMs ?? 0)) {
            return;
        }

        if (cue === 'drop' || cue === 'uiButton' || cue === 'toggle') {
            this.vibrateNow('light', now);
        } else if (cue === 'merge' || cue === 'fold' || cue === 'chain' || cue === 'danger' || cue === 'collision') {
            this.vibrateNow('medium', now);
        } else if (cue === 'milestone'
            || cue === 'failure'
            || cue === 'record') {
            this.vibrateNow('heavy', now);
        }
    }

    /** 玩法可在没有额外音效的节点触发独立震感，仍统一遵守用户开关。 */
    vibrate(type: 'light' | 'medium' | 'heavy'): void {
        if (!this.storage.snapshot.settings.vibrationEnabled) {
            return;
        }

        this.vibrateNow(type, this.now());
    }

    private vibrateNow(type: 'light' | 'medium' | 'heavy', now: number): void {
        this.lastVibratedAt = now;
        this.platform.vibrate(type);
    }

    setVibrationEnabled(enabled: boolean): void {
        const current = this.storage.snapshot.settings;
        const settings: UserSettings = {
            ...current,
            vibrationEnabled: enabled,
        };
        this.storage.writeSettings(settings);
    }
}

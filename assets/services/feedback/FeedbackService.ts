import type { AudioClip } from 'cc';
import type { Platform } from '../../platform/Platform';
import type { AudioService } from '../audio/AudioService';
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
    | 'record';

/** 小游戏反馈公共边界：玩法不直接调用音频实例或平台振动 API。 */
export class FeedbackService {
    private readonly sounds = new Map<FeedbackCue, readonly AudioClip[]>();
    private readonly sequence = new Map<FeedbackCue, number>();
    private readonly lastPlayedAt = new Map<FeedbackCue, number>();

    constructor(
        private readonly audio: AudioService,
        private readonly platform: Platform,
        private readonly storage: StorageService,
        private readonly now: () => number = Date.now,
    ) {}

    registerSound(cue: FeedbackCue, clip: AudioClip): void {
        this.registerSounds(cue, [clip]);
    }

    registerSounds(cue: FeedbackCue, clips: readonly AudioClip[]): void {
        this.sounds.set(cue, Object.freeze([...clips]));
        this.sequence.set(cue, 0);
    }

    unregisterSound(cue: FeedbackCue): void {
        this.sounds.delete(cue);
        this.sequence.delete(cue);
        this.lastPlayedAt.delete(cue);
    }

    play(cue: FeedbackCue): void {
        const now = this.now();
        if (cue === 'collision' && now - (this.lastPlayedAt.get(cue) ?? -Infinity) < 80) {
            return;
        }
        this.lastPlayedAt.set(cue, now);
        const clips = this.sounds.get(cue) ?? [];
        const index = this.sequence.get(cue) ?? 0;
        const clip = clips.length > 0 ? clips[index % clips.length] : undefined;

        if (clip) {
            this.audio.playEffect(clip, cue === 'collision' ? 0.62 : 1);
            this.sequence.set(cue, index + 1);
        }

        if (!this.storage.snapshot.settings.vibrationEnabled) {
            return;
        }

        if (cue === 'drop' || cue === 'uiButton' || cue === 'toggle') {
            this.platform.vibrate('light');
        } else if (cue === 'merge' || cue === 'fold' || cue === 'chain') {
            this.platform.vibrate('medium');
        } else if (cue === 'milestone'
            || cue === 'failure'
            || cue === 'record') {
            this.platform.vibrate('heavy');
        }
    }

    /** 玩法可在没有额外音效的节点触发独立震感，仍统一遵守用户开关。 */
    vibrate(type: 'light' | 'medium' | 'heavy'): void {
        if (!this.storage.snapshot.settings.vibrationEnabled) {
            return;
        }

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

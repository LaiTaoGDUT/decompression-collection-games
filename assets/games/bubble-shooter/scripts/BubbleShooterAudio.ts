import { _decorator, AudioClip } from 'cc';
import type { AudioService, AudioEffectScope } from '../../../services/audio/AudioService';
const { ccclass, property } = _decorator;

export const CLOUD_CUES = ['normal-music', 'boss-music', 'shot', 'bounce', 'attach', 'pop', 'drop',
    'thaw', 'frost', 'row', 'warning', 'boss-enter', 'boss-hit', 'victory', 'reward', 'select',
    'confirm', 'bomb', 'wildcard', 'clear-bottom', 'swap', 'revive', 'failure', 'ui'] as const;
export type CloudCue = typeof CLOUD_CUES[number];

/** Inspector slots remain empty until approved audio is supplied. No dummy files or network loads. */
@ccclass('BubbleShooterAudioSlot')
export class BubbleShooterAudioSlot {
    @property cue = '';
    @property({ type: [AudioClip] }) clips: AudioClip[] = [];
    @property volume = .7;
}

export class BubbleShooterAudio {
    private service?: AudioService;
    private effects?: AudioEffectScope;
    private slots = new Map<CloudCue, BubbleShooterAudioSlot>();
    private sequence = new Map<CloudCue, number>();
    private last = new Map<CloudCue, number>();
    private paused = false;
    private musicCue?: CloudCue;

    bind(service: AudioService | undefined, slots: readonly BubbleShooterAudioSlot[]): void {
        this.effects?.dispose();
        this.service = service;
        this.effects = service?.createEffectScope?.();
        this.slots.clear();
        slots.forEach(slot => { if ((CLOUD_CUES as readonly string[]).indexOf(slot.cue) >= 0) this.slots.set(slot.cue as CloudCue, slot); });
    }
    play(cue: CloudCue): void {
        if (this.paused && cue !== 'ui') return;
        const now = Date.now();
        if (now - (this.last.get(cue) ?? -Infinity) < (cue === 'boss-hit' ? 120 : 65)) return;
        this.last.set(cue, now);
        const slot = this.slots.get(cue), index = this.sequence.get(cue) ?? 0;
        const clip = slot?.clips.length ? slot.clips[index % slot.clips.length] : undefined;
        if (slot && clip) {
            if (this.effects) this.effects.play(clip, slot.volume);
            else this.service?.playEffect(clip, slot.volume);
            this.sequence.set(cue, index + 1);
        }
    }
    music(cue?: 'normal-music' | 'boss-music'): void {
        if (this.musicCue === cue) return;
        this.musicCue = cue;
        const slot = cue ? this.slots.get(cue) : undefined, clip = slot?.clips[0];
        if (clip) this.service?.playMusic(clip, slot!.volume);
        else this.service?.stopMusic();
        if (this.paused) this.service?.pauseMusic();
    }
    pause(): void { this.paused = true; this.effects?.stop(); this.service?.pauseMusic(); }
    resume(): void { this.paused = false; this.service?.resumeMusic(); }
    reset(): void { this.musicCue = undefined; this.last.clear(); this.sequence.clear(); this.resume(); }
    dispose(): void {
        this.effects?.dispose(); this.effects = undefined;
        this.service?.stopMusic(); this.service = undefined; this.musicCue = undefined;
        this.slots.clear(); this.sequence.clear(); this.last.clear();
    }
}

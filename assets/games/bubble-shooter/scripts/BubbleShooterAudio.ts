import { _decorator, AudioClip } from 'cc';
import type { AudioService, AudioEffectScope } from '../../../services/audio/AudioService';
const { ccclass, property } = _decorator;

export const CLOUD_CUES = ['normal-music', 'boss-music', 'shot', 'bounce', 'attach', 'pop', 'drop',
    'thaw', 'frost', 'row', 'warning', 'boss-enter', 'boss-hit', 'victory', 'reward', 'select',
    'confirm', 'bomb', 'wildcard', 'clear-bottom', 'swap', 'revive', 'failure', 'ui', 'ocean-normal-music', 'ocean-boss-music', 'ocean-cast', 'ocean-convert', 'rail', 'rune', 'combo-6', 'combo-7', 'combo-8', 'combo-9', 'combo-10', 'reward-music', 'menu-music'] as const;
export type CloudCue = typeof CLOUD_CUES[number];

/** Serialized slots stay empty; the current region's clips come from the session AssetService. */
@ccclass('BubbleShooterAudioSlot')
export class BubbleShooterAudioSlot {
    @property cue = '';
    @property({ type: [AudioClip] }) clips: AudioClip[] = [];
    @property volume = .7;
    @property startSeconds?: number = 0;
}

export class BubbleShooterAudio {
    private service?: AudioService;
    private effects?: AudioEffectScope;
    private slots = new Map<CloudCue, BubbleShooterAudioSlot>();
    private sequence = new Map<CloudCue, number>();
    private last = new Map<CloudCue, number>();
    private paused = false;
    private musicPaused = false;
    private musicCue?: CloudCue;
    private restartMusicPending = false;

    bind(service: AudioService | undefined, slots: readonly BubbleShooterAudioSlot[]): void {
        this.effects?.dispose();
        this.service = service;
        this.effects = service?.createEffectScope?.();
        this.slots.clear();this.musicCue=undefined;this.last.clear();this.sequence.clear();
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
    music(cue?: 'normal-music' | 'boss-music' | 'ocean-normal-music' | 'ocean-boss-music' | 'reward-music' | 'menu-music'): void {
        if (this.musicCue === cue) return;
        this.musicCue = cue;
        const slot = cue ? this.slots.get(cue) : undefined, clip = slot?.clips[0];
        if (clip && this.restartMusicPending && this.service?.playMusic) {
            this.service.playMusic(clip, slot!.volume, { startSeconds: slot!.startSeconds ?? 0, restart: true });
        } else if (clip && this.service?.transitionMusic) this.service.transitionMusic(clip, {
            volumeScale: slot!.volume, fadeOutSeconds: .45, fadeInSeconds: .65,
            startSeconds: slot!.startSeconds ?? 0,
        });
        else if (clip) this.service?.playMusic(clip, slot!.volume, { startSeconds: slot!.startSeconds ?? 0 });
        else this.service?.stopMusic();
        this.restartMusicPending = false;
        if (this.musicPaused) this.service?.pauseMusic();
    }
    pause(options: { keepMusicPlaying?: boolean } = {}): void {
        const wasMusicPaused = this.musicPaused;
        this.paused = true; this.musicPaused = !options.keepMusicPlaying;
        this.effects?.stop();
        if (this.musicPaused) this.service?.pauseMusic();
        else if (wasMusicPaused) this.service?.resumeMusic();
    }
    resume(): void { this.paused = false; this.musicPaused = false; this.service?.resumeMusic(); }
    reset(): void { this.musicCue = undefined; this.restartMusicPending = true; this.last.clear(); this.sequence.clear(); this.resume(); }
    dispose(): void {
        this.effects?.dispose(); this.effects = undefined;
        this.service?.stopMusic(); this.service = undefined; this.musicCue = undefined;
        this.slots.clear(); this.sequence.clear(); this.last.clear();
    }
}

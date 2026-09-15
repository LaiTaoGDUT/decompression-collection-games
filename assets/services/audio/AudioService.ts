import type { AudioClip, AudioSource } from 'cc';
import type { StorageService, UserSettings } from '../storage/StorageService';

export interface AudioChannel {
    clip: AudioClip | null;
    loop: boolean;
    volume?: number;
    readonly playing: boolean;
    play(): void;
    pause(): void;
    stop(): void;
    playOneShot(clip: AudioClip, volumeScale?: number): void;
}

export interface AudioEffectScope {
    play(clip: AudioClip, volume: number): void;
    stop(): void;
    dispose(): void;
}
export interface ScopedAudioChannel {
    channel: AudioChannel;
    dispose(): void;
}

/** 背景音乐与单次音效的公共边界。 */
export class AudioService {
    private musicEnabled = true;
    private soundEnabled = true;
    private pausedByBackground = false;
    private pausedByGame = false;
    private currentMusic?: AudioClip;
    private readonly effectScopes = new Set<AudioEffectScope>();

    constructor(
        private readonly musicChannel: AudioChannel | AudioSource,
        private readonly effectChannel: AudioChannel | AudioSource,
        private readonly storage: StorageService,
        private readonly createEffectChannel?: () => ScopedAudioChannel,
    ) {}

    initialize(): void {
        const settings = this.storage.snapshot.settings;
        this.musicEnabled = settings.musicEnabled;
        this.soundEnabled = settings.soundEnabled;
    }

    get isMusicEnabled(): boolean {
        return this.musicEnabled;
    }

    get isSoundEnabled(): boolean {
        return this.soundEnabled;
    }

    playMusic(clip: AudioClip, volumeScale = 1): void {
        this.musicChannel.volume = Math.max(0, Math.min(1, volumeScale));
        if (this.currentMusic === clip && this.musicChannel.playing) {
            return;
        }

        if (this.currentMusic !== clip) {
            if (this.currentMusic) {
                this.musicChannel.stop();
            }

            this.currentMusic = clip;
            this.musicChannel.clip = clip;
            this.musicChannel.loop = true;
        }

        if (this.musicEnabled && !this.pausedByBackground && !this.pausedByGame) {
            this.musicChannel.play();
        }
    }

    stopMusic(): void {
        this.musicChannel.stop();
        this.musicChannel.clip = null;
        this.currentMusic = undefined;
        // Background state belongs to the application, not to one clip. Keep
        // it latched so a scene change while hidden cannot start new music.
        this.pausedByGame = false;
    }

    playEffect(clip: AudioClip, volumeScale = 1): void {
        if (!this.soundEnabled) {
            return;
        }

        this.effectChannel.playOneShot(
            clip,
            Math.max(0, Math.min(1, volumeScale)),
        );
    }

    /** Owned, stoppable effects for games whose sounds must not outlive their session. */
    createEffectScope(): AudioEffectScope | undefined {
        const create = this.createEffectChannel;
        if (!create) return undefined;
        const voices: ScopedAudioChannel[] = [];
        let cursor = 0, disposed = false;
        const scope: AudioEffectScope = {
            play: (clip, volume) => {
                if (disposed || !this.soundEnabled || this.pausedByBackground) return;
                if (voices.length < 6) voices.push(create());
                const voice = voices[cursor++ % voices.length]!.channel;
                voice.stop(); voice.clip = clip; voice.loop = false;
                voice.volume = Math.max(0, Math.min(1, volume)); voice.play();
            },
            stop: () => voices.forEach(v => { v.channel.stop(); v.channel.clip = null; }),
            dispose: () => {
                if (disposed) return;
                disposed = true; scope.stop(); voices.forEach(v => v.dispose()); voices.length = 0;
                this.effectScopes.delete(scope);
            },
        };
        this.effectScopes.add(scope);
        return scope;
    }

    setEnabled(enabled: boolean): void {
        this.setMusicEnabled(enabled, false);
        this.setSoundEnabled(enabled, false);
        this.persistSettings();
    }

    setMusicEnabled(enabled: boolean, persist = true): void {
        if (this.musicEnabled === enabled) {
            return;
        }

        this.musicEnabled = enabled;

        if (!enabled && this.musicChannel.playing) {
            this.musicChannel.pause();
        } else if (enabled
            && this.currentMusic
            && !this.pausedByBackground
            && !this.pausedByGame) {
            this.musicChannel.play();
        }

        if (persist) {
            this.persistSettings();
        }
    }

    setSoundEnabled(enabled: boolean, persist = true): void {
        if (this.soundEnabled === enabled) {
            return;
        }

        this.soundEnabled = enabled;
        if (!enabled) this.effectScopes.forEach(scope => scope.stop());

        if (persist) {
            this.persistSettings();
        }
    }

    onHide(): void {
        if (this.pausedByBackground) {
            return;
        }

        this.pausedByBackground = true;
        this.effectScopes.forEach(scope => scope.stop());

        if (this.musicChannel.playing) {
            this.musicChannel.pause();
        }
    }

    pauseMusic(): void {
        if (this.pausedByGame) return;
        this.pausedByGame = true;
        if (this.musicChannel.playing) this.musicChannel.pause();
    }

    resumeMusic(): void {
        const shouldResume = this.pausedByGame;
        this.pausedByGame = false;
        if (shouldResume && this.musicEnabled && !this.pausedByBackground && this.currentMusic) {
            this.musicChannel.play();
        }
    }

    onShow(): void {
        const shouldResume = this.pausedByBackground;
        this.pausedByBackground = false;

        if (shouldResume && this.musicEnabled && !this.pausedByGame && this.currentMusic) {
            this.musicChannel.play();
        }
    }

    dispose(): void {
        Array.from(this.effectScopes).forEach(scope => scope.dispose());
        this.stopMusic();
        this.effectChannel.stop();
    }

    private persistSettings(): void {
        const current = this.storage.snapshot.settings;
        const settings: UserSettings = {
            ...current,
            musicEnabled: this.musicEnabled,
            soundEnabled: this.soundEnabled,
        };
        this.storage.writeSettings(settings);
    }
}

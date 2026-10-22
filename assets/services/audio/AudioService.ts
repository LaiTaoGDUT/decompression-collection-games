import type { AudioClip, AudioSource } from 'cc';
import type { StorageService, UserSettings } from '../storage/StorageService';
import type { PlatformAudioContext } from '../../platform/PlatformAudio';
import { AUDIO_VOLUME_DEFAULT_LEVEL, AUDIO_VOLUME_MIN_LEVEL, AUDIO_VOLUME_MAX_LEVEL, normalizeAudioVolumeLevel } from '../../core/types/AudioVolume';
import { PackedAudioBank, PackedAudioDecodeCancellation, PackedAudioEffect } from './PackedAudioBank';
import { PackedAudioVoices } from './PackedAudioVoices';

export interface AudioChannel {
    clip: AudioClip | null;
    loop: boolean;
    volume?: number;
    currentTime?: number;
    readonly playing: boolean;
    play(): void;
    pause(): void;
    stop(): void;
    playOneShot(clip: AudioClip, volumeScale?: number): void;
}

export interface AudioEffectScope {
    play(clip: AudioClip | PackedAudioEffect, volume: number): void;
    stop(): void;
    dispose(): void;
}
export interface AudioEffectScopeOptions {
    /** 同一 clip 固定复用一个声部，避免交替 cue 时反复加载小程序播放器。 */
    readonly reuseByClip?: boolean;
}
/** 长提示音的独立声部：后台暂停后继续，关闭展示或禁用音效后彻底停止。 */
export interface AudioPresentationScope extends AudioEffectScope {
    play(clip: AudioClip, volume: number): void;
    pause(): void;
    resume(): void;
}
export interface ScopedAudioChannel {
    channel: AudioChannel;
    dispose(): void;
}

/** 单个可停止的声部；游戏负责调度，公共服务负责开关、前后台与节点释放。 */
export interface AudioVoiceScope {
    readonly playing: boolean;
    readonly volume: number;
    /** 引擎实际播放位置；音频异步起播或后台恢复时不使用业务时钟猜测。 */
    readonly currentTime: number;
    play(clip: AudioClip, volume: number, loop?: boolean): boolean;
    setVolume(volume: number): void;
    pause(): void;
    resume(): void;
    stop(): void;
    dispose(): void;
}

export interface MusicPlaybackOptions {
    /** Initial position in the shared loop; pause/resume keeps the actual position. */
    readonly startSeconds?: number;
    /** Start a new round at its configured position even if the track is unchanged. */
    readonly restart?: boolean;
}

export interface MusicTransitionOptions {
    /** Seconds for the current track to fade to silence. Default 1.5. */
    readonly fadeOutSeconds?: number;
    /** Seconds for the next track to fade in; runs at the same time as the fade-out. Default 1.5. */
    readonly fadeInSeconds?: number;
    readonly volumeScale?: number;
    readonly startSeconds?: number;
}

type MusicChannel = AudioChannel | AudioSource;

interface MusicTransition {
    /** The clip this transition ends on. */
    readonly next: AudioClip;
    readonly startSeconds: number;
    readonly targetVolume: number;
    /** Stop fading and leave both channels exactly as they are right now. */
    cancel(): void;
    /** Jump straight to the end state: outgoing stopped, next clip at full volume. */
    complete(): void;
}

const MUSIC_FADE_STEP_MS = 40;

function clampVolume(volume: number): number {
    return Math.max(0, Math.min(1, volume));
}

function musicStartSeconds(clip: AudioClip, seconds = 0): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    const duration = clip.getDuration();
    return duration > 0 ? seconds % duration : seconds;
}

/** 背景音乐与单次音效的公共边界。 */
export class AudioService {
    private musicEnabled = true;
    private soundEnabled = true;
    private musicLevel = AUDIO_VOLUME_DEFAULT_LEVEL;
    private soundLevel = AUDIO_VOLUME_DEFAULT_LEVEL;
    private pausedByBackground = false;
    private pausedByGame = false;
    private currentMusic?: AudioClip;
    private currentMusicStart = 0;
    private musicTransition?: MusicTransition;
    /** Channel carrying `currentMusic`; alternates between the two music channels on crossfades. */
    private musicChannel: MusicChannel;
    /** Channel still fading the previous track out during a crossfade. */
    private fadingMusicChannel?: MusicChannel;
    private fadingMusicStart = 0;
    private readonly musicChannels: readonly MusicChannel[];
    private readonly effectScopes = new Set<AudioEffectScope>();
    private readonly presentationScopes = new Set<AudioPresentationScope>();
    private readonly voiceScopes = new Map<AudioVoiceScope, 'effect' | 'music'>();
    private readonly soundVolumeUpdaters = new Set<() => void>();
    private musicGain = 1;
    private readonly musicUnscaledVolumes = new WeakMap<MusicChannel, number>();
    private packedAudioContext?: PlatformAudioContext;
    private packedFallbackScope?: AudioEffectScope;
    private disposed = false;
    private readonly packedDecodes = new Set<PackedAudioDecodeCancellation>();

    constructor(
        primaryMusicChannel: MusicChannel,
        private readonly effectChannel: AudioChannel | AudioSource,
        private readonly storage: StorageService,
        private readonly createEffectChannel?: () => ScopedAudioChannel,
        /** Second music channel; enables true crossfades in transitionMusic(). */
        crossfadeMusicChannel?: MusicChannel,
        private readonly createAudioContext?: () => PlatformAudioContext | undefined,
    ) {
        this.musicChannel = primaryMusicChannel;
        this.musicChannels = crossfadeMusicChannel ? [primaryMusicChannel, crossfadeMusicChannel] : [primaryMusicChannel];
    }

    initialize(): void {
        const settings = this.storage.snapshot.settings;
        // 声音设置只保留 1–10 级；旧的关闭状态迁移为最低档，避免隐藏开关阻止滑条生效。
        this.musicEnabled = true;
        this.soundEnabled = true;
        this.musicLevel = settings.musicEnabled ? normalizeAudioVolumeLevel(settings.musicVolumeLevel) : AUDIO_VOLUME_MIN_LEVEL;
        this.soundLevel = settings.soundEnabled ? normalizeAudioVolumeLevel(settings.soundVolumeLevel) : AUDIO_VOLUME_MIN_LEVEL;
        this.refreshMusicVolumes();
        if (!settings.musicEnabled || !settings.soundEnabled) this.persistSettings();
    }

    get isMusicEnabled(): boolean {
        return this.musicEnabled;
    }

    get isSoundEnabled(): boolean {
        return this.soundEnabled;
    }

    get musicVolumeLevel(): number { return this.musicLevel; }

    get soundVolumeLevel(): number { return this.soundLevel; }

    setMusicVolumeLevel(level: number, persist = true): void {
        const next = normalizeAudioVolumeLevel(level, this.musicLevel);
        if (next === this.musicLevel) return;
        this.musicLevel = next;
        this.refreshMusicVolumes();
        if (persist) this.persistSettings();
    }

    setSoundVolumeLevel(level: number, persist = true): void {
        const next = normalizeAudioVolumeLevel(level, this.soundLevel);
        if (next === this.soundLevel) return;
        this.soundLevel = next;
        this.soundVolumeUpdaters.forEach(update => update());
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'effect') scope.setVolume(scope.volume); });
        if (persist) this.persistSettings();
    }

    get isBackgroundPaused(): boolean { return this.pausedByBackground; }

    /** 临时压低配乐；不切曲、不重置播放位置，也不打断正在进行的淡入淡出。 */
    setMusicGain(scale: number): void {
        const next = clampVolume(scale);
        if (next === this.musicGain) return;
        this.musicGain = next;
        this.refreshMusicVolumes();
    }

    playMusic(clip: AudioClip, volumeScale = 1, options: MusicPlaybackOptions = {}): void {
        this.completeMusicTransition();
        const start = musicStartSeconds(clip, options.startSeconds);
        this.setMusicChannelVolume(this.musicChannel, volumeScale);
        const samePlayback = this.currentMusic === clip && this.currentMusicStart === start;
        if (samePlayback && this.musicChannel.playing && !options.restart) {
            return;
        }

        if (!samePlayback || options.restart) {
            if (this.currentMusic) {
                this.musicChannel.stop();
            }

            this.currentMusic = clip;
            this.currentMusicStart = start;
            this.musicChannel.clip = clip;
            this.musicChannel.loop = true;
            this.musicChannel.currentTime = start;
        }

        if (this.musicEnabled && !this.pausedByBackground && !this.pausedByGame) {
            this.musicChannel.play();
        }
    }

    /**
     * Crossfade: the current track fades out while the next one fades in on
     * the second music channel. Without a second channel, or when nothing is
     * audible (no current track, same track, disabled, paused or hidden), it
     * switches immediately. Re-targeting mid-transition continues from the
     * current volumes: asking for the outgoing track again swaps the fades,
     * asking for the same target is a no-op. Any other music call
     * (play/stop/pause/hide/disable) completes the transition at once, so no
     * fade timer or second channel outlives the state it belongs to.
     */
    transitionMusic(clip: AudioClip, options: MusicTransitionOptions = {}): void {
        const target = clampVolume(options.volumeScale ?? 1);
        const start = musicStartSeconds(clip, options.startSeconds);
        const fadeOutMs = Math.max(0, options.fadeOutSeconds ?? 1.5) * 1000;
        const fadeInMs = Math.max(0, options.fadeInSeconds ?? 1.5) * 1000;
        const active = this.musicTransition;
        if (active?.next === clip && active.startSeconds === start && active.targetVolume === target) return;
        if (active) {
            active.cancel();
            const fading = this.fadingMusicChannel;
            if (this.currentMusic === clip && this.currentMusicStart === start && fading) {
                this.startCrossfade(fading, this.musicChannel, fadeOutMs, fadeInMs, target);
                return;
            }
            if (fading && fading.clip === clip && this.fadingMusicStart === start) {
                // Reverted mid-crossfade: swap roles and fade from the current volumes.
                const leaving = this.musicChannel;
                const leavingStart = this.currentMusicStart;
                this.musicChannel = fading;
                this.fadingMusicChannel = leaving;
                this.fadingMusicStart = leavingStart;
                this.currentMusic = clip;
                this.currentMusicStart = start;
                this.startCrossfade(leaving, fading, fadeOutMs, fadeInMs, target);
                return;
            }
            this.releaseFadingChannel();
        }

        const incoming = this.spareMusicChannel();
        if (!incoming || !this.currentMusic || (this.currentMusic === clip && this.currentMusicStart === start)
            || !this.isMusicAudible() || !this.musicChannel.playing) {
            this.playMusic(clip, target, { startSeconds: start });
            return;
        }
        incoming.stop();
        incoming.clip = clip;
        incoming.loop = true;
        this.setMusicChannelVolume(incoming, 0);
        incoming.currentTime = start;
        incoming.play();
        const outgoing = this.musicChannel;
        this.fadingMusicStart = this.currentMusicStart;
        this.musicChannel = incoming;
        this.fadingMusicChannel = outgoing;
        this.currentMusic = clip;
        this.currentMusicStart = start;
        this.startCrossfade(outgoing, incoming, fadeOutMs, fadeInMs, target);
    }

    stopMusic(): void {
        this.completeMusicTransition();
        this.musicChannel.stop();
        this.musicChannel.clip = null;
        this.currentMusic = undefined;
        this.currentMusicStart = 0;
        // Background state belongs to the application, not to one clip. Keep
        // it latched so a scene change while hidden cannot start new music.
        this.pausedByGame = false;
    }

    playEffect(clip: AudioClip | PackedAudioEffect, volumeScale = 1): void {
        if (!this.soundEnabled) {
            return;
        }

        if (clip instanceof PackedAudioEffect) {
            this.packedFallbackScope ??= this.createEffectScope();
            this.packedFallbackScope?.play(clip, volumeScale);
            return;
        }
        this.effectChannel.playOneShot(
            clip,
            clampVolume(volumeScale) * this.soundLevel / AUDIO_VOLUME_MAX_LEVEL,
        );
    }

    createVoiceScope(kind: 'effect' | 'music' = 'effect'): AudioVoiceScope | undefined {
        if (!this.createEffectChannel) return undefined;
        const voice = this.createEffectChannel();
        let disposed = false, active = false, resumePending = false, volume = 0;
        const enabled = (): boolean => kind === 'music' ? this.musicEnabled : this.soundEnabled;
        const scope: AudioVoiceScope = {
            // Cocos 的 play() 异步启动，不能用底层 playing 判断刚分配的声部是否空闲。
            get playing() { return active && !resumePending; },
            get currentTime() {
                const position = voice.channel.currentTime ?? 0;
                return Number.isFinite(position) ? Math.max(0, position) : 0;
            },
            get volume() { return volume; },
            play: (clip, gain, loop = false) => {
                if (disposed || !enabled() || this.pausedByBackground || (kind === 'music' && this.pausedByGame)) return false;
                scope.stop();
                voice.channel.clip = clip;
                voice.channel.loop = loop;
                scope.setVolume(gain);
                active = true;
                voice.channel.play();
                return true;
            },
            setVolume: gain => {
                volume = clampVolume(gain);
                voice.channel.volume = volume * (kind === 'music'
                    ? this.musicGain * this.musicLevel / AUDIO_VOLUME_MAX_LEVEL
                    : this.soundLevel / AUDIO_VOLUME_MAX_LEVEL);
            },
            pause: () => {
                if (disposed || !active || resumePending) return;
                // 一次性声音已经播完时，前后台切换不能重新播放它。
                resumePending = voice.channel.playing;
                voice.channel.pause();
                if (!resumePending) active = false;
            },
            resume: () => {
                if (disposed || !resumePending || !enabled() || this.pausedByBackground || (kind === 'music' && this.pausedByGame)) return;
                resumePending = false;
                voice.channel.play();
            },
            stop: () => {
                active = false; resumePending = false;
                voice.channel.stop(); voice.channel.clip = null;
            },
            dispose: () => {
                if (disposed) return;
                scope.stop(); disposed = true;
                voice.dispose(); this.voiceScopes.delete(scope);
            },
        };
        this.voiceScopes.set(scope, kind);
        return scope;
    }

    /** Owned, stoppable effects for games whose sounds must not outlive their session. */
    createEffectScope(options: AudioEffectScopeOptions = {}): AudioEffectScope | undefined {
        const create = this.createEffectChannel;
        if (!create && !this.createAudioContext) return undefined;
        const voices: ScopedAudioChannel[] = [];
        const volumes: number[] = [];
        let cursor = 0, disposed = false;
        const packed = new PackedAudioVoices(() => this.getPackedAudioContext(),
            () => !disposed && !this.disposed && this.soundEnabled && !this.pausedByBackground);
        const updateVolume = (): void => {
            const scale = this.soundLevel / AUDIO_VOLUME_MAX_LEVEL;
            packed.setVolumeScale(scale);
            voices.forEach((voice, index) => { voice.channel.volume = volumes[index] * scale; });
        };
        const scope: AudioEffectScope = {
            play: (clip, volume) => {
                if (disposed || !this.soundEnabled || this.pausedByBackground) return;
                if (clip instanceof PackedAudioEffect) {
                    const buffer = clip.buffer;
                    if (buffer) packed.play(buffer, volume);
                    return;
                }
                if (!create) return;
                // Select against the fixed voice budget. Using the growing
                // array length here repeatedly selects voice 0 during warmup.
                // Do not infer availability from `playing`: Cocos starts a
                // freshly assigned clip asynchronously.
                let index = cursor;
                if (options.reuseByClip) {
                    const matching = voices.findIndex(v => v.channel.clip === clip);
                    const empty = voices.findIndex(v => v.channel.clip === null);
                    index = matching >= 0 ? matching : empty >= 0 ? empty : voices.length < 6 ? voices.length : cursor;
                }
                cursor = (index + 1) % 6;
                if (!voices[index]) voices[index] = create();
                const voice = voices[index]!.channel;
                voice.stop(); voice.clip = clip; voice.loop = false;
                volumes[index] = clampVolume(volume);
                voice.volume = volumes[index] * this.soundLevel / AUDIO_VOLUME_MAX_LEVEL; voice.play();
            },
            stop: () => {
                packed.stop();
                voices.forEach(v => { v.channel.stop(); v.channel.clip = null; });
            },
            dispose: () => {
                if (disposed) return;
                disposed = true; scope.stop(); voices.forEach(v => v.dispose()); voices.length = 0; volumes.length = 0;
                this.effectScopes.delete(scope);
                this.soundVolumeUpdaters.delete(updateVolume);
            },
        };
        this.effectScopes.add(scope);
        this.soundVolumeUpdaters.add(updateVolume);
        updateVolume();
        return scope;
    }

    /** 整个包只下载一次；每个原始 MP3 单独解码，保持原来的声音和自然结束时机。 */
    async decodePackedAudio(data: ArrayBuffer): Promise<PackedAudioBank> {
        const context = this.getPackedAudioContext(), cancellation = new PackedAudioDecodeCancellation();
        this.packedDecodes.add(cancellation);
        try {
            const bank = await PackedAudioBank.decode(data, context, cancellation);
            if (this.disposed) { bank.destroy(); throw new Error('Audio service disposed while decoding.'); }
            return bank;
        } finally { this.packedDecodes.delete(cancellation); }
    }

    private getPackedAudioContext(): PlatformAudioContext {
        if (this.disposed) throw new Error('Audio service is disposed.');
        if (!this.packedAudioContext) this.packedAudioContext = this.createAudioContext?.();
        if (!this.packedAudioContext) throw new Error('This platform does not support packed WebAudio effects.');
        return this.packedAudioContext;
    }

    createPresentationScope(): AudioPresentationScope | undefined {
        if (!this.createEffectChannel) return undefined;
        const voice = this.createEffectChannel();
        let disposed = false, resumePending = false, volume = 0;
        const updateVolume = (): void => { voice.channel.volume = volume * this.soundLevel / AUDIO_VOLUME_MAX_LEVEL; };
        const scope: AudioPresentationScope = {
            play: (clip, gain) => {
                if (disposed || !this.soundEnabled || this.pausedByBackground) return;
                scope.stop();
                voice.channel.clip = clip;
                voice.channel.loop = false;
                volume = clampVolume(gain);
                updateVolume();
                voice.channel.play();
            },
            pause: () => {
                if (disposed || !voice.channel.playing) return;
                resumePending = true;
                voice.channel.pause();
            },
            resume: () => {
                if (disposed || !resumePending || !this.soundEnabled || this.pausedByBackground) return;
                resumePending = false;
                voice.channel.play();
            },
            stop: () => {
                resumePending = false;
                voice.channel.stop();
                voice.channel.clip = null;
            },
            dispose: () => {
                if (disposed) return;
                disposed = true;
                scope.stop();
                voice.dispose();
                this.presentationScopes.delete(scope);
                this.soundVolumeUpdaters.delete(updateVolume);
            },
        };
        this.presentationScopes.add(scope);
        this.soundVolumeUpdaters.add(updateVolume);
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

        this.completeMusicTransition();
        this.musicEnabled = enabled;
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'music') enabled ? scope.resume() : scope.pause(); });

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
        if (!enabled) {
            this.effectScopes.forEach(scope => scope.stop());
            this.presentationScopes.forEach(scope => scope.stop());
            this.voiceScopes.forEach((kind, scope) => { if (kind === 'effect') scope.stop(); });
        }

        if (persist) {
            this.persistSettings();
        }
    }

    onHide(): void {
        if (this.pausedByBackground) {
            return;
        }

        this.completeMusicTransition();
        this.pausedByBackground = true;
        this.effectScopes.forEach(scope => scope.stop());
        this.presentationScopes.forEach(scope => scope.pause());
        this.voiceScopes.forEach((kind, scope) => { kind === 'music' ? scope.pause() : scope.stop(); });

        if (this.musicChannel.playing) {
            this.musicChannel.pause();
        }
    }

    pauseMusic(): void {
        this.completeMusicTransition();
        if (this.pausedByGame) return;
        this.pausedByGame = true;
        if (this.musicChannel.playing) this.musicChannel.pause();
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'music') scope.pause(); });
    }

    resumeMusic(): void {
        const shouldResume = this.pausedByGame;
        this.pausedByGame = false;
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'music') scope.resume(); });
        if (shouldResume && this.musicEnabled && !this.pausedByBackground && this.currentMusic) {
            this.musicChannel.play();
        }
    }

    onShow(): void {
        const shouldResume = this.pausedByBackground;
        this.pausedByBackground = false;

        this.presentationScopes.forEach(scope => scope.resume());
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'music') scope.resume(); });

        if (shouldResume && this.musicEnabled && !this.pausedByGame && this.currentMusic) {
            this.musicChannel.play();
        }
    }

    dispose(): void {
        this.disposed = true;
        Array.from(this.packedDecodes).forEach(decode => decode.cancel());
        this.packedDecodes.clear();
        Array.from(this.effectScopes).forEach(scope => scope.dispose());
        Array.from(this.presentationScopes).forEach(scope => scope.dispose());
        Array.from(this.voiceScopes.keys()).forEach(scope => scope.dispose());
        this.stopMusic();
        this.effectChannel.stop();
        this.packedFallbackScope = undefined;
        const context = this.packedAudioContext;
        this.packedAudioContext = undefined;
        if (context) {
            try { void Promise.resolve(context.close()).catch(() => undefined); }
            catch (_error: unknown) { /* 原生上下文已关闭时保持幂等释放。 */ }
        }
    }

    private isMusicAudible(): boolean {
        return this.musicEnabled && !this.pausedByBackground && !this.pausedByGame;
    }

    private spareMusicChannel(): MusicChannel | undefined {
        return this.musicChannels.find((channel) => channel !== this.musicChannel);
    }

    private releaseFadingChannel(): void {
        const fading = this.fadingMusicChannel;
        if (!fading) return;
        fading.stop();
        fading.clip = null;
        this.fadingMusicChannel = undefined;
        this.fadingMusicStart = 0;
    }

    private startCrossfade(
        outgoing: MusicChannel,
        incoming: MusicChannel,
        fadeOutMs: number,
        fadeInMs: number,
        target: number,
    ): void {
        const startedAt = Date.now();
        const outFrom = this.musicUnscaledVolumes.get(outgoing) ?? 1;
        const inFrom = this.musicUnscaledVolumes.get(incoming) ?? 0;
        const next = this.currentMusic!;
        const startSeconds = this.currentMusicStart;
        const stopTimer = (): void => {
            clearInterval(timer);
            if (this.musicTransition === transition) this.musicTransition = undefined;
        };
        const finish = (): void => {
            stopTimer();
            if (this.fadingMusicChannel === outgoing) this.releaseFadingChannel();
            this.setMusicChannelVolume(incoming, target);
        };
        const timer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            const tOut = fadeOutMs > 0 ? Math.min(1, elapsed / fadeOutMs) : 1;
            const tIn = fadeInMs > 0 ? Math.min(1, elapsed / fadeInMs) : 1;
            // equal-power curves keep the combined loudness steady through the overlap
            this.setMusicChannelVolume(outgoing, outFrom * Math.cos(tOut * Math.PI / 2));
            this.setMusicChannelVolume(incoming, inFrom + (target - inFrom) * Math.sin(tIn * Math.PI / 2));
            if (tOut >= 1 && tIn >= 1) finish();
        }, MUSIC_FADE_STEP_MS);
        const transition: MusicTransition = { next, startSeconds, targetVolume: target, cancel: stopTimer, complete: finish };
        this.musicTransition = transition;
    }

    private completeMusicTransition(): void {
        this.musicTransition?.complete();
    }

    private setMusicChannelVolume(channel: MusicChannel, volume: number): void {
        const base = clampVolume(volume);
        this.musicUnscaledVolumes.set(channel, base);
        channel.volume = base * this.musicGain * this.musicLevel / AUDIO_VOLUME_MAX_LEVEL;
    }

    private refreshMusicVolumes(): void {
        this.musicChannels.forEach(channel => this.setMusicChannelVolume(channel, this.musicUnscaledVolumes.get(channel) ?? 0));
        this.voiceScopes.forEach((kind, scope) => { if (kind === 'music') scope.setVolume(scope.volume); });
    }

    private persistSettings(): void {
        const current = this.storage.snapshot.settings;
        const settings: UserSettings = {
            ...current,
            musicEnabled: this.musicEnabled,
            soundEnabled: this.soundEnabled,
            musicVolumeLevel: this.musicLevel,
            soundVolumeLevel: this.soundLevel,
        };
        this.storage.writeSettings(settings);
    }
}

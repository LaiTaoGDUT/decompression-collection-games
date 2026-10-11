import type { AudioClip } from 'cc';
import type { AssetService } from '../asset/AssetService';
import type { FeedbackCue, FeedbackService } from '../feedback/FeedbackService';
import type { AudioService } from './AudioService';

type AudioCuePath = string | readonly string[];

export interface BundleAudioBankConfig {
    readonly bundle: string;
    /** 大厅始终准备音频，允许在大厅设置中即时开启。 */
    readonly alwaysLoad?: boolean;
    readonly music?: string;
    /** 本 Bundle 背景音乐的播放音量（0–1），默认 1。 */
    readonly musicVolume?: number;
    /** Future music may be registered before the clip is shipped. */
    readonly optionalMusic?: string;
    readonly cues: Readonly<Partial<Record<FeedbackCue, AudioCuePath>>>;
    /**
     * Optional cues can be staged before the corresponding asset is imported.
     * A missing optional clip does not invalidate the rest of the audio bank.
     */
    readonly optionalCues?: Readonly<Partial<Record<FeedbackCue, AudioCuePath>>>;
}

/** 一个场景/Bundle 持有的音乐与 Cue 注册；dispose 后不再保留 AudioClip 引用。 */
export class BundleAudioBank {
    private registered: FeedbackCue[] = [];
    private disposed = false;
    private musicClip?: AudioClip;
    private musicOverride?: AudioClip;

    constructor(
        private readonly config: BundleAudioBankConfig,
        private readonly audio: AudioService,
        private readonly feedback: FeedbackService,
        private readonly assets: AssetService,
    ) {}

    async initialize(): Promise<void> {
        if (this.disposed) return;
        const loadMusic = this.config.alwaysLoad || this.audio.isMusicEnabled;
        const loadSound = this.config.alwaysLoad || this.audio.isSoundEnabled;

        const tasks: Promise<void>[] = [];
        if (loadMusic) tasks.push(this.initializeMusic());
        if (loadSound) {
            for (const cue of Object.keys(this.config.cues) as FeedbackCue[]) {
                const configured = this.config.cues[cue];
                if (configured) tasks.push(this.loadAndRegisterCue(cue, configured, false));
            }
            for (const cue of Object.keys(this.config.optionalCues ?? {}) as FeedbackCue[]) {
                const configured = this.config.optionalCues?.[cue];
                if (configured) tasks.push(this.loadAndRegisterCue(cue, configured, true));
            }
        }
        await Promise.all(tasks);
    }

    private async initializeMusic(): Promise<void> {
        const path = this.config.music ?? this.config.optionalMusic;
        if (!path) return;
        try {
            const music = await this.loadClip(path);
            if (!this.disposed) {
                this.musicClip = music;
                // 页面覆盖音乐时，迟到的场景音乐加载只能缓存，不能抢回播放权。
                if (!this.musicOverride) this.audio.playMusic(music, this.config.musicVolume ?? 1);
            }
        } catch (error: unknown) {
            if (this.config.music) throw error;
        }
    }

    /** 场景内页面覆盖背景音乐；清空覆盖后恢复场景曲目，支持加载完成前快速返回。 */
    setMusicOverride(clip?: AudioClip): void {
        if (this.disposed) return;
        this.musicOverride = clip;
        const selected = clip ?? this.musicClip;
        if (selected) this.audio.transitionMusic(selected, {
            volumeScale: this.config.musicVolume ?? 1,
            fadeOutSeconds: .6,
            fadeInSeconds: .8,
        });
        else this.audio.stopMusic();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.audio.stopMusic();
        this.registered.forEach((cue) => this.feedback.unregisterSound(cue));
        this.registered = [];
        this.musicClip = undefined;
        this.musicOverride = undefined;
    }

    private async loadAndRegisterCue(
        cue: FeedbackCue,
        configured: AudioCuePath,
        optional: boolean,
    ): Promise<void> {
        const paths = typeof configured === 'string' ? [configured] : configured;

        try {
            const clips = await Promise.all(paths.map((assetPath) => this.loadClip(assetPath)));
            if (this.disposed) return;
            this.feedback.registerSounds(cue, clips);
            this.registered.push(cue);
        } catch (error: unknown) {
            if (!optional) throw error;
        }
    }

    private loadClip(assetPath: string): Promise<AudioClip> {
        return this.assets.loadAudioClip(this.config.bundle, assetPath);
    }
}

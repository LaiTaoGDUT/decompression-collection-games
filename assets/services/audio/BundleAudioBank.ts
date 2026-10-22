import type { AudioClip } from 'cc';
import type { AssetService } from '../asset/AssetService';
import type { FeedbackCue, FeedbackService } from '../feedback/FeedbackService';
import type { AudioEffectScope, AudioService } from './AudioService';
import type { PackedAudioBank } from './PackedAudioBank';

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
    /** 高频 cue 复用本 Bank 的有限声部，避免每次播放新建小程序音频实例。 */
    readonly pooledCues?: readonly FeedbackCue[];
    /** 短音效的 AUDIOBNK 资源路径；Cue 保留原路径，音乐仍使用独立 AudioClip。 */
    readonly packedEffects?: string;
    /**
     * Optional cues can be staged before the corresponding asset is imported.
     * A missing optional clip does not invalidate the rest of the audio bank.
     */
    readonly optionalCues?: Readonly<Partial<Record<FeedbackCue, AudioCuePath>>>;
}

/** 场景持有音乐和Cue注册；退出移除引用，派生音效缓冲归AssetService统一释放。 */
export class BundleAudioBank {
    private registered: FeedbackCue[] = [];
    private disposed = false;
    private musicClip?: AudioClip;
    private musicOverride?: AudioClip;
    private effectScope?: AudioEffectScope;
    private packedBank?: PackedAudioBank;

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
        if (loadSound) tasks.push(this.initializeEffects());
        await Promise.all(tasks);
    }

    private async initializeEffects(): Promise<void> {
        if ((this.config.packedEffects || this.config.pooledCues?.length) && !this.effectScope) {
            this.effectScope = this.audio.createEffectScope({ reuseByClip: true });
        }
        if (this.config.packedEffects) {
            const bank = await this.assets.loadPackedAudio(this.config.bundle, this.config.packedEffects,
                data => this.audio.decodePackedAudio(data));
            if (this.disposed) return;
            this.packedBank = bank;
        }
        const tasks: Promise<void>[] = [];
        for (const cue of Object.keys(this.config.cues) as FeedbackCue[]) {
            const configured = this.config.cues[cue];
            if (configured) tasks.push(this.loadAndRegisterCue(cue, configured, false));
        }
        for (const cue of Object.keys(this.config.optionalCues ?? {}) as FeedbackCue[]) {
            const configured = this.config.optionalCues?.[cue];
            if (configured) tasks.push(this.loadAndRegisterCue(cue, configured, true));
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

    stopEffects(): void { this.effectScope?.stop(); }

    /** 重开一局时从头播放当前曲目；仍遵守公共音量、静音和暂停状态。 */
    restartMusic(): void {
        if (this.disposed) return;
        const selected = this.musicOverride ?? this.musicClip;
        if (selected) this.audio.playMusic(selected, this.config.musicVolume ?? 1, { restart: true });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.audio.stopMusic();
        this.registered.forEach((cue) => this.feedback.unregisterSound(cue));
        this.registered = [];
        this.effectScope?.dispose();
        this.effectScope = undefined;
        this.musicClip = undefined;
        this.musicOverride = undefined;
        // 解码缓冲归 AssetService 所有，随资源 Bundle 释放。
        this.packedBank = undefined;
    }

    private async loadAndRegisterCue(
        cue: FeedbackCue,
        configured: AudioCuePath,
        optional: boolean,
    ): Promise<void> {
        const paths = typeof configured === 'string' ? [configured] : configured;

        try {
            const clips = this.packedBank ? paths.map(path => this.packedBank!.effect(path))
                : await Promise.all(paths.map((assetPath) => this.loadClip(assetPath)));
            if (this.disposed) return;
            this.feedback.registerSounds(cue, clips,
                this.config.packedEffects || (this.config.pooledCues?.indexOf(cue) ?? -1) >= 0 ? this.effectScope : undefined);
            this.registered.push(cue);
        } catch (error: unknown) {
            if (!optional) throw error;
        }
    }

    private loadClip(assetPath: string): Promise<AudioClip> {
        return this.assets.loadAudioClip(this.config.bundle, assetPath);
    }
}

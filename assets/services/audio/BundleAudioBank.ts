import { assetManager, AudioClip } from 'cc';
import type { FeedbackCue, FeedbackService } from '../feedback/FeedbackService';
import type { AudioService } from './AudioService';

export interface BundleAudioBankConfig {
    readonly bundle: string;
    readonly music?: string;
    readonly cues: Readonly<Partial<Record<FeedbackCue, string | readonly string[]>>>;
}

/** 一个场景/Bundle 持有的音乐与 Cue 注册；dispose 后不再保留 AudioClip 引用。 */
export class BundleAudioBank {
    private registered: FeedbackCue[] = [];
    private disposed = false;

    constructor(
        private readonly config: BundleAudioBankConfig,
        private readonly audio: AudioService,
        private readonly feedback: FeedbackService,
    ) {}

    async initialize(): Promise<void> {
        const bundle = assetManager.getBundle(this.config.bundle);
        if (!bundle) throw new Error(`Audio bundle unavailable: ${this.config.bundle}.`);

        if (this.config.music) {
            const music = await this.loadClip(bundle, this.config.music);
            if (this.disposed) return;
            this.audio.playMusic(music);
        }

        for (const cue of Object.keys(this.config.cues) as FeedbackCue[]) {
            const configured = this.config.cues[cue];
            if (!configured) continue;
            const paths = typeof configured === 'string' ? [configured] : configured;
            const clips = await Promise.all(paths.map((assetPath) => this.loadClip(bundle, assetPath)));
            if (this.disposed) return;
            this.feedback.registerSounds(cue, clips);
            this.registered.push(cue);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.audio.stopMusic();
        this.registered.forEach((cue) => this.feedback.unregisterSound(cue));
        this.registered = [];
    }

    private loadClip(bundle: ReturnType<typeof assetManager.getBundle> extends infer T ? NonNullable<T> : never, assetPath: string): Promise<AudioClip> {
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, AudioClip, (error, clip) => error ? reject(error) : resolve(clip));
        });
    }
}

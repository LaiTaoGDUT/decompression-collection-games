import type { AudioClip } from 'cc';
import type { AssetService } from '../asset/AssetService';
import type { AudioPresentationScope, AudioService } from '../audio/AudioService';

type AchievementAudioCue = 'unlock' | 'replay';
const BUNDLE = 'lobby-covers';
const DIRECTORY = 'audio/achievements';

/** 领奖与回顾使用公共声音资源；独立声部不替换大厅或游戏音乐。 */
export class AchievementAudioService {
    private readonly clips = new Map<AchievementAudioCue, AudioClip>();
    private request?: Promise<void>;
    private voice?: AudioPresentationScope;
    private generation = 0;
    private disposed = false;

    constructor(private readonly assets: AssetService, private readonly audio: AudioService) {}

    prepare(): Promise<void> {
        if (this.disposed || this.clips.size === 2) return Promise.resolve();
        if (this.request) return this.request;
        const request = this.load();
        this.request = request;
        const clear = (): void => { if (this.request === request) this.request = undefined; };
        void request.then(clear, clear);
        return request;
    }

    play(replay: boolean): void {
        this.stop();
        if (this.disposed || !this.audio.isSoundEnabled) return;
        this.voice = this.audio.createPresentationScope();
        const generation = this.generation, startedAt = Date.now();
        const cue: AchievementAudioCue = replay ? 'replay' : 'unlock';
        const start = (): void => {
            // 慢加载不在动画后半段突然补响；下一次打开仍可使用加载完成的缓存。
            if (this.disposed || generation !== this.generation || Date.now() - startedAt > 750) return;
            const clip = this.clips.get(cue);
            if (clip) this.voice?.play(clip, 1);
        };
        if (this.clips.has(cue)) start();
        else void this.prepare().then(start).catch(() => {
            // 音频异常不阻止领奖；下次展示会重新准备。
        });
    }

    stop(): void {
        this.generation++;
        this.voice?.dispose();
        this.voice = undefined;
    }

    dispose(): void {
        this.disposed = true;
        this.stop();
        this.clips.clear();
    }

    private async load(): Promise<void> {
        await this.assets.loadBundle(BUNDLE);
        await Promise.all((['unlock', 'replay'] as const).map(async cue => {
            const clip = await this.assets.loadAudioClip(BUNDLE, `${DIRECTORY}/achievement-${cue}-v1`);
            if (!this.disposed) this.clips.set(cue, clip);
        }));
    }
}

import type { AudioClip } from 'cc';
import type { AssetService } from '../asset/AssetService';
import type { BundleAudioBank } from '../audio/BundleAudioBank';

/** 由当前大厅持有的成就墙配乐；返回恢复大厅，退出场景禁止迟到的加载继续播放。 */
export class AchievementWallMusic {
    private clip?: AudioClip;
    private request?: Promise<void>;
    private opened = false;
    private disposed = false;
    private generation = 0;

    constructor(private readonly assets: AssetService, private readonly bank: BundleAudioBank) {}

    prepare(): Promise<void> {
        if (this.disposed || this.clip) return Promise.resolve();
        if (this.request) return this.request;
        const request = this.load();
        this.request = request;
        const clear = (): void => { if (this.request === request) this.request = undefined; };
        void request.then(clear, clear);
        return request;
    }

    enter(): void {
        if (this.disposed || this.opened) return;
        this.opened = true;
        const generation = ++this.generation;
        const play = (): void => {
            if (!this.disposed && this.opened && generation === this.generation && this.clip) {
                this.bank.setMusicOverride(this.clip);
            }
        };
        if (this.clip) play();
        else void this.prepare().then(play).catch(() => {
            // 保留当前音乐；下次进入成就墙时重试。
        });
    }

    leave(restore = true): void {
        if (!this.opened) return;
        this.opened = false;
        this.generation++;
        if (restore) this.bank.setMusicOverride();
    }

    dispose(): void {
        this.leave(false);
        this.disposed = true;
        this.clip = undefined;
    }

    private async load(): Promise<void> {
        await this.assets.loadBundle('lobby-covers');
        const clip = await this.assets.loadAudioClip('lobby-covers', 'audio/achievements/achievement-wall-ensemble-v5');
        if (!this.disposed) this.clip = clip;
    }
}

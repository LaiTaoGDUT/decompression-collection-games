import { Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import type { AssetService } from '../asset/AssetService';
import type { TrophyStyle } from '../../runtime/GameManifest';

export type AchievementArtKey = `trophy-${TrophyStyle}` | 'entry-icon' | 'wall-title' | 'wall-background'
    | 'wall-back' | 'cabinet-shelf' | 'award-background' | 'award-halo';
export const ACHIEVEMENT_ART_BUNDLE = 'lobby-covers';
export const ACHIEVEMENT_ART_DIRECTORY = 'visual/achievements';

/** 公共成就美术由应用持有；加载、派生 SpriteFrame 与释放统一经过 AssetService。 */
export class AchievementArtService {
    private readonly frames = new Map<AchievementArtKey, SpriteFrame>();
    private readonly requests = new Map<AchievementArtKey, Promise<SpriteFrame>>();
    private disposed = false;

    constructor(private readonly assets: AssetService) {}

    bind(sprite: Sprite, key: AchievementArtKey, width: number, height: number, fit: 'contain' | 'cover' = 'contain'): void {
        const cached = this.frames.get(key);
        if (cached) {
            sprite.spriteFrame = cached;
            this.fit(sprite, width, height, fit);
            return;
        }
        void this.load(key).then(frame => {
            if (this.disposed || !sprite.isValid || !sprite.node.isValid) return;
            sprite.spriteFrame = frame;
            const viewport = fit === 'cover' ? sprite.node.parent?.getComponent(UITransform)?.contentSize : undefined;
            this.fit(sprite, viewport?.width ?? width, viewport?.height ?? height, fit);
        }).catch(() => {
            // 全部美术都在大厅画面目录的预加载门禁内；异常时下次打开界面会重试。
        });
    }

    fit(sprite: Sprite, width: number, height: number, fit: 'contain' | 'cover' = 'contain'): void {
        const frame = sprite.spriteFrame;
        if (!frame) { sprite.node.getComponent(UITransform)?.setContentSize(width, height); return; }
        const original = frame.originalSize;
        const sourceWidth = Math.max(1, original.width), sourceHeight = Math.max(1, original.height);
        const scale = fit === 'cover' ? Math.max(width / sourceWidth, height / sourceHeight)
            : Math.min(width / sourceWidth, height / sourceHeight);
        sprite.node.getComponent(UITransform)?.setContentSize(sourceWidth * scale, sourceHeight * scale);
    }

    dispose(): void {
        this.disposed = true;
        this.frames.forEach(frame => this.assets.releaseRuntimeAsset(frame));
        this.frames.clear();
        this.requests.clear();
    }

    private load(key: AchievementArtKey): Promise<SpriteFrame> {
        const cached = this.frames.get(key);
        if (cached) return Promise.resolve(cached);
        const pending = this.requests.get(key);
        if (pending) return pending;
        const request = this.loadFrame(key);
        this.requests.set(key, request);
        const clear = (): void => { if (this.requests.get(key) === request) this.requests.delete(key); };
        void request.then(clear, clear);
        return request;
    }

    private async loadFrame(key: AchievementArtKey): Promise<SpriteFrame> {
        await this.assets.loadBundle(ACHIEVEMENT_ART_BUNDLE);
        const texture = await this.assets.loadAsset(ACHIEVEMENT_ART_BUNDLE,
            `${ACHIEVEMENT_ART_DIRECTORY}/${key}/texture`, Texture2D);
        if (this.disposed) throw new Error('Achievement artwork has been disposed.');
        const frame = this.assets.createSpriteFrame(ACHIEVEMENT_ART_BUNDLE, texture);
        this.frames.set(key, frame);
        return frame;
    }
}

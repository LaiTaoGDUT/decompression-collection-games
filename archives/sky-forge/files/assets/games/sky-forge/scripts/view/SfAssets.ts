import { AudioClip, BitmapFont, EffectAsset, Material, SpriteFrame, Texture2D } from 'cc';
import type { AssetService } from '../../../../services/asset/AssetService';
import { texScale } from './SfUi';
import { CHAPTERS } from '../core/SfLevels';

export const BUNDLE = 'game-sky-forge-assets';

/** 平滑贴图（特效、弹体、柔光，2 倍分辨率存储）用线性过滤；像素素材（飞机、敌人、场景）用最近邻。 */
function smooth(key: string): boolean {
    return texScale(key) < 1;
}

/**
 * 资源加载规划（DESIGN.md §8.2，用户确认的简化方案）：
 * - 公共资源阶段按用途分批准备全部画面目录；initialize 从缓存建立帧与材质，不在短初始化阶段下载战斗素材。
 * - 进游戏一次准备机库、UI、飞机、全部地图、已开放章节的环境、敌机、首领、弹体与战斗特效。
 * - 机库、图鉴、选关与战斗直接使用常驻素材，切换章节不再加载或释放目录。
 * 所有加载与释放都经过 AssetService。
 */
export class SfAssets {
    readonly frames: Record<string, SpriteFrame> = {};
    numberFont?: BitmapFont;
    bankMaterial?: Material;
    private readonly loaded = new Set<string>();
    private readonly loads = new Map<string, Promise<void>>();
    private disposed = false;

    constructor(private readonly assets: AssetService) { }

    frame = (key: string): SpriteFrame | undefined => this.frames[key];

    async loadBoot(): Promise<void> {
        const [boot, planes, font, bank] = await Promise.all([
            this.assets.loadDirectoryFrames(BUNDLE, 'visual/boot'),
            this.assets.loadDirectoryFrames(BUNDLE, 'visual/planes'),
            this.assets.loadAsset(BUNDLE, 'visual/boot/font/digits', BitmapFont),
            this.assets.loadAsset(BUNDLE, 'visual/boot/fx/sf-bank', EffectAsset),
            this.loadEnemies(),
            this.loadCombat(),
            this.loadChapters(),
        ]);
        if (this.disposed) return;
        this.install(boot, '');
        this.install(planes, 'plane/');
        this.numberFont = font;
        const texture = font.spriteFrame?.texture as Texture2D | undefined;
        texture?.setFilters?.(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        const material = new Material();
        material.initialize({ effectAsset: bank, defines: { USE_TEXTURE: true } });
        this.bankMaterial = material;
    }

    /** 分批准备常驻敌机、首领，图鉴与战斗直接共享这些帧。 */
    private async loadEnemies(): Promise<void> {
        await this.loadDir('visual/combat/enemy', 'enemy/');
        const bosses = new Set<string>();
        for (const chapter of CHAPTERS.filter(c => c.available)) {
            await this.loadDir(`visual/chapters/${chapter.scene}/enemy`, 'enemy/');
            for (const level of chapter.levels) bosses.add(level.boss.replace(/-hidden$/, ''));
        }
        for (const boss of Array.from(bosses)) await this.loadDir(`visual/bosses/${boss}`, 'boss/');
    }

    /** 启动时分批准备弹体和特效，避免集中解码上传。 */
    private async loadCombat(): Promise<void> {
        await this.loadDir('visual/combat/bullet', 'bullet/');
        await this.loadDir('visual/combat/shot', 'shot/');
        await this.loadDir('visual/combat/fx', 'fx/');
    }

    /** 所有选关地图与已开放章节环境在机库显示前就绪。 */
    private async loadChapters(): Promise<void> {
        for (const chapter of CHAPTERS) {
            await this.loadDir(`visual/maps/ch${chapter.id}`, `map/ch${chapter.id}/`);
            if (chapter.available) await this.loadDir(`visual/chapters/${chapter.scene}/env`, 'env/');
        }
    }

    private loadDir(dir: string, prefix: string): Promise<void> {
        if (this.disposed || this.loaded.has(dir)) return Promise.resolve();
        let pending = this.loads.get(dir);
        if (!pending) {
            pending = this.assets.loadDirectoryFrames(BUNDLE, dir).then(frames => {
                this.loads.delete(dir);
                if (this.disposed) return;
                this.install(frames, prefix);
                this.loaded.add(dir);
            }, error => {
                this.loads.delete(dir);
                throw error;
            });
            this.loads.set(dir, pending);
        }
        return pending;
    }

    loadAudio(path: string): Promise<AudioClip> {
        return this.assets.loadAudioClip(BUNDLE, path);
    }

    private install(frames: Readonly<Record<string, SpriteFrame>>, prefix: string): void {
        for (const key of Object.keys(frames)) {
            const frame = frames[key];
            const full = prefix + key;
            const tex = frame.texture as Texture2D;
            const filter = smooth(full) ? Texture2D.Filter.LINEAR : Texture2D.Filter.NEAREST;
            tex?.setFilters?.(filter, filter);
            tex?.setMipFilter?.(Texture2D.Filter.NONE);
            this.frames[full] = frame;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.loaded.clear();
        this.loads.clear();
        for (const key of Object.keys(this.frames)) delete this.frames[key];
        this.bankMaterial?.destroy();
        this.bankMaterial = undefined;
        this.numberFont = undefined;
    }
}

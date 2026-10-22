import { Color, Mask, Node, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';

export type Game2048FxRgb = readonly [number, number, number];

export interface Game2048MergeFxColors {
    readonly glow: Game2048FxRgb;
    readonly accent: Game2048FxRgb;
    readonly facet: Game2048FxRgb;
    readonly core: Game2048FxRgb;
}

/** 由 tools/twenty48/build-merge-fx-textures.py 生成的白色特效贴图，运行时按棋子色阶着色。 */
export interface Game2048MergeFxFrames {
    readonly glowSquare: SpriteFrame;
    readonly echo: SpriteFrame;
    readonly sparkle: SpriteFrame;
    readonly rays: SpriteFrame;
    readonly techRing: SpriteFrame;
    readonly shockwave: SpriteFrame;
}

// 与生成脚本中的 ECHO_SIDE_RATIO / TECH_RING_RADIUS_RATIO 一致，以及冲击波环的半径比例。
const ECHO_SIDE_RATIO = 0.70;
const TECH_RING_RADIUS_RATIO = 0.42;
const SHOCKWAVE_RADIUS_RATIO = 0.42;
/** 从这一档起叠加神光；再往上依次加科技光环、冲击波。 */
const RAYS_MIN_VALUE = 512;
const TECH_RING_MIN_VALUE = 1024;
const MILESTONE_MIN_VALUE = 2048;
const HIGH_MERGE_MIN_VALUE = 128;
const HIGH_MERGE_DURATION_SCALE = 1.15;
const HIGH_MERGE_DURATION_LEVEL_STEP = 0.12;
const HALO_PREWARM = 8;
const BURST_PREWARM = 40;
/** 所有合成光效共用峰值强度，避免多层同时叠亮；时间线与动作幅度保持一致。 */
const MERGE_FX_PEAK_ALPHA_SCALE = 0.65;

function softOpacity(value: number): number {
    return Math.round(value * MERGE_FX_PEAK_ALPHA_SCALE);
}

interface FxSprite {
    readonly root: Node;
    /** 填充光的反向遮罩保持棋子大小，不随光晕扩张或神光旋转。 */
    readonly cutout?: UITransform;
    readonly node: Node;
    readonly sprite: Sprite;
    readonly transform: UITransform;
    readonly opacity: UIOpacity;
}

/** 256 起进入高阶材质（256→1 … 8192→6），低档为 0。 */
export function mergeFxTier(value: number): number {
    if (!Number.isFinite(value) || value < 256) return 0;
    return Math.min(6, Math.floor(Math.log2(value / 256)) + 1);
}

function durationScale(value: number): number {
    if (!Number.isFinite(value) || value < HIGH_MERGE_MIN_VALUE) return 1;
    return HIGH_MERGE_DURATION_SCALE + Math.log2(value / HIGH_MERGE_MIN_VALUE) * HIGH_MERGE_DURATION_LEVEL_STEP;
}

interface MergeFxTimeline {
    readonly halo: number;
    readonly echoCount: number;
    echo(index: number): { readonly delay: number; readonly duration: number };
    readonly sparkleCount: number;
    readonly sparkles: number;
    readonly rays: number;
    readonly techRings: number;
    readonly techRing: number;
    readonly shockwave: number;
    readonly total: number;
}

/**
 * 逐档加码：低档一圈残影；128 起两圈；256 起星光；512 起背后神光；
 * 1024 起科技光环与冲击波；2048 起三圈残影、双层反向光环、更大的神光与星光爆发。
 */
function timeline(value: number): MergeFxTimeline {
    const tier = mergeFxTier(value);
    const scale = durationScale(value);
    const milestone = value >= MILESTONE_MIN_VALUE;
    const halo = (value < HIGH_MERGE_MIN_VALUE ? 0.22 : 0.3) * scale;
    const echoCount = milestone ? 3 : value >= HIGH_MERGE_MIN_VALUE ? 2 : 1;
    const echo = (index: number) => ({
        delay: index * 0.07 * scale,
        duration: (value < HIGH_MERGE_MIN_VALUE ? 0.24 : 0.32) * scale,
    });
    const sparkleCount = tier === 0 ? 0 : milestone ? 16 : Math.min(10, 3 + tier * 2);
    const sparkles = sparkleCount > 0 ? (milestone ? 0.6 : 0.42) * scale : 0;
    const rays = value >= RAYS_MIN_VALUE ? (milestone ? 0.7 : 0.5) * scale : 0;
    const techRings = milestone ? 2 : value >= TECH_RING_MIN_VALUE ? 1 : 0;
    const techRing = techRings > 0 ? 0.5 * scale : 0;
    const shockwave = value >= TECH_RING_MIN_VALUE ? 0.45 * scale : 0;
    let total = Math.max(halo, sparkles, rays, techRing + (techRings - 1) * 0.08, shockwave);
    for (let index = 0; index < echoCount; index += 1) {
        const { delay, duration } = echo(index);
        total = Math.max(total, delay + duration);
    }
    return { halo, echoCount, echo, sparkleCount, sparkles, rays, techRings, techRing, shockwave, total };
}

/** 合成特效从开始到最后一层消失的时长；达成弹窗据此等特效播完，而不是用固定延迟。 */
export function mergeFxDuration(value: number): number {
    return timeline(value).total;
}

function tint(rgb: Game2048FxRgb): Color {
    return new Color(rgb[0], rgb[1], rgb[2], 255);
}

/**
 * 2048 合成特效，与棋子同一套霓虹造型语言：
 * - 光晕层（棋子上方）：柔光方块与神光在合成棋子中心留空，向外扩散时不被邻格遮挡；
 * - 冲击层（棋子上方）：与棋子同形状的霓虹方框残影从棋子边缘向外扩散，高档再飘出少量星光。
 * 所有元素都从棋子边缘向外，不进入数字区。全部是着色的位图 Sprite，节点在两层各自的对象池中复用。
 */
export class Game2048MergeFx {
    private readonly haloPool: FxSprite[] = [];
    private readonly burstPool: FxSprite[] = [];
    private readonly active = new Set<FxSprite>();
    private disposed = false;

    constructor(
        private readonly haloLayer: Node,
        private readonly burstLayer: Node,
        private readonly frames: Game2048MergeFxFrames,
    ) {
        for (let index = 0; index < HALO_PREWARM; index += 1) this.haloPool.push(this.create(this.haloLayer));
        for (let index = 0; index < BURST_PREWARM; index += 1) this.burstPool.push(this.create(this.burstLayer));
    }

    /** 播放一次合成特效，返回总时长（秒）。 */
    play(x: number, y: number, tileSize: number, value: number, colors: Game2048MergeFxColors): number {
        if (this.disposed || !this.haloLayer.isValid || !this.burstLayer.isValid) return 0;
        const plan = timeline(value);
        const tier = mergeFxTier(value);
        const milestone = value >= MILESTONE_MIN_VALUE;
        if (plan.rays > 0) this.playRays(x, y, tileSize, colors, milestone, plan.rays);
        this.playHalo(x, y, tileSize, colors, value, plan.halo);
        if (plan.shockwave > 0) this.playShockwave(x, y, tileSize, colors, milestone, plan.shockwave);
        for (let index = 0; index < plan.echoCount; index += 1) {
            this.playEcho(x, y, tileSize, colors, tier, index, plan.echo(index));
        }
        for (let index = 0; index < plan.techRings; index += 1) {
            this.playTechRing(x, y, tileSize, colors, index, plan.techRing);
        }
        if (plan.sparkleCount > 0) {
            this.playSparkles(x, y, tileSize, colors, tier, plan.sparkleCount, plan.sparkles, milestone);
        }
        return plan.total;
    }

    /** 立即停止所有特效并回收节点（重开时调用）。 */
    clear(): void {
        Array.from(this.active).forEach((item) => {
            this.release(item, item.root.parent === this.haloLayer ? this.haloPool : this.burstPool);
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const all = this.haloPool.concat(this.burstPool, Array.from(this.active));
        this.active.clear();
        this.haloPool.length = 0;
        this.burstPool.length = 0;
        all.forEach((item) => {
            Tween.stopAllByTarget(item.node);
            Tween.stopAllByTarget(item.opacity);
            if (item.root.isValid) item.root.destroy();
        });
    }

    private playHalo(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors, value: number, duration: number,
    ): void {
        const item = this.acquire(this.haloPool, this.haloLayer, this.frames.glowSquare);
        item.sprite.color = tint(colors.glow);
        const size = tileSize * 1.6;
        item.transform.setContentSize(size, size);
        item.root.setPosition(x, y);
        item.cutout!.setContentSize(tileSize, tileSize);
        item.node.setScale(0.9, 0.9, 1);
        item.opacity.opacity = softOpacity(value < HIGH_MERGE_MIN_VALUE ? 130 : 190);
        tween(item.node).to(duration, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' }).start();
        tween(item.opacity)
            .delay(duration * 0.3)
            .to(duration * 0.7, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => this.release(item, this.haloPool))
            .start();
    }

    /** 与棋子同形状的霓虹方框，缩放 1 时正好贴合棋子边缘，之后只向外扩。 */
    private playEcho(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors,
        tier: number, index: number, timing: { readonly delay: number; readonly duration: number },
    ): void {
        const item = this.acquire(this.burstPool, this.burstLayer, this.frames.echo);
        item.sprite.color = tint(index === 0 ? colors.facet : colors.glow);
        const size = tileSize / ECHO_SIDE_RATIO;
        item.transform.setContentSize(size, size);
        item.node.setPosition(x, y);
        item.node.setScale(1, 1, 1);
        item.opacity.opacity = 0;
        const endScale = 1.2 + index * 0.08 + tier * 0.025;
        tween(item.node)
            .delay(timing.delay)
            .to(timing.duration, { scale: new Vec3(endScale, endScale, 1) }, { easing: 'cubicOut' })
            .start();
        tween(item.opacity)
            .delay(timing.delay)
            .set({ opacity: softOpacity(index === 0 ? 255 : 190) })
            .to(timing.duration, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => this.release(item, this.burstPool))
            .start();
    }

    /** 星光从棋子四周轻轻飘出、旋转、闪烁后消失。 */
    private playSparkles(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors,
        tier: number, count: number, duration: number, milestone: boolean,
    ): void {
        const palette = [colors.core, colors.facet, colors.glow];
        const reach = milestone ? 0.75 : 0.22 + tier * 0.04;
        for (let index = 0; index < count; index += 1) {
            // 黄金角分布，避免星光扎堆，同时每次合成位置一致可预期。
            const angle = index * 2.39996 + tier * 0.5;
            const from = tileSize * (0.6 + (index % 3) * 0.06);
            const to = from + tileSize * (reach + (index % 2) * 0.12);
            const size = tileSize * ((milestone ? 0.24 : 0.2) + (index % 3) * 0.05);
            const delay = (index % 4) * 0.035;
            const item = this.acquire(this.burstPool, this.burstLayer, this.frames.sparkle);
            item.sprite.color = tint(palette[index % palette.length]);
            item.transform.setContentSize(size, size);
            item.node.setPosition(x + Math.cos(angle) * from, y + Math.sin(angle) * from);
            item.node.setScale(0, 0, 1);
            item.opacity.opacity = softOpacity(255);
            tween(item.node)
                .delay(delay)
                .to(duration * 0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .to(duration * 0.7, {
                    position: new Vec3(x + Math.cos(angle) * to, y + Math.sin(angle) * to, 0),
                    scale: new Vec3(0.2, 0.2, 1),
                    angle: 90,
                }, { easing: 'quadOut' })
                .start();
            tween(item.opacity)
                .delay(delay + duration * 0.55)
                .to(duration * 0.45, { opacity: 0 })
                .call(() => this.release(item, this.burstPool))
                .start();
        }
    }

    /** 从合成棋子四周展开的神光，旋转时中心留空，邻格棋子不遮挡光束。 */
    private playRays(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors, milestone: boolean, duration: number,
    ): void {
        const item = this.acquire(this.haloPool, this.haloLayer, this.frames.rays);
        item.sprite.color = tint(colors.glow);
        const size = tileSize * (milestone ? 4.4 : 3.4);
        item.transform.setContentSize(size, size);
        item.root.setPosition(x, y);
        item.cutout!.setContentSize(tileSize, tileSize);
        item.node.setScale(0.55, 0.55, 1);
        item.node.angle = 0;
        item.opacity.opacity = 0;
        tween(item.node)
            .to(duration, { scale: new Vec3(1.05, 1.05, 1), angle: milestone ? 40 : 25 }, { easing: 'quadOut' })
            .start();
        tween(item.opacity)
            .to(duration * 0.2, { opacity: softOpacity(milestone ? 235 : 180) }, { easing: 'quadOut' })
            .delay(duration * 0.25)
            .to(duration * 0.55, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => this.release(item, this.haloPool))
            .start();
    }

    /** HUD 式刻度光环：从棋子外缘展开并旋转，2048 起两层反向旋转。 */
    private playTechRing(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors, index: number, duration: number,
    ): void {
        const item = this.acquire(this.burstPool, this.burstLayer, this.frames.techRing);
        item.sprite.color = tint(index === 0 ? colors.facet : colors.accent);
        const size = tileSize * 0.64 / TECH_RING_RADIUS_RATIO;
        item.transform.setContentSize(size, size);
        item.node.setPosition(x, y);
        item.node.setScale(0.92, 0.92, 1);
        item.node.angle = index * 30;
        item.opacity.opacity = 0;
        const delay = index * 0.08;
        const endScale = index === 0 ? 1.55 : 1.95;
        tween(item.node)
            .delay(delay)
            .to(duration, { scale: new Vec3(endScale, endScale, 1), angle: index === 0 ? -70 : 100 }, { easing: 'cubicOut' })
            .start();
        tween(item.opacity)
            .delay(delay)
            .set({ opacity: softOpacity(255) })
            .delay(duration * 0.35)
            .to(duration * 0.65, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => this.release(item, this.burstPool))
            .start();
    }

    /** 扫过整个棋盘的柔光冲击波，从棋子外缘出发，快速扩散并淡出。 */
    private playShockwave(
        x: number, y: number, tileSize: number, colors: Game2048MergeFxColors, milestone: boolean, duration: number,
    ): void {
        const item = this.acquire(this.burstPool, this.burstLayer, this.frames.shockwave);
        item.sprite.color = tint(colors.glow);
        const size = tileSize * 0.62 / SHOCKWAVE_RADIUS_RATIO;
        item.transform.setContentSize(size, size);
        item.node.setPosition(x, y);
        item.node.setScale(1, 1, 1);
        // 冲击波会扫过邻格数字，保持低不透明度，只留下"一道光掠过"的感觉。
        item.opacity.opacity = softOpacity(milestone ? 105 : 80);
        const endScale = milestone ? 5.2 : 3.6;
        tween(item.node).to(duration, { scale: new Vec3(endScale, endScale, 1) }, { easing: 'quadOut' }).start();
        tween(item.opacity)
            .to(duration, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => this.release(item, this.burstPool))
            .start();
    }

    private create(layer: Node): FxSprite {
        const root = new Node('MergeFx');
        root.layer = layer.layer;
        root.setParent(layer);
        let node = root;
        let cutout: UITransform | undefined;
        if (layer === this.haloLayer) {
            // 只裁掉当前合成棋子的中心；遮罩与特效分开，避免缩放/旋转使留空区域扫到邻格。
            cutout = root.addComponent(UITransform);
            const mask = root.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_RECT;
            mask.inverted = true;
            node = new Node('Glow');
            node.layer = layer.layer;
            node.setParent(root);
        }
        const transform = node.addComponent(UITransform);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const opacity = node.addComponent(UIOpacity);
        root.active = false;
        return { root, cutout, node, sprite, transform, opacity };
    }

    private acquire(pool: FxSprite[], layer: Node, frame: SpriteFrame): FxSprite {
        const item = pool.pop() ?? this.create(layer);
        Tween.stopAllByTarget(item.node);
        Tween.stopAllByTarget(item.opacity);
        item.sprite.spriteFrame = frame;
        item.node.angle = 0;
        item.root.active = true;
        item.root.setSiblingIndex(layer.children.length - 1);
        this.active.add(item);
        return item;
    }

    private release(item: FxSprite, pool: FxSprite[]): void {
        if (!this.active.delete(item)) return;
        Tween.stopAllByTarget(item.node);
        Tween.stopAllByTarget(item.opacity);
        if (this.disposed || !item.root.isValid) return;
        item.root.active = false;
        pool.push(item);
    }
}

import { Rect, Size, SpriteFrame, Texture2D } from 'cc';

/**
 * 把一张网格精灵表切成 `SpriteFrame` 数组。
 *
 * 原作的猫动画存在 `cat_atlas.png` / `cat_atlas_1.png` 里，导出时按固定网格重排，
 * 每帧大小一致、四周留 `pad` 像素透明边（避免线性过滤把相邻帧吸进来）。
 * 帧几何由 `MEOWDOKU_SHEETS` 描述，运行时直接按索引取帧，不需要额外的数据文件。
 */
export interface MeowdokuSheetSpec {
    readonly cols: number;
    readonly rows: number;
    readonly count: number;
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly pad: number;
}

export function buildSheetFrames(
    texture: Texture2D,
    spec: MeowdokuSheetSpec,
): readonly SpriteFrame[] {
    const frames: SpriteFrame[] = [];
    const strideX = spec.frameWidth + spec.pad * 2;
    const strideY = spec.frameHeight + spec.pad * 2;
    const total = Math.min(spec.count, spec.cols * spec.rows);

    for (let index = 0; index < total; index += 1) {
        const col = index % spec.cols;
        const row = Math.floor(index / spec.cols);
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(
            col * strideX + spec.pad,
            row * strideY + spec.pad,
            spec.frameWidth,
            spec.frameHeight,
        );
        frame.originalSize = new Size(spec.frameWidth, spec.frameHeight);
        frames.push(frame);
    }
    return Object.freeze(frames);
}

/** 从整张贴图创建一个单帧 `SpriteFrame`（矩形与原始尺寸都按贴图整幅设置）。 */
export function buildSingleFrame(texture: Texture2D): SpriteFrame {
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(0, 0, texture.width, texture.height);
    frame.originalSize = new Size(texture.width, texture.height);
    return frame;
}

/** 给圆角底板帧设置 9-slice 内缩，使圆角在任何格子尺寸下都保持不变。 */
export function applyNineSlice(frame: SpriteFrame, inset: number): void {
    frame.insetLeft = inset;
    frame.insetTop = inset;
    frame.insetRight = inset;
    frame.insetBottom = inset;
}

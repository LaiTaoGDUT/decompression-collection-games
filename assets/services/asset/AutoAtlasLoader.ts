import {
    AssetManager,
    Rect,
    Size,
    SpriteAtlas,
    SpriteFrame,
    Texture2D,
} from 'cc';

/**
 * 描述一个由 Auto Atlas 提供的精灵帧。
 *
 * `fallbackTexturePath` 只用于编辑器预览或旧构建回退：Auto Atlas 是构建期
 * 资源，编辑器运行时的 `.pac` 可能还没有生成帧，因此不能把它当成唯一来源。
 */
export interface AutoAtlasFrameRequest {
    readonly key: string;
    readonly frameName: string;
    readonly fallbackTexturePath: string;
}

/** 将 Cocos `.../<asset-name>/texture` 路径转换为图集帧名。 */
export function autoAtlasFrameName(texturePath: string): string {
    const segments = texturePath.split('/').filter(Boolean);
    return segments.length >= 2
        ? segments[segments.length - 2]!
        : texturePath;
}

/**
 * 从 Cocos Auto Atlas 加载一组 SpriteFrame。
 *
 * Auto Atlas 里的 SpriteFrame 由 `.pac` 持有，游戏退出时会随 Bundle 一起释放。
 * 这里复制帧的几何信息，只把图集纹理作为依赖引用，这样游戏原有的 dispose()
 * 可以安全销毁运行时帧，而不会误销毁 SpriteAtlas 自己的子资源。
 */
export async function loadAutoAtlasFrames(
    bundle: AssetManager.Bundle,
    atlasPath: string,
    entries: readonly AutoAtlasFrameRequest[],
): Promise<Readonly<Record<string, SpriteFrame>>> {
    let atlas: SpriteAtlas | undefined;

    try {
        atlas = await loadAtlas(bundle, atlasPath);
    } catch (error: unknown) {
        // `.pac` 只在构建阶段生成内容；编辑器预览、热重载或老版本构建
        // 可能暂时没有 SpriteAtlas。此时逐张纹理回退，保持预览可用。
        console.warn(`[AutoAtlasLoader] Atlas unavailable, using source textures: ${atlasPath}`, error);
    }

    const loadedEntries = await Promise.all(entries.map(async (entry) => {
        const atlasFrame = atlas?.getSpriteFrame(entry.frameName);
        if (atlasFrame?.texture) {
            return [entry.key, cloneSpriteFrame(atlasFrame)] as const;
        }

        const texture = await loadTexture(bundle, entry.fallbackTexturePath);
        return [entry.key, createTextureFrame(texture)] as const;
    }));

    const frames: Record<string, SpriteFrame> = {};
    loadedEntries.forEach(([key, frame]) => {
        frames[key] = frame;
    });
    return frames;
}

function loadAtlas(
    bundle: AssetManager.Bundle,
    path: string,
): Promise<SpriteAtlas> {
    return new Promise<SpriteAtlas>((resolve, reject) => {
        bundle.load(path, SpriteAtlas, (error, atlas) => {
            if (error || !atlas) {
                reject(error ?? new Error(`Auto Atlas is missing: ${path}`));
                return;
            }
            resolve(atlas);
        });
    });
}

function loadTexture(
    bundle: AssetManager.Bundle,
    path: string,
): Promise<Texture2D> {
    return new Promise<Texture2D>((resolve, reject) => {
        bundle.load(path, Texture2D, (error, texture) => {
            if (error || !texture) {
                reject(error ?? new Error(`Texture is missing: ${path}`));
                return;
            }
            resolve(texture);
        });
    });
}

function createTextureFrame(texture: Texture2D): SpriteFrame {
    const frame = new SpriteFrame();
    frame.packable = false;
    frame.texture = texture;
    frame.rect = new Rect(0, 0, texture.width, texture.height);
    frame.originalSize = new Size(texture.width, texture.height);
    return frame;
}

function cloneSpriteFrame(source: SpriteFrame): SpriteFrame {
    const frame = new SpriteFrame();
    frame.packable = false;
    frame.texture = source.texture;
    frame.rect = source.rect.clone();
    frame.originalSize = source.originalSize.clone();
    frame.offset = source.offset.clone();
    frame.rotated = source.rotated;
    frame.insetTop = source.insetTop;
    frame.insetBottom = source.insetBottom;
    frame.insetLeft = source.insetLeft;
    frame.insetRight = source.insetRight;
    return frame;
}

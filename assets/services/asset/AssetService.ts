import { Asset, assetManager, AssetManager, AudioClip, Rect, Size, SpriteFrame, Texture2D } from 'cc';
import { loadAutoAtlasFrames, type AutoAtlasFrameRequest } from './AutoAtlasLoader';

type AssetConstructor<T extends Asset> = new (...args: any[]) => T;

export interface SpriteFrameRequest {
    readonly key: string;
    readonly path: string;
    readonly type?: 'frame' | 'texture';
}

export interface BundlePreparationOptions {
    /** 音频由游戏按设置显式加载，不能混入画面目录预加载。 */
    readonly excludeAudio?: boolean;
}

export interface AssetBundleProvider {
    getBundle(name: string): AssetManager.Bundle | null;
    loadBundle(
        name: string,
        onComplete: (
            error: Error | null,
            bundle: AssetManager.Bundle,
        ) => void,
    ): void;
    removeBundle(bundle: AssetManager.Bundle): void;
}

export class AssetBundleLoadError extends Error {
    constructor(
        readonly bundleName: string,
        readonly cause: unknown,
    ) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to load Asset Bundle "${bundleName}": ${reason}`);
        this.name = 'AssetBundleLoadError';
    }
}

export class AssetBundleAssetLoadError extends Error {
    constructor(
        readonly bundleName: string,
        readonly directory: string,
        readonly cause: unknown,
    ) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to load directory "${directory}" from Asset Bundle "${bundleName}": ${reason}`);
        this.name = 'AssetBundleAssetLoadError';
    }
}

export class AssetBundleReleaseError extends Error {
    constructor(
        readonly bundleName: string,
        readonly cause: unknown,
    ) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to release Asset Bundle "${bundleName}": ${reason}`);
        this.name = 'AssetBundleReleaseError';
    }
}

// WeChat subpackages are downloaded on first use. Large game bundles can take
// well over 15 seconds on a weak mobile connection even though the platform is
// still making progress, so do not report a false bundle failure too early.
const DEFAULT_BUNDLE_LOAD_TIMEOUT_MS = 60000;

function normalizeBundleName(name: string): string {
    const normalized = name.trim();

    if (!normalized) {
        throw new Error('Asset Bundle name must not be empty.');
    }

    return normalized;
}

/** 统一加载 Asset Bundle，并合并同名并发请求。 */
export class AssetService {
    private readonly pendingLoads = new Map<
        string,
        Promise<AssetManager.Bundle>
    >();
    private readonly pendingPreparations = new Map<
        string,
        Promise<AssetManager.Bundle>
    >();
    private readonly preparedDirectories = new Set<string>();
    private readonly pendingAudio = new Map<string, Promise<AudioClip>>();
    private readonly pendingAssets = new Map<string, Map<AssetConstructor<Asset>, Promise<Asset>>>();
    private readonly pendingAssetGroups = new Map<Promise<unknown>, string>();
    private readonly retainedAssets = new Map<string, Set<Asset>>();
    /** 按目录分组持有的资源：可在游戏中途单独释放（例如离开章节时释放章节场景）。 */
    private readonly directoryGroups = new Map<string, {
        readonly bundleName: string;
        readonly directory: string;
        readonly sources: Set<Asset>;
        readonly runtime: Set<Asset>;
        readonly loads: Set<Promise<unknown>>;
    }>();
    private readonly runtimeAssets = new Map<Asset, string>();

    constructor(
        private readonly provider: AssetBundleProvider = assetManager,
        private readonly loadTimeoutMs = DEFAULT_BUNDLE_LOAD_TIMEOUT_MS,
    ) {
        if (!Number.isFinite(loadTimeoutMs) || loadTimeoutMs <= 0) {
            throw new Error('Asset bundle timeout must be greater than zero.');
        }
    }

    loadBundle(name: string): Promise<AssetManager.Bundle> {
        const bundleName = normalizeBundleName(name);
        const loadedBundle = this.provider.getBundle(bundleName);

        if (loadedBundle) {
            return Promise.resolve(loadedBundle);
        }

        const pendingLoad = this.pendingLoads.get(bundleName);

        if (pendingLoad) {
            return pendingLoad;
        }

        const load = this.createLoad(bundleName);
        this.pendingLoads.set(bundleName, load);

        const clearPendingLoad = (): void => {
            if (this.pendingLoads.get(bundleName) === load) {
                this.pendingLoads.delete(bundleName);
            }
        };
        void load.then(clearPendingLoad, clearPendingLoad);

        return load;
    }

    /**
     * 加载 Bundle 配置并准备指定目录。小游戏的画面准备排除 AudioClip，
     * 音频由 initialize 按设置单独加载；大厅使用完整目录准备。
     */
    prepareBundle(
        name: string,
        directory = 'visual',
        onProgress?: (finished: number, total: number) => void,
        options: BundlePreparationOptions = {},
    ): Promise<AssetManager.Bundle> {
        const bundleName = normalizeBundleName(name);
        const normalizedDirectory = directory.trim().replace(/^\/+|\/+$/g, '');

        if (!normalizedDirectory) {
            return Promise.reject(new Error('Asset directory must not be empty.'));
        }

        const preparationKey = this.createPreparationKey(
            bundleName,
            normalizedDirectory,
            options.excludeAudio,
        );
        if (this.preparedDirectories.has(preparationKey)) {
            const loadedBundle = this.provider.getBundle(bundleName);
            if (loadedBundle) {
                onProgress?.(1, 1);
                return Promise.resolve(loadedBundle);
            }
            this.preparedDirectories.delete(preparationKey);
        }

        const pendingPreparation = this.pendingPreparations.get(preparationKey);
        if (pendingPreparation) {
            return pendingPreparation;
        }

        const preparation = this.createPreparation(
            bundleName,
            normalizedDirectory,
            onProgress,
            options.excludeAudio,
        );
        this.pendingPreparations.set(preparationKey, preparation);

        const clearPendingPreparation = (): void => {
            if (this.pendingPreparations.get(preparationKey) === preparation) {
                this.pendingPreparations.delete(preparationKey);
            }
        };
        void preparation.then(clearPendingPreparation, clearPendingPreparation);

        return preparation;
    }

    /** 音频请求去重，并纳入所属 Bundle 的退出等待与统一释放。 */
    loadAudioClip(name: string, path: string): Promise<AudioClip> {
        const bundleName = normalizeBundleName(name);
        const key = `${bundleName}\u0000${path}`;
        const pending = this.pendingAudio.get(key);
        if (pending) return pending;
        const bundle = this.provider.getBundle(bundleName);
        if (!bundle) return Promise.reject(new Error(`Audio bundle unavailable: ${bundleName}.`));
        const load = new Promise<AudioClip>((resolve, reject) => {
            bundle.load(path, AudioClip, (error, clip) => {
                if (error || !clip) reject(error ?? new Error(`Missing audio: ${bundleName}/${path}`));
                else resolve(clip);
            });
        });
        this.pendingAudio.set(key, load);
        const clear = (): void => { if (this.pendingAudio.get(key) === load) this.pendingAudio.delete(key); };
        void load.then(clear, clear);
        return load;
    }

    /** Typed asset requests share the bundle's ownership and release barrier. */
    loadAsset<T extends Asset>(name: string, path: string, type: AssetConstructor<T>): Promise<T> {
        const bundleName = normalizeBundleName(name);
        const key = `${bundleName}\u0000${path}`;
        let requests = this.pendingAssets.get(key);
        const pending = requests?.get(type);
        if (pending) return pending as Promise<T>;
        const bundle = this.provider.getBundle(bundleName);
        if (!bundle) return Promise.reject(new Error(`Asset bundle unavailable: ${bundleName}.`));
        const load = new Promise<T>((resolve, reject) => {
            bundle.load(path, type, (error, asset) => {
                if (error || !asset) {
                    reject(error ?? new Error(`Missing asset: ${bundleName}/${path}`));
                    return;
                }
                let retained = this.retainedAssets.get(bundleName);
                if (!retained) {
                    retained = new Set<Asset>();
                    this.retainedAssets.set(bundleName, retained);
                }
                if (!retained.has(asset)) {
                    asset.addRef();
                    retained.add(asset);
                }
                resolve(asset);
            });
        });
        if (!requests) {
            requests = new Map();
            this.pendingAssets.set(key, requests);
        }
        const requestMap = requests;
        requestMap.set(type, load);
        const clear = (): void => {
            if (requestMap.get(type) === load) requestMap.delete(type);
            if (requestMap.size === 0 && this.pendingAssets.get(key) === requestMap) this.pendingAssets.delete(key);
        };
        void load.then(clear, clear);
        return load;
    }

    /** Own derived assets separately from bundle-owned source frames/textures. */
    trackRuntimeAsset<T extends Asset>(name: string, asset: T): T {
        const bundleName = normalizeBundleName(name);
        if (!this.provider.getBundle(bundleName)) {
            if (asset.isValid) asset.destroy();
            throw new Error(`Cannot own runtime asset after bundle release: ${bundleName}.`);
        }
        const owner = this.runtimeAssets.get(asset);
        if (owner && owner !== bundleName) throw new Error('Runtime asset already belongs to another bundle.');
        this.runtimeAssets.set(asset, bundleName);
        return asset;
    }

    createSpriteFrame(name: string, texture: SpriteFrame['texture']): SpriteFrame {
        const frame = this.trackRuntimeAsset(name, new SpriteFrame());
        frame.texture = texture;
        return frame;
    }

    releaseRuntimeAsset(asset: Asset): void {
        if (!this.runtimeAssets.delete(asset)) return;
        if (asset.isValid) asset.destroy();
    }

    /** Own a copy of an imported frame, including its trim and nine-slice geometry. */
    loadSpriteFrame(name: string, path: string, type: 'frame' | 'texture' = 'frame'): Promise<SpriteFrame> {
        return this.loadSpriteFrames(name, [{ key: 'frame', path, type }]).then(frames => frames.frame);
    }

    /** Atomic frame acquisition. Bundle release waits for loading, cloning and failure cleanup. */
    loadSpriteFrames(name: string, entries: readonly SpriteFrameRequest[]): Promise<Readonly<Record<string, SpriteFrame>>> {
        const bundleName = normalizeBundleName(name);
        if (new Set(entries.map(entry => entry.key)).size !== entries.length) {
            return Promise.reject(new Error('Sprite frame request keys must be unique.'));
        }
        const created: SpriteFrame[] = [];
        const load = (async (): Promise<Readonly<Record<string, SpriteFrame>>> => {
            const results = await Promise.all(entries.map(async entry => {
                let frame: SpriteFrame;
                if (entry.type === 'texture') {
                    const texture = await this.loadAsset(bundleName, entry.path, Texture2D);
                    frame = this.createSpriteFrame(bundleName, texture);
                    created.push(frame);
                    frame.rect = new Rect(0, 0, texture.width, texture.height);
                    frame.originalSize = new Size(texture.width, texture.height);
                } else {
                    const source = await this.loadAsset(bundleName, entry.path, SpriteFrame);
                    frame = this.createSpriteFrame(bundleName, source.texture);
                    created.push(frame);
                    frame.rect = source.rect.clone();
                    frame.originalSize = source.originalSize.clone();
                    frame.offset = source.offset.clone();
                    frame.rotated = source.rotated;
                    frame.insetTop = source.insetTop;
                    frame.insetBottom = source.insetBottom;
                    frame.insetLeft = source.insetLeft;
                    frame.insetRight = source.insetRight;
                }
                frame.packable = false;
                return [entry.key, frame] as const;
            }).map(request => request.then(
                value => ({ status: 'fulfilled' as const, value }),
                reason => ({ status: 'rejected' as const, reason }),
            )));
            const failure = results.find(result => result.status === 'rejected');
            if (failure?.status === 'rejected') {
                created.forEach(frame => this.releaseRuntimeAsset(frame));
                throw failure.reason;
            }
            const frames: Record<string, SpriteFrame> = {};
            results.forEach(result => {
                if (result.status === 'fulfilled') frames[result.value[0]] = result.value[1];
            });
            return frames;
        })();
        this.pendingAssetGroups.set(load, bundleName);
        const clear = (): void => { this.pendingAssetGroups.delete(load); };
        void load.then(clear, clear);
        return load;
    }

    loadAutoAtlasFrames(
        name: string,
        atlasPath: string,
        entries: readonly AutoAtlasFrameRequest[],
    ): Promise<Readonly<Record<string, SpriteFrame>>> {
        const bundleName = normalizeBundleName(name);
        const bundle = this.provider.getBundle(bundleName);
        if (!bundle) return Promise.reject(new Error(`Asset bundle unavailable: ${bundleName}.`));
        // Keep the whole atlas -> fallback -> clone chain inside the release
        // barrier, including requests started after the first atlas attempt.
        const load = loadAutoAtlasFrames(bundle, atlasPath, entries,
            (path, type) => this.loadAsset(bundleName, path, type))
            .then(frames => {
                for (const key of Object.keys(frames)) this.trackRuntimeAsset(bundleName, frames[key]);
                return frames;
            });
        this.pendingAssetGroups.set(load, bundleName);
        const clear = (): void => { this.pendingAssetGroups.delete(load); };
        void load.then(clear, clear);
        return load;
    }

    /**
     * 加载目录下的全部 SpriteFrame，并按目录分组持有；返回键为目录内相对路径（不含 `/spriteFrame`）。
     * 目录分组可以用 releaseDirectory 在 Bundle 仍在使用时单独释放；分组内资源不得再由其他请求共享。
     */
    loadDirectoryFrames(name: string, directory: string): Promise<Readonly<Record<string, SpriteFrame>>> {
        const bundleName = normalizeBundleName(name);
        const dir = directory.trim().replace(/^\/+|\/+$/g, '');
        if (!dir) return Promise.reject(new Error('Asset directory must not be empty.'));
        const key = `${bundleName}\u0000${dir}`;
        let group = this.directoryGroups.get(key);
        if (!group) {
            group = { bundleName, directory: dir, sources: new Set(), runtime: new Set(), loads: new Set() };
            this.directoryGroups.set(key, group);
        }
        const owner = group;
        const created: SpriteFrame[] = [];
        const load = (async (): Promise<Readonly<Record<string, SpriteFrame>>> => {
            const bundle = await this.loadBundle(bundleName);
            const entries = bundle.getDirWithPath(dir, SpriteFrame).map(info => ({
                key: info.path.slice(dir.length + 1).replace(/\/spriteFrame$/, ''),
                path: info.path,
            }));
            const frames: Record<string, SpriteFrame> = {};
            try {
                await Promise.all(entries.map(async entry => {
                    const source = await this.loadAsset(bundleName, entry.path, SpriteFrame);
                    owner.sources.add(source);
                    const frame = this.createSpriteFrame(bundleName, source.texture);
                    created.push(frame);
                    owner.runtime.add(frame);
                    frame.rect = source.rect.clone();
                    frame.originalSize = source.originalSize.clone();
                    frame.offset = source.offset.clone();
                    frame.rotated = source.rotated;
                    frame.insetTop = source.insetTop;
                    frame.insetBottom = source.insetBottom;
                    frame.insetLeft = source.insetLeft;
                    frame.insetRight = source.insetRight;
                    frame.packable = false;
                    frames[entry.key] = frame;
                }));
            } catch (error) {
                created.forEach(frame => { owner.runtime.delete(frame); this.releaseRuntimeAsset(frame); });
                throw error;
            }
            return frames;
        })();
        owner.loads.add(load);
        this.pendingAssetGroups.set(load, bundleName);
        const clear = (): void => { owner.loads.delete(load); this.pendingAssetGroups.delete(load); };
        void load.then(clear, clear);
        return load;
    }

    /** 释放 loadDirectoryFrames 建立的目录分组：销毁派生帧，源资源减引用并尝试释放。 */
    async releaseDirectory(name: string, directory: string): Promise<void> {
        const bundleName = normalizeBundleName(name);
        const dir = directory.trim().replace(/^\/+|\/+$/g, '');
        const key = `${bundleName}\u0000${dir}`;
        const group = this.directoryGroups.get(key);
        if (!group) return;
        while (group.loads.size > 0) {
            await Promise.all(Array.from(group.loads).map(load => load.catch(() => undefined)));
        }
        if (this.directoryGroups.get(key) !== group) return;
        this.directoryGroups.delete(key);
        group.runtime.forEach(asset => this.releaseRuntimeAsset(asset));
        const retained = this.retainedAssets.get(bundleName);
        group.sources.forEach(asset => {
            if (retained?.delete(asset) && asset.isValid) asset.decRef(true);
        });
        this.preparedDirectories.delete(this.createPreparationKey(bundleName, dir, true));
        this.preparedDirectories.delete(this.createPreparationKey(bundleName, dir, false));
    }

    async releaseBundle(name: string): Promise<boolean> {
        const bundleName = normalizeBundleName(name);
        const pendingLoad = this.pendingLoads.get(bundleName);

        if (pendingLoad) {
            await pendingLoad.catch(() => undefined);
        }

        const pendingPreparations: Promise<AssetManager.Bundle>[] = [];
        this.pendingPreparations.forEach((preparation, key) => {
            if (key.startsWith(`${bundleName}\u0000`)) {
                pendingPreparations.push(preparation);
            }
        });
        await Promise.all(pendingPreparations.map(async (preparation) => {
            await preparation.catch(() => undefined);
        }));

        const audioLoads: Promise<AudioClip>[] = [];
        this.pendingAudio.forEach((load, key) => {
            if (key.startsWith(`${bundleName}\u0000`)) audioLoads.push(load);
        });
        await Promise.all(audioLoads.map(load => load.catch(() => undefined)));

        // Drain until empty: composite loads may enqueue source-texture
        // fallbacks while an earlier request is completing.
        while (true) {
            const loads: Promise<unknown>[] = [];
            this.pendingAssets.forEach((requests, key) => {
                if (key.startsWith(`${bundleName}\u0000`)) requests.forEach(load => loads.push(load));
            });
            this.pendingAssetGroups.forEach((owner, load) => {
                if (owner === bundleName) loads.push(load);
            });
            if (loads.length === 0) break;
            await Promise.all(loads.map(load => load.catch(() => undefined)));
        }
        this.runtimeAssets.forEach((owner, asset) => {
            if (owner === bundleName) this.releaseRuntimeAsset(asset);
        });
        this.retainedAssets.get(bundleName)?.forEach(asset => {
            if (asset.isValid) asset.decRef(false);
        });
        this.retainedAssets.delete(bundleName);
        this.directoryGroups.forEach((group, key) => {
            if (group.bundleName === bundleName) this.directoryGroups.delete(key);
        });
        this.clearPreparedDirectories(bundleName);

        const bundle = this.provider.getBundle(bundleName);

        if (!bundle) {
            return false;
        }

        try {
            bundle.releaseAll();
            this.provider.removeBundle(bundle);
            return true;
        } catch (cause: unknown) {
            throw new AssetBundleReleaseError(bundleName, cause);
        }
    }

    private createLoad(bundleName: string): Promise<AssetManager.Bundle> {
        return new Promise<AssetManager.Bundle>((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new AssetBundleLoadError(
                    bundleName,
                    new Error(`Timed out after ${this.loadTimeoutMs} ms.`),
                ));
            }, this.loadTimeoutMs);

            this.provider.loadBundle(bundleName, (error, bundle) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                if (error) {
                    reject(new AssetBundleLoadError(bundleName, error));
                    return;
                }

                if (!bundle) {
                    reject(new AssetBundleLoadError(
                        bundleName,
                        new Error('Loader returned no bundle.'),
                    ));
                    return;
                }

                resolve(bundle);
            });
        }).catch((error: unknown) => {
            if (error instanceof AssetBundleLoadError) {
                throw error;
            }

            throw new AssetBundleLoadError(bundleName, error);
        });
    }

    private async createPreparation(
        bundleName: string,
        directory: string,
        onProgress?: (finished: number, total: number) => void,
        excludeAudio = false,
    ): Promise<AssetManager.Bundle> {
        const bundle = await this.loadBundle(bundleName);

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const pendingEntries = new Map<string, string>();
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                const pending = Array.from(pendingEntries.values());
                const detail = pending.length > 0
                    ? ` Pending ${pending.length} assets: ${pending.slice(0, 12).join(', ')}.`
                    : '';
                reject(new AssetBundleAssetLoadError(
                    bundleName,
                    directory,
                    new Error(`Timed out after ${this.loadTimeoutMs} ms.${detail}`),
                ));
            }, this.loadTimeoutMs);

            const complete = (error?: Error | null): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (error) {
                    reject(new AssetBundleAssetLoadError(bundleName, directory, error));
                    return;
                }
                resolve();
            };
            if (!excludeAudio) {
                bundle.loadDir(directory, (finished, total) => onProgress?.(finished, total), complete);
                return;
            }
            // 保留子资源的具体类型（SpriteFrame / Texture2D 等），不能仅按路径加载。
            const entries = bundle.getDirWithPath(directory).filter(info => info.ctor !== AudioClip);
            let finished = 0;
            onProgress?.(0, entries.length);
            if (entries.length === 0) { complete(); return; }
            let firstError: Error | null = null;
            for (const info of entries) {
                pendingEntries.set(info.uuid, info.path);
                bundle.load(info.path, info.ctor, (error) => {
                    if (settled) return;
                    pendingEntries.delete(info.uuid);
                    if (error && !firstError) firstError = new Error(`${info.path}: ${error.message}`);
                    finished += 1;
                    onProgress?.(finished, entries.length);
                    // 等本批请求都结束后再释放失败的 Bundle，避免残留在途请求。
                    if (finished === entries.length) complete(firstError);
                });
            }
        });

        this.preparedDirectories.add(this.createPreparationKey(bundleName, directory, excludeAudio));
        return bundle;
    }

    private createPreparationKey(bundleName: string, directory: string, excludeAudio = false): string {
        return `${bundleName}\u0000${directory}\u0000${excludeAudio ? 'visual' : 'all'}`;
    }

    private clearPreparedDirectories(bundleName: string): void {
        const prefix = `${bundleName}\u0000`;
        this.preparedDirectories.forEach((key) => {
            if (key.startsWith(prefix)) {
                this.preparedDirectories.delete(key);
            }
        });
    }
}

import { assetManager, AssetManager } from 'cc';

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
     * 加载 Bundle 配置并完整加载指定目录。游戏远程资源使用本方法，只有
     * loadDir 成功后 GameRuntime 才能继续启动场景和 initialize()。
     */
    prepareBundle(
        name: string,
        directory = 'visual',
        onProgress?: (finished: number, total: number) => void,
    ): Promise<AssetManager.Bundle> {
        const bundleName = normalizeBundleName(name);
        const normalizedDirectory = directory.trim().replace(/^\/+|\/+$/g, '');

        if (!normalizedDirectory) {
            return Promise.reject(new Error('Asset directory must not be empty.'));
        }

        const preparationKey = this.createPreparationKey(
            bundleName,
            normalizedDirectory,
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
    ): Promise<AssetManager.Bundle> {
        const bundle = await this.loadBundle(bundleName);

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new AssetBundleAssetLoadError(
                    bundleName,
                    directory,
                    new Error(`Timed out after ${this.loadTimeoutMs} ms.`),
                ));
            }, this.loadTimeoutMs);

            bundle.loadDir(
                directory,
                (finished, total) => onProgress?.(finished, total),
                (error) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    if (error) {
                        reject(new AssetBundleAssetLoadError(
                            bundleName,
                            directory,
                            error,
                        ));
                        return;
                    }
                    resolve();
                },
            );
        });

        this.preparedDirectories.add(this.createPreparationKey(bundleName, directory));
        return bundle;
    }

    private createPreparationKey(bundleName: string, directory: string): string {
        return `${bundleName}\u0000${directory}`;
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

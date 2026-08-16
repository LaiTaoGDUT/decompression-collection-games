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

    async releaseBundle(name: string): Promise<boolean> {
        const bundleName = normalizeBundleName(name);
        const pendingLoad = this.pendingLoads.get(bundleName);

        if (pendingLoad) {
            await pendingLoad;
        }

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
}

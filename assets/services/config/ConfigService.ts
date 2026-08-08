import { JsonAsset, resources } from 'cc';
import {
    AppConfig,
    DEFAULT_APP_CONFIG,
    normalizeAppConfig,
} from '../../app/AppConfig';
import type { GameManifest } from '../../runtime/GameManifest';
import {
    type ManifestValidationError,
    validateGameCatalog,
} from '../../runtime/GameManifestValidator';

const APP_CONFIG_PATH = 'configs/app';
const GAME_CATALOG_PATH = 'configs/games';

export class GameCatalogValidationError extends Error {
    constructor(readonly errors: readonly ManifestValidationError[]) {
        super(errors.map((error) => `${error.field}: ${error.reason}`).join('; '));
        this.name = 'GameCatalogValidationError';
    }
}

/** 读取并持有应用配置；读取失败时始终提供安全的本地默认值。 */
export class ConfigService {
    private currentConfig = DEFAULT_APP_CONFIG;

    get config(): AppConfig {
        return this.currentConfig;
    }

    async load(): Promise<AppConfig> {
        try {
            const asset = await this.loadJsonAsset(APP_CONFIG_PATH);
            this.currentConfig = normalizeAppConfig(asset.json);
        } catch (error: unknown) {
            this.currentConfig = DEFAULT_APP_CONFIG;
            console.warn(
                '[ConfigService] Local config load failed; using defaults.',
                error,
            );
        }

        return this.currentConfig;
    }

    async loadGameManifests(): Promise<readonly GameManifest[]> {
        const asset = await this.loadJsonAsset(GAME_CATALOG_PATH);
        const result = validateGameCatalog(asset.json);

        if (!result.valid) {
            throw new GameCatalogValidationError(result.errors);
        }

        return result.manifests;
    }

    private loadJsonAsset(path: string): Promise<JsonAsset> {
        return new Promise((resolve, reject) => {
            resources.load(
                path,
                JsonAsset,
                (error, asset) => error ? reject(error) : resolve(asset),
            );
        });
    }
}

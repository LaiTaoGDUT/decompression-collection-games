import { JsonAsset, resources } from 'cc';
import {
    AppConfig,
    DEFAULT_APP_CONFIG,
    normalizeAppConfig,
} from '../../app/AppConfig';
import type { GameManifest } from '../../runtime/GameManifest';
import { type Announcement, parseAnnouncementConfig } from './Announcement';
import {
    type ManifestValidationError,
    validateGameCatalog,
} from '../../runtime/GameManifestValidator';

const APP_CONFIG_PATH = 'configs/app';
const GAME_CATALOG_PATH = 'configs/games';
const ANNOUNCEMENT_PATH = 'configs/announcement';

export class GameCatalogValidationError extends Error {
    constructor(readonly errors: readonly ManifestValidationError[]) {
        super(errors.map((error) => `${error.field}: ${error.reason}`).join('; '));
        this.name = 'GameCatalogValidationError';
    }
}

/** 读取并持有应用配置；读取失败时始终提供安全的本地默认值。 */
export class ConfigService {
    private currentConfig = DEFAULT_APP_CONFIG;
    private currentAnnouncement: Announcement | null = null;

    get config(): AppConfig {
        return this.currentConfig;
    }

    /** 当前生效的版本更新公告；没有生效公告或读取失败时为 null。 */
    get announcement(): Announcement | null {
        return this.currentAnnouncement;
    }

    async load(): Promise<AppConfig> {
        try {
            const asset = await this.loadJsonAsset(APP_CONFIG_PATH);
            this.currentConfig = normalizeAppConfig(asset.json);
        } catch (error: unknown) {
            this.currentConfig = DEFAULT_APP_CONFIG;
            // TODO: console.warn(
            //     '[ConfigService] Local config load failed; using defaults.',
            //     error,
            // );
        }

        return this.currentConfig;
    }

    /** 公告只影响大厅提示，读取或解析失败不阻断启动。 */
    async loadAnnouncement(): Promise<Announcement | null> {
        try {
            const asset = await this.loadJsonAsset(ANNOUNCEMENT_PATH);
            this.currentAnnouncement = parseAnnouncementConfig(asset.json);
        } catch {
            this.currentAnnouncement = null;
        }
        return this.currentAnnouncement;
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

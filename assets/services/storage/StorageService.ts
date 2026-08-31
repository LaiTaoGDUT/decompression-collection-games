import { sys } from 'cc';

export const USER_DATA_SCHEMA_VERSION = 2;
export const DEFAULT_STORAGE_KEY = 'decompression-collection.user-data';
export const MIGRATION_BACKUP_SUFFIX = '.migration-backup';
export const DEFAULT_STORAGE_WRITE_THROTTLE_MS = 3000;

export interface UserSettings {
    readonly musicEnabled: boolean;
    readonly soundEnabled: boolean;
    readonly vibrationEnabled: boolean;
}

export interface GameSaveData {
    readonly dataVersion: number;
    readonly playCount: number;
    readonly highScore?: number;
    readonly lastPlayedAt?: number;
    readonly custom?: Readonly<Record<string, unknown>>;
}

export interface UserData {
    readonly schemaVersion: number;
    readonly settings: UserSettings;
    readonly games: Readonly<Record<string, GameSaveData>>;
}

export interface StorageProvider {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface StorageServiceOptions {
    /** 底层 setItem 的最小尝试间隔；关键 flush 会绕过该间隔。 */
    readonly writeThrottleMs?: number;
}

export class StorageWriteError extends Error {
    constructor(readonly cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'StorageWriteError';
    }
}

export class StorageMigrationError extends Error {
    constructor(
        readonly fromVersion: number | undefined,
        readonly cause: unknown,
    ) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'StorageMigrationError';
    }
}

const DEFAULT_USER_DATA: UserData = Object.freeze({
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    settings: Object.freeze({
        musicEnabled: true,
        soundEnabled: true,
        vibrationEnabled: true,
    }),
    games: Object.freeze({}),
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

type MutableData = Record<string, unknown>;
type StorageMigration = (data: MutableData) => MutableData;
interface PendingWrite {
    readonly revision: number;
    readonly payload: string;
}

const STORAGE_MIGRATIONS: Readonly<Record<number, StorageMigration>> = Object.freeze({
    1: (data: MutableData): MutableData => {
        if (!isRecord(data.settings)) {
            throw new Error('Version 1 settings are missing.');
        }

        return {
            ...data,
            schemaVersion: 2,
            settings: {
                ...data.settings,
                vibrationEnabled: isBoolean(data.settings.vibrationEnabled)
                    ? data.settings.vibrationEnabled
                    : true,
            },
        };
    },
});

function readSchemaVersion(value: unknown): number | undefined {
    if (!isRecord(value)
        || !isFiniteNumber(value.schemaVersion)
        || !Number.isInteger(value.schemaVersion)) {
        return undefined;
    }

    return value.schemaVersion;
}

function migrateToCurrent(value: unknown): {
    readonly data: unknown;
    readonly migrated: boolean;
} {
    const initialVersion = readSchemaVersion(value);

    if (initialVersion === undefined) {
        return { data: value, migrated: false };
    }

    if (initialVersion > USER_DATA_SCHEMA_VERSION) {
        throw new StorageMigrationError(
            initialVersion,
            new Error('Stored schema is newer than this app.'),
        );
    }

    let data = value as MutableData;
    let version = initialVersion;

    while (version < USER_DATA_SCHEMA_VERSION) {
        const migration = STORAGE_MIGRATIONS[version];

        if (!migration) {
            throw new StorageMigrationError(
                initialVersion,
                new Error(`Missing storage migration from version ${version}.`),
            );
        }

        try {
            data = migration(data);
        } catch (cause: unknown) {
            throw new StorageMigrationError(initialVersion, cause);
        }

        const nextVersion = readSchemaVersion(data);

        if (nextVersion !== version + 1) {
            throw new StorageMigrationError(
                initialVersion,
                new Error(`Migration ${version} must produce version ${version + 1}.`),
            );
        }

        version = nextVersion;
    }

    return { data, migrated: version !== initialVersion };
}

function isGameSaveData(value: unknown): value is GameSaveData {
    if (!isRecord(value)) {
        return false;
    }

    const dataVersion = value.dataVersion;
    const playCount = value.playCount;

    if (!isFiniteNumber(dataVersion)
        || !Number.isInteger(dataVersion)
        || !isFiniteNumber(playCount)
        || !Number.isInteger(playCount)
        || (value.highScore !== undefined && !isFiniteNumber(value.highScore))
        || (value.lastPlayedAt !== undefined && !isFiniteNumber(value.lastPlayedAt))
        || (value.custom !== undefined && !isRecord(value.custom))) {
        return false;
    }

    return dataVersion >= 1 && playCount >= 0;
}

function parseUserData(value: unknown): UserData | undefined {
    if (!isRecord(value)
        || value.schemaVersion !== USER_DATA_SCHEMA_VERSION
        || !isRecord(value.settings)
        || !isRecord(value.games)) {
        return undefined;
    }

    const settings = value.settings;

    if (!isBoolean(settings.musicEnabled)
        || !isBoolean(settings.soundEnabled)
        || !isBoolean(settings.vibrationEnabled)) {
        return undefined;
    }

    const games: Record<string, GameSaveData> = {};

    for (const gameId of Object.keys(value.games)) {
        const gameData = value.games[gameId];
        if (!gameId.trim() || !isGameSaveData(gameData)) {
            return undefined;
        }

        games[gameId] = cloneGameData(gameData);
    }

    return freezeUserData({
        schemaVersion: USER_DATA_SCHEMA_VERSION,
        settings: {
            musicEnabled: settings.musicEnabled,
            soundEnabled: settings.soundEnabled,
            vibrationEnabled: settings.vibrationEnabled,
        },
        games,
    });
}

function cloneGameData(data: GameSaveData): GameSaveData {
    return Object.freeze({
        dataVersion: data.dataVersion,
        playCount: data.playCount,
        ...(data.highScore === undefined ? {} : { highScore: data.highScore }),
        ...(data.lastPlayedAt === undefined
            ? {}
            : { lastPlayedAt: data.lastPlayedAt }),
        ...(data.custom === undefined
            ? {}
            : { custom: Object.freeze({ ...data.custom }) }),
    });
}

function freezeUserData(data: UserData): UserData {
    const games: Record<string, GameSaveData> = {};

    for (const gameId of Object.keys(data.games)) {
        const gameData = data.games[gameId];
        games[gameId] = cloneGameData(gameData);
    }

    return Object.freeze({
        schemaVersion: data.schemaVersion,
        settings: Object.freeze({ ...data.settings }),
        games: Object.freeze(games),
    });
}

function normalizeGameId(gameId: string): string {
    const normalized = gameId.trim();

    if (!normalized) {
        throw new Error('Game ID must not be empty.');
    }

    return normalized;
}

function normalizeWriteThrottleMs(value: number | undefined): number {
    const normalized = value ?? DEFAULT_STORAGE_WRITE_THROTTLE_MS;
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw new Error('Storage write throttle must be a finite non-negative number.');
    }

    return Math.floor(normalized);
}

/**
 * 版本化用户存档；所有游戏写入都被限制在各自 gameId 命名空间。
 *
 * writeGameData/writeSettings 是“逻辑提交”：内存快照立即更新，底层
 * localStorage.setItem 由单一最新根快照队列按节流间隔写入。flush 用于
 * 暂停、切后台、退出和销毁等必须立即落盘的边界。
 */
export class StorageService {
    private data?: UserData;
    private readonly writeThrottleMs: number;
    private pendingWrite?: PendingWrite;
    private flushTimer?: ReturnType<typeof setTimeout>;
    private flushTimerGeneration = 0;
    private revision = 0;
    private lastPersistAttemptAt = 0;
    private persistenceError?: StorageWriteError;
    private disposed = false;

    constructor(
        private readonly provider: StorageProvider = sys.localStorage,
        private readonly storageKey = DEFAULT_STORAGE_KEY,
        options: StorageServiceOptions = {},
    ) {
        this.writeThrottleMs = normalizeWriteThrottleMs(options.writeThrottleMs);
    }

    load(): UserData {
        this.ensureActive();
        const stored = this.provider.getItem(this.storageKey);

        if (stored !== null) {
            try {
                const migration = migrateToCurrent(JSON.parse(stored));
                const parsed = parseUserData(migration.data);

                if (parsed) {
                    this.data = parsed;

                    if (migration.migrated) {
                        this.persistImmediately(parsed);
                    }

                    return parsed;
                }
            } catch (cause: unknown) {
                if (cause instanceof StorageMigrationError) {
                    this.preserveMigrationFailure(stored, cause);
                }

                // 损坏或不完整的存档统一恢复默认值并立即落盘。
            }
        }

        this.data = DEFAULT_USER_DATA;
        this.persistImmediately(DEFAULT_USER_DATA);
        return DEFAULT_USER_DATA;
    }

    get snapshot(): UserData {
        return this.data ?? this.load();
    }

    getGameData(gameId: string): GameSaveData | undefined {
        return this.snapshot.games[normalizeGameId(gameId)];
    }

    get hasPendingWrites(): boolean {
        return this.pendingWrite !== undefined;
    }

    get lastPersistenceError(): StorageWriteError | undefined {
        return this.persistenceError;
    }

    /**
     * 游戏自身 schema 迁移失败时保存迁移前的完整根快照。
     * 该操作不修改当前内存数据，也不向小游戏暴露底层 provider。
     */
    backupGameDataMigrationFailure(gameId: string, reason: string): void {
        this.ensureActive();
        const normalizedId = normalizeGameId(gameId);
        const normalizedReason = reason.trim() || 'Unknown game-data migration failure.';
        try {
            this.provider.setItem(
                `${this.storageKey}${MIGRATION_BACKUP_SUFFIX}.${normalizedId}`,
                JSON.stringify({
                    gameId: normalizedId,
                    reason: normalizedReason,
                    rawData: this.serialize(this.snapshot),
                }),
            );
        } catch (cause: unknown) {
            throw new StorageMigrationError(undefined, cause);
        }
    }

    writeGameData(gameId: string, gameData: GameSaveData): UserData {
        const normalizedId = normalizeGameId(gameId);

        if (!isGameSaveData(gameData)) {
            throw new Error(`Invalid game save data for "${normalizedId}".`);
        }

        return this.commit({
            ...this.snapshot,
            games: {
                ...this.snapshot.games,
                [normalizedId]: cloneGameData(gameData),
            },
        });
    }

    writeSettings(settings: UserSettings): UserData {
        if (!isBoolean(settings.musicEnabled)
            || !isBoolean(settings.soundEnabled)
            || !isBoolean(settings.vibrationEnabled)) {
            throw new Error('Invalid user settings.');
        }

        return this.commit({ ...this.snapshot, settings });
    }

    private commit(data: UserData): UserData {
        this.ensureActive();
        const frozen = freezeUserData(data);
        const payload = this.serialize(frozen);
        const revision = this.revision + 1;
        this.data = frozen;
        this.revision = revision;
        this.pendingWrite = Object.freeze({ revision, payload });
        this.scheduleFlush();
        return frozen;
    }

    /** 关键生命周期边界调用；同步写入当前最新根快照。 */
    flush(): void {
        if (this.disposed) return;

        this.cancelScheduledFlush();
        if (!this.pendingWrite) return;

        try {
            this.persistPendingWrite();
        } catch (error: unknown) {
            this.scheduleFlush();
            throw error;
        }
    }

    /** 应用销毁前的最后一次同步落盘；失败也不能阻断资源释放。 */
    dispose(): void {
        if (this.disposed) return;

        try {
            this.flush();
        } catch (error: unknown) {
            console.error('[StorageService] Final flush failed during dispose.', error);
        }

        this.disposed = true;
        this.cancelScheduledFlush();
    }

    private ensureActive(): void {
        if (this.disposed) {
            throw new Error('StorageService has been disposed.');
        }
    }

    private serialize(data: UserData): string {
        try {
            const payload = JSON.stringify(data);
            if (typeof payload !== 'string') {
                throw new Error('Storage payload must serialize to a string.');
            }
            return payload;
        } catch (cause: unknown) {
            throw new StorageWriteError(cause);
        }
    }

    private persistImmediately(data: UserData): void {
        const payload = this.serialize(data);
        this.lastPersistAttemptAt = Date.now();
        try {
            this.provider.setItem(this.storageKey, payload);
            this.persistenceError = undefined;
        } catch (cause: unknown) {
            const error = cause instanceof StorageWriteError
                ? cause
                : new StorageWriteError(cause);
            this.persistenceError = error;
            throw error;
        }
    }

    private persistPendingWrite(): void {
        const pending = this.pendingWrite;
        if (!pending) return;

        this.lastPersistAttemptAt = Date.now();
        try {
            this.provider.setItem(this.storageKey, pending.payload);
        } catch (cause: unknown) {
            const error = cause instanceof StorageWriteError
                ? cause
                : new StorageWriteError(cause);
            this.persistenceError = error;
            throw error;
        }

        if (this.pendingWrite?.revision === pending.revision) {
            this.pendingWrite = undefined;
        }
        this.persistenceError = undefined;
    }

    private scheduleFlush(): void {
        if (this.disposed || !this.pendingWrite || this.flushTimer !== undefined) return;

        const generation = ++this.flushTimerGeneration;
        const elapsed = this.lastPersistAttemptAt > 0
            ? Math.max(0, Date.now() - this.lastPersistAttemptAt)
            : this.writeThrottleMs;
        const delay = Math.max(0, this.writeThrottleMs - elapsed);
        this.flushTimer = setTimeout(() => {
            if (generation !== this.flushTimerGeneration) return;
            this.flushTimer = undefined;
            try {
                this.persistPendingWrite();
            } catch (error: unknown) {
                // 定时写入不能抛出未处理异常；保留 pendingWrite，下一轮继续重试。
                console.error('[StorageService] Deferred flush failed.', error);
                this.scheduleFlush();
            }
        }, delay);
    }

    private cancelScheduledFlush(): void {
        this.flushTimerGeneration += 1;
        if (this.flushTimer !== undefined) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    private preserveMigrationFailure(
        rawData: string,
        error: StorageMigrationError,
    ): void {
        try {
            this.provider.setItem(
                `${this.storageKey}${MIGRATION_BACKUP_SUFFIX}`,
                JSON.stringify({
                    fromVersion: error.fromVersion,
                    targetVersion: USER_DATA_SCHEMA_VERSION,
                    reason: error.message,
                    rawData,
                }),
            );
        } catch (cause: unknown) {
            throw new StorageMigrationError(error.fromVersion, cause);
        }
    }
}

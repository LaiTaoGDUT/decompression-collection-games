import type { CloudSaveCatalog, CloudSaveLocalState, CloudSavePatch } from '../../core/types/CloudSave';
import type { AchievementSaveData, StorageService } from '../storage/StorageService';
import { dayToTimestamp, decodeAchievements, decodeModule, encodeAchievements, timestampToDay, uint } from './CloudSaveCodec';
import { moduleRank, projectGame, projectModules, restoreGame } from './CloudSaveProjection';

const HALF_HOUR = 30 * 60 * 1000, TWO_HOURS = 4 * HALF_HOUR, FOUR_HOURS = 8 * HALF_HOUR;
const TWO_DAYS = 48 * 60 * 60 * 1000;
const EMPTY_ACHIEVEMENTS = encodeAchievements({});

export interface CloudSaveServiceOptions {
    readonly storage: StorageService;
    readonly catalog: CloudSaveCatalog;
    readonly call: (request: unknown) => Promise<unknown>;
    readonly activeGame: () => string | undefined;
    /** 只在启动/大厅恢复，迟到的网络响应不能改写正在玩的棋盘。 */
    readonly canRestore: () => boolean;
    readonly onRestored?: () => void;
    readonly now?: () => number;
    readonly autoTick?: boolean;
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numbers(value: unknown): Record<string, number> {
    const result: Record<string, number> = {};
    Object.keys(record(value)).slice(0,512).forEach(k => { if (/^[a-z0-9:-]+$/.test(k)) result[k] = uint(record(value)[k]); });
    return result;
}
function strings(value: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    Object.keys(record(value)).slice(0,128).forEach(k => {
        const item = record(value)[k];
        if (/^[1-9]\d*$/.test(k) && typeof item === 'string' && item.length <= 32768) result[k] = item;
    });
    return result;
}
function newDevice(): string {
    return Array.from({length:4},()=>('00000000' + Math.floor(Math.random()*0x100000000).toString(16)).slice(-8)).join('');
}

/** 云同步只观察公共存档和应用运行态，不导入或加载任何具体游戏。 */
export class CloudSaveService {
    private state!: CloudSaveLocalState;
    private readonly now: () => number;
    private timer?: ReturnType<typeof setInterval>;
    private queued?: ReturnType<typeof setTimeout>;
    private unsubscribe?: () => void;
    private disposed = false;
    private visible = true;
    private busy = false;
    private nextAttempt = 0;
    private failures = 0;
    private lastTick = 0;
    private timedGame?: string;
    private observedAchievements = EMPTY_ACHIEVEMENTS;
    private loaded?: Record<string, unknown>;
    private persisted = '';

    constructor(private readonly options: CloudSaveServiceOptions) { this.now = options.now ?? Date.now; }

    get status(): Readonly<{ enabled: boolean; restorePending: boolean; dirtyModules: number; uploading: boolean }> {
        return { enabled: !!this.state?.enabled, restorePending: this.state?.restore === 'pending',
            dirtyModules: this.state ? Object.keys(this.dirtyModules()).length : 0, uploading: this.busy };
    }

    async initialize(): Promise<void> {
        const storage = this.options.storage, previous = record(storage.snapshot.cloudSave);
        // 已有成就进度迁入所属游戏的历史玩法指标。之后云端只存游戏指标和已解锁成就。
        for (const schema of this.options.catalog.games) {
            const a = schema.achievement, old = storage.getAchievement(schema.gameId);
            if (a && old?.achievementId === a.id) storage.recordGameMetric(schema.gameId, a.metric, old.progress);
        }
        const valid = previous.version === 1 && typeof previous.device === 'string' && /^[a-f0-9]{32}$/.test(previous.device);
        const hasLocal = Object.keys(storage.snapshot.games).length > 0 || Object.keys(storage.snapshot.achievements).length > 0;
        this.state = {
            version: 1, device: valid ? previous.device as string : newDevice(), seq: valid ? uint(previous.seq) : 0,
            enabled: valid && previous.enabled === true,
            restore: valid ? previous.restore === 'done' ? 'done' : 'pending' : hasLocal ? 'done' : 'pending',
            totalMs: valid ? uint(previous.totalMs) : 0, gameMs: valid ? numbers(previous.gameMs) : {},
            days: valid ? numbers(previous.days) : {}, levelPeaks: valid ? numbers(previous.levelPeaks) : this.levels(),
            unsavedClears: valid ? uint(previous.unsavedClears) : 0, lastUploadAt: valid ? uint(previous.lastUploadAt) : 0,
            ack: valid ? strings(previous.ack) : {}, ackAchievements: valid && typeof previous.ackAchievements === 'string'
                ? previous.ackAchievements : EMPTY_ACHIEVEMENTS,
            requested: valid && previous.requested === true,
        };
        if (valid && previous.pending) {
            const pending = record(previous.pending), request = record(pending.request);
            if (request.v === 1 && request.op === 'save' && request.device === this.state.device
                && Number.isSafeInteger(request.seq) && request.seq === this.state.seq && this.state.seq > 0) {
                // 队列损坏时保留当前游戏数据，改用下一个序号重建请求，不能永久卡在坏请求上。
                try {
                    const modules = strings(request.m);
                    if (Object.keys(modules).length !== Object.keys(record(request.m)).length
                        || (!Object.keys(modules).length && request.a === undefined)) throw new Error('Empty pending request.');
                    for (const code of Object.keys(modules)) {
                        const schema = this.options.catalog.games.find(game => String(game.code) === code);
                        if (!schema) throw new Error('Unknown pending module.');
                        moduleRank(schema, modules[code]);
                    }
                    if (request.a !== undefined) decodeAchievements(request.a as string);
                    this.state = { ...this.state, requested: true, pending: { cleared: uint(pending.cleared), request: {
                        v: 1, op: 'save', device: this.state.device, seq: this.state.seq, m: modules,
                        ...(typeof request.a === 'string' ? { a: request.a } : {}),
                    } } };
                } catch { this.state = { ...this.state, requested: true }; }
            }
        }
        this.observedAchievements = this.achievements();
        this.lastTick = this.now(); this.timedGame = this.options.activeGame();
        this.evaluate();
        if (this.state.enabled && this.now() - this.state.lastUploadAt > TWO_DAYS)
            this.state = { ...this.state, requested: true };
        this.persist();
        this.unsubscribe = storage.subscribeProgress(() => this.changed());
        if (this.options.autoTick !== false) this.timer = setInterval(() => this.tick(), 10000);
        if (this.state.restore === 'pending') await this.pump();
        else this.schedulePump();
    }

    /** 状态机切换、前后台以及定时检查均走同一计时边界。 */
    tick(): void {
        if (this.disposed || !this.state) return;
        const now = this.now();
        if (this.timedGame && this.visible && !this.state.enabled) {
            // 定时器在后台可能长期不调度；前后台事件之外的长挂起不算游玩。
            const start = Math.max(this.lastTick, now - 30000), elapsed = Math.max(0, now - start);
            const gameMs = { ...this.state.gameMs, [this.timedGame]: (this.state.gameMs[this.timedGame] ?? 0) + elapsed };
            const days = { ...this.state.days }; let cursor = start;
            while (cursor < now) {
                const date = new Date(cursor), midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()+1).getTime();
                const end = Math.min(now, midnight), key = String(timestampToDay(cursor));
                days[key] = Math.min(HALF_HOUR, (days[key] ?? 0) + end - cursor); cursor = end;
            }
            const today = String(timestampToDay(now));
            Object.keys(days).forEach(day => { if (day !== today && days[day] < HALF_HOUR) delete days[day]; });
            this.state = { ...this.state, totalMs: this.state.totalMs + elapsed, gameMs, days };
        }
        this.lastTick = now; this.timedGame = this.visible ? this.options.activeGame() : undefined;
        this.evaluate(); this.persist(); this.schedulePump();
    }

    setVisible(visible: boolean): void {
        this.tick(); this.visible = visible; this.lastTick = this.now();
        this.timedGame = visible ? this.options.activeGame() : undefined;
        if (visible) { this.nextAttempt = 0; this.schedulePump(); }
    }

    checkActivity(): void {
        if (!this.state || this.disposed) return;
        const active = this.visible ? this.options.activeGame() : undefined;
        if (active !== this.timedGame) this.tick();
    }

    dispose(): void {
        if (this.disposed) return;
        this.tick(); this.disposed = true; this.unsubscribe?.();
        if (this.timer !== undefined) clearInterval(this.timer);
        if (this.queued !== undefined) clearTimeout(this.queued);
        this.timer = undefined; this.queued = undefined;
    }

    private changed(): void {
        if (this.disposed) return;
        const levels = this.levels(), peaks = { ...this.state.levelPeaks }; let added = 0;
        Object.keys(levels).forEach(key => { added += Math.max(0, levels[key] - (peaks[key] ?? 0)); peaks[key] = Math.max(peaks[key] ?? 0, levels[key]); });
        const achievements = this.achievements();
        this.state = { ...this.state, levelPeaks: peaks, unsavedClears: this.state.unsavedClears + added,
            requested: this.state.requested || (this.state.enabled && achievements !== this.observedAchievements) };
        this.observedAchievements = achievements;
        this.evaluate(); this.persist(); this.schedulePump();
    }

    private levels(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const schema of this.options.catalog.games) {
            const payload = projectGame(schema, this.options.storage.getGameData(schema.gameId));
            if (!payload) continue;
            const { numbers: values } = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length);
            schema.levels?.forEach(index => { result[`${schema.code}:${index}`] = values[index]; });
        }
        return result;
    }

    private evaluate(): void {
        const levels = this.levels();
        const enabled = this.state.enabled || Object.keys(levels).some(key => levels[key] >= 50)
            || this.state.totalMs >= FOUR_HOURS || Object.keys(this.state.gameMs).some(id => this.state.gameMs[id] >= TWO_HOURS)
            || Object.keys(this.state.days).filter(day => this.state.days[day] >= HALF_HOUR).length >= 5;
        this.state = { ...this.state, enabled,
            requested: this.state.requested || (enabled && (!this.state.enabled || this.state.unsavedClears >= 25)) };
    }

    private achievements(): string {
        const dates: Record<string, number> = {};
        this.options.catalog.games.forEach(schema => {
            const a = schema.achievement, saved = this.options.storage.getAchievement(schema.gameId);
            if (a && saved?.achievementId === a.id && saved.unlockedAt) dates[String(a.code)] = timestampToDay(saved.unlockedAt);
        });
        return encodeAchievements(dates);
    }

    private dirtyModules(): Record<string, string> {
        const modules = projectModules(this.options.catalog, this.options.storage.snapshot);
        Object.keys(modules).forEach(code => { if (modules[code] === this.state.ack[code]) delete modules[code]; });
        return modules;
    }

    private persist(): void {
        const serialized = JSON.stringify(this.state);
        if (serialized === this.persisted) return;
        this.options.storage.writeCloudState(this.state); this.persisted = serialized;
    }

    private schedulePump(): void {
        if (this.disposed || this.queued !== undefined || this.options.autoTick === false) return;
        this.queued = setTimeout(() => { this.queued = undefined; void this.pump(); }, 0);
    }

    /** 可由测试显式推进；正式运行由生命周期和重试计时器驱动。 */
    async pump(): Promise<void> {
        if (this.disposed || this.busy || !this.visible || this.now() < this.nextAttempt) return;
        this.busy = true;
        try {
            if (this.state.restore === 'pending') {
                if (!this.options.canRestore()) return;
                const loaded = this.loaded ?? record(await this.options.call({ v:1, op:'load' }));
                if (this.disposed) return;
                if (loaded.v !== 1 || loaded.ok !== true || typeof loaded.found !== 'boolean') throw new Error('Invalid cloud restore response.');
                this.loaded = loaded;
                if (!this.options.canRestore()) return;
                this.applyRestore(loaded); this.loaded = undefined;
            }
            if (!this.state.enabled || !this.state.requested) return;
            if (!this.state.pending) {
                const m = this.dirtyModules(), achievements = this.achievements();
                const a = achievements !== this.state.ackAchievements ? achievements : undefined;
                if (!Object.keys(m).length && a === undefined) {
                    this.state = { ...this.state, requested:false }; this.persist(); return;
                }
                const seq = this.state.seq + 1;
                const request: CloudSavePatch = { v:1, op:'save', device:this.state.device, seq, m, ...(a === undefined ? {} : { a }) };
                this.state = { ...this.state, seq, pending:{ request, cleared:this.state.unsavedClears } }; this.persist();
            }
            // 必须先持久化请求序号及精确快照。断网/崩溃后重试同一请求，避免同分旧重试覆盖新设备。
            this.options.storage.flush();
            const pending = this.state.pending!, response = record(await this.options.call(pending.request));
            if (this.disposed) return;
            if (response.v !== 1 || response.ok !== true || response.seq !== pending.request.seq) throw new Error('Invalid cloud save ACK.');
            const ackAchievements = pending.request.a ?? this.state.ackAchievements;
            const unsavedClears = Math.max(0, this.state.unsavedClears - pending.cleared);
            this.state = { ...this.state, pending:undefined, ack:{ ...this.state.ack, ...pending.request.m }, ackAchievements,
                lastUploadAt:this.now(), unsavedClears,
                requested:unsavedClears >= 25 || this.achievements() !== ackAchievements };
            this.persist(); this.options.storage.flush(); this.failures = 0; this.nextAttempt = 0;
        } catch (error: unknown) {
            if (!this.disposed) {
                this.failures++; this.nextAttempt = this.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(this.failures-1,5)));
                console.warn('[CloudSave] Deferred; local progress and upload queue retained.', error instanceof Error ? error.message : 'Cloud request failed');
            }
        } finally {
            this.busy = false;
            if (!this.disposed && this.state.enabled && this.state.requested && this.state.restore === 'done' && this.nextAttempt <= this.now()) this.schedulePump();
        }
    }

    private applyRestore(response: Record<string, unknown>): void {
        const storage = this.options.storage;
        if (!response.found) { this.state = { ...this.state, restore:'done' }; this.evaluate(); this.persist(); return; }
        if (!response.m || typeof response.m !== 'object' || Array.isArray(response.m) || typeof response.a !== 'string')
            throw new Error('Incomplete cloud restore response.');
        const modules = strings(response.m), dates = decodeAchievements(typeof response.a === 'string' ? response.a : EMPTY_ACHIEVEMENTS);
        if (Object.keys(modules).length !== Object.keys(response.m).length) throw new Error('Invalid cloud restore modules.');
        const games = { ...storage.snapshot.games }, achievements = { ...storage.snapshot.achievements };
        for (const schema of this.options.catalog.games) {
            const payload = modules[String(schema.code)], local = projectGame(schema, games[schema.gameId]);
            if (payload && (!local || moduleRank(schema,payload) > moduleRank(schema,local))) games[schema.gameId] = restoreGame(schema,payload);
            const a = schema.achievement;
            if (!a) continue;
            const current = achievements[schema.gameId]?.achievementId === a.id ? achievements[schema.gameId] : undefined;
            const restoredDay = dates[String(a.code)];
            const restoredAt = restoredDay === undefined ? undefined : dayToTimestamp(restoredDay);
            const unlockedAt = current?.unlockedAt && restoredAt ? Math.min(current.unlockedAt,restoredAt) : current?.unlockedAt ?? restoredAt;
            const progress = unlockedAt ? a.target : Math.min(a.target,uint(games[schema.gameId]?.metrics?.[a.metric]));
            const saved: AchievementSaveData = { achievementId:a.id, progress,
                ...(unlockedAt ? { unlockedAt, celebratedAt:current?.celebratedAt ?? this.now() } : {}) };
            if (progress || unlockedAt || current || payload) achievements[schema.gameId] = saved;
        }
        this.state = { ...this.state, enabled:true, restore:'done', ack:modules,
            ackAchievements: typeof response.a === 'string' ? response.a : EMPTY_ACHIEVEMENTS, requested:true };
        // 恢复与本地离线新进度在一次根快照中提交；它们不会增加“新通关”计数。
        this.unsubscribe?.(); this.unsubscribe = undefined;
        try {
            storage.restoreCloudProgress(games,achievements,this.state);
            this.state = { ...this.state, levelPeaks:this.levels() }; this.persist(); storage.flush();
        } finally {
            this.observedAchievements = this.achievements();
            this.unsubscribe = storage.subscribeProgress(() => this.changed());
        }
        this.options.onRestored?.();
    }
}

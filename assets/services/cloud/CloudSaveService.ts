import type { CloudSaveCatalog, CloudSaveLocalState, CloudSavePatch } from '../../core/types/CloudSave';
import type { AchievementSaveData, StorageService } from '../storage/StorageService';
import { dayToTimestamp, decodeAchievements, decodeModule, encodeAchievements, timestampToDay, uint } from './CloudSaveCodec';
import { mergeModule, moduleRank, progressImprovements, projectGame, projectModules, restoreGame } from './CloudSaveProjection';
import type { ServerTimeService } from './ServerTimeService';

const EMPTY_ACHIEVEMENTS = encodeAchievements({});
const MINUTE = 60000;

export interface CloudSaveServiceOptions {
    readonly storage: StorageService;
    readonly catalog: CloudSaveCatalog;
    readonly call: (request: unknown) => Promise<unknown>;
    readonly time: ServerTimeService;
    readonly activeGame: () => string | undefined;
    readonly canRestore: () => boolean;
    readonly onRestored?: () => void;
    /** 测试注入单调时钟；正式环境由 App.advance 的引擎帧时间驱动。 */
    readonly now?: () => number;
    readonly autoTick?: boolean;
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numbers(value: unknown): Record<string, number> {
    const result: Record<string, number> = {};
    Object.keys(record(value)).slice(0, 256).forEach(key => {
        const item = record(value)[key];
        if (/^[a-z0-9:-]+$/.test(key)) result[key] = uint(item);
    });
    return result;
}
function strings(value: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    Object.keys(record(value)).slice(0, 128).forEach(key => {
        const item = record(value)[key];
        if (/^[1-9]\d*$/.test(key) && typeof item === 'string' && item.length <= 32768) result[key] = item;
    });
    return result;
}
function newDevice(): string {
    return Array.from({ length: 4 }, () => ('00000000' + Math.floor(Math.random() * 0x100000000).toString(16)).slice(-8)).join('');
}

/** 门槛前只校时；门槛后按事件上传，冷启动读取，两端共用最佳进度协议。 */
export class CloudSaveService {
    private state!: CloudSaveLocalState;
    private elapsed = 0;
    private readonly now: () => number;
    private timer?: ReturnType<typeof setInterval>;
    private queued?: ReturnType<typeof setTimeout>;
    private readonly rounds = new Map<string, ReturnType<typeof setTimeout>>();
    private roundRecords: Record<string, string> = {};
    private unsubscribe?: () => void;
    private disposed = false;
    private visible = true;
    private busy = false;
    private coldStarting = true;
    private nextAttempt = 0;
    private failures = 0;
    private lastTick = 0;
    private timedGame?: string;
    private observedAchievements = EMPTY_ACHIEVEMENTS;
    private loaded?: Record<string, unknown>;
    private persisted = '';

    constructor(private readonly options: CloudSaveServiceOptions) { this.now = options.now ?? (() => this.elapsed); }

    get status(): Readonly<{ enabled: boolean; restorePending: boolean; dirtyModules: number; uploading: boolean }> {
        return { enabled: !!this.state?.enabled, restorePending: this.state?.restore === 'pending',
            dirtyModules: this.state ? Object.keys(this.dirtyModules()).length : 0, uploading: this.busy };
    }

    async initialize(): Promise<void> {
        const storage = this.options.storage, previous = record(storage.snapshot.cloudSave);
        for (const schema of this.options.catalog.games) {
            const a = schema.achievement, old = storage.getAchievement(schema.gameId);
            if (a && old?.achievementId === a.id) storage.recordGameMetric(schema.gameId, a.metric, old.progress);
        }
        const valid = previous.version === 2 && typeof previous.device === 'string' && /^[a-f0-9]{32}$/.test(previous.device);
        const modules = projectModules(this.options.catalog, storage.snapshot);
        this.state = {
            version: 2, device: valid ? previous.device as string : newDevice(), seq: valid ? uint(previous.seq) : 0,
            enabled: valid && previous.enabled === true, restore: 'done',
            // 旧版时长仅用于开启门槛；不伪造上线前的分析增量。
            totalMs: uint(previous.totalMs), gameMs: numbers(previous.gameMs),
            loginDays: valid && Array.isArray(previous.loginDays) ? Array.from(new Set(previous.loginDays
                .filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) as string[])).slice(0, 6) : [],
            progressPeaks: valid ? this.mergeModules(this.cleanModules(previous.progressPeaks), modules) : modules,
            playMs: valid ? numbers(previous.playMs) : {},
            unsavedClears: valid ? uint(previous.unsavedClears) : 0, lastUploadAt: valid ? uint(previous.lastUploadAt) : 0,
            ack: valid ? this.cleanModules(previous.ack) : {},
            ackAchievements: valid && typeof previous.ackAchievements === 'string' ? previous.ackAchievements : EMPTY_ACHIEVEMENTS,
            requested: valid && previous.requested === true, trigger: valid ? uint(previous.trigger) : 0,
            seeded: valid && previous.seeded === true,
        };
        if (valid && previous.pending) {
            const pending = record(previous.pending), request = record(pending.request);
            try {
                if (request.v !== 2 || request.op !== 'save' || request.device !== this.state.device
                    || request.seq !== this.state.seq || !this.state.seq) throw new Error('Invalid pending request.');
                const m = strings(request.m), t = numbers(request.t);
                if (Object.keys(m).length !== Object.keys(record(request.m)).length
                    || Object.keys(t).length !== Object.keys(record(request.t)).length) throw new Error('Invalid pending fields.');
                this.validateModules(m);
                if (request.a !== undefined) decodeAchievements(request.a as string);
                this.state = { ...this.state, requested: true, pending: {
                    cleared: uint(pending.cleared), trigger: uint(pending.trigger),
                    request: { v: 2, op: 'save', device: this.state.device, seq: this.state.seq, m, t,
                        ...(typeof request.a === 'string' ? { a: request.a } : {}) },
                } };
            } catch {
                // 损坏队列无法确认是否曾被服务端计时，舍弃不可信增量，保留游戏进度重新上传。
                this.state = { ...this.state, playMs: {}, requested: true, seeded: false };
            }
        }
        this.roundRecords = modules;
        this.observedAchievements = this.achievements();
        this.lastTick = this.now(); this.timedGame = this.visible ? this.options.activeGame() : undefined;
        this.evaluate();
        if (this.state.enabled) this.state = { ...this.state, restore: 'pending' };
        if (this.state.enabled && !this.state.seeded) this.requestUpload();
        this.persist();
        this.unsubscribe = storage.subscribeProgress(() => this.changed());
        if (this.options.autoTick !== false) this.timer = setInterval(() => this.tick(), 10000);
        try { await this.pump(); } finally { this.coldStarting = false; }
    }

    /** 修改手机日期不会增加玩法计时。长挂起由前后台事件和帧增量上限排除。 */
    advance(deltaTime: number): void {
        if (this.disposed || !this.state) return;
        if (this.visible && Number.isFinite(deltaTime)) this.elapsed += Math.min(1, Math.max(0, deltaTime)) * 1000;
        this.checkActivity();
    }
    tick(): void {
        if (this.disposed || !this.state) return;
        const now = this.now(), elapsed = Math.max(0, now - this.lastTick);
        if (this.timedGame && this.visible && elapsed) {
            const gameMs = { ...this.state.gameMs, [this.timedGame]: (this.state.gameMs[this.timedGame] ?? 0) + elapsed };
            const playMs = { ...this.state.playMs, [this.timedGame]: (this.state.playMs[this.timedGame] ?? 0) + elapsed };
            this.state = { ...this.state, totalMs: this.state.totalMs + elapsed, gameMs, playMs };
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
        if (this.loaded && this.state.restore === 'done' && this.options.canRestore()) {
            this.schedulePump();
        }
    }

    /** 下一任务读取结算后的存档，兼容 reportRoundFinished 先于 persist 的游戏。 */
    recordRoundFinished(gameId: string): void {
        if (this.disposed || !this.state || this.rounds.has(gameId)) return;
        this.rounds.set(gameId, setTimeout(() => {
            this.rounds.delete(gameId);
            if (this.disposed) return;
            const schema = this.options.catalog.games.find(game => game.gameId === gameId);
            if (!schema || schema.levels?.length) return;
            const payload = projectGame(schema, this.options.storage.getGameData(gameId));
            if (!payload) return;
            const next = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length ?? 0);
            const old = this.roundRecords[String(schema.code)];
            const before = old ? decodeModule(old, schema.numbers.length, schema.stars?.keys.length ?? 0).numbers : [];
            const improved = next.numbers.some((value, i) => schema.numbers[i].constant === undefined
                && schema.numbers[i].record !== false && value > (before[i] ?? 0));
            this.roundRecords[String(schema.code)] = mergeModule(schema, old, payload)!;
            this.tick();
            if (improved && this.state.enabled) { this.requestUpload(); this.persist(); this.schedulePump(); }
        }, 0));
    }
    dispose(): void {
        if (this.disposed) return;
        this.tick(); this.disposed = true; this.unsubscribe?.();
        if (this.timer !== undefined) clearInterval(this.timer);
        if (this.queued !== undefined) clearTimeout(this.queued);
        this.rounds.forEach(timer => clearTimeout(timer)); this.rounds.clear();
        this.loaded = undefined; this.timer = undefined; this.queued = undefined;
    }

    private changed(): void {
        if (this.disposed || !this.state) return;
        const modules = projectModules(this.options.catalog, this.options.storage.snapshot);
        let added = 0;
        for (const schema of this.options.catalog.games) {
            const code = String(schema.code), payload = modules[code];
            if (payload) added += progressImprovements(schema, this.state.progressPeaks[code], payload);
        }
        const achievements = this.achievements(), newAchievement = achievements !== this.observedAchievements;
        this.state = { ...this.state, progressPeaks: this.mergeModules(this.state.progressPeaks, modules),
            unsavedClears: this.state.unsavedClears + added };
        this.observedAchievements = achievements;
        this.evaluate();
        if (this.state.enabled && ((added > 0 && this.state.unsavedClears >= 5) || newAchievement)) this.requestUpload();
        this.persist(); this.schedulePump();
    }
    private evaluate(): void {
        const hasLevels = this.options.catalog.games.some(schema => {
            const payload = projectGame(schema, this.options.storage.getGameData(schema.gameId));
            if (!payload) return false;
            const values = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length ?? 0).numbers;
            return schema.levels?.some(i => values[i] >= 20);
        });
        const enabled = this.state.enabled || hasLevels || this.state.totalMs >= 120 * MINUTE
            || Object.keys(this.state.gameMs).some(id => this.state.gameMs[id] >= 45 * MINUTE)
            || this.state.loginDays.length > 5 || this.achievements() !== EMPTY_ACHIEVEMENTS;
        if (enabled && !this.state.enabled) {
            this.state = { ...this.state, enabled: true, restore: this.coldStarting ? 'pending' : 'done' };
            this.requestUpload();
        }
    }
    private requestUpload(): void {
        this.state = { ...this.state, requested: true, trigger: this.state.trigger + 1 };
    }
    private achievements(): string {
        const dates: Record<string, number> = {};
        this.options.catalog.games.forEach(schema => {
            const a = schema.achievement, saved = this.options.storage.getAchievement(schema.gameId);
            if (a && saved?.achievementId === a.id && saved.unlockedAt) dates[String(a.code)] = timestampToDay(saved.unlockedAt);
        });
        return encodeAchievements(dates);
    }
    private mergeModules(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): Record<string, string> {
        const result = { ...left };
        this.options.catalog.games.forEach(schema => {
            const code = String(schema.code), payload = mergeModule(schema, left[code], right[code]);
            if (payload) result[code] = payload;
        });
        return result;
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
    private receiveTime(response: unknown): void {
        this.options.time.acceptColdStart(response);
        const day = this.options.time.day!;
        if (this.state.loginDays.indexOf(day) < 0) this.state = { ...this.state, loginDays: [...this.state.loginDays, day].slice(0, 6) };
        this.evaluate(); this.persist();
    }

    async pump(): Promise<void> {
        if (this.disposed || this.busy || !this.visible || this.now() < this.nextAttempt) return;
        this.busy = true;
        try {
            // 门槛前唯一调用是无身份、无存档读写的冷启动校时。
            if (!this.options.time.day && this.state.restore !== 'pending') {
                const time = await this.options.call({ v: 2, op: 'load', clockOnly: true });
                if (this.disposed) return;
                this.receiveTime(time);
            }
            if (!this.state.enabled) return;
            if (this.loaded && this.state.restore === 'done' && this.options.canRestore()) {
                this.applyRemote(this.loaded); this.loaded = undefined;
            }
            if (this.state.restore === 'pending') {
                if (!this.options.canRestore()) return;
                const loaded = this.loaded ?? record(await this.options.call({ v: 2, op: 'load' }));
                if (this.disposed) return;
                this.validateResponse(loaded); this.receiveTime(loaded); this.loaded = loaded;
                if (!this.options.canRestore()) return;
                this.applyRemote(loaded); this.loaded = undefined;
                this.state = { ...this.state, restore: 'done' }; this.persist(); this.options.storage.completeCloudRestore();
            }
            if (!this.state.requested) return;
            if (!this.state.pending) {
                this.tick();
                const m = this.dirtyModules(), achievements = this.achievements();
                const a = !this.state.seeded || achievements !== this.state.ackAchievements ? achievements : undefined;
                const t: Record<string, number> = {};
                Object.keys(this.state.playMs).forEach(id => { const ms = this.state.playMs[id]; if (Math.floor(ms) > 0) t[id] = Math.floor(ms); });
                if (this.state.seeded && !Object.keys(m).length && a === undefined && !Object.keys(t).length) {
                    this.state = { ...this.state, requested: false }; this.persist(); return;
                }
                const seq = this.state.seq + 1;
                const request: CloudSavePatch = { v: 2, op: 'save', device: this.state.device, seq, m, t, ...(a === undefined ? {} : { a }) };
                this.state = { ...this.state, seq, pending: { request, cleared: this.state.unsavedClears, trigger: this.state.trigger } };
                this.persist();
            }
            this.options.storage.flush();
            const pending = this.state.pending!, response = record(await this.options.call(pending.request));
            if (this.disposed) return;
            this.validateResponse(response);
            if (response.seq !== pending.request.seq) throw new Error('Invalid save acknowledgement.');
            const playMs = { ...this.state.playMs };
            Object.keys(pending.request.t).forEach(id => { playMs[id] = Math.max(0, (playMs[id] ?? 0) - pending.request.t[id]); });
            this.state = { ...this.state, playMs, pending: undefined, seeded: true,
                unsavedClears: Math.max(0, this.state.unsavedClears - pending.cleared),
                lastUploadAt: typeof response.serverTime === 'number' ? response.serverTime : 0,
                requested: this.state.trigger > pending.trigger || this.state.unsavedClears - pending.cleared >= 5 };
            if (this.options.canRestore()) this.applyRemote(response);
            else {
                this.state = { ...this.state, ack: strings(response.m), ackAchievements: response.a as string };
                this.loaded = response;
            }
            this.persist(); this.options.storage.flush(); this.failures = 0; this.nextAttempt = 0;
        } catch (error: unknown) {
            if (!this.disposed) {
                this.failures++; this.nextAttempt = this.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(this.failures - 1, 5)));
                console.warn('[CloudSave] Local progress retained; retry deferred.', error instanceof Error ? error.message : 'Request failed');
            }
        } finally {
            this.busy = false;
            if (!this.disposed && this.state.enabled && this.state.requested && this.state.restore === 'done' && this.nextAttempt <= this.now()) this.schedulePump();
        }
    }
    private validateModules(modules: Record<string, string>): void {
        this.options.catalog.games.forEach(schema => {
            const payload = modules[String(schema.code)];
            if (payload !== undefined) moduleRank(schema, payload);
        });
    }

    private cleanModules(value: unknown): Record<string, string> {
        const result = strings(value);
        this.options.catalog.games.forEach(schema => {
            const code = String(schema.code);
            if (result[code]) { try { moduleRank(schema, result[code]); } catch { delete result[code]; } }
        });
        return result;
    }
    private validateResponse(response: Record<string, unknown>): void {
        if (response.v !== 2 || response.ok !== true || typeof response.found !== 'boolean'
            || !response.m || Array.isArray(response.m) || typeof response.m !== 'object' || typeof response.a !== 'string')
            throw new Error('Invalid save response.');
        const modules = strings(response.m);
        if (Object.keys(modules).length !== Object.keys(response.m).length) throw new Error('Invalid save modules.');
        this.validateModules(modules); decodeAchievements(response.a);
    }
    private applyRemote(response: Record<string, unknown>): void {
        const storage = this.options.storage, modules = strings(response.m), dates = decodeAchievements(response.a as string);
        const games = { ...storage.snapshot.games }, achievements = { ...storage.snapshot.achievements };
        for (const schema of this.options.catalog.games) {
            const payload = modules[String(schema.code)], local = projectGame(schema, games[schema.gameId]);
            const merged = mergeModule(schema, local, payload);
            if (payload && merged && merged !== local) games[schema.gameId] = restoreGame(schema, merged, games[schema.gameId]);
            const a = schema.achievement;
            if (!a) continue;
            const current = achievements[schema.gameId]?.achievementId === a.id ? achievements[schema.gameId] : undefined;
            const restoredAt = dates[String(a.code)] === undefined ? undefined : dayToTimestamp(dates[String(a.code)]);
            const unlockedAt = current?.unlockedAt && restoredAt ? Math.min(current.unlockedAt, restoredAt) : current?.unlockedAt ?? restoredAt;
            const progress = unlockedAt ? a.target : Math.min(a.target, uint(games[schema.gameId]?.metrics?.[a.metric]));
            const saved: AchievementSaveData = { achievementId: a.id, progress,
                ...(unlockedAt ? { unlockedAt, celebratedAt: current?.celebratedAt ?? this.options.time.timestamp ?? Date.now() } : {}) };
            if (progress || unlockedAt || current || payload) achievements[schema.gameId] = saved;
        }
        const best = projectModules(this.options.catalog, { ...storage.snapshot, games });
        this.state = { ...this.state, ack: modules, ackAchievements: response.a as string,
            progressPeaks: this.mergeModules(this.state.progressPeaks, best) };
        this.roundRecords = this.mergeModules(this.roundRecords, best);
        this.unsubscribe?.(); this.unsubscribe = undefined;
        try { storage.restoreCloudProgress(games, achievements, this.state); this.persist(); storage.flush(); }
        finally {
            this.observedAchievements = this.achievements();
            this.unsubscribe = storage.subscribeProgress(() => this.changed());
        }
        this.options.onRestored?.();
    }
}

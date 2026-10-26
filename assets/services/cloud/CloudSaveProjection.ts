import type { CloudGameSchema, CloudSaveCatalog } from '../../core/types/CloudSave';
import type { GameSaveData, UserData } from '../storage/StorageService';
import { decodeModule, encodeModule, uint } from './CloudSaveCodec';

export function readPath(root: unknown, path: string): unknown {
    let value = root;
    for (const part of path.split('.')) {
        if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.'); let target = root;
    parts.forEach((part, index) => {
        if (['__proto__', 'constructor', 'prototype'].indexOf(part) >= 0) throw new Error('Unsafe cloud field.');
        if (index === parts.length - 1) { target[part] = value; return; }
        if (!target[part] || typeof target[part] !== 'object') target[part] = {};
        target = target[part] as Record<string, unknown>;
    });
}

export function projectGame(schema: CloudGameSchema, save?: GameSaveData): string | undefined {
    if (!save || save.dataVersion !== schema.dataVersion) return undefined;
    if (schema.numbers.some(field => field.constant !== undefined && readPath(save, field.path) !== field.constant)) return undefined;
    const starField = schema.stars;
    const stars = starField?.keys.map(key => {
        let value = readPath(save, `${starField.path}.${key}`);
        if (starField.valuePath) value = readPath(value, starField.valuePath);
        return starField.thresholds ? starField.thresholds.filter(threshold => uint(value) >= threshold).length : uint(value, 3);
    });
    const numbers = schema.numbers.map(field => {
        let raw = readPath(save, field.path);
        if (field.starProgress) { let cleared = 0; while (stars?.[cleared]) cleared++; raw = cleared; }
        return uint(Math.max(uint(raw), field.metric ? uint(save.metrics?.[field.metric]) : 0), field.max);
    });
    return encodeModule(numbers, stars);
}

export function moduleRank(schema: CloudGameSchema, payload: string): number {
    const { numbers } = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length ?? 0);
    numbers.forEach((n, i) => {
        const field = schema.numbers[i];
        if (n > (field.max ?? Number.MAX_SAFE_INTEGER) || (field.constant !== undefined && n !== field.constant))
            throw new Error('Invalid cloud field value.');
    });
    const rank = schema.rank.reduce((sum, i) => sum + numbers[i], 0);
    if (!Number.isSafeInteger(rank)) throw new Error('Invalid cloud progress.');
    return rank;
}

/** 最大值/逐关最高星数的合并满足交换律、结合律和幂等性。 */
export function mergeModule(schema: CloudGameSchema, left?: string, right?: string): string | undefined {
    if (!left && !right) return undefined;
    const decode = (value: string) => { moduleRank(schema, value); return decodeModule(value, schema.numbers.length, schema.stars?.keys.length ?? 0); };
    if (!left) { decode(right!); return right; }
    if (!right) { decode(left); return left; }
    const a = decode(left), b = decode(right);
    const stars = Array.from({ length: Math.max(a.stars.length, b.stars.length) }, (_, i) => Math.max(a.stars[i] ?? 0, b.stars[i] ?? 0));
    const values = a.numbers.map((n, i) => Math.max(n, b.numbers[i]));
    schema.numbers.forEach((field, i) => {
        if (field.starProgress) { let cleared = 0; while (stars[cleared]) cleared++; values[i] = cleared; }
    });
    return encodeModule(values, stars);
}

/** 一个新通关只记一次；已完成关卡的星数真正提升时再记一次，与升了几颗星无关。 */
export function progressImprovements(schema: CloudGameSchema, previous: string | undefined, next: string): number {
    const b = decodeModule(next, schema.numbers.length, schema.stars?.keys.length ?? 0);
    const a = previous ? decodeModule(previous, schema.numbers.length, schema.stars?.keys.length ?? 0)
        : { numbers: schema.numbers.map(() => 0), stars: [] as number[] };
    let added = (schema.levels ?? []).reduce((sum, i) => sum + Math.max(0, b.numbers[i] - a.numbers[i]), 0);
    b.stars.forEach((value, i) => { if (a.stars[i] > 0 && value > a.stars[i]) added++; });
    return added;
}

export function restoreGame(schema: CloudGameSchema, payload: string, local?: GameSaveData): GameSaveData {
    moduleRank(schema, payload);
    const decoded = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length ?? 0);
    // 只覆盖云协议明确包含的进度字段，保留本地道具、每日领取标记和有效棋盘。
    const result: Record<string, unknown> = local?.dataVersion === schema.dataVersion ? JSON.parse(JSON.stringify(local))
        : { dataVersion: schema.dataVersion, playCount: 0, highScore: 0, lastPlayedAt: 0 };
    Object.keys(schema.defaults ?? {}).forEach(path => {
        if (readPath(result, path) === undefined) setPath(result, path, JSON.parse(JSON.stringify(schema.defaults![path])));
    });
    schema.numbers.forEach((field, index) => {
        const value = decoded.numbers[index]; setPath(result, field.path, value);
        field.restoreAlso?.forEach(extra => {
            if (extra.preserveWhen && readPath(result, extra.preserveWhen)) return;
            setPath(result, extra.path, uint(value + extra.offset, extra.max));
        });
    });
    if (schema.stars) {
        const field = schema.stars, values: Record<string, unknown> = {};
        field.keys.forEach((key, index) => {
            const stars = decoded.stars[index] ?? 0;
            if (!stars) return;
            const value = field.restoreValues?.[stars] ?? stars;
            const old = readPath(result, `${field.path}.${key}`);
            if (field.valuePath) {
                const entry = { ...field.defaults, ...(old && typeof old === 'object' ? old : {}) };
                setPath(entry, field.valuePath, Math.max(uint(readPath(old, field.valuePath)), value)); values[key] = entry;
            } else values[key] = Math.max(uint(old), value);
        });
        setPath(result, field.path, values);
    }
    if (schema.achievement) {
        const value = schema.achievement.threeStars ? decoded.stars.filter(n => n === 3).length
            : decoded.numbers[schema.achievement.field!];
        result.metrics = { ...(result.metrics as Record<string, number> ?? {}), [schema.achievement.metric]: uint(value) };
    }
    return result as unknown as GameSaveData;
}

export function projectModules(catalog: CloudSaveCatalog, data: UserData): Record<string, string> {
    const modules: Record<string, string> = {};
    catalog.games.forEach(schema => {
        const payload = projectGame(schema, data.games[schema.gameId]);
        if (payload !== undefined) modules[String(schema.code)] = payload;
    });
    return modules;
}

export function validateCatalog(value: unknown): CloudSaveCatalog {
    const catalog = value as CloudSaveCatalog;
    if (catalog?.version !== 1 || !Array.isArray(catalog.games) || catalog.games.length > 128) throw new Error('Invalid cloud catalog.');
    const codes = new Set<number>(), ids = new Set<string>(), achievementCodes = new Set<number>();
    const pathOk = (path: string): boolean => typeof path === 'string' && path.split('.').every(part =>
        /^[A-Za-z0-9_-]+$/.test(part) && ['__proto__', 'constructor', 'prototype'].indexOf(part) < 0);
    for (const game of catalog.games) {
        if (!Number.isInteger(game.code) || game.code < 1 || codes.has(game.code) || ids.has(game.gameId)
            || !/^[a-z][a-z0-9-]*$/.test(game.gameId) || !Number.isInteger(game.dataVersion) || game.dataVersion < 1
            || !Array.isArray(game.numbers) || game.numbers.length > 32 || !Array.isArray(game.rank) || !game.rank.length)
            throw new Error('Invalid cloud game schema.');
        codes.add(game.code); ids.add(game.gameId);
        for (const field of game.numbers) {
            if (!pathOk(field.path)) throw new Error('Invalid cloud path.');
            if (field.record !== undefined && typeof field.record !== 'boolean') throw new Error('Invalid cloud record field.');
            if (field.constant !== undefined && (!Number.isSafeInteger(field.constant) || field.constant < 0
                || field.constant > (field.max ?? Number.MAX_SAFE_INTEGER))) throw new Error('Invalid constant cloud field.');
            field.restoreAlso?.forEach(extra => {
                if (!pathOk(extra.path) || (extra.preserveWhen && !pathOk(extra.preserveWhen))) throw new Error('Invalid cloud restore path.');
            });
        }
        [...game.rank, ...(game.levels ?? [])].forEach(i => {
            if (!Number.isInteger(i) || i < 0 || i >= game.numbers.length) throw new Error('Invalid cloud rank field.');
        });
        Object.keys(game.defaults ?? {}).forEach(path => { if (!pathOk(path)) throw new Error('Invalid cloud default.'); });
        if (game.stars && (!pathOk(game.stars.path) || game.stars.keys.length > 8192
            || game.stars.keys.some(key => !pathOk(key)))) throw new Error('Invalid stars schema.');
        const a = game.achievement;
        if (a) {
            if (!Number.isInteger(a.code) || a.code < 1 || achievementCodes.has(a.code) || !(a.target > 0)
                || (a.threeStars ? !game.stars : !Number.isInteger(a.field) || a.field! < 0 || a.field! >= game.numbers.length))
                throw new Error('Invalid achievement schema.');
            achievementCodes.add(a.code);
        }
    }
    return catalog;
}

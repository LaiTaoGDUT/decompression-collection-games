import type { GameResult } from '../core/types/CommonTypes';

export type GameSessionState = 'active' | 'finished';

export interface GameSessionOptions {
    readonly now?: () => number;
    readonly createId?: () => string;
}

let sessionSequence = 0;

function createSessionId(): string {
    sessionSequence += 1;
    return `session-${Date.now().toString(36)}-${sessionSequence.toString(36)}`;
}

function requireNonEmpty(value: string, field: string): string {
    const normalized = value.trim();

    if (!normalized) {
        throw new Error(`${field} must not be empty.`);
    }

    return normalized;
}

function requireTimestamp(value: number, field: string): number {
    if (!Number.isFinite(value)) {
        throw new Error(`${field} must be a finite timestamp.`);
    }

    return value;
}

function freezeResult(result: GameResult, duration: number): GameResult {
    const extra = result.extra
        ? Object.freeze({ ...result.extra })
        : undefined;

    return Object.freeze({
        score: result.score,
        duration,
        completed: result.completed,
        ...(extra ? { extra } : {}),
    });
}

/** 管理一局游戏从创建到结果固化的最小会话状态。 */
export class GameSession {
    readonly id: string;
    readonly gameId: string;
    readonly startedAt: number;

    private readonly now: () => number;
    private currentState: GameSessionState = 'active';
    private finalResult?: GameResult;

    constructor(gameId: string, options: GameSessionOptions = {}) {
        this.gameId = requireNonEmpty(gameId, 'gameId');
        this.now = options.now ?? Date.now;
        this.startedAt = requireTimestamp(this.now(), 'startedAt');
        this.id = requireNonEmpty(
            (options.createId ?? createSessionId)(),
            'sessionId',
        );
    }

    get state(): GameSessionState {
        return this.currentState;
    }

    get result(): GameResult | undefined {
        return this.finalResult;
    }

    /** 当前经过时间；会话结束后固定为最终结果中的时长，单位为毫秒。 */
    get duration(): number {
        if (this.finalResult) {
            return this.finalResult.duration;
        }

        return this.calculateDuration(this.now());
    }

    /** 固化结果并结束会话。结果中的 duration 由会话统一计算。 */
    finish(result: GameResult): GameResult {
        if (this.currentState === 'finished') {
            throw new Error(`Game session "${this.id}" has already finished.`);
        }

        const duration = this.calculateDuration(this.now());
        this.finalResult = freezeResult(result, duration);
        this.currentState = 'finished';
        return this.finalResult;
    }

    private calculateDuration(timestamp: number): number {
        const currentTimestamp = requireTimestamp(timestamp, 'current timestamp');
        return Math.max(0, currentTimestamp - this.startedAt);
    }
}

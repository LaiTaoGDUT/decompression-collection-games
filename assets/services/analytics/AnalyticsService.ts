export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Readonly<Record<string, AnalyticsValue>>;

export interface AnalyticsContext {
    readonly appVersion: string;
    readonly platformId: string;
    readonly deviceTier: string;
}

export interface AnalyticsEvent {
    readonly name: string;
    readonly timestamp: number;
    readonly appVersion: string;
    readonly platformId: string;
    readonly deviceTier: string;
    readonly properties: AnalyticsProperties;
}

export interface AnalyticsTransport {
    send(event: AnalyticsEvent): void;
}

/** 开发环境适配器只输出单个结构化对象。 */
export class ConsoleAnalyticsTransport implements AnalyticsTransport {
    send(event: AnalyticsEvent): void {
        console.info('[Analytics]', event);
    }
}

function requireName(name: string): string {
    const normalized = name.trim();

    if (!normalized) {
        throw new Error('Analytics event name must not be empty.');
    }

    return normalized;
}

/** 厂商无关统计入口，统一补充公共字段并去重 Session 结束事件。 */
export class AnalyticsService {
    private readonly endedSessionIds = new Set<string>();

    constructor(
        private readonly getContext: () => AnalyticsContext,
        private readonly transport: AnalyticsTransport = new ConsoleAnalyticsTransport(),
        private readonly now: () => number = Date.now,
    ) {}

    track(name: string, properties: AnalyticsProperties = {}): AnalyticsEvent {
        const context = this.getContext();
        const event: AnalyticsEvent = Object.freeze({
            name: requireName(name),
            timestamp: this.now(),
            appVersion: context.appVersion,
            platformId: context.platformId,
            deviceTier: context.deviceTier,
            properties: Object.freeze({ ...properties }),
        });
        this.transport.send(event);
        return event;
    }

    trackGameEnd(
        sessionId: string,
        properties: AnalyticsProperties = {},
    ): AnalyticsEvent | undefined {
        const normalizedId = sessionId.trim();

        if (!normalizedId) {
            throw new Error('Session ID must not be empty.');
        }

        if (this.endedSessionIds.has(normalizedId)) {
            return undefined;
        }

        this.endedSessionIds.add(normalizedId);

        if (this.endedSessionIds.size > 512) {
            const oldest = this.endedSessionIds.values().next().value as
                | string
                | undefined;

            if (oldest) {
                this.endedSessionIds.delete(oldest);
            }
        }

        return this.track('game_end', {
            ...properties,
            sessionId: normalizedId,
        });
    }
}

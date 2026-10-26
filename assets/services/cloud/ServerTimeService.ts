/** 没有可信日期不发放；领取日必须早于本次冷启动服务端日。 */
export function canReceiveDailyReward(lastDay: string, serverDay?: string): boolean {
    return typeof serverDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serverDay) && lastDay < serverDay;
}

/** 每次应用冷启动只接受一次服务端日期；跨天和前后台不推进每日赠送日期。 */
export class ServerTimeService {
    private coldDay?: string;
    private coldTimestamp?: number;

    get day(): string | undefined { return this.coldDay; }
    get timestamp(): number | undefined { return this.coldTimestamp; }

    acceptColdStart(value: unknown): void {
        if (this.coldDay) return;
        const response = value as { serverTime?: number; serverDay?: string };
        if (!response || !Number.isSafeInteger(response.serverTime) || response.serverTime! < 946684800000
            || response.serverTime! > 4102444800000) throw new Error('Invalid server time.');
        const day = new Date(response.serverTime! + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (response.serverDay !== day) throw new Error('Invalid server day.');
        this.coldTimestamp = response.serverTime; this.coldDay = day;
    }
}

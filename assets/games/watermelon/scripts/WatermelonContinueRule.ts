import type { AdOutcome } from '../../../services/ads/AdService';

export type ContinueResolution = 'continue' | 'settle' | 'ignored';
export type ContinueState = 'available' | 'requesting' | 'used' | 'closed';

/** 每局只允许发起一次奖励请求，且只有 completed 可以恢复游戏。 */
export class SingleContinueRule {
    private current: ContinueState = 'available';

    get state(): ContinueState {
        return this.current;
    }

    get canOffer(): boolean {
        return this.current === 'available';
    }

    beginRequest(): boolean {
        if (this.current !== 'available') {
            return false;
        }

        this.current = 'requesting';
        return true;
    }

    resolve(outcome: AdOutcome): ContinueResolution {
        if (this.current !== 'requesting') {
            return 'ignored';
        }

        if (outcome === 'completed') {
            this.current = 'used';
            return 'continue';
        }

        this.current = 'closed';
        return 'settle';
    }

    decline(): boolean {
        if (this.current !== 'available') {
            return false;
        }

        this.current = 'closed';
        return true;
    }
}

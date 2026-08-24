import type { Platform } from '../../../platform/Platform';
import type { AdService } from '../../../services/ads/AdService';
import type { AudioService } from '../../../services/audio/AudioService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';

/**
 * 单局内部状态（策划案 §4）。
 * M0 只驱动 ready / playing / paused / completed / disposed；
 * levelup 与 reviveOffer 在 M1 / M2 接入。
 */
export type EndlessSwordRunState =
    | 'idle'
    | 'ready'
    | 'playing'
    | 'levelup'
    | 'paused'
    | 'reviveOffer'
    | 'completed'
    | 'disposed';

/** 本游戏收窄的公共服务集合（App.ts 注入集合的子集）。 */
export interface EndlessSwordServices {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly platform: Platform;
    readonly storage: StorageService;
    readonly ads: AdService;
}

/** 逻辑层消费的移动输入快照；不依赖具体摇杆或自动化输入实现。 */
export interface MoveInput {
    readonly dirX: number;
    readonly dirY: number;
    readonly magnitude: number;
}

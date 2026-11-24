import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';

export const CUBE_AWAY_AUDIO_BUNDLE = 'game-cube-away-assets';

/** 魔方小蛇的操作音效与循环配乐。 */
export class CubeAwayAudio {
    private readonly bank: BundleAudioBank;
    private disposed = false;

    constructor(
        private readonly audio: AudioService,
        private readonly feedback: FeedbackService,
        assets: AssetService,
    ) {
        this.bank = new BundleAudioBank(
            {
                bundle: CUBE_AWAY_AUDIO_BUNDLE,
                packedEffects: 'visual/audio/cube-effects',
                optionalMusic: 'visual/audio/studio-loop',
                musicVolume: 0.48,
                cues: {
                    uiButton: 'visual/audio/cube-tap',
                    fold: ['visual/audio/cube-fly', 'visual/audio/cube-fly-2'],
                    chain: 'visual/audio/cube-combo',
                    collision: 'visual/audio/cube-blocked',
                    toggle: 'visual/audio/cube-pause',
                    merge: 'visual/audio/cube-turn',
                    drop: 'visual/audio/cube-split',
                    danger: 'visual/audio/cube-smash',
                    continue: 'visual/audio/cube-hint',
                    milestone: 'visual/audio/cube-win',
                    failure: 'visual/audio/cube-lose',
                    record: 'visual/audio/cube-cane',
                    popup: 'visual/audio/cube-popup',
                },
            },
            audio,
            feedback,
            assets,
        );
    }

    async initialize(): Promise<void> {
        await this.bank.initialize();
    }

    playTap(): void {
        if (this.disposed) return;
        this.feedback.play('uiButton', { minIntervalMs: 45 });
    }

    playFly(): void {
        if (this.disposed) return;
        this.feedback.play('fold', { minIntervalMs: 35 });
    }

    playCombo(): void {
        if (this.disposed) return;
        this.feedback.play('chain', { minIntervalMs: 60 });
    }

    playBlocked(): void {
        if (this.disposed) return;
        this.feedback.play('collision', { minIntervalMs: 80 });
    }

    playPauseStop(): void {
        if (this.disposed) return;
        this.feedback.play('toggle', { minIntervalMs: 80 });
    }

    playTurn(): void {
        if (this.disposed) return;
        this.feedback.play('merge', { minIntervalMs: 50 });
    }

    playSplit(): void {
        if (this.disposed) return;
        this.feedback.play('drop', { minIntervalMs: 50 });
    }

    playSmash(): void {
        if (this.disposed) return;
        this.feedback.play('danger', { minIntervalMs: 80 });
    }

    playHint(): void {
        if (this.disposed) return;
        this.feedback.play('continue', { minIntervalMs: 80 });
    }

    playWin(): void {
        if (this.disposed) return;
        this.feedback.play('milestone');
    }

    playLose(): void {
        if (this.disposed) return;
        this.feedback.play('failure');
    }

    playCane(): void {
        if (this.disposed) return;
        this.feedback.play('record', { minIntervalMs: 60 });
    }

    playPopup(): void {
        if (this.disposed) return;
        this.feedback.play('popup', { minIntervalMs: 90 });
    }

    get isSoundEnabled(): boolean {
        return this.audio.isSoundEnabled;
    }

    toggleSound(): boolean {
        const next = !this.audio.isSoundEnabled;
        this.audio.setEnabled(next);
        return next;
    }

    stopEffects(): void {
        this.bank.stopEffects();
    }

    restartMusic(): void {
        this.bank.restartMusic();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.bank.dispose();
    }
}

import type { BundleAudioBankConfig } from '../../../services/audio/BundleAudioBank';
import type { FeedbackCue } from '../../../services/feedback/FeedbackService';
import type { RunnerEvent } from './MemeRunnerModel';

/** Plush street: marimba / muted guitar / slap bass, padded impacts and cloth air.
 * All twenty-one one-shots are local to this Bundle and share a bounded effect scope.
 * Voice slots are cue identifiers only; these assets contain no spoken words.
 */
export const RUNNER_AUDIO: BundleAudioBankConfig = {
    bundle: 'game-meme-runner-assets', alwaysLoad: true,
    music: 'visual/audio/street-groove-loop-v18', musicVolume: .38,
    packedEffects: 'visual/audio/runner-effects-v18',
    cues: {
        drop: 'visual/audio/jump-v18', fold: 'visual/audio/double-v18', toggle: 'visual/audio/land-v18',
        continue: 'visual/audio/slide-v18', merge: [0, 1, 2, 3].map(i => `visual/audio/coin-${i}-v18`),
        popup: 'visual/audio/bounce-v18', chain: 'visual/audio/mount-v18', voice1: 'visual/audio/break-v18',
        voice2: 'visual/audio/dismount-v18', milestone: 'visual/audio/rescue-v18',
        collision: 'visual/audio/hit-v18', danger: 'visual/audio/fall-v18', uiButton: 'visual/audio/tap-v18',
        voice3: 'visual/audio/combo-v18', voice4: 'visual/audio/start-v18', record: 'visual/audio/win-v18', failure: 'visual/audio/lose-v18',
        voice5: 'visual/audio/spinner-warning-v21',
    },
};

export const RUNNER_EVENT_CUES: Readonly<Partial<Record<RunnerEvent, FeedbackCue>>> = {
    jump: 'drop', double: 'fold', land: 'toggle', slide: 'continue', coin: 'merge', bounce: 'popup',
    mount: 'chain', break: 'voice1', dismount: 'voice2', hit: 'collision', fall: 'danger', warning: 'voice5', power: 'milestone', shield: 'voice2',
    perfect: 'voice3', fever: 'milestone', feverEnd: 'voice2', deliver: 'record', pop: 'popup',
};

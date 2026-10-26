import type { PlatformAudioBuffer, PlatformAudioContext, PlatformAudioGain, PlatformAudioSource } from '../../platform/PlatformAudio';
import type { AudioEffectPlaybackOptions } from './AudioService';

interface Voice {
    readonly source: PlatformAudioSource;
    readonly gain: PlatformAudioGain;
    readonly volume: number;
    started: boolean;
    cancelled: boolean;
}

/** 每个游戏音效 Scope 独立拥有六个声部；起播、结束和取消都释放节点引用。 */
export class PackedAudioVoices {
    private readonly voices = new Set<Voice>();
    private readonly clipVolumes = new WeakMap<PlatformAudioBuffer, number>();
    private volumeScale = 1;

    constructor(private readonly context: () => PlatformAudioContext,
        private readonly audible: () => boolean) {}

    setVolumeScale(scale: number): void {
        this.volumeScale = Math.max(0, Math.min(1, scale));
        this.voices.forEach(voice => this.updateGain(voice));
    }

    setClipVolume(buffer: PlatformAudioBuffer, volume: number): void {
        this.clipVolumes.set(buffer, Math.max(0, Math.min(1, volume)));
        this.voices.forEach(voice => { if (voice.source.buffer === buffer) this.updateGain(voice); });
    }

    private updateGain(voice: Voice): void {
        voice.gain.gain.value = voice.volume * this.volumeScale * (voice.source.buffer ? this.clipVolumes.get(voice.source.buffer) ?? 1 : 1);
    }

    isPlaying(buffer: PlatformAudioBuffer): boolean {
        for (const voice of this.voices) if (!voice.cancelled && voice.source.buffer === buffer) return true;
        return false;
    }

    play(buffer: PlatformAudioBuffer, volume: number, options: AudioEffectPlaybackOptions = {}, reuseByBuffer = false): void {
        if (!this.audible()) return;
        const context = this.context();
        if (reuseByBuffer) Array.from(this.voices).forEach(voice => { if (voice.source.buffer === buffer) this.release(voice, true); });
        if (this.voices.size >= 6) {
            const oldest = this.voices.values().next().value as Voice | undefined;
            if (oldest) this.release(oldest, true);
        }
        const source = context.createBufferSource(), gain = context.createGain();
        const decibels = Number.isFinite(options.gainDecibels) ? Math.max(-80, Math.min(24, options.gainDecibels!)) : 0;
        const offset = Number.isFinite(options.startSeconds) ? Math.max(0, Math.min(buffer.duration, options.startSeconds!)) : 0;
        const rate = Number.isFinite(options.playbackRate) ? Math.max(.05, Math.min(4, options.playbackRate!)) : 1;
        const voice: Voice = { source, gain, volume: Math.max(0, Math.min(1, volume)) * Math.pow(10, decibels / 20), started: false, cancelled: false };
        source.buffer = buffer; source.loop = false; this.updateGain(voice);
        if (source.playbackRate) source.playbackRate.value = rate;
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => this.release(voice, false);
        this.voices.add(voice);
        const start = (): void => {
            if (voice.cancelled) return;
            if (!this.audible()) { this.release(voice, false); return; }
            try { source.start(0, offset); voice.started = true; }
            catch (_error: unknown) { this.release(voice, false); }
        };
        try {
            if (context.state === 'suspended') {
                const resume = context.resume();
                if (resume && typeof resume.then === 'function') {
                    void resume.then(start, () => this.release(voice, false));
                } else start();
            } else start();
        } catch (_error: unknown) { this.release(voice, false); }
    }

    stop(): void { Array.from(this.voices).forEach(voice => this.release(voice, true)); }

    private release(voice: Voice, stop: boolean): void {
        if (voice.cancelled) return;
        voice.cancelled = true; this.voices.delete(voice); voice.source.onended = null;
        if (stop && voice.started) {
            try { voice.source.stop(); } catch (_error: unknown) { /* 已结束的原生声部也继续释放。 */ }
        }
        try { voice.source.disconnect(); } catch (_error: unknown) { /* 继续释放其余引用。 */ }
        try { voice.gain.disconnect(); } catch (_error: unknown) { /* 继续释放缓冲引用。 */ }
        try { voice.source.buffer = null; }
        catch (_error: unknown) { /* 部分原生桥不接受 null；节点已断开且不再由 Scope 持有。 */ }
    }
}

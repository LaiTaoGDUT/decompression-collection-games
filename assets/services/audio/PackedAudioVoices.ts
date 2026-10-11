import type { PlatformAudioBuffer, PlatformAudioContext, PlatformAudioGain, PlatformAudioSource } from '../../platform/PlatformAudio';

interface Voice {
    readonly source: PlatformAudioSource;
    readonly gain: PlatformAudioGain;
    started: boolean;
    cancelled: boolean;
}

/** 每个游戏音效 Scope 独立拥有六个声部；起播、结束和取消都释放节点引用。 */
export class PackedAudioVoices {
    private readonly voices = new Set<Voice>();

    constructor(private readonly context: () => PlatformAudioContext,
        private readonly audible: () => boolean) {}

    play(buffer: PlatformAudioBuffer, volume: number): void {
        if (!this.audible()) return;
        const context = this.context();
        if (this.voices.size >= 6) {
            const oldest = this.voices.values().next().value as Voice | undefined;
            if (oldest) this.release(oldest, true);
        }
        const source = context.createBufferSource(), gain = context.createGain();
        const voice: Voice = { source, gain, started: false, cancelled: false };
        source.buffer = buffer; source.loop = false; gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => this.release(voice, false);
        this.voices.add(voice);
        const start = (): void => {
            if (voice.cancelled) return;
            if (!this.audible()) { this.release(voice, false); return; }
            try { source.start(); voice.started = true; }
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

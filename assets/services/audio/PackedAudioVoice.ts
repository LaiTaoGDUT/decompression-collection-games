import type { PlatformAudioBuffer, PlatformAudioContext, PlatformAudioGain, PlatformAudioNode, PlatformAudioSource } from '../../platform/PlatformAudio';
import type { PackedAudioEffect } from './PackedAudioBank';

export interface BufferVoicePlayback {
    readonly loop?: boolean;
    readonly startSeconds?: number;
    readonly playbackRate?: number;
}
export interface BufferVoiceFilter {
    readonly feedforward: readonly number[];
    readonly feedback: readonly number[];
}

/** One owned WebAudio stream. Position follows the audio clock across rate
 * changes; pause rebuilds its one-shot source at the exact saved position. */
export class PackedAudioVoice {
    private buffer?: PlatformAudioBuffer;
    private source?: PlatformAudioSource;
    private gain?: PlatformAudioGain;
    private position = 0; private startedAt = 0;
    private rate = 1; private appliedRate = 1; private gainDb = 0; private level = 1;
    private active = false; private paused = false; private started = false;
    private loop = false; private disposed = false; private generation = 0;
    private filters: readonly BufferVoiceFilter[] = []; private filterKey = '[]';
    private filterNodes: PlatformAudioNode[] = [];

    constructor(private readonly context: () => PlatformAudioContext, private readonly audible: () => boolean,
        private readonly volumeScale: () => number, private readonly onDispose: () => void) {}

    get playing(): boolean {
        return this.active && !this.paused && (this.loop || !this.started || this.currentTime < (this.buffer?.duration ?? 0));
    }
    get volume(): number { return this.level; }
    get sampleRate(): number { return this.context().sampleRate ?? 44100; }
    get contextTime(): number { return this.now(); }
    get playbackRate(): number { return this.rate; }
    get currentTime(): number {
        const elapsed = this.started && !this.paused ? Math.max(0, this.now() - this.startedAt) * this.appliedRate : 0;
        const position = this.position + elapsed, duration = this.buffer?.duration ?? 0;
        return duration > 0 ? this.loop ? position % duration : Math.min(duration, position) : 0;
    }

    play(clip: PackedAudioEffect, volume: number, options: BufferVoicePlayback = {}): boolean {
        if (this.disposed || !clip.buffer) return false;
        this.stop(); this.buffer = clip.buffer; this.loop = !!options.loop;
        const offset = Number.isFinite(options.startSeconds) ? Math.max(0, options.startSeconds!) : 0;
        this.position = this.loop ? offset % this.buffer.duration : Math.min(this.buffer.duration, offset);
        this.rate = Number.isFinite(options.playbackRate) ? Math.max(0, Math.min(4, options.playbackRate!)) : 1;
        this.active = true; this.paused = !this.audible(); this.setVolume(volume);
        if (!this.paused) this.startSource();
        return this.active;
    }

    setVolume(volume: number): void { this.level = Math.max(0, Math.min(1, volume)); this.updateGain(); }
    setGainDecibels(decibels: number): void {
        this.gainDb = Number.isFinite(decibels) ? Math.max(-80, Math.min(24, decibels)) : 0; this.updateGain();
    }
    /** Change stream processing without restarting its audio clock. */
    setFilters(filters: readonly BufferVoiceFilter[]): boolean {
        if (this.disposed) return false;
        const key = JSON.stringify(filters); if (key === this.filterKey) return true;
        const context = this.context();
        if (filters.length && !context.createIIRFilter) return false;
        const specs = filters.map(filter => ({ feedforward: Array.from(filter.feedforward), feedback: Array.from(filter.feedback) }));
        const nodes: PlatformAudioNode[] = [];
        try {
            if (this.source) for (const filter of specs) nodes.push(context.createIIRFilter!(filter.feedforward, filter.feedback));
            this.source?.disconnect(); this.filterNodes.forEach(node => node.disconnect()); this.filterNodes = nodes;
            this.filters = specs; this.filterKey = key;
            if (this.source && this.gain) this.connectSource(this.source, this.gain);
            return true;
        } catch (_error: unknown) { nodes.forEach(node => node.disconnect()); return false; }
    }
    setPlaybackRate(rate: number): void {
        if (this.disposed || !Number.isFinite(rate)) return;
        this.position = this.currentTime; this.startedAt = this.started ? this.now() : 0; this.rate = Math.max(0, Math.min(4, rate));
        this.appliedRate = this.source?.playbackRate ? this.rate : 1;
        if (this.source?.playbackRate) this.source.playbackRate.value = this.rate;
    }
    pause(): void {
        if (this.disposed || !this.active || this.paused) return;
        this.position = this.currentTime; this.paused = true; this.releaseSource(true);
    }
    resume(): void {
        if (this.disposed || !this.active || !this.paused || !this.audible()) return;
        if (!this.loop && this.position >= (this.buffer?.duration ?? 0)) { this.active = false; return; }
        this.paused = false; this.startSource();
    }
    stop(): void {
        this.active = false; this.paused = false; this.releaseSource(true); this.buffer = undefined; this.position = 0;
    }
    dispose(): void { if (this.disposed) return; this.disposed = true; this.stop(); this.filters = []; this.onDispose(); }

    private now(): number {
        const time = this.context().currentTime;
        return typeof time === 'number' && Number.isFinite(time) ? time : Date.now() / 1000;
    }
    private updateGain(): void {
        if (this.gain) this.gain.gain.value = this.level * this.volumeScale() * Math.pow(10, this.gainDb / 20);
    }
    private startSource(): void {
        if (!this.buffer || this.disposed) return;
        const generation = ++this.generation, context = this.context();
        try {
            const source = context.createBufferSource(), gain = context.createGain();
            this.source = source; this.gain = gain; this.started = false;
            source.buffer = this.buffer; source.loop = this.loop;
            this.appliedRate = source.playbackRate ? this.rate : 1;
            if (source.playbackRate) source.playbackRate.value = this.rate;
            for (const filter of this.filters) this.filterNodes.push(context.createIIRFilter!(Array.from(filter.feedforward), Array.from(filter.feedback)));
            this.updateGain(); this.connectSource(source, gain); gain.connect(context.destination);
            source.onended = () => {
                if (this.source !== source || generation !== this.generation) return;
                this.position = this.buffer?.duration ?? 0; this.active = false; this.releaseSource(false);
            };
            const start = (): void => {
                if (this.disposed || generation !== this.generation || !this.active || this.paused) return;
                if (!this.audible()) { this.pause(); return; }
                try { source.start(0, this.position); this.startedAt = this.now(); this.started = true; }
                catch (_error: unknown) { this.active = false; this.releaseSource(false); }
            };
            if (context.state === 'suspended') {
                const result = context.resume();
                if (result && typeof result.then === 'function') void result.then(start, () => {
                    if (generation === this.generation) { this.active = false; this.releaseSource(false); }
                }); else start();
            } else start();
        } catch (_error: unknown) { this.active = false; this.releaseSource(false); }
    }
    private connectSource(source: PlatformAudioSource, gain: PlatformAudioGain): void {
        let output: PlatformAudioNode = source;
        for (const filter of this.filterNodes) { output.connect(filter); output = filter; }
        output.connect(gain);
    }
    private releaseSource(stop: boolean): void {
        this.generation++; const source = this.source, gain = this.gain;
        this.source = undefined; this.gain = undefined;
        if (source) {
            source.onended = null;
            if (stop && this.started) { try { source.stop(); } catch (_error: unknown) { /* Already ended. */ } }
            try { source.disconnect(); } catch (_error: unknown) { /* Release the remaining references. */ }
            try { source.buffer = null; } catch (_error: unknown) { /* Older bridges reject null after disconnect. */ }
        }
        if (gain) { try { gain.disconnect(); } catch (_error: unknown) { /* Already disconnected. */ } }
        this.filterNodes.forEach(node => { try { node.disconnect(); } catch (_error: unknown) { /* Already disconnected. */ } });
        this.filterNodes = [];
        this.started = false;
    }
}

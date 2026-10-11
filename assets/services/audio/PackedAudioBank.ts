import { Asset } from 'cc';
import type { PlatformAudioBuffer, PlatformAudioContext } from '../../platform/PlatformAudio';

const MAGIC = 'AUDIOBNK';
const HEADER_SIZE = 12;
const DECODE_TIMEOUT_MS = 15000;

export interface PackedAudioEntry {
    readonly offset: number;
    readonly length: number;
}

/** 偏移指向原始 MP3 字节，不是播放时间；每个音效独立解码，保留完整尾音。 */
export function readPackedAudioIndex(data: ArrayBuffer): {
    readonly entries: Readonly<Record<string, PackedAudioEntry>>;
    readonly payloadOffset: number;
} {
    if (data.byteLength < HEADER_SIZE) throw new Error('Truncated audio bank header.');
    const bytes = new Uint8Array(data);
    for (let i = 0; i < MAGIC.length; i++) {
        if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error('Invalid audio bank signature.');
    }
    const length = new DataView(data).getUint32(8, true);
    const payloadOffset = HEADER_SIZE + length;
    if (length === 0 || payloadOffset >= data.byteLength) throw new Error('Invalid audio bank index length.');
    // 资源路径和 JSON 都是 ASCII；微信环境不要求 TextDecoder 或 Node Buffer。
    let text = '';
    for (let i = HEADER_SIZE; i < payloadOffset; i++) text += String.fromCharCode(bytes[i]);
    const entries: Record<string, PackedAudioEntry> = JSON.parse(text);
    if (!entries || Array.isArray(entries) || typeof entries !== 'object') throw new Error('Invalid audio bank index.');
    const names = Object.keys(entries);
    if (names.length === 0) throw new Error('Empty audio bank.');
    let nextOffset = 0;
    for (const name of names) {
        const entry = entries[name];
        if (!entry || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length)
            || entry.offset !== nextOffset || entry.length <= 0
            || payloadOffset + entry.offset + entry.length > data.byteLength) {
            throw new Error(`Invalid packed audio range: ${name}.`);
        }
        nextOffset += entry.length;
    }
    if (payloadOffset + nextOffset !== data.byteLength) throw new Error('Unexpected audio bank trailing data.');
    return { entries, payloadOffset };
}

/** 应用关闭时立即取消在途解码，清除超时和回调闭包；迟到的原生回调不再结算。 */
export class PackedAudioDecodeCancellation {
    private cancelled = false;
    private readonly callbacks = new Set<() => void>();

    onCancel(callback: () => void): () => void {
        if (this.cancelled) callback();
        else this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    cancel(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        Array.from(this.callbacks).forEach(callback => callback());
        this.callbacks.clear();
    }
}

function decodeClip(context: PlatformAudioContext, data: ArrayBuffer,
    cancellation?: PackedAudioDecodeCancellation): Promise<PlatformAudioBuffer> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let clearCancellation = (): void => {};
        const timer = setTimeout(() => fail(new Error('Packed audio decode timed out.')), DECODE_TIMEOUT_MS);
        const fail = (error: unknown): void => {
            if (settled) return;
            settled = true; clearTimeout(timer); clearCancellation(); reject(error);
        };
        const success = (buffer: PlatformAudioBuffer): void => {
            if (settled) return;
            if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
                fail(new Error('Invalid decoded audio buffer.')); return;
            }
            settled = true; clearTimeout(timer); clearCancellation(); resolve(buffer);
        };
        if (cancellation) clearCancellation = cancellation.onCancel(() => fail(new Error('Packed audio decode cancelled.')));
        if (settled) return;
        try {
            const result = context.decodeAudioData(data, success, fail) as Promise<PlatformAudioBuffer> | undefined;
            // 同时处理 callback 和 Promise，单次结算也兼容微信的非 Promise 返回值。
            if (typeof result?.then === 'function') void result.then(success, fail);
        } catch (error: unknown) { fail(error); }
    });
}

/** 派生资源由 AssetService 归属 Bundle，销毁时清空所有解码缓冲。 */
export class PackedAudioBank extends Asset {
    private readonly buffers = new Map<string, PlatformAudioBuffer>();

    static async decode(data: ArrayBuffer, context: PlatformAudioContext,
        cancellation?: PackedAudioDecodeCancellation): Promise<PackedAudioBank> {
        const { entries, payloadOffset } = readPackedAudioIndex(data);
        const names = Object.keys(entries);
        const bank = new PackedAudioBank();
        let cursor = 0, failed = false, failure: unknown;
        // 控制原生解码并发；失败后仍等待在途解码完成，退出不会遗留回调。
        await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
            while (!failed && cursor < names.length) {
                const name = names[cursor++], entry = entries[name];
                try {
                    const offset = payloadOffset + entry.offset;
                    const buffer = await decodeClip(context, data.slice(offset, offset + entry.length), cancellation);
                    bank.buffers.set(name, buffer);
                } catch (error: unknown) { failed = true; failure = error; }
            }
        }));
        if (failed) { bank.destroy(); throw failure; }
        return bank;
    }

    effect(path: string): PackedAudioEffect {
        if (!this.buffers.has(path)) throw new Error(`Missing packed audio: ${path}.`);
        return new PackedAudioEffect(this, path);
    }

    getBuffer(path: string): PlatformAudioBuffer | undefined { return this.buffers.get(path); }

    destroy(): boolean {
        this.buffers.clear();
        return super.destroy();
    }
}

export class PackedAudioEffect {
    constructor(readonly bank: PackedAudioBank, readonly path: string) {}
    get buffer(): PlatformAudioBuffer | undefined { return this.bank.getBuffer(this.path); }
}

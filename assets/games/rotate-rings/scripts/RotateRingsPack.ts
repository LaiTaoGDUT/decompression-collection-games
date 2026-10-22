/** 游戏私有的 RFC1951 读取器，仅解码离线构建的无损数据；不依赖平台解压 API 或第三方库。 */
class RingBits {
    offset = 0;
    private value = 0;
    private count = 0;
    constructor(readonly bytes: Uint8Array) {}
    read(bits: number): number {
        while (this.count < bits) {
            if (this.offset >= this.bytes.length) throw new Error('Truncated RotateRings packed data');
            this.value |= this.bytes[this.offset++] << this.count; this.count += 8;
        }
        const result = this.value & ((1 << bits) - 1);
        this.value >>>= bits; this.count -= bits; return result;
    }
    align(): void { this.value = 0; this.count = 0; }
}

class RingHuffman {
    private readonly counts = new Uint16Array(16);
    private readonly symbols: Uint16Array;
    private max = 0;
    constructor(lengths: readonly number[]) {
        lengths.forEach(length => {
            if (!Number.isInteger(length) || length < 0 || length > 15) throw new Error('Invalid RotateRings Huffman length');
            if (length) { this.counts[length]++; this.max = Math.max(this.max, length); }
        });
        let available = 1, size = 0;
        const offsets = new Uint16Array(16);
        for (let length = 1; length <= 15; length++) {
            available = available * 2 - this.counts[length];
            if (available < 0) throw new Error('Invalid RotateRings Huffman tree');
            offsets[length] = size; size += this.counts[length];
        }
        this.symbols = new Uint16Array(size);
        lengths.forEach((length, symbol) => { if (length) this.symbols[offsets[length]++] = symbol; });
    }
    read(reader: RingBits): number {
        let code = 0, first = 0, index = 0;
        for (let length = 1; length <= this.max; length++) {
            code = code * 2 + reader.read(1);
            const count = this.counts[length], relative = code - first;
            if (relative >= 0 && relative < count) return this.symbols[index + relative];
            index += count; first = (first + count) * 2;
        }
        throw new Error('Invalid RotateRings Huffman symbol');
    }
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DISTANCE_BITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function trees(reader: RingBits, fixed: boolean): [RingHuffman, RingHuffman] {
    if (fixed) return [new RingHuffman(Array.from({ length: 288 }, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)),
        new RingHuffman(Array.from({ length: 32 }, () => 5))];
    const literalCount = reader.read(5) + 257, distanceCount = reader.read(5) + 1, codeCount = reader.read(4) + 4;
    if (literalCount > 286) throw new Error('Invalid RotateRings literal tree');
    const codeLengths = Array.from({ length: 19 }, () => 0);
    for (let i = 0; i < codeCount; i++) codeLengths[CODE_ORDER[i]] = reader.read(3);
    const codeTree = new RingHuffman(codeLengths), lengths: number[] = [];
    while (lengths.length < literalCount + distanceCount) {
        const symbol = codeTree.read(reader);
        if (symbol < 16) lengths.push(symbol);
        else {
            if (symbol === 16 && !lengths.length) throw new Error('Invalid RotateRings repeat');
            const value = symbol === 16 ? lengths[lengths.length - 1] : 0;
            const count = symbol === 16 ? reader.read(2) + 3 : symbol === 17 ? reader.read(3) + 3 : reader.read(7) + 11;
            if (lengths.length + count > literalCount + distanceCount) throw new Error('Invalid RotateRings tree size');
            for (let i = 0; i < count; i++) lengths.push(value);
        }
    }
    if (!lengths[256]) throw new Error('Missing RotateRings end symbol');
    return [new RingHuffman(lengths.slice(0, literalCount)), new RingHuffman(lengths.slice(literalCount))];
}

/** RRZ1: magic、原始长度、Adler32、raw-DEFLATE；严格检查长度、回溯距离和校验和。 */
export function unpackRingBytes(buffer: ArrayBuffer | Uint8Array): Uint8Array {
    const data = buffer instanceof Uint8Array ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new DataView(buffer);
    if (data.byteLength < 13 || data.getUint32(0, true) !== 0x315A5252) throw new Error('Invalid RotateRings pack header');
    const size = data.getUint32(4, true), checksum = data.getUint32(8, true);
    if (size > 2 * 1024 * 1024) throw new Error('RotateRings pack exceeds size limit');
    const result = new Uint8Array(size), reader = new RingBits(new Uint8Array(data.buffer, data.byteOffset + 12, data.byteLength - 12));
    let offset = 0, final = false;
    while (!final) {
        final = !!reader.read(1);
        const kind = reader.read(2);
        if (kind === 0) {
            reader.align(); const length = reader.read(16), inverse = reader.read(16);
            if ((length ^ inverse) !== 65535 || offset + length > size) throw new Error('Invalid RotateRings stored block');
            for (let i = 0; i < length; i++) result[offset++] = reader.read(8);
            continue;
        }
        if (kind === 3) throw new Error('Invalid RotateRings block type');
        const [literalTree, distanceTree] = trees(reader, kind === 1);
        for (;;) {
            const symbol = literalTree.read(reader);
            if (symbol === 256) break;
            if (symbol < 256) {
                if (offset >= size) throw new Error('RotateRings unpacked length overflow');
                result[offset++] = symbol; continue;
            }
            const index = symbol - 257;
            if (index < 0 || index >= LENGTH_BASE.length) throw new Error('Invalid RotateRings length symbol');
            const length = LENGTH_BASE[index] + reader.read(LENGTH_BITS[index]), distanceSymbol = distanceTree.read(reader);
            if (distanceSymbol >= DISTANCE_BASE.length) throw new Error('Invalid RotateRings distance symbol');
            const distance = DISTANCE_BASE[distanceSymbol] + reader.read(DISTANCE_BITS[distanceSymbol]);
            if (distance > offset || offset + length > size) throw new Error('Invalid RotateRings back reference');
            for (let i = 0; i < length; i++) { result[offset] = result[offset - distance]; offset++; }
        }
    }
    if (offset !== size || reader.offset !== reader.bytes.length) throw new Error('Invalid RotateRings unpacked length');
    let a = 1, b = 0;
    for (let start = 0; start < size; start += 5552) {
        for (let i = start; i < Math.min(size, start + 5552); i++) { a += result[i]; b += a; }
        a %= 65521; b %= 65521;
    }
    if (((b << 16 | a) >>> 0) !== checksum) throw new Error('RotateRings pack checksum mismatch');
    return result;
}

/** 合包只读取索引并引用压缩字节切片；当前关才解压，不展开其余网格。 */
export class RingPackArchive {
    private readonly records = new Map<number, Uint8Array>();
    readonly count: number;
    constructor(buffer: ArrayBuffer) {
        const data = new DataView(buffer);
        if (data.byteLength < 8 || data.getUint32(0, true) !== 0x31415252) throw new Error('Invalid RotateRings archive header');
        this.count = data.getUint32(4, true);
        if (!this.count || this.count > 4096 || 8 + this.count * 12 > data.byteLength) throw new Error('Invalid RotateRings archive count');
        let end = 8 + this.count * 12;
        for (let i = 0; i < this.count; i++) {
            const entry = 8 + i * 12, key = data.getUint32(entry, true), offset = data.getUint32(entry + 4, true), size = data.getUint32(entry + 8, true);
            if (this.records.has(key) || offset !== end || size < 13 || offset + size > data.byteLength) {
                throw new Error('Invalid RotateRings archive entry');
            }
            this.records.set(key, new Uint8Array(buffer, offset, size)); end = offset + size;
        }
        if (end !== data.byteLength) throw new Error('Unexpected RotateRings archive tail');
    }
    get(key: number): Uint8Array {
        const bytes = this.records.get(key);
        if (!bytes) throw new Error(`Missing RotateRings archive entry: ${key}`);
        return bytes;
    }
}

export function ringAscii(bytes: Uint8Array): string {
    let result = '';
    for (let start = 0; start < bytes.length; start += 4096) {
        const part = bytes.subarray(start, start + 4096);
        if (part.some(value => value > 127)) throw new Error('Invalid RotateRings pack text');
        result += String.fromCharCode.apply(null, Array.from(part));
    }
    return result;
}

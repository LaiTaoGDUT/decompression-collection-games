/** 原 Unity 烘焙网格的逐关二进制数据；Float32 和 Uint16 与原 GPU 格式一致。 */
export interface RingVisualMesh {
    vertices: number[]; indices: number[]; color: string;
    /** 每顶点 TX/TY/handedness，供原法线贴图转换到世界方向。 */
    tangents?: number[];
    /** 每顶点原路径总长/样式；负样式表示横向卡扣。 */
    paths?: number[];
}
export type RingLevelVisuals = Record<string, RingVisualMesh>;
export type RingVisualGeometry = Omit<RingVisualMesh, 'color'>;

/** 共享形状保留原 RRM2 顶点和索引的全部位，不量化、不改变网格拓扑。 */
export function decodeRingGeometry(bytes: Uint8Array): RingVisualGeometry {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (data.byteLength < 4) throw new Error('Truncated RotateRings geometry');
    const count = data.getUint16(0, true), indexCount = data.getUint16(2, true);
    if (!count || !indexCount || indexCount % 3 || data.byteLength !== 4 + count * 24 + indexCount * 2) {
        throw new Error('Invalid RotateRings geometry size');
    }
    const vertices: number[] = [], indices: number[] = [], tangents: number[] = [], paths: number[] = [];
    let offset = 4;
    for (let i = 0; i < count; i++, offset += 24) {
        const x = data.getFloat32(offset, true), y = data.getFloat32(offset + 4, true), u = data.getFloat32(offset + 8, true);
        const length = data.getFloat32(offset + 12, true), style = data.getInt8(offset + 23), hand = data.getInt8(offset + 22);
        if (![x, y, u, length].every(Number.isFinite) || length <= 0 || !style || Math.abs(hand) !== 1) {
            throw new Error('Invalid RotateRings geometry vertex');
        }
        vertices.push(x, y, u, data.getUint16(offset + 16, true) / 65535);
        tangents.push(data.getInt16(offset + 18, true) / 32767, data.getInt16(offset + 20, true) / 32767, hand);
        paths.push(length, style);
    }
    for (let i = 0; i < indexCount; i++, offset += 2) {
        const index = data.getUint16(offset, true);
        if (index >= count) throw new Error('Invalid RotateRings geometry triangle');
        indices.push(index);
    }
    return { vertices, indices, tangents, paths };
}

/** 一个小包仅保存64种形状；解包后只解码当前关实际引用的形状。 */
export class RingGeometryBank {
    private readonly records: Uint8Array[] = [];
    private readonly decoded = new Map<number, RingVisualGeometry>();
    readonly first: number;
    readonly count: number;
    constructor(bytes: Uint8Array) {
        const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (data.byteLength < 12 || data.getUint32(0, true) !== 0x33475252 || data.getUint16(10, true)) {
            throw new Error('Invalid RotateRings geometry bank header');
        }
        this.first = data.getUint32(4, true); this.count = data.getUint16(8, true);
        if (!this.count || this.count > 64 || this.first % 64) throw new Error('Invalid RotateRings geometry bank count');
        let offset = 12;
        for (let i = 0; i < this.count; i++) {
            if (offset + 4 > data.byteLength) throw new Error('Truncated RotateRings geometry bank');
            const length = data.getUint32(offset, true); offset += 4;
            if (length < 4 || offset + length > data.byteLength) throw new Error('Invalid RotateRings geometry record');
            this.records.push(bytes.subarray(offset, offset + length)); offset += length;
        }
        if (offset !== data.byteLength) throw new Error('Unexpected RotateRings geometry bank tail');
    }
    get(index: number): RingVisualGeometry {
        if (!Number.isInteger(index) || index < this.first || index >= this.first + this.count) throw new Error('Missing RotateRings geometry');
        const existing = this.decoded.get(index);
        if (existing) return existing;
        const geometry = decodeRingGeometry(this.records[index - this.first]); this.decoded.set(index, geometry); return geometry;
    }
}

export function decodeRingVisuals(buffer: ArrayBuffer): RingLevelVisuals {
    const data = new DataView(buffer), result: RingLevelVisuals = {};
    if (data.byteLength < 8) throw new Error('Invalid RotateRings mesh header');
    const format = data.getUint32(0, true), original = format === 0x324D5252;
    if (!original && format !== 0x314D5252) throw new Error('Invalid RotateRings mesh header');
    const count = data.getUint16(4, true); let offset = 8;
    if (count > 256) throw new Error('RotateRings mesh count exceeds the level limit');
    const need = (bytes: number) => { if (offset + bytes > data.byteLength) throw new Error('Truncated RotateRings mesh'); };
    for (let part = 0; part < count; part++) {
        need(1); const length = data.getUint8(offset++); need(length + 7);
        let id = ''; for (let i = 0; i < length; i++) id += String.fromCharCode(data.getUint8(offset++));
        if (!/^(ring_\d+|slide_bar_\d+)$/.test(id) || result[id]) throw new Error(`Invalid RotateRings mesh ID: ${id}`);
        let color = '#'; for (let i = 0; i < 3; i++) color += ('0' + data.getUint8(offset++).toString(16)).slice(-2).toUpperCase();
        const vertexCount = data.getUint16(offset, true), indexCount = data.getUint16(offset + 2, true); offset += 4;
        if (!vertexCount || indexCount % 3) throw new Error(`Invalid RotateRings mesh size: ${id}`);
        need(vertexCount * (original ? 24 : 16) + indexCount * 2);
        const vertices: number[] = [], indices: number[] = [], tangents: number[] = [], paths: number[] = [];
        for (let i = 0; i < vertexCount; i++) {
            const floats: number[] = [];
            for (let c = 0; c < 4; c++) {
                const value = data.getFloat32(offset, true); offset += 4;
                if (!Number.isFinite(value)) throw new Error(`Invalid RotateRings mesh vertex: ${id}`);
                floats.push(value);
            }
            if (original) {
                const v = data.getUint16(offset, true) / 65535;
                const tx = data.getInt16(offset + 2, true) / 32767, ty = data.getInt16(offset + 4, true) / 32767;
                const handedness = data.getInt8(offset + 6), style = data.getInt8(offset + 7); offset += 8;
                if (floats[3] <= 0 || Math.abs(handedness) !== 1 || !style) throw new Error(`Invalid RotateRings mesh path: ${id}`);
                vertices.push(floats[0], floats[1], floats[2], v); tangents.push(tx, ty, handedness); paths.push(floats[3], style);
            } else vertices.push(...floats);
        }
        for (let i = 0; i < indexCount; i++) {
            const index = data.getUint16(offset, true); offset += 2;
            if (index >= vertexCount) throw new Error(`Invalid RotateRings triangle: ${id}`); indices.push(index);
        }
        result[id] = original ? { vertices, indices, color, tangents, paths } : { vertices, indices, color };
    }
    if (offset !== data.byteLength) throw new Error('Unexpected RotateRings mesh tail');
    return result;
}

/** 选关与标题装饰用的 C 形环：按原网格的路径约定生成，交给同一陶瓷材质渲染。
 * 约定（对照原圆环网格）：环带可见宽 1 个 halfWidth，网格横向向外各多出一半由贴图透明裁边；路径两端各沿切线延伸 0.5 供圆头贴图；
 * v 由内（0）到外（1），切线沿 u 增加方向（逆时针），手性 -1；缺口中心朝向局部 +X。 */
export function createRingArcMesh(color: string, gapDeg = 100, radius = 1.75, halfWidth = .5, segments = 48): RingVisualMesh {
    const vertices: number[] = [], indices: number[] = [], tangents: number[] = [], paths: number[] = [];
    const cap = .5, start = gapDeg / 2 * Math.PI / 180, span = (360 - gapDeg) * Math.PI / 180;
    const length = radius * span + cap * 2, points: { x: number; y: number; tx: number; ty: number; u: number }[] = [];
    const along = (a: number) => ({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, tx: -Math.sin(a), ty: Math.cos(a) });
    const first = along(start), last = along(start + span);
    points.push({ x: first.x - first.tx * cap, y: first.y - first.ty * cap, tx: first.tx, ty: first.ty, u: 0 });
    for (let i = 0; i <= segments; i++) { const a = start + span * i / segments; points.push({ ...along(a), u: cap + radius * span * i / segments }); }
    points.push({ x: last.x + last.tx * cap, y: last.y + last.ty * cap, tx: last.tx, ty: last.ty, u: length });
    points.forEach((p, i) => {
        // 外法线 = 切线顺时针旋转 90°。
        const nx = p.ty, ny = -p.tx;
        vertices.push(p.x + nx * halfWidth, p.y + ny * halfWidth, p.u, 1, p.x - nx * halfWidth, p.y - ny * halfWidth, p.u, 0);
        tangents.push(p.tx, p.ty, -1, p.tx, p.ty, -1);
        paths.push(length, 2, length, 2);
        if (i) { const a = (i - 1) * 2, b = i * 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    });
    return { vertices, indices, color, tangents, paths };
}

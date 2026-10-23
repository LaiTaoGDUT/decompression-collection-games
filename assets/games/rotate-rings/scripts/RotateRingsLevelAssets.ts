import { BufferAsset } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import type { RingLevel, RingPart, RingPoint } from './RotateRingsTypes';
import { RingGeometryBank, type RingLevelVisuals } from './RotateRingsVisuals';
import { RingPackArchive, ringAscii, unpackRingBytes } from './RotateRingsPack';
import { ringSkinColor } from './RotateRingsTheme';

/** 进入时已由公共加载流程缓存全部压缩资源；本局按当前关需要解码，退出统一丢弃。 */
export class RotateRingsLevelAssets {
    private readonly banks = new Map<number, Promise<RingGeometryBank>>();
    private readonly archives = new Map<string, Promise<RingPackArchive>>();
    private disposed = false;
    private collisions?: Promise<RingPoint[][][]>;
    constructor(private readonly assets: AssetService, private readonly bundle: string, private readonly meshCount: number,
        private readonly collisionShapeCount: number) {}

    async load(id: number): Promise<{ level: RingLevel; visuals: RingLevelVisuals }> {
        if (this.disposed) throw new Error('RotateRings level assets disposed');
        const archive = await this.loadArchive('levels');
        if (this.disposed) throw new Error('RotateRings level assets disposed');
        const packed = JSON.parse(ringAscii(unpackRingBytes(archive.get(id)))) as [RingLevel, [string, number, number][]];
        if (!Array.isArray(packed) || packed.length !== 2 || packed[0]?.id !== id || !Array.isArray(packed[1]) || packed[1].length > 256) {
            throw new Error('Invalid RotateRings level pack');
        }
        const [level, refs] = packed, ids = new Set<string>();
        const collisions = await this.loadCollisions();
        if (this.disposed) throw new Error('RotateRings level assets disposed');
        for (const ring of level.rings as (RingPart & { bodyIndex?: number })[]) {
            const index = ring.bodyIndex;
            if (!Number.isInteger(index) || index! < 0 || index! >= collisions.length) throw new Error('Invalid RotateRings body reference');
            ring.bodyLocal = collisions[index!]; delete ring.bodyIndex;
        }
        for (const ref of refs) {
            if (!Array.isArray(ref) || ref.length !== 3 || !/^(ring_\d+|slide_bar_\d+)$/.test(ref[0]) || ids.has(ref[0])
                || !Number.isInteger(ref[1]) || ref[1] < 0 || ref[1] >= this.meshCount
                || !Number.isInteger(ref[2]) || ref[2] < 0 || ref[2] > 0xffffff) throw new Error('Invalid RotateRings mesh reference');
            ids.add(ref[0]);
        }
        const bankIds = Array.from(new Set(refs.map(ref => Math.floor(ref[1] / 64))));
        const banks = await Promise.all(bankIds.map(index => this.loadBank(index)));
        if (this.disposed) throw new Error('RotateRings level assets disposed');
        // 只保留当前关所需的库和最近访问的少量库；压缩归档仍驻留，可离线重建被淘汰的库。
        const required = new Set(bankIds), limit = Math.max(8, required.size);
        for (const index of this.banks.keys()) {
            if (this.banks.size <= limit) break;
            if (!required.has(index)) this.banks.delete(index);
        }
        const visuals: RingLevelVisuals = {};
        refs.forEach(([name, index, color]) => {
            const geometry = banks[bankIds.indexOf(Math.floor(index / 64))].get(index);
            visuals[name] = { ...geometry, color: ringSkinColor('#' + ('000000' + color.toString(16)).slice(-6).toUpperCase()) };
        });
        return { level, visuals };
    }

    dispose(): void { this.disposed = true; this.banks.clear(); this.archives.clear(); this.collisions = undefined; }

    private loadArchive(kind: 'levels' | 'geometry'): Promise<RingPackArchive> {
        const existing = this.archives.get(kind); if (existing) return existing;
        const promise = this.assets.loadAsset(this.bundle, `configs/${kind}`, BufferAsset).then(asset => {
            if (this.disposed) throw new Error('RotateRings level assets disposed');
            return new RingPackArchive(asset.buffer());
        });
        this.archives.set(kind, promise);
        void promise.catch(() => { if (this.archives.get(kind) === promise) this.archives.delete(kind); });
        return promise;
    }

    private loadCollisions(): Promise<RingPoint[][][]> {
        if (this.collisions) return this.collisions;
        const promise = this.assets.loadAsset(this.bundle, 'configs/collisions', BufferAsset).then(asset => {
            if (this.disposed) throw new Error('RotateRings level assets disposed');
            const shapes = JSON.parse(ringAscii(unpackRingBytes(asset.buffer()))) as RingPoint[][][];
            if (!Array.isArray(shapes) || shapes.length !== this.collisionShapeCount || shapes.some(shape =>
                !Array.isArray(shape) || !shape.length || shape.length > 8 || shape.some(poly => !Array.isArray(poly)
                    || poly.length < 3 || poly.length > 256 || poly.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))))) {
                throw new Error('Invalid RotateRings collision shapes');
            }
            return shapes;
        });
        this.collisions = promise;
        void promise.catch(() => { if (this.collisions === promise) this.collisions = undefined; });
        return promise;
    }

    private loadBank(index: number): Promise<RingGeometryBank> {
        const existing = this.banks.get(index);
        if (existing) {
            this.banks.delete(index); this.banks.set(index, existing);
            return existing;
        }
        const promise = this.loadArchive('geometry').then(archive => {
            if (this.disposed) throw new Error('RotateRings level assets disposed');
            const bank = new RingGeometryBank(unpackRingBytes(archive.get(index)));
            if (bank.first !== index * 64 || bank.count !== Math.min(64, this.meshCount - bank.first)) {
                throw new Error('RotateRings geometry bank mismatch');
            }
            return bank;
        });
        this.banks.set(index, promise);
        void promise.catch(() => { if (this.banks.get(index) === promise) this.banks.delete(index); });
        return promise;
    }
}

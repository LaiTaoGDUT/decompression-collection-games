import { _decorator, Material, Sprite, SpriteFrame } from 'cc';

const { ccclass } = _decorator;
const assembler = {
    createData(sprite: CityBloxxRainBatch) {
        const data = sprite.requestRenderData(), count = sprite.capacity * 4;
        data.dataLength = count; data.resize(count, sprite.capacity * 6);
        const indices = new Uint16Array(sprite.capacity * 6);
        for (let i = 0; i < sprite.capacity; i++) {
            const v = i * 4, j = i * 6;
            indices[j] = v; indices[j + 1] = v + 1; indices[j + 2] = v + 2;
            indices[j + 3] = v + 1; indices[j + 4] = v + 3; indices[j + 5] = v + 2;
        }
        data.chunk.setIndexBuffer(indices);
        for (let i = 0; i < indices.length; i++) indices[i] += data.chunk.vertexOffset;
        sprite.indexRanges = Array.from({ length: sprite.capacity + 1 }, (_, n) => indices.subarray(0, n * 6));
        return data;
    },
    updateUVs() {},
    updateColor() {},
    updateRenderData(sprite: CityBloxxRainBatch) {
        if (sprite.spriteFrame) sprite.renderData?.updateRenderData(sprite, sprite.spriteFrame);
    },
    fillBuffers(sprite: CityBloxxRainBatch) {
        const data = sprite.renderData, frame = sprite.spriteFrame;
        if (!data || !frame || !sprite.count) return;
        const vb = data.chunk.vb, stride = data.floatStride, m = sprite.node.worldMatrix;
        const values = sprite.vertices, uv = frame.uv, opacity = sprite.node._uiProps.opacity;
        // All rain shares one transform/material and per-vertex alpha.
        for (let i = 0; i < sprite.count * 4; i++) {
            const a = i * 6, b = i * stride, u = (i % 4) * 2, x = values[a], y = values[a + 1];
            vb[b] = m.m00 * x + m.m04 * y + m.m12;
            vb[b + 1] = m.m01 * x + m.m05 * y + m.m13;
            vb[b + 2] = m.m02 * x + m.m06 * y + m.m14;
            vb[b + 3] = uv[u]; vb[b + 4] = uv[u + 1];
            vb[b + 5] = values[a + 2]; vb[b + 6] = values[a + 3]; vb[b + 7] = values[a + 4];
            vb[b + 8] = values[a + 5] * opacity;
        }
        data.vertDirty = false;
        const buffer = data.chunk.meshBuffer, indices = sprite.indexRanges[sprite.count];
        buffer.iData.set(indices, buffer.indexOffset); buffer.indexOffset += indices.length;
    },
};

/** Camera-local rain quads in one UI renderer; Cocos owns/recycles the GPU buffer. */
@ccclass('CityBloxxRainBatch')
export class CityBloxxRainBatch extends Sprite {
    capacity = 1;
    count = 0;
    vertices = new Float32Array(24);
    indexRanges: Uint16Array[] = [];
    configure(capacity: number, frame: SpriteFrame, material: Material): void {
        // Cocos 3.8.8 vertex-opacity mode prevents uniform Sprite opacity from
        // overwriting each drop's lifetime fade after fillBuffers().
        this._useVertexOpacity = true;
        this.capacity = capacity; this.vertices = new Float32Array(capacity * 24);
        this.sizeMode = Sprite.SizeMode.CUSTOM;
        this.destroyRenderData(); this.customMaterial = material; this.spriteFrame = frame;
        this._flushAssembler(); this.markForUpdateRenderData();
    }
    quad(x: number, y: number, dx: number, dy: number, length: number, thickness: number, color: number[]): void {
        const norm = Math.max(.000001, Math.hypot(dx, dy)), ux = dx / norm, uy = dy / norm;
        const lx = ux * length / 2, ly = uy * length / 2, tx = -uy * thickness / 2, ty = ux * thickness / 2;
        const r = Math.round(color[0] * 255) / 255, g = Math.round(color[1] * 255) / 255;
        const b = Math.round(color[2] * 255) / 255, a = Math.round(color[3] * 255) / 255;
        for (let corner = 0; corner < 4; corner++) {
            const side = corner % 2 ? 1 : -1, edge = corner < 2 ? -1 : 1, i = this.count * 24 + corner * 6;
            this.vertices[i] = x + side * lx + edge * tx; this.vertices[i + 1] = y + side * ly + edge * ty;
            this.vertices[i + 2] = r; this.vertices[i + 3] = g; this.vertices[i + 4] = b; this.vertices[i + 5] = a;
        }
        this.count++;
    }
    protected _flushAssembler(): void {
        this._assembler = assembler;
        if (!this.renderData) {
            const data = assembler.createData(this); data.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData();
        }
    }
    onDestroy(): void { this.vertices = new Float32Array(0); this.indexRanges.length = 0; super.onDestroy(); }
}

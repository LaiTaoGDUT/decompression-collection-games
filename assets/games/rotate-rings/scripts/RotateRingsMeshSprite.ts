import { _decorator, gfx, Material, RenderData, Sprite, SpriteFrame } from 'cc';

import type { RingVisualMesh } from './RotateRingsVisuals';
const { ccclass } = _decorator;

/** 原路径 UV 与切线使用独立顶点属性，仍由 Cocos UI 批处理持有并释放缓冲。 */
const VERTEX_FORMAT = [
    new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F),
    new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD, gfx.Format.RG32F),
    new gfx.Attribute(gfx.AttributeName.ATTR_COLOR, gfx.Format.RGBA32F),
    new gfx.Attribute(gfx.AttributeName.ATTR_TANGENT, gfx.Format.RGBA32F),
    new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD1, gfx.Format.RG32F),
];
const assembler = {
    createData(sprite: RotateRingsMeshSprite) {
        const data = sprite.requestRenderData(), count = sprite.mesh?.vertices.length / 4 || 4;
        data.dataLength = count; data.resize(count, sprite.mesh?.indices.length || 6);
        data.chunk.setIndexBuffer(Uint16Array.from(sprite.mesh?.indices || [0, 1, 2, 1, 3, 2]));
        return data;
    },
    updateUVs(sprite: RotateRingsMeshSprite) {
        const data = sprite.renderData, frame = sprite.spriteFrame, mesh = sprite.mesh;
        if (!data || !frame || !mesh) return;
        const vb = data.chunk.vb, stride = data.floatStride;
        for (let i = 0; i < data.dataLength; i++) {
            const u = mesh.vertices[i * 4 + 2], v = mesh.vertices[i * 4 + 3], o = i * stride;
            vb[o + 3] = u; vb[o + 4] = v;
            vb[o + 13] = mesh.paths?.[i * 2] ?? 1;
            vb[o + 14] = mesh.paths?.[i * 2 + 1] ?? 1;
        }
    },
    updateColor(sprite: RotateRingsMeshSprite) {
        const data = sprite.renderData; if (!data) return;
        const vb = data.chunk.vb, c = sprite.color;
        for (let i = 0; i < data.dataLength; i++) {
            const o = i * data.floatStride + 5;
            vb[o] = c.r / 255; vb[o + 1] = c.g / 255; vb[o + 2] = c.b / 255; vb[o + 3] = c.a / 255;
        }
    },
    updateRenderData(sprite: RotateRingsMeshSprite) {
        const data = sprite.renderData, frame = sprite.spriteFrame, mesh = sprite.mesh;
        if (!data || !frame || !mesh) return;
        if (data.vertDirty) {
            for (let i = 0; i < data.dataLength; i++) {
                data.data[i].x = mesh.vertices[i * 4]; data.data[i].y = mesh.vertices[i * 4 + 1];
            }
            assembler.updateUVs(sprite); assembler.updateColor(sprite);
        }
        data.updateRenderData(sprite, frame);
    },
    fillBuffers(sprite: RotateRingsMeshSprite) {
        const data = sprite.renderData, mesh = sprite.mesh; if (!data || !mesh) return;
        const chunk = data.chunk, vb = chunk.vb, matrix = sprite.node.worldMatrix;
        const flip = matrix.m00 * matrix.m05 - matrix.m01 * matrix.m04 < 0 ? -1 : 1;
        for (let i = 0; i < data.dataLength; i++) {
            const p = data.data[i], o = i * data.floatStride;
            vb[o] = matrix.m00 * p.x + matrix.m04 * p.y + matrix.m12;
            vb[o + 1] = matrix.m01 * p.x + matrix.m05 * p.y + matrix.m13;
            vb[o + 2] = matrix.m02 * p.x + matrix.m06 * p.y + matrix.m14;
            // 原卡扣横梁 Z=-0.001（7769 个源网格已校验），在 Unity 中位于圆环前面。
            // Cocos UI 相机反向观察，保留这个深度差，避免后绘制的圆环遮住卡扣。
            if ((mesh.paths?.[i * 2 + 1] ?? 1) < 0) vb[o + 2] += .001 * Math.hypot(matrix.m00, matrix.m01);
            const tx = mesh.tangents?.[i * 3] ?? 1, ty = mesh.tangents?.[i * 3 + 1] ?? 0;
            const wx = matrix.m00 * tx + matrix.m04 * ty, wy = matrix.m01 * tx + matrix.m05 * ty;
            const length = Math.max(.00001, Math.hypot(wx, wy));
            vb[o + 9] = wx / length; vb[o + 10] = wy / length; vb[o + 11] = 0;
            vb[o + 12] = (mesh.tangents?.[i * 3 + 2] ?? -1) * flip;
        }
        data.vertDirty = false;
        const buffer = chunk.meshBuffer;
        for (let i = 0; i < mesh.indices.length; i++) buffer.iData[buffer.indexOffset + i] = chunk.vertexOffset + mesh.indices[i];
        buffer.indexOffset += mesh.indices.length;
    },
};

@ccclass('RotateRingsMeshSprite')
export class RotateRingsMeshSprite extends Sprite {
    mesh?: RingVisualMesh;
    configure(mesh: RingVisualMesh, frame: SpriteFrame, material: Material): void {
        if (!mesh.paths || !mesh.tangents) throw new Error('RotateRings original path/tangent data is missing');
        this.mesh = mesh; this.sizeMode = Sprite.SizeMode.CUSTOM;
        this.destroyRenderData(); this.customMaterial = material;
        this.spriteFrame = frame; this._flushAssembler(); this.markForUpdateRenderData();
    }
    public requestRenderData(): RenderData {
        const data = RenderData.add(VERTEX_FORMAT); data.initRenderDrawInfo(this);
        this._renderData = data; return data;
    }
    protected _flushAssembler(): void {
        this._assembler = assembler;
        if (!this.renderData) {
            const data = this._renderData = assembler.createData(this);
            data.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData(); assembler.updateUVs(this); assembler.updateColor(this);
        }
    }
    onDestroy(): void { this.mesh = undefined; super.onDestroy(); }
}

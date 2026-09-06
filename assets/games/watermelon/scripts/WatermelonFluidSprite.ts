import {
    _decorator,
    Color,
    RenderData,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import { CAT_TOKEN_VISIBLE_DIAMETER_RATIO } from './FruitCatalog';

const { ccclass } = _decorator;
const POINT_COUNT = 18;
// melon-lab clips the texture with quadratic curves whose controls are the 18
// physics points. Sample each curve three times so the GPU mesh follows that
// smooth outline instead of exposing the solver's straight polygon edges.
const CURVE_SUBDIVISIONS = 3;
const RIM_VERTEX_COUNT = POINT_COUNT * CURVE_SUBDIVISIONS;
const VERTEX_COUNT = RIM_VERTEX_COUNT + 1;
const INDEX_COUNT = RIM_VERTEX_COUNT * 3;
const TAU = Math.PI * 2;

interface FluidRenderPoint {
    readonly x: number;
    readonly y: number;
}

interface FluidAssembler {
    createData(sprite: WatermelonFluidSprite): RenderData;
    updateRenderData(sprite: WatermelonFluidSprite): void;
    updateUVs(sprite: WatermelonFluidSprite): void;
    updateColor(sprite: WatermelonFluidSprite): void;
    fillBuffers(sprite: WatermelonFluidSprite): void;
}

/**
 * A Sprite-compatible UI renderer whose texture follows the solver's 18
 * controls through a smoothed 54-triangle fan. Its fixed-size buffers are
 * reused; soft-body updates only dirty the vertex positions, so this remains
 * friendly to the WeChat mini-game runtime.
 */
@ccclass('WatermelonFluidSprite')
export class WatermelonFluidSprite extends Sprite {
    private readonly fluidPoints: Array<{ x: number; y: number }> = [];
    private fluidUvFrame?: SpriteFrame;

    setFluidPoints(
        points: readonly FluidRenderPoint[],
        centerX = 0,
        centerY = 0,
    ): void {
        if (points.length !== POINT_COUNT) return;
        for (let index = 0; index < POINT_COUNT; index += 1) {
            const source = points[index];
            const target = this.fluidPoints[index];
            if (target) {
                target.x = source.x - centerX;
                target.y = source.y - centerY;
            } else {
                this.fluidPoints.push({
                    x: source.x - centerX,
                    y: source.y - centerY,
                });
            }
        }
        this.markForUpdateRenderData();
    }

    private ensureFluidPoints(): void {
        if (this.fluidPoints.length === POINT_COUNT) return;
        const transform = this.node.getComponent(UITransform);
        const radiusX = (transform?.width ?? 0) * CAT_TOKEN_VISIBLE_DIAMETER_RATIO / 2;
        const radiusY = (transform?.height ?? 0) * CAT_TOKEN_VISIBLE_DIAMETER_RATIO / 2;
        for (let index = this.fluidPoints.length; index < POINT_COUNT; index += 1) {
            const angle = TAU * index / POINT_COUNT;
            this.fluidPoints.push({
                x: Math.cos(angle) * radiusX,
                y: Math.sin(angle) * radiusY,
            });
        }
    }

    getFluidPoint(index: number): FluidRenderPoint {
        this.ensureFluidPoints();
        return this.fluidPoints[index];
    }

    writeSmoothedFluidPoint(index: number, target: { x: number; y: number }): void {
        const segment = Math.floor(index / CURVE_SUBDIVISIONS);
        const subdivision = index % CURVE_SUBDIVISIONS;
        const previous = this.getFluidPoint((segment + POINT_COUNT - 1) % POINT_COUNT);
        const control = this.getFluidPoint(segment);
        const next = this.getFluidPoint((segment + 1) % POINT_COUNT);
        const t = (subdivision + 1) / CURVE_SUBDIVISIONS;
        const inverse = 1 - t;
        const startX = (previous.x + control.x) * 0.5;
        const startY = (previous.y + control.y) * 0.5;
        const endX = (control.x + next.x) * 0.5;
        const endY = (control.y + next.y) * 0.5;
        target.x = inverse * inverse * startX + 2 * inverse * t * control.x + t * t * endX;
        target.y = inverse * inverse * startY + 2 * inverse * t * control.y + t * t * endY;
    }

    needsFluidUvUpdate(frame: SpriteFrame): boolean {
        return this.fluidUvFrame !== frame;
    }

    markFluidUvsUpdated(frame: SpriteFrame): void {
        this.fluidUvFrame = frame;
    }

    protected _flushAssembler(): void {
        const assembler = fluidSpriteAssembler;
        if (this._assembler !== assembler) {
            this.destroyRenderData();
            this._assembler = assembler;
        }
        if (!this._renderData) {
            this._renderData = assembler.createData(this);
            this._renderData.material = this.getRenderMaterial(0);
            this.markForUpdateRenderData();
            assembler.updateUVs(this);
            this._updateColor();
        }
    }
}

function sampleQuadraticRim(
    previous: FluidRenderPoint,
    control: FluidRenderPoint,
    next: FluidRenderPoint,
    t: number,
): FluidRenderPoint {
    const startX = (previous.x + control.x) * 0.5;
    const startY = (previous.y + control.y) * 0.5;
    const endX = (control.x + next.x) * 0.5;
    const endY = (control.y + next.y) * 0.5;
    const inverse = 1 - t;
    return {
        x: inverse * inverse * startX + 2 * inverse * t * control.x + t * t * endX,
        y: inverse * inverse * startY + 2 * inverse * t * control.y + t * t * endY,
    };
}

function getRestControlPoint(index: number): FluidRenderPoint {
    const angle = TAU * index / POINT_COUNT;
    return { x: Math.cos(angle), y: Math.sin(angle) };
}

function getSmoothedRestPoint(index: number): FluidRenderPoint {
    const segment = Math.floor(index / CURVE_SUBDIVISIONS);
    const subdivision = index % CURVE_SUBDIVISIONS;
    return sampleQuadraticRim(
        getRestControlPoint((segment + POINT_COUNT - 1) % POINT_COUNT),
        getRestControlPoint(segment),
        getRestControlPoint((segment + 1) % POINT_COUNT),
        (subdivision + 1) / CURVE_SUBDIVISIONS,
    );
}

function updateWorldVertices(sprite: WatermelonFluidSprite): void {
    const renderData = sprite.renderData;
    if (!renderData) return;
    const vertices = renderData.chunk.vb;
    const data = renderData.data;
    const matrix = sprite.node.worldMatrix;
    const stride = renderData.floatStride;
    for (let index = 0; index < data.length; index += 1) {
        const x = data[index].x;
        const y = data[index].y;
        let reciprocalW = matrix.m03 * x + matrix.m07 * y + matrix.m15;
        reciprocalW = reciprocalW ? 1 / reciprocalW : 1;
        const offset = index * stride;
        vertices[offset] = (matrix.m00 * x + matrix.m04 * y + matrix.m12) * reciprocalW;
        vertices[offset + 1] = (matrix.m01 * x + matrix.m05 * y + matrix.m13) * reciprocalW;
        vertices[offset + 2] = (matrix.m02 * x + matrix.m06 * y + matrix.m14) * reciprocalW;
    }
}

function interpolate(
    bottomLeft: number,
    bottomRight: number,
    topLeft: number,
    topRight: number,
    x: number,
    y: number,
): number {
    const bottom = bottomLeft + (bottomRight - bottomLeft) * x;
    const top = topLeft + (topRight - topLeft) * x;
    return bottom + (top - bottom) * y;
}

const fluidSpriteAssembler: FluidAssembler = {
    createData(sprite: WatermelonFluidSprite): RenderData {
        const renderData = sprite.requestRenderData();
        renderData.dataLength = VERTEX_COUNT;
        renderData.resize(VERTEX_COUNT, INDEX_COUNT);
        const indices = new Uint16Array(INDEX_COUNT);
        for (let index = 0; index < RIM_VERTEX_COUNT; index += 1) {
            const offset = index * 3;
            indices[offset] = 0;
            indices[offset + 1] = index + 1;
            indices[offset + 2] = ((index + 1) % RIM_VERTEX_COUNT) + 1;
        }
        renderData.chunk.setIndexBuffer(indices);
        return renderData;
    },

    updateRenderData(sprite: WatermelonFluidSprite): void {
        const renderData = sprite.renderData;
        const frame = sprite.spriteFrame;
        if (!renderData || !frame) return;
        if (sprite.needsFluidUvUpdate(frame)) {
            this.updateUVs(sprite);
        }
        if (renderData.vertDirty) {
            const data = renderData.data;
            data[0].x = 0;
            data[0].y = 0;
            for (let index = 0; index < RIM_VERTEX_COUNT; index += 1) {
                sprite.writeSmoothedFluidPoint(index, data[index + 1]);
            }
        }
        renderData.updateRenderData(sprite, frame);
    },

    updateUVs(sprite: WatermelonFluidSprite): void {
        const renderData = sprite.renderData;
        const frame = sprite.spriteFrame;
        if (!renderData || !frame) return;
        const source = frame.uv;
        const vertices = renderData.chunk.vb;
        const stride = renderData.floatStride;
        const writeUv = (index: number, x: number, y: number): void => {
            const offset = index * stride + 3;
            vertices[offset] = interpolate(source[0], source[2], source[4], source[6], x, y);
            vertices[offset + 1] = interpolate(source[1], source[3], source[5], source[7], x, y);
        };
        writeUv(0, 0.5, 0.5);
        for (let index = 0; index < RIM_VERTEX_COUNT; index += 1) {
            const point = getSmoothedRestPoint(index);
            writeUv(
                index + 1,
                0.5 + point.x * CAT_TOKEN_VISIBLE_DIAMETER_RATIO / 2,
                0.5 + point.y * CAT_TOKEN_VISIBLE_DIAMETER_RATIO / 2,
            );
        }
        sprite.markFluidUvsUpdated(frame);
    },

    updateColor(sprite: WatermelonFluidSprite): void {
        const renderData = sprite.renderData;
        if (!renderData) return;
        const vertices = renderData.chunk.vb;
        const stride = renderData.floatStride;
        const color: Readonly<Color> = sprite.color;
        for (let index = 0; index < VERTEX_COUNT; index += 1) {
            const offset = index * stride + 5;
            vertices[offset] = color.r / 255;
            vertices[offset + 1] = color.g / 255;
            vertices[offset + 2] = color.b / 255;
            vertices[offset + 3] = color.a / 255;
        }
    },

    fillBuffers(sprite: WatermelonFluidSprite): void {
        const renderData = sprite.renderData;
        if (!renderData) return;
        updateWorldVertices(sprite);
        renderData.vertDirty = false;
        const vertexOffset = renderData.chunk.vertexOffset;
        const meshBuffer = renderData.chunk.meshBuffer;
        const indices = meshBuffer.iData;
        let target = meshBuffer.indexOffset;
        for (let index = 0; index < RIM_VERTEX_COUNT; index += 1) {
            indices[target] = vertexOffset;
            indices[target + 1] = vertexOffset + index + 1;
            indices[target + 2] = vertexOffset + ((index + 1) % RIM_VERTEX_COUNT) + 1;
            target += 3;
        }
        meshBuffer.indexOffset += INDEX_COUNT;
    },
};

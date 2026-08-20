import type { LocalImageSelection } from '../../../core/types/CommonTypes';
import {
    type SlidingPuzzleCrop,
    type SlidingPuzzleCropResult,
} from './SlidingPuzzleTypes';

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const MAX_OFFSET = 1;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

/** 无渲染依赖的裁剪状态机；纹理采样由游戏入口按当前状态映射到 SpriteFrame。 */
export class SlidingPuzzleCropController {
    private selection?: LocalImageSelection;
    private crop: SlidingPuzzleCrop = Object.freeze({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
    });

    get hasSelection(): boolean {
        return this.selection !== undefined;
    }

    get currentSelection(): LocalImageSelection | undefined {
        return this.selection;
    }

    get currentCrop(): SlidingPuzzleCrop {
        return this.crop;
    }

    begin(selection: LocalImageSelection): void {
        this.releaseSelection();
        this.selection = selection;
        this.crop = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0 });
    }

    pan(deltaX: number, deltaY: number): SlidingPuzzleCrop {
        this.crop = Object.freeze({
            ...this.crop,
            offsetX: clamp(
                this.crop.offsetX + (Number.isFinite(deltaX) ? deltaX : 0),
                -MAX_OFFSET,
                MAX_OFFSET,
            ),
            offsetY: clamp(
                this.crop.offsetY + (Number.isFinite(deltaY) ? deltaY : 0),
                -MAX_OFFSET,
                MAX_OFFSET,
            ),
        });
        return this.crop;
    }

    zoom(delta: number): SlidingPuzzleCrop {
        this.crop = Object.freeze({
            ...this.crop,
            scale: Math.min(
                MAX_SCALE,
                Math.max(MIN_SCALE, this.crop.scale + (Number.isFinite(delta) ? delta : 0)),
            ),
        });
        return this.crop;
    }

    /**
     * 以预览区域内的锚点缩放。anchorX/anchorY 使用预览正方形的宽高归一化，
     * 中心为 0，左右/上下边缘分别约为 -0.5/0.5。缩放后会同步移动取景中心，
     * 让锚点下的原图内容保持在同一个屏幕位置。
     */
    zoomAt(
        delta: number,
        anchorX: number,
        anchorY: number,
        sourceWidth: number,
        sourceHeight: number,
    ): SlidingPuzzleCrop {
        const currentScale = this.crop.scale;
        const nextScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, currentScale + (Number.isFinite(delta) ? delta : 0)),
        );
        if (nextScale === currentScale) {
            return this.crop;
        }

        const width = Math.max(1, Number.isFinite(sourceWidth) ? sourceWidth : 1);
        const height = Math.max(1, Number.isFinite(sourceHeight) ? sourceHeight : 1);
        const shortestSide = Math.min(width, height);
        const currentCropSize = shortestSide / currentScale;
        const nextCropSize = shortestSide / nextScale;
        const currentAvailableX = Math.max(0, (width - currentCropSize) / 2);
        const currentAvailableY = Math.max(0, (height - currentCropSize) / 2);
        const nextAvailableX = Math.max(0, (width - nextCropSize) / 2);
        const nextAvailableY = Math.max(0, (height - nextCropSize) / 2);
        const currentCenterX = width / 2 + this.crop.offsetX * currentAvailableX;
        const currentCenterY = height / 2 + this.crop.offsetY * currentAvailableY;
        const safeAnchorX = clamp(Number.isFinite(anchorX) ? anchorX : 0, -0.5, 0.5);
        const safeAnchorY = clamp(Number.isFinite(anchorY) ? anchorY : 0, -0.5, 0.5);
        // 当前锚点对应的源图坐标：中心 + 锚点在当前裁切正方形中的偏移。
        // 下一缩放比例下反推新的中心，即可保持指针/手指下的内容不跳动。
        const nextCenterX = currentCenterX + safeAnchorX * (currentCropSize - nextCropSize);
        const nextCenterY = currentCenterY + safeAnchorY * (currentCropSize - nextCropSize);

        this.crop = Object.freeze({
            scale: nextScale,
            offsetX: nextAvailableX > 0
                ? clamp((nextCenterX - width / 2) / nextAvailableX, -MAX_OFFSET, MAX_OFFSET)
                : 0,
            offsetY: nextAvailableY > 0
                ? clamp((nextCenterY - height / 2) / nextAvailableY, -MAX_OFFSET, MAX_OFFSET)
                : 0,
        });
        return this.crop;
    }

    reset(): void {
        this.crop = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0 });
    }

    confirm(): SlidingPuzzleCropResult | null {
        if (!this.selection) {
            return null;
        }

        return Object.freeze({
            selection: this.selection,
            crop: this.crop,
        });
    }

    cancel(): void {
        this.releaseSelection();
        this.crop = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0 });
    }

    dispose(): void {
        this.cancel();
    }

    private releaseSelection(): void {
        const selection = this.selection;
        this.selection = undefined;
        try {
            selection?.release();
        } catch (error: unknown) {
            console.warn('[SlidingPuzzleCropController] Failed to release image.', error);
        }
    }
}

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

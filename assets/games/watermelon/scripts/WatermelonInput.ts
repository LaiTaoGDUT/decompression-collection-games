/** 只允许一个手指拥有当前投放手势；触摸取消永远不提交投放。 */
export class SinglePointerDropController {
    private activePointerId?: number;

    get hasActivePointer(): boolean {
        return this.activePointerId !== undefined;
    }

    start(pointerId: number, inputEnabled: boolean): boolean {
        if (!inputEnabled || this.activePointerId !== undefined) {
            return false;
        }

        this.activePointerId = pointerId;
        return true;
    }

    owns(pointerId: number): boolean {
        return this.activePointerId === pointerId;
    }

    finish(pointerId: number): boolean {
        if (!this.owns(pointerId)) {
            return false;
        }

        this.activePointerId = undefined;
        return true;
    }

    cancel(pointerId: number): boolean {
        return this.finish(pointerId);
    }

    reset(): void {
        this.activePointerId = undefined;
    }
}

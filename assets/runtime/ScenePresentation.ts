import { Director, director } from 'cc';

/** 场景入口公开就绪状态，运行层不依赖大厅或具体小游戏的组件类型。 */
export interface ScenePresentationEntry {
    readonly presentationReady: Promise<void>;
}

interface PendingFrame {
    readonly finish: () => void;
    readonly reject: (error: Error) => void;
}

/** 场景拥有的构建/绘制屏障；销毁时撤销绘制监听并终止未完成的初始化。 */
export class ScenePresentationGate {
    readonly ready: Promise<void>;
    private resolveReady!: () => void;
    private rejectReady!: (error: unknown) => void;
    private readonly pendingFrames = new Set<PendingFrame>();
    private settled = false;
    private disposed = false;

    constructor() {
        this.ready = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        // 单独预览场景时可能没有运行层等待这个 Promise。
        void this.ready.catch(() => {});
    }

    nextFrame(): Promise<void> {
        if (this.disposed) return Promise.reject(new Error('Scene presentation was disposed.'));
        return new Promise<void>((resolve, reject) => {
            const frame: PendingFrame = {
                finish: () => {
                    this.pendingFrames.delete(frame);
                    resolve();
                },
                reject,
            };
            this.pendingFrames.add(frame);
            director.once(Director.EVENT_AFTER_DRAW, frame.finish);
        });
    }

    complete(): void {
        if (this.settled || this.disposed) return;
        this.settled = true;
        this.resolveReady();
    }

    fail(error: unknown): void {
        if (this.settled) return;
        this.settled = true;
        this.rejectReady(error);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new Error('Scene presentation was disposed.');
        for (const frame of Array.from(this.pendingFrames)) {
            director.off(Director.EVENT_AFTER_DRAW, frame.finish);
            frame.reject(error);
        }
        this.pendingFrames.clear();
        this.fail(error);
    }
}

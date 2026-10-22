import { Canvas, Director, director, macro, ResolutionPolicy, screen, UITransform, view } from 'cc';
import type { DesignResolutionConfig } from '../app/AppConfig';
import type { PlatformLayoutInfo, ScreenOrientation, Unsubscribe } from '../core/types/CommonTypes';
import type { Platform } from '../platform/Platform';

/** 应用拥有屏幕方向；平台负责原生旋转，Cocos 负责画布和相机适配。 */
export class ScreenService {
    private orientation: ScreenOrientation = 'portrait';
    private queue: Promise<void> = Promise.resolve();
    private changing = false;
    private disposed = false;
    private readonly listeners = new Set<(layout: PlatformLayoutInfo) => void>();
    private readonly unsubscribeLayout: Unsubscribe;

    constructor(private readonly platform: Platform, private readonly design: DesignResolutionConfig) {
        this.unsubscribeLayout = platform.onLayoutChange(this.refresh);
        view.on('canvas-resize', this.refresh, this);
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.refresh, this);
    }

    get currentOrientation(): ScreenOrientation { return this.orientation; }

    subscribe(callback: (layout: PlatformLayoutInfo) => void): Unsubscribe {
        this.listeners.add(callback);
        return () => { this.listeners.delete(callback); };
    }

    setOrientation(orientation: ScreenOrientation): Promise<void> {
        const operation = this.queue.then(() => this.applyOrientation(orientation));
        // 失败不能阻断后续恢复竖屏或重试；所有原生请求仍按顺序完成。
        this.queue = operation.catch(() => {});
        return operation;
    }

    dispose(): void {
        this.disposed = true;
        this.unsubscribeLayout();
        view.off('canvas-resize', this.refresh, this);
        director.off(Director.EVENT_AFTER_SCENE_LAUNCH, this.refresh, this);
        this.listeners.clear();
    }

    private async applyOrientation(orientation: ScreenOrientation): Promise<void> {
        if (this.disposed) throw new Error('Screen service is disposed.');
        const short = Math.min(this.design.width, this.design.height);
        const long = Math.max(this.design.width, this.design.height);
        const width = orientation === 'landscape' ? long : short;
        const height = orientation === 'landscape' ? short : long;
        this.changing = true;
        try {
            await this.platform.setScreenOrientation(orientation, width);
            if (this.disposed) throw new Error('Screen service is disposed.');
            if (this.platform.id === 'web') {
                view.setOrientation(orientation === 'landscape'
                    ? macro.ORIENTATION_LANDSCAPE : macro.ORIENTATION_PORTRAIT);
            }
            // 原生 success 与窗口事件可能错开；以当前物理窗口同步渲染目标，兼容遗漏的 resize。
            const windowSize = screen.windowSize;
            director.root?.resize(windowSize.width, windowSize.height);
            view.setDesignResolutionSize(width, height, ResolutionPolicy.FIXED_WIDTH);
            this.orientation = orientation;
        } finally {
            this.changing = false;
            if (!this.disposed) this.refresh();
        }
    }

    private readonly refresh = (): void => {
        if (this.changing || this.disposed) return;
        // Canvas 会适配相机，但不会自动改写场景中保存的 UITransform 尺寸。
        // 同步屏幕 Canvas，避免常驻层的 Widget 在下一帧恢复为旧的竖屏尺寸。
        const size = view.getVisibleSize();
        for (const canvas of director.getScene()?.getComponentsInChildren(Canvas) ?? []) {
            if (!canvas.alignCanvasWithScreen || canvas.cameraComponent?.targetTexture) continue;
            canvas.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        }
        const layout = this.platform.getLayoutInfo();
        for (const listener of Array.from(this.listeners)) listener(layout);
    };
}

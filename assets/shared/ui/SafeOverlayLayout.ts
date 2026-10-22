import { type Node, UITransform, type Vec3, view } from 'cc';
import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';
import { calculateSafeContentBounds } from './PlatformSafeLayout';

interface ContentTransform {
    readonly node: Node;
    readonly position: Vec3;
    readonly scale: Vec3;
}

/** 公共弹窗整体等比缩小并居中到当前方向的安全内容矩形内；遮罩覆盖完整画布。 */
export class SafeOverlayLayout {
    private originals: ContentTransform[] = [];

    constructor(private readonly root: Node, private readonly excluded: readonly string[] = []) {}

    /** 绘制或重新布局前恢复原始变换，避免重复缩放累积。 */
    restore(): void {
        for (const item of this.originals) {
            if (!item.node.isValid) continue;
            item.node.setPosition(item.position);
            item.node.setScale(item.scale);
        }
        this.originals = [];
    }

    fit(layout?: PlatformLayoutInfo): void {
        const size = view.getVisibleSize();
        this.root.getComponent(UITransform)?.setContentSize(size.width, size.height);
        const safe = calculateSafeContentBounds(size.width, size.height, layout);
        let left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
        for (const node of this.root.children) {
            if (this.excluded.indexOf(node.name) >= 0) continue;
            const transform = node.getComponent(UITransform);
            if (!transform) continue;
            const position = node.position.clone(), scale = node.scale.clone();
            this.originals.push({ node, position, scale });
            left = Math.min(left, position.x - transform.anchorX * transform.width * scale.x);
            right = Math.max(right, position.x + (1 - transform.anchorX) * transform.width * scale.x);
            top = Math.max(top, position.y + (1 - transform.anchorY) * transform.height * scale.y);
            bottom = Math.min(bottom, position.y - transform.anchorY * transform.height * scale.y);
        }
        if (!this.originals.length) return;
        const scale = Math.min(1, Math.max(1, safe.width - 32) / Math.max(1, right - left),
            Math.max(1, safe.height - 32) / Math.max(1, top - bottom));
        const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
        for (const item of this.originals) {
            item.node.setScale(item.scale.x * scale, item.scale.y * scale, item.scale.z);
            item.node.setPosition((item.position.x - centerX) * scale + safe.centerX,
                (item.position.y - centerY) * scale + safe.centerY, item.position.z);
        }
    }
}

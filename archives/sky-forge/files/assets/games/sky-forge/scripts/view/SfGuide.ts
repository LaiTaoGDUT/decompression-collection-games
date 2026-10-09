import { Graphics, Node, Sprite, UITransform } from 'cc';
import { COLORS, cap, color, easeOutBack, node, opacity, pixelSprite, text, type UiContext } from './SfUi';

/** 引导最长停留时间；超时自动关闭，战斗继续。 */
const GUIDE_SECONDS = 6;

/**
 * 首次必杀充能完毕的引导：战斗暂停，屏幕中央出现手指双击动画与提示文字；
 * 玩家双击（由宿主处理并关闭引导、释放必杀）或超时后关闭。
 */
export class SfGuide {
    readonly root: Node;
    private readonly g: Graphics;
    private readonly hand: Sprite;
    private readonly handHeight: number;
    private time = 0;

    constructor(private readonly ui: UiContext, parent: Node, width: number, height: number, private readonly centerY: number) {
        this.root = node(parent, 'UltGuide', width, height);
        const veil = this.root.addComponent(Graphics);
        veil.fillColor = color('#020D18', 130);
        veil.rect(-width / 2, -height / 2, width, height);
        veil.fill();
        this.g = node(this.root, 'Ripples', 0, 0, 0, centerY).addComponent(Graphics);
        // 生图的手势插图：指尖在图片底部中间，对准波纹中心。
        this.hand = pixelSprite(ui, this.root, 'fx/guide-hand', 1, 0, centerY, 'Hand');
        this.handHeight = this.hand.node.getComponent(UITransform)!.height;
        text(ui, this.root, '必杀能量已充满', 0, centerY + 300, { size: 30, color: COLORS.gold, outline: 3 });
        text(ui, this.root, '双击屏幕 释放必杀技', 0, centerY + 246, { size: 44, color: COLORS.cream, outline: 3 });
        opacity(this.root, 0);
    }

    get done(): boolean { return this.time >= GUIDE_SECONDS; }

    update(dt: number): void {
        this.time += dt;
        opacity(this.root, 255 * cap(this.time / 0.25));
        // 每 1.2 秒一个循环：手指连点两下，每下扩散一圈波纹。
        const t = this.time % 1.2;
        const g = this.g;
        g.clear();
        for (const at of [0.1, 0.38]) {
            const k = (t - at) / 0.5;
            if (k < 0 || k > 1) continue;
            g.strokeColor = color(COLORS.gold, 230 * (1 - k));
            g.lineWidth = 6 * (1 - k) + 2;
            g.circle(0, 0, 30 + easeOutBack(k) * 70);
            g.stroke();
        }
        const press = [0.1, 0.38].some(at => t >= at && t < at + 0.12);
        // 按下时手势下沉并略微压扁，抬起时回弹。
        const k = press ? 0.94 : 1;
        this.hand.node.setScale(k, k * (press ? 0.96 : 1), 1);
        this.hand.node.setPosition(18, this.centerY + this.handHeight / 2 - 10 + (press ? -8 : 0));
    }

    dispose(): void { this.root.destroy(); }
}

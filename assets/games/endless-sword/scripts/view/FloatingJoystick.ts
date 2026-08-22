import { Color, EventTouch, Graphics, Layers, Node, UITransform, view } from 'cc';
import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';

/** 摇杆输出：方向为单位向量，magnitude 为 0～1 的速度比例（策划案 §6.2）。 */
export interface MoveInput {
    dirX: number;
    dirY: number;
    magnitude: number;
}

const BASE_RING = new Color(16, 24, 23, 110);
const BASE_EDGE = new Color(100, 214, 180, 150);
const KNOB_FILL = new Color(100, 214, 180, 170);

/**
 * 浮动虚拟摇杆（策划案 §6）：在游戏区按下处生成摇杆中心，
 * 拖动矢量决定移动方向与速度，松手停止。
 * 触摸捕获层位于世界之上、HUD 之下；开始页与暂停层的输入拦截会自然屏蔽它。
 */
export class FloatingJoystick {
    private readonly catcher: Node;
    private readonly baseNode: Node;
    private readonly knobNode: Node;
    private activeTouchId: number | null = null;
    private centerX = 0;
    private centerY = 0;
    private offsetX = 0;
    private offsetY = 0;

    constructor(parent: Node) {
        const visibleSize = view.getVisibleSize();

        this.catcher = new Node('TouchCatcher');
        this.catcher.layer = Layers.Enum.UI_2D;
        parent.addChild(this.catcher);
        this.catcher.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
        this.catcher.on(Node.EventType.TOUCH_START, this.handleStart, this);
        this.catcher.on(Node.EventType.TOUCH_MOVE, this.handleMove, this);
        this.catcher.on(Node.EventType.TOUCH_END, this.handleEnd, this);
        this.catcher.on(Node.EventType.TOUCH_CANCEL, this.handleEnd, this);

        this.baseNode = this.createCircle('JoystickBase', ENDLESS_SWORD_CONFIG.joystick.radius, BASE_RING, BASE_EDGE);
        parent.addChild(this.baseNode);
        this.knobNode = this.createCircle('JoystickKnob', 28, KNOB_FILL, undefined);
        parent.addChild(this.knobNode);
    }

    getMoveInput(): MoveInput {
        const { deadZone, radius } = ENDLESS_SWORD_CONFIG.joystick;
        const dx = this.offsetX;
        const dy = this.offsetY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (this.activeTouchId === null || length < deadZone) {
            return { dirX: 0, dirY: 0, magnitude: 0 };
        }
        return {
            dirX: dx / length,
            dirY: dy / length,
            magnitude: Math.min(length, radius) / radius,
        };
    }

    /** 暂停、重开、退出时丢弃未结束的触摸，避免恢复后带着残留位移。 */
    resetInput(): void {
        this.activeTouchId = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.baseNode.active = false;
        this.knobNode.active = false;
    }

    dispose(): void {
        this.catcher.targetOff(this);
        if (this.catcher.isValid) {
            this.catcher.destroy();
        }
        if (this.baseNode.isValid) {
            this.baseNode.destroy();
        }
        if (this.knobNode.isValid) {
            this.knobNode.destroy();
        }
    }

    private createCircle(name: string, radius: number, fill: Color, edge?: Color): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(radius * 2, radius * 2);
        const g = node.addComponent(Graphics);
        if (edge) {
            g.strokeColor = edge;
            g.lineWidth = 3;
            g.circle(0, 0, radius);
            g.stroke();
        }
        g.fillColor = fill;
        g.circle(0, 0, edge ? radius - 4 : radius);
        g.fill();
        node.active = false;
        return node;
    }

    /** UI 事件坐标原点在可视区左下角，转换为画布中心原点坐标。 */
    private toCanvasSpace(event: EventTouch): { x: number; y: number } {
        const location = event.getUILocation();
        const visibleSize = view.getVisibleSize();
        return {
            x: location.x - visibleSize.width / 2,
            y: location.y - visibleSize.height / 2,
        };
    }

    private handleStart(event: EventTouch): void {
        if (this.activeTouchId !== null) {
            return;
        }
        this.activeTouchId = event.getID();
        const point = this.toCanvasSpace(event);
        this.centerX = point.x;
        this.centerY = point.y;
        this.offsetX = 0;
        this.offsetY = 0;
        this.baseNode.setPosition(point.x, point.y, 0);
        this.knobNode.setPosition(point.x, point.y, 0);
        this.baseNode.active = true;
        this.knobNode.active = true;
    }

    private handleMove(event: EventTouch): void {
        if (event.getID() !== this.activeTouchId) {
            return;
        }
        const point = this.toCanvasSpace(event);
        const dx = point.x - this.centerX;
        const dy = point.y - this.centerY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const radius = ENDLESS_SWORD_CONFIG.joystick.radius;
        const scale = length > radius ? radius / length : 1;
        this.offsetX = dx * scale;
        this.offsetY = dy * scale;
        this.knobNode.setPosition(this.centerX + this.offsetX, this.centerY + this.offsetY, 0);
    }

    private handleEnd(event: EventTouch): void {
        if (event.getID() !== this.activeTouchId) {
            return;
        }
        this.resetInput();
    }
}

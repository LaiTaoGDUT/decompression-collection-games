import {
    Color,
    Graphics,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec2,
} from 'cc';
import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';

// 行序（策划案 §86）：图片第一行在顶部，从上到下依次为 向下/向左/向右/向上。
const ROW_DOWN = 0;
const ROW_LEFT = 1;
const ROW_RIGHT = 2;
const ROW_UP = 3;

/**
 * 玩家视图：正式序列帧行走动画（策划案 §86），资源缺失时回退几何占位。
 * 帧网格由代码从整张 Texture 切出（每帧 256×256），按移动方向选行、
 * 4 帧循环；停止时显示该方向第二帧（并拢姿态）。
 */
export class PlayerView {
    readonly node: Node;
    private readonly sprite?: Sprite;
    private readonly frames: SpriteFrame[][] = [];
    private currentRow = ROW_DOWN;
    private animTime = 0;
    private moving = false;

    constructor(parent: Node, texture?: Texture2D) {
        const node = new Node('Player');
        node.layer = parent.layer;
        parent.addChild(node);
        this.node = node;

        // 脚底椭圆阴影：先加入、排在角色图之前，保证渲染在身体下层。
        const shadow = new Node('Shadow');
        shadow.layer = node.layer;
        node.addChild(shadow);
        const shadowConfig = ENDLESS_SWORD_CONFIG.playerSprite;
        shadow.setPosition(0, shadowConfig.shadowOffsetY, 0);
        const shadowGraphics = shadow.addComponent(Graphics);
        const shadowColor = ENDLESS_SWORD_CONFIG.groundShadowColor;
        shadowGraphics.fillColor = new Color(
            shadowColor.red,
            shadowColor.green,
            shadowColor.blue,
            shadowColor.alpha,
        );
        shadowGraphics.ellipse(
            0,
            0,
            shadowConfig.shadowRadiusX,
            shadowConfig.shadowRadiusY,
        );
        shadowGraphics.fill();

        if (texture) {
            this.frames = buildFrames(texture);
            const body = new Node('Body');
            body.layer = node.layer;
            node.addChild(body);
            const config = ENDLESS_SWORD_CONFIG.playerSprite;
            body.addComponent(UITransform).setContentSize(config.displaySize, config.displaySize);
            this.sprite = body.addComponent(Sprite);
            this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.sprite.spriteFrame = this.frames[ROW_DOWN][0];
        } else {
            drawPlaceholder(node);
        }
    }

    /** 由移动系统每逻辑步喂入方向与速度比例；渲染帧驱动动画计时。 */
    setMotion(dirX: number, dirY: number, magnitude: number): void {
        this.moving = magnitude > 0;
        if (!this.moving) {
            this.animTime = 0;
            return;
        }
        this.currentRow = Math.abs(dirX) >= Math.abs(dirY)
            ? (dirX > 0 ? ROW_RIGHT : ROW_LEFT)
            : (dirY > 0 ? ROW_UP : ROW_DOWN);
    }

    tickAnimation(frameSeconds: number): void {
        if (!this.sprite) {
            return;
        }
        if (this.moving) {
            this.animTime += frameSeconds;
        }
        const config = ENDLESS_SWORD_CONFIG.playerSprite;
        const column = this.moving
            ? Math.floor(this.animTime * config.walkFramesPerSecond) % config.frameCount
            : config.idleFrameIndex;
        this.sprite.spriteFrame = this.frames[this.currentRow][column];
    }

    setWorldPosition(x: number, y: number): void {
        this.node.setPosition(x, y, 0);
    }

    destroy(): void {
        if (this.sprite?.isValid) {
            this.sprite.spriteFrame = null;
        }
        for (const row of this.frames) {
            for (const frame of row) {
                if (frame.isValid) {
                    frame.destroy();
                }
            }
        }
        this.frames.length = 0;
        if (this.node.isValid) {
            this.node.destroy();
        }
    }
}

/** 切出 4×4 帧：SpriteFrame.rect 原点在图像左上角，行序与图片直接对应。 */
function buildFrames(texture: Texture2D): SpriteFrame[][] {
    const config = ENDLESS_SWORD_CONFIG.playerSprite;
    const frames: SpriteFrame[][] = [];
    for (let row = 0; row < config.rowCount; row += 1) {
        const rowFrames: SpriteFrame[] = [];
        for (let column = 0; column < config.frameCount; column += 1) {
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(
                column * config.frameWidth,
                row * config.frameHeight,
                config.frameWidth,
                config.frameHeight,
            );
            frame.originalSize = new Size(config.frameWidth, config.frameHeight);
            frame.offset = new Vec2(0, 0);
            rowFrames.push(frame);
        }
        frames.push(rowFrames);
    }
    return frames;
}

/** 几何占位：青白道袍 + 金腰带 + 剑匣 + 灵气环。 */
function drawPlaceholder(node: Node): void {
    const g = node.addComponent(Graphics);
    g.strokeColor = new Color(100, 214, 180, 90);
    g.lineWidth = 2;
    g.circle(0, 0, 34);
    g.stroke();
    g.fillColor = new Color(40, 60, 52, 255);
    g.roundRect(-10, 8, 20, 28, 6);
    g.fill();
    g.fillColor = new Color(207, 232, 220, 255);
    g.circle(0, 0, 26);
    g.fill();
    g.fillColor = new Color(231, 198, 106, 255);
    g.rect(-26, -8, 52, 9);
    g.fill();
    g.strokeColor = new Color(16, 24, 23, 255);
    g.lineWidth = 3;
    g.circle(0, 0, 26);
    g.stroke();
}

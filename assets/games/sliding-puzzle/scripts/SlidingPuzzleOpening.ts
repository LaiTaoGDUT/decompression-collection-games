import { Color, Graphics, Mask, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import { calculateSlidingPuzzleTileSourceRect } from './SlidingPuzzleLayout';

const RETURN_START = 0.12;
const RETURN_DURATION = 0.48;
const RETURN_STAGGER_SPAN = 1.2;
const MAX_RETURN_STAGGER = 0.085;

interface OpeningBounds {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
}

interface OpeningPiece {
    readonly node: Node;
    readonly target: Node;
    readonly startX: number;
    readonly startY: number;
    readonly angle: number;
    readonly scale: number;
    readonly order: number;
}

function unit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * 碎片从实际屏幕四周之外逐块飞入模型已经生成的可解局面。
 * 只由游戏 update 推进，暂停不会遗留独立运行的 Tween 或计时器。
 */
export class SlidingPuzzleOpening {
    private readonly root: Node;
    private readonly frames: SpriteFrame[] = [];
    private readonly pieces: OpeningPiece[] = [];
    private readonly cellSize: number;
    private readonly stagger: number;
    private readonly duration: number;
    private disposed = false;
    private elapsed: number;

    constructor(
        board: Node,
        texture: Texture2D,
        crop: Rect,
        boardValues: readonly number[],
        tiles: ReadonlyMap<Node, number>,
        tileAreaSize: number,
        private readonly viewport: OpeningBounds,
        private readonly bounds: OpeningBounds,
        elapsedSeconds = 0,
    ) {
        const size = Math.sqrt(boardValues.length);
        this.cellSize = tileAreaSize / size;
        this.stagger = Math.min(MAX_RETURN_STAGGER, RETURN_STAGGER_SPAN / Math.max(1, tiles.size - 1));
        this.duration = RETURN_START + RETURN_DURATION + (tiles.size - 1) * this.stagger;
        this.elapsed = elapsedSeconds;
        this.root = new Node('OpeningPieces');
        this.root.layer = board.layer;
        this.root.setParent(board);
        // 飞行轨迹可以跨过屏幕边缘；可见部分仍避开顶栏、胶囊和底部安全区。
        const clipWidth = bounds.right - bounds.left;
        const clipHeight = bounds.top - bounds.bottom;
        const clipTransform = this.root.addComponent(UITransform);
        clipTransform.setContentSize(clipWidth, clipHeight);
        clipTransform.setAnchorPoint(-bounds.left / clipWidth, -bounds.bottom / clipHeight);
        const mask = this.root.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        const stencil = this.root.getComponent(Graphics)!;
        stencil.fillColor = Color.WHITE;
        stencil.rect(bounds.left, bounds.bottom, clipWidth, clipHeight);
        stencil.fill();

        const targets = new Map<number, { node: Node; order: number }>();
        tiles.forEach((index, node) => {
            targets.set(boardValues[index] - 1, { node, order: targets.size });
            node.active = false;
        });
        for (let index = 0; index < boardValues.length; index += 1) {
            const target = targets.get(index);
            // 只生成正式局面中存在的碎片，滑块空位不参与开局动画。
            if (!target) continue;
            const sourceX = -tileAreaSize / 2 + (index % size + 0.5) * this.cellSize;
            const sourceY = tileAreaSize / 2 - (Math.floor(index / size) + 0.5) * this.cellSize;
            const node = new Node(`OpeningPiece${index + 1}`);
            node.layer = board.layer;
            node.setParent(this.root);
            node.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
            // 飞行切片沿用正式棋盘的裁剪范围，落位后显示带木框的实际方块。
            const rect = calculateSlidingPuzzleTileSourceRect(crop.x, crop.y, crop.width, size, index);
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(rect.x, rect.y, rect.width, rect.height);
            frame.originalSize = new Size(rect.width, rect.height);
            this.frames.push(frame);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;

            const variation = ((index * 37 + 11) % 101) / 100;
            const direction = Math.hypot(sourceX, sourceY) > 1
                ? Math.atan2(sourceY, sourceX) + (variation - 0.5) * 0.6
                : index * 2.399963;
            const scale = 0.54 + variation * 0.12;
            const radius = this.cellSize * scale * Math.SQRT1_2 + 8;
            // 将真实屏幕矩形向外扩出整块的旋转半径，首帧连碎片边角也在屏外。
            const halfWidth = (viewport.right - viewport.left) / 2 + radius;
            const halfHeight = (viewport.top - viewport.bottom) / 2 + radius;
            const dx = Math.cos(direction);
            const dy = Math.sin(direction);
            const distance = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
            this.pieces.push({
                node,
                target: target.node,
                startX: (viewport.left + viewport.right) / 2 + dx * distance,
                startY: (viewport.top + viewport.bottom) / 2 + dy * distance,
                angle: (index % 2 === 0 ? 1 : -1) * (16 + variation * 20),
                scale,
                order: target.order,
            });
        }
        this.draw();
    }

    get elapsedSeconds(): number {
        return this.elapsed;
    }

    update(deltaTime: number): boolean {
        if (this.disposed) return true;
        this.elapsed += Math.max(0, Math.min(0.1, deltaTime));
        this.draw();
        return this.elapsed >= this.duration;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.root.active = false;
        this.pieces.forEach((piece) => {
            if (piece.target.isValid) piece.target.active = true;
            piece.node.getComponent(Sprite)!.spriteFrame = null;
        });
        this.root.destroy();
        this.frames.forEach((frame) => frame.destroy());
        this.frames.length = 0;
        this.pieces.length = 0;
    }

    private draw(): void {
        this.pieces.forEach((piece) => {
            const progress = unit((this.elapsed - RETURN_START - piece.order * this.stagger) / RETURN_DURATION);
            piece.node.active = progress < 1;
            piece.target.active = progress >= 1;
            if (progress >= 1) return;

            const ease = 1 - Math.pow(1 - progress, 3);
            const target = piece.target.position;
            const dx = target.x - piece.startX;
            const dy = target.y - piece.startY;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const arc = Math.sin(progress * Math.PI) * Math.min(56, distance * 0.12)
                * (piece.order % 2 === 0 ? 1 : -1);
            this.setPose(
                piece,
                piece.startX + dx * ease - dy / distance * arc,
                piece.startY + dy * ease + dx / distance * arc,
                piece.scale + (1 - piece.scale) * ease,
                piece.angle * (1 - ease),
            );
        });
    }

    private setPose(piece: OpeningPiece, x: number, y: number, scale: number, angle: number): void {
        piece.node.setPosition(x, y, 0);
        piece.node.setScale(scale, scale, 1);
        piece.node.angle = angle;
    }
}

import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import type { BubbleRegion } from './BubbleShooterRound';

const color = (hex: string): Color => new Color().fromHEX(hex);
/** Dark glass keeps the numerals legible over every backdrop; rim and record tint follow the region. */
const PALETTES = {
    cloud: { fill: '#4A2447D0', rim: '#F2B8D8', best: '#FFD7EA' },
    ocean: { fill: '#082C3AD0', rim: '#E6C987', best: '#F7D48D' },
    toy: { fill: '#4A3322D0', rim: '#E8B77C', best: '#FFD9A0' },
    magic: { fill: '#1A1235D8', rim: '#C8AF78', best: '#E4D2FF' },
} as const;

const HEIGHT = 80, RADIUS = 22, PAD = 14, ICON_COLUMN = 36, TEXT_X = PAD + ICON_COLUMN + 8, MIN_WIDTH = 150;
const SCORE_Y = 16, BEST_Y = -20, PULSE = .3;

/** In-play score capsule: fixed icon column, left-aligned numerals and a width that grows with digits. */
export class BubbleShooterScoreHUD {
    readonly root: Node;
    private readonly surface: Graphics;
    private readonly scoreIcon: Node;
    private readonly score: Label;
    private readonly best: Label;
    private readonly palette: typeof PALETTES[BubbleRegion];
    private width = 0;
    private pulseAge = 0;

    constructor(parent: Node, region: BubbleRegion, icons: readonly SpriteFrame[]) {
        this.palette = PALETTES[region];
        this.root = this.node('ScoreHUD', parent, MIN_WIDTH, HEIGHT);
        this.root.getComponent(UITransform)!.setAnchorPoint(0, .5);
        this.surface = this.node('Panel', this.root, MIN_WIDTH, HEIGHT).addComponent(Graphics);
        this.scoreIcon = this.icon('ScoreIcon', icons[0], 32, SCORE_Y);
        this.icon('BestIcon', icons[1], 26, BEST_Y);
        this.score = this.label('Score', SCORE_Y, 32, Color.WHITE);
        this.best = this.label('Best', BEST_Y, 22, color(this.palette.best));
    }

    /** The node score flights travel to. */
    get scoreTarget(): Node { return this.score.node; }

    set(score: number, best: number): void {
        this.score.string = String(score);
        this.best.string = String(best);
        const widths = [this.score, this.best].map(label => {
            label.updateRenderData(true);
            const width = label.node.getComponent(UITransform)!.width;
            label.node.setPosition(TEXT_X + width / 2, label.node.position.y);
            return width;
        });
        const width = Math.max(MIN_WIDTH, Math.ceil(TEXT_X + Math.max(...widths) + PAD + 4));
        if (width !== this.width) this.paint(width);
    }

    /** Places the capsule's left edge; it grows rightward as digits are added. */
    layout(left: number, y: number): void { this.root.setPosition(left, y); }

    pulse(): void { this.pulseAge = PULSE; }

    update(dt: number): void {
        if (this.pulseAge <= 0) return;
        this.pulseAge = Math.max(0, this.pulseAge - Math.max(0, Math.min(dt, .05)));
        const wave = Math.sin(this.pulseAge / PULSE * Math.PI);
        this.scoreIcon.setScale(1 + .22 * wave, 1 + .22 * wave, 1);
        this.score.node.setScale(1 + .1 * wave, 1 + .1 * wave, 1);
    }

    dispose(): void {
        this.root.getComponentsInChildren(Sprite).forEach(sprite => sprite.spriteFrame = null);
        this.root.destroy();
    }

    private paint(width: number): void {
        this.width = width;
        this.root.getComponent(UITransform)!.setContentSize(width, HEIGHT);
        const panel = this.surface.node;
        panel.getComponent(UITransform)!.setContentSize(width, HEIGHT);
        panel.setPosition(width / 2, 0);
        const g = this.surface, x = -width / 2, y = -HEIGHT / 2;
        g.clear();
        g.fillColor = color(this.palette.fill); g.roundRect(x, y, width, HEIGHT, RADIUS); g.fill();
        g.strokeColor = color(this.palette.rim + '8C'); g.lineWidth = 2; g.roundRect(x + 1, y + 1, width - 2, HEIGHT - 2, RADIUS - 1); g.stroke();
        // Soft top sheen and a hairline that separates the live score from the record.
        g.strokeColor = color('#FFFFFF2E'); g.lineWidth = 2;
        g.moveTo(x + RADIUS, HEIGHT / 2 - 5); g.lineTo(x + width - RADIUS, HEIGHT / 2 - 5); g.stroke();
        g.strokeColor = color(this.palette.rim + '40'); g.lineWidth = 1.5;
        g.moveTo(x + PAD, -3); g.lineTo(x + width - PAD, -3); g.stroke();
    }
    private icon(name: string, frame: SpriteFrame, height: number, y: number): Node {
        const n = this.node(name, this.root, height * frame.rect.width / frame.rect.height, height, PAD + ICON_COLUMN / 2, y);
        const sprite = n.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false; sprite.spriteFrame = frame;
        return n;
    }
    private label(name: string, y: number, size: number, tint: Color): Label {
        const l = this.node(name, this.root, 10, size + 8, TEXT_X, y).addComponent(Label);
        l.fontSize = size; l.lineHeight = size + 8; setLabelBold(l, true); l.color = tint;
        l.horizontalAlign = Label.HorizontalAlign.LEFT; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.NONE;
        return l;
    }
    private node(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(w, h); return n;
    }
}

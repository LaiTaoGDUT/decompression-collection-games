import { BlockInputEvents, Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import { setLabelBold } from '../../../services/font/FontBinding';
import { BubbleShooterModalArt, CAMPAIGN_MODAL_BOTTOM_PADDING, type BubbleShooterModalFrames } from './BubbleShooterModalArt';
import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import type { BubbleShooterCampaign } from './BubbleShooterCampaign';
import type { CampaignProgress } from './BubbleShooterCampaignSave';
import type { BubbleCampaignArtwork } from './BubbleShooterRegionAssets';
import type { BubbleRegion } from './BubbleShooterRound';

/** A regional game overlay: spring entrance, staggered stars, rolling shots and celebratory particles. */
export class BubbleShooterCampaignResultView {
    readonly root: Node;
    readonly content: Node;
    readonly motion: BubbleShooterModalMotion;
    private readonly art: BubbleShooterModalArt;
    private readonly shade: Graphics;
    private readonly title: Label;
    private readonly levelName: Label;
    private readonly starRow: Node;
    private readonly stars: Node[] = [];
    private readonly sparks: Graphics;
    private readonly failure: Label;
    private readonly retryArt: Node;
    private readonly shots: Label;
    private readonly best: Label;
    private readonly buttons: Node[] = [];
    private readonly captions: Label[] = [];
    private viewport = { width: 750, height: 1334, platform: undefined as PlatformLayoutInfo | undefined };
    private panelHeight = 1000;
    private age = 0;
    private starCount = 0;
    private shotsUsed = 0;
    private won = false;
    private enabled = true;
    private action?: (index: number) => void;
    private sounded = 0;

    constructor(parent: Node, region: BubbleRegion, frames: BubbleShooterModalFrames, artwork: BubbleCampaignArtwork,
        private readonly sound: () => void) {
        this.root = this.node('CampaignResultOverlay', parent, 750, 1334);
        this.root.addComponent(BlockInputEvents); this.shade = this.root.addComponent(Graphics);
        this.content = this.node('CampaignResultContent', this.root, 700, 1000);
        this.motion = new BubbleShooterModalMotion(this.root, this.content, .82, .68, true);
        this.art = new BubbleShooterModalArt(this.content, region, frames);
        const middleHeight = 640;
        this.panelHeight = this.art.topHeight + middleHeight + this.art.bottomHeight;
        const top = this.art.layout(middleHeight) + this.art.headerFace;
        this.title = this.label('Title', '', this.content, 0, top - 53, 474, 70, 46, this.art.ink);
        this.levelName = this.label('LevelName', '', this.content, 0, top - 111, 474, 40, 23, this.art.muted);
        this.starRow = this.node('Stars', this.content, 410, 128); this.starRow.setPosition(0, top - 212);
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * 120, y = i === 1 ? 12 : -2;
            const empty = this.picture('EmptyStar-' + i, artwork.icons.star, this.starRow, x, y, i === 1 ? 106 : 90);
            empty.getComponent(Sprite)!.color = new Color(134, 115, 149, 100);
            const star = this.picture('EarnedStar-' + i, artwork.icons.star, this.starRow, x, y, i === 1 ? 106 : 90);
            star.addComponent(UIOpacity); this.stars.push(star);
        }
        this.sparks = this.node('StarBursts', this.starRow, 540, 210).addComponent(Graphics);
        this.failure = this.label('Failure', '', this.content, 0, top - 239, 474, 42, 28, this.art.ink);
        this.retryArt = this.picture('RetryArt', artwork.icons.retry, this.content, 0, top - 195, 84);
        const well = this.node('ShotsWell', this.content, 474, 104); well.setPosition(0, top - 315);
        this.art.scoreWell(well.addComponent(Graphics), 474, 104);
        this.picture('ShotsIcon', artwork.icons.shots, well, -143, 0, 48);
        this.shots = this.label('ShotsUsed', '', well, 37, 0, 260, 62, 40, this.art.score);
        this.best = this.label('Best', '', this.content, 0, top - 391, 474, 36, 22, this.art.muted);
        for (let i = 0; i < 3; i++) {
            const button = this.art.button(['Primary', 'Retry', 'SelectLevels'][i], i === 0);
            button.setPosition(0, top - 476 - i * 100); button.addComponent(UIOpacity);
            this.captions.push(this.label('Text', '', button, 0, 0, 420, 62, i === 0 ? 34 : 28, i === 0 ? this.art.primaryInk : this.art.ink));
            button.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                if (!this.visible || !this.enabled || this.motion.moving || this.age < 1.1) return;
                this.sound(); this.runAction(i);
            }, this);
            this.buttons.push(button);
        }
        this.root.active = false;
    }
    get visible(): boolean { return this.root.active; }
    show(round: BubbleShooterCampaign, progress: CampaignProgress, action: (index: number) => void): void {
        this.action = action; this.age = this.sounded = 0;
        this.won = round.outcome === 'won'; this.starCount = round.stars; this.shotsUsed = round.shotsUsed;
        this.title.string = this.won ? '关卡完成！' : '再试一次';
        this.levelName.string = '第 ' + round.level.routeIndex + ' 关 · ' + round.level.name;
        this.starRow.active = this.won; this.failure.node.active = this.retryArt.active = !this.won;
        this.failure.string = round.failure === 'shots' ? '球数用完了' : round.failure === 'configuration' ? '暂时无法挑战' : '泡泡越线了';
        const record = progress.results[round.level.id];
        this.best.string = record?.bestShotsRevision === round.level.revision ? '最佳用球 ' + record.bestShotsUsed + ' 发' : '';
        this.best.node.active = !!this.best.string;
        this.captions[0].string = this.won ? (round.level.routeIndex === 120 ? '挑战无尽' : '下一关') : '再挑战';
        this.captions[1].string = this.won ? '再挑战' : '选择关卡';
        this.captions[2].string = this.won ? '选择关卡' : '返回';
        this.stars.forEach(n => { n.active = false; }); this.sparks.clear(); this.shots.string = '用了 0 发';
        this.reflow();
        this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.motion.open(); this.layout(this.viewport.width, this.viewport.height, this.viewport.platform);
    }
    update(dt: number): void {
        this.motion.update(dt); if (!this.visible) return;
        this.age += Math.max(0, Math.min(dt, .05));
        const count = Math.max(0, Math.min(1, (this.age - .5) / .55));
        this.shots.string = '用了 ' + Math.round(this.shotsUsed * (1 - Math.pow(1 - count, 3))) + ' 发';
        this.sparks.clear();
        for (let i = 0; i < this.starCount; i++) {
            const star = this.stars[i], t = Math.max(0, Math.min(1, (this.age - .38 - i * .22) / .42));
            star.active = t > 0;
            const u = t - 1, pop = 1 + 2.70158 * u * u * u + 1.70158 * u * u;
            star.setScale(Math.max(.01, pop), Math.max(.01, pop), 1);
            star.setPosition((i - 1) * 120, (i === 1 ? 12 : -2) + (1 - t) * 58);
            star.getComponent(UIOpacity)!.opacity = Math.min(255, t * 700);
            if (t >= .55 && this.sounded <= i) { this.sounded = i + 1; this.sound(); }
            if (t <= .3 || t >= 1) continue;
            const burst = (t - .3) / .7;
            this.sparks.fillColor = new Color(255, 222, 133, 255 * (1 - burst));
            for (let p = 0; p < 10; p++) {
                const a = p * Math.PI / 5 + i * .4, radius = 44 + burst * 70;
                this.sparks.circle((i - 1) * 120 + Math.cos(a) * radius, (i === 1 ? 12 : -2) + Math.sin(a) * radius, 2 + (1 - burst) * 3); this.sparks.fill();
            }
        }
        if (!this.won) this.retryArt.angle = this.age < .9 ? Math.sin(this.age * 18) * 8 * (1 - this.age / .9) : 0;
        this.buttons.forEach(n => { n.getComponent(UIOpacity)!.opacity = !this.enabled || this.age < 1.1 ? 170 : 255; });
    }
    private runAction(index: number): void {
        const action = this.action;
        // Hide before dispatch so repeated taps cannot submit the same result action twice.
        this.hide(); action?.(index);
    }
    private reflow(): void {
        const rows: {node: Node; height: number; gap: number}[] = [];
        const add=(node: Node, height: number, gap=0): void=>{if(node.active)rows.push({node,height,gap});};
        add(this.title.node,68);add(this.levelName.node,36);
        add(this.starRow,128,12);add(this.retryArt,84,12);add(this.failure.node,42,4);
        add(this.content.getChildByName('ShotsWell')!,104,10);add(this.best.node,32,8);
        this.buttons.forEach((node,i)=>add(node,node.getComponent(UITransform)!.height,i===0?22:14));
        const contentHeight=18+rows.reduce((sum,row)=>sum+row.height+row.gap,0)+CAMPAIGN_MODAL_BOTTOM_PADDING;
        // Both caps already contain plain face. Place controls on that face before adding middle space.
        const middleHeight=Math.max(0,contentHeight-this.art.headerFace-this.art.footerFace);
        this.panelHeight=this.art.topHeight+middleHeight+this.art.bottomHeight;
        this.content.getComponent(UITransform)!.setContentSize(700,this.panelHeight);
        let y=this.art.layout(middleHeight)+this.art.headerFace-18;
        for(const row of rows){y-=row.gap;row.node.setPosition(0,y-row.height/2);y-=row.height;}
    }
    layout(width: number, height: number, platform?: PlatformLayoutInfo): void {
        this.viewport = { width, height, platform }; const safe = calculateVerticalSafeBounds(height, platform);
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        this.shade.clear(); this.shade.fillColor = this.art.shade; this.shade.rect(-width / 2, -height / 2, width, height); this.shade.fill();
        this.motion.layout(Math.max(.001, Math.min(1, width / 750, (safe.topY - safe.bottomY - 28) / this.panelHeight)), (safe.topY + safe.bottomY) / 2);
    }
    hide(): void { this.motion.cancel(); this.root.active = false; this.action = undefined; this.sparks.clear(); }
    setEnabled(enabled: boolean): void { this.enabled=enabled; }
    dispose(): void { this.hide(); this.buttons.forEach(n => n.targetOff(this)); this.root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null); this.root.destroy(); }
    private node(name: string, parent: Node, width: number, height: number): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.addComponent(UITransform).setContentSize(width, height); return n;
    }
    private picture(name: string, frame: SpriteFrame, parent: Node, x: number, y: number, height: number): Node {
        const n = this.node(name, parent, height * frame.rect.width / frame.rect.height, height); n.setPosition(x, y);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame; return n;
    }
    private label(name: string, text: string, parent: Node, x: number, y: number, width: number, height: number, size: number, color: Color): Label {
        const n = this.node(name, parent, width, height); n.setPosition(x, y); const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 8; l.color = color; setLabelBold(l, true);
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK; return l;
    }
}

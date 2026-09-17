import type { BubbleShooterModalDecoration, BubbleShooterModalDecorationFactory } from './BubbleShooterOceanBoss';
import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import { BlockInputEvents, Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, instantiate } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';

import type { MiniGamePauseModel } from '../../../runtime/MiniGame';

export type EndPage = 'offer' | 'loading' | 'result' | 'pause';
const INK = new Color(58, 15, 57);

/** Neutral shared controls with independently replaceable region Boss layers. */
export class BubbleShooterEndView {
    readonly root: Node;
    readonly content: Node;
    readonly motion: BubbleShooterModalMotion;
    private decoration?: BubbleShooterModalDecoration;
    private page: EndPage = 'offer';
    private readonly shade: Graphics;
    private readonly title: Label;
    private readonly detail: Label;
    private readonly note: Label;
    private readonly icon: Node;
    private readonly video: Node;
    private readonly primary: Node;
    private readonly secondary: Node;
    private readonly tertiary: Node;
    private pauseModel?: MiniGamePauseModel;
    private generation = 0;
    private readonly primaryText: Label;
    private readonly secondaryText: Label;
    private enabled = true;
    private busy = false;
    private action?: (primary: boolean) => void;

    constructor(parent: Node, frames: ReadonlyMap<string, SpriteFrame>, boss: Node, private readonly onSound: () => void = () => {}) {
        this.root = this.node('EndOverlay', parent, 750, 1334);
        this.root.addComponent(BlockInputEvents);
        this.shade = this.root.addComponent(Graphics);
        this.content = this.node('EndContent', this.root, 700, 1120);
        this.motion = new BubbleShooterModalMotion(this.root, this.content);
        // Body/crown behind the panel, fists in front. Never bake region art into the base.
        const back = this.node('RegionBack', this.content, 700, 400);
        const clone = (name: string, parent: Node, x: number, y: number, scale: number): Node => {
            const n = instantiate(boss.getChildByName(name)!);
            n.setParent(parent); n.active = true; n.setPosition(x, y); n.setScale(scale, scale, 1);
            n.getComponent(UITransform)!.setAnchorPoint(.5, .5);
            n.getComponent(Sprite)!.trim = true;
            return n;
        };
        clone('Body', back, 0, 340, 1.04);
        clone('Crown', back, 0, 495, 1);
        this.sprite('Panel', this.content, frames.get('dialog-panel')!, 0, -95, 660, 670);
        const front = this.node('RegionFront', this.content, 700, 180);
        clone('LeftFist', front, -253, 259, .78);
        clone('RightFist', front, 253, 259, .78);
        this.title = this.label('Title', '再试一次？', this.content, 0, 161, 580, 78, 54);
        this.icon = this.node('ReviveIcon', this.content, 116, 116, 0, 54);
        const g = this.icon.addComponent(Graphics);
        g.fillColor = new Color(255, 228, 237); g.circle(0, 0, 57); g.fill();
        g.strokeColor = new Color(255, 25, 121); g.lineWidth = 11;
        for (let i = 0; i <= 48; i++) {
            const angle = (-.25 - 1.5 * i / 48) * Math.PI;
            const x = 29 * Math.cos(angle), y = 29 * Math.sin(angle);
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        // Arrowhead follows the clockwise tangent at the arc endpoint, with overlap.
        const end = Math.PI / 4, x = 29 * Math.cos(end), y = 29 * Math.sin(end);
        const tx = Math.sin(end), ty = -Math.cos(end), nx = Math.cos(end), ny = Math.sin(end);
        g.fillColor = g.strokeColor;
        g.moveTo(x + 12 * tx, y + 12 * ty);
        g.lineTo(x - 10 * tx + 12 * nx, y - 10 * ty + 12 * ny);
        g.lineTo(x - 10 * tx - 12 * nx, y - 10 * ty - 12 * ny);
        g.close(); g.fill();
        this.detail = this.label('Detail', '', this.content, 0, -48, 594, 83, 29);
        this.primary = this.sprite('Primary', this.content, frames.get('dialog-primary')!, 0, -173, 552, 110);
        const buttonContent = this.node('ButtonContent', this.primary, 0, 62);
        this.primaryText = this.label('Text', '', buttonContent, 0, 0, 450, 62, 42, Color.WHITE);
        this.primaryText.overflow = Label.Overflow.NONE;
        this.video = this.node('Video', buttonContent, 50, 40);
        const v = this.video.addComponent(Graphics);
        v.fillColor = Color.WHITE; v.roundRect(-25, -18, 50, 36, 7); v.fill();
        v.fillColor = new Color(255, 32, 124); v.moveTo(-5, -11); v.lineTo(12, 0); v.lineTo(-5, 11); v.close(); v.fill();
        this.note = this.label('Note', '', this.content, 0, -249, 614, 50, 24, new Color(126, 94, 129));
        this.secondary = this.sprite('Secondary', this.content, frames.get('dialog-secondary')!, 0, -334, 552, 92);
        this.secondaryText = this.label('Text', '', this.secondary, 0, 0, 510, 60, 38);
        this.tertiary = this.sprite('Exit', this.content, frames.get('dialog-secondary')!, 0, -325, 552, 92);
        this.label('Text', '返回大厅', this.tertiary, 0, 0, 510, 60, 38);
        this.tertiary.active = false;
        [this.primary, this.secondary, this.tertiary].forEach((node, i) => {
            node.addComponent(UIOpacity);
            node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                if (!this.enabled || this.busy || this.motion.moving || !this.root.active) return;
                this.onSound();
                if (this.pauseModel) void this.runPauseAction(i);
                else void this.runAction(i === 0);
            }, this);
        });
        this.root.active = false;
    }

    setRegionDecoration(factory?: BubbleShooterModalDecorationFactory): void {
        this.decoration?.dispose(); this.decoration = undefined;
        const back = this.content.getChildByName('RegionBack')!;
        const front = this.content.getChildByName('RegionFront')!;
        back.children.forEach(n => n.active = !factory);
        front.children.forEach(n => n.active = !factory);
        if (factory) this.decoration = factory(back, front);
        this.decoration?.layout(this.page === 'result' ? 660 : 580);
    }

    get visible(): boolean { return this.root.active; }
    show(page: EndPage, action: (primary: boolean) => void, message = ''): void {
        if (!this.root.active) this.motion.open();
        if (this.root.active && this.page !== page && !this.motion.moving) this.motion.open();
        this.page = page;
        this.action = action; this.busy = page === 'loading'; this.root.active = true;
        const result = page === 'result', pause = page === 'pause';
        // Size the shared controls for each page without distorting text or corner caps.
        const compact = !result;
        this.content.getChildByName('Panel')!.getComponent(UITransform)!
            .setContentSize(compact ? 580 : 660, 670);
        this.decoration?.layout(compact ? 580 : 660);
        const back = this.content.getChildByName('RegionBack')!;
        back.getChildByName('Body')!.setScale(compact ? .92 : 1.04, compact ? .92 : 1.04, 1);
        back.getChildByName('Body')!.setPosition(0, compact ? 330 : 340);
        back.getChildByName('Crown')!.setPosition(0, compact ? 469 : 495);
        const front = this.content.getChildByName('RegionFront')!;
        front.children.filter(n => n.name === 'LeftFist' || n.name === 'RightFist').forEach((fist, index) => {
            fist.setPosition((index === 0 ? -1 : 1) * (compact ? 238 : 253), 259);
            fist.setScale(compact ? .69 : .78, compact ? .69 : .78, 1);
        });
        // Preserve the approved button-to-panel width ratio when narrowing the pause panel.
        const buttonWidth = pause ? Math.round(552 * 580 / 660) : compact ? 480 : 552;
        this.primary.getComponent(UITransform)!.setContentSize(buttonWidth, 110);
        [this.secondary, this.tertiary].forEach(button =>
            button.getComponent(UITransform)!.setContentSize(buttonWidth, 92));
        this.primaryText.fontSize = 42;
        this.primaryText.lineHeight = this.primaryText.fontSize + 9;
        this.secondaryText.fontSize = 38;
        this.secondaryText.node.getComponent(UITransform)!.setContentSize(buttonWidth - 32, 60);
        this.tertiary.getChildByName('Text')!.getComponent(Label)!.fontSize = 38;
        this.tertiary.getChildByName('Text')!.getComponent(UITransform)!.setContentSize(buttonWidth - 32, 60);
        this.detail.node.getComponent(UITransform)!.setContentSize(compact ? 532 : 594, 83);
        this.title.node.getComponent(UITransform)!.setContentSize(compact ? 532 : 580, 78);
        this.note.node.getComponent(UITransform)!.setContentSize(compact ? 540 : 614, 50);
        this.tertiary.active = pause;
        this.title.string = pause ? '暂停一下' : result ? '本局结束' : '再试一次？';
        this.title.node.setPosition(0, result ? 120 : 161);
        this.detail.string = pause ? '准备好了就继续吧' : result ? '休息一下，再来挑战' : '看完视频，清出安全空间\n进度和道具都会保留';
        this.detail.node.setPosition(0, pause ? 92 : result ? -4 : -48);
        this.icon.active = !result && !pause;
        this.video.active = page === 'offer';
        this.primaryText.string = pause ? '继续游戏' : result ? '再来一局' : page === 'loading' ? '视频加载中…' : '看视频复活';
        // Measure the actual label, then center icon + gap + text as one group.
        this.primaryText.updateRenderData(true);
        const textWidth = this.primaryText.node.getComponent(UITransform)!.width;
        const iconWidth = this.video.active ? 50 : 0, gap = this.video.active ? 16 : 0;
        const totalWidth = iconWidth + gap + textWidth;
        this.primaryText.node.parent!.getComponent(UITransform)!.setContentSize(totalWidth, 62);
        this.video.setPosition(-totalWidth / 2 + iconWidth / 2, 0);
        this.primaryText.node.setPosition((iconWidth + gap) / 2, 0);
        this.secondaryText.string = pause ? '重新开始' : result ? '返回大厅' : '结束本局';
        this.note.string = message || (result || pause ? '' : '本局可复活 1 次');
        this.primary.setPosition(0, pause ? -45 : result ? -149 : -173);
        this.secondary.setPosition(0, pause ? -170 : result ? -288 : -334);
        this.tertiary.setPosition(0, -286);
        this.syncEnabled();
    }
    showPause(model: MiniGamePauseModel): void {
        this.generation++;
        this.pauseModel = model;
        this.enabled = true;
        this.show('pause', () => {});
        this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    }
    private async runPauseAction(index: number): Promise<void> {
        const model = this.pauseModel;
        if (!model) return;
        const generation = this.generation;
        this.setBusy();
        try {
            if (!await this.close() || generation !== this.generation) return;
            await [model.resume, model.restart, model.exit][index]!();
        } catch {
            if (generation === this.generation && this.root.isValid)
                { this.root.active=true; this.motion.open(); this.detail.string = '操作未完成，请重试'; }
        } finally {
            if (generation === this.generation && this.visible) {
                this.busy = false;
                this.syncEnabled();
            }
        }
    }
    private async runAction(primary: boolean): Promise<void> {
        const action = this.action, generation = this.generation;
        if (this.page === 'offer' && primary) { action?.(true); return; }
        this.setBusy();
        if (await this.close() && generation === this.generation) action?.(primary);
    }
    async close(): Promise<boolean> { this.setBusy(); this.motion.cancel(); this.root.active=false; return true; }
    setEnabled(enabled: boolean): void { this.enabled = enabled; this.syncEnabled(); }
    setBusy(): void { this.busy = true; this.syncEnabled(); }
    private syncEnabled(): void {
        [this.primary, this.secondary, this.tertiary].forEach(n => n.getComponent(UIOpacity)!.opacity = this.enabled && !this.busy ? 255 : 155);
    }
    hide(): void { this.motion.cancel(); this.generation++; this.pauseModel = undefined; this.root.active = false; this.action = undefined; this.busy = false; }
    layout(width: number, height: number, platform?: PlatformLayoutInfo): void {
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        this.shade.clear(); this.shade.fillColor = new Color(36, 17, 51, 145);
        this.shade.rect(-width / 2, -height / 2, width, height); this.shade.fill();
        const safe = calculateVerticalSafeBounds(height, platform);
        const scale = Math.max(.001, Math.min(1, width / 750, (safe.topY - safe.bottomY - 28) / 1120));
        this.motion.layout(scale, (safe.topY + safe.bottomY) / 2);
    }
    dispose(): void {
        this.decoration?.dispose(); this.decoration = undefined;
        this.hide(); this.primary.targetOff(this); this.secondary.targetOff(this); this.tertiary.targetOff(this);
        this.root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null);
        this.root.destroy();
    }
    private node(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    private sprite(name: string, parent: Node, frame: SpriteFrame, x: number, y: number, w: number, h: number): Node {
        const n = this.node(name, parent, w, h, x, y), s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.spriteFrame = frame; s.type = Sprite.Type.SLICED; return n;
    }
    private label(name: string, text: string, parent: Node, x: number, y: number, w: number, h: number, size: number, color = INK): Label {
        const l = this.node(name, parent, w, h, x, y).addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 9; l.isBold = true; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK; return l;
    }
}

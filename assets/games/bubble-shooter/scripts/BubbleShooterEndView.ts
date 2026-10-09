import { setLabelBold } from '../../../services/font/FontBinding';
import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import { BlockInputEvents, Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';

import type { MiniGamePauseModel } from '../../../runtime/MiniGame';

import type { BubbleRegion } from './BubbleShooterRound';
import { BubbleShooterModalArt, type BubbleShooterModalFrames } from './BubbleShooterModalArt';

export type EndPage = 'offer' | 'loading' | 'result' | 'pause';

const CARD_WIDTH = 474, CARD_HEIGHT = 178, CARD_DIVIDER = -32;
const COUNT_DELAY = .14, COUNT_DURATION = .75, BADGE_POP = .28;

/** Interaction controller; each region owns its complete panel and control artwork. */
export class BubbleShooterEndView {
    readonly root: Node;
    readonly content: Node;
    readonly motion: BubbleShooterModalMotion;
    private viewport = { width: 750, height: 1334, platform: undefined as PlatformLayoutInfo | undefined };
    private panelHeight = 1120;
    private score = 0;
    private bestScore = 0;
    /** Seconds since the result score started rolling; negative when the card is static. */
    private countAge = -1;
    private badgeAge = -1;
    private page: EndPage = 'offer';
    private readonly shade: Graphics;
    private readonly art: BubbleShooterModalArt;
    private readonly emblem: Graphics;
    private readonly title: Label;
    private readonly detail: Label;
    private readonly scoreCard: Node;
    private readonly scoreCaption: Node;
    private readonly scoreValue: Label;
    private readonly bestRow: Node;
    private readonly bestValue: Label;
    private readonly recordBadge: Node;
    private readonly note: Label;
    private readonly icon: Node;
    private readonly video: Node;
    private readonly primary: Node;
    private readonly secondary: Node;
    private readonly tertiary: Node;
    private readonly roundRestart: Node;
    private onRoundRestart?: () => Promise<void>;
    private onReturn?: () => Promise<void>;
    private pauseModel?: MiniGamePauseModel;
    private campaignPause = false;
    private generation = 0;
    private readonly primaryText: Label;
    private readonly secondaryText: Label;
    private enabled = true;
    private busy = false;
    private action?: (primary: boolean) => void;

    constructor(parent: Node, region: BubbleRegion, frames: BubbleShooterModalFrames, scoreIcons: readonly SpriteFrame[], private readonly onSound: () => void = () => {}) {
        this.root = this.node('EndOverlay', parent, 750, 1334);
        this.root.addComponent(BlockInputEvents);
        this.shade = this.root.addComponent(Graphics);
        this.content = this.node('EndContent', this.root, 700, 1120);
        this.motion = new BubbleShooterModalMotion(this.root, this.content);
        this.art = new BubbleShooterModalArt(this.content, region, frames);
        this.title = this.label('Title', '', this.content, 0, 175, 490, 78, 50, this.art.ink);
        this.icon = this.node('StateEmblem', this.content, 108, 108, 0, 66);
        this.emblem = this.icon.addComponent(Graphics);
        this.detail = this.label('Detail', '', this.content, 0, -47, 480, 80, 27, this.art.ink);
        this.scoreCard = this.node('ScoreCard', this.content, CARD_WIDTH, CARD_HEIGHT);
        this.art.scoreWell(this.scoreCard.addComponent(Graphics), CARD_WIDTH, CARD_HEIGHT, CARD_DIVIDER);
        this.scoreCaption = this.node('Caption', this.scoreCard, 0, 30, 0, 58);
        this.scoreIcon(scoreIcons[0], this.scoreCaption, 26);
        this.rowLabel('Text', '本局得分', this.scoreCaption, 23, this.art.muted);
        this.scoreValue = this.label('Score', '0', this.scoreCard, 0, 12, CARD_WIDTH - 60, 76, 68, this.art.score);
        this.scoreValue.lineHeight = 76;
        this.bestRow = this.node('Best', this.scoreCard, 0, 32, 0, -58);
        this.scoreIcon(scoreIcons[1], this.bestRow, 30);
        this.rowLabel('Caption', "历史最高分", this.bestRow, 23, this.art.muted);
        this.bestValue = this.rowLabel('Value', '0', this.bestRow, 28, this.art.ink);
        this.recordBadge = this.node('RecordBadge', this.scoreCard, 108, 40, CARD_WIDTH / 2 - 62, CARD_HEIGHT / 2 - 2);
        this.recordBadge.angle = -8;
        this.art.recordBadge(this.recordBadge.addComponent(Graphics), 108, 40);
        this.label('Text', '新纪录', this.recordBadge, 0, 1, 96, 34, 22, this.art.primaryInk);
        this.recordBadge.active = false;
        this.primary = this.art.button('Primary', true);
        const buttonContent = this.node('ButtonContent', this.primary, 0, 62);
        this.primaryText = this.label('Text', '', buttonContent, 0, 0, 400, 62, 36, this.art.primaryInk);
        this.primaryText.overflow = Label.Overflow.NONE;
        this.video = this.node('Video', buttonContent, 38, 32);
        const v = this.video.addComponent(Graphics);
        v.strokeColor = this.art.primaryInk; v.lineWidth = 3;
        v.roundRect(-18, -13, 36, 26, 6); v.stroke();
        v.fillColor = this.art.primaryInk; v.moveTo(-4, -7); v.lineTo(8, 0); v.lineTo(-4, 7); v.close(); v.fill();
        this.note = this.label('Note', '', this.content, 0, -247, 470, 56, 21, this.art.muted);
        this.secondary = this.art.button('Secondary', false);
        this.secondaryText = this.label('Text', '', this.secondary, 0, 2, 430, 56, 30, this.art.ink);
        this.tertiary = this.art.button('Exit', false);
        this.label('Text', '返回', this.tertiary, 0, 2, 430, 56, 30, this.art.ink);
        this.tertiary.active = false;
        this.roundRestart = this.art.button('RestartRound', false);
        this.label('Text', "重玩当前轮", this.roundRestart, 0, 2, 430, 56, 30, this.art.ink);
        this.roundRestart.active = false;
        [this.primary, this.secondary, this.tertiary, this.roundRestart].forEach((node, i) => {
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

    get visible(): boolean { return this.root.active; }
    show(page: EndPage, action: (primary: boolean) => void, message = ''): void {
        const entering = !this.root.active || this.page !== page;
        if (!this.root.active) this.motion.open();
        if (this.root.active && this.page !== page && !this.motion.moving) this.motion.open();
        this.page = page;
        this.action = action; this.busy = page === 'loading'; this.root.active = true;
        const result = page === 'result', pause = page === 'pause';
        this.tertiary.active = pause;
        this.roundRestart.active = pause && !!this.onRoundRestart;

        this.title.string = pause ? '暂停一下' : result ? '本局结束' : '再试一次？';
        this.detail.node.active = !pause && !result;
        this.detail.string = "看完广告清出安全空间\n本轮进度和道具都会保留";
        this.scoreCard.active = pause || result;
        // Only a freshly opened result rolls its score; pause and message refreshes stay still.
        if (this.scoreCard.active && (entering || this.countAge < 0)) this.presentScores(result && entering);
        this.icon.active = !pause;
        this.art.emblem(this.emblem, result);
        this.video.active = page === 'offer';
        this.primaryText.string = pause ? '继续游戏' : result ? '再来一局' : page === 'loading' ? "广告加载中…" : "看广告复活";
        // Measure the actual label, then center icon + gap + text as one group.
        this.primaryText.updateRenderData(true);
        const textWidth = this.primaryText.node.getComponent(UITransform)!.width;
        const iconWidth = this.video.active ? 38 : 0, gap = this.video.active ? 16 : 0;
        const totalWidth = iconWidth + gap + textWidth;
        this.primaryText.node.parent!.getComponent(UITransform)!.setContentSize(totalWidth, 62);
        this.video.setPosition(-totalWidth / 2 + iconWidth / 2, 0);
        this.primaryText.node.setPosition((iconWidth + gap) / 2, 0);
        this.secondaryText.string = pause ? '从头开始' : result ? '返回' : '结束本局';
        this.showNote(message || (result || pause ? '' : '本局可复活 1 次'));
        this.syncEnabled();
    }
    /** Latest run and record; a visible card refreshes immediately unless its roll is running. */
    setScores(score: number, best: number): void {
        this.score = score; this.bestScore = best;
        if (this.visible && this.scoreCard.active && this.countAge < 0) this.presentScores(false);
    }
    update(dt: number): void {
        this.motion.update(dt);
        if (!this.root.active) return;
        const step = Math.max(0, Math.min(dt, .05));
        if (this.countAge >= 0) {
            this.countAge += step;
            const t = Math.max(0, Math.min(1, (this.countAge - COUNT_DELAY) / COUNT_DURATION));
            this.scoreValue.string = String(Math.round(this.score * (1 - Math.pow(1 - t, 3))));
            if (t >= 1) { this.countAge = -1; this.popBadge(); }
        }
        if (this.badgeAge >= 0) {
            this.badgeAge = Math.min(BADGE_POP, this.badgeAge + step);
            const t = this.badgeAge / BADGE_POP, scale = t < .6 ? 1.18 * t / .6 : 1.18 - .18 * (t - .6) / .4;
            this.recordBadge.setScale(scale, scale, 1);
            if (this.badgeAge >= BADGE_POP) this.badgeAge = -1;
        }
    }
    private presentScores(roll: boolean): void {
        this.bestValue.string = String(this.bestScore);
        this.centerRow(this.bestRow, 10);
        this.centerRow(this.scoreCaption, 8);
        this.badgeAge = -1;
        this.recordBadge.active = false;
        this.recordBadge.setScale(1, 1, 1);
        if (roll && this.score > 0) { this.countAge = 0; this.scoreValue.string = '0'; return; }
        this.countAge = -1;
        this.scoreValue.string = String(this.score);
        this.recordBadge.active = this.isRecord;
    }
    private popBadge(): void {
        if (!this.isRecord) return;
        this.recordBadge.active = true; this.recordBadge.setScale(0, 0, 1); this.badgeAge = 0;
    }
    /** The run holds (or ties) the best score; best already includes the live score. */
    private get isRecord(): boolean { return this.score > 0 && this.score >= this.bestScore; }
    private showNote(text: string): void {
        this.note.string = text;
        this.note.node.active = !!text;
        this.reflow();
    }
    showPause(model: MiniGamePauseModel, restartRound?: () => Promise<void>, campaign = false, returnToModes?: () => Promise<void>): void {
        this.campaignPause = campaign;
        this.onRoundRestart = restartRound;
        this.onReturn = returnToModes;
        this.generation++;
        this.pauseModel = model;
        this.enabled = true;
        this.show('pause', () => {});
        // Campaign uses the same regional panel and controls, without an endless score card.
        this.roundRestart.getChildByName('Text')!.getComponent(Label)!.string = campaign ? '选择关卡' : '重玩当前轮';
        if (campaign) {
            this.scoreCard.active = false;
            this.secondaryText.string = '重新开始';
            this.reflow();
        }
        this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    }
    private async runPauseAction(index: number): Promise<void> {
        const model = this.pauseModel;
        if (!model) return;
        const generation = this.generation;
        this.setBusy();
        try {
            if (!await this.close() || generation !== this.generation) return;
            await [model.resume, model.restart, this.onReturn ?? model.exit, this.onRoundRestart][index]!();
        } catch {
            if (generation === this.generation && this.root.isValid)
                { this.root.active=true; this.motion.open(); this.showNote('操作未完成，请重试'); }
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
        [this.primary, this.secondary, this.tertiary, this.roundRestart].forEach(n => n.getComponent(UIOpacity)!.opacity = this.enabled && !this.busy ? 255 : 155);
    }
    hide(): void { this.countAge = this.badgeAge = -1; this.motion.cancel(); this.generation++; this.pauseModel = undefined; this.onRoundRestart = this.onReturn = undefined; this.root.active = false; this.action = undefined; this.busy = false; }
    private reflow(): void {
        const pause = this.page === 'pause';
        const rows: {node: Node; height: number; gap: number}[] = [];
        const add = (node: Node, height: number, gap: number): void => {
            if (node.active) rows.push({node, height, gap});
        };
        add(this.title.node, 78, 0);
        add(this.icon, 84, 12);
        add(this.detail.node, 80, 12);
        add(this.scoreCard, CARD_HEIGHT, pause ? 22 : 18);
        add(this.primary, 96, 28);
        add(this.note.node, 48, 12);
        if (pause && this.campaignPause) {
            add(this.secondary, 82, 22);
            add(this.roundRestart, 82, 22);
        } else {
            add(this.roundRestart, 82, 22);
            add(this.secondary, 82, 22);
        }
        add(this.tertiary, 82, 22);
        // Content starts on the header's plain face, so the stretched middle only covers the rest.
        const contentHeight = 18 + rows.reduce((total, row) => total + row.height + row.gap, 0) + 24;
        const middleHeight = Math.max(0, contentHeight - this.art.headerFace);
        this.panelHeight = this.art.topHeight + middleHeight + this.art.bottomHeight;
        this.content.getComponent(UITransform)!.setContentSize(700, this.panelHeight);
        let y = this.art.layout(middleHeight) + this.art.headerFace - 18;
        for (const row of rows) {
            y -= row.gap;
            row.node.setPosition(0, y - row.height / 2);
            y -= row.height;
        }
        this.fit();
    }
    layout(width: number, height: number, platform?: PlatformLayoutInfo): void {
        this.viewport = {width, height, platform};
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        this.shade.clear(); this.shade.fillColor = this.art.shade;
        this.shade.rect(-width / 2, -height / 2, width, height); this.shade.fill();
        this.fit();
    }
    private fit(): void {
        const {width, height, platform} = this.viewport;
        const safe = calculateVerticalSafeBounds(height, platform);
        const scale = Math.max(.001, Math.min(1, width / 750, (safe.topY - safe.bottomY - 28) / this.panelHeight));
        this.motion.layout(scale, (safe.topY + safe.bottomY) / 2);
    }
    dispose(): void {
        this.hide(); this.primary.targetOff(this); this.secondary.targetOff(this); this.tertiary.targetOff(this); this.roundRestart.targetOff(this);
        this.root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null);
        this.root.destroy();
    }
    private node(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    /** Lays out a row's children left to right at their measured widths, centered on the row. */
    private centerRow(row: Node, gap: number): void {
        const items = row.children.map(child => {
            child.getComponent(Label)?.updateRenderData(true);
            return {child, width: child.getComponent(UITransform)!.width};
        });
        const total = items.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, items.length - 1);
        let x = -total / 2;
        for (const {child, width} of items) { child.setPosition(x + width / 2, 0); x += width + gap; }
        row.getComponent(UITransform)!.setContentSize(total, row.getComponent(UITransform)!.height);
    }
    private scoreIcon(frame: SpriteFrame, parent: Node, height: number): void {
        const n = this.node('Icon', parent, height * frame.rect.width / frame.rect.height, height);
        const sprite = n.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false; sprite.spriteFrame = frame;
    }
    private rowLabel(name: string, text: string, parent: Node, size: number, color: Color): Label {
        const l = this.label(name, text, parent, 0, 0, 10, size + 9, size, color);
        l.overflow = Label.Overflow.NONE; return l;
    }
    private label(name: string, text: string, parent: Node, x: number, y: number, w: number, h: number, size: number, color: Color): Label {
        const l = this.node(name, parent, w, h, x, y).addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 9; setLabelBold(l, true); l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK; return l;
    }
}

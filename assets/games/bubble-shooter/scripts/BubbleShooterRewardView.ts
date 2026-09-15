import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import { BlockInputEvents, Color, EventTouch, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, instantiate } from 'cc';
import type { BubbleItem, BubbleShooterRound } from './BubbleShooterRound';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';

const KEYS: readonly BubbleItem[] = ['bomb', 'wildcard', 'clear-bottom'];
const NAMES = { bomb: '炸弹球', wildcard: '万能球', 'clear-bottom': '清底' };
const INK = new Color(80, 18, 61);

/** Shared reward body; the current region supplies its title and Boss decoration. */
export class BubbleShooterRewardView {
    readonly root: Node;
    readonly content: Node;
    readonly motion: BubbleShooterModalMotion;
    private celebration?: Node;
    private selected?: BubbleItem;
    private round?: BubbleShooterRound;
    private confirm?: (item?: BubbleItem) => void;
    private enabled = true;
    private cards: { key: BubbleItem; node: Node; count: Label; badge: Label; badgeBase: Node; base: Node; frame: Node; check: Node }[] = [];
    private button: Node;
    private buttonText: Label;
    private status: Label;
    private readonly listeners: Node[] = [];

    constructor(parent: Node, frames: ReadonlyMap<string, SpriteFrame>, icons: ReadonlyMap<BubbleItem, SpriteFrame>, boss: Node, private readonly onSound: () => void = () => {}) {
        this.root = this.node('RewardOverlay', parent, 750, 1334);
        this.root.addComponent(BlockInputEvents);
        this.content = this.node('RewardContent', this.root, 720, 1120);
        this.motion = new BubbleShooterModalMotion(this.root, this.content);
        // Region-owned decoration sits outside the reusable body.
        const decoration = instantiate(boss);
        decoration.name = 'RegionBoss'; decoration.setParent(this.content); decoration.active = true;
        decoration.setPosition(0, 315); decoration.setScale(0.76, 0.76, 1);
        decoration.getComponent(UIOpacity)!.opacity = 255;
        decoration.getChildByName('Body')!.setScale(1, 1, 1);
        decoration.getChildByName('HealthFill')!.active = false;
        decoration.getChildByName('HealthTrack')!.active = false;
        this.sprite('RegionTitle', this.content, frames.get('cloud-title')!, 0, 300, 650, 168, false);
        this.sprite('Panel', this.content, frames.get('panel')!, 0, -25, 710, 470);
        // Preserve cap aspect by sizing at native height and scaling the whole sprite.
        const plaque = this.sprite('Subtitle', this.content, frames.get('subtitle')!, 0, 165, 680, 91);
        plaque.setScale(0.76, 0.76, 1);
        this.label('Instruction', this.content, '选择一个道具，继续旅行', 0, 165, 630, 36, 29);
        KEYS.forEach((key, i) => {
            const card = this.node('Reward-' + key, this.content, 212, 350, (i - 1) * 221, -65);
            const base = this.sprite('Base', card, frames.get('card')!, 0, 0, 212, 350);
            const frame = this.sprite('SelectedFrame', card, frames.get('selection')!, 0, 0, 220, 358);
            const check = this.sprite('Check', card, frames.get('check')!, 0, 172, 60, 59, false);
            const icon = icons.get(key)!;
            const ratio = Math.min(140 / icon.rect.width, 130 / icon.rect.height);
            this.sprite('Icon', card, icon, 0, 70, icon.rect.width * ratio, icon.rect.height * ratio, false);
            this.label('Name', card, NAMES[key], 0, -25, 190, 38, 32);
            const count = this.label('Count', card, '', 0, -66, 190, 34, 26);
            const badgeBase = this.sprite('GainBase', card, frames.get('button')!, 0, -119, 415, 126);
            badgeBase.setScale(0.34, 0.34, 1);
            const badge = this.label('Gain', card, '', 0, -119, 170, 38, 30, Color.WHITE);
            card.addComponent(UIOpacity);
            this.listen(card, () => {
                if (this.motion.moving || !this.enabled || !this.round?.rewardAvailable || this.round.inventory[key] >= 3) return;
                this.onSound(); this.selected = key; this.sync();
            });
            this.cards.push({ key, node: card, count, badge, badgeBase, base, frame, check });
        });
        this.status = this.label('SelectionText', this.content, '', 0, -303, 690, 44, 30);
        this.button = this.sprite('Confirm', this.content, frames.get('button')!, 0, -400, 630, 126);
        this.button.setScale(0.8, 0.8, 1); this.button.addComponent(UIOpacity);
        this.buttonText = this.label('Text', this.button, '', 0, 0, 580, 60, 43, Color.WHITE);
        this.listen(this.button, () => {
            if (this.motion.moving || !this.enabled || !this.round?.rewardAvailable || (!this.selected && !this.round.inventoryFull)) return;
            this.enabled = false;
            this.confirm?.(this.selected);
        });
        this.label('Capacity', this.content, '每种最多持有 3 个', 0, -489, 620, 34, 25);
        this.root.active = false;
    }

    /** One region-owned Boss + victory-title illustration; common controls never move. */
    setCelebration(frame?: SpriteFrame): void {
        this.content.getChildByName('RegionBoss')!.active = !frame;
        this.content.getChildByName('RegionTitle')!.active = !frame;
        if (!frame) {
            if (this.celebration) { this.celebration.getComponent(Sprite)!.spriteFrame = null; this.celebration.active = false; }
            return;
        }
        if (!this.celebration) {
            this.celebration = this.sprite('RegionCelebration', this.content, frame, 0, 385, 1, 1, false);
            this.celebration.setSiblingIndex(this.content.getChildByName('Panel')!.getSiblingIndex());
        }
        const panel = this.content.getChildByName('Panel')!;
        const panelUI = panel.getComponent(UITransform)!;
        const scale = panelUI.width / frame.originalSize.width;
        const pictureHeight = frame.originalSize.height * scale;
        this.celebration.setPosition(0, panel.position.y + panelUI.height / 2 + 8 + pictureHeight / 2);
        this.celebration.getComponent(Sprite)!.spriteFrame = frame;
        this.celebration.getComponent(Sprite)!.trim = false;
        this.celebration.getComponent(UITransform)!.setContentSize(frame.originalSize.width * scale, frame.originalSize.height * scale);
        this.celebration.active = true;
    }

    get visible(): boolean { return this.root.active; }

    show(round: BubbleShooterRound, confirm: (item?: BubbleItem) => void): void {
        this.round = round; this.confirm = confirm; this.selected = undefined; this.enabled = true;
        this.root.active = true; this.motion.open(); this.sync();
    }

    setEnabled(enabled: boolean): void { this.enabled = enabled; }

    hide(): void {
        this.motion.cancel(); this.root.active = false; this.round = undefined; this.confirm = undefined; this.selected = undefined;
    }

    layout(width: number, height: number, platform?: PlatformLayoutInfo): void {
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        const safe = calculateVerticalSafeBounds(height, platform);
        const top = this.celebration?.active
            ? Math.max(560, this.celebration.position.y + this.celebration.getComponent(UITransform)!.height / 2) : 560;
        const bottom = -560;
        const scale = Math.max(0.001, Math.min(1, width / 750, (safe.topY - safe.bottomY - 28) / (top - bottom)));
        this.motion.layout(scale, (safe.topY + safe.bottomY) / 2 - (top + bottom) / 2 * scale);
    }

    private sync(): void {
        const round = this.round!;
        this.cards.forEach(card => {
            const count = round.inventory[card.key];
            card.count.string = `持有 ${count}/3`; card.badge.string = count >= 3 ? '已满' : '+1';
            card.node.getComponent(UIOpacity)!.opacity = count >= 3 ? 170 : 255;
            card.badgeBase.getComponent(Sprite)!.grayscale = count >= 3;
            card.base.getComponent(Sprite)!.color = this.selected === card.key ? new Color(255, 221, 235) : Color.WHITE;
            card.frame.active = card.check.active = this.selected === card.key;
        });
        this.status.string = round.inventoryFull ? '道具已满，继续旅行吧' : this.selected ? `已选择：${NAMES[this.selected]}` : '请选择一个道具';
        this.buttonText.string = round.inventoryFull ? '继续旅行' : '领取并继续';
        this.button.getComponent(UIOpacity)!.opacity = this.selected || round.inventoryFull ? 255 : 140;
    }

    dispose(): void {
        this.hide(); this.listeners.forEach(node => node.targetOff(this)); this.listeners.length = 0;
        this.cards = []; this.root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null);
        this.root.destroy();
    }

    private listen(node: Node, callback: () => void): void {
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; callback(); }, this);
        this.listeners.push(node);
    }

    private node(name: string, parent: Node, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent); node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height); return node;
    }

    private sprite(name: string, parent: Node, frame: SpriteFrame, x: number, y: number, w: number, h: number, sliced = true): Node {
        const node = this.node(name, parent, w, h, x, y); const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
        sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE; return node;
    }

    private label(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number, size: number, color = INK): Label {
        const label = this.node(name, parent, w, h, x, y).addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = size + 4; label.isBold = true;
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK; return label;
    }
}

import { BlockInputEvents, Color, EventTouch, Font, Graphics, Label, Node, Sprite, SpriteAtlas, UIOpacity, UITransform } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { CITY_RULES, type CityBloxxModel, type CityEvent, type CityFloor } from './CityBloxxModel';
import { CITY_THEME as T } from './CityBloxxTheme';
import { cityComboMilestone, cityComboStage, cityNextComboMilestone } from './CityBloxxFeedback';

export interface CityAction { name: string; text: string; run: () => void; secondary?: boolean; }
export interface CityHudConfig { bonusVisibility: number[][]; }
interface Bounds { width: number; height: number; topY: number; bottomY: number; centerX: number; centerY: number; }

/** Ivory floating cards, coral life hearts and ink-blue type. */
export class CityBloxxHud {
    readonly bottom: Node;
    readonly top: Node;
    readonly hint: Label;
    readonly score: Label;
    readonly population: Label;
    readonly combo: Label;
    readonly bonus: Label;
    readonly pendingReward: Label;
    readonly comboGoal: Label;
    private readonly title: Label;
    private readonly life: Node[] = [];
    private readonly meter: Graphics;
    private readonly comboCard: Node;
    private readonly pauseButton: Node;
    readonly notice: Node;
    private readonly noticeOpacity: UIOpacity;
    private readonly noticeTitle: Label;
    private readonly noticeDetail: Label;
    private landing?: { floor: CityFloor; startedAt: number; perfect: boolean; milestone: boolean; color: string };
    private pulseAt = -Infinity;
    private bankAt = -Infinity;
    modal?: Node;
    panel?: Node;
    private bounds?: Bounds;
    private screen = { width: 750, height: 1334 };
    private panelSize = { width: 560, height: 600 };
    private bonusUntil = 0;
    private bonusStartedAt = 0;
    private clock = 0;

    constructor(private readonly parent: Node, private readonly atlas: SpriteAtlas, private readonly numericFont: Font,
        private readonly press: (action: () => void) => void, pause: () => void,
        private readonly animation: CityHudConfig,
        private readonly project?: (x: number, y: number, z: number) => { x: number; y: number }) {
        this.top = this.make('CityHudTop', parent, 750, 142);
        this.icon('CityBrandIcon', 'icon-city', this.top, -326, -39, 56, 56);
        this.title = this.label('CityTitle', this.top, '都市摩天楼', -79, -38, 386, 64, 42);
        this.title.horizontalAlign = Label.HorizontalAlign.LEFT;
        for (let i = 0; i < CITY_RULES.lives; i++) {
            const x = -323 + i * 48;
            const base = this.icon('CityLifeBase' + i, 'icon-heart', this.top, x, -104, 36, 34);
            base.getComponent(Sprite)!.color = new Color(199, 210, 203, 90);
            this.life.push(this.icon('CityLife' + i, 'icon-heart', this.top, x, -104, 36, 34));
        }
        this.pauseButton = this.button('CityPause', this.top, '', 305, -46, 84, 84, pause, true, false, true);
        this.icon('PauseIcon', 'icon-pause', this.pauseButton, 0, 0, 25, 29);
        this.comboCard = this.make('CityComboCard', this.top, 304, 108);
        this.comboCard.setPosition(156, -138);
        this.plate(this.comboCard, 304, 108, T.ivory, 24);
        this.icon('ComboSpark', 'icon-spark', this.comboCard, -126, 27, 23, 23);
        this.combo = this.label('CityCombo', this.comboCard, '', 9, 27, 234, 36, 28);
        setLabelBold(this.combo, true);
        this.pendingReward = this.label('CityPendingReward', this.comboCard, '', 0, -6, 284, 30, 22);
        this.comboGoal = this.label('CityComboGoal', this.comboCard, '', 0, -32, 284, 24, 20, '#4C6A74');
        this.meter = this.make('ComboMeter', this.comboCard, 268, 4).addComponent(Graphics);
        this.meter.node.setPosition(0, -49);
        this.bonus = this.label('CityBonus', this.top, '', 156, -124, 304, 72, 28);
        this.notice = this.make('CityLandingFeedback', parent, 300, 76);
        this.plate(this.notice, 300, 76, T.ivory, 20, false);
        this.noticeOpacity = this.notice.addComponent(UIOpacity);
        this.noticeTitle = this.label('CityLandingTitle', this.notice, '', 0, 15, 278, 38, 30);
        this.noticeDetail = this.label('CityLandingDetail', this.notice, '', 0, -20, 278, 27, 20, '#4C6A74');
        this.notice.active = false;
        this.bottom = this.make('CityHudBottom', parent, 750, 132);
        const floors = this.counter('CityFloorCard', this.bottom, -243, 'icon-city', '楼层');
        this.score = this.label('CityScore', floors, '00', 31, -15, 126, 53, 46);
        const people = this.counter('CityPopulationCard', this.bottom, 243, 'icon-people', '人口');
        this.population = this.label('CityPeople', people, '0', 31, -15, 126, 53, 46);
        [this.score, this.population].forEach(label => this.numberFont(label));
        this.hint = this.label('CityHint', this.bottom, '', 0, 65, 260, 52, 18);
        this.hint.enableOutline = true; this.hint.outlineColor = new Color(T.ivory); this.hint.outlineWidth = 1;
        this.hint.node.active = false; this.comboCard.active = false;
    }

    private counter(name: string, parent: Node, x: number, frame: string, text: string): Node {
        const card = this.make(name, parent, 216, 100); card.setPosition(x, 65);
        this.plate(card, 216, 100, T.ivory, 27);
        this.icon(name + 'Icon', frame, card, -68, 0, 58, 62);
        this.label(name + 'Caption', card, text, 31, 24, 122, 31, 23);
        return card;
    }

    update(model: CityBloxxModel, sky?: Color): void {
        // Free-standing text follows the actual sky color, including the
        // altitude gradient and short/tall screen projection.
        const ink = sky && luminance(sky) < Math.sqrt((luminance(LIGHT_INK) + .05)
            * (luminance(DARK_INK) + .05)) - .05 ? DARK_INK : LIGHT_INK;
        this.title.color = ink; this.bonus.color = ink;
        this.score.string = digits(model.hudTower, 2); this.population.string = String(model.hudPeople);
        this.life.forEach((node, i) => { node.active = i < model.lives; });
        if (model.comboTime > 0 && !this.comboCard.active) this.bonusUntil = 0;
        this.comboCard.active = model.comboTime > 0;
        this.combo.string = '完美 ×' + Math.max(1, model.combo);
        const stage = cityComboStage(model.combo), next = cityNextComboMilestone(model.combo);
        this.combo.color = new Color(stage.level ? stage.ink : T.ink);
        this.pendingReward.string = '待入账 +' + model.pendingPeople + ' 人口';
        this.pendingReward.color = new Color(stage.level ? stage.ink : T.ink);
        this.comboGoal.string = '距 ' + next + ' 连还差 ' + Math.max(0, next - model.combo) + ' 次';
        const pulse = 1 + .10 * bump(this.clock - this.pulseAt, .26);
        this.combo.node.setScale(pulse, pulse, 1);
        const bankPulse = 1 + .12 * bump(this.clock - this.bankAt, .36);
        this.population.node.setScale(bankPulse, bankPulse, 1);
        const floorPulse = 1 + .08 * bump(this.clock - (this.landing?.startedAt ?? -Infinity), .22);
        this.score.node.setScale(floorPulse, floorPulse, 1);
        const g = this.meter; g.clear();
        if (this.comboCard.active) {
            g.fillColor = new Color(T.edge); g.roundRect(-134, -2, 268, 4, 2); g.fill();
            const w = Math.max(0, Math.min(1, model.comboTime / CITY_RULES.comboSeconds)) * 268;
            if (w > 0) { g.fillColor = new Color(stage.color); g.roundRect(-134, -2, w, 4, Math.min(2, w / 2)); g.fill(); }
        }
        this.bonus.node.active = this.clock < this.bonusUntil;
        if (this.bonus.node.active) {
            const keys = this.animation.bonusVisibility;
            const phase = (this.clock - this.bonusStartedAt) % keys[keys.length - 1][0];
            let enabled = keys[0][1];
            for (const key of keys) { if (key[0] > phase) break; enabled = key[1]; }
            this.bonus.enabled = enabled > 0;
        }
        this.pauseButton.active = model.phase !== 'result';
        this.updateLanding(model);
    }
    land(event: Extract<CityEvent, { type: 'land' }>, model: CityBloxxModel): void {
        const milestone = !event.floor.base && event.perfect && cityComboMilestone(model.combo);
        const stage = cityComboStage(event.perfect ? model.combo : 0);
        this.landing = { floor: event.floor, startedAt: this.clock, perfect: event.perfect,
            milestone, color: event.perfect ? stage.ink : T.ink };
        if (event.perfect && !event.floor.base) this.pulseAt = this.clock;
        this.noticeTitle.string = event.floor.base ? '地基落稳' : milestone ? model.combo + ' 连完美！'
            : (event.perfect ? '完美' : '落稳') + ' +' + event.people;
        this.noticeTitle.color = new Color(this.landing.color);
        this.noticeDetail.string = event.floor.base ? '向上，再建一层' : event.perfect
            ? '连击奖励累计 +' + model.pendingPeople + ' 人口' : '继续向上建造';
    }
    private updateLanding(model: CityBloxxModel): void {
        const landing = this.landing, safe = this.bounds;
        if (!landing || !safe || !this.project || model.floors.indexOf(landing.floor) < 0) {
            this.notice.active = false; return;
        }
        const age = this.clock - landing.startedAt, life = landing.milestone ? 1.05 : .68;
        if (age >= life) { this.notice.active = false; this.landing = undefined; return; }
        const scale = Math.min(1, safe.width / 750, safe.height / 960);
        const pop = scale * (1 + .06 * bump(age, .24));
        const point = this.project(landing.floor.x, landing.floor.y + CITY_RULES.height, .61);
        const xMargin = 150 * pop + 8, yMargin = 38 * pop;
        const x = Math.max(safe.centerX - safe.width / 2 + xMargin,
            Math.min(safe.centerX + safe.width / 2 - xMargin, point.x));
        const bottom = safe.bottomY + 140 * scale + yMargin;
        const top = safe.topY - 202 * scale - yMargin;
        const y = Math.max(bottom, Math.min(Math.max(bottom, top), point.y + 58 * scale + age * 24 * scale));
        this.notice.active = true; this.notice.setPosition(x, y); this.notice.setScale(pop, pop, 1);
        this.noticeOpacity.opacity = Math.round(255 * Math.min(1, (life - age) / .19));
    }
    advance(dt: number): void { this.clock += Math.max(0, Math.min(.25, dt)); }
    showBonus(people: number): void {
        this.bonus.string = '连击入账 +' + people; this.bonusStartedAt = this.clock; this.bonusUntil = this.clock + 5;
        this.bankAt = this.clock;
    }
    reset(): void {
        this.clock = this.bonusStartedAt = this.bonusUntil = 0; this.pulseAt = this.bankAt = -Infinity;
        this.landing = undefined; this.notice.active = false; this.hint.node.active = false; this.close();
    }

    layout(screen: { width: number; height: number }, safe: Bounds): void {
        this.screen = screen; this.bounds = safe;
        const scale = Math.min(1, safe.width / 750, safe.height / 960);
        this.bottom.setPosition(safe.centerX, safe.bottomY); this.bottom.setScale(scale, scale, 1);
        this.top.setPosition(safe.centerX, safe.topY); this.top.setScale(scale, scale, 1);
        if (this.modal) this.modal.getComponent(UITransform)!.setContentSize(screen.width, screen.height);
        if (this.panel) {
            const s = Math.min(1, (safe.width - 40) / this.panelSize.width, (safe.height - 32) / this.panelSize.height);
            this.panel.setScale(s, s, 1); this.panel.setPosition(safe.centerX, safe.centerY);
        }
    }

    result(model: CityBloxxModel, revive: () => void, retry: () => void, exit: () => void): void {
        const card = this.createDialog(600);
        this.icon('CityResultEmblem', 'icon-city', card, 0, 247, 68, 68);
        this.label('CityGameOver', card, '本次建造完成', 0, 178, 490, 58, 38);
        this.label('CityResultSubtitle', card, '向着晴空，再高一层', 0, 135, 480, 34, 22, T.muted);
        this.resultCounter(card, 'ResultTower', 'icon-city', '楼层', String(model.tower), -126);
        this.resultCounter(card, 'ResultPeople', 'icon-people', '人口', String(model.people), 126);
        const button = this.button('CityRevive', card, '', 0, -78, 464, 88,
            () => { if (model.canRevive) revive(); }, false, !model.canRevive);
        this.icon('VideoIcon', 'icon-video', button, -145, 0, 39, 36);
        this.label('ReviveLabel', button, model.canRevive ? '视频复活' : '复活已用完', 24, 14, 300, 43, 31, '#FFFFFF');
        this.label('ReviveRemaining', button, '(' + (CITY_RULES.revives - model.revives) + '/' + CITY_RULES.revives + ')',
            24, -22, 280, 28, 20, '#FFFFFF');
        const again = this.button('CityAgain', card, '', -123, -198, 224, 72, retry, true);
        this.icon('RetryIcon', 'icon-retry', again, -69, 0, 30, 30);
        this.label('RetryLabel', again, '再建一座', 24, 0, 152, 54, 27);
        const home = this.button('CityLobby', card, '', 123, -198, 224, 72, exit, true);
        this.icon('HomeIcon', 'icon-home', home, -69, 0, 30, 30);
        this.label('HomeLabel', home, '返回大厅', 24, 0, 152, 54, 27);
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    private resultCounter(parent: Node, name: string, frame: string, text: string, value: string, x: number): void {
        const n = this.make(name + 'Card', parent, 232, 110); n.setPosition(x, 44);
        this.plate(n, 232, 110, T.pale, 23, false);
        this.icon(name + 'Icon', frame, n, -74, 0, 44, 48);
        this.label(name + 'Caption', n, text, 28, 24, 132, 30, 22, T.muted);
        this.numberFont(this.label(name, n, value, 28, -16, 138, 54, 44));
    }

    dialog(title: string, body: string, actions: CityAction[]): void {
        const card = this.createDialog(620);
        this.icon('DialogEmblem', 'icon-city', card, 0, 257, 60, 60);
        this.label('DialogTitle', card, title, 0, 189, 500, 62, 40);
        this.label('DialogBody', card, body, 0, 118, 480, 78, 24, T.muted);
        actions.forEach((a, i) => this.button(a.name, card, a.text, 0, -16 - i * 94, 464, 76, a.run, a.secondary));
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    private createDialog(height: number): Node {
        this.close();
        this.modal = this.make('CityDialog', this.parent, this.screen.width, this.screen.height);
        this.modal.addComponent(BlockInputEvents);
        const shade = this.modal.addComponent(Graphics); shade.fillColor = new Color(27, 58, 69, 112);
        shade.rect(-this.screen.width, -this.screen.height, this.screen.width * 2, this.screen.height * 2); shade.fill();
        this.panelSize = { width: 560, height };
        this.panel = this.make('CityDialogCard', this.modal, 560, height);
        this.plate(this.panel, 560, height, T.ivory, 36); return this.panel;
    }
    private plate(node: Node, width: number, height: number, fill: string, radius: number, shadow = true): void {
        const g = node.addComponent(Graphics);
        if (shadow) {
            g.fillColor = new Color(69, 106, 113, 38);
            g.roundRect(-width / 2, -height / 2 - 5, width, height, radius); g.fill();
        }
        g.fillColor = new Color(fill); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
        g.strokeColor = new Color(255, 255, 255, 210); g.lineWidth = 1;
        g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, Math.max(1, radius - 1)); g.stroke();
    }
    private numberFont(label: Label): void {
        label.font = this.numericFont; label.useSystemFont = false; setLabelBold(label, false);
        label.lineHeight = label.fontSize;
    }
    private make(name: string, parent: Node, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    private icon(name: string, frame: string, parent: Node, x: number, y: number, w: number, h: number): Node {
        const n = this.make(name, parent, w, h); n.setPosition(x, y);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM;
        const f = this.atlas.getSpriteFrame(frame); s.spriteFrame = f;
        if (f) {
            const k = Math.min(w / f.rect.width, h / f.rect.height);
            n.getComponent(UITransform)!.setContentSize(f.rect.width * k, f.rect.height * k);
        }
        return n;
    }
    private label(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number, font: number, color: string = T.ink): Label {
        const n = this.make(name, parent, w, h); n.setPosition(x, y); const l = n.addComponent(Label);
        l.string = text; l.fontSize = font; l.lineHeight = font * 1.25; l.color = new Color(color);
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK; setLabelBold(l, font >= 30); return l;
    }
    private button(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number,
        run: () => void, secondary = false, disabled = false, circle = false): Node {
        const n = this.make(name, parent, w, h); n.setPosition(x, y);
        const fill = disabled ? T.disabled : secondary ? T.ivory : T.coral;
        this.plate(n, circle ? 72 : w, circle ? 72 : h, fill, circle ? 36 : 23);
        n.addComponent(BlockInputEvents);
        if (text) this.label('Text', n, text, 0, 0, w - 30, h - 8, 29, secondary ? T.ink : '#FFFFFF');
        n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            e.propagationStopped = true; if (!disabled) n.setScale(.97, .97, 1);
        });
        n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true; n.setScale(1, 1, 1); if (!disabled) this.press(run);
        });
        return n;
    }
    close(): void { this.modal?.destroy(); this.modal = this.panel = undefined; }
    dispose(): void { this.close(); this.landing = undefined; this.notice.destroy(); this.bottom.destroy(); this.top.destroy(); }
}

function bump(age: number, duration: number): number {
    return age >= 0 && age < duration ? Math.sin(Math.PI * age / duration) : 0;
}
function digits(value: number, count: number): string {
    const text = String(value); return '0'.repeat(Math.max(0, count - text.length)) + text;
}
const LIGHT_INK = new Color(T.ink), DARK_INK = new Color(T.ivory);
function luminance(color: Color): number {
    const linear = (value: number): number => {
        const s = value / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    };
    return .2126 * linear(color.r) + .7152 * linear(color.g) + .0722 * linear(color.b);
}


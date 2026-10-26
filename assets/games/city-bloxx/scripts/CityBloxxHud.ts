import { BlockInputEvents, Color, EventTouch, Font, Graphics, Label, Node, Sprite, SpriteAtlas, UIOpacity, UITransform } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { CITY_RULES, type CityBloxxModel, type CityEvent, type CityFloor } from './CityBloxxModel';
import { CITY_THEME as T, CITY_ALTITUDES } from './CityBloxxTheme';
import { cityComboMilestone } from './CityBloxxFeedback';

export interface CityAction { name: string; icon: 'play' | 'retry' | 'home'; run: () => void; }
export interface CityHudConfig { bonusVisibility: number[][]; }
interface Bounds { width: number; height: number; topY: number; bottomY: number; centerX: number; centerY: number; }
type Symbol = 'play' | 'pause' | 'retry' | 'home' | 'trophy' | 'busy';

/** Arcade HUD: floating game sprites and outlined numbers, with no card surfaces. */
export class CityBloxxHud {
    readonly bottom: Node;
    readonly top: Node;
    readonly score: Label;
    readonly population: Label;
    readonly combo: Label;
    readonly bonus: Label;
    readonly pendingReward: Label;
    readonly notice: Node;
    modal?: Node;
    panel?: Node;
    private readonly life: Node[] = [];
    private readonly comboGroup: Node;
    private readonly meter: Graphics;
    private readonly pauseButton: Node;
    private readonly stageIcon: Node;
    private readonly stageDots: Graphics;
    private readonly noticeIcon: Node;
    private readonly noticeTitle: Label;
    private readonly noticeOpacity: UIOpacity;
    private readonly bonusOpacity: UIOpacity;
    private landing?: { floor: CityFloor; startedAt: number; milestone: boolean };
    private bounds?: Bounds;
    private screen = { width: 750, height: 1334 };
    private panelSize = { width: 560, height: 620 };
    private stageIndex = -1;
    private clock = 0;
    private pulseAt = -Infinity;
    private bankAt = -Infinity;
    private lifeAt = -Infinity;
    private statusUntil = 0;
    private rewardIcon?: Node;
    private rewardSpinner?: Node;
    private spinnerAngle = 0;

    constructor(private readonly parent: Node, private readonly atlas: SpriteAtlas, private readonly numericFont: Font,
        private readonly press: (action: () => void) => void, pause: () => void,
        private readonly project?: (x: number, y: number, z: number) => { x: number; y: number }) {
        this.top = this.make('CityHudTop', parent, 750, 200);
        for (let i = 0; i < CITY_RULES.lives; i++) {
            const x = -320 + i * 45;
            const empty = this.sprite('CityLifeBase' + i, 'icon-heart', this.top, x, -51, 34, 34);
            empty.getComponent(Sprite)!.color = new Color(90, 110, 130, 100);
            this.life.push(this.sprite('CityLife' + i, 'icon-heart', this.top, x, -51, 34, 34));
        }
        this.sprite('CityFloorIcon', 'icon-city', this.top, -60, -51, 43, 43);
        this.score = this.label('CityScore', this.top, '00', 26, -51, 124, 82, 64);
        this.numberFont(this.score);
        this.pauseButton = this.action('CityPause', this.top, 'pause', 316, -51, 88, pause);

        this.comboGroup = this.make('CityCombo', this.top, 192, 96); this.comboGroup.setPosition(0, -145);
        this.sprite('ComboSpark', 'icon-spark', this.comboGroup, -56, 20, 29, 29);
        this.combo = this.label('CityComboCount', this.comboGroup, '', 18, 20, 112, 50, 38, T.brass);
        this.numberFont(this.combo);
        this.sprite('PendingPeopleIcon', 'icon-people', this.comboGroup, -43, -20, 24, 24);
        this.pendingReward = this.label('CityPendingReward', this.comboGroup, '', 23, -20, 106, 36, 26, T.ivory);
        this.numberFont(this.pendingReward);
        this.meter = this.make('ComboMeter', this.comboGroup, 120, 4).addComponent(Graphics);
        this.meter.node.setPosition(0, -45);
        this.comboGroup.active = false;

        this.bottom = this.make('CityHudBottom', parent, 750, 140);
        this.sprite('CityPopulationIcon', 'icon-people', this.bottom, -324, 51, 42, 42);
        this.population = this.label('CityPeople', this.bottom, '0', -218, 51, 150, 62, 44);
        this.population.horizontalAlign = Label.HorizontalAlign.LEFT; this.numberFont(this.population);
        this.bonus = this.label('CityBonus', this.bottom, '', -218, 113, 154, 44, 32, T.brass);
        this.bonus.horizontalAlign = Label.HorizontalAlign.LEFT; this.numberFont(this.bonus);
        this.bonusOpacity = this.bonus.addComponent(UIOpacity); this.bonus.node.active = false;
        this.stageIcon = this.sprite('CityAltitudeIcon', 'icon-city', this.bottom, 320, 63, 46, 42);
        this.stageDots = this.make('CityAltitudeProgress', this.bottom, 48, 8).addComponent(Graphics);
        this.stageDots.node.setPosition(320, 27);

        this.notice = this.make('CityLandingFeedback', parent, 180, 62);
        this.noticeIcon = this.sprite('CityLandingIcon', 'icon-people', this.notice, -48, 0, 32, 32);
        this.noticeTitle = this.label('CityLandingValue', this.notice, '', 24, 0, 126, 58, 39, T.brass);
        this.numberFont(this.noticeTitle);
        this.noticeOpacity = this.notice.addComponent(UIOpacity); this.notice.active = false;
    }

    get altitudeStage(): string { return CITY_ALTITUDES[Math.max(0, this.stageIndex)].name; }

    update(model: CityBloxxModel): void {
        this.score.string = (model.hudTower < 10 ? '0' : '') + model.hudTower;
        this.population.string = String(model.hudPeople);
        const lifePulse = 1 + .16 * bump(this.clock - this.lifeAt, .6);
        this.life.forEach((node, i) => { node.active = i < model.lives; node.setScale(lifePulse, lifePulse, 1); });
        const stage = CITY_ALTITUDES.reduce((index, item, i) => model.hudTower >= item.floor ? i : index, 0);
        if (stage !== this.stageIndex) {
            this.stageIndex = stage;
            this.setSprite(this.stageIcon, CITY_ALTITUDES[stage].icon, 46, 42);
            const g = this.stageDots; g.clear();
            for (let i = 0; i < CITY_ALTITUDES.length; i++) {
                g.fillColor = i <= stage ? new Color(T.brass) : new Color(255, 255, 255, 90);
                g.circle(-20 + i * 10, 0, i === stage ? 3 : 2); g.fill();
            }
        }
        if (model.comboTime > 0 && !this.comboGroup.active) this.bankAt = -Infinity;
        this.comboGroup.active = model.comboTime > 0;
        this.combo.string = '×' + Math.max(1, model.combo);
        this.pendingReward.string = '+' + model.pendingPeople;
        const pulse = 1 + .12 * bump(this.clock - this.pulseAt, .26);
        this.combo.node.setScale(pulse, pulse, 1);
        const g = this.meter; g.clear();
        if (this.comboGroup.active) {
            g.fillColor = new Color(255, 255, 255, 75); g.roundRect(-60, -2, 120, 4, 2); g.fill();
            const w = Math.max(0, Math.min(1, model.comboTime / CITY_RULES.comboSeconds)) * 120;
            if (w > 0) { g.fillColor = new Color(T.brass); g.roundRect(-60, -2, w, 4, Math.min(2, w / 2)); g.fill(); }
        }
        const bankAge = this.clock - this.bankAt;
        this.bonus.node.active = bankAge >= 0 && bankAge < 1.3;
        if (this.bonus.node.active) {
            this.bonus.node.setPosition(-218, 105 + bankAge * 24);
            this.bonusOpacity.opacity = Math.round(255 * Math.min(1, (1.3 - bankAge) / .3));
        }
        const bankPulse = 1 + .12 * bump(bankAge, .36); this.population.node.setScale(bankPulse, bankPulse, 1);
        const floorPulse = 1 + .08 * bump(this.clock - (this.landing?.startedAt ?? -Infinity), .22);
        this.score.node.setScale(floorPulse, floorPulse, 1);
        this.pauseButton.active = model.phase !== 'result';
        this.top.active = this.bottom.active = !this.modal;
        this.updateLanding(model);
    }

    land(event: Extract<CityEvent, { type: 'land' }>, model: CityBloxxModel): void {
        this.statusUntil = 0;
        if (event.floor.base) { this.landing = undefined; this.notice.active = false; return; }
        const milestone = event.perfect && cityComboMilestone(model.combo);
        this.landing = { floor: event.floor, startedAt: this.clock, milestone };
        if (event.perfect) this.pulseAt = this.clock;
        this.setSprite(this.noticeIcon, event.perfect ? 'icon-spark' : 'icon-people', 32, 32);
        this.noticeTitle.string = milestone ? '×' + model.combo : '+' + event.people;
        this.noticeTitle.color = new Color(event.perfect ? T.brass : T.ivory);
    }

    private updateLanding(model: CityBloxxModel): void {
        const safe = this.bounds;
        if (!safe || this.modal || model.phase === 'result') { this.notice.active = false; return; }
        const scale = Math.min(1, safe.width / 750, safe.height / 960);
        if (this.clock < this.statusUntil) {
            this.notice.active = true; this.notice.setScale(scale, scale, 1);
            this.notice.setPosition(safe.centerX, safe.centerY + 125 * scale);
            this.noticeOpacity.opacity = Math.round(255 * Math.min(1, (this.statusUntil - this.clock) / .2)); return;
        }
        const landing = this.landing;
        if (!landing || !this.project || model.floors.indexOf(landing.floor) < 0) { this.notice.active = false; return; }
        const age = this.clock - landing.startedAt, life = landing.milestone ? 1.05 : .68;
        if (age >= life) { this.notice.active = false; this.landing = undefined; return; }
        const pop = scale * (1 + .06 * bump(age, .24));
        const point = this.project(landing.floor.x, landing.floor.y + CITY_RULES.height, .61);
        const xMargin = 90 * pop + 8, yMargin = 31 * pop;
        const x = Math.max(safe.centerX - safe.width / 2 + xMargin, Math.min(safe.centerX + safe.width / 2 - xMargin, point.x));
        const bottom = safe.bottomY + 150 * scale + yMargin, top = safe.topY - 220 * scale - yMargin;
        const y = Math.max(bottom, Math.min(Math.max(bottom, top), point.y + 50 * scale + age * 28 * scale));
        this.notice.active = true; this.notice.setPosition(x, y); this.notice.setScale(pop, pop, 1);
        this.noticeOpacity.opacity = Math.round(255 * Math.min(1, (life - age) / .19));
    }

    advance(dt: number): void { this.clock += Math.max(0, Math.min(.25, dt)); }
    miss(_lives: number): void {
        this.landing = undefined; this.statusUntil = this.clock + 1.1;
        this.setSprite(this.noticeIcon, 'icon-heart', 32, 32);
        this.noticeTitle.string = '−1'; this.noticeTitle.color = new Color('#FFB69A');
    }
    showBonus(people: number): void { this.bonus.string = '+' + people; this.bankAt = this.clock; }
    revived(): void { this.lifeAt = this.clock; }
    reset(): void {
        this.clock = this.statusUntil = 0; this.pulseAt = this.bankAt = this.lifeAt = -Infinity;
        this.landing = undefined; this.notice.active = false; this.bonus.node.active = false; this.close();
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
        const content = this.createOverlay(620);
        this.glyph('CityResultTrophy', 'trophy', content, 0, 230, 82, T.brass);
        this.sprite('ResultFloorIcon', 'icon-city', content, -112, 113, 46, 46);
        const floors = this.label('ResultTower', content, String(model.tower), 33, 113, 226, 132, 108);
        this.numberFont(floors);
        this.sprite('ResultPeopleIcon', 'icon-people', content, -56, 4, 34, 34);
        const people = this.label('ResultPeople', content, String(model.people), 38, 4, 130, 58, 42);
        this.numberFont(people);
        const button = this.action('CityRevive', content, undefined, 0, -125, 128,
            () => { if (model.canRevive) revive(); }, true, !model.canRevive);
        this.rewardIcon = this.sprite('ReviveHeart', 'icon-heart', button, 0, 4, 56, 56);
        this.rewardSpinner = this.glyph('ReviveSpinner', 'busy', button, 0, 4, 58, T.ink);
        this.rewardSpinner.active = false;
        this.sprite('VideoIcon', 'icon-video', button, 43, -38, 42, 34);
        this.label('VideoAdMark', button, 'AD', 55, -25, 26, 18, 11, T.ivory);
        if (!model.canRevive) this.rewardIcon.getComponent(Sprite)!.color = new Color(155, 165, 174, 140);
        this.label('ReviveLabel', content, model.canRevive ? '复活' : '已用完', 0, -219, 150, 36, 25,
            model.canRevive ? T.ivory : '#A8B3BF');
        this.label('ReviveRemaining', content, (CITY_RULES.revives - model.revives) + '/' + CITY_RULES.revives,
            0, -256, 120, 32, 22, model.canRevive ? T.brass : '#A8B3BF');
        this.action('CityAgain', content, 'retry', -170, -125, 100, retry);
        this.action('CityLobby', content, 'home', 170, -125, 100, exit);
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    pause(actions: CityAction[]): void {
        const content = this.createOverlay(actions.length === 1 ? 400 : 520);
        this.glyph('CityPauseEmblem', 'pause', content, 0, 151, 60, T.brass);
        for (let i = 0; i < actions.length; i++) {
            const a = actions[i], primary = i === 0;
            this.action(a.name, content, a.icon, primary ? 0 : i === 1 ? -110 : 110,
                primary ? 15 : -142, primary ? 128 : 96, a.run, primary);
        }
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    private createOverlay(height: number): Node {
        this.close();
        this.modal = this.make('CityOverlay', this.parent, this.screen.width, this.screen.height);
        this.modal.addComponent(BlockInputEvents);
        const shade = this.modal.addComponent(Graphics); shade.fillColor = new Color(10, 23, 42, 182);
        shade.rect(-this.screen.width, -this.screen.height, this.screen.width * 2, this.screen.height * 2); shade.fill();
        this.panelSize = { width: 560, height };
        this.panel = this.make('CityOverlayContent', this.modal, 560, height);
        this.top.active = this.bottom.active = this.notice.active = false; return this.panel;
    }

    setRewardPending(pending: boolean): void {
        if (this.rewardIcon) this.rewardIcon.active = !pending;
        if (this.rewardSpinner) this.rewardSpinner.active = pending;
        const label = this.panel?.getChildByName('ReviveLabel')?.getComponent(Label);
        if (label) label.string = pending ? '…' : '复活';
        this.spinnerAngle = 0;
    }
    advanceLoading(dt: number): void {
        if (!this.rewardSpinner?.active) return;
        this.spinnerAngle = (this.spinnerAngle - Math.max(0, Math.min(.1, dt)) * 240) % 360;
        this.rewardSpinner.setRotationFromEuler(0, 0, this.spinnerAngle);
    }

    private numberFont(label: Label): void {
        label.font = this.numericFont; label.useSystemFont = false; setLabelBold(label, false); label.lineHeight = label.fontSize;
    }
    private make(name: string, parent: Node, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    private sprite(name: string, frame: string, parent: Node, x: number, y: number, w: number, h: number): Node {
        const n = this.make(name, parent, w, h); n.setPosition(x, y);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; this.setSprite(n, frame, w, h); return n;
    }
    private setSprite(node: Node, name: string, w: number, h: number): void {
        const frame = this.atlas.getSpriteFrame(name); if (!frame) throw Error('Missing City HUD sprite ' + name);
        node.getComponent(Sprite)!.spriteFrame = frame;
        const scale = Math.min(w / frame.rect.width, h / frame.rect.height);
        node.getComponent(UITransform)!.setContentSize(frame.rect.width * scale, frame.rect.height * scale);
    }
    private label(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number,
        font: number, color: string = T.ivory): Label {
        const n = this.make(name, parent, w, h); n.setPosition(x, y); const label = n.addComponent(Label);
        label.string = text; label.fontSize = font; label.lineHeight = font * 1.2; label.color = new Color(color);
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.enableOutline = true; label.outlineColor = new Color(T.ink);
        label.outlineWidth = font >= 60 ? 4 : 2.5; setLabelBold(label, true); return label;
    }
    private action(name: string, parent: Node, symbol: Symbol | undefined, x: number, y: number, size: number,
        run: () => void, primary = false, disabled = false): Node {
        const node = this.make(name, parent, size, size); node.setPosition(x, y);
        if (primary) {
            const g = node.addComponent(Graphics), radius = size * .4;
            g.fillColor = new Color(disabled ? '#405269' : '#BD8030'); g.circle(0, -5, radius); g.fill();
            g.fillColor = new Color(disabled ? '#6D7E8D' : T.brass); g.circle(0, 1, radius); g.fill();
            g.strokeColor = new Color(disabled ? '#8796A4' : '#FFE9B0'); g.lineWidth = 2.5; g.circle(0, 1, radius - 1); g.stroke();
        }
        if (symbol) this.glyph(name + 'Icon', symbol, node, 0, 0, size * .5, primary ? T.ink : T.ivory);
        node.addComponent(BlockInputEvents);
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true; if (!disabled) node.setScale(.92, .92, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true; node.setScale(1, 1, 1); if (!disabled) this.press(run);
        });
        return node;
    }

    private glyph(name: string, symbol: Symbol, parent: Node, x: number, y: number, size: number, fill: string): Node {
        const node = this.make(name, parent, size, size); node.setPosition(x, y); const g = node.addComponent(Graphics);
        const path = (draw: () => void, solid = false): void => {
            g.strokeColor = new Color(T.ink); g.lineWidth = size * .15; draw(); g.stroke();
            if (solid) { g.fillColor = new Color(fill); draw(); g.fill(); }
            else { g.strokeColor = new Color(fill); g.lineWidth = size * .085; draw(); g.stroke(); }
        };
        const line = (ax: number, ay: number, bx: number, by: number): void => { g.moveTo(ax * size, ay * size); g.lineTo(bx * size, by * size); };
        if (symbol === 'play') path(() => {
            g.moveTo(-size * .19, -size * .32); g.lineTo(size * .31, 0); g.lineTo(-size * .19, size * .32); g.close();
        }, true);
        else if (symbol === 'pause') path(() => {
            for (const dx of [-.19, .19]) g.roundRect((dx - .07) * size, -size * .30, size * .14, size * .6, size * .04);
        }, true);
        else if (symbol === 'retry') path(() => {
            g.moveTo(size * .25, size * .14);
            g.bezierCurveTo(size * .06, size * .42, -size * .38, size * .26, -size * .30, -size * .08);
            g.bezierCurveTo(-size * .2, -size * .40, size * .24, -size * .32, size * .29, -size * .08);
            line(.26, .37, .26, .09); g.lineTo(-size * .02, size * .13);
        });
        else if (symbol === 'home') path(() => {
            line(-.35, .02, 0, .34); g.lineTo(size * .35, size * .02);
            line(-.25, .06, -.25, -.3); g.lineTo(size * .25, -size * .3); g.lineTo(size * .25, size * .06);
            line(-.07, -.3, -.07, -.1); g.lineTo(size * .07, -size * .1); g.lineTo(size * .07, -size * .3);
        });
        else if (symbol === 'trophy') path(() => {
            g.moveTo(-size * .23, size * .3); g.lineTo(size * .23, size * .3); g.lineTo(size * .19, -size * .04);
            g.bezierCurveTo(size * .15, -size * .24, -size * .15, -size * .24, -size * .19, -size * .04); g.close();
            g.rect(-size * .035, -size * .3, size * .07, size * .2); g.roundRect(-size * .2, -size * .37, size * .4, size * .08, size * .02);
            g.moveTo(-size * .23, size * .2); g.bezierCurveTo(-size * .5, size * .3, -size * .4, -size * .09, -size * .17, -size * .07);
            g.moveTo(size * .23, size * .2); g.bezierCurveTo(size * .5, size * .3, size * .4, -size * .09, size * .17, -size * .07);
        }, true);
        else if (symbol === 'busy') {
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4, color = new Color(fill); color.a = 60 + i * 27; g.fillColor = color;
                g.circle(Math.cos(angle) * size * .30, Math.sin(angle) * size * .30, size * .055); g.fill();
            }
        }
        return node;
    }

    close(): void {
        this.rewardIcon = this.rewardSpinner = undefined;
        this.modal?.destroy(); this.modal = this.panel = undefined;
        this.top.active = this.bottom.active = true;
    }
    dispose(): void { this.close(); this.landing = undefined; this.notice.destroy(); this.bottom.destroy(); this.top.destroy(); }
}

function bump(age: number, duration: number): number {
    return age >= 0 && age < duration ? Math.sin(Math.PI * age / duration) : 0;
}

import { BlockInputEvents, Color, EventTouch, Font, Graphics, Label, Layout, Node, Sprite, SpriteAtlas, UIOpacity, UITransform } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { CITY_RULES, type CityBloxxModel, type CityEvent, type CityFloor } from './CityBloxxModel';
import { CITY_THEME as T, CITY_ALTITUDES, cityAltitudeIndex } from './CityBloxxTheme';
import { cityComboMilestone, cityComboStage } from './CityBloxxFeedback';

export interface CityAction { name: string; icon: 'play' | 'retry' | 'home'; run: () => void; }
export interface CityHudConfig { bonusVisibility: number[][]; }
interface Bounds { width: number; height: number; topY: number; bottomY: number; centerX: number; centerY: number; }
type Icon = 'play' | 'pause' | 'retry' | 'home';
/** Native width of the `hud-panel` card; only its height is sliced. */
const CARD_WIDTH = 506;
const ZONE_BADGE = 78;
const ZONE_HINT = { fontSize: 14, width: 200 };
const RESULT_HEIGHT = 780;
/** Free-standing combo readout on the right of the play area: "连击 ×N" over a wide draining timer. */
const COMBO_PANEL = { width: 240, height: 142, right: 24, top: 440 };
const COMBO_PULSE = .28;
const METER = { width: 220, height: 18 };
/** The perfect word pops on the right of the landed floor, clear of the tower and the drop path above it. */
const RATING = { side: 170, margin: 104, scale: .85 };
const ICONS: Record<Exclude<Icon, 'play'>, string> = { pause: 'icon-pause', retry: 'icon-retry', home: 'icon-home' };

/** Sign-plate HUD: enamel plaques, gem buttons and floating outlined numbers. */
export class CityBloxxHud {
    readonly bottom: Node;
    readonly top: Node;
    readonly score: Label;
    readonly population: Label;
    readonly combo: Label;
    readonly bonus: Label;
    readonly pendingReward: Label;
    readonly notice: Node;
    readonly milestoneBanner: Node;
    modal?: Node;
    panel?: Node;
    private readonly life: Node[] = [];
    private readonly scorePlate: Node;
    private readonly comboGroup: Node;
    private readonly meter: Graphics;
    private readonly meterFill: Node;
    private readonly meterOpacity: UIOpacity;
    private readonly pauseButton: Node;
    private readonly zoneIcon: Node;
    private readonly zoneName: Label;
    private readonly zoneHint: Label;
    private readonly zoneRemaining: Label;
    private readonly zoneUnit: Label;
    private readonly zoneHintRow: Layout;
    private readonly rating: Node;
    private readonly ratingRays: Node;
    private readonly ratingWord: Node;
    private readonly ratingOpacity: UIOpacity;
    private readonly noticeRow: Node;
    private readonly noticeIcon: Node;
    private readonly noticeTitle: Label;
    private readonly noticeOpacity: UIOpacity;
    private readonly bonusOpacity: UIOpacity;
    private readonly milestoneIcon: Node;
    private readonly milestoneTitle: Label;
    private readonly milestoneSub: Label;
    private readonly milestoneOpacity: UIOpacity;
    private milestoneAt = -Infinity;
    private landing?: { floor: CityFloor; startedAt: number; milestone: boolean; perfect: boolean };
    private bounds?: Bounds;
    private screen = { width: 750, height: 1334 };
    private panelSize = { width: CARD_WIDTH + 20, height: 780 };
    private stageIndex = -1;
    private zoneKey = '';
    private readonly landingPose = { x: 0, y: 0, angle: 0 };
    private clock = 0;
    private pulseAt = -Infinity;
    private bankAt = -Infinity;
    private lifeAt = -Infinity;
    private statusUntil = 0;
    private rewardIcon?: Node;
    private rewardSpinner?: Graphics;
    private spinnerAngle = 0;

    constructor(private readonly parent: Node, private readonly icons: SpriteAtlas, private readonly hud: SpriteAtlas, private readonly fx: SpriteAtlas,
        private readonly numericFont: Font, private readonly press: (action: () => void) => void, pause: () => void,
        private readonly arrive: () => void,
        private readonly project?: (x: number, y: number, z: number) => { x: number; y: number }) {
        this.top = this.make('CityHudTop', parent, 750, 220);
        for (let i = 0; i < CITY_RULES.lives; i++) {
            const x = -318 + i * 50;
            this.sprite('CityLifeBase' + i, this.hud, 'hud-heart-empty', this.top, x, -58, 46, 46);
            this.life.push(this.sprite('CityLife' + i, this.hud, 'hud-heart', this.top, x, -58, 46, 46));
        }
        this.scorePlate = this.sliced('CityScorePlate', 'hud-plate', this.top, 0, -58, 244);
        this.sprite('CityFloorIcon', this.icons, 'icon-city', this.scorePlate, -81, 1, 46, 46);
        this.score = this.label('CityScore', this.scorePlate, '00', 22, -1, 116, 56, 42, T.ink);
        this.numberFont(this.score, 0);
        this.pauseButton = this.button('CityPause', this.top, 'pause', 318, -58, 80, pause, false);

        const c = COMBO_PANEL;
        this.comboGroup = this.make('CityCombo', parent, c.width, c.height);
        this.comboGroup.getComponent(UITransform)!.setAnchorPoint(1, .5);
        // The heading, timer and reward share x = 0 as their fixed right edge.
        // Lay out the count first, so wider digits and the landing pulse grow leftward.
        const heading = this.make('CityComboHeading', this.comboGroup, c.width, 72);
        heading.getComponent(UITransform)!.setAnchorPoint(1, .5); heading.setPosition(0, 30);
        this.combo = this.label('CityComboCount', heading, '', 0, 0, 120, 64, 56, T.brass);
        this.numberFont(this.combo, 5);
        const title = this.label('CityComboTitle', heading, '连击', 0, 0, 72, 48, 32, T.ivory);
        title.outlineWidth = 4;
        for (const label of [this.combo, title]) {
            label.horizontalAlign = Label.HorizontalAlign.RIGHT; label.overflow = Label.Overflow.NONE;
            label.enableWrapText = false; label.node.getComponent(UITransform)!.setAnchorPoint(1, .5);
        }
        const row = heading.addComponent(Layout);
        row.type = Layout.Type.HORIZONTAL; row.resizeMode = Layout.ResizeMode.CONTAINER;
        row.horizontalDirection = Layout.HorizontalDirection.RIGHT_TO_LEFT; row.spacingX = 8; row.affectedByScale = true;
        this.meter = this.make('ComboMeter', this.comboGroup, METER.width, METER.height).addComponent(Graphics);
        this.meter.node.getComponent(UITransform)!.setAnchorPoint(1, .5);
        this.meter.node.setPosition(0, -24);
        this.meterFill = this.buildComboMeter(); this.meterOpacity = this.meterFill.addComponent(UIOpacity);
        this.pendingReward = this.label('CityPendingReward', this.comboGroup, '', 0, -51, METER.width, 28, 22, T.brass);
        this.pendingReward.horizontalAlign = Label.HorizontalAlign.RIGHT;
        this.pendingReward.node.getComponent(UITransform)!.setAnchorPoint(1, .5);
        this.numberFont(this.pendingReward, 2);
        this.comboGroup.active = false;
        this.rating = this.make('CityComboRating', parent, 240, 170);
        this.ratingRays = this.sprite('CityRatingRays', this.fx, 'fx-rays', this.rating, 0, 0, 230, 230);
        this.ratingWord = this.sprite('CityRatingWord', this.fx, 'fx-word-0', this.rating, 0, 0, 196, 126);
        this.ratingOpacity = this.rating.addComponent(UIOpacity); this.rating.active = false;

        this.bottom = this.make('CityHudBottom', parent, 750, 150);
        const people = this.sliced('CityPeoplePlate', 'hud-pill', this.bottom, -262, 56, 196);
        this.sprite('CityPopulationIcon', this.icons, 'icon-people', people, -65, 1, 44, 44);
        this.population = this.label('CityPeople', people, '0', 17, 0, 96, 44, 34, T.ink);
        this.numberFont(this.population, 0);
        this.bonus = this.label('CityBonus', this.bottom, '', -252, 122, 170, 48, 36, T.brass);
        this.numberFont(this.bonus, 3); this.bonusOpacity = this.bonus.addComponent(UIOpacity); this.bonus.node.active = false;

        const zone = this.sliced('CityZonePlate', 'hud-pill-large', this.bottom, 191, 60, 340);
        this.zoneIcon = this.sprite('CityZoneIcon', this.hud, CITY_ALTITUDES[0].icon, zone, -130, 1, ZONE_BADGE, ZONE_BADGE);
        // Keep the text rows compact and centered on the plaque's visual center at y = 1.
        this.zoneName = this.label('CityZoneName', zone, '', 26, 10, 220, 28, 20, T.ink);
        const hintRow = this.make('CityZoneHintRow', zone, ZONE_HINT.width, 24);
        hintRow.getComponent(UITransform)!.setAnchorPoint(0, .5); hintRow.setPosition(-84, -8);
        this.zoneHint = this.label('CityZoneHint', hintRow, '', 0, 0, 1, 24, ZONE_HINT.fontSize, T.ink);
        this.zoneRemaining = this.label('CityZoneRemaining', hintRow, '', 0, 0, 1, 24, ZONE_HINT.fontSize, T.goldInk);
        this.zoneUnit = this.label('CityZoneUnit', hintRow, '', 0, 0, 1, 24, ZONE_HINT.fontSize, T.ink);
        for (const label of [this.zoneName, this.zoneHint, this.zoneRemaining, this.zoneUnit]) {
            label.enableOutline = false; label.horizontalAlign = Label.HorizontalAlign.LEFT;
            label.enableWrapText = false;
        }
        for (const label of [this.zoneHint, this.zoneRemaining, this.zoneUnit]) {
            // Rasterize each colored span as a whole; CHAR can omit glyphs
            // when its shared atlas fills, and does not support bold text.
            label.cacheMode = Label.CacheMode.NONE; label.overflow = Label.Overflow.NONE;
            label.node.getComponent(UITransform)!.setAnchorPoint(0, .5);
        }
        this.zoneHintRow = hintRow.addComponent(Layout);
        this.zoneHintRow.type = Layout.Type.HORIZONTAL;
        this.zoneHintRow.resizeMode = Layout.ResizeMode.CONTAINER;

        this.notice = this.make('CityLandingFeedback', parent, 200, 60);
        this.noticeRow = this.make('CityLandingRow', this.notice, 200, 60);
        this.noticeIcon = this.sprite('CityLandingIcon', this.icons, 'icon-people', this.noticeRow, -36, 0, 38, 38);
        this.noticeTitle = this.label('CityLandingValue', this.noticeRow, '', 36, 2, 110, 48, 40, T.ivory);
        this.numberFont(this.noticeTitle, 4); this.noticeTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.noticeOpacity = this.notice.addComponent(UIOpacity); this.notice.active = false;

        this.milestoneBanner = this.make('CityMilestoneBanner', parent, 600, 210);
        this.sliced('MilestoneRibbon', 'hud-ribbon', this.milestoneBanner, 0, -24, 600);
        this.milestoneIcon = this.sprite('MilestoneIcon', this.hud, CITY_ALTITUDES[0].icon, this.milestoneBanner, 0, 66, 104, 104);
        this.milestoneTitle = this.label('MilestoneTitle', this.milestoneBanner, '', 0, -7, 380, 34, 29, T.ivory);
        this.milestoneTitle.outlineColor = new Color(T.navy);
        this.milestoneSub = this.label('MilestoneSub', this.milestoneBanner, '', 0, -35, 380, 20, 16, T.brass);
        this.milestoneSub.outlineColor = new Color(T.navy);
        this.milestoneOpacity = this.milestoneBanner.addComponent(UIOpacity);
        this.milestoneBanner.active = false;
    }

    get altitudeStage(): string { return CITY_ALTITUDES[Math.max(0, this.stageIndex)].name; }

    update(model: CityBloxxModel): void {
        this.score.string = (model.hudTower < 10 ? '0' : '') + model.hudTower;
        this.population.string = String(model.hudPeople);
        const lifePulse = 1 + .2 * bump(this.clock - this.lifeAt, .6);
        this.life.forEach((node, i) => { node.active = i < model.lives; node.setScale(lifePulse, lifePulse, 1); });
        const stage = cityAltitudeIndex(model.hudTower);
        if (stage !== this.stageIndex) {
            const previous = this.stageIndex; this.stageIndex = stage;
            this.setSprite(this.zoneIcon, this.hud, CITY_ALTITUDES[stage].icon, ZONE_BADGE, ZONE_BADGE);
            this.zoneName.string = CITY_ALTITUDES[stage].name;
            if (previous >= 0 && stage > previous) this.celebrate(stage);
        }
        this.updateZone(model.hudTower);
        if (model.comboTime > 0 && !this.comboGroup.active) this.bankAt = -Infinity;
        this.comboGroup.active = model.comboTime > 0 && !this.modal;
        if (this.comboGroup.active) this.updateCombo(model);
        const bankAge = this.clock - this.bankAt;
        this.bonus.node.active = bankAge >= 0 && bankAge < 1.3;
        if (this.bonus.node.active) {
            const rise = 1 - (1 - Math.min(1, bankAge / .5)) ** 3;
            this.bonus.node.setPosition(-252, 112 + rise * 36);
            this.bonusOpacity.opacity = Math.round(255 * Math.min(1, (1.3 - bankAge) / .3));
        }
        const bankPulse = 1 + .14 * bump(bankAge, .36); this.population.node.setScale(bankPulse, bankPulse, 1);
        const floorPulse = 1 + .08 * bump(this.clock - (this.landing?.startedAt ?? -Infinity), .24);
        this.scorePlate.setScale(floorPulse, floorPulse, 1);
        this.pauseButton.active = model.phase !== 'result';
        this.top.active = this.bottom.active = !this.modal;
        this.updateLanding(model);
    }

    /** Successful landings continue the combo; perfect landings refill the timer. */
    private updateCombo(model: CityBloxxModel): void {
        const tier = cityComboStage(model.combo), age = this.clock - this.pulseAt;
        const pulse = 1 + COMBO_PULSE * bump(age, .3);
        this.combo.string = '×' + Math.max(1, model.combo);
        this.combo.color = new Color(tier.color);
        this.combo.node.setScale(pulse, pulse, 1);
        this.pendingReward.string = '+' + model.pendingPeople + ' 人';
        const left = Math.max(0, Math.min(1, model.comboTime / CITY_RULES.comboSeconds));
        // Keep the gold fill attached to the shared right edge; only its transform changes.
        this.meterFill.setScale(left, 1, 1);
        this.meterOpacity.opacity = left < .34 ? Math.round(205 + 50 * Math.sin(this.clock * Math.PI * 6)) : 255;
    }

    /** Slim enamel channel with a brass rim and a raised, softly highlighted gold fill. */
    private buildComboMeter(): Node {
        const g = this.meter, w = METER.width, h = METER.height;
        g.fillColor = new Color(10, 26, 42, 65); g.roundRect(-w, -h / 2 - 3, w, h, h / 2); g.fill();
        g.fillColor = new Color(T.ink); g.roundRect(-w, -h / 2, w, h, h / 2); g.fill();
        g.fillColor = new Color(T.brass); g.roundRect(-w + 1.5, -h / 2 + 1.5, w - 3, h - 3, h / 2 - 1.5); g.fill();
        g.fillColor = new Color('#29495F'); g.roundRect(-w + 3, -h / 2 + 3, w - 6, h - 6, h / 2 - 3); g.fill();
        const width = w - 8, height = h - 8;
        const fill = this.make('CityComboMeterFill', g.node, width, height);
        fill.getComponent(UITransform)!.setAnchorPoint(1, .5); fill.setPosition(-4, 0);
        const sheen = fill.addComponent(Graphics);
        sheen.fillColor = new Color('#D9912F'); sheen.roundRect(-width, -height / 2, width, height, height / 2); sheen.fill();
        sheen.fillColor = new Color('#F5C45C'); sheen.roundRect(-width, -height / 2 + 2, width, height - 2, (height - 2) / 2); sheen.fill();
        sheen.fillColor = new Color('#FFF1BD'); sheen.roundRect(-width + 4, 1, width - 8, 2, 1); sheen.fill();
        return fill;
    }

    /** The next region's distance is the reason to place one more floor. */
    private updateZone(floors: number): void {
        const next = CITY_ALTITUDES[this.stageIndex + 1];
        const key = this.stageIndex + ':' + floors;
        if (key === this.zoneKey) return;
        this.zoneKey = key;
        this.zoneHint.string = next ? `距「${next.name}」还差 ` : '已抵达星海尽头';
        this.zoneRemaining.string = next ? String(next.floor - floors) : '';
        this.zoneUnit.string = next ? ' 层' : '';
        this.zoneRemaining.node.active = this.zoneUnit.node.active = !!next;
        for (const label of [this.zoneHint, this.zoneRemaining, this.zoneUnit]) label.updateRenderData(true);
        this.zoneHintRow.updateLayout();
        const width = this.zoneHintRow.node.getComponent(UITransform)!.width;
        // Reserve space before the plaque's curved inner border, even for three-digit counts.
        const scale = Math.min(1, ZONE_HINT.width / Math.max(1, width));
        this.zoneHintRow.node.setScale(scale, scale, 1);
    }

    land(event: Extract<CityEvent, { type: 'land' }>, model: CityBloxxModel): void {
        this.statusUntil = 0;
        if (event.floor.base) { this.landing = undefined; this.notice.active = false; return; }
        const perfect = event.perfect, milestone = perfect && cityComboMilestone(model.combo);
        this.landing = { floor: event.floor, startedAt: this.clock, milestone, perfect };
        if (perfect) {
            this.pulseAt = this.clock;
            this.setSprite(this.ratingWord, this.fx, 'fx-word-' + cityComboStage(model.combo).level, 196, 126);
        }
        this.setSprite(this.noticeIcon, this.icons, 'icon-people', 38, 38);
        this.noticeTitle.string = '+' + event.people;
        this.noticeTitle.color = new Color(perfect ? T.brass : T.ivory);
    }

    private updateLanding(model: CityBloxxModel): void {
        const safe = this.bounds;
        if (!safe || this.modal || model.phase === 'result') { this.notice.active = this.rating.active = false; return; }
        const scale = this.uiScale();
        if (this.clock < this.statusUntil) {
            this.rating.active = false;
            this.notice.active = true; this.notice.setScale(scale * 1.3, scale * 1.3, 1);
            this.notice.setPosition(safe.centerX, safe.centerY + 125 * scale);
            this.noticeOpacity.opacity = Math.round(255 * Math.min(1, (this.statusUntil - this.clock) / .2)); return;
        }
        const landing = this.landing;
        const age = this.clock - (landing?.startedAt ?? -Infinity);
        if (!landing || !this.project || age >= (landing.milestone ? 1.2 : landing.perfect ? .95 : .75)
            || model.floors.indexOf(landing.floor) < 0) {
            this.landing = undefined; this.notice.active = this.rating.active = false; return;
        }
        const pose = model.samplePose(landing.floor, this.landingPose);
        this.updateRating(landing, age, scale, safe, this.project(pose.x, pose.y + CITY_RULES.height * .5, .61));
        const life = landing.perfect ? .9 : .75;
        if (age >= life) { this.notice.active = false; return; }
        // The population tag floats up from the landed floor's roof.
        const pop = scale * overshoot(age, .12, 1.15);
        const point = this.project(pose.x, pose.y + CITY_RULES.height, .61);
        const xMargin = 100 * pop + 8;
        const x = Math.max(safe.centerX - safe.width / 2 + xMargin, Math.min(safe.centerX + safe.width / 2 - xMargin, point.x));
        const y = Math.max(safe.bottomY + 180 * scale, point.y + (50 + age * 28) * scale);
        this.notice.active = true; this.notice.setPosition(x, y); this.notice.setScale(pop, pop, 1);
        this.noticeOpacity.opacity = Math.round(255 * Math.min(1, (life - age) / .22));
    }

    /** The perfect word slams in on the right of the landed floor, kept on screen. */
    private updateRating(landing: NonNullable<CityBloxxHud['landing']>, age: number, scale: number, safe: Bounds, point: { x: number; y: number }): void {
        const life = landing.milestone ? 1.2 : .95;
        this.rating.active = landing.perfect && age < life;
        if (!this.rating.active) return;
        const word = overshoot(age - .02, .12, 1.22);
        this.ratingWord.setScale(word, word, 1);
        this.ratingWord.setRotationFromEuler(0, 0, Math.sin(age * 18) * 6 * Math.max(0, 1 - age * 3));
        const rays = .5 + .5 * (1 - (1 - Math.min(1, age / .35)) ** 3);
        this.ratingRays.setScale(rays, rays, 1); this.ratingRays.setRotationFromEuler(0, 0, -age * 70);
        const size = scale * RATING.scale;
        this.rating.setPosition(Math.min(point.x + RATING.side * scale, safe.centerX + safe.width / 2 - RATING.margin * size),
            point.y + (30 + age * 24) * scale);
        this.rating.setScale(size, size, 1);
        this.ratingOpacity.opacity = Math.round(255 * Math.min(1, (life - age) / .25));
    }

    private celebrate(stage: number): void {
        const info = CITY_ALTITUDES[stage];
        this.milestoneAt = this.clock; this.arrive();
        this.milestoneTitle.string = info.name;
        this.milestoneSub.string = `${info.subtitle} · 第 ${info.floor} 层`;
        this.setSprite(this.milestoneIcon, this.hud, info.icon, 104, 104);
        this.milestoneBanner.active = true;
    }

    private updateMilestone(): void {
        const age = this.clock - this.milestoneAt, life = 3;
        if (age < 0 || age >= life || this.modal) { this.milestoneBanner.active = false; return; }
        this.milestoneBanner.active = true;
        const pop = age < .32 ? .55 + .6 * Math.sin(age / .32 * Math.PI / 2) - .15 * (age / .32) ** 2 : 1;
        this.milestoneBanner.setScale(pop * this.uiScale(), pop * this.uiScale(), 1);
        this.milestoneIcon.setRotationFromEuler(0, 0, Math.sin(age * 5) * 5 * Math.max(0, 1 - age));
        this.milestoneOpacity.opacity = Math.round(255 * Math.min(1, age / .12, (life - age) / .45));
    }

    advance(dt: number): void {
        this.clock += Math.max(0, Math.min(.25, dt));
        this.updateMilestone();
    }
    miss(_lives: number): void {
        this.landing = undefined; this.statusUntil = this.clock + 1.1;
        this.rating.active = false;
        this.setSprite(this.noticeIcon, this.hud, 'hud-heart', 38, 38);
        this.noticeTitle.string = '−1'; this.noticeTitle.color = new Color(T.rose);
    }
    showBonus(people: number): void { this.bonus.string = '+' + people; this.bankAt = this.clock; }
    revived(): void { this.lifeAt = this.clock; }
    reset(): void {
        this.clock = this.statusUntil = 0;
        this.pulseAt = this.bankAt = this.lifeAt = this.milestoneAt = -Infinity;
        this.landing = undefined; this.notice.active = this.rating.active = false; this.bonus.node.active = false;
        this.milestoneBanner.active = false; this.stageIndex = -1; this.zoneKey = '';
        this.close();
    }

    layout(screen: { width: number; height: number }, safe: Bounds): void {
        this.screen = screen; this.bounds = safe;
        const scale = this.uiScale();
        this.bottom.setPosition(safe.centerX, safe.bottomY); this.bottom.setScale(scale, scale, 1);
        this.top.setPosition(safe.centerX, safe.topY); this.top.setScale(scale, scale, 1);
        this.milestoneBanner.setPosition(safe.centerX, safe.topY - 300 * scale);
        this.milestoneBanner.setScale(scale, scale, 1);
        const c = COMBO_PANEL;
        this.comboGroup.setScale(scale, scale, 1);
        this.comboGroup.setPosition(safe.centerX + safe.width / 2 - c.right * scale,
            Math.max(safe.bottomY + 260 * scale, safe.topY - c.top * scale));
        if (this.modal) this.modal.getComponent(UITransform)!.setContentSize(screen.width, screen.height);
        if (this.panel) {
            const s = Math.min(1, (safe.width - 40) / this.panelSize.width, (safe.height - 32) / this.panelSize.height);
            this.panel.setScale(s, s, 1); this.panel.setPosition(safe.centerX, safe.centerY);
        }
    }
    private uiScale(): number {
        const safe = this.bounds; return safe ? Math.min(1, safe.width / 750, safe.height / 960) : 1;
    }

    result(model: CityBloxxModel, revive: () => void, retry: () => void, exit: () => void): void {
        const content = this.createOverlay(RESULT_HEIGHT);
        const zone = CITY_ALTITUDES[cityAltitudeIndex(model.maxFloors)];
        this.sprite('ResultZoneIcon', this.hud, zone.icon, content, 0, this.coinY(RESULT_HEIGHT), 184, 184);
        this.label('ResultZoneName', content, '抵达 · ' + zone.name, 0, 145, 340, 38, 28, T.ink).enableOutline = false;
        this.sprite('ResultFloorIcon', this.icons, 'icon-city', content, -142, 60, 58, 58);
        const floors = this.label('ResultTower', content, String(model.tower), 0, 62, 196, 104, 92, T.brass);
        this.numberFont(floors, 5);
        this.label('ResultFloorUnit', content, '层', 132, 36, 44, 36, 28, T.ink).enableOutline = false;
        const people = this.sliced('ResultPeoplePlate', 'hud-pill', content, 0, -42, 220);
        this.sprite('ResultPeopleIcon', this.icons, 'icon-people', people, -78, 1, 42, 42);
        this.numberFont(this.label('ResultPeople', people, String(model.people), 17, 0, 116, 44, 32, T.ink), 0);
        const button = this.button('CityRevive', content, undefined, 0, -168, 128,
            () => { if (model.canRevive) revive(); }, true, !model.canRevive);
        this.rewardIcon = this.sprite('ReviveHeart', this.hud, 'hud-heart', button, 0, 4, 60, 60);
        this.rewardSpinner = this.make('ReviveSpinner', button, 60, 60).addComponent(Graphics);
        this.rewardSpinner.node.setPosition(0, 4); this.rewardSpinner.node.active = false; this.drawSpinner(this.rewardSpinner);
        this.sprite('VideoIcon', this.icons, 'icon-video', button, 42, -38, 42, 34);
        if (!model.canRevive) this.rewardIcon.getComponent(Sprite)!.color = new Color(170, 176, 184, 200);
        const reviveLabel = this.label('ReviveLabel', content, model.canRevive ? '看视频复活' : '复活已用完', 0, -256, 200, 32, 23,
            model.canRevive ? T.ink : T.disabled);
        reviveLabel.enableOutline = false;
        this.label('ReviveRemaining', content, `剩余 ${CITY_RULES.revives - model.revives}/${CITY_RULES.revives}`,
            0, -286, 160, 24, 18, T.muted).enableOutline = false;
        this.button('CityAgain', content, 'retry', -142, -168, 92, retry);
        this.label('AgainLabel', content, '再来一局', -142, -234, 120, 28, 19, T.ink).enableOutline = false;
        this.button('CityLobby', content, 'home', 142, -168, 92, exit);
        this.label('LobbyLabel', content, '返回大厅', 142, -234, 120, 28, 19, T.ink).enableOutline = false;
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    pause(actions: CityAction[]): void {
        const single = actions.length === 1, height = single ? 520 : 700;
        const content = this.createOverlay(height), top = height / 2;
        this.sprite('CityPauseBadge', this.icons, 'icon-pause', content, 0, this.coinY(height) + 4, 84, 84);
        const titleY = top - 258;
        this.label('CityPauseTitle', content, '暂停中', 0, titleY, 300, 50, 38, T.ink).enableOutline = false;
        const names: Record<CityAction['icon'], string> = { play: '继续', retry: '重新开始', home: '返回大厅' };
        for (let i = 0; i < actions.length; i++) {
            const a = actions[i], primary = i === 0;
            const x = primary ? 0 : i === 1 ? -120 : 120, y = primary ? titleY - 122 : titleY - 302;
            this.button(a.name, content, a.icon, x, y, primary ? 140 : 104, a.run, primary);
            this.label(a.name + 'Label', content, names[a.icon], x, y - (primary ? 92 : 74), 160, 30, primary ? 24 : 20, T.ink).enableOutline = false;
        }
        if (this.bounds) this.layout(this.screen, this.bounds);
    }

    /** The card art carries a gold coin centred 115 px below its top edge. */
    private coinY(height: number): number { return height / 2 - 115; }

    private createOverlay(height: number): Node {
        this.close();
        this.modal = this.make('CityOverlay', this.parent, this.screen.width, this.screen.height);
        this.modal.addComponent(BlockInputEvents);
        const shade = this.modal.addComponent(Graphics); shade.fillColor = new Color(10, 22, 40, 178);
        shade.rect(-this.screen.width, -this.screen.height, this.screen.width * 2, this.screen.height * 2); shade.fill();
        this.panelSize = { width: CARD_WIDTH + 20, height: height + 40 };
        this.panel = this.make('CityOverlayContent', this.modal, CARD_WIDTH, height);
        this.sliced('CityOverlayCard', 'hud-panel', this.panel, 0, 0, CARD_WIDTH, height);
        this.top.active = this.bottom.active = this.notice.active = false;
        this.milestoneBanner.active = false;
        return this.panel;
    }

    setRewardPending(pending: boolean): void {
        if (this.rewardIcon) this.rewardIcon.active = !pending;
        if (this.rewardSpinner) this.rewardSpinner.node.active = pending;
        const label = this.panel?.getChildByName('ReviveLabel')?.getComponent(Label);
        if (label) label.string = pending ? '视频加载中…' : '看视频复活';
        this.spinnerAngle = 0;
    }
    advanceLoading(dt: number): void {
        if (!this.rewardSpinner?.node.active) return;
        this.spinnerAngle = (this.spinnerAngle - Math.max(0, Math.min(.1, dt)) * 240) % 360;
        this.rewardSpinner.node.setRotationFromEuler(0, 0, this.spinnerAngle);
    }
    private drawSpinner(g: Graphics): void {
        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4, color = new Color(T.ink); color.a = 60 + i * 27; g.fillColor = color;
            g.circle(Math.cos(angle) * 20, Math.sin(angle) * 20, 4); g.fill();
        }
    }

    private numberFont(label: Label, outline: number): void {
        label.font = this.numericFont; label.useSystemFont = false; setLabelBold(label, true); label.lineHeight = label.fontSize;
        label.enableOutline = outline > 0; label.outlineWidth = outline; label.outlineColor = new Color(T.ink);
        label.enableWrapText = false;
        // CHAR ignores isBold in Cocos 3.8.8. Whole-label rendering also keeps
        // counters bold when the platform falls back to its system font.
        // Label only redraws the texture when its text/style actually changes.
        label.cacheMode = Label.CacheMode.NONE;
    }
    /** Render the hidden static combo title under the loading cover. */
    warmup(): () => void {
        const comboActive = this.comboGroup.active;
        this.comboGroup.active = true;
        return () => { this.comboGroup.active = comboActive; };
    }
    private make(name: string, parent: Node, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    private sprite(name: string, atlas: SpriteAtlas, frame: string, parent: Node, x: number, y: number, w: number, h: number): Node {
        const n = this.make(name, parent, w, h); n.setPosition(x, y);
        n.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM; this.setSprite(n, atlas, frame, w, h); return n;
    }
    /**
     * Nine-slice surfaces keep their bevel and outline thickness at any size.
     * Strips without top/bottom borders carry round badges in their caps, so
     * they are only stretched horizontally and keep their native height.
     */
    private sliced(name: string, frame: string, parent: Node, x: number, y: number, w: number, h?: number): Node {
        const f = this.hud.getSpriteFrame(frame);
        if (!f) throw Error('Missing City HUD sprite ' + frame);
        const height = h ?? f.originalSize.height;
        const n = this.make(name, parent, w, height); n.setPosition(x, y);
        const s = n.addComponent(Sprite);
        s.spriteFrame = f; s.type = Sprite.Type.SLICED; s.sizeMode = Sprite.SizeMode.CUSTOM;
        n.getComponent(UITransform)!.setContentSize(w, height); return n;
    }
    private setSprite(node: Node, atlas: SpriteAtlas, name: string, w: number, h: number): void {
        const frame = atlas.getSpriteFrame(name); if (!frame) throw Error('Missing City HUD sprite ' + name);
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
        label.outlineWidth = font >= 30 ? 3 : 2; setLabelBold(label, true); return label;
    }
    private button(name: string, parent: Node, icon: Icon | undefined, x: number, y: number, size: number,
        run: () => void, primary = false, disabled = false): Node {
        const node = this.sprite(name, this.hud, primary ? 'hud-button-gold' : 'hud-button-cream', parent, x, y, size, size);
        if (disabled) node.getComponent(Sprite)!.grayscale = true;
        if (icon === 'play') {
            const g = this.make(name + 'Icon', node, size, size).addComponent(Graphics), r = size * .2;
            g.fillColor = new Color(T.ink); g.lineJoin = Graphics.LineJoin.ROUND;
            g.moveTo(-r * .7, -r); g.lineTo(r * 1.05, 0); g.lineTo(-r * .7, r); g.close(); g.fill();
            g.strokeColor = new Color(T.ink); g.lineWidth = size * .05; g.stroke();
        } else if (icon) this.sprite(name + 'Icon', this.icons, ICONS[icon], node, 0, size * .03, size * .5, size * .5);
        node.addComponent(BlockInputEvents);
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true; if (!disabled) node.setScale(.9, .9, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true; node.setScale(1, 1, 1); if (!disabled) this.press(run);
        });
        return node;
    }

    close(): void {
        this.rewardIcon = this.rewardSpinner = undefined;
        this.modal?.destroy(); this.modal = this.panel = undefined;
        this.top.active = this.bottom.active = true;
    }
    dispose(): void {
        this.close();
        this.landing = undefined;
        this.notice.destroy(); this.bottom.destroy(); this.top.destroy(); this.milestoneBanner.destroy();
        this.comboGroup.destroy(); this.rating.destroy();
    }
}

/** Scale that grows to `peak` over `rise` seconds, then settles back to 1. */
function overshoot(age: number, rise: number, peak: number): number {
    if (age <= 0) return .4;
    if (age < rise) return .4 + (peak - .4) * Math.sin(age / rise * Math.PI / 2);
    return peak - (peak - 1) * Math.min(1, (age - rise) / .16);
}
function bump(age: number, duration: number): number {
    return age >= 0 && age < duration ? Math.sin(Math.PI * age / duration) : 0;
}

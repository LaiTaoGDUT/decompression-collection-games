import { BlockInputEvents, Color, EventTouch, Graphics, Label, LabelOutline, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3 } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { BubbleLevel, BUBBLE_LEVELS, REGION_NAMES } from './BubbleShooterLevels';
import { CampaignProgress, campaignRecommendedRoute, campaignUnlocked } from './BubbleShooterCampaignSave';
import { BubbleShooterCampaign, campaignStarsForShots, campaignStarConditions } from './BubbleShooterCampaign';
import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import type { BubbleRegion } from './BubbleShooterRound';
import type { BubbleCampaignArtwork, CampaignIcon, CampaignUiFrame } from './BubbleShooterRegionAssets';

export interface CampaignViewActions {
    selectLevels(): void; startEndless(): void; enterLevel(id: string): void;
    modes(): void; lobby(): void;
    feedback(): void;
}

const INK = new Color(78, 52, 96), MUTED = new Color(132, 108, 148), CREAM = new Color(255, 251, 243);
/** Deep accent per region for text outlines on the region's candy buttons and nodes. */
const DEEP: Record<BubbleRegion, Color> = {
    cloud: new Color(178, 40, 106), ocean: new Color(14, 110, 120), toy: new Color(182, 84, 14), magic: new Color(98, 46, 170),
};
const PAGE_HEIGHT = 1160;
const MAP_WIDTH = 750;
const LEVEL_NODE_SCALE = .82;
const PAGE_COUNT = BUBBLE_LEVELS.length / 10;
const MAP_POINTS = [[-148, 315], [98, 278], [185, 182], [-74, 137], [-193, 34], [75, -15], [179, -115], [-95, -159], [-178, -275], [116, -330]];
const TOP_Y = 516;
const NAV_Y = -516;
const PANEL_WIDTH = 620;
/** Share of the screen width a scene drifts while its route page slides past. */
const PARALLAX = .06;

/** Pages share one candy UI kit: home logo and mode plates, bubble level map, detail popup, level badge HUD. */
export class BubbleShooterCampaignView {
    readonly root: Node;
    readonly content: Node;
    readonly hud: Node;
    readonly ammo: Node;
    readonly saveNotice: Label;
    private readonly background: Node;
    private readonly backdrop: Node;
    private readonly wash: Graphics;
    private readonly rows: Node;
    private readonly backNode: Node;
    private pageKind: 'other' | 'modes' | 'levels' | 'detail' = 'other';
    private detailAge = 0;
    private detailStars: { node: Node; x: number; y: number; delay: number; phase: number }[] = [];
    private popup?: { root: Node; dim: Graphics; content: Node; motion: BubbleShooterModalMotion };
    private pager?: Node;
    private mapViewport?: Node;
    private mapPages: Node[] = [];
    private mapContents: Node[] = [];
    private levelProgress?: CampaignProgress;
    private pageStars?: Label;
    private age = 0;
    private pressed?: Node;
    private recommended?: { node: Node; halo: Node; pointer: Node; y: number };
    private pageDots: Graphics[] = [];
    private pageRange?: Label;
    private pageArrows: Node[] = [];
    private swipe?: { id: number | null; x: number; y: number; dx: number; moved: boolean };
    private slide?: { from: number; to: number; age: number };
    private backAction?: () => void | Promise<void>;
    private readonly hudText: Label;
    private readonly hudPill: Sprite;
    private readonly goalIcon: Sprite;
    private readonly levelNumber: Label;
    private readonly ammoText: Label;
    private readonly hudNotice: Label;
    private busy = false;
    private pendingSave = false;
    private pageRegion: BubbleRegion = 'cloud';
    private viewport = { width: 750, height: 1334, platform: undefined as PlatformLayoutInfo | undefined };
    private selectedPage = 0;

    constructor(parent: Node, private readonly artwork: BubbleCampaignArtwork, private readonly actions: CampaignViewActions) {
        this.root = this.node('CampaignPage', parent, 750, 1334);
        this.root.addComponent(BlockInputEvents);
        this.background = this.node('PageBackground', this.root, 750, 1800);
        const bg = this.background.addComponent(Sprite); bg.sizeMode = Sprite.SizeMode.CUSTOM; bg.spriteFrame = artwork.backgrounds.cloud; bg.trim = false;
        // The incoming scene fades in over the current one while the route pages slide.
        this.backdrop = this.node('PageBackgroundNext', this.root, 750, 1800); this.backdrop.addComponent(UIOpacity);
        const next = this.backdrop.addComponent(Sprite); next.sizeMode = Sprite.SizeMode.CUSTOM; next.trim = false; this.backdrop.active = false;
        this.wash = this.node('PageTint', this.root, 750, 1334).addComponent(Graphics);
        this.content = this.node('PageContent', this.root, 700, PAGE_HEIGHT);
        this.rows = this.node('PageActions', this.content, 700, PAGE_HEIGHT);
        this.saveNotice = this.label('SaveNotice', '未保存，正在重试', this.content, 0, -570, 460, 28, 20, new Color(173, 74, 48));
        this.backNode = this.node('PageBack', this.content, 96, 96); this.backNode.setPosition(-300, TOP_Y);
        this.sprite('Art', 'back', this.backNode, 0, 0, 96);
        this.bind(this.backNode, () => this.backAction?.()); this.backNode.active = false;
        // Capture before child buttons so a swipe starting on any level cannot become a tap.
        this.root.on(Node.EventType.TOUCH_START, this.swipeStart, this, true);
        this.root.on(Node.EventType.TOUCH_MOVE, this.swipeMove, this, true);
        this.root.on(Node.EventType.TOUCH_END, this.swipeEnd, this, true);
        this.root.on(Node.EventType.TOUCH_CANCEL, this.swipeCancel, this, true);
        // Level badge overlaps the left end of a sliced goal pill; the pill shortens when no count is shown.
        this.hud = this.node('CampaignGoal', parent, 330, 100);
        this.hudPill = this.sprite('GoalPlate', 'hud-pill', this.hud, 0, -2, 260, 60, true);
        const badge = this.sprite('LevelBadge', 'badge', this.hud, -117, 0, 96).node;
        this.levelNumber = this.label('LevelNumber', '', badge, 0, 2, 72, 60, 38, Color.WHITE);
        this.outline(this.levelNumber, DEEP.cloud, 3);
        this.goalIcon = this.icon('GoalIcon', 'clear', this.hud, -28, -2, 46);
        this.hudText = this.label('GoalCount', '', this.hud, 52, -2, 112, 54, 32, INK);
        this.hudNotice = this.label('SaveNotice', '未保存，正在重试', this.hud, 0, -62, 330, 25, 18, new Color(173, 74, 48));
        const play = parent.getChildByName('Playfield')!;
        this.ammo = this.node('CampaignAmmo', play, 160, 70); this.ammo.setPosition(258, -329);
        this.surface(this.ammo, 160, 70, new Color(255, 251, 243, 235), 30);
        this.icon('ShotIcon', 'shots', this.ammo, -44, 0, 46);
        this.ammoText = this.label('Shots', '', this.ammo, 29, 0, 74, 62, 36, INK);
        this.root.active = this.hud.active = this.ammo.active = false;
        this.setSavePending(false);
    }

    get visible(): boolean { return this.root.active; }
    private node(name: string, parent: Node, width: number, height: number): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.addComponent(UITransform).setContentSize(width, height); return n;
    }
    private label(name: string, text: string, parent: Node, x: number, y: number, width: number, height: number, size: number, color = INK): Label {
        const n = this.node(name, parent, width, height); n.setPosition(x, y);
        const label = n.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size + 6;
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.color = color; setLabelBold(label, true); return label;
    }
    private outline(label: Label, color: Color, width: number): void {
        const outline = label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline); outline.color = color; outline.width = width;
    }
    private icon(name: string, key: CampaignIcon, parent: Node, x: number, y: number, size: number, dim = false): Sprite {
        const frame = this.artwork.icons[key], factor = size / Math.max(frame.rect.width, frame.rect.height);
        const n = this.node(name, parent, frame.rect.width * factor, frame.rect.height * factor); n.setPosition(x, y);
        const sprite = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false; sprite.spriteFrame = frame;
        if (dim) sprite.color = new Color(144, 142, 164, 180);
        return sprite;
    }
    /** UI-kit sprite sized by width (height keeps the art's aspect) or, when sliced, by explicit width and height. */
    private sprite(name: string, key: CampaignUiFrame, parent: Node, x: number, y: number, width: number, height?: number, sliced = false): Sprite {
        const frame = this.artwork.ui[key];
        const n = this.node(name, parent, width, height ?? width * frame.rect.height / frame.rect.width); n.setPosition(x, y);
        const sprite = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
        if (sliced) sprite.type = Sprite.Type.SLICED;
        sprite.spriteFrame = frame; return sprite;
    }
    private picture(name: string, frame: SpriteFrame, parent: Node, x: number, y: number, width: number, height: number): Sprite {
        const n = this.node(name, parent, width, height); n.setPosition(x, y);
        const sprite = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false; sprite.spriteFrame = frame; return sprite;
    }
    private surface(parent: Node, width: number, height: number, face = CREAM, radius = 28): Graphics {
        const g = parent.addComponent(Graphics);
        g.fillColor = new Color(124, 99, 135, 28); g.roundRect(-width / 2, -height / 2 - 6, width, height, radius); g.fill();
        g.fillColor = face; g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
        return g;
    }
    private bind(node: Node, action: () => void | Promise<void>, enabled = true): void {
        let restScale = new Vec3(1,1,1);
        const release=():void=>{if(this.pressed===node){node.setScale(restScale);this.pressed=undefined;}};
        node.on(Node.EventType.TOUCH_START,()=>{
            if(!enabled||this.busy||this.slide)return;
            this.pressed=node;restScale.set(node.scale);node.setScale(restScale.x*.96,restScale.y*.96,1);
        });
        node.on(Node.EventType.TOUCH_CANCEL,release);
        node.on(Node.EventType.TOUCH_END, async (event: EventTouch) => {
            release();
            event.propagationStopped = true;
            if (!enabled || this.busy || this.swipe || this.slide || !this.root.active) return;
            this.busy = true;
            this.actions.feedback();
            try { await action(); }
            catch { if (this.root.isValid) { this.saveNotice.string = '操作未完成，请重试'; this.saveNotice.node.active = true; } }
            finally { if (this.root.isValid) this.busy = false; }
        });
    }
    private page(region: BubbleRegion = 'cloud'): void {
        this.busy = false; this.root.active = true; this.hud.active = this.ammo.active = false; this.pageRegion = region;
        this.pageKind = 'other'; this.swipe = this.slide = undefined; this.pager = undefined;
        this.closePopupNow();
        this.mapViewport?.removeFromParent();this.mapViewport?.destroy();this.mapViewport=undefined;
        this.mapContents=[];this.levelProgress=undefined;this.pageStars=undefined;
        this.pressed=this.recommended=undefined;
        this.mapPages = []; this.pageDots = []; this.pageArrows = []; this.pageRange = undefined;
        this.backNode.active = false; this.backAction = undefined;
        this.rows.children.slice().forEach(n => { n.removeFromParent(); n.destroy(); });
        this.saveNotice.node.setPosition(0, -570);
        this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.setSavePending(this.pendingSave);
        this.layout(this.viewport.width, this.viewport.height, this.viewport.platform);
    }
    private back(action: () => void | Promise<void>, name = '返回模式'): void {
        this.backAction = action; this.backNode.name = 'Button-' + name; this.backNode.active = true;
    }
    private stars(parent: Node, count: number, y: number, size: number): void {
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * (size + 4), lift = i === 1 ? -5 : 0;
            if (i < count) this.icon('Star-' + i, 'star', parent, x, y + lift, size);
            else this.sprite('EmptyStar-' + i, 'star-empty', parent, x, y + lift, size * .9);
        }
    }
    private goalKey(level: BubbleLevel): CampaignIcon {
        return level.goal.kind === 'boss' ? 'boss' : level.goal.kind === 'drop-anchors' ? 'anchor' : level.goal.kind === 'remove-targets' ? 'target' : 'clear';
    }
    private totalStars(progress: CampaignProgress): number {
        return BUBBLE_LEVELS.reduce((sum, level) => sum + (progress.results[level.id]?.stars ?? 0), 0);
    }

    showModes(progress: CampaignProgress, endless: boolean): void {
        this.page(); this.pageKind = 'modes'; this.back(() => this.actions.lobby(), '返回大厅');
        this.sprite('HomeLogo', 'logo', this.rows, 0, 418, 520);
        const chip = this.sprite('HomeStars', 'chip', this.rows, 0, 262, 196, 62, true).node;
        this.icon('Star', 'star', chip, -50, 2, 36);
        this.label('Count', this.totalStars(progress) + '/' + BUBBLE_LEVELS.length * 3, chip, 20, 1, 110, 44, 26, INK);
        const hero = this.artwork.homeHero, heroWidth = 660;
        this.picture('HomeHero', hero, this.rows, 0, 0, heroWidth, heroWidth * hero.rect.height / hero.rect.width);
        const campaign = this.modeCard('Button-关卡闯关', 'mode-campaign', '关卡闯关', '轻松闯关，收集星光', -318, new Color(158, 96, 18));
        this.bind(campaign, () => this.actions.selectLevels());
        const infinite = this.modeCard('Button-' + (endless ? '继续无尽挑战' : '开始无尽挑战'), 'mode-endless', '无尽挑战', endless ? '继续挑战' : '自在消除', -490, new Color(18, 116, 112));
        this.bind(infinite, () => this.actions.startEndless());
        this.layout(this.viewport.width, this.viewport.height, this.viewport.platform);
    }

    private modeCard(name: string, art: CampaignUiFrame, text: string, caption: string, y: number, deep: Color): Node {
        const card = this.sprite(name, art, this.rows, 0, y, 660).node;
        // Decorations are independent of the plate so their size and alignment do not depend on baked artwork.
        this.icon('ModeIcon', art === 'mode-campaign' ? 'campaign' : 'endless', card, -220, 0, 132);
        const play = this.sprite('PlayBadge', 'medallion', card, 264, 0, 98).node;
        this.icon('PlayIcon', 'play', play, 4, 0, 50);
        const title = this.label('ModeName', text, card, 34, 18, 330, 56, 44, Color.WHITE); this.outline(title, deep, 4);
        this.label('ModeCaption', caption, card, 34, -30, 330, 34, 23, new Color(deep.r, deep.g, deep.b, 230));
        return card;
    }

    /** Scenes stay fixed behind the sliding route: the two nearest pages cross-fade with a slight parallax drift. */
    private syncBackdrop(): void {
        const width = this.viewport.width;
        if (!this.pager || (this.pageKind !== 'levels' && this.pageKind !== 'detail')) {
            this.backdrop.active = false; this.background.setPosition(0, 0);
            this.cover(this.background, this.artwork.backgrounds[this.pageRegion], 0); return;
        }
        const position = Math.max(0, Math.min(PAGE_COUNT - 1, -this.pager.position.x / width));
        const from = Math.floor(position), to = Math.min(PAGE_COUNT - 1, from + 1), t = position - from;
        const blend = t * t * (3 - 2 * t), drift = width * PARALLAX;
        this.cover(this.background, this.artwork.backgrounds[BUBBLE_LEVELS[from * 10].region], drift);
        this.background.setPosition(-blend * drift, 0);
        this.backdrop.active = to !== from && blend > .001;
        if (!this.backdrop.active) return;
        this.cover(this.backdrop, this.artwork.backgrounds[BUBBLE_LEVELS[to * 10].region], drift);
        this.backdrop.setPosition((1 - blend) * drift, 0);
        this.backdrop.getComponent(UIOpacity)!.opacity = Math.round(255 * blend);
    }

    /** Cover-fits a scene, widened by the parallax drift so its edges never enter the screen. */
    private cover(node: Node, frame: SpriteFrame, drift: number): void {
        const { width, height } = this.viewport, size = frame.originalSize;
        const scale = Math.max((width + drift * 2) / size.width, height / size.height), sprite = node.getComponent(Sprite)!;
        if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
        node.getComponent(UITransform)!.setContentSize(size.width * scale, size.height * scale);
    }

    showLevels(progress: CampaignProgress, page?: number): void {
        const recommendation = BUBBLE_LEVELS[campaignRecommendedRoute(progress) - 1];
        this.selectedPage = Math.max(0, Math.min(PAGE_COUNT-1, page ?? Math.floor((recommendation.routeIndex - 1) / 10)));
        const region=BUBBLE_LEVELS[this.selectedPage*10].region;
        this.page(region); this.pageKind = 'levels'; this.levelProgress=progress;this.back(() => this.actions.modes());
        this.sprite('TitleBanner', 'banner', this.rows, 0, TOP_Y, 420);
        const title = this.label('PageTitle', REGION_NAMES[region], this.rows, 0, TOP_Y + 14, 270, 56, 38, Color.WHITE);
        this.outline(title, DEEP.cloud, 4);
        const range = this.sprite('RangeChip', 'chip', this.rows, 0, TOP_Y - 70, 136, 44, true).node;
        this.pageRange = this.label('PageRange', '', range, 0, 1, 110, 36, 23, INK);
        const stars = this.sprite('RegionStars', 'chip', this.rows, 292, TOP_Y, 146, 54, true).node;
        this.icon('Star', 'star', stars, -40, 2, 32); this.pageStars=this.label('Count', '', stars, 16, 1, 84, 40, 23, INK);
        // The mask and page stride live directly under the screen-sized root. Safe-area scaling
        // belongs only to each map's contents, never to this edge-to-edge scrolling surface.
        // Scenes are not part of the pages: they stay behind the route and cross-fade (syncBackdrop).
        const viewport = this.node('MapViewport', this.root, this.viewport.width, this.viewport.height);
        this.mapViewport=viewport;viewport.setSiblingIndex(this.wash.node.getSiblingIndex()+1);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.pager = this.node('LevelPages', viewport, this.viewport.width * PAGE_COUNT, this.viewport.height);
        for (let p = 0; p < PAGE_COUNT; p++) {
            const map = this.node('MapPage-' + p, this.pager, this.viewport.width, this.viewport.height);
            this.mapPages.push(map);
            const levels=BUBBLE_LEVELS.slice(p*10,p*10+10);
            const contents=this.node('MapContents',map,MAP_WIDTH,900);this.mapContents.push(contents);
            this.mapPath(contents);
            levels.forEach((level, i) => this.levelNode(level, i, contents, progress, recommendation));
            map.active = p === this.selectedPage;
        }
        [-1, 1].forEach((direction, i) => {
            const arrow = this.node(direction < 0 ? 'PagePrevious' : 'PageNext', this.rows, 88, 88); arrow.setPosition(direction * 292, NAV_Y);
            const art = this.sprite('Arrow', 'next', arrow, 0, 0, 88); if (direction < 0) art.node.setScale(-1, 1, 1);
            this.bind(arrow, () => this.turnPage(this.selectedPage + direction)); this.pageArrows[i] = arrow;
        });
        for (let p = 0; p < PAGE_COUNT; p++) {
            const dot = this.node('PageDot-' + p, this.rows, 32, 48); dot.setPosition((p - (PAGE_COUNT-1)/2) * 32, NAV_Y);
            this.pageDots.push(dot.addComponent(Graphics)); this.bind(dot, () => this.turnPage(p));
        }
        this.saveNotice.node.setPosition(0, -574); this.syncPagination();
        this.layout(this.viewport.width, this.viewport.height, this.viewport.platform);
    }

    /** A trail of candy pearls along the route curve, spaced evenly by arc length. */
    private mapPath(parent: Node): void {
        const path = this.node('MapPath', parent, MAP_WIDTH, 780).addComponent(Graphics);
        const samples: number[][] = [MAP_POINTS[0]];
        for (let i = 1; i < MAP_POINTS.length; i++) {
            const before = MAP_POINTS[Math.max(0, i - 2)], a = MAP_POINTS[i - 1], b = MAP_POINTS[i], after = MAP_POINTS[Math.min(MAP_POINTS.length - 1, i + 1)];
            const c1 = [a[0] + (b[0] - before[0]) / 6, a[1] + (b[1] - before[1]) / 6], c2 = [b[0] - (after[0] - a[0]) / 6, b[1] - (after[1] - a[1]) / 6];
            for (let s = 1; s <= 40; s++) {
                const t = s / 40, u = 1 - t;
                samples.push([0, 1].map(k => u * u * u * a[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b[k]));
            }
        }
        const pearls: number[][] = []; let travelled = 0;
        for (let i = 1; i < samples.length; i++) {
            travelled += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
            if (travelled < 26) continue;
            travelled = 0;
            // Pearls hidden under a level node would only add overdraw.
            if (MAP_POINTS.every(([x, y], index) => Math.hypot(samples[i][0] - x, samples[i][1] - y) > (index === 9 ? 75 : 62) * LEVEL_NODE_SCALE)) pearls.push(samples[i]);
        }
        path.fillColor = new Color(60, 36, 84, 46); for (const [x, y] of pearls) path.circle(x, y - 3, 8); path.fill();
        path.fillColor = new Color(255, 249, 238, 245); for (const [x, y] of pearls) path.circle(x, y, 7); path.fill();
        path.fillColor = new Color(255, 255, 255, 200); for (const [x, y] of pearls) path.circle(x - 2, y + 2, 2.4); path.fill();
    }

    private levelNode(level: BubbleLevel, i: number, parent: Node, progress: CampaignProgress, recommendation: BubbleLevel): void {
        const record = progress.results[level.id], unlocked = campaignUnlocked(progress, level.id), boss = level.goal.kind === 'boss';
        const next = level.routeIndex === recommendation.routeIndex, [x, y] = MAP_POINTS[i];
        const n = this.node('Level-' + level.id, parent, boss ? 150 : 128, boss ? 150 : 128); n.setPosition(x, y);
        n.setScale(LEVEL_NODE_SCALE, LEVEL_NODE_SCALE, 1);
        let halo: Node | undefined;
        if (next) { halo = this.sprite('Halo', 'halo', n, 0, boss ? -8 : 0, boss ? 210 : 184).node; }
        const art: CampaignUiFrame = boss ? 'node-boss' : !unlocked ? 'node-locked' : record ? 'node-done' : ('node-' + level.region) as CampaignUiFrame;
        // Boss art carries a crown above its bubble, so its body centre sits lower than the node centre.
        const body = this.sprite('Art', art, n, 0, boss ? 14 : 0, boss ? 150 : unlocked ? 128 : 134);
        if (boss && !unlocked) body.color = new Color(176, 176, 196);
        const deep = !unlocked ? new Color(96, 104, 132) : record ? new Color(170, 104, 12) : DEEP[level.region];
        const number = this.label('LevelNumber', String(level.routeIndex), n, unlocked ? 0 : -3, boss ? -6 : 2, 100, 60, boss ? 42 : 44, unlocked ? Color.WHITE : new Color(236, 241, 250));
        this.outline(number, deep, 4);
        if (boss && !unlocked) this.icon('Locked', 'lock', n, 46, -46, 34);
        if (record) this.stars(n, record.stars, boss ? -86 : -68, 30);
        if (next && halo) {
            const pointer = this.sprite('Pointer', 'pointer', n, 0, boss ? 124 : 88, 50).node;
            this.recommended = { node: n, halo, pointer, y: boss ? 124 : 88 };
        }
        this.bind(n, () => this.showDetail(level, progress), unlocked);
    }

    private syncPagination(): void {
        this.pageRegion=BUBBLE_LEVELS[this.selectedPage*10].region;
        const title=this.rows.getChildByName('PageTitle')?.getComponent(Label);
        if(title)title.string=REGION_NAMES[this.pageRegion];
        if (this.pageRange) this.pageRange.string = (this.selectedPage * 10 + 1) + '–' + (this.selectedPage * 10 + 10);
        if(this.pageStars){const progress=this.levelProgress!;
            this.pageStars.string=BUBBLE_LEVELS.slice(this.selectedPage*10,this.selectedPage*10+10).reduce((sum,l)=>sum+(progress.results[l.id]?.stars??0),0)+'/30';}
        this.pageDots.forEach((dot, p) => {
            const current = p === this.selectedPage; dot.clear();
            dot.fillColor = new Color(60, 36, 84, 60); dot.circle(0, -2, current ? 11 : 7); dot.fill();
            dot.fillColor = current ? new Color(240, 92, 152) : new Color(255, 251, 243, 215); dot.circle(0, 0, current ? 10 : 6.5); dot.fill();
            if (current) { dot.strokeColor = new Color(255, 236, 170); dot.lineWidth = 3; dot.circle(0, 0, 10); dot.stroke(); }
        });
        if (this.pageArrows.length) { this.pageArrows[0].active = this.selectedPage > 0; this.pageArrows[1].active = this.selectedPage < PAGE_COUNT-1; }
    }

    private turnPage(page: number): void {
        if (!this.pager || this.slide) return;
        this.selectedPage = Math.max(0, Math.min(PAGE_COUNT-1, page));
        this.mapPages.forEach((map, p) => { map.active = map.active || p === this.selectedPage; });
        this.slide = { from: this.pager.position.x, to: -this.selectedPage * this.viewport.width, age: 0 }; this.syncPagination();
    }

    private swipeStart(event: EventTouch): void {
        if (this.pageKind !== 'levels' || !this.pager || this.slide || this.busy || this.swipe) return;
        const point = event.getUILocation(), viewport = this.pager.parent!;
        const local = viewport.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        if (Math.abs(local.x) > this.viewport.width / 2 || Math.abs(local.y) > this.viewport.height/2) return;
        this.swipe = { id: event.getID(), x: point.x, y: point.y, dx: 0, moved: false };
    }

    private swipeMove(event: EventTouch): void {
        const swipe = this.swipe;
        if (!swipe || swipe.id !== event.getID() || !this.pager) return;
        const point = event.getUILocation(), scale = this.pager.worldScale.x;
        const dx = (point.x - swipe.x) / scale, dy = (point.y - swipe.y) / scale;
        swipe.dx = dx; swipe.moved ||= Math.max(Math.abs(dx), Math.abs(dy)) > 12;
        if (!swipe.moved) return;
        event.propagationStopped = true;
        if (Math.abs(dx) < Math.abs(dy)) return;
        this.mapPages.forEach((map, p) => { map.active = Math.abs(p - this.selectedPage) <= 1; });
        const beyond = this.selectedPage === 0 && dx > 0 || this.selectedPage === PAGE_COUNT-1 && dx < 0;
        const width=this.viewport.width;
        this.pager.setPosition(-this.selectedPage * width + Math.max(-width, Math.min(width, beyond ? dx * .2 : dx)), 0);
        this.syncBackdrop();
    }

    private swipeEnd(event: EventTouch): void {
        const swipe = this.swipe;
        if (!swipe || swipe.id !== event.getID()) return;
        this.swipe = undefined;
        if (!swipe.moved) return;
        event.propagationStopped = true;
        const point = event.getUILocation(), dy = (point.y - swipe.y) / this.pager!.worldScale.x;
        this.turnPage(this.selectedPage + (Math.abs(swipe.dx) >= 80 && Math.abs(swipe.dx) > Math.abs(dy) * 1.2 ? (swipe.dx < 0 ? 1 : -1) : 0));
    }

    private swipeCancel(event: EventTouch): void {
        if (this.swipe?.id !== event.getID()) return;
        // Cocos sends TOUCH_CANCEL when release is outside the original level's hit box.
        // The original input code distinguishes this normal release from an OS cancellation.
        if (event.getEventCode() === Node.EventType.TOUCH_END) { this.swipeEnd(event); return; }
        this.swipe = undefined; event.propagationStopped = true; this.turnPage(this.selectedPage);
    }

    update(dt: number): void {
        if(!this.visible)return;
        const step=Math.max(0,Math.min(dt,.05));this.age+=step;
        const next=this.recommended;
        if((this.pageKind==='levels'||this.pageKind==='detail')&&next?.node.activeInHierarchy){
            if(this.pressed!==next.node){const pulse=LEVEL_NODE_SCALE*(1+Math.sin(this.age*2.8)*.035);next.node.setScale(pulse,pulse,1);}
            const glow=1+Math.sin(this.age*2.8)*.06;next.halo.setScale(glow,glow,1);
            next.pointer.setPosition(0,next.y+Math.abs(Math.sin(this.age*3.2))*12);
        }
        if(this.pageKind==='modes'){
            const logo=this.rows.getChildByName('HomeLogo');logo?.setPosition(0,418+Math.sin(this.age*1.6)*4);
            const hero=this.rows.getChildByName('HomeHero');hero?.setPosition(0,Math.sin(this.age*1.1)*3);
            for(const name of ['Button-关卡闯关','Button-开始无尽挑战','Button-继续无尽挑战']){
                const card=this.rows.getChildByName(name);
                if(card&&this.pressed!==card){const breathe=1+Math.sin(this.age*2+(name==='Button-关卡闯关'?0:1.4))*.012;card.setScale(breathe,breathe,1);}
            }
        }
        const popup=this.popup;
        if(popup){
            popup.motion.update(dt);
            this.detailAge+=step;
            for(const star of this.detailStars){
                const t=Math.max(0,Math.min(1,(this.detailAge-.12-star.delay)/.42));
                const p=t-1,pop=1+2.70158*p*p*p+1.70158*p*p;
                const scale=.7+.3*pop;
                star.node.setScale(scale,scale,1);
                star.node.setPosition(star.x,star.y+(1-t)*10+Math.sin(this.detailAge*1.8+star.phase)*1.5*t);
            }
        }
        const slide = this.slide;
        if (!slide || !this.pager || !this.visible) return;
        slide.age += step; const t = Math.min(1, slide.age / .24), ease = 1 - Math.pow(1 - t, 3);
        this.pager.setPosition(slide.from + (slide.to - slide.from) * ease, 0);
        if (t === 1) { this.slide = undefined; this.mapPages.forEach((map, p) => { map.active = p === this.selectedPage; }); }
        this.syncBackdrop();
    }

    /** Detail opens as a popup above the level map, which stays in place behind a dim layer. */
    showDetail(level: BubbleLevel, progress: CampaignProgress): void {
        if (this.pageKind !== 'levels' || !this.pager) {
            this.showLevels(progress, Math.floor((level.routeIndex - 1) / 10));
        }
        this.closePopupNow();
        this.pageKind = 'detail'; this.swipe = undefined;
        const root = this.node('DetailPopup', this.root, this.viewport.width, this.viewport.height);
        root.addComponent(UIOpacity);
        const dimNode = this.node('Dim', root, this.viewport.width, this.viewport.height);
        const dim = dimNode.addComponent(Graphics);
        dimNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; this.closeDetail(); });
        const content = this.node('PopupContent', root, PANEL_WIDTH, PAGE_HEIGHT);
        this.popup = { root, dim, content, motion: new BubbleShooterModalMotion(root, content) };
        this.detailStars = []; this.detailAge = 0;

        const region = level.region, deep = DEEP[region];
        const record = progress.results[level.id];
        const bestShots = record?.bestShotsRevision === level.revision ? record.bestShotsUsed : undefined;
        const earned = bestShots === undefined ? 0 : campaignStarsForShots(level, bestShots);
        const height = bestShots === undefined ? 846 : 906, top = height / 2;
        const card = this.node('DetailCard', content, PANEL_WIDTH, height);
        card.addComponent(BlockInputEvents);
        const panel = card.addComponent(Sprite); panel.sizeMode = Sprite.SizeMode.CUSTOM; panel.type = Sprite.Type.SLICED; panel.trim = false;
        panel.spriteFrame = this.artwork.panel;
        // Content is laid out from the panel's top edge; the ribbon header occupies its first 110 units.
        const body = this.node('DetailContent', card, 560, height); body.setPosition(0, top);
        const title = this.label('PageTitle', '第 ' + level.routeIndex + ' 关', body, 0, -62, 300, 60, 40, Color.WHITE);
        this.outline(title, DEEP.cloud, 4);
        const close = this.node('Button-返回选关', body, 88, 88); close.setPosition(270, -112);
        this.sprite('Art', 'close', close, 0, 0, 88);
        this.bind(close, () => this.closeDetail());
        this.label('LevelName', level.name, body, 0, -178, 480, 48, 34, INK);

        const objective = this.node('ObjectiveCard', body, 528, 200); objective.setPosition(0, -310);
        const well = objective.addComponent(Graphics);
        well.fillColor = new Color(236, 222, 240, 120); well.roundRect(-264, -100, 528, 200, 30); well.fill();
        well.strokeColor = new Color(214, 192, 228, 200); well.lineWidth = 2; well.roundRect(-263, -99, 526, 198, 29); well.stroke();
        const medallion = this.sprite('GoalMedallion', 'medallion', objective, -178, 0, 150).node;
        this.icon('GoalArt', this.goalKey(level), medallion, 0, 0, 98);
        const goal = level.goal;
        const text = goal.kind === 'clear-board' ? '清空全部泡泡' : goal.kind === 'boss' ? '击败首领'
            : goal.kind === 'drop-anchors' ? '让 ' + goal.bubbleIds.length + ' 颗锚珠掉落'
            : '清除 ' + goal.bubbleIds.length + ' 颗标记泡泡';
        this.label('ObjectiveCaption', '本关目标', objective, 72, 62, 320, 30, 22, MUTED);
        this.label('GoalName', text, objective, 72, 16, 330, 50, 32, INK);
        const budget = this.sprite('ShotBudget', 'chip', objective, 72, -56, 252, 56, true).node;
        this.icon('BudgetIcon', 'shots', budget, -84, 1, 40);
        this.label('Budget', '最多 ' + level.shotBudget + ' 发', budget, 20, 1, 170, 44, 27, INK);

        const divider = this.node('DetailDivider', body, 528, 40); divider.setPosition(0, -446);
        const rule = divider.addComponent(Graphics); rule.strokeColor = new Color(214, 186, 226); rule.lineWidth = 2;
        rule.moveTo(-250, 0); rule.lineTo(-84, 0); rule.moveTo(84, 0); rule.lineTo(250, 0); rule.stroke();
        this.label('StarRewardsTitle', '星级奖励', divider, 0, 0, 150, 36, 25, MUTED);
        const rewards = this.node('StarRewards', body, 540, 150); rewards.setPosition(0, -540);
        const conditions = campaignStarConditions(level);
        for (let tier = 1; tier <= 3; tier++) this.starReward(rewards, tier, conditions[tier - 1], earned >= tier);
        if (bestShots !== undefined) {
            const best = this.node('BestRecord', body, 400, 44); best.setPosition(0, -652);
            this.icon('RecordIcon', 'shots', best, -112, 0, 32);
            this.label('Best', '最佳用球 ' + bestShots + ' 发', best, 18, 0, 240, 40, 24, MUTED);
        }
        const start = this.node('Button-' + (progress.activeAttempt?.levelId === level.id ? '继续挑战' : '开始挑战'), body, 520, 108);
        start.setPosition(0, -height + 132);
        this.sprite('Art', ('start-' + region) as CampaignUiFrame, start, 0, 0, 520);
        const label = this.label('Text', start.name.slice(7), start, 0, 4, 380, 64, 42, Color.WHITE); this.outline(label, deep, 4);
        this.bind(start, () => this.actions.enterLevel(level.id));
        card.setPosition(0, -14);
        this.layout(this.viewport.width, this.viewport.height, this.viewport.platform);
        this.popup.motion.open();
    }

    private starReward(parent: Node, tier: number, condition: string, earned: boolean): void {
        const reward = this.node('StarReward-' + tier, parent, 172, 150); reward.setPosition((tier - 2) * 178, 0);
        const glow = reward.addComponent(Graphics);
        glow.fillColor = new Color(255, 214, 110, earned ? 70 : 38); glow.circle(0, 22, 50); glow.fill();
        // Each condition awards one star, so the three conditions show three equal-sized stars.
        const star = this.icon('RewardStar-0', 'star', reward, 0, 22, 78).node;
        star.setScale(.7, .7, 1);
        this.detailStars.push({ node: star, x: 0, y: 22, delay: .08 * (tier - 1), phase: tier });
        this.sprite('Ribbon', earned ? 'ribbon-mint' : 'ribbon-gold', reward, 0, -50, 172);
        this.label('TierCondition', condition, reward, 0, -48, 128, 36, 24, earned ? new Color(28, 104, 80) : new Color(138, 86, 18));
        if (earned) this.sprite('RewardAchieved', 'check', reward, 52, 52, 40);
    }

    private closeDetail(): void {
        this.closePopupNow();
    }

    private closePopupNow(): void {
        const popup = this.popup; this.popup = undefined;
        this.detailStars = []; this.detailAge = 0;
        if (!popup) return;
        popup.motion.cancel();
        popup.root.removeFromParent(); popup.root.destroy();
        if (this.pageKind === 'detail') this.pageKind = 'levels';
    }

    syncHUD(round?: BubbleShooterCampaign): void {
        this.hud.active = this.ammo.active = !!round && !this.visible;
        if (!round) return;
        const goal = round.level.goal;
        this.levelNumber.string = String(round.level.routeIndex);
        this.outline(this.levelNumber, DEEP[round.level.region], 3);
        const frame = this.artwork.icons[this.goalKey(round.level)], factor = 46 / Math.max(frame.rect.width, frame.rect.height);
        this.goalIcon.spriteFrame = frame;
        this.goalIcon.node.getComponent(UITransform)!.setContentSize(frame.rect.width * factor, frame.rect.height * factor);
        this.hudText.string = goal.kind === 'boss' ? '' : goal.kind === 'clear-board' ? String(round.board.removableBubbles.length) : round.targetRemaining + '/' + goal.bubbleIds.length;
        this.hudText.node.active = goal.kind !== 'boss';
        // The plate begins under the badge centre and ends just past the visible content.
        const width = goal.kind === 'boss' ? 150 : 260;
        this.hudPill.node.getComponent(UITransform)!.setContentSize(width, 60); this.hudPill.node.setPosition(-117 + width / 2, -2);
        this.ammoText.string = String(round.shotsRemaining);
        this.ammoText.color = round.shotsRemaining <= 2 ? new Color(193, 55, 47) : INK;
    }
    layout(width: number, height: number, platform?: PlatformLayoutInfo): void {
        this.viewport = { width, height, platform }; const safe = calculateVerticalSafeBounds(height, platform);
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        const scale = Math.min(1, width / 750, Math.max(1, safe.topY - safe.bottomY - 32) / PAGE_HEIGHT), middle = (safe.topY + safe.bottomY) / 2;
        this.content.setScale(scale, scale, 1); this.content.setPosition(0, middle);
        // The fixed scene below the pager also fills the elastic overscroll at route endpoints.
        this.background.active=true;this.wash.node.active=this.pageKind!=='levels'&&this.pageKind!=='detail';
        if(this.mapViewport&&this.pager){
            this.mapViewport.getComponent(UITransform)!.setContentSize(width,height);
            this.pager.getComponent(UITransform)!.setContentSize(width*PAGE_COUNT,height);
            this.mapPages.forEach((map,p)=>{
                map.setPosition(p*width,0);map.getComponent(UITransform)!.setContentSize(width,height);
                this.mapContents[p].setScale(scale,scale,1);this.mapContents[p].setPosition(0,middle-14*scale);
            });
            this.swipe=this.slide=undefined;this.pager.setPosition(-this.selectedPage*width,0);
            this.mapPages.forEach((map,p)=>map.active=p===this.selectedPage);
        }
        this.syncBackdrop();
        const popup=this.popup;
        if(popup){
            popup.root.getComponent(UITransform)!.setContentSize(width,height);
            popup.dim.node.getComponent(UITransform)!.setContentSize(width,height);
            popup.dim.clear();popup.dim.fillColor=new Color(44,24,66,150);popup.dim.rect(-width/2,-height/2,width,height);popup.dim.fill();
            popup.motion.layout(scale,middle);
        }
        this.hud.setPosition(-width / 2 + 24 + 165, safe.topY - 56);
        this.wash.clear();
        this.wash.fillColor = this.pageKind === 'other' ? new Color(255, 251, 243, 205) : new Color(255, 244, 226, 12);
        this.wash.rect(-width / 2, -height / 2, width, height); this.wash.fill();
    }
    hide(): void { this.closePopupNow(); this.swipe = this.slide = undefined; this.pressed=undefined;this.root.active = false; }
    setSavePending(pending: boolean): void {
        this.pendingSave = pending; this.saveNotice.string = '未保存，正在重试';
        this.saveNotice.node.active = this.hudNotice.node.active = pending;
    }
    dispose(): void {
        this.closePopupNow();
        this.swipe = this.slide = undefined; this.pager = undefined;
        this.mapPages = []; this.pageDots = []; this.pageArrows = []; this.pageRange = undefined; this.backAction = undefined;
        this.mapContents=[];this.mapViewport=undefined;this.levelProgress=undefined;this.recommended=this.pressed=undefined;
        this.root.off(Node.EventType.TOUCH_START, this.swipeStart, this, true);
        this.root.off(Node.EventType.TOUCH_MOVE, this.swipeMove, this, true);
        this.root.off(Node.EventType.TOUCH_END, this.swipeEnd, this, true);
        this.root.off(Node.EventType.TOUCH_CANCEL, this.swipeCancel, this, true);
        this.root.destroy(); this.hud.destroy(); this.ammo.destroy();
    }
}

import { BlockInputEvents, Color, Graphics, isValid, Mask, Node, ScrollView, Sprite, tween, Tween, UIOpacity, UITransform,
    Vec2, view } from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';
import type { AchievementService } from '../../services/achievements/AchievementService';
import type { AchievementArtService } from '../../services/achievements/AchievementArtService';
import type { AchievementWallMusic } from '../../services/achievements/AchievementWallMusic';
import type { Platform } from '../../platform/Platform';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import { calculateVerticalSafeBounds } from '../ui/PlatformSafeLayout';
import { LOBBY_SHOWCASE_HEIGHT } from '../ui/LobbyBrandLayout';
import { achievementLabel, achievementNode, createAchievementImage, createAchievementTrophy,
    createAchievementTrophyGlow, fillRoundRect, hexColor, makeAchievementButton, shadeColor, strokeRoundRect,
    ACHIEVEMENT_COLORS as COLORS } from './AchievementArtwork';

interface WallServices {
    readonly achievements: AchievementService;
    readonly art: AchievementArtService;
    readonly music: AchievementWallMusic;
    readonly platform: Platform;
    readonly feedback: FeedbackService;
    readonly replay: (manifest: GameManifest) => void;
    /** 未获得奖杯的全屏详情；“去挑战”时回调 challenge。 */
    readonly preview: (manifest: GameManifest, challenge: () => void) => void;
}

/** 大厅展柜条的设计高度；宽度跟随大厅网格。 */
const SHOWCASE_HEIGHT = LOBBY_SHOWCASE_HEIGHT;
/** 展览柜以 750 设计宽度排版：外框宽度、每层三格、层高与内衬留白。 */
const CABINET_WIDTH = 700;
const CABINET_FRAME = 22;
const CABINET_COLUMNS = 3;
const SHELF_HEIGHT = 300;
const CABINET_PADDING_TOP = 30;
const CABINET_PADDING_BOTTOM = 44;
/** cabinet-shelf.png 为 1200 × 139，木板占 2～69 行，其下是投影。 */
const SHELF_ART_RATIO = 139 / 1200;
const SHELF_PLANK_TOP = 2 / 139;
/** 台面后沿到底座落点的深度。 */
const SHELF_SURFACE_DEPTH = 10;
/** 奖杯图底座下沿距图片顶部的比例。 */
const TROPHY_BASELINE = 421 / 432;
const PAGE_TOP_GAP = 6;
const TITLE_TO_CABINET_GAP = 14;
const PAGE_BOTTOM_GAP = 24;
const CABINET_COLORS = {
    wood: '#B5793F', woodDark: '#8A5527', woodLight: '#D9A066', gold: '#E9BE6A', back: '#FFF4E1',
    plaque: '#F1CF86', plaqueEdge: '#B98838', plaqueText: '#5A3712', lockedPlaque: '#E6E0E8', lockedText: '#8C7F96',
};
const SHOWCASE_COLORS = {
    face: '#FFF4E2', rim: '#FFFFFF', shadow: new Color(196, 110, 60, 46), title: '#5B2A18', text: '#9A6A4E',
    pipEmpty: '#EADCCB', go: '#EE7349',
};

/** 大厅只传入清单和公共服务；成就馆不访问具体游戏脚本或资源。 */
export class AchievementWall {
    private parent?: Node;
    private entry?: Node;
    private root?: Node;
    private openingTween?: Tween<UIOpacity>;
    private services?: WallServices;
    private games: readonly GameManifest[] = [];
    private enterGame?: (manifest: GameManifest) => void;
    private readonly cards: Node[] = [];

    /** 有成就的游戏时，大厅在品牌与网格之间为展柜条预留位置。 */
    get hasShowcase(): boolean {
        return this.games.length > 0;
    }

    mount(overlayParent: Node, showcaseParent: Node, games: readonly GameManifest[], services: WallServices,
        enterGame: (manifest: GameManifest) => void): void {
        this.parent = overlayParent;
        this.games = services.achievements.collection(games);
        this.services = services;
        this.enterGame = enterGame;
        if (this.games.length > 0) this.entry = this.createShowcase(showcaseParent);
        view.on('canvas-resize', this.layout, this);
    }

    /** 由大厅滚动内容布局调用：展柜条与品牌、网格一起滚动。y 为展柜中心在列表内的坐标。 */
    layoutShowcase(width: number, y: number, scale: number): void {
        const entry = this.entry;
        if (!entry?.isValid) return;
        const s = Math.max(0.01, scale);
        const designWidth = Math.max(420, width / s);
        entry.setScale(s, s, 1);
        entry.setPosition(0, y);
        if (Math.abs(entry.getComponent(UITransform)!.width - designWidth) > 0.5) this.drawShowcase(entry, designWidth);
    }

    open(): void {
        if (!this.parent?.isValid || !this.services || this.root?.isValid) return;
        const services = this.services;
        services.feedback.play('popup');
        services.music.enter();
        const root = achievementNode(this.parent, 'AchievementWall', 750, 1334);
        this.root = root;
        root.addComponent(BlockInputEvents);
        root.addComponent(Graphics);
        createAchievementImage(root, 'AchievementWallBackground', 'wall-background', 750, 1334, services.art, 'cover');

        // 标题与展柜同属一页，溢出时整页滚动；返回钮固定在左上角。
        const viewport = achievementNode(root, 'PageViewport', 750, 1334);
        viewport.addComponent(Mask);
        const page = achievementNode(viewport, 'PageContent', 750, 1334);
        page.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        const scroll = viewport.addComponent(ScrollView);
        scroll.content = page;
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.inertia = true;
        scroll.brake = 0.75;
        scroll.elastic = true;
        const header = achievementNode(page, 'Header', 360, 120);
        createAchievementImage(header, 'Title', 'wall-title', 360, 120, services.art);
        const cabinet = achievementNode(page, 'Cabinet', CABINET_WIDTH, this.cabinetHeight);
        cabinet.addComponent(Graphics);
        this.drawCabinet(cabinet, this.cabinetHeight);
        this.createShelves(cabinet);
        const back = createAchievementImage(root, 'CloseWall', 'wall-back', 88, 88, services.art);
        makeAchievementButton(back, () => { this.services?.feedback.play('uiButton'); this.close(); }, 0.92);
        this.layout();
        scroll.scrollToOffset(new Vec2(0, 0), 0);

        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 0;
        this.openingTween = tween(opacity).to(0.18, { opacity: 255 }, { easing: 'sineOut' }).start();
    }

    close(restoreMusic = true): void {
        const root = this.root;
        this.root = undefined;
        this.cards.length = 0;
        this.openingTween?.stop();
        this.openingTween = undefined;
        if (root) this.services?.music.leave(restoreMusic);
        // 场景会先销毁子节点，再调用 LobbyEntry.onDestroy；此时只清引用，不再访问或销毁失效节点。
        // 严格校验也包含已调用 destroy()、尚未到帧末实际销毁的节点。
        if (root && isValid(root, true)) root.destroy();
    }

    unmount(): void {
        view.off('canvas-resize', this.layout, this);
        this.close(false);
        const entry = this.entry;
        this.entry = undefined;
        if (entry && isValid(entry, true)) entry.destroy();
        this.services = undefined;
        this.parent = undefined;
        this.enterGame = undefined;
        this.games = [];
    }

    private unlockedCount(): number {
        const services = this.services;
        return services ? this.games.filter(game => !!services.achievements.getRecord(game)?.unlockedAt).length : 0;
    }

    private createShowcase(parent: Node): Node {
        const entry = achievementNode(parent, 'AchievementEntry', 678, SHOWCASE_HEIGHT);
        entry.addComponent(Graphics);
        makeAchievementButton(entry, () => this.open(), 0.97);
        createAchievementImage(entry, 'AchievementEntryIcon', 'entry-icon', 136, 136, this.services!.art);
        const count = this.unlockedCount();
        achievementLabel(entry, 'EntryTitle', '我的成就墙', 0, 28, 280, 42, 32, SHOWCASE_COLORS.title, true, 'left');
        achievementLabel(entry, 'CollectionCount', `已点亮 ${count} / ${this.games.length} 座专属奖杯`, 0, -6,
            320, 30, 22, SHOWCASE_COLORS.text, false, 'left');
        achievementNode(entry, 'CollectionPips', 300, 12).addComponent(Graphics);
        const go = achievementNode(entry, 'EntryGo', 112, 56);
        go.addComponent(Graphics);
        achievementLabel(go, 'Caption', '查看', -8, 2, 64, 40, 25, '#FFFFFF', true);
        this.drawShowcase(entry, 678);
        return entry;
    }

    private drawShowcase(entry: Node, width: number): void {
        const height = SHOWCASE_HEIGHT;
        entry.getComponent(UITransform)!.setContentSize(width, height);
        const g = entry.getComponent(Graphics)!;
        g.clear();
        fillRoundRect(g, 0, -6, width, height, 34, SHOWCASE_COLORS.shadow);
        fillRoundRect(g, 0, 0, width, height, 34, hexColor(SHOWCASE_COLORS.rim, 240));
        fillRoundRect(g, 0, 0, width - 8, height - 8, 30, hexColor(SHOWCASE_COLORS.face));
        // 图标后的暖金光斑，让展柜像被点亮。
        const iconX = -width / 2 + 82;
        for (let i = 5; i >= 1; i--) {
            g.fillColor = new Color(255, 205, 120, 16);
            g.circle(iconX, 0, 26 + i * 9); g.fill();
        }
        entry.getChildByName('AchievementEntryIcon')?.setPosition(iconX, 8);
        const textX = -width / 2 + 164;
        entry.getChildByName('EntryTitle')?.setPosition(textX + 140, 28);
        entry.getChildByName('CollectionCount')?.setPosition(textX + 160, -6);

        const pips = entry.getChildByName('CollectionPips')!;
        const total = this.games.length, gap = 6;
        const pipWidth = Math.min(30, (300 - gap * (total - 1)) / Math.max(1, total));
        const pipsWidth = pipWidth * total + gap * (total - 1);
        pips.getComponent(UITransform)!.setContentSize(pipsWidth, 12);
        pips.setPosition(textX + pipsWidth / 2, -36);
        const pg = pips.getComponent(Graphics)!;
        pg.clear();
        this.games.forEach((game, index) => {
            const lit = !!this.services?.achievements.getRecord(game)?.unlockedAt;
            fillRoundRect(pg, -pipsWidth / 2 + pipWidth / 2 + index * (pipWidth + gap), 0, pipWidth, 10, 5,
                lit ? hexColor(game.achievement!.color) : hexColor(SHOWCASE_COLORS.pipEmpty));
        });

        const go = entry.getChildByName('EntryGo')!;
        go.setPosition(width / 2 - 82, 0);
        const gg = go.getComponent(Graphics)!;
        gg.clear();
        fillRoundRect(gg, 0, -3, 112, 52, 26, shadeColor(SHOWCASE_COLORS.go, 0.2));
        fillRoundRect(gg, 0, 2, 112, 52, 26, hexColor(SHOWCASE_COLORS.go));
        gg.strokeColor = Color.WHITE;
        gg.lineWidth = 4;
        gg.moveTo(26, 12); gg.lineTo(36, 2); gg.lineTo(26, -8);
        gg.stroke();
    }

    private get shelfCount(): number {
        return Math.max(1, Math.ceil(this.games.length / CABINET_COLUMNS));
    }

    /** 柜体高度随层数撑开，不在柜内滚动。 */
    private get cabinetHeight(): number {
        return CABINET_FRAME * 2 + CABINET_PADDING_TOP + this.shelfCount * SHELF_HEIGHT + CABINET_PADDING_BOTTOM;
    }

    /** 每层一块玻璃木隔板，最多三格；最后一层不满时居中摆放。坐标以柜体中心为原点。 */
    private createShelves(cabinet: Node): void {
        const innerWidth = CABINET_WIDTH - CABINET_FRAME * 2, cellWidth = innerWidth / CABINET_COLUMNS;
        const innerTop = this.cabinetHeight / 2 - CABINET_FRAME;
        for (let shelf = 0; shelf < this.shelfCount; shelf++) {
            const row = achievementNode(cabinet, `Shelf-${shelf}`, innerWidth, SHELF_HEIGHT);
            row.setPosition(0, innerTop - CABINET_PADDING_TOP - SHELF_HEIGHT * (shelf + 0.5));
            const games = this.games.slice(shelf * CABINET_COLUMNS, (shelf + 1) * CABINET_COLUMNS);
            const lights = achievementNode(row, 'Spotlights', innerWidth, SHELF_HEIGHT).addComponent(Graphics);
            const shelfWidth = innerWidth - 12, shelfHeight = shelfWidth * SHELF_ART_RATIO;
            const plankTop = -SHELF_HEIGHT / 2 + 64;
            const plank = createAchievementImage(row, 'ShelfPlank', 'cabinet-shelf', shelfWidth, shelfHeight, this.services!.art);
            plank.setPosition(0, plankTop - shelfHeight / 2 + shelfHeight * SHELF_PLANK_TOP);
            games.forEach((game, index) => {
                const x = (index - (games.length - 1) / 2) * cellWidth;
                this.cards.push(this.createSlot(row, lights, game, x, plankTop, cellWidth));
            });
        }
    }

    /** 一格展位：顶光、立在隔板上的奖杯、隔板前沿的名牌。整格可点，打开全屏详情。 */
    private createSlot(row: Node, lights: Graphics, game: GameManifest, x: number, plankTop: number,
        cellWidth: number): Node {
        const services = this.services!;
        const definition = game.achievement!;
        const unlocked = !!services.achievements.getRecord(game)?.unlockedAt;
        if (unlocked) {
            // 暖白顶光从柜顶洒向奖杯，隔板上留一圈光斑。
            for (let i = 0; i < 6; i++) {
                const spread = 34 + i * 9, alpha = 16 - i * 2;
                lights.fillColor = new Color(255, 236, 196, alpha);
                lights.moveTo(x - 18 - i * 3, SHELF_HEIGHT / 2 - 6);
                lights.lineTo(x + 18 + i * 3, SHELF_HEIGHT / 2 - 6);
                lights.lineTo(x + spread + 24, plankTop + 6);
                lights.lineTo(x - spread - 24, plankTop + 6);
                lights.close(); lights.fill();
            }
            for (let i = 4; i >= 1; i--) {
                lights.fillColor = new Color(255, 226, 160, 22);
                lights.ellipse(x, plankTop + 4, 26 + i * 12, 6 + i * 3); lights.fill();
            }
        }
        const slot = achievementNode(row, `AchievementCard-${game.id}`,
            cellWidth - 8, SHELF_HEIGHT - 10);
        slot.setPosition(x, 0);
        const trophySize = 196;
        // 隔板台面有透视进深：底座落在台面中线，而不是后沿。
        const baseY = plankTop - SHELF_SURFACE_DEPTH;
        const contact = achievementNode(slot, 'ContactShadow', 150, 30).addComponent(Graphics);
        contact.node.setPosition(0, baseY);
        for (let i = 3; i >= 1; i--) {
            contact.fillColor = new Color(110, 70, 30, unlocked ? 22 : 14);
            contact.ellipse(0, 0, 28 + i * 13, 4 + i * 2.5); contact.fill();
        }
        const niche = achievementNode(slot, 'DisplayNiche', trophySize, trophySize);
        // 让图片内的实体底座落在同一台面上，而不是对齐带透明留白的画布底边。
        niche.setPosition(0, baseY + trophySize * (TROPHY_BASELINE - 0.5));
        if (unlocked) {
            createAchievementTrophyGlow(niche, 'TrophyGlow');
        }
        const trophy = createAchievementTrophy(niche, definition, services.art, !unlocked, trophySize);
        if (!unlocked) {
            const lock = achievementNode(niche, 'LockedBadge', 40, 40);
            lock.setPosition(58, -52);
            const lg = lock.addComponent(Graphics);
            lg.fillColor = Color.WHITE; lg.circle(0, 0, 19); lg.fill();
            lg.fillColor = hexColor('#B5AABE'); lg.circle(0, 0, 15.5); lg.fill();
            lg.fillColor = Color.WHITE; lg.roundRect(-7, -8, 14, 10, 2); lg.fill();
            lg.strokeColor = Color.WHITE; lg.lineWidth = 2.5; lg.arc(0, 2, 4.5, 0, Math.PI, true); lg.stroke();
        }
        const plate = achievementNode(slot, 'NamePlate', 176, 40);
        plate.setPosition(0, plankTop - 62);
        const pg = plate.addComponent(Graphics);
        fillRoundRect(pg, 0, -2, 176, 40, 10, unlocked ? hexColor(CABINET_COLORS.plaqueEdge) : hexColor('#CFC6D3'));
        fillRoundRect(pg, 0, 0, 176, 38, 10, unlocked ? hexColor(CABINET_COLORS.plaque) : hexColor(CABINET_COLORS.lockedPlaque));
        strokeRoundRect(pg, 0, 0, 166, 30, 7, unlocked ? new Color(255, 245, 214, 160) : new Color(255, 255, 255, 140), 1.2);
        achievementLabel(plate, 'AchievementName', definition.name, 0, 0, 156, 32, 20,
            unlocked ? CABINET_COLORS.plaqueText : CABINET_COLORS.lockedText, true);
        makeAchievementButton(slot, () => {
            const current = this.services;
            if (!current) return;
            current.feedback.play('uiButton');
            if (unlocked) current.replay(game);
            else current.preview(game, () => {
                const enter = this.enterGame;
                this.close();
                enter?.(game);
            });
        }, 0.96);
        return slot;
    }

    /** 柜体：暖木外框 + 金色内线 + 奶油色背板。 */
    private drawCabinet(cabinet: Node, height: number): void {
        const width = CABINET_WIDTH, g = cabinet.getComponent(Graphics)!;
        g.clear();
        fillRoundRect(g, 0, -8, width, height, 44, new Color(120, 72, 36, 60));
        fillRoundRect(g, 0, 0, width, height, 44, hexColor(CABINET_COLORS.woodDark));
        fillRoundRect(g, 0, 3, width - 6, height - 6, 41, hexColor(CABINET_COLORS.wood));
        fillRoundRect(g, 0, height / 2 - 14, width - 70, 6, 3, hexColor(CABINET_COLORS.woodLight, 150));
        const innerWidth = width - CABINET_FRAME * 2, innerHeight = height - CABINET_FRAME * 2;
        strokeRoundRect(g, 0, 0, innerWidth + 8, innerHeight + 8, 28, hexColor(CABINET_COLORS.gold), 3);
        fillRoundRect(g, 0, 0, innerWidth, innerHeight, 24, hexColor(CABINET_COLORS.back));
        // 背板顶部的柔和内阴影，像玻璃柜内的进深。
        for (let i = 0; i < 5; i++) {
            fillRoundRect(g, 0, innerHeight / 2 - 6 - i * 5, innerWidth - 8, 12, 6, new Color(196, 150, 96, 14));
        }
    }

    private readonly layout = (): void => {
        if (!this.services) return;
        const root = this.root;
        if (!root?.isValid) return;
        const size = view.getVisibleSize();
        const width = size.width || 750, height = size.height || 1334;
        const safe = calculateVerticalSafeBounds(height, this.services.platform.getLayoutInfo(), 16);
        root.setSiblingIndex(this.parent!.children.length - 1);
        root.getComponent(UITransform)!.setContentSize(width, height);
        const g = root.getComponent(Graphics)!;
        g.clear(); g.fillColor = hexColor(COLORS.paper);
        g.rect(-width / 2, -height / 2, width, height); g.fill();
        const background = root.getChildByName('AchievementWallBackground')!.getComponent(Sprite)!;
        this.services.art.fit(background, width, height, 'cover');

        const scale = Math.min(1, (width - 24) / CABINET_WIDTH);
        const back = root.getChildByName('CloseWall')!;
        back.setScale(scale, scale, 1);
        back.setPosition(-width / 2 + 16 + 44 * scale, safe.topY - 64 * scale);

        // 滚动视口顶边在胶囊/安全区下方，底边延伸到屏幕底；底部安全区作为页尾留白。
        const viewport = root.getChildByName('PageViewport')!;
        const viewportHeight = Math.max(1, safe.topY + height / 2);
        viewport.getComponent(UITransform)!.setContentSize(width, viewportHeight);
        viewport.setPosition(0, safe.topY - viewportHeight / 2);
        const page = viewport.getChildByName('PageContent')!;
        const header = page.getChildByName('Header')!;
        header.setScale(scale, scale, 1);
        header.setPosition(0, -(PAGE_TOP_GAP + 60) * scale);
        const cabinet = page.getChildByName('Cabinet')!;
        cabinet.setScale(scale, scale, 1);
        const cabinetTop = (PAGE_TOP_GAP + 120 + TITLE_TO_CABINET_GAP) * scale;
        cabinet.setPosition(0, -cabinetTop - this.cabinetHeight * scale / 2);
        const bottomSafeInset = Math.max(0, safe.bottomY + height / 2);
        const pageHeight = cabinetTop + (this.cabinetHeight + PAGE_BOTTOM_GAP) * scale + bottomSafeInset;
        page.getComponent(UITransform)!.setContentSize(width, Math.max(viewportHeight, pageHeight));
        page.setPosition(0, viewportHeight / 2);
    };
}

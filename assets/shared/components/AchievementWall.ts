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
    /** 底板由大厅加载与管理；公共成就组件只负责排布九宫格。 */
    readonly bindEntrySkin: (sprite: Sprite, onLoaded: () => void) => void;
    /** 最近一次游玩时间，未玩过为 0；展柜条据此挑选最近在玩的游戏。 */
    readonly lastPlayedAt: (manifest: GameManifest) => number;
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
    face: '#FFF4E2', rim: '#FFFFFF', shadow: new Color(196, 110, 60, 46),
    title: '#5B2A18', text: '#9A6A4E',
    track: '#EADCCB', go: '#EE7349',
};
/** 右侧“查看”按钮的尺寸与距展柜右沿的中心距离。 */
const SHOWCASE_GO = { width: 112, height: 56, right: 82 } as const;
const SHOWCASE_ICON_SIZE = 96;
const SHOWCASE_BAR_HEIGHT = 12;
/**
 * 底板保留原有底部厚边，奶油面的视觉中心比条带中心高约 5；
 * 以下纵坐标都按奶油面居中：进行中状态的说明、成就名与进度、进度条，以及收藏总览的两行。
 */
const SHOWCASE_FACE_CENTER = 5;
const SHOWCASE_ROWS = {
    caption: SHOWCASE_FACE_CENTER + 31,
    title: SHOWCASE_FACE_CENTER - 5,
    bar: SHOWCASE_FACE_CENTER - 36,
    summaryTitle: SHOWCASE_FACE_CENTER + 17,
    summary: SHOWCASE_FACE_CENTER - 22,
} as const;

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
    /** 展柜条进度条的数据；收藏总览状态下为空。 */
    private spotlightProgress?: { readonly ratio: number; readonly color: string };
    private spotlightGame?: GameManifest;
    /** 游戏卡片在展柜条坐标系中的宽度；底板按它换算绘制比例，使边框与卡片同粗。 */
    private entryCardWidth = 320;

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

    /**
     * 由大厅滚动内容布局调用：展柜条与品牌、网格一起滚动，宽度与游戏网格一致。
     * y 为展柜中心在列表内的坐标；cardWidth 为游戏卡片宽度，用于让底板边框与卡片同粗。
     */
    layoutShowcase(width: number, y: number, scale: number, cardWidth: number): void {
        const entry = this.entry;
        if (!entry?.isValid) return;
        const s = Math.max(0.01, scale);
        const designWidth = Math.max(420, width / s);
        const designCardWidth = Math.max(1, cardWidth / s);
        entry.setScale(s, s, 1);
        entry.setPosition(0, y);
        if (Math.abs(entry.getComponent(UITransform)!.width - designWidth) > 0.5
            || Math.abs(this.entryCardWidth - designCardWidth) > 0.5) {
            this.entryCardWidth = designCardWidth;
            this.drawShowcase(entry, designWidth);
        }
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
        const skin = entry && isValid(entry, true) ? entry.getChildByName('EntrySkin')?.getComponent(Sprite) : null;
        if (skin) skin.spriteFrame = null;
        if (entry && isValid(entry, true)) entry.destroy();
        this.services = undefined;
        this.parent = undefined;
        this.enterGame = undefined;
        this.spotlightProgress = undefined;
        this.spotlightGame = undefined;
        this.games = [];
    }

    private unlockedCount(): number {
        const services = this.services;
        return services ? this.games.filter(game => !!services.achievements.getRecord(game)?.unlockedAt).length : 0;
    }

    /**
     * 展柜条展示最近玩过、奖杯尚未获得的那款游戏的下一座奖杯（与成就墙一致显示为灰色）；
     * 没有这样的游戏时展示收藏总览。奖杯在游戏内达成即自动获得，因此没有“待领取”状态。
     */
    private spotlight(): GameManifest | undefined {
        const services = this.services;
        if (!services) return undefined;
        let latest: GameManifest | undefined;
        let latestAt = 0;
        for (const game of this.games) {
            const playedAt = services.lastPlayedAt(game);
            if (playedAt > latestAt && !services.achievements.getRecord(game)?.unlockedAt) {
                latest = game;
                latestAt = playedAt;
            }
        }
        return latest;
    }

    private createShowcase(parent: Node): Node {
        const services = this.services!;
        const entry = achievementNode(parent, 'AchievementEntry', 678, SHOWCASE_HEIGHT);
        // 与游戏卡片共用纸面底板；光斑画在底板之上、图标之下。
        entry.addComponent(Graphics);
        const skin = achievementNode(entry, 'EntrySkin', 678, SHOWCASE_HEIGHT).addComponent(Sprite);
        skin.sizeMode = Sprite.SizeMode.CUSTOM;
        services.bindEntrySkin(skin, () => this.drawShowcase(entry, entry.getComponent(UITransform)!.width));
        achievementNode(entry, 'EntryGlow', 678, SHOWCASE_HEIGHT).addComponent(Graphics);
        makeAchievementButton(entry, () => this.open(), 0.97);
        const game = this.spotlight();
        this.spotlightGame = game;
        if (game) {
            const definition = game.achievement!;
            createAchievementTrophy(entry, definition, services.art, true, SHOWCASE_ICON_SIZE)
                .name = 'AchievementEntryIcon';
            const progress = Math.floor(Math.min(definition.target, services.achievements.getRecord(game)?.progress ?? 0));
            achievementLabel(entry, 'EntryCaption', `下一座奖杯 · ${game.name}`, 0, SHOWCASE_ROWS.caption, 300, 30, 22,
                SHOWCASE_COLORS.text, false, 'left');
            achievementLabel(entry, 'EntryTitle', definition.name, 0, SHOWCASE_ROWS.title, 260, 40, 30,
                SHOWCASE_COLORS.title, true, 'left');
            if (definition.target > 1) {
                const unit = definition.unit ? ` ${definition.unit}` : '';
                achievementLabel(entry, 'EntryProgress', `${progress}/${definition.target}${unit}`, 0, SHOWCASE_ROWS.title,
                    200, 34, 22, SHOWCASE_COLORS.text, true, 'right');
                const bar = achievementNode(entry, 'EntryProgressBar', 300, SHOWCASE_BAR_HEIGHT);
                bar.addComponent(Graphics);
                this.spotlightProgress = Object.freeze({
                    ratio: progress / definition.target,
                    color: definition.color,
                });
            } else {
                // 一次性达成的成就没有中间进度，改为说明达成条件。
                achievementLabel(entry, 'EntryDescription', definition.description, 0, SHOWCASE_ROWS.bar, 300, 28, 20,
                    SHOWCASE_COLORS.text, false, 'left');
            }
        } else {
            createAchievementImage(entry, 'AchievementEntryIcon', 'entry-icon', SHOWCASE_ICON_SIZE, SHOWCASE_ICON_SIZE,
                services.art);
            const count = this.unlockedCount();
            const total = this.games.length;
            const summary = count === 0 ? `${total} 座专属奖杯等你收集`
                : count >= total ? `已集齐全部 ${total} 座专属奖杯`
                    : `已点亮 ${count} / ${total} 座专属奖杯`;
            achievementLabel(entry, 'EntryTitle', '我的成就墙', 0, SHOWCASE_ROWS.summaryTitle, 280, 42, 32,
                SHOWCASE_COLORS.title, true, 'left');
            achievementLabel(entry, 'EntrySummary', summary, 0, SHOWCASE_ROWS.summary, 320, 30, 22,
                SHOWCASE_COLORS.text, false, 'left');
        }
        const go = achievementNode(entry, 'EntryGo', SHOWCASE_GO.width, SHOWCASE_GO.height);
        go.addComponent(Graphics);
        achievementLabel(go, 'Caption', '查看', -8, 2, 64, 40, 25, '#FFFFFF', true);
        this.drawShowcase(entry, 678);
        return entry;
    }

    /** 左侧图标、中间文字列、右侧“查看”按钮；文字列宽度随大厅网格宽度伸缩。 */
    private drawShowcase(entry: Node, width: number): void {
        const height = SHOWCASE_HEIGHT;
        entry.getComponent(UITransform)!.setContentSize(width, height);
        const g = entry.getComponent(Graphics)!;
        this.layoutEntrySkin(entry, width, height);
        g.clear();
        if (!entry.getChildByName('EntrySkin')?.getComponent(Sprite)?.spriteFrame) {
            fillRoundRect(g, 0, -6, width, height, 34, SHOWCASE_COLORS.shadow);
            fillRoundRect(g, 0, 0, width, height, 34, hexColor(SHOWCASE_COLORS.rim, 240));
            fillRoundRect(g, 0, 0, width - 8, height - 8, 30, hexColor(SHOWCASE_COLORS.face));
        }
        const iconX = -width / 2 + 70;
        const glow = entry.getChildByName('EntryGlow')!;
        glow.getComponent(UITransform)!.setContentSize(width, height);
        const gg = glow.getComponent(Graphics)!;
        gg.clear();
        if (!this.spotlightGame) {
            // 收藏总览的展柜图标后加暖金光斑，像被点亮；未获得的灰色奖杯与成就墙一致不加光。
            for (let i = 5; i >= 1; i--) {
                gg.fillColor = new Color(255, 205, 120, 16);
                gg.circle(iconX, SHOWCASE_FACE_CENTER, (28 + i * 9) * SHOWCASE_ICON_SIZE / 120); gg.fill();
            }
        }
        entry.getChildByName('AchievementEntryIcon')?.setPosition(iconX, SHOWCASE_FACE_CENTER);

        const textLeft = -width / 2 + 136;
        const textRight = width / 2 - SHOWCASE_GO.right - SHOWCASE_GO.width / 2 - 20;
        const textWidth = textRight - textLeft;
        const placeLeft = (name: string): void => {
            const node = entry.getChildByName(name);
            const transform = node?.getComponent(UITransform);
            if (!node || !transform) return;
            const labelWidth = name === 'EntryTitle' && entry.getChildByName('EntryProgress')
                ? Math.max(0, textWidth - 200 - 12) : textWidth;
            transform.setContentSize(labelWidth, transform.height);
            node.setPosition(textLeft + labelWidth / 2, node.position.y);
        };
        ['EntryCaption', 'EntryTitle', 'EntryDescription', 'EntrySummary'].forEach(placeLeft);
        const progressLabel = entry.getChildByName('EntryProgress');
        progressLabel?.setPosition(textRight - 100, progressLabel.position.y);

        const bar = entry.getChildByName('EntryProgressBar');
        const progress = this.spotlightProgress;
        if (bar && progress) {
            bar.getComponent(UITransform)!.setContentSize(textWidth, SHOWCASE_BAR_HEIGHT);
            bar.setPosition(textLeft + textWidth / 2, SHOWCASE_ROWS.bar);
            const bg = bar.getComponent(Graphics)!;
            bg.clear();
            fillRoundRect(bg, 0, 0, textWidth, SHOWCASE_BAR_HEIGHT, SHOWCASE_BAR_HEIGHT / 2,
                hexColor(SHOWCASE_COLORS.track));
            // 进度条至少露出一个圆头，刚开始的进度也看得见。
            const filled = Math.max(SHOWCASE_BAR_HEIGHT, textWidth * Math.min(1, progress.ratio));
            fillRoundRect(bg, -(textWidth - filled) / 2, 0, filled, SHOWCASE_BAR_HEIGHT, SHOWCASE_BAR_HEIGHT / 2,
                hexColor(progress.color));
        }

        const go = entry.getChildByName('EntryGo')!;
        go.setPosition(width / 2 - SHOWCASE_GO.right, SHOWCASE_FACE_CENTER);
        const gg2 = go.getComponent(Graphics)!;
        gg2.clear();
        fillRoundRect(gg2, 0, -3, SHOWCASE_GO.width, SHOWCASE_GO.height - 4, 26, shadeColor(SHOWCASE_COLORS.go, 0.2));
        fillRoundRect(gg2, 0, 2, SHOWCASE_GO.width, SHOWCASE_GO.height - 4, 26, hexColor(SHOWCASE_COLORS.go));
        gg2.strokeColor = Color.WHITE;
        gg2.lineWidth = 4;
        gg2.moveTo(26, 12); gg2.lineTo(36, 2); gg2.lineTo(26, -8);
        gg2.stroke();
    }

    /** 按游戏卡片宽度换算原图分辨率，让展柜与游戏卡片的圆角、底部厚边保持相同比例。 */
    private layoutEntrySkin(entry: Node, width: number, height: number): void {
        const skin = entry.getChildByName('EntrySkin')?.getComponent(Sprite);
        if (!skin) return;
        const textureWidth = skin.spriteFrame?.texture.width ?? 0;
        const resolution = textureWidth > 0 ? textureWidth / this.entryCardWidth : 1;
        skin.node.setPosition(0, 0);
        skin.node.getComponent(UITransform)?.setContentSize(width * resolution, height * resolution);
        skin.node.setScale(1 / resolution, 1 / resolution, 1);
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

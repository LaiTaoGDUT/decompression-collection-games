import {
    BlockInputEvents,
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    isValid,
    Label,
    Mask,
    Node,
    ScrollView,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    view,
} from 'cc';
import type { Platform } from '../../platform/Platform';
import type { GameManifest } from '../../runtime/GameManifest';
import type { AssetService } from '../../services/asset/AssetService';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import type { StorageService } from '../../services/storage/StorageService';
import { setLabelBold } from '../../services/font/FontBinding';
import {
    ANNOUNCEMENT_COLLECTION_ID,
    ANNOUNCEMENT_SECTION_KEYS,
    ANNOUNCEMENT_SECTION_TITLES,
    type Announcement,
    type AnnouncementEntry,
    type AnnouncementSectionKey,
} from '../../services/config/Announcement';
import { calculateVerticalSafeBounds } from '../../shared/ui/PlatformSafeLayout';
import {
    LOBBY_DESIGN_WIDTH,
    LOBBY_HEADER_TOOL_CELL_HEIGHT,
    LOBBY_HEADER_TOOL_ICON_SIZE,
    LOBBY_HEADER_TOOLBAR_WIDTH,
} from '../../shared/ui/LobbyBrandLayout';
import { drawLobbyModalOverlay, LOBBY_MODAL_MOTION } from './LobbyModalMotion';

interface AnnouncementServices {
    readonly assets: AssetService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    /** 按公告条目的 gameId 查游戏清单，用来取大厅封面；查不到（如已下架）时返回 undefined。 */
    readonly findGame: (gameId: string) => GameManifest | undefined;
}

/** 点击条目进入游戏：只有当前设备与版本可玩的游戏才可点击，进入流程由大厅提供。 */
interface AnnouncementGameEntry {
    readonly playableGames: readonly GameManifest[];
    readonly enterGame: (manifest: GameManifest) => void;
}

const BUNDLE = 'lobby-covers';
const ART = {
    entry: 'visual/ui/lobby-notice-icon/texture',
    title: 'visual/ui/lobby-notice-title/texture',
    panel: 'visual/ui/lobby-settings-panel/texture',
    close: 'visual/ui/lobby-close-button/texture',
    brand: 'visual/branding/lobby-cn-title-logo-v3/texture',
    newGames: 'visual/ui/lobby-notice-new-game/texture',
    features: 'visual/ui/lobby-notice-feature/texture',
    fixes: 'visual/ui/lobby-notice-fix/texture',
} as const;

/** 与设置面板同一套大厅色板：奶油纸面、可可棕文字、橙色主操作。 */
const COLOR = {
    overlay: new Color(37, 34, 66, 166),
    surface: new Color(255, 249, 237, 255),
    primary: new Color(91, 55, 42, 255),
    secondary: new Color(139, 102, 83, 255),
    action: new Color(243, 112, 42, 255),
    actionShade: new Color(198, 80, 26, 255),
    card: new Color(255, 255, 255, 255),
    cardShade: new Color(240, 221, 196, 255),
    unread: new Color(235, 62, 62, 255),
};
/** 三个模块各自的主色：模块标题、游戏名与封面底色。 */
const SECTION_COLOR: Readonly<Record<AnnouncementSectionKey, { ink: Color; shade: Color; chip: Color }>> = {
    newGames: { ink: new Color(222, 96, 44, 255), shade: new Color(176, 70, 26, 255), chip: new Color(255, 226, 204, 255) },
    features: { ink: new Color(32, 140, 160, 255), shade: new Color(22, 106, 122, 255), chip: new Color(209, 241, 243, 255) },
    fixes: { ink: new Color(96, 132, 44, 255), shade: new Color(74, 104, 32, 255), chip: new Color(227, 240, 205, 255) },
};

/** 弹窗以 750 设计宽度排版，整体按屏宽等比缩放。 */
const PANEL_WIDTH = 640;
const PANEL_PADDING_X = 40;
const BODY_WIDTH = PANEL_WIDTH - PANEL_PADDING_X * 2;
const TITLE_WIDTH = 400;
const TITLE_HEIGHT = 108;
/** 标题字图骑在面板上沿，向外探出的高度。 */
const TITLE_OVERHANG = 46;
const SUBTITLE_TOP = 78;
const BODY_TOP = 120;
const BODY_BOTTOM_GAP = 28;
const BUTTON_WIDTH = 240;
const BUTTON_HEIGHT = 76;
const BUTTON_BOTTOM = 40;
/** 模块标题：图标 + 模块名，右侧一条模块色细线引出下方条目。 */
const SECTION_HEADER_HEIGHT = 48;
const SECTION_ICON_SIZE = 40;
const SECTION_ICON_GAP = 10;
const SECTION_FONT_SIZE = 28;
const SECTION_RULE_GAP = 16;
const SECTION_RULE_WIDTH = 4;
const SECTION_HEADER_GAP = 14;
const SECTION_GAP = 32;
/** 条目卡片：左侧大厅同款封面（4:3），右侧游戏名与一句话说明。 */
const CARD_PADDING = 14;
const CARD_RADIUS = 22;
const CARD_SHADE_OFFSET = 4;
const CARD_GAP = 16;
const COVER_WIDTH = 168;
const COVER_HEIGHT = 126;
const COVER_RADIUS = 14;
const COVER_ICON_SIZE = 64;
const COVER_BRAND_INSET = 10;
const CARD_TEXT_GAP = 18;
/** 可进入游戏的卡片右侧的“去玩”箭头；所有卡片都预留这块宽度，文字排版保持一致。 */
const CARD_ARROW_SIZE = 36;
const CARD_ARROW_GAP = 10;
const CARD_TEXT_WIDTH = BODY_WIDTH - CARD_PADDING * 2 - COVER_WIDTH - CARD_TEXT_GAP - CARD_ARROW_GAP - CARD_ARROW_SIZE;
const NAME_HEIGHT = 40;
const NAME_FONT_SIZE = 28;
const NAME_TEXT_GAP = 4;
const ENTRY_FONT_SIZE = 24;
const ENTRY_LINE_HEIGHT = 32;
const CLOSE_SIZE = 64;
const CLOSE_MARGIN = 18;
const SCREEN_MARGIN = 24;
const CLOSE_DURATION = 0.24;
const UNREAD_DOT_RADIUS = 7;

type SpriteFit = { readonly mode: 'contain' | 'cover'; readonly width: number; readonly height: number };

/**
 * 大厅版本更新公告：从顶部栏公告按钮打开，未读时在入口右上角显示红点；
 * 有内容的模块按固定顺序从上到下排列，超出上下安全区时正文在弹窗内滚动；
 * 条目附带大厅同款游戏封面，可玩游戏的条目点击直接进入；
 * 弹出时与设置弹窗采用相同的原地缩放回弹，关闭时缩回公告按钮。
 * 只读取生效公告、游戏清单和公共服务，不依赖任何小游戏。
 */
export class LobbyAnnouncementPanel {
    private services?: AnnouncementServices;
    private games?: AnnouncementGameEntry;
    private announcement: Announcement | null = null;
    private overlayParent: Node | null = null;
    private entry: Node | null = null;
    private unreadDot: Node | null = null;
    private root: Node | null = null;
    private panel: Node | null = null;
    private panelScale = 1;
    private readonly overlay = { opacity: 0 };
    /** 展开/收起动画进行中，期间 resize 不改写面板位置与缩放。 */
    private transitioning = false;
    /** 正文全部模块排完后的总高度。 */
    private contentHeight = 0;
    private readonly frames = new Map<string, SpriteFrame>();
    private readonly frameRequests = new Map<string, Promise<SpriteFrame>>();
    private readonly animated = new Set<object>();
    private generation = 0;
    private opened = false;

    mount(overlayParent: Node, entrySlot: Node, announcement: Announcement | null, services: AnnouncementServices,
        games: AnnouncementGameEntry): void {
        this.unmount();
        this.generation++;
        this.services = services;
        this.games = games;
        this.announcement = announcement;
        this.overlayParent = overlayParent;
        if (!announcement) return;
        this.entry = this.createEntry(entrySlot);
        view.on('canvas-resize', this.layout, this);
        this.refreshUnreadDot();
    }

    unmount(): void {
        this.generation++;
        view.off('canvas-resize', this.layout, this);
        this.animated.forEach((target) => Tween.stopAllByTarget(target));
        this.animated.clear();
        const root = this.root;
        if (root && isValid(root, true)) root.destroy();
        const entry = this.entry;
        if (entry && isValid(entry, true)) entry.destroy();
        this.root = null;
        this.panel = null;
        this.entry = null;
        this.unreadDot = null;
        this.contentHeight = 0;
        this.opened = false;
        this.transitioning = false;
        this.frames.forEach((frame) => this.services?.assets.releaseRuntimeAsset(frame));
        this.frames.clear();
        this.frameRequests.clear();
        this.services = undefined;
        this.games = undefined;
        this.announcement = null;
        this.overlayParent = null;
    }

    readonly open = (): void => {
        const announcement = this.announcement;
        const services = this.services;
        const parent = this.overlayParent;
        if (!announcement || !services || !parent?.isValid || this.opened) return;
        this.opened = true;
        this.stopAnimations();
        try {
            services.storage.markAnnouncementSeen(announcement.id);
        } catch {
            // 落盘失败由存储服务保留待写快照并重试，不阻断公告展示。
        }
        this.refreshUnreadDot();
        services.feedback.play('popup');
        const root = this.root?.isValid ? this.root : this.createModal(parent, announcement);
        root.active = true;
        root.getComponent(UIOpacity)!.opacity = 255;
        this.panel!.getComponent(UIOpacity)!.opacity = 255;
        root.setSiblingIndex(parent.children.length - 1);
        // 每次打开都从正文顶部看起。
        this.transitioning = false;
        this.layout();

        const panel = this.panel!;
        const scale = this.panelScale;
        this.transitioning = true;
        panel.setScale(LOBBY_MODAL_MOTION.collapsedScaleX * scale, LOBBY_MODAL_MOTION.collapsedScaleY * scale, 1);
        this.overlay.opacity = 0;
        this.drawOverlay();
        this.animate(this.overlay, tween(this.overlay).to(LOBBY_MODAL_MOTION.openDuration, { opacity: 1 }, {
            easing: LOBBY_MODAL_MOTION.overlayOpenEasing,
            onUpdate: this.drawOverlay,
        }));
        this.animate(panel, tween(panel)
            .to(LOBBY_MODAL_MOTION.openDuration, { scale: new Vec3(scale, scale, 1) }, {
                easing: LOBBY_MODAL_MOTION.openEasing,
            })
            .call(() => {
                this.transitioning = false;
                this.layout();
            }));
    };

    private readonly close = (): void => {
        if (!this.opened) return;
        this.services?.feedback.play('uiButton');
        this.dismiss();
    };

    /** 收起：面板缩小飞回公告按钮，按钮回弹一下表示“收在这里”。 */
    private dismiss(): void {
        const root = this.root;
        const panel = this.panel;
        if (!this.opened || !root?.isValid || !panel?.isValid) return;
        this.opened = false;
        this.stopAnimations();
        this.transitioning = true;
        const destination = this.entryPosition() ?? panel.position.clone();
        const panelOpacity = panel.getComponent(UIOpacity)!;
        const overlayOpacity = root.getComponent(UIOpacity)!;
        this.animate(this.overlay, tween(this.overlay).to(CLOSE_DURATION, { opacity: 0 }, {
            easing: 'sineIn',
            onUpdate: this.drawOverlay,
        }));
        this.animate(overlayOpacity, tween(overlayOpacity).to(CLOSE_DURATION, { opacity: 0 }, { easing: 'sineIn' }));
        this.animate(panelOpacity, tween(panelOpacity)
            .delay(CLOSE_DURATION * 0.55)
            .to(CLOSE_DURATION * 0.45, { opacity: 0 }));
        this.animate(panel, tween(panel)
            .to(CLOSE_DURATION, {
                position: destination,
                scale: new Vec3(0.12 * this.panelScale, 0.12 * this.panelScale, 1),
            }, { easing: 'quadIn' })
            .call(() => {
                this.transitioning = false;
                if (root.isValid) root.active = false;
                this.bounceEntry();
            }));
    }

    private stopAnimations(): void {
        this.animated.forEach((target) => Tween.stopAllByTarget(target));
        this.animated.clear();
        this.entry?.setScale(1, 1, 1);
    }

    private animate<T extends object>(target: T, animation: Tween<T>): void {
        this.animated.add(target);
        animation.start();
    }

    private bounceEntry(): void {
        const entry = this.entry;
        if (!entry?.isValid) return;
        this.animate(entry, tween(entry)
            .to(0.1, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineOut' })
            .to(0.18, { scale: Vec3.ONE }, { easing: 'backOut' }));
    }

    /** 公告按钮中心在弹窗根节点中的坐标；按钮不可用时返回 undefined。 */
    private entryPosition(): Vec3 | undefined {
        const entry = this.entry;
        const rootTransform = this.root?.getComponent(UITransform);
        if (!entry?.isValid || !rootTransform) return undefined;
        return rootTransform.convertToNodeSpaceAR(entry.worldPosition);
    }

    private createEntry(slot: Node): Node {
        // 整格可点；图标画在顶部栏工具胶囊的下半格中央。
        const entry = this.node(slot, 'AnnouncementEntry', LOBBY_HEADER_TOOLBAR_WIDTH, LOBBY_HEADER_TOOL_CELL_HEIGHT);
        const icon = this.node(entry, 'AnnouncementEntryIcon', LOBBY_HEADER_TOOL_ICON_SIZE, LOBBY_HEADER_TOOL_ICON_SIZE);
        this.bindSprite(icon.addComponent(Sprite), ART.entry);
        const dotSize = (UNREAD_DOT_RADIUS + 1) * 2;
        const dot = this.node(entry, 'AnnouncementUnreadDot', dotSize, dotSize);
        dot.setPosition(LOBBY_HEADER_TOOL_ICON_SIZE / 2, LOBBY_HEADER_TOOL_ICON_SIZE / 2);
        const graphics = dot.addComponent(Graphics);
        graphics.fillColor = COLOR.unread;
        graphics.strokeColor = COLOR.surface;
        graphics.lineWidth = 2;
        graphics.circle(0, 0, UNREAD_DOT_RADIUS);
        graphics.fill();
        graphics.stroke();
        this.unreadDot = dot;
        const button = entry.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.09;
        entry.on(Button.EventType.CLICK, () => {
            this.services?.feedback.vibrate('light');
            this.open();
        });
        return entry;
    }

    private refreshUnreadDot(): void {
        if (!this.unreadDot?.isValid) return;
        this.unreadDot.active = !!this.announcement && !!this.services
            && !this.services.storage.hasSeenAnnouncement(this.announcement.id);
    }

    private createModal(parent: Node, announcement: Announcement): Node {
        const root = this.node(parent, 'AnnouncementModal', LOBBY_DESIGN_WIDTH, 1334);
        this.root = root;
        root.addComponent(BlockInputEvents);
        root.addComponent(Graphics);
        root.addComponent(UIOpacity);
        // 点击面板以外的遮罩区域收起；面板自身拦截事件，不会冒泡到这里。
        root.on(Node.EventType.TOUCH_END, this.close);

        const panel = this.node(root, 'AnnouncementPanel', PANEL_WIDTH, 100);
        this.panel = panel;
        panel.addComponent(BlockInputEvents);
        panel.addComponent(UIOpacity);
        const fallback = panel.addComponent(Graphics);
        const skin = this.node(panel, 'PanelSkin', PANEL_WIDTH, 100);
        const skinSprite = skin.addComponent(Sprite);
        skinSprite.type = Sprite.Type.SLICED;
        this.bindSprite(skinSprite, ART.panel, () => fallback.clear());

        const viewport = this.node(panel, 'BodyViewport', BODY_WIDTH, 100);
        viewport.addComponent(Mask);
        const body = this.node(viewport, 'BodyContent', BODY_WIDTH, 100);
        body.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        const scroll = viewport.addComponent(ScrollView);
        scroll.content = body;
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.inertia = true;
        scroll.brake = 0.75;
        scroll.elastic = true;

        let y = 0;
        for (const key of ANNOUNCEMENT_SECTION_KEYS) {
            const entries = announcement[key];
            if (entries.length === 0) continue;
            if (y < 0) y -= SECTION_GAP;
            y -= this.buildSection(body, key, entries, y);
        }
        this.contentHeight = -y;

        const title = this.node(panel, 'Title', TITLE_WIDTH, TITLE_HEIGHT);
        this.bindSprite(title.addComponent(Sprite), ART.title);
        const subtitle = this.label(panel, 'Subtitle', this.subtitle(announcement), BODY_WIDTH, 36, 24,
            COLOR.secondary, HorizontalTextAlignment.CENTER);
        subtitle.overflow = Label.Overflow.SHRINK;

        const close = this.node(panel, 'Close', CLOSE_SIZE, CLOSE_SIZE);
        this.bindSprite(close.addComponent(Sprite), ART.close);
        this.button(close, this.close, 0.92);

        const confirm = this.node(panel, 'Confirm', BUTTON_WIDTH, BUTTON_HEIGHT);
        const confirmGraphics = confirm.addComponent(Graphics);
        confirmGraphics.fillColor = COLOR.actionShade;
        confirmGraphics.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2 - 5, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_HEIGHT / 2);
        confirmGraphics.fill();
        confirmGraphics.fillColor = COLOR.action;
        confirmGraphics.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_HEIGHT / 2);
        confirmGraphics.fill();
        const confirmLabel = this.label(confirm, 'Caption', '知道了', BUTTON_WIDTH, BUTTON_HEIGHT, 32,
            Color.WHITE, HorizontalTextAlignment.CENTER);
        setLabelBold(confirmLabel, true);
        this.button(confirm, this.close, 0.95);
        return root;
    }

    /** 一个模块：标题行加条目卡片；返回模块高度。坐标以模块顶边为 0 向下为负。 */
    private buildSection(body: Node, key: AnnouncementSectionKey, entries: readonly AnnouncementEntry[], top: number): number {
        const section = this.node(body, `Section-${key}`, BODY_WIDTH, 100);
        section.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        section.setPosition(0, top);
        this.buildSectionHeader(section, key);
        let y = -SECTION_HEADER_HEIGHT - SECTION_HEADER_GAP;
        entries.forEach((entry, index) => {
            if (index > 0) y -= CARD_GAP;
            y -= this.buildCard(section, key, entry, index, y);
        });
        // 为最后一张卡片的投影留出空间。
        const height = -y + CARD_SHADE_OFFSET;
        section.getComponent(UITransform)!.setContentSize(BODY_WIDTH, height);
        return height;
    }

    private buildSectionHeader(section: Node, key: AnnouncementSectionKey): void {
        const color = SECTION_COLOR[key];
        const header = this.node(section, 'Header', BODY_WIDTH, SECTION_HEADER_HEIGHT);
        header.setPosition(0, -SECTION_HEADER_HEIGHT / 2);
        const left = -BODY_WIDTH / 2;

        const icon = this.node(header, 'Icon', SECTION_ICON_SIZE, SECTION_ICON_SIZE);
        icon.setPosition(left + SECTION_ICON_SIZE / 2, 0);
        this.bindSprite(icon.addComponent(Sprite), ART[key], undefined,
            { mode: 'contain', width: SECTION_ICON_SIZE, height: SECTION_ICON_SIZE });

        const textX = left + SECTION_ICON_SIZE + SECTION_ICON_GAP;
        const label = this.label(header, 'Title', ANNOUNCEMENT_SECTION_TITLES[key], BODY_WIDTH / 2, SECTION_HEADER_HEIGHT,
            SECTION_FONT_SIZE, color.ink, HorizontalTextAlignment.LEFT);
        setLabelBold(label, true);
        label.overflow = Label.Overflow.NONE;
        label.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        label.node.setPosition(textX, 0);
        label.updateRenderData(true);

        const ruleStart = textX + label.node.getComponent(UITransform)!.width + SECTION_RULE_GAP;
        const rule = header.addComponent(Graphics);
        rule.strokeColor = color.chip;
        rule.lineWidth = SECTION_RULE_WIDTH;
        rule.lineCap = Graphics.LineCap.ROUND;
        rule.moveTo(ruleStart, 0);
        rule.lineTo(BODY_WIDTH / 2 - SECTION_RULE_WIDTH / 2, 0);
        rule.stroke();
    }

    private buildCard(section: Node, key: AnnouncementSectionKey, entry: AnnouncementEntry, index: number, top: number): number {
        const color = SECTION_COLOR[key];
        const card = this.node(section, `Entry-${index}`, BODY_WIDTH, 100);
        const textX = -BODY_WIDTH / 2 + CARD_PADDING + COVER_WIDTH + CARD_TEXT_GAP;

        const name = this.label(card, 'Name', entry.gameName, CARD_TEXT_WIDTH, NAME_HEIGHT, NAME_FONT_SIZE,
            color.ink, HorizontalTextAlignment.LEFT);
        setLabelBold(name, true);
        name.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        const text = this.label(card, 'Text', entry.text, CARD_TEXT_WIDTH, ENTRY_LINE_HEIGHT, ENTRY_FONT_SIZE,
            COLOR.primary, HorizontalTextAlignment.LEFT);
        text.verticalAlign = VerticalTextAlignment.TOP;
        text.overflow = Label.Overflow.RESIZE_HEIGHT;
        text.enableWrapText = true;
        text.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        text.updateRenderData(true);
        const textHeight = Math.max(ENTRY_LINE_HEIGHT, text.node.getComponent(UITransform)!.height);

        // 封面和文字块都以卡片中线垂直居中，多行文字会把卡片撑高。
        const textBlock = NAME_HEIGHT + NAME_TEXT_GAP + textHeight;
        const height = Math.max(COVER_HEIGHT, textBlock) + CARD_PADDING * 2;
        card.getComponent(UITransform)!.setContentSize(BODY_WIDTH, height);
        card.setPosition(0, top - height / 2);
        const textTop = textBlock / 2;
        name.node.setPosition(textX, textTop);
        text.node.setPosition(textX, textTop - NAME_HEIGHT - NAME_TEXT_GAP);

        const background = card.addComponent(Graphics);
        background.fillColor = COLOR.cardShade;
        background.roundRect(-BODY_WIDTH / 2, -height / 2 - CARD_SHADE_OFFSET, BODY_WIDTH, height, CARD_RADIUS);
        background.fill();
        background.fillColor = COLOR.card;
        background.roundRect(-BODY_WIDTH / 2, -height / 2, BODY_WIDTH, height, CARD_RADIUS);
        background.fill();

        const cover = this.node(card, 'Cover', COVER_WIDTH, COVER_HEIGHT);
        cover.setPosition(-BODY_WIDTH / 2 + CARD_PADDING + COVER_WIDTH / 2, 0);
        this.buildCover(cover, key, entry.gameId);

        const manifest = this.games?.playableGames.find((game) => game.id === entry.gameId);
        if (manifest) {
            const arrow = this.node(card, 'Play', CARD_ARROW_SIZE, CARD_ARROW_SIZE);
            arrow.setPosition(BODY_WIDTH / 2 - CARD_PADDING - CARD_ARROW_SIZE / 2, 0);
            this.drawArrow(arrow.addComponent(Graphics), color.chip, color.ink);
            this.button(card, () => this.enter(manifest), 0.97);
        }
        return height;
    }

    /** 圆形底板上的右箭头，提示整张卡片可以点进游戏。 */
    private drawArrow(graphics: Graphics, plate: Color, ink: Color): void {
        const radius = CARD_ARROW_SIZE / 2;
        graphics.fillColor = plate;
        graphics.circle(0, 0, radius);
        graphics.fill();
        graphics.strokeColor = ink;
        graphics.lineWidth = 4;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.moveTo(-radius * 0.18, radius * 0.38);
        graphics.lineTo(radius * 0.22, 0);
        graphics.lineTo(-radius * 0.18, -radius * 0.38);
        graphics.stroke();
    }

    /** 收起面板并交给大厅的进入流程，与点击游戏卡片走同一条路径。 */
    private enter(manifest: GameManifest): void {
        const enterGame = this.games?.enterGame;
        if (!this.opened || !enterGame) return;
        this.dismiss();
        enterGame(manifest);
    }

    /**
     * 封面与大厅卡片同一张图并按 cover 裁切；合集大厅条目展示大厅标志，
     * 查不到游戏时退回模块图标，加载前后都有模块色底板兜底。
     */
    private buildCover(cover: Node, key: AnnouncementSectionKey, gameId: string): void {
        const plate = cover.addComponent(Graphics);
        plate.fillColor = SECTION_COLOR[key].chip;
        plate.roundRect(-COVER_WIDTH / 2, -COVER_HEIGHT / 2, COVER_WIDTH, COVER_HEIGHT, COVER_RADIUS);
        plate.fill();

        const clip = this.node(cover, 'Clip', COVER_WIDTH, COVER_HEIGHT);
        clip.addComponent(Mask).type = Mask.Type.GRAPHICS_STENCIL;
        // 节点已激活时 Mask 会先按默认矩形类型画好遮罩，切到 STENCIL 不会清掉，需先清空再画圆角。
        const stencil = clip.getComponent(Graphics)!;
        stencil.clear();
        stencil.roundRect(-COVER_WIDTH / 2, -COVER_HEIGHT / 2, COVER_WIDTH, COVER_HEIGHT, COVER_RADIUS);
        stencil.fill();
        const art = this.node(clip, 'Art', COVER_WIDTH, COVER_HEIGHT);
        const sprite = art.addComponent(Sprite);

        const manifest = gameId === ANNOUNCEMENT_COLLECTION_ID ? undefined : this.services?.findGame(gameId);
        if (manifest) {
            this.bindSprite(sprite, manifest.cover, undefined, { mode: 'cover', width: COVER_WIDTH, height: COVER_HEIGHT });
        } else if (gameId === ANNOUNCEMENT_COLLECTION_ID) {
            this.bindSprite(sprite, ART.brand, undefined, {
                mode: 'contain',
                width: COVER_WIDTH - COVER_BRAND_INSET * 2,
                height: COVER_HEIGHT - COVER_BRAND_INSET * 2,
            });
        } else {
            this.bindSprite(sprite, ART[key], undefined, { mode: 'contain', width: COVER_ICON_SIZE, height: COVER_ICON_SIZE });
        }
    }

    private subtitle(announcement: Announcement): string {
        return `v${announcement.version}`;
    }

    private readonly drawOverlay = (): void => {
        const root = this.root;
        if (!root?.isValid) return;
        drawLobbyModalOverlay(root, COLOR.overlay, this.overlay.opacity);
    };

    /**
     * 面板高度随正文总高度伸展；超出上下安全区时正文区域在弹窗内滚动，
     * 整体再按屏宽等比缩放。
     */
    private readonly layout = (): void => {
        const root = this.root;
        const panel = this.panel;
        const services = this.services;
        if (!root?.isValid || !panel?.isValid || !services) return;
        const size = view.getVisibleSize();
        const width = size.width || LOBBY_DESIGN_WIDTH;
        const height = size.height || 1334;
        root.getComponent(UITransform)!.setContentSize(width, height);
        this.drawOverlay();

        const safe = calculateVerticalSafeBounds(height, services.platform.getLayoutInfo(), 12);
        const scale = Math.min(1, width / LOBBY_DESIGN_WIDTH);
        const availableHeight = (safe.topY - safe.bottomY) / scale - SCREEN_MARGIN * 2 - TITLE_OVERHANG;
        const contentHeight = this.contentHeight;
        const chrome = BODY_TOP + BODY_BOTTOM_GAP + BUTTON_HEIGHT + BUTTON_BOTTOM;
        const viewportHeight = Math.max(ENTRY_LINE_HEIGHT * 2, Math.min(contentHeight, availableHeight - chrome));
        const panelHeight = viewportHeight + chrome;

        panel.getComponent(UITransform)!.setContentSize(PANEL_WIDTH, panelHeight);
        const fallback = panel.getComponent(Graphics)!;
        fallback.clear();
        if (!this.frames.has(ART.panel)) {
            fallback.fillColor = COLOR.surface;
            fallback.roundRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, 34);
            fallback.fill();
        }
        panel.getChildByName('PanelSkin')!.getComponent(UITransform)!.setContentSize(PANEL_WIDTH, panelHeight);
        const top = panelHeight / 2;
        panel.getChildByName('Title')!.setPosition(0, top + TITLE_OVERHANG - TITLE_HEIGHT / 2);
        panel.getChildByName('Subtitle')!.setPosition(0, top - SUBTITLE_TOP);
        panel.getChildByName('Close')!.setPosition(
            PANEL_WIDTH / 2 - CLOSE_MARGIN - CLOSE_SIZE / 2,
            top - CLOSE_MARGIN - CLOSE_SIZE / 2,
        );
        panel.getChildByName('Confirm')!.setPosition(0, -top + BUTTON_BOTTOM + BUTTON_HEIGHT / 2);
        const viewport = panel.getChildByName('BodyViewport')!;
        viewport.getComponent(UITransform)!.setContentSize(BODY_WIDTH, viewportHeight);
        viewport.setPosition(0, top - BODY_TOP - viewportHeight / 2);
        // 正文回到顶部；只有内容超出视口时才允许滚动。
        const body = viewport.getChildByName('BodyContent')!;
        body.getComponent(UITransform)!.setContentSize(BODY_WIDTH, contentHeight);
        body.setPosition(0, viewportHeight / 2);
        const scroll = viewport.getComponent(ScrollView)!;
        scroll.stopAutoScroll();
        scroll.enabled = contentHeight > viewportHeight + 1;

        // 面板（含探出的标题）在上下安全区之间居中。
        this.panelScale = scale;
        if (this.transitioning) return;
        panel.setPosition(0, (safe.topY + safe.bottomY) / 2 - TITLE_OVERHANG * scale / 2);
        panel.setScale(scale, scale, 1);
    };

    private button(node: Node, action: () => void, zoomScale: number): void {
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = zoomScale;
        button.duration = 0.09;
        node.on(Button.EventType.CLICK, action);
    }

    private node(parent: Node, name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private label(parent: Node, name: string, text: string, width: number, height: number, fontSize: number,
        color: Color, align: HorizontalTextAlignment): Label {
        const node = this.node(parent, name, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = height;
        label.color = color;
        label.horizontalAlign = align;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        return label;
    }

    /**
     * 统一经过 AssetService 加载并持有贴图，卸载时释放；fit 指定时按原图比例
     * 收进（contain）或铺满（cover）给定区域。
     */
    private bindSprite(sprite: Sprite, path: string, onLoaded?: () => void, fit?: SpriteFit): void {
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const generation = this.generation;
        void this.loadFrame(path).then((frame) => {
            if (generation !== this.generation || !sprite.isValid || !sprite.node.isValid) return;
            sprite.spriteFrame = frame;
            if (fit) {
                const original = frame.originalSize;
                const ratioX = fit.width / original.width;
                const ratioY = fit.height / original.height;
                const ratio = fit.mode === 'cover' ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY);
                sprite.node.getComponent(UITransform)!.setContentSize(original.width * ratio, original.height * ratio);
            }
            onLoaded?.();
        }).catch(() => {
            // 大厅画面目录在进入大厅前已预加载；失败时保留 Graphics 兜底外观。
        });
    }

    private loadFrame(path: string): Promise<SpriteFrame> {
        const cached = this.frames.get(path);
        if (cached) return Promise.resolve(cached);
        const pending = this.frameRequests.get(path);
        if (pending) return pending;
        const services = this.services;
        if (!services) return Promise.reject(new Error('Announcement panel is not mounted.'));
        const generation = this.generation;
        const request = services.assets.loadSpriteFrame(BUNDLE, path, 'texture').then((frame) => {
            if (generation !== this.generation) {
                services.assets.releaseRuntimeAsset(frame);
                throw new Error('Announcement panel was unmounted.');
            }
            if (path === ART.panel) {
                frame.insetLeft = 30;
                frame.insetRight = 30;
                frame.insetTop = 68;
                frame.insetBottom = 68;
            }
            this.frames.set(path, frame);
            this.frameRequests.delete(path);
            return frame;
        });
        this.frameRequests.set(path, request);
        return request;
    }
}

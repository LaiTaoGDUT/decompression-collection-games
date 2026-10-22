import {
    _decorator,
    Component,
    instantiate,
    isValid,
    Mask,
    Node,
    Prefab,
    ScrollView,
    Sprite,
    SpriteFrame,
    sys,
    UITransform,
    Vec2,
    view,
    Widget,
} from 'cc';
import {
    App,
    ACHIEVEMENT_SERVICE,
    ACHIEVEMENT_ART_SERVICE,
    ACHIEVEMENT_CELEBRATION_SERVICE,
    AUDIO_SERVICE,
    ASSET_SERVICE,
    CONFIG_SERVICE,
    FEEDBACK_SERVICE,
    GAME_REGISTRY_SERVICE,
    GAME_RUNTIME_SERVICE,
    PLATFORM_SERVICE,
    STORAGE_SERVICE,
} from '../../app/App';
import type { GameManifest } from '../../runtime/GameManifest';
import { ScenePresentationGate, type ScenePresentationEntry } from '../../runtime/ScenePresentation';
import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';
import { GameCardView } from './GameCardView';
import { EnterRequestLock } from './EnterRequestLock';
import { buildLobbyGameList, type LobbyGameListItem } from './LobbyGameList';
import { buildLobbyCardStatus, type LobbyCardStatus } from './LobbyCardStatus';
import { LOBBY_CARD_SKIN } from './LobbyCardLayout';
import { calculateLobbyGridLayout, type LobbyGridLayout } from './LobbyGridLayout';
import { LobbyPresentation } from './LobbyPresentation';
import { LobbySettingsPanel } from './LobbySettingsPanel';
import { LobbyHeader } from './LobbyHeader';
import { LobbyAnnouncementPanel } from './LobbyAnnouncementPanel';
import { AchievementWall } from '../../shared/components/AchievementWall';
import { BundleAudioBank } from '../../services/audio/BundleAudioBank';
import { AchievementWallMusic } from '../../services/achievements/AchievementWallMusic';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import type { StorageService } from '../../services/storage/StorageService';
import type { AssetService } from '../../services/asset/AssetService';
import {
    calculateLobbyScrollViewportMetrics,
    calculateLobbySafeContentFromPlatform,
    clampLobbyScrollOffset,
    LOBBY_BRAND_TO_SHOWCASE_GAP,
    LOBBY_GRID_TOP_PADDING,
    LOBBY_HEADER_TO_GRID_GAP,
    LOBBY_SHOWCASE_HEIGHT,
    LOBBY_SHOWCASE_TO_GRID_GAP,
    type LobbySafeContentMetrics,
} from '../../shared/ui/LobbyBrandLayout';

const { ccclass, property } = _decorator;
const EMPTY_GAMES: readonly GameManifest[] = Object.freeze([]);
const GRID_SIDE_PADDING = 36;
const GRID_BOTTOM = 40;
const GRID_BOTTOM_SPACER_NAME = 'GameListBottomSpacer';
const GRID_BADGE_LAYER_NAME = 'GameCardBadges';
export type EnterGameRequest = (manifest: GameManifest) => Promise<void>;

/** 大厅入口，只负责从应用服务中取得当前可玩的游戏清单。 */
@ccclass('LobbyEntry')
export class LobbyEntry extends Component implements ScenePresentationEntry {
    @property(Node)
    private gameList: Node | null = null;

    @property(Prefab)
    private gameCardPrefab: Prefab | null = null;

    private games: readonly GameManifest[] = EMPTY_GAMES;
    private catalogGames: readonly GameManifest[] = EMPTY_GAMES;
    private gameItems: readonly LobbyGameListItem[] = [];
    private storage?: StorageService;
    private unsubscribeStorage?: () => void;
    private assets?: AssetService;
    private showcaseSkinFrame?: SpriteFrame;
    private readonly enterRequestLock = new EnterRequestLock();
    private readonly presentation = new LobbyPresentation();
    private readonly header = new LobbyHeader();
    private readonly settingsPanel = new LobbySettingsPanel();
    private readonly announcementPanel = new LobbyAnnouncementPanel();
    private readonly achievementWall = new AchievementWall();
    private readonly cardViews = new Map<string, GameCardView>();
    private gridViewport: Node | null = null;
    private cardStatuses = new Map<string, LobbyCardStatus | undefined>();
    private enterGameRequest?: EnterGameRequest;
    private audioBank?: BundleAudioBank;
    private achievementMusic?: AchievementWallMusic;
    private feedback?: FeedbackService;
    private platformLayout?: PlatformLayoutInfo;
    private hasLaidOut = false;
    private readonly presentationGate = new ScenePresentationGate();
    private initialization?: Promise<void>;
    private gridLayout?: LobbyGridLayout;
    private gridTop = 0;
    private badgeLayer?: Node;

    get presentationReady(): Promise<void> {
        return this.presentationGate.ready;
    }

    get playableGames(): readonly GameManifest[] {
        return this.games;
    }

    get isEnterRequestPending(): boolean {
        return this.enterRequestLock.isLocked;
    }

    /** 第 32 步的进入流程通过这里接入，大厅不直接依赖加载实现。 */
    setEnterGameRequest(request: EnterGameRequest): void {
        this.enterGameRequest = request;
    }

    protected start(): void {
        if (this.initialization) return;
        const gate = this.presentationGate;
        this.initialization = this.initializePresentation();
        void this.initialization.then(
            () => gate.complete(),
            error => gate.fail(error),
        );
    }

    private async initializePresentation(): Promise<void> {
        const gate = this.presentationGate;
        const app = App.current;
        this.presentation.mount(this.node, app?.services.get(ASSET_SERVICE));

        if (!app) {
            this.setupHeader();
            this.setupGridViewport();
            // TODO: console.warn(
            //     '[LobbyEntry] App is unavailable; game list remains empty.',
            // );
            await gate.nextFrame();
            return;
        }

        const services = app.services;
        this.assets = services.get(ASSET_SERVICE);
        const registry = services.get(GAME_REGISTRY_SERVICE);
        const platform = services.get(PLATFORM_SERVICE);
        this.platformLayout = platform.getLayoutInfo();
        this.setupHeader();
        this.setupGridViewport();
        const configService = services.get(CONFIG_SERVICE);
        const config = configService.config;
        const storage = services.get(STORAGE_SERVICE);
        this.storage = storage;
        const audio = services.get(AUDIO_SERVICE);
        const feedback = services.get(FEEDBACK_SERVICE);
        this.feedback = feedback;
        const overlayParent = this.node.parent?.parent ?? this.node;
        this.settingsPanel.mount(overlayParent, this.header.slot('Settings')!, {
            audio,
            feedback,
            storage,
            platform,
        });
        this.audioBank = new BundleAudioBank({
            bundle: 'lobby-covers',
            alwaysLoad: true,
            music: 'visual/audio/l1-gallery-loop-v1',
            cues: {
                uiButton: 'visual/audio/lobby-button-v1',
                popup: 'visual/audio/lobby-popup-v1',
                toggle: 'visual/audio/lobby-toggle-v1',
            },
        }, audio, feedback, services.get(ASSET_SERVICE));
        void this.audioBank.initialize().catch((error: unknown) => {
            // TODO: console.error('[LobbyEntry] Audio initialization failed.', error);
        });
        this.achievementMusic = new AchievementWallMusic(services.get(ASSET_SERVICE), this.audioBank);
        void this.achievementMusic.prepare().catch(() => {});

        const playableGames = registry.getPlayableGames(
            platform.getDeviceProfile().tier,
            config.appVersion,
            config.development.showDevelopmentGames,
        );
        this.catalogGames = playableGames;
        this.refreshGameOrder();
        const runtime = services.get(GAME_RUNTIME_SERVICE);
        this.setEnterGameRequest((manifest) => runtime.enterGame(manifest));
        const achievements = services.get(ACHIEVEMENT_SERVICE);
        this.cardStatuses = new Map(this.games.map((manifest) => [
            manifest.id,
            buildLobbyCardStatus(manifest, achievements.getRecord(manifest)),
        ]));
        this.unsubscribeStorage = storage.subscribeProgress(kind => {
            if (kind !== 'restore') return;
            this.games.forEach(manifest => {
                const status = buildLobbyCardStatus(manifest, achievements.getRecord(manifest));
                this.cardStatuses.set(manifest.id, status);
                this.cardViews.get(manifest.id)?.setStatus(status);
            });
            this.achievementWall.refreshProgress();
        });
        this.announcementPanel.mount(overlayParent, this.header.slot('Notice')!, configService.announcement, {
            assets: services.get(ASSET_SERVICE),
            feedback,
            storage,
            platform,
            findGame: (gameId) => registry.getById(gameId),
        }, { playableGames, enterGame: this.handleCardClick });
        if (this.gameList) this.achievementWall.mount(overlayParent, this.gameList, playableGames, {
            achievements, platform, feedback,
            lastPlayedAt: manifest => storage.getGameData(manifest.id)?.lastPlayedAt ?? 0,
            art: services.get(ACHIEVEMENT_ART_SERVICE),
            music: this.achievementMusic,
            bindEntrySkin: (sprite, onLoaded) => this.bindShowcaseSkin(sprite, onLoaded),
            replay: manifest => { services.get(ACHIEVEMENT_CELEBRATION_SERVICE).replay(manifest); },
            preview: (manifest, challenge) => {
                services.get(ACHIEVEMENT_CELEBRATION_SERVICE).preview(manifest, challenge);
            },
        }, this.handleCardClick);
        // 先绘制大厅背景和顶部栏，再分帧构建卡片，避免所有文字和蒙版挤在首帧。
        await gate.nextFrame();
        await this.renderGames();
    }

    protected onDestroy(): void {
        this.unsubscribeStorage?.();
        this.unsubscribeStorage = undefined;
        this.presentationGate.dispose();
        this.presentation.unmount();
        this.announcementPanel.unmount();
        this.settingsPanel.unmount();
        this.header.unmount();
        this.achievementWall.unmount();
        this.releaseShowcaseSkin();
        this.achievementMusic?.dispose();
        this.achievementMusic = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.feedback = undefined;
        this.storage = undefined;
        this.assets = undefined;
        this.cardViews.clear();
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.hasLaidOut = false;
        this.gridLayout = undefined;
        this.badgeLayer = undefined;
    }

    private bindShowcaseSkin(sprite: Sprite, onLoaded: () => void): void {
        const assets = this.assets;
        if (!assets) return;
        void assets.loadSpriteFrame('lobby-covers', LOBBY_CARD_SKIN.path, 'texture').then(frame => {
            if (this.assets !== assets || !isValid(this.node, true) || !isValid(sprite.node, true)) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            frame.insetLeft = LOBBY_CARD_SKIN.insets.left;
            frame.insetRight = LOBBY_CARD_SKIN.insets.right;
            frame.insetTop = LOBBY_CARD_SKIN.insets.top;
            frame.insetBottom = LOBBY_CARD_SKIN.insets.bottom;
            this.releaseShowcaseSkin();
            this.showcaseSkinFrame = frame;
            sprite.type = Sprite.Type.SLICED;
            sprite.spriteFrame = frame;
            onLoaded();
        }).catch(() => {});
    }

    private releaseShowcaseSkin(): void {
        if (this.showcaseSkinFrame) this.assets?.releaseRuntimeAsset(this.showcaseSkinFrame);
        this.showcaseSkinFrame = undefined;
    }

    /** 入口固定在全屏 UI 根节点，标题挂入列表；固定入口绘制在列表之上、弹窗之下。 */
    private setupHeader(): void {
        const safeArea = this.node.parent?.name === 'SafeArea' ? this.node.parent : null;
        const fullscreenRoot = safeArea?.parent ?? this.node;
        this.header.mount(fullscreenRoot, this.gameList, App.current?.services.get(ASSET_SERVICE));
        const headerNode = this.header.node;
        if (safeArea && headerNode) headerNode.setSiblingIndex(safeArea.getSiblingIndex());
    }

    private setupGridViewport(): void {
        const gameList = this.gameList;
        if (!gameList) {
            return;
        }

        // The viewport spans the full screen height. Safe-area spacing belongs
        // to the scrolling content so the title and cards clip at screen edges.
        // Use the full Canvas UI root rather than the SafeArea child's Widget,
        // whose bounds can still have the design size during a resize.
        const safeArea = this.node.parent?.name === 'SafeArea'
            ? this.node.parent
            : null;
        const fullscreenRoot = safeArea?.parent;
        const viewportParent = fullscreenRoot ?? this.node;
        let viewport = viewportParent.getChildByName('GameGridViewport')
            ?? safeArea?.getChildByName('GameGridViewport')
            ?? this.node.getChildByName('GameGridViewport');
        if (!viewport) {
            viewport = new Node('GameGridViewport');
            viewport.layer = this.node.layer;
            viewportParent.addChild(viewport);
            viewport.addComponent(UITransform);
            viewport.addComponent(Mask);
        }
        if (viewport.parent !== viewportParent) {
            viewport.setParent(viewportParent);
        }
        const viewportTransform = viewport.getComponent(UITransform)
            ?? viewport.addComponent(UITransform);
        viewportTransform.setAnchorPoint(0.5, 0.5);
        const viewportWidget = viewport.getComponent(Widget);
        if (viewportWidget) {
            viewportWidget.enabled = false;
        }
        const mask = viewport.getComponent(Mask) ?? viewport.addComponent(Mask);
        mask.enabled = true;

        const scrollView = viewport.getComponent(ScrollView)
            ?? viewport.addComponent(ScrollView);
        scrollView.horizontal = false;
        scrollView.vertical = true;
        scrollView.inertia = true;
        scrollView.brake = 0.75;
        scrollView.cancelInnerEvents = true;
        gameList.setParent(viewport);
        scrollView.content = gameList;
        // Background < scrolling title/cards < fixed entries < safe-area popups.
        const headerNode = this.header.node;
        const anchor = headerNode?.parent === viewportParent ? headerNode : safeArea;
        if (anchor && viewport.getSiblingIndex() > anchor.getSiblingIndex()) {
            viewport.setSiblingIndex(anchor.getSiblingIndex());
        }

        this.gridViewport = viewport;
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.layoutCards();
    }

    private async renderGames(): Promise<void> {
        const gate = this.presentationGate;
        const gameList = this.gameList;
        const gameCardPrefab = this.gameCardPrefab;

        if (!gameList || !gameCardPrefab) {
            throw new Error('Lobby game list or GameCard prefab is missing.');
        }

        // Keep the list idempotent even when a lobby scene is restored or its
        // entry component is started again by the runtime.
        const previousCards = gameList.children.filter((child) => (
            Boolean(child.getComponent(GameCardView))
        ));
        this.cardViews.clear();
        for (const child of previousCards) {
            // `destroy()` is deferred until the end of the frame. Detaching first
            // prevents a repeated render from displaying and receiving input on
            // both the old and new cards in that frame.
            child.removeFromParent();
            child.destroy();
        }

        this.layoutCards();
        const itemCount = this.gameItems.length + (this.games.length > 0 ? 1 : 0);
        for (let index = 0; index < itemCount; index++) {
            const item = this.gameItems[index];
            const layout = this.gridLayout?.items[index];
            if (!layout) throw new Error('Lobby card layout is missing.');
            const card = instantiate(gameCardPrefab);
            card.active = false;
            const view = card.getComponent(GameCardView);

            if (!view) {
                card.destroy();
                throw new Error('GameCard prefab is missing GameCardView.');
            }

            view.setAssetService(this.assets);
            card.setParent(gameList);
            card.setSiblingIndex(index);
            card.setPosition(layout.x, layout.y - this.gridTop);
            if (item) {
                const { manifest, badge } = item;
                view.bind(manifest, this.cardStatuses.get(manifest.id), this.handleCardClick, badge, layout);
                this.cardViews.set(manifest.id, view);
            } else {
                view.bindComingSoon(layout);
            }
            if (this.badgeLayer) view.setBadgeLayer(this.badgeLayer);
            card.active = true;
            await view.artworkReady;
            await gate.nextFrame();
        }
    }

    private refreshGameOrder(): void {
        if (!this.storage) return;
        this.gameItems = buildLobbyGameList(this.catalogGames, this.storage);
        this.games = this.gameItems.map(({ manifest }) => manifest);
        const gameList = this.gameList;
        if (!gameList || this.cardViews.size === 0) return;
        for (const { manifest, badge } of this.gameItems) {
            const card = this.cardViews.get(manifest.id);
            card?.setBadge(badge);
            card?.node.setSiblingIndex(gameList.children.length - 1);
        }
        gameList.getChildByName('ComingSoonCard')?.setSiblingIndex(gameList.children.length - 1);
        this.layoutCards();
    }

    private layoutCards(): void {
        const gameList = this.gameList;
        const viewport = this.gridViewport;
        const listTransform = gameList?.getComponent(UITransform);
        const viewportTransform = viewport?.getComponent(UITransform);
        const scrollView = viewport?.getComponent(ScrollView);

        if (!gameList || !viewport || !listTransform || !viewportTransform || !scrollView) {
            return;
        }

        // A resize can arrive while inertia/bounce is still active. Stop the
        // engine-owned auto-scroll before changing either boundary, then use
        // the public offset API instead of reading content.position directly.
        scrollView.stopAutoScroll();
        const previousScrollOffset = this.hasLaidOut
            ? scrollView.getScrollOffset().y
            : 0;
        const safeContentMetrics = this.readLobbyViewportMetrics();
        const headerMetrics = this.header.layout(safeContentMetrics);
        const viewportMetrics = calculateLobbyScrollViewportMetrics(safeContentMetrics);
        viewportTransform.setAnchorPoint(0.5, 0.5);
        viewportTransform.setContentSize(
            viewportMetrics.contentWidth,
            viewportMetrics.contentHeight,
        );
        viewport.setPosition(viewportMetrics.contentX, viewportMetrics.contentY);

        const gridWidth = Math.max(0, viewportMetrics.contentWidth - GRID_SIDE_PADDING * 2);
        const headerBottom = safeContentMetrics.safeTop + headerMetrics.headerHeight;
        const cards = gameList.children.filter((child) => Boolean(child.getComponent(GameCardView)));
        const layout = calculateLobbyGridLayout(
            Math.max(cards.length, this.gameItems.length + (this.games.length > 0 ? 1 : 0)),
            gridWidth,
        );
        const showcaseTop = headerBottom + LOBBY_BRAND_TO_SHOWCASE_GAP * headerMetrics.scale;
        this.achievementWall.layoutShowcase(
            gridWidth,
            -showcaseTop - LOBBY_SHOWCASE_HEIGHT * headerMetrics.scale / 2,
            headerMetrics.scale,
            layout.cardWidth,
        );
        const gridTop = this.achievementWall.hasShowcase
            ? showcaseTop + (LOBBY_SHOWCASE_HEIGHT + LOBBY_SHOWCASE_TO_GRID_GAP) * headerMetrics.scale
            : headerBottom + (LOBBY_HEADER_TO_GRID_GAP + LOBBY_GRID_TOP_PADDING) * headerMetrics.scale;
        this.gridLayout = layout;
        this.gridTop = gridTop;
        const bottomSpacer = this.ensureBottomSpacer(gameList);
        const badgeLayer = this.ensureBadgeLayer(gameList);
        this.badgeLayer = badgeLayer;
        const bottomSpacerHeight = Math.max(0, safeContentMetrics.safeBottom) + GRID_BOTTOM;
        const bottomSpacerTransform = bottomSpacer.getComponent(UITransform);
        bottomSpacerTransform?.setAnchorPoint(0.5, 0.5);
        bottomSpacerTransform?.setContentSize(
            viewportMetrics.contentWidth,
            bottomSpacerHeight,
        );
        bottomSpacer.setPosition(
            0,
            -gridTop - layout.contentHeight - bottomSpacerHeight / 2,
        );
        const contentHeight = Math.max(
            viewportMetrics.contentHeight,
            gridTop
                + layout.contentHeight
                + bottomSpacerHeight,
        );
        listTransform.setContentSize(viewportMetrics.contentWidth, contentHeight);
        listTransform.setAnchorPoint(0.5, 1);
        const maxScrollOffset = scrollView.getMaxScrollOffset().y;
        const scrollOffset = this.hasLaidOut
            ? clampLobbyScrollOffset(
                previousScrollOffset,
                contentHeight,
                viewportMetrics.contentHeight,
            )
            : 0;
        scrollView.scrollToOffset(
            new Vec2(0, Math.min(scrollOffset, maxScrollOffset)),
            0,
            false,
        );
        // scrollToOffset(..., 0) is immediate in Cocos 3.8.8; keep this
        // explicit stop as a guard against a stale auto-scroll state arriving
        // from the same frame as the resize event.
        scrollView.stopAutoScroll();

        cards.forEach((card, index) => {
            const item = layout.items[index];
            if (!item) {
                return;
            }
            card.setPosition(item.x, item.y - gridTop);
            const cardView = card.getComponent(GameCardView);
            cardView?.setCardSize(item.width, item.height);
            cardView?.setBadgeLayer(badgeLayer);
        });
        this.hasLaidOut = true;
    }

    private ensureBadgeLayer(gameList: Node): Node {
        const existing = gameList.getChildByName(GRID_BADGE_LAYER_NAME);
        const layer = existing ?? new Node(GRID_BADGE_LAYER_NAME);
        if (!existing) {
            layer.layer = gameList.layer;
            gameList.addChild(layer);
            layer.addComponent(UITransform).setContentSize(0, 0);
        }
        // 与卡片一起滚动并受列表蒙版裁切，始终在所有卡片之后绘制。
        layer.setSiblingIndex(gameList.children.length - 1);
        return layer;
    }

    private ensureBottomSpacer(gameList: Node): Node {
        const existing = gameList.getChildByName(GRID_BOTTOM_SPACER_NAME);
        const spacer = existing ?? new Node(GRID_BOTTOM_SPACER_NAME);
        if (!existing) {
            spacer.layer = gameList.layer;
            spacer.setParent(gameList);
        }
        spacer.getComponent(UITransform) ?? spacer.addComponent(UITransform);
        spacer.setSiblingIndex(Math.max(0, gameList.children.length - 1));
        return spacer;
    }

    private readLobbyViewportMetrics(): LobbySafeContentMetrics {
        const visibleSize = view.getVisibleSize();
        const fallbackSize = this.gridViewport?.parent?.getComponent(UITransform)?.contentSize;
        const width = Math.max(1, visibleSize.width || fallbackSize?.width || 750);
        const height = Math.max(1, visibleSize.height || fallbackSize?.height || 1334);
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visibleSize.width > 0 ? width / visibleSize.width : 1;
        const scaleY = visibleSize.height > 0 ? height / visibleSize.height : 1;

        return calculateLobbySafeContentFromPlatform(
            width,
            height,
            this.platformLayout,
            {
                top: Math.max(0, visibleSize.height - safeRect.y - safeRect.height) * scaleY,
                bottom: Math.max(0, safeRect.y) * scaleY,
                left: Math.max(0, safeRect.x) * scaleX,
                right: Math.max(0, visibleSize.width - safeRect.x - safeRect.width) * scaleX,
            },
        );
    }

    private readonly handleCardClick = (manifest: GameManifest): void => {
        this.feedback?.play('uiButton');
        const request = this.enterGameRequest;

        if (!request) {
            // TODO: console.info(
            //     `[LobbyEntry] Enter flow is not connected: ${manifest.id}.`,
            // );
            return;
        }

        const ownerNode = this.node;
        const cardView = this.cardViews.get(manifest.id);
        void this.enterRequestLock.run(() => {
            cardView?.setLoading();
            return request(manifest);
        }).catch(
            (error: unknown) => {
                // TODO: console.error(
                //     `[LobbyEntry] Enter request failed: ${manifest.id}.`,
                //     error,
                // );
                if (ownerNode.isValid) {
                    cardView?.setEnterFailed();
                }
            },
        );
    };

    private readonly handleCanvasResize = (): void => {
        this.layoutCards();
    };
}

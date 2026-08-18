import {
    _decorator,
    Component,
    instantiate,
    Mask,
    Node,
    Prefab,
    ScrollView,
    sys,
    UITransform,
    Vec2,
    view,
    Widget,
} from 'cc';
import {
    App,
    AUDIO_SERVICE,
    CONFIG_SERVICE,
    FEEDBACK_SERVICE,
    GAME_REGISTRY_SERVICE,
    GAME_RUNTIME_SERVICE,
    PLATFORM_SERVICE,
    STORAGE_SERVICE,
} from '../../app/App';
import type { GameManifest } from '../../runtime/GameManifest';
import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';
import { GameCardView } from './GameCardView';
import { EnterRequestLock } from './EnterRequestLock';
import { calculateLobbyGridLayout } from './LobbyGridLayout';
import { LobbyPresentation } from './LobbyPresentation';
import { LobbySettingsPanel } from './LobbySettingsPanel';
import { BundleAudioBank } from '../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import {
    calculateLobbyBrandMetrics,
    calculateLobbyScrollViewportMetrics,
    calculateLobbySafeContentFromPlatform,
    clampLobbyScrollOffset,
    type LobbySafeContentMetrics,
} from '../../shared/ui/LobbyBrandLayout';

const { ccclass, property } = _decorator;
const EMPTY_GAMES: readonly GameManifest[] = Object.freeze([]);
const GRID_SIDE_PADDING = 40;
const GRID_BOTTOM = 40;
const GRID_BOTTOM_SPACER_NAME = 'GameListBottomSpacer';
export type EnterGameRequest = (manifest: GameManifest) => Promise<void>;

/** 大厅入口，只负责从应用服务中取得当前可玩的游戏清单。 */
@ccclass('LobbyEntry')
export class LobbyEntry extends Component {
    @property(Node)
    private gameList: Node | null = null;

    @property(Prefab)
    private gameCardPrefab: Prefab | null = null;

    private games: readonly GameManifest[] = EMPTY_GAMES;
    private readonly enterRequestLock = new EnterRequestLock();
    private readonly presentation = new LobbyPresentation();
    private readonly settingsPanel = new LobbySettingsPanel();
    private readonly cardViews = new Map<string, GameCardView>();
    private gridViewport: Node | null = null;
    private storageHighScores = new Map<string, number | undefined>();
    private enterGameRequest?: EnterGameRequest;
    private audioBank?: BundleAudioBank;
    private feedback?: FeedbackService;
    private platformLayout?: PlatformLayoutInfo;
    private hasLaidOut = false;

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
        this.presentation.mount(this.node);
        const app = App.current;

        if (!app) {
            this.setupGridViewport();
            console.warn(
                '[LobbyEntry] App is unavailable; game list remains empty.',
            );
            return;
        }

        const services = app.services;
        const registry = services.get(GAME_REGISTRY_SERVICE);
        const platform = services.get(PLATFORM_SERVICE);
        this.platformLayout = platform.getLayoutInfo();
        this.setupGridViewport();
        const config = services.get(CONFIG_SERVICE).config;
        const storage = services.get(STORAGE_SERVICE);
        const audio = services.get(AUDIO_SERVICE);
        const feedback = services.get(FEEDBACK_SERVICE);
        this.feedback = feedback;
        this.settingsPanel.mount(this.node, {
            audio,
            feedback,
            storage,
            platform,
        });
        this.audioBank = new BundleAudioBank({
            bundle: 'lobby',
            music: 'visual/audio/l1-gallery-loop-v1',
            cues: {
                uiButton: 'visual/audio/lobby-button-v1',
                popup: 'visual/audio/lobby-popup-v1',
                toggle: 'visual/audio/lobby-toggle-v1',
            },
        }, audio, feedback);
        void this.audioBank.initialize().catch((error: unknown) => {
            console.error('[LobbyEntry] Audio initialization failed.', error);
        });

        this.games = registry.getPlayableGames(
            platform.getDeviceProfile().tier,
            config.appVersion,
            config.development.showDevelopmentGames,
        );
        this.setEnterGameRequest((manifest) => (
            services.get(GAME_RUNTIME_SERVICE).enterGame(manifest)
        ));
        this.storageHighScores = new Map(this.games.map((manifest) => [
            manifest.id,
            storage.getGameData(manifest.id)?.highScore,
        ]));
        this.renderGames();
    }

    protected onDestroy(): void {
        this.presentation.unmount();
        this.settingsPanel.unmount();
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.feedback = undefined;
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.hasLaidOut = false;
    }

    private setupGridViewport(): void {
        const gameList = this.gameList;
        if (!gameList) {
            return;
        }

        // Keep the viewport on the full Canvas UI root, then assign its
        // top/side-safe rectangle below; its bottom intentionally reaches the
        // screen edge. Relying on the SafeArea child's Widget size leaves
        // stale design-size bounds on tablet resize.
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
        if (safeArea) {
            // Background < scrolling content < fixed safe-area controls.
            const safeAreaIndex = safeArea.getSiblingIndex();
            if (viewport.getSiblingIndex() > safeAreaIndex) {
                viewport.setSiblingIndex(safeAreaIndex);
            }
        }

        // The brand/title is part of the page content so it naturally leaves
        // the screen together with the cards. Persistent controls (settings)
        // remain direct children of ContentRoot and therefore stay fixed.
        const brandArea = this.node.getChildByName('BrandArea');
        if (brandArea && brandArea.parent !== gameList) {
            brandArea.setParent(gameList);
            brandArea.setSiblingIndex(0);
        }

        this.gridViewport = viewport;
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.layoutCards();
    }

    private renderGames(): void {
        const gameList = this.gameList;
        const gameCardPrefab = this.gameCardPrefab;

        if (!gameList || !gameCardPrefab) {
            console.error('[LobbyEntry] Game list or card prefab is missing.');
            return;
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

        this.games.forEach((manifest) => {
            const card = instantiate(gameCardPrefab);
            const view = card.getComponent(GameCardView);

            if (!view) {
                card.destroy();
                throw new Error('GameCard prefab is missing GameCardView.');
            }

            card.setParent(gameList);
            view.bind(
                manifest,
                this.storageHighScores.get(manifest.id),
                this.handleCardClick,
            );
            this.cardViews.set(manifest.id, view);
        });

        if (this.games.length > 0) {
            const comingSoonCard = instantiate(gameCardPrefab);
            const view = comingSoonCard.getComponent(GameCardView);
            if (!view) {
                comingSoonCard.destroy();
                throw new Error('GameCard prefab is missing GameCardView.');
            }
            comingSoonCard.setParent(gameList);
            view.bindComingSoon();
        }

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
        const viewportMetrics = calculateLobbyScrollViewportMetrics(safeContentMetrics);
        viewportTransform.setAnchorPoint(0.5, 0.5);
        viewportTransform.setContentSize(
            viewportMetrics.contentWidth,
            viewportMetrics.contentHeight,
        );
        viewport.setPosition(viewportMetrics.contentX, viewportMetrics.contentY);

        const brandMetrics = calculateLobbyBrandMetrics(
            safeContentMetrics.contentWidth,
            safeContentMetrics.contentHeight,
        );
        const gridWidth = Math.max(0, viewportMetrics.contentWidth - GRID_SIDE_PADDING * 2);
        const cards = gameList.children.filter((child) => Boolean(child.getComponent(GameCardView)));
        const layout = calculateLobbyGridLayout(
            cards.length,
            gridWidth,
        );
        const bottomSpacer = this.ensureBottomSpacer(gameList);
        const bottomSpacerHeight = Math.max(0, safeContentMetrics.safeBottom) + GRID_BOTTOM;
        const bottomSpacerTransform = bottomSpacer.getComponent(UITransform);
        bottomSpacerTransform?.setAnchorPoint(0.5, 0.5);
        bottomSpacerTransform?.setContentSize(
            viewportMetrics.contentWidth,
            bottomSpacerHeight,
        );
        bottomSpacer.setPosition(
            0,
            -brandMetrics.gridTop - layout.contentHeight - bottomSpacerHeight / 2,
        );
        const contentHeight = Math.max(
            viewportMetrics.contentHeight,
            brandMetrics.gridTop
                + layout.contentHeight
                + bottomSpacerHeight,
        );
        listTransform.setContentSize(viewportMetrics.contentWidth, contentHeight);
        listTransform.setAnchorPoint(0.5, 1);
        this.presentation.layoutBrand(
            safeContentMetrics.contentWidth,
            safeContentMetrics.contentHeight,
        );
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
            card.setPosition(item.x, item.y - brandMetrics.gridTop);
            card.getComponent(GameCardView)?.setCardSize(item.width, item.height);
        });
        this.hasLaidOut = true;
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
            console.info(
                `[LobbyEntry] Enter flow is not connected: ${manifest.id}.`,
            );
            return;
        }

        const view = this.cardViews.get(manifest.id);
        view?.setLoading();
        void this.enterRequestLock.run(() => request(manifest)).then(
            (started) => {
                if (!started && this.node.isValid) {
                    view?.setIdle();
                }
            },
            (error: unknown) => {
                console.error(
                    `[LobbyEntry] Enter request failed: ${manifest.id}.`,
                    error,
                );
                if (this.node.isValid) {
                    view?.setEnterFailed();
                }
            },
        );
    };

    private readonly handleCanvasResize = (): void => {
        this.layoutCards();
    };
}

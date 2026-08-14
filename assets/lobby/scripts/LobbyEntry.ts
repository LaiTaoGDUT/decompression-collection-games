import {
    _decorator,
    Component,
    instantiate,
    Mask,
    Node,
    Prefab,
    ScrollView,
    UITransform,
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
import { GameCardView } from './GameCardView';
import { EnterRequestLock } from './EnterRequestLock';
import { calculateLobbyGridLayout } from './LobbyGridLayout';
import { LobbyPresentation } from './LobbyPresentation';
import { LobbySettingsPanel } from './LobbySettingsPanel';
import { BundleAudioBank } from '../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../services/feedback/FeedbackService';

const { ccclass, property } = _decorator;
const EMPTY_GAMES: readonly GameManifest[] = Object.freeze([]);
const GRID_SIDE_PADDING = 40;
// Keep the cards at the same distance below the title after moving the whole
// lobby hero row up to the settings-button center line.
const GRID_TOP = 258;
const GRID_BOTTOM = 40;
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
        this.setupGridViewport();
        const app = App.current;

        if (!app) {
            console.warn(
                '[LobbyEntry] App is unavailable; game list remains empty.',
            );
            return;
        }

        const services = app.services;
        const registry = services.get(GAME_REGISTRY_SERVICE);
        const platform = services.get(PLATFORM_SERVICE);
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
    }

    private setupGridViewport(): void {
        const gameList = this.gameList;
        if (!gameList) {
            return;
        }

        // ContentRoot lives below Cocos' SafeArea node. The scrolling surface
        // must instead be mounted on SceneLayer so its mask and gesture area
        // cover the entire canvas, including the regions around a notch and
        // the home indicator.
        const safeArea = this.node.parent;
        const fullscreenRoot = safeArea?.name === 'SafeArea'
            ? safeArea.parent
            : null;
        const viewportParent = fullscreenRoot ?? this.node;
        let viewport = viewportParent.getChildByName('GameGridViewport')
            ?? this.node.getChildByName('GameGridViewport');
        if (!viewport) {
            viewport = new Node('GameGridViewport');
            viewport.layer = this.node.layer;
            viewportParent.addChild(viewport);
            viewport.addComponent(UITransform);
            viewport.addComponent(Mask);
            const widget = viewport.addComponent(Widget);
            widget.isAlignTop = true;
            widget.isAlignBottom = true;
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.top = 0;
            widget.bottom = 0;
            widget.left = 0;
            widget.right = 0;
            widget.updateAlignment();

            const scrollView = viewport.addComponent(ScrollView);
            scrollView.horizontal = false;
            scrollView.vertical = true;
            scrollView.inertia = true;
            scrollView.brake = 0.75;
            scrollView.cancelInnerEvents = true;
            gameList.setParent(viewport);
            scrollView.content = gameList;
        }
        if (viewport.parent !== viewportParent) {
            viewport.setParent(viewportParent);
        }
        if (fullscreenRoot && safeArea?.parent === fullscreenRoot) {
            // Background < scrolling content < fixed safe-area controls.
            const safeAreaIndex = safeArea.getSiblingIndex();
            const targetIndex = viewport.getSiblingIndex() < safeAreaIndex
                ? safeAreaIndex - 1
                : safeAreaIndex;
            viewport.setSiblingIndex(Math.max(0, targetIndex));
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

        if (!gameList || !viewport || !listTransform || !viewportTransform) {
            return;
        }

        viewport.getComponent(Widget)?.updateAlignment();
        const viewportSize = viewportTransform.contentSize;
        const safeContentHeight = this.node.getComponent(UITransform)?.contentSize.height
            ?? viewportSize.height;
        const safeEdgeInset = Math.max(0, (viewportSize.height - safeContentHeight) / 2);
        const gridWidth = Math.max(0, viewportSize.width - GRID_SIDE_PADDING * 2);
        const cards = gameList.children.filter((child) => Boolean(child.getComponent(GameCardView)));
        const layout = calculateLobbyGridLayout(
            cards.length,
            gridWidth,
        );
        const contentHeight = Math.max(
            viewportSize.height,
            safeEdgeInset + GRID_TOP + layout.contentHeight + GRID_BOTTOM + safeEdgeInset,
        );
        listTransform.setContentSize(viewportSize.width, contentHeight);
        listTransform.setAnchorPoint(0.5, 1);
        gameList.setPosition(0, viewportSize.height / 2);
        const brandWidget = gameList.getChildByName('BrandArea')?.getComponent(Widget);
        if (brandWidget) {
            brandWidget.top = safeEdgeInset + 18;
            brandWidget.updateAlignment();
        }

        cards.forEach((card, index) => {
            const item = layout.items[index];
            if (!item) {
                return;
            }
            card.setPosition(item.x, item.y - safeEdgeInset - GRID_TOP);
            card.getComponent(GameCardView)?.setCardSize(item.width, item.height);
        });
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

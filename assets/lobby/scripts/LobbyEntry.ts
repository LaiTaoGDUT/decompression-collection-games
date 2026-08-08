import {
    _decorator,
    Component,
    instantiate,
    Node,
    Prefab,
    UITransform,
} from 'cc';
import {
    App,
    CONFIG_SERVICE,
    GAME_REGISTRY_SERVICE,
    PLATFORM_SERVICE,
} from '../../app/App';
import type { GameManifest } from '../../runtime/GameManifest';
import { GameCardView } from './GameCardView';
import { EnterRequestLock } from './EnterRequestLock';

const { ccclass, property } = _decorator;
const EMPTY_GAMES: readonly GameManifest[] = Object.freeze([]);
const CARD_HEIGHT = 220;
const CARD_GAP = 24;
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
    private enterGameRequest?: EnterGameRequest;

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

        this.games = registry.getPlayableGames(
            platform.getDeviceProfile().tier,
            config.appVersion,
        );
        this.renderGames();
    }

    private renderGames(): void {
        const gameList = this.gameList;
        const gameCardPrefab = this.gameCardPrefab;

        if (!gameList || !gameCardPrefab) {
            console.error('[LobbyEntry] Game list or card prefab is missing.');
            return;
        }

        for (const child of [...gameList.children]) {
            child.destroy();
        }

        this.games.forEach((manifest, index) => {
            const card = instantiate(gameCardPrefab);
            const view = card.getComponent(GameCardView);

            if (!view) {
                card.destroy();
                throw new Error('GameCard prefab is missing GameCardView.');
            }

            card.setParent(gameList);
            card.setPosition(0, -CARD_HEIGHT / 2 - index * (CARD_HEIGHT + CARD_GAP));
            view.bind(manifest, this.handleCardClick);
        });

        const listTransform = gameList.getComponent(UITransform);

        if (!listTransform) {
            throw new Error('GameList is missing UITransform.');
        }

        const height = this.games.length === 0
            ? 0
            : this.games.length * CARD_HEIGHT
                + (this.games.length - 1) * CARD_GAP;
        listTransform.setContentSize(listTransform.contentSize.width, height);
    }

    private readonly handleCardClick = (manifest: GameManifest): void => {
        const request = this.enterGameRequest;

        if (!request) {
            console.info(
                `[LobbyEntry] Enter flow is not connected: ${manifest.id}.`,
            );
            return;
        }

        void this.enterRequestLock.run(() => request(manifest)).catch(
            (error: unknown) => {
                console.error(
                    `[LobbyEntry] Enter request failed: ${manifest.id}.`,
                    error,
                );
            },
        );
    };
}

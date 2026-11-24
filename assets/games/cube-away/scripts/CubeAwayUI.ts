import {
    Node, Sprite, SpriteFrame,
    UITransform,
} from 'cc';
import { CubeAwayMapUI } from './CubeAwayMapUI';
import { CubeAwayInGameUI } from './CubeAwayInGameUI';
import type { CubeAwayLayoutMetrics } from './CubeAwayLayout';
import { CubeAwaySpotlightGuide } from './CubeAwaySpotlightGuide';
import type { ChapterSummary, CubeAwayDifficulty, LevelSummary } from './CubeAwayTypes';
import type { MechanicSpotlightTarget } from './CubeAwayView3D';

export interface CubeAwayUICallbacks {
    onBackToLobby(): void;
    onSelectChapter(chapter: number): void;
    onPlayLevel(levelNumber: number): void;
    onUseHint(): void;
    onOpenSettings(): void;
}

export interface MapViewModel {
    chapter: ChapterSummary;
    levels: readonly LevelSummary[];
    totalChapters: number;
    cleared: number;
    totalLevels: number;
    unlocked: number;
    current: number;
    soundEnabled: boolean;
}

export interface PlayHudModel {
    levelNumber: number;
    chapterTitle: string;
    remainingArrows: number;
    lives: number;
    maxLives: number;
    hints: number;
    difficulty: CubeAwayDifficulty;
    adsEnabled: boolean;
    soundEnabled: boolean;
}

function makeUiNode(name: string, parent: Node, width = 100, height = 100): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    n.addComponent(UITransform).setContentSize(width, height);
    return n;
}

/** 薄荷小蛇 UI：章节地图、关内状态与温柔纸感弹窗。 */
export class CubeAwayUI {
    readonly bgRoot: Node;
    readonly mapRoot: Node;
    readonly playRoot: Node;
    readonly modalRoot: Node;

    private readonly bgSprite: Sprite;
    private readonly map: CubeAwayMapUI;
    private guideBuilder?: () => void;
    private modalBuilder?: () => void;
    private readonly ingame: CubeAwayInGameUI;
    private readonly spotlight = new CubeAwaySpotlightGuide();
    private mapNodesDirty = true;
    private lastLayoutKey = '';

    private currentLayout?: CubeAwayLayoutMetrics;

    constructor(
        parent: Node,
        frames: Readonly<Record<string, SpriteFrame>>,
        private readonly bgFrame: SpriteFrame | undefined,
        callbacks: CubeAwayUICallbacks,
    ) {
        this.ingame = new CubeAwayInGameUI(frames, callbacks, bgFrame);
        this.map = new CubeAwayMapUI(callbacks, frames.snake_head_side);
        this.bgRoot = makeUiNode('CubeStudioBg', parent, 750, 1334);
        this.bgSprite = this.bgRoot.addComponent(Sprite);
        this.bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (bgFrame) this.bgSprite.spriteFrame = bgFrame;
        this.bgRoot.getComponent(UITransform)!.setContentSize(750, 1334);

        this.mapRoot = makeUiNode('CubeMapView', parent, 750, 1334);
        this.playRoot = makeUiNode('CubePlayHud', parent, 750, 1334);
        this.modalRoot = makeUiNode('CubeModalOverlay', parent, 750, 1334);
        this.modalRoot.active = false;
    }

    updateBackgroundSize(visibleWidth: number, visibleHeight: number): void {
        const scale = Math.max(visibleWidth / 750, visibleHeight / 1334);
        this.bgRoot.getComponent(UITransform)!.setContentSize(
            Math.ceil(750 * scale),
            Math.ceil(1334 * scale),
        );
    }

    showMap(model: MapViewModel, layout: CubeAwayLayoutMetrics): void {
        this.currentLayout = layout;
        this.mapRoot.active = true;
        this.playRoot.active = false;
        if (this.bgFrame) this.bgSprite.spriteFrame = this.bgFrame;
        const layoutKey = JSON.stringify([layout.visibleWidth, layout.visibleHeight, layout.safeTop, layout.safeBottom, layout.safeWidth, layout.centerX, model.chapter.chapter, model.cleared, model.current, model.unlocked]);
        if (this.mapNodesDirty || this.lastLayoutKey !== layoutKey) {
            this.lastLayoutKey = layoutKey;
            this.mapNodesDirty = false;
            this.map.show(this.mapRoot, model, layout);
        }
    }

    showPlay(model: PlayHudModel, layout: CubeAwayLayoutMetrics): void {
        this.map.dispose();
        this.mapNodesDirty = true;
        this.currentLayout = layout;
        this.mapRoot.active = false;
        this.playRoot.active = true;
        this.ingame.buildPlayHud(this.playRoot, model, layout);
    }

    get hintTarget(): Node | undefined { return this.ingame.hintTarget; }
    get hintStock(): Node | undefined { return this.ingame.hintStock; }

    relayoutModal(): void { this.modalBuilder?.(); this.guideBuilder?.(); }

    refreshPlayHud(model: PlayHudModel): void {
        this.ingame.refreshPlayHud(model);
    }

    spawnTapRipple(localX: number, localY: number, tintHex = '#5CA8FF'): void {
        this.ingame.spawnTapRipple(localX, localY, tintHex);
    }

    flashBlockedWarning(localX?: number, localY?: number): void {
        this.ingame.flashBlockedWarning(localX, localY);
    }

    update(dt: number, paused: boolean): void {
        this.ingame.update(dt, paused);
        if (!paused) this.spotlight.update(dt);
    }

    hideModal(): void {
        this.ingame.clearModalAnimation();
        this.modalBuilder = undefined;
        this.guideBuilder = undefined;
        this.spotlight.hide(this.modalRoot);
        this.modalRoot.destroyAllChildren();
        this.modalRoot.active = false;
    }

    showSettingsModal(
        levelNumber: number,
        onResume: () => void,
        onRestart: () => void,
        onBackToMap: () => void,
        onBackToLobby: () => void,
    ): void {
        this.guideBuilder = undefined;
        let animate = true;
        this.modalBuilder = () => {
            this.spotlight.hide(this.modalRoot);
            this.modalRoot.active = true;
            this.ingame.showSettingsModal(
                this.modalRoot,
                levelNumber,
                onResume,
                onRestart,
                onBackToMap,
                onBackToLobby,
                animate,
            );
            animate = false;
        };
        this.modalBuilder();
    }

    showVictoryModal(
        levelNumber: number,
        moves: number,
        mistakes: number,
        hasNext: boolean,
        onNext: () => void,
        onMap: () => void,
    ): void {
        this.guideBuilder = undefined;
        let animate = true;
        this.modalBuilder = () => {
            this.spotlight.hide(this.modalRoot);
            this.modalRoot.active = true;
            this.ingame.showVictoryModal(
                this.modalRoot,
                levelNumber,
                moves,
                mistakes,
                hasNext,
                onNext,
                onMap,
                animate,
            );
            animate = false;
        };
        this.modalBuilder();
    }

    showReviveModal(
        levelNumber: number,
        canWatchAd: boolean,
        onReviveAd: () => void,
        onRestart: () => void,
        onMap: () => void,
        remainingArrows = 0,
    ): void {
        this.guideBuilder = undefined;
        let animate = true;
        this.modalBuilder = () => {
            this.spotlight.hide(this.modalRoot);
            this.modalRoot.active = true;
            this.ingame.showReviveModal(
                this.modalRoot,
                levelNumber,
                remainingArrows,
                canWatchAd,
                onReviveAd,
                onRestart,
                onMap,
                animate,
            );
            animate = false;
        };
        this.modalBuilder();
    }


    showMechanicSpotlight(
        mechKey: string,
        target: MechanicSpotlightTarget | null | (() => MechanicSpotlightTarget | null),
        stepIndex: number,
        totalSteps: number,
        onDismiss: (tapped: boolean) => void,
    ): void {
        this.ingame.clearModalAnimation();
        this.modalBuilder = undefined;
        this.guideBuilder = () => {
            if (!this.currentLayout) return;
            const focus = typeof target === 'function' ? target() : target;
            if (!focus) { onDismiss(false); return; }
            this.spotlight.show(this.modalRoot, mechKey, focus,
                this.currentLayout, stepIndex, totalSteps, () => onDismiss(true));
        };
        this.guideBuilder();
    }

    dispose(): void {
        this.map.dispose();
        this.ingame.dispose();
        this.guideBuilder = undefined;
        this.modalBuilder = undefined;
        this.spotlight.hide(this.modalRoot);
        this.bgRoot.destroy();
        this.mapRoot.destroy();
        this.playRoot.destroy();
        this.modalRoot.destroy();
    }

}

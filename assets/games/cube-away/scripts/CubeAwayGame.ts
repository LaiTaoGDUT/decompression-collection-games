import {
    _decorator, Camera, Canvas, Component, EffectAsset, Font, EventMouse, EventTouch, JsonAsset, Node,
    Rect, SpriteFrame, Texture2D, UITransform, Vec2, view,
} from 'cc';
import { PREVIEW } from 'cc/env';
import type { GameResult } from '../../../core/types/CommonTypes';
import type { Platform } from '../../../platform/Platform';
import { DailyToolRewardAnimation } from '../../../shared/ui/DailyToolRewardAnimation';
import { drawRewardBackdrop, hexColor, rewardBulb } from './CubeAwayChrome';
import { CUBE_AWAY_THEME } from './CubeAwayTheme';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import type { ServerTimeService } from '../../../services/cloud/ServerTimeService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { CubeAwayAudio } from './CubeAwayAudio';
import { CubeAwayBoard } from './CubeAwayEngine';
import { boardSkinDirectory, chooseBoardSkin, type BoardSkinId } from './CubeAwayBoardSkins';
import { computeCubeAwayLayout, type CubeAwayLayoutMetrics } from './CubeAwayLayout';
import {
    completeCubeAwayLevel,
    grantCubeAwayDailyTools,
    readCubeAwaySave,
    serializeCubeAwaySave,
    type CubeAwaySave,
} from './CubeAwaySave';
import {
    CUBE_AWAY_CHAPTER_COUNT,
    CUBE_AWAY_CHAPTER_SIZE,
    CUBE_AWAY_LEVEL_BANK,
    CUBE_AWAY_TOTAL_LEVELS,
    type ChapterPack,
    type ChapterSummary,
    type DirName,
    type LevelIndexData,
    type RawLevelPack,
} from './CubeAwayTypes';
import { CubeAwayTypography } from './CubeAwayTypography';
import { CubeAwayUI } from './CubeAwayUI';
import { CubeAwayView3D, CUBE_ASSETS_BUNDLE } from './CubeAwayView3D';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';

const { ccclass } = _decorator;
const MAX_LIVES = 5;
const BOARD_ENTRANCE_SECONDS = 0.8;

type GameState = 'idle' | 'ready' | 'selecting' | 'entering' | 'playing' | 'paused' | 'completed' | 'failed' | 'disposed';

interface CubeAwayServices {
    serverTime?: ServerTimeService;
    assets: AssetService;
    audio: AudioService;
    feedback: FeedbackService;
    storage: StorageService;
    platform: Platform;
    ads: AdService;
}

@ccclass('CubeAwayGame')
export class CubeAwayGame extends Component implements MiniGame<CubeAwayServices> {
    readonly backgroundPausePolicy = 'silent' as const;

    private state: GameState = 'idle';
    private resumeTargetState: 'selecting' | 'entering' | 'playing' = 'playing';
    private entranceElapsed = 0;
    private context?: MiniGameContext<CubeAwayServices>;
    private camera?: Camera;
    private generation = 0;
    private busy = false;
    private readonly dailyReward = new DailyToolRewardAnimation();
    private dailyHintReward = 0;

    private indexData?: LevelIndexData;
    private readonly chapterCache = new Map<number, ChapterPack>();
    private save?: CubeAwaySave;
    private activeChapter = 1;
    private levelNumber = 1;
    private board?: CubeAwayBoard;
    private loadedSkin?: { id: BoardSkinId; surface: SpriteFrame };

    private audioCtrl?: CubeAwayAudio;
    private view3d?: CubeAwayView3D;
    private ui?: CubeAwayUI;
    private frames?: Readonly<Record<string, SpriteFrame>>;
    private bgFrame?: SpriteFrame;
    private inputNode?: Node;

    private lives = MAX_LIVES;
    private elapsedSeconds = 0;
    private previewPureBoard = false;
    private previewForceGuide = false;
    private previewMechGuide = '';
    private victoryDelayTimer = -1;
    private pendingFailure = false;
    private pendingVictory?: {
        clearedNum: number;
        moves: number;
        mistakes: number;
        totalCleared: number;
        totalLevels: number;
        hasNext: boolean;
    };
    private resizeBound = false;
    private layout: CubeAwayLayoutMetrics = computeCubeAwayLayout(750, 1334);

    // Touch / drag tracking on 3D viewport
    private activeTouchId: number | null = null;
    private touchStartPos = new Vec2();
    private lastTouchPos = new Vec2();
    private isTapCandidate = false;
    private pinchStartDist = 0;
    private readonly secondaryTouchPos = new Vec2();
    private secondaryTouchId: number | null = null;

    async initialize(context: MiniGameContext<CubeAwayServices>): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`CubeAway cannot initialize from ${this.state}`);
        }
        const gen = ++this.generation;
        this.context = context;

        for (let p: Node | null = this.node; p; p = p.parent) {
            const cam = p.getComponent(Canvas)?.cameraComponent;
            if (cam) {
                this.camera = cam;
                break;
            }
        }
        if (!this.camera) throw new Error('CubeAway UI camera is missing');

        // Load level catalog
        const indexAsset = await context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'configs/index', JsonAsset);
        if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;
        const indexJson = indexAsset.json as LevelIndexData;
        if (!indexJson || indexJson.bankId !== CUBE_AWAY_LEVEL_BANK
            || !Array.isArray(indexJson.chapters) || !Array.isArray(indexJson.levels)
            || indexJson.totalLevels !== CUBE_AWAY_TOTAL_LEVELS || indexJson.levels.length !== indexJson.totalLevels
            || indexJson.totalChapters !== CUBE_AWAY_CHAPTER_COUNT || indexJson.chapters.length !== indexJson.totalChapters
            || indexJson.levelsPerChapter !== CUBE_AWAY_CHAPTER_SIZE) {
            throw new Error('CubeAway level index is invalid');
        }
        this.indexData = indexJson;

        // Prepare packed UI sprites & background texture
        const requests = Object.keys(PACKED_SPRITE_PATHS)
            .filter((k) => k.startsWith('visual/mint/') && k.endsWith('/spriteFrame'))
            .map((k) => ({
                key: k.split('/').slice(-2)[0],
                path: PACKED_SPRITE_PATHS[k],
                type: 'frame' as const,
            }));
        const [frames, bgTex, flatEffect, headDistance, regularFont, boldFont] = await Promise.all([
            context.services.assets.loadSpriteFrames(CUBE_ASSETS_BUNDLE, requests),
            context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'visual/mint_background/texture', Texture2D),
            context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'materials/mint-flat', EffectAsset),
            context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'materials/snake-head-distance/texture', Texture2D),
            context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'fonts/mint-regular', Font),
            context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, 'fonts/mint-bold', Font),
        ]);
        if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') {
            Object.keys(frames).forEach((k) => context.services.assets.releaseRuntimeAsset(frames[k]));
            return;
        }
        this.frames = frames;
        const typography = this.node.addComponent(CubeAwayTypography);
        typography.regular = regularFont; typography.bold = boldFont;
        const bgFrame = context.services.assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new SpriteFrame());
        bgFrame.texture = bgTex;
        bgFrame.packable = false;
        this.bgFrame = bgFrame;

        // Audio
        await context.services.assets.prepareBundle(CUBE_ASSETS_BUNDLE, 'visual/audio');
        if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;
        this.audioCtrl = new CubeAwayAudio(context.services.audio, context.services.feedback, context.services.assets);
        await this.audioCtrl.initialize();
        if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;

        // Load save & daily gift
        const stored = context.services.storage.getGameData(context.gameId);
        const today = context.services.serverTime?.day;
        this.save = readCubeAwaySave(stored?.custom?.cubeAway, today, indexJson.totalLevels);
        this.levelNumber = this.save.current;
        if (PREVIEW && typeof location !== 'undefined') {
            const q = new URLSearchParams(location.search);
            this.previewPureBoard = q.get('cubePure') === '1';
            this.previewForceGuide = q.get('cubeGuide') === '1';
            this.previewMechGuide = q.get('cubeMech') ?? '';
        }
        const added = grantCubeAwayDailyTools(this.save, today);
        if (added > 0) { this.dailyHintReward += added; this.persist(false); }
        this.activeChapter = this.chapterForLevel(this.levelNumber);

        // Compute layout & build views
        this.recomputeLayout();
        this.view3d = new CubeAwayView3D(
            this.node.parent ?? this.node, this.node, context.services.assets, flatEffect,
            frames.snake_head_side, frames.snake_head_front, headDistance,
        );
        this.ui = new CubeAwayUI(this.node, frames, bgFrame, {
            onBackToLobby: () => this.exitToLobby(),
            onSelectChapter: (ch) => {
                this.audioCtrl?.playTap();
                this.activeChapter = ch;
                this.refreshMapView();
            },
            onPlayLevel: (lvl) => {
                this.audioCtrl?.playTap();
                void this.enterLevel(lvl, true);
            },
            onUseHint: () => void this.handleHintAction(),
            onOpenSettings: () => this.openSettingsModal(),
        });
        // Ensure 3D projection renders behind HUD overlays; CubeViewportInput sits cleanly above projection
        // and survives Play HUD rebuilds (playRoot.destroyAllChildren).
        this.setupViewportInput();
        this.ui.bgRoot.setSiblingIndex(0);
        this.view3d.projection.setSiblingIndex(1);
        this.inputNode?.setSiblingIndex(2);
        this.ui.mapRoot.setSiblingIndex(3);
        this.ui.playRoot.setSiblingIndex(4);
        this.ui.modalRoot.setSiblingIndex(5);

        view.on('canvas-resize', this.handleResize, this);
        this.resizeBound = true;

        await this.enterLevel(this.levelNumber, true, true);
        if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') {
            throw new Error(`CubeAway cannot begin from ${this.state}`);
        }
        this.startBoardEntrance();
    }

    private startBoardEntrance(): void {
        if (this.state === 'paused') this.resumeTargetState = 'entering';
        else this.state = 'entering';
        this.entranceElapsed = 0;
        this.applyViewports();
        this.view3d?.setEntranceProgress(0);
    }

    isGameplayActive(): boolean {
        return this.state === 'playing' && !this.busy && !this.dailyReward.active && !this.ui?.modalRoot.active;
    }

    pause(): boolean {
        if (this.state === 'paused') return true;
        if (this.state !== 'playing' && this.state !== 'selecting' && this.state !== 'entering') return false;
        this.resumeTargetState = this.state;
        this.state = 'paused';
        this.dailyReward.setVisible(false);
        this.persist(false);
        this.audioCtrl?.stopEffects();
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.resumeTargetState;
        this.view3d?.invalidate();
        this.dailyReward.setVisible(true);
        const added = this.save ? grantCubeAwayDailyTools(this.save, this.context?.services.serverTime?.day) : 0;
        if (added > 0) {
            this.dailyHintReward += added;
            this.persist(false);
            this.refreshCurrentChrome();
            this.startDailyOrGuides();
        }
    }

    async restart(context?: MiniGameContext<CubeAwayServices>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.ui?.hideModal();
        if (this.state === 'paused') this.state = this.resumeTargetState;
        await this.enterLevel(this.levelNumber, false);
    }

    discardSavedProgress(): void {
        if (!this.save) return;
        this.save.draft = undefined;
        this.persist(false);
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused' || !this.ui) return;
        this.ui.showSettingsModal(this.levelNumber,
            () => { void model.resume(); },
            () => { void model.restart(); },
            () => { void model.resume().then(() => this.openMap()); },
            () => { void model.exit(); });
    }

    hidePauseMenu(): void {
        this.ui?.hideModal();
    }

    showResultView(model: MiniGameResultModel): void {
        if (!this.ui || !this.save) return;
        this.ui.showVictoryModal(
            this.levelNumber,
            this.board?.movesTaken ?? 1,
            this.board?.mistakesTaken ?? 0,
            this.levelNumber < (this.indexData?.totalLevels ?? CUBE_AWAY_TOTAL_LEVELS),
            () => {
                this.audioCtrl?.playTap();
                void model.restart();
            },
            () => void model.returnToLobby(),
        );
    }

    hideResultView(): void {
        this.ui?.hideModal();
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.persist(false);
        this.state = 'disposed';
        this.dailyReward.dispose();
        this.dailyHintReward = 0;
        this.generation++;
        this.busy = false;

        if (this.resizeBound) {
            view.off('canvas-resize', this.handleResize, this);
            this.resizeBound = false;
        }
        this.unscheduleAllCallbacks();
        this.teardownViewportInput();

        this.audioCtrl?.dispose();
        this.audioCtrl = undefined;
        this.view3d?.dispose();
        this.view3d = undefined;
        this.ui?.dispose();
        this.ui = undefined;

        if (this.context) {
            if (this.loadedSkin) {
                await this.context.services.assets.releaseDirectory(CUBE_ASSETS_BUNDLE, boardSkinDirectory(this.loadedSkin.id));
            }
            if (this.frames) {
                for (const key of Object.keys(this.frames)) {
                    this.context.services.assets.releaseRuntimeAsset(this.frames[key]);
                }
            }
            if (this.bgFrame) {
                this.context.services.assets.releaseRuntimeAsset(this.bgFrame);
            }
        }
        this.frames = undefined;
        this.loadedSkin = undefined;
        this.bgFrame = undefined;
        this.victoryDelayTimer = -1;
        this.pendingVictory = undefined;
        this.pendingFailure = false;
        this.chapterCache.clear();
        this.board = undefined;
        this.save = undefined;
        this.indexData = undefined;
        this.context = undefined;
        this.camera = undefined;
    }

    protected onDestroy(): void {
        void this.dispose();
    }

    protected update(dt: number): void {
        if (this.state === 'disposed') return;
        this.ui?.update(dt, this.state === 'paused');
        if (this.state === 'entering') {
            this.entranceElapsed = Math.min(BOARD_ENTRANCE_SECONDS, this.entranceElapsed + Math.min(dt, .06));
            this.view3d?.setEntranceProgress(this.entranceElapsed / BOARD_ENTRANCE_SECONDS);
            if (this.entranceElapsed === BOARD_ENTRANCE_SECONDS) {
                this.state = 'playing';
                this.startDailyOrGuides();
            }
            return;
        }
        if (this.state === 'playing') this.dailyReward.advance(dt);
        const playing = this.isGameplayActive();
        if (playing || this.state === 'completed' || this.state === 'failed') {
            this.view3d?.update(dt, this.activeTouchId === null);
        }
        if (this.state === 'failed' && this.pendingFailure && !this.view3d?.isCollisionAnimating) {
            this.pendingFailure = false;
            this.presentFailure();
        }
        if (this.isGameplayActive()) {
            this.elapsedSeconds += Math.min(0.2, dt);
        } else if (this.state === 'completed' && this.victoryDelayTimer >= 0) {
            this.victoryDelayTimer -= Math.min(0.2, dt);
            if (this.victoryDelayTimer <= 0 && this.pendingVictory) {
                const v = this.pendingVictory;
                this.victoryDelayTimer = -1;
                this.pendingVictory = undefined;
                this.audioCtrl?.playWin();
                this.ui?.showVictoryModal(
                    v.clearedNum,
                    v.moves,
                    v.mistakes,
                    v.hasNext,
                    () => {
                        this.audioCtrl?.playTap();
                        this.ui?.hideModal();
                        void this.enterLevel(v.clearedNum + 1, false);
                    },
                    () => {
                        this.ui?.hideModal();
                        this.openMap();
                    },
                );
            }
        }
    }

    protected lateUpdate(): void {
        this.view3d?.prepareRender();
    }

    private handleResize(): void {
        if (this.state === 'disposed') return;
        this.recomputeLayout();
        this.applyViewports();
    }

    private recomputeLayout(): void {
        const size = view.getVisibleSize();
        const platInfo = this.context?.services.platform.getLayoutInfo();
        const safe = calculateSafeContentBounds(size.width, size.height, platInfo);
        const safeRect = new Rect(safe.leftX, safe.bottomY, safe.width, safe.height);
        this.layout = computeCubeAwayLayout(size.width, size.height, safeRect);
    }

    private applyViewports(): void {
        this.ui?.updateBackgroundSize(this.layout.visibleWidth, this.layout.visibleHeight);
        const selecting = this.state === 'selecting' || this.state === 'paused' && this.resumeTargetState === 'selecting';
        if (this.view3d) {
            this.view3d.layout(this.layout.viewportWidth, this.layout.viewportHeight, this.layout.viewportCenterY, this.layout.centerX);
            this.view3d.projection.active = !selecting;
        }
        if (this.inputNode) {
            this.inputNode.active = !selecting && this.state !== 'disposed';
            this.inputNode.setPosition(this.layout.centerX, this.layout.viewportCenterY);
            this.inputNode.getComponent(UITransform)!.setContentSize(
                this.layout.viewportWidth,
                this.layout.viewportHeight,
            );
        }
        if (selecting) {
            this.refreshMapView();
        } else if (this.state !== 'disposed') {
            this.refreshPlayView();
            this.ui?.relayoutModal();
        }
        this.dailyReward.relayout(this.rewardBounds());
    }

    private setupViewportInput(): void {
        if (!this.ui) return;
        const n = new Node('CubeViewportInput');
        n.layer = this.node.layer;
        this.node.addChild(n);
        n.addComponent(UITransform).setContentSize(this.layout.viewportWidth, this.layout.viewportHeight);
        n.setPosition(this.layout.centerX, this.layout.viewportCenterY);

        n.on(Node.EventType.TOUCH_START, this.onViewportTouchStart, this);
        n.on(Node.EventType.TOUCH_MOVE, this.onViewportTouchMove, this);
        n.on(Node.EventType.TOUCH_END, this.onViewportTouchEnd, this);
        n.on(Node.EventType.TOUCH_CANCEL, this.onViewportTouchCancel, this);
        n.on(Node.EventType.MOUSE_WHEEL, this.onViewportWheel, this);
        this.inputNode = n;
    }

    private teardownViewportInput(): void {
        if (!this.inputNode?.isValid) {
            this.inputNode = undefined;
            return;
        }
        this.inputNode.off(Node.EventType.TOUCH_START, this.onViewportTouchStart, this);
        this.inputNode.off(Node.EventType.TOUCH_MOVE, this.onViewportTouchMove, this);
        this.inputNode.off(Node.EventType.TOUCH_END, this.onViewportTouchEnd, this);
        this.inputNode.off(Node.EventType.TOUCH_CANCEL, this.onViewportTouchCancel, this);
        this.inputNode.off(Node.EventType.MOUSE_WHEEL, this.onViewportWheel, this);
        this.inputNode.destroy();
        this.inputNode = undefined;
    }

    private onViewportTouchStart(ev: EventTouch): void {
        if (!this.isGameplayActive()) return;
        const loc = ev.getUILocation();
        const tid = ev.getID();
        if (this.activeTouchId === null) {
            this.view3d?.stopRotation();
            this.activeTouchId = tid;
            this.touchStartPos.set(loc.x, loc.y);
            this.lastTouchPos.set(loc.x, loc.y);
            this.isTapCandidate = true;
        } else if (this.secondaryTouchId === null && tid !== this.activeTouchId) {
            this.view3d?.stopRotation();
            this.isTapCandidate = false;
            this.secondaryTouchId = tid;
            this.secondaryTouchPos.set(loc.x, loc.y);
            this.pinchStartDist = Vec2.distance(this.lastTouchPos, this.secondaryTouchPos);
        }
    }

    private onViewportTouchMove(ev: EventTouch): void {
        if (!this.isGameplayActive() || !this.view3d) return;
        const loc = ev.getUILocation();
        const tid = ev.getID();

        if (this.secondaryTouchId !== null) {
            if (tid === this.activeTouchId) this.lastTouchPos.set(loc.x, loc.y);
            else if (tid === this.secondaryTouchId) this.secondaryTouchPos.set(loc.x, loc.y);
            const curDist = Vec2.distance(this.lastTouchPos, this.secondaryTouchPos);
            if (this.pinchStartDist > 8 && curDist > 8) {
                this.view3d.zoomByFactor(curDist / this.pinchStartDist);
                this.pinchStartDist = curDist;
            }
            return;
        }

        if (tid === this.activeTouchId) {
            const dx = loc.x - this.lastTouchPos.x;
            const dy = loc.y - this.lastTouchPos.y;
            this.lastTouchPos.set(loc.x, loc.y);
            if (Vec2.distance(this.touchStartPos, loc) >= 10) this.isTapCandidate = false;
            if (!this.isTapCandidate) {
                this.view3d.rotateByDelta(dx, dy);
            }
        }
    }

    private onViewportTouchEnd(ev: EventTouch): void {
        const tid = ev.getID();
        if (tid === this.secondaryTouchId) {
            this.secondaryTouchId = null;
            this.pinchStartDist = 0;
            return;
        }
        if (tid !== this.activeTouchId) return;
        this.releasePrimaryTouch();
        if (!this.isGameplayActive() || !this.view3d || !this.board) return;
        const loc = ev.getUILocation();
        if (this.isTapCandidate && Vec2.distance(this.touchStartPos, loc) < 10) {
            const halfW = this.layout.visibleWidth * 0.5;
            const halfH = this.layout.visibleHeight * 0.5;
            const worldUiX = loc.x - halfW;
            const worldUiY = loc.y - halfH;
            const localX = worldUiX - this.layout.centerX;
            const localY = worldUiY - this.layout.viewportCenterY;

            const hit = this.view3d.pickAtLocalPoint(localX, localY);
            if (hit) {
                this.handleArrowTap(hit.arrowId, hit.cellIndex, worldUiX, worldUiY);
            }
        }
    }

    private releasePrimaryTouch(): void {
        this.activeTouchId = this.secondaryTouchId;
        if (this.secondaryTouchId !== null) this.lastTouchPos.set(this.secondaryTouchPos);
        this.secondaryTouchId = null;
        this.pinchStartDist = 0;
    }

    private onViewportTouchCancel(ev: EventTouch): void {
        const tid = ev.getID();
        if (tid === this.activeTouchId || tid === this.secondaryTouchId) this.view3d?.stopRotation();
        if (tid === this.activeTouchId) this.releasePrimaryTouch();
        if (tid === this.secondaryTouchId) {
            this.secondaryTouchId = null;
            this.pinchStartDist = 0;
        }
    }

    private onViewportWheel(ev: EventMouse): void {
        if (!this.isGameplayActive() || !this.view3d) return;
        const delta = ev.getScrollY();
        if (delta !== 0) {
            this.view3d.zoomByFactor(delta > 0 ? 1.09 : 0.92);
        }
    }

    private handleArrowTap(arrowId: number, cellIndex: number, tapUiX?: number, tapUiY?: number): void {
        if (!this.isGameplayActive()) return;
        if (!this.board || !this.view3d || !this.save || !this.context) return;

        const res = this.board.tryTapArrow(arrowId, cellIndex);
        if (!res.accepted) return;

        if (res.outcome === 'clear' || res.outcome === 'pause') {
            if (tapUiX !== undefined && tapUiY !== undefined) this.ui?.spawnTapRipple(tapUiX, tapUiY);
            this.view3d.setHintedArrows([]);
            const hasSplit = res.traces.some((t) => Boolean(t.splitBranches));
            if (hasSplit) {
                this.audioCtrl?.playSplit();
            } else if (res.firedArrowIds.length) {
                this.audioCtrl?.playFly();
            } else {
                this.audioCtrl?.playPauseStop();
            }
            this.context.services.feedback.vibrate('light');

            for (const tr of res.traces) {
                for (const upd of tr.reverseUpdates) {
                    const g = this.board.gimmicks.get(upd.cellId);
                    this.view3d.refreshReverseGimmick(upd.cellId, g?.currentReverseDir ?? upd.nextDir);
                }
                if (tr.outcome === 'pause') {
                    this.view3d.rebuildArrow(tr.arrowId);
                    this.view3d.showPauseStop(tr.arrowId);
                    continue;
                }
                const p1 = tr.splitBranches ? tr.steps.concat(tr.splitBranches[0].steps) : tr.steps;
                const d1 = tr.splitBranches ? tr.splitBranches[0].finalDir : tr.finalDir;
                const p2 = tr.splitBranches ? tr.splitBranches[1].steps : [];
                const d2 = tr.splitBranches ? tr.splitBranches[1].finalDir : tr.finalDir;
                const splitOrigin = tr.splitBranches && tr.steps.length > 0
                    ? tr.steps[tr.steps.length - 1].cellId
                    : undefined;
                this.view3d.animateFly(tr.arrowId, p1, d1, tr.useTail, p2, d2, splitOrigin);
            }
            this.syncDraftAndSave();
            this.refreshCurrentChrome();

            if (res.levelCleared) {
                this.handleVictory();
            }
        } else if (res.outcome === 'blocked') {
            this.lives = Math.max(0, this.lives - 1);
            this.audioCtrl?.playBlocked();
            this.context.services.feedback.vibrate('medium');
            for (const bid of res.bouncedArrowIds) {
                const tr = res.traces.find((t) => t.arrowId === bid);
                this.view3d.animateBounce(
                    bid,
                    tr?.steps ?? [],
                    tr?.finalDir,
                    tr?.useTail ?? false,
                    tr?.blockerCellId,
                );
            }
            this.ui?.flashBlockedWarning(tapUiX, tapUiY);
            this.syncDraftAndSave();
            this.refreshCurrentChrome();

            if (this.lives <= 0) {
                this.handleOutOfLives();
            }
        }
    }

    private handleVictory(): void {
        if (!this.save || !this.board || !this.context || !this.indexData) return;
        this.state = 'completed';
        const clearedNum = this.levelNumber;
        const moves = Math.max(1, this.board.movesTaken);
        const mistakes = this.board.mistakesTaken;

        completeCubeAwayLevel(this.save, clearedNum, moves, this.indexData.totalLevels);
        this.persist(true);
        this.context.reportScore(this.save.cleared);
        this.context.reportAchievementProgress('cleared-levels', this.save.cleared);
        this.context.reportRoundFinished?.();

        const hasNext = clearedNum < this.indexData.totalLevels;
        this.pendingVictory = {
            clearedNum,
            moves,
            mistakes,
            totalCleared: this.save.cleared,
            totalLevels: this.indexData.totalLevels,
            hasNext,
        };
        this.victoryDelayTimer = 0.42;
    }

    private handleOutOfLives(): void {
        this.state = 'failed';
        this.pendingFailure = true;
    }

    private presentFailure(): void {
        if (!this.context || !this.ui) return;
        this.audioCtrl?.playLose();
        const adsEnabled = this.context.services.ads.isEnabledForGame(this.context.gameId);

        this.ui.showReviveModal(
            this.levelNumber,
            adsEnabled,
            () => void this.handleWatchAdRevive(),
            () => {
                this.ui?.hideModal();
                void this.enterLevel(this.levelNumber, false);
            },
            () => {
                this.ui?.hideModal();
                this.openMap();
            },
            this.board?.remainingCount ?? 0,
        );
    }

    private async handleWatchAdRevive(): Promise<void> {
        const context = this.context;
        if (!context || this.state !== 'failed' || this.pendingFailure || this.busy
            || !context.services.ads.isEnabledForGame(context.gameId)) return;
        this.busy = true;
        try {
            const res = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.cubeAwayRevive,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if ((this.state as GameState) === 'disposed' || this.context !== context) return;
            if (res.outcome === 'completed') {
                this.lives = 2;
                this.state = 'playing';
                this.ui?.hideModal();
                this.syncDraftAndSave();
                this.refreshCurrentChrome();
            }
        } catch (err) {
            console.warn('[CubeAway] Failed to load revive ad:', err);
        } finally {
            this.busy = false;
        }
    }

    private async handleHintAction(): Promise<void> {
        if (!this.board || !this.view3d || !this.save || !this.context || !this.isGameplayActive()) return;
        if (this.save.hints <= 0) {
            if (!this.context.services.ads.isEnabledForGame(this.context.gameId)) return;
            this.busy = true;
            try {
                const res = await this.context.services.ads.showRewarded({
                    placement: AD_PLACEMENTS.cubeAwayRevive,
                    gameId: this.context.gameId,
                    sessionId: this.context.sessionId,
                });
                if ((this.state as GameState) === 'disposed') return;
                if (res.outcome === 'completed') {
                    this.save.hints += 2;
                    this.persist(false);
                    this.refreshCurrentChrome();
                }
            } catch (error) {
                console.warn('[CubeAway] Failed to load hint ad:', error);
            } finally {
                this.busy = false;
            }
            return;
        }

        const hint = this.board.findHint(350);
        if (!hint) return;
        this.save.hints--;
        this.persist(false);
        this.refreshCurrentChrome();
        this.applyAllFireableHint(hint.arrowId, hint.tappedCellIndex);
    }

    private applyAllFireableHint(focusArrowId: number, cellIndex = 0): void {
        if (!this.board || !this.view3d) return;
        const allFireable = this.board.collectFireableArrowIds();
        const highlightIds = allFireable.length > 0 ? allFireable : [focusArrowId];
        this.audioCtrl?.playHint();
        this.view3d.setHintedArrows(highlightIds, focusArrowId, true, cellIndex);
    }

    private openSettingsModal(): void {
        if (!this.ui || !this.audioCtrl || !this.isGameplayActive()) return;
        this.audioCtrl.playPopup();
        this.ui.showSettingsModal(
            this.levelNumber,
            () => {
                this.audioCtrl?.playTap();
                this.ui?.hideModal();
            },
            () => {
                this.audioCtrl?.playTap();
                this.ui?.hideModal();
                void this.enterLevel(this.levelNumber, false);
            },
            () => {
                this.audioCtrl?.playTap();
                this.ui?.hideModal();
                this.openMap();
            },
            () => {
                this.audioCtrl?.playTap();
                this.ui?.hideModal();
                this.exitToLobby();
            },
        );
    }

    private openMap(): void {
        if (!this.save) return;
        this.state = 'selecting';
        this.victoryDelayTimer = -1;
        this.pendingVictory = undefined;
        this.pendingFailure = false;
        this.activeChapter = this.chapterForLevel(this.levelNumber);
        if (this.view3d) this.view3d.projection.active = false;
        if (this.inputNode) this.inputNode.active = false;
        this.refreshMapView();
    }

    private refreshMapView(): void {
        if (!this.indexData || !this.save || !this.ui) return;
        const ch = this.indexData.chapters.find((c) => c.chapter === this.activeChapter) ?? this.indexData.chapters[0];
        this.ui.showMap({
            chapter: ch,
            levels: this.indexData.levels,
            totalChapters: this.indexData.totalChapters,
            cleared: this.save.cleared,
            totalLevels: this.indexData.totalLevels,
            unlocked: this.save.unlocked,
            current: this.save.current,
            soundEnabled: this.audioCtrl?.isSoundEnabled ?? true,
        }, this.layout);
    }

    private refreshPlayView(): void {
        if (!this.indexData || !this.save || !this.ui) return;
        const ch = this.chapterSummaryForLevel(this.levelNumber);
        if (this.view3d) this.view3d.projection.active = true;
        if (this.inputNode) this.inputNode.active = true;
        this.ui.showPlay({
            levelNumber: this.levelNumber,
            chapterTitle: ch.title,
            remainingArrows: this.board?.remainingCount ?? 0,
            lives: this.lives,
            maxLives: MAX_LIVES,
            hints: Math.max(0, this.save.hints - this.dailyHintReward),
            difficulty: this.indexData.levels[this.levelNumber - 1].difficulty,
            adsEnabled: this.context?.services.ads.isEnabledForGame(this.context.gameId) ?? false,
            soundEnabled: this.audioCtrl?.isSoundEnabled ?? true,
        }, this.layout);
    }

    private refreshCurrentChrome(): void {
        if (this.state === 'selecting') {
            this.refreshMapView();
        } else if (this.ui && this.save && this.indexData) {
            const ch = this.chapterSummaryForLevel(this.levelNumber);
            this.ui.refreshPlayHud({
                levelNumber: this.levelNumber,
                chapterTitle: ch.title,
                remainingArrows: this.board?.remainingCount ?? 0,
                lives: this.lives,
                maxLives: MAX_LIVES,
                hints: Math.max(0, this.save.hints - this.dailyHintReward),
                difficulty: this.indexData.levels[this.levelNumber - 1].difficulty,
                adsEnabled: this.context?.services.ads.isEnabledForGame(this.context.gameId) ?? false,
                soundEnabled: this.audioCtrl?.isSoundEnabled ?? true,
            });
        }
    }

    private rewardBounds() {
        return { width: this.layout.visibleWidth, height: this.layout.visibleHeight, top: this.layout.safeTop, bottom: this.layout.safeBottom };
    }

    private startDailyOrGuides(): void {
        if (this.state !== 'playing' || !this.ui) return;
        if (this.dailyReward.active) return;
        if (this.dailyHintReward <= 0) {
            this.maybeAnnounceNewMechanics(this.levelNumber);
            this.maybeStartLevel1Guide();
            return;
        }
        const amount = this.dailyHintReward;
        this.dailyReward.start({
            parent: this.node, bounds: this.rewardBounds(), title: '每日补给', titleFontSize: 50, titleGap: 30, amountFontSize: 46,
            labelFont: this.node.getComponent(CubeAwayTypography)?.bold, labelShadow: false,
            drawRevealBackdrop: drawRewardBackdrop,
            setBackdropStrength: strength => this.view3d?.setRewardBackdropStrength(strength),
            colors: {
                dim: hexColor(CUBE_AWAY_THEME.cardBg, 0),
                shadow: hexColor(CUBE_AWAY_THEME.panelShade, 42),
                accent: hexColor(CUBE_AWAY_THEME.goldColor),
                text: hexColor(CUBE_AWAY_THEME.ink),
            },
            items: [{ caption: `提示 +${amount}`, createIcon: parent => rewardBulb(parent),
                target: () => this.ui?.hintTarget,
                pulseTarget: () => this.ui?.hintStock,
                onArrive: () => { this.dailyHintReward = Math.max(0, this.dailyHintReward - amount); this.refreshCurrentChrome(); } }],
            onFinish: () => this.startDailyOrGuides(),
        });
    }

    private maybeStartLevel1Guide(): void {
        if (this.previewPureBoard || this.dailyReward.active || this.dailyHintReward > 0) return;
        if (!this.save || !this.ui || !this.board || !this.view3d) return;
        if (this.levelNumber !== 1) return;
        if (!this.previewForceGuide && this.save.cleared > 0 && this.save.seenMechanics.indexOf('basic') >= 0) return;

        if (this.save.seenMechanics.indexOf('basic') < 0) {
            this.save.seenMechanics.push('basic');
            this.persist(false);
        }
        this.presentMechanicSpotlights(['basic']);
    }

    private maybeAnnounceNewMechanics(levelNumber: number): void {
        if (this.previewPureBoard || this.dailyReward.active || this.dailyHintReward > 0) return;
        if (!this.save || !this.indexData || !this.ui || !this.view3d) return;
        if (this.previewMechGuide) {
            const key = this.previewMechGuide;
            this.previewMechGuide = '';
            this.presentMechanicSpotlights([key]);
            return;
        }
        const sum = this.indexData.levels[levelNumber - 1];
        if (!sum) return;
        const unseen = sum.m.filter((m) => this.save!.seenMechanics.indexOf(m) < 0);
        if (unseen.length > 0) {
            for (const m of unseen) this.save.seenMechanics.push(m);
            this.persist(false);
            this.presentMechanicSpotlights(unseen);
        }
    }

    private presentMechanicSpotlights(keys: readonly string[]): void {
        if (!this.ui || !this.view3d || keys.length === 0) return;
        let idx = 0;
        const showNext = (): void => {
            if (!this.isValid || !this.ui || !this.view3d) return;
            if (idx >= keys.length) {
                this.view3d.setHintedArrows([]);
                this.ui.hideModal();
                return;
            }
            const key = keys[idx];
            this.ui.showMechanicSpotlight(key, () => this.view3d?.focusAndLocateMechanic(key) ?? null, idx, keys.length, (tapped) => {
                if (tapped) this.audioCtrl?.playTap();
                this.view3d?.setHintedArrows([]);
                idx++;
                showNext();
            });
        };
        showNext();
    }

    private async enterLevel(levelNumber: number, restoreDraft: boolean, initialLoad = false): Promise<void> {
        if (!this.indexData || !this.save || !this.context || !this.view3d || !this.ui) return;
        const lastUnlocked = Math.min(this.save.unlocked, this.indexData.totalLevels);
        if (this.busy || !Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > lastUnlocked) return;
        const gen = this.generation;
        this.busy = true;
        try {
            const chNum = this.chapterForLevel(levelNumber);
            let pack = this.chapterCache.get(chNum);
            if (!pack) {
                const padded = chNum < 10 ? `0${chNum}` : String(chNum);
                const jsonAsset = await this.context.services.assets.loadAsset(CUBE_ASSETS_BUNDLE, `configs/ch_${padded}`, JsonAsset);
                if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;
                pack = jsonAsset.json as ChapterPack;
                if (pack?.bankId !== this.indexData.bankId || pack.chapter !== chNum || !Array.isArray(pack.levels)) {
                    throw new Error(`CubeAway chapter ${chNum} is invalid for bank ${this.indexData.bankId}`);
                }
                this.chapterCache.set(chNum, pack);
            }
            const levelPack: RawLevelPack | undefined = pack.levels.find((l) => l.id === levelNumber);
            if (!levelPack) throw new Error(`Missing level pack #${levelNumber}`);

            const skin = chooseBoardSkin(levelNumber, this.save.boardSkin);
            const assets = this.context.services.assets;
            const previousSkin = this.loadedSkin;
            let surface = previousSkin?.id === skin.id ? previousSkin.surface : undefined;
            if (!surface) {
                const directory = boardSkinDirectory(skin.id);
                try {
                    const frames = await assets.loadDirectoryFrames(CUBE_ASSETS_BUNDLE, directory);
                    if (!frames.surface?.texture) throw new Error(`Missing board painting in ${directory}`);
                    surface = frames.surface;
                } catch (error) {
                    if (gen !== this.generation) return;
                    console.warn('[CubeAway] Board painting unavailable:', error);
                    await assets.releaseDirectory(CUBE_ASSETS_BUNDLE, directory);
                }
                if (!this.isValid || gen !== this.generation || (this.state as GameState) === 'disposed') return;
            }
            this.levelNumber = levelNumber;
            this.activeChapter = chNum;
            this.save.current = levelNumber;
            this.lives = MAX_LIVES;
            this.elapsedSeconds = 0;
            this.victoryDelayTimer = -1;
            this.pendingVictory = undefined;
            this.pendingFailure = false;

            let board = new CubeAwayBoard(levelPack);
            if (restoreDraft && this.save.draft && this.save.draft.level === levelNumber) {
                for (const removedId of this.save.draft.removedArrowIds) {
                    if (board.arrows[removedId]) board.arrows[removedId].removed = true;
                }
                for (const key of Object.keys(this.save.draft.reverseDirs)) {
                    const g = board.gimmicks.get(key);
                    if (g && g.type === 'reverse_changer') {
                        g.currentReverseDir = this.save.draft.reverseDirs[key] as DirName;
                    }
                }
                board.movesTaken = this.save.draft.moves;
                board.mistakesTaken = this.save.draft.mistakes ?? 0;
                board.restorePausedSnakes(this.save.draft.pausedSnakes ?? []);
                if (board.isCleared) {
                    board = new CubeAwayBoard(levelPack);
                    this.save.draft = undefined;
                } else {
                    this.lives = Math.max(1, Math.min(MAX_LIVES, this.save.draft.livesLeft));
                    this.elapsedSeconds = this.save.draft.elapsedSeconds;
                }
            } else {
                this.save.draft = undefined;
            }

            this.board = board;
            this.view3d.bindBoard(board, surface);
            this.save.boardSkin = skin;
            this.loadedSkin = surface ? { id: skin.id, surface } : undefined;
            if (!initialLoad) this.startBoardEntrance();
            this.persist(false);
            if (previousSkin && previousSkin.id !== skin.id) {
                await assets.releaseDirectory(CUBE_ASSETS_BUNDLE, boardSkinDirectory(previousSkin.id));
            }
        } finally {
            this.busy = false;
        }
    }

    private syncDraftAndSave(): void {
        if (!this.save || !this.board) return;
        if (this.board.isCleared) {
            this.save.draft = undefined;
            return;
        }
        const removedArrowIds: number[] = [];
        for (const a of this.board.arrows) {
            if (a.removed) removedArrowIds.push(a.id);
        }
        const reverseDirs: Record<string, string> = {};
        this.board.gimmicks.forEach((g) => {
            if (g.type === 'reverse_changer' && g.currentReverseDir) {
                reverseDirs[g.cellId] = g.currentReverseDir;
            }
        });
        this.save.draft = {
            level: this.levelNumber,
            removedArrowIds,
            pausedSnakes: this.board.getPausedSnakes(),
            mistakes: this.board.mistakesTaken,
            reverseDirs,
            livesLeft: this.lives,
            moves: this.board.movesTaken,
            elapsedSeconds: this.elapsedSeconds,
        };
        this.persist(false);
    }

    private persist(clearDraft = false): void {
        if (!this.save || !this.context) return;
        if (clearDraft) this.save.draft = undefined;
        try {
            const prev = this.context.services.storage.getGameData(this.context.gameId);
            this.context.services.storage.writeGameData(this.context.gameId, {
                ...prev,
                dataVersion: this.save.version,
                playCount: (prev?.playCount ?? 0),
                highScore: Math.max(prev?.highScore ?? 0, this.save.cleared),
                lastPlayedAt: Date.now(),
                custom: {
                    cubeAway: serializeCubeAwaySave(this.save),
                },
            });
        } catch (err) {
            console.warn('[CubeAway] Failed to persist save:', err);
        }
    }

    private exitToLobby(): void {
        this.persist(false);
        const res: GameResult = {
            score: this.save?.cleared ?? 0,
            completed: false,
            duration: this.elapsedSeconds,
            extra: {
                level: this.levelNumber,
                moves: this.board?.movesTaken ?? 0,
            },
        };
        this.context?.requestLobby(res);
    }

    private chapterForLevel(levelNum: number): number {
        return Math.max(1, Math.min(CUBE_AWAY_CHAPTER_COUNT, Math.floor((levelNum - 1) / CUBE_AWAY_CHAPTER_SIZE) + 1));
    }

    private chapterSummaryForLevel(levelNum: number): ChapterSummary {
        const chNum = this.chapterForLevel(levelNum);
        return this.indexData!.chapters.find((c) => c.chapter === chNum) ?? this.indexData!.chapters[0];
    }
}

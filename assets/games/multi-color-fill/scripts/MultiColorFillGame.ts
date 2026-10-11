import {
    _decorator, BlockInputEvents, Color, Component, EventTouch, Graphics, Label, Node,
    ResolutionPolicy, Tween, tween, UITransform, Vec2, Vec3, view,
} from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { setLabelBold } from '../../../services/font/FontBinding';
import { MULTI_COLOR_FILL_LEVELS, type MultiColorFillMode } from './MultiColorFillLevels';
import { MultiColorFillModel } from './MultiColorFillModel';
import { MultiColorFillEffects } from './MultiColorFillEffects';
import { MultiColorFillGuide } from './MultiColorFillGuide';
import { completeFillLevel, fillUnlocked, MULTI_COLOR_FILL_DATA_VERSION, readFillSave, type MultiColorFillSave } from './MultiColorFillSave';
import { calculateFillLayout, type MultiColorFillLayout } from './MultiColorFillLayout';
import { FILL_AUDIO, FILL_COLORS, FILL_MODE_NAMES, FILL_THEME, fillColorSets, type FillColorSet } from './MultiColorFillTheme';

const { ccclass } = _decorator;
const PER_PAGE = 30;
type FillState = 'idle' | 'ready' | 'playing' | 'selecting' | 'paused' | 'completed' | 'disposed';
interface FillServices {
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
}
interface FillButton { readonly node: Node; readonly label: Label; }
interface OverlayAction { readonly name: string; readonly text: string; readonly primary?: boolean; readonly action: () => void | Promise<void>; }

function color(hex: string, alpha = 255): Color {
    const result = new Color(); Color.fromHEX(result, hex); result.a = alpha; return result;
}
function timeText(seconds: number): string {
    const value = Math.min(359999, Math.floor(Math.max(0, seconds)));
    const minutes = Math.floor(value / 60), remainder = value % 60;
    return `${minutes < 10 ? '0' : ''}${minutes}:${remainder < 10 ? '0' : ''}${remainder}`;
}

/** 彩路的页面、输入和生命周期；题库/模型完全独立，公共服务只从 Context 获取。 */
@ccclass('MultiColorFillGame')
export class MultiColorFillGame extends Component implements MiniGame<FillServices> {
    private state: FillState = 'idle';
    private context?: MiniGameContext<FillServices>;
    private save?: MultiColorFillSave;
    private model?: MultiColorFillModel;
    private mode: MultiColorFillMode = 'normal';
    private levelNumber = 1;
    private selectionMode: MultiColorFillMode = 'normal';
    private selectionPage = 0;
    private layout?: MultiColorFillLayout;
    private page?: Node;
    private background?: Node;
    private overlay?: Node;
    private audioBank?: BundleAudioBank;
    private pageGeneration = 0;
    private actionBusy = false;
    private pendingRules = false;
    private touchId?: number;
    private lastTouch?: Vec2;
    private boardInput?: Node;
    private tiles: { readonly node: Node; readonly graphics: Graphics; readonly cell: number }[] = [];
    private routeGraphics?: Graphics;
    private capGraphics?: Graphics;
    private fingerGraphics?: Graphics;
    private boardSparkles?: Graphics;
    private guideGraphics?: Graphics;
    private guideLabel?: Label;
    private pointerPoint?: Vec2;
    private readonly effects = new MultiColorFillEffects();
    private readonly guide = new MultiColorFillGuide();
    private colors: readonly FillColorSet[] = [];
    private winGraphics?: Graphics;
    private winTime = 0;
    private toastLabel?: Label;
    private toastToken = 0;
    private undoButton?: FillButton;
    private resetButton?: FillButton;
    private resizeListening = false;
    private autoSaveSeconds = 0;

    async initialize(context: MiniGameContext<FillServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize MultiColorFill from ${this.state}`);
        this.context = context;
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
        const stored = context.services.storage.getGameData(context.gameId);
        this.save = readFillSave(stored?.dataVersion === MULTI_COLOR_FILL_DATA_VERSION ? stored.custom?.fill : undefined);
        this.mode = this.save.mode;
        this.levelNumber = this.save.modes[this.mode].current;
        this.model = new MultiColorFillModel(this.levels().get(this.levelNumber - 1), this.save.modes[this.mode].draft);
        this.resetEffects();
        this.rebuildPage();
        view.on('canvas-resize', this.handleResize, this);
        this.resizeListening = true;
        this.audioBank = new BundleAudioBank(FILL_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as FillState) !== 'disposed') this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin MultiColorFill from ${this.state}`);
        this.state = 'playing';
        this.renderBoard();
        if (this.model?.completed) this.completeLevel();
    }

    pause(): boolean {
        if (this.state === 'idle' || this.state === 'ready' || this.state === 'disposed') return false;
        this.finishStroke();
        this.completeLevel();
        this.persist();
        if (this.state === 'selecting' || this.state === 'completed') return false;
        this.state = 'paused';
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.pendingRules = false;
        this.renderBoard();
        this.completeLevel();
    }

    async restart(context?: MiniGameContext<FillServices>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.startLevel(this.mode, this.levelNumber, false);
    }

    discardSavedProgress(): void {
        if (!this.save) return;
        this.save.modes[this.mode].draft = undefined;
        this.persist(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.finishStroke();
        this.persist();
        this.state = 'disposed';
        if (this.resizeListening) view.off('canvas-resize', this.handleResize, this);
        this.resizeListening = false;
        this.unscheduleAllCallbacks();
        this.destroyOverlay();
        this.clearPage();
        this.destroyNode(this.background);
        this.background = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.layout = undefined;
        this.model = undefined;
        this.effects.dispose(); this.guide.dispose(); this.colors = [];
        this.save = undefined;
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        if (this.pendingRules) { this.pendingRules = false; this.showRules(model); return; }
        this.showOverlay('休息一下', `${FILL_MODE_NAMES[this.mode]} · 第 ${this.levelNumber} 关`, [
            { name: 'Resume', text: '继续游戏', primary: true, action: () => model.resume() },
            { name: 'Restart', text: '重新开始', action: () => model.restart() },
            { name: 'Undo', text: '撤销上次拖动', action: async () => { await model.resume(); this.undo(); } },
            { name: 'Rules', text: '玩法说明', action: () => this.showRules(model) },
            { name: 'Select', text: '选择关卡', action: async () => { await model.resume(); this.openLevelSelect(); } },
            { name: 'Lobby', text: '返回大厅', action: () => model.exit() },
        ]);
    }

    hidePauseMenu(): void { this.destroyOverlay(); }
    showResultView(model: MiniGameResultModel): void {
        this.showOverlay('本局结束', undefined, [
            { name: 'Restart', text: '重新开始', primary: true, action: () => model.restart() },
            { name: 'Lobby', text: '返回大厅', action: () => model.returnToLobby() },
        ]);
    }
    hideResultView(): void { this.destroyOverlay(); }

    protected update(deltaTime: number): void {
        if (!this.model || (this.state !== 'playing' && this.state !== 'completed')) return;
        const seconds = Math.min(Math.max(deltaTime, 0), .25), wasAnimating = this.effects.animating;
        this.guide.advance(seconds);
        if (this.effects.advance(seconds) || wasAnimating || this.guide.active) this.renderBoard();
        if (this.state === 'completed') {
            if (!this.overlay && this.effects.readyToReveal) this.showCompletion();
            if (this.winGraphics?.isValid) { this.winTime += seconds; this.renderCelebration(); }
            return;
        }
        this.model.elapsed += Math.min(Math.max(deltaTime, 0), 1);
        this.autoSaveSeconds += deltaTime;
        if (this.autoSaveSeconds >= 5) { this.autoSaveSeconds = 0; this.persist(); }
    }

    private levels(mode = this.mode) { return MULTI_COLOR_FILL_LEVELS[mode]; }

    private startLevel(mode: MultiColorFillMode, number: number, restore = true): void {
        if (!this.save || this.state === 'disposed') return;
        const progress = this.save.modes[mode];
        if (!Number.isInteger(number) || number < 1 || number > fillUnlocked(mode, progress)) return;
        this.finishStroke();
        this.destroyOverlay();
        const continuing = restore && this.model && !this.model.completed && mode === this.mode && number === this.levelNumber;
        this.mode = mode;
        this.save.mode = mode;
        this.levelNumber = number;
        if (!continuing) this.model = new MultiColorFillModel(this.levels().get(number - 1),
            restore && progress.current === number ? progress.draft : undefined);
        progress.current = number;
        this.state = 'playing';
        this.pendingRules = false;
        this.resetEffects();
        this.autoSaveSeconds = 0;
        this.rebuildPage();
        this.persist();
        if (this.model?.completed) this.completeLevel();
    }

    private resetEffects(): void {
        if (!this.model) return;
        this.effects.reset(this.model.paths, this.model.level.width * this.model.level.height);
        this.guide.reset(this.model.level.solution, this.mode === 'normal' && this.levelNumber === 1
            && this.model.strokes === 0
            && this.model.paths.every(path => path.length === 1));
        this.colors = fillColorSets(this.model.paths.length, this.levelNumber);
        this.pointerPoint = undefined;
    }

    private persist(snapshot = true): void {
        const context = this.context, save = this.save, model = this.model;
        if (!context || !save) return;
        if (snapshot && model && !model.completed) {
            const progress = save.modes[this.mode];
            progress.current = this.levelNumber;
            progress.draft = model.snapshot();
        }
        const stored = context.services.storage.getGameData(context.gameId);
        // StorageService 只冻结外层，独立序列化避免之后的棋盘操作修改已提交的存档。
        const frozen = JSON.parse(JSON.stringify(save)) as MultiColorFillSave;
        try {
            context.services.storage.writeGameData(context.gameId, {
                dataVersion: MULTI_COLOR_FILL_DATA_VERSION,
                playCount: stored?.playCount ?? 0,
                highScore: Math.max(stored?.highScore ?? 0, save.modes.normal.cleared + save.modes.hard.cleared),
                lastPlayedAt: Date.now(), custom: { fill: frozen },
            });
        } catch (error: unknown) {
            console.warn('[MultiColorFill] Save failed', error);
            this.showToast('进度暂未保存，请稍后重试');
        }
    }

    private computeLayout(): MultiColorFillLayout {
        const size = view.getVisibleSize();
        const platform = this.context?.services.platform.getLayoutInfo();
        const level = this.model?.level;
        return calculateFillLayout(size.width, size.height, level?.width ?? 5, level?.height ?? 5, {
            top: platform?.safeArea.top,
            bottom: size.height - (platform?.safeArea.bottom ?? size.height),
            capsuleBottom: platform?.topRightReservedArea?.bottom,
        });
    }

    private handleResize(): void {
        if (this.state === 'idle' || this.state === 'disposed') return;
        this.finishStroke();
        this.completeLevel();
        // 暂停/说明/结果页的操作回调留在原节点上；只更新它们共有的安全区父容器。
        if (this.overlay) {
            this.layout = this.computeLayout();
            if (this.page) { this.page.setScale(this.layout.scale, this.layout.scale, 1); this.page.setPosition(0, this.layout.centerY); }
            this.positionPlayingAnchors();
            this.buildBackground();
            this.resizeOverlayDim();
        } else this.rebuildPage();
    }

    private positionPlayingAnchors(): void {
        const page = this.page, layout = this.layout;
        if (!page?.getChildByName('BoardPlate') || !layout) return;
        for (const name of ['SelectLevels', 'Reset']) {
            const node = page.getChildByName(name); if (node) node.setPosition(node.position.x, layout.headerY);
        }
        for (const name of ['ModeBadge', 'ModeName', 'LevelTitle']) {
            const node = page.getChildByName(name);
            if (node) node.setPosition(0, layout.headerY + (name === 'LevelTitle' ? -13 : 25));
        }
        for (const name of ['Undo', 'Pause', 'Rules', 'Hint', 'Help']) {
            const node = page.getChildByName(name);
            if (node) node.setPosition(node.position.x, layout.controlsY + (name === 'Help' ? 91 : 0));
        }
    }

    private rebuildPage(): void {
        this.clearPage();
        this.layout = this.computeLayout();
        this.buildBackground();
        this.page = this.makeNode('FillPage', this.node, 750, 1110, 0, this.layout.centerY);
        this.page.setScale(this.layout.scale, this.layout.scale, 1);
        if (this.state === 'selecting') this.buildLevelSelect(); else this.buildPlayingPage();
    }

    private buildBackground(): void {
        this.destroyNode(this.background);
        const layout = this.layout!;
        this.background = this.makeNode('FillBackground', this.node, layout.width, layout.height);
        this.background.setSiblingIndex(0);
        const graphics = this.background.addComponent(Graphics);
        graphics.fillColor = color(FILL_THEME.background);
        graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height); graphics.fill();
    }

    private buildPlayingPage(): void {
        const page = this.page!, model = this.model;
        if (!model) return;
        const layout = this.layout!, headerY = layout.headerY, controlsY = layout.controlsY, pitch = layout.boardPitch;
        this.iconButton('SelectLevels', page, 'back', -318, headerY, 82, () => this.openLevelSelect());
        this.resetButton = this.iconButton('Reset', page, 'reset', 318, headerY, 82, () => {
            if (this.state === 'playing' || this.state === 'completed') this.context?.requestRestart();
        });
        this.panel('ModeBadge', page, 152, 27, 0, headerY + 25, FILL_THEME.modeBadge, 14);
        this.text('ModeName', page, FILL_MODE_NAMES[this.mode], 0, headerY + 25, 148, 27, 18, FILL_THEME.ink, true);
        this.text('LevelTitle', page, `第 ${this.levelNumber} 关`, 0, headerY - 13, 408, 55, 36, FILL_THEME.ink, true);
        const board = this.makeNode('BoardPlate', page, layout.boardWidth, layout.boardHeight, 0, 30);
        const tileLayer = this.makeNode('Tiles', board, layout.boardWidth, layout.boardHeight);
        for (let cell = 0; cell < model.level.width * model.level.height; cell += 1) {
            const point = this.cellPoint(cell);
            const node = this.makeNode(`Cell${cell}`, tileLayer, pitch, pitch, point.x, point.y);
            this.tiles.push({ node, graphics: node.addComponent(Graphics), cell });
        }
        this.routeGraphics = this.makeNode('Routes', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.capGraphics = this.makeNode('Dots', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.boardSparkles = this.makeNode('BoardSparkles', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.fingerGraphics = this.makeNode('FingerCircle', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        if (this.guide.active) {
            this.guideGraphics = this.makeNode('FirstLevelGesture', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
            this.guideLabel = this.text('FirstLevelGuide', page, '跟着手指，滑动填满方格',
                0, 30 - layout.boardHeight / 2 - 95, 680, 48, 23, FILL_THEME.ink);
        }
        this.boardInput = this.makeNode('BoardInput', board, layout.boardWidth, layout.boardHeight);
        this.boardInput.on(Node.EventType.TOUCH_START, this.onBoardStart, this);
        this.boardInput.on(Node.EventType.TOUCH_MOVE, this.onBoardMove, this);
        this.boardInput.on(Node.EventType.TOUCH_END, this.onBoardEnd, this);
        this.boardInput.on(Node.EventType.TOUCH_CANCEL, this.onBoardCancel, this);
        this.undoButton = this.iconButton('Undo', page, 'undo', -260, controlsY, 62, () => this.undo());
        this.iconButton('Pause', page, 'pause', -165, controlsY, 62, () => {
            if (this.state === 'playing') this.context?.requestPause();
        });
        this.iconButton('Rules', page, 'rules', -70, controlsY, 62, () => {
            if (this.state !== 'playing') return;
            this.pendingRules = true; this.context?.requestPause();
        });
        this.iconButton('Hint', page, 'hint', 245, controlsY, 94, () => this.giveHint());
        this.toastLabel = this.text('Help', page, '', 0, controlsY + 91, 680, 68, 22, FILL_THEME.muted);
        this.renderBoard();
    }

    private iconButton(name: string, parent: Node, icon: 'back' | 'reset' | 'undo' | 'pause' | 'rules' | 'hint',
        x: number, y: number, size: number, action: () => void | Promise<void>): FillButton {
        const button = this.button(name, parent, '', x, y, size, size, action);
        this.drawControl(button, icon, true);
        if (icon === 'rules') { button.label.string = '?'; button.label.fontSize = 31; button.label.color = color(FILL_THEME.muted); }
        return button;
    }

    private drawControl(button: FillButton, icon: string, enabled: boolean): void {
        const g = button.node.getComponent(Graphics)!, size = button.node.getComponent(UITransform)!.width;
        const small = size < 70, r = size / 2, factor = size / 82;
        g.clear();
        if (icon === 'hint') {
            g.fillColor = color('#B94D7F'); g.circle(0, -5, r); g.fill();
            g.fillColor = color(FILL_THEME.hint); g.circle(0, 0, r); g.fill();
            g.strokeColor = color(FILL_THEME.ink); g.lineWidth = 5; g.lineCap = Graphics.LineCap.ROUND;
            g.circle(0, 5, 16); g.stroke();
            g.moveTo(-10, -7); g.lineTo(-7, -21); g.lineTo(7, -21); g.lineTo(10, -7); g.stroke();
            g.moveTo(-6, -27); g.lineTo(6, -27); g.stroke();
            for (let i = 0; i < 5; i += 1) {
                const angle = (25 + i * 32.5) * Math.PI / 180;
                g.moveTo(Math.cos(angle) * 26, 5 + Math.sin(angle) * 26);
                g.lineTo(Math.cos(angle) * 33, 5 + Math.sin(angle) * 33); g.stroke();
            }
            return;
        }
        g.fillColor = color(!enabled || small ? FILL_THEME.panel : FILL_THEME.ink);
        g.circle(0, 0, r); g.fill();
        const ink = !enabled ? FILL_THEME.faint : small ? FILL_THEME.muted : FILL_THEME.pink;
        g.strokeColor = color(ink); g.fillColor = color(ink); g.lineWidth = 7 * factor;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        if (icon === 'back') {
            g.moveTo(7 * factor, 15 * factor); g.lineTo(-8 * factor, 0); g.lineTo(7 * factor, -15 * factor); g.stroke();
        } else if (icon === 'reset' || icon === 'undo') {
            for (let i = 0; i <= 36; i += 1) {
                const a = (-.75 + i / 36 * 1.75) * Math.PI, px = Math.cos(a) * 21 * factor, py = Math.sin(a) * 21 * factor;
                if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.stroke();
            g.moveTo(-25 * factor, 7 * factor); g.lineTo(-10 * factor, 7 * factor);
            g.lineTo(-19 * factor, -6 * factor); g.close(); g.fill();
        } else if (icon === 'pause') {
            g.roundRect(-12 * factor, -14 * factor, 8 * factor, 28 * factor, 2);
            g.roundRect(4 * factor, -14 * factor, 8 * factor, 28 * factor, 2); g.fill();
        }
    }

    private cellPoint(cell: number): Vec2 {
        const level = this.model!.level, pitch = this.layout!.boardPitch;
        return new Vec2((cell % level.width - (level.width - 1) / 2) * pitch,
            ((level.height - 1) / 2 - Math.floor(cell / level.width)) * pitch);
    }

    private renderBoard(): void {
        const model = this.model, layout = this.layout;
        if (!model || !layout || !this.routeGraphics || !this.capGraphics || this.state === 'selecting') return;
        this.effects.sync(model.paths);
        const pitch = layout.boardPitch, face = pitch * .9, radius = pitch * .058;
        this.tiles.forEach(tile => {
            const g = tile.graphics; g.clear();
            if (model.level.blocked.indexOf(tile.cell) >= 0) return;
            const owner = model.ownerAt(tile.cell), base = color(owner >= 0 ? this.colors[owner].tile : FILL_THEME.tile);
            const hover = owner >= 0 ? this.effects.hover(tile.cell) : 0, win = this.effects.win(tile.cell);
            g.fillColor = base;
            g.roundRect(-face / 2, -face / 2, face, face, radius); g.fill();
            // Hover 和 Win 都是独立扩张的叠层；方格本体和输入区域保持稳定。
            const flash = (alpha: number, scale: number, ink: string): void => {
                if (alpha <= 0) return;
                const size = face * scale;
                g.fillColor = color(ink, Math.round(alpha * 210));
                g.roundRect(-size / 2, -size / 2, size, size, radius * scale); g.fill();
                g.strokeColor = color(ink, Math.round(alpha * 255)); g.lineWidth = pitch * .025;
                g.roundRect(-size / 2, -size / 2, size, size, radius * scale); g.stroke();
            };
            flash(hover, this.effects.hoverScale(tile.cell), '#FFFFFF');
            flash(win, this.effects.winScale(tile.cell), '#FFFAC3');
        });
        const lines = this.routeGraphics, caps = this.capGraphics, bulge = this.effects.bulge;
        lines.clear(); caps.clear(); lines.lineWidth = pitch * .32 * bulge;
        lines.lineCap = Graphics.LineCap.ROUND; lines.lineJoin = Graphics.LineJoin.ROUND;
        model.paths.forEach((path, c) => {
            const ink = color(this.colors[c].line), head = this.effects.head(c);
            const points = (head ? path.slice(0, head.length) : path).map(cell => this.cellPoint(cell));
            if (head && points.length > 1) {
                const from = this.cellPoint(head.from), to = this.cellPoint(head.to);
                points[points.length - 1] = new Vec2(from.x + (to.x - from.x) * head.progress, from.y + (to.y - from.y) * head.progress);
            }
            lines.strokeColor = ink;
            if (points.length > 1) {
                points.forEach((p, i) => { if (i === 0) lines.moveTo(p.x, p.y); else lines.lineTo(p.x, p.y); }); lines.stroke();
                // 显式圆帽保证微信端的转角和线末端与原作一致。
                caps.fillColor = ink;
                points.forEach(p => { caps.circle(p.x, p.y, lines.lineWidth / 2); caps.fill(); });
            }
            const start = points[0], end = points[points.length - 1];
            caps.fillColor = ink; caps.circle(start.x, start.y, pitch * .38 * bulge); caps.fill();
            if (this.effects.completed) {
                const inner = color(this.colors[c].line, Math.round(this.effects.endAlpha * 255));
                inner.r *= .35; inner.g *= .35; inner.b *= .35;
                caps.fillColor = inner; caps.circle(start.x, start.y, pitch * .23 * bulge); caps.fill();
                caps.fillColor = color(this.colors[c].tile, Math.round(this.effects.endAlpha * 255));
                caps.circle(end.x, end.y, pitch * .38 * bulge); caps.fill();
                caps.fillColor = inner;
                this.star(caps, end.x, end.y, pitch * .265 * this.effects.starScale * bulge);
            }
            path.slice(1).forEach(cell => {
                const alpha = this.effects.hintAlpha(cell);
                if (!alpha) return;
                const point = this.cellPoint(cell);
                caps.strokeColor = color('#FFFFFF', Math.round(alpha * 185)); caps.lineWidth = pitch * .04;
                caps.circle(point.x, point.y, pitch * .23); caps.stroke();
            });
        });
        const finger = this.fingerGraphics;
        if (finger) {
            finger.clear();
            const point = this.pointerPoint, c = model.drawingColor;
            if (point && c >= 0 && this.cellAt(point) >= 0) {
                finger.fillColor = color(this.colors[c].line, 128);
                finger.circle(point.x, point.y, pitch * .78); finger.fill();
            }
        }
        if (this.undoButton) this.drawControl(this.undoButton, 'undo', model.canUndo);
        if (this.resetButton) this.drawControl(this.resetButton, 'reset', model.paths.some(path => path.length > 1));
        this.renderBoardSparkles(); this.renderGuide();
    }

    private renderBoardSparkles(): void {
        const g = this.boardSparkles, model = this.model, layout = this.layout;
        if (!g || !model || !layout) return;
        g.clear();
        const age = this.effects.completionAge;
        if (age < 0) return;
        // 先让终点的小星星散开，再在棋盘中央汇成彩色星环，最后揭示通关页。
        model.paths.forEach((path, c) => {
            const t = (age - .22 - c * .045) / .62;
            if (t < 0 || t >= 1) return;
            const end = this.cellPoint(path[path.length - 1]), reach = layout.boardPitch * (.3 + 1.05 * (1 - Math.pow(1 - t, 3)));
            for (let i = 0; i < 6; i += 1) {
                const angle = i * Math.PI / 3 + c * .35;
                g.fillColor = color(this.colors[c].tile, Math.round(220 * (1 - t)));
                this.star(g, end.x + Math.cos(angle) * reach, end.y + Math.sin(angle) * reach,
                    layout.boardPitch * .08 * Math.sin(Math.PI * t));
            }
        });
        const phase = (age - 1.15) / .95;
        if (phase < 0 || phase >= 1) return;
        const alpha = Math.round(240 * Math.min(1, phase * 6) * Math.min(1, (1 - phase) * 5));
        const radius = 46 + 72 * (1 - Math.pow(1 - phase, 3));
        for (let i = 0; i < 20; i += 1) {
            const angle = i * Math.PI / 10 + phase * .7;
            g.fillColor = color([FILL_THEME.yellow, '#F78D63', '#DD65E5', '#F295DC'][i % 4], alpha);
            this.star(g, Math.cos(angle) * radius, Math.sin(angle) * radius,
                (i % 3 === 0 ? 8 : 6) * Math.min(1, phase * 7));
        }
    }

    private renderGuide(): void {
        const g = this.guideGraphics, layout = this.layout;
        if (this.guideLabel) this.guideLabel.node.active = this.guide.active && this.state === 'playing';
        if (!g || !layout) return;
        g.clear();
        const frame = this.state === 'playing' ? this.guide.frame : undefined;
        if (!frame || frame.opacity <= 0) return;
        const pitch = layout.boardPitch, c = this.colors[frame.color];
        const index = Math.min(frame.route.length - 2, Math.floor(frame.position));
        const from = this.cellPoint(frame.route[index]), to = this.cellPoint(frame.route[index + 1]);
        const progress = frame.position - index;
        const point = new Vec2(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        const shown = frame.route.slice(0, index + 1).map(cell => this.cellPoint(cell)); shown.push(point);
        g.strokeColor = color(c.line, Math.round(frame.opacity * 130)); g.lineWidth = pitch * .24;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        shown.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }); g.stroke();
        g.strokeColor = color(FILL_THEME.ink, Math.round(frame.opacity * 150)); g.lineWidth = 3;
        g.circle(point.x, point.y, pitch * (.25 + .05 * (1 - frame.press))); g.stroke();
        g.fillColor = color(c.line, Math.round(frame.opacity * 45));
        g.circle(point.x, point.y, pitch * .36); g.fill();
        const s = pitch / 110 * (1 - .06 * frame.press), x = point.x, y = point.y;
        g.fillColor = color('#FFDBAA', Math.round(frame.opacity * 255));
        g.strokeColor = color('#554239', Math.round(frame.opacity * 255)); g.lineWidth = 3.5 * s;
        g.moveTo(x - 9 * s, y - 38 * s); g.lineTo(x - 9 * s, y - 10 * s);
        g.bezierCurveTo(x - 9 * s, y + 5 * s, x + 7 * s, y + 5 * s, x + 7 * s, y - 10 * s);
        g.lineTo(x + 7 * s, y - 28 * s);
        g.bezierCurveTo(x + 17 * s, y - 18 * s, x + 21 * s, y - 23 * s, x + 24 * s, y - 31 * s);
        g.bezierCurveTo(x + 35 * s, y - 22 * s, x + 43 * s, y - 30 * s, x + 41 * s, y - 39 * s);
        g.bezierCurveTo(x + 51 * s, y - 35 * s, x + 58 * s, y - 40 * s, x + 53 * s, y - 52 * s);
        g.lineTo(x + 47 * s, y - 70 * s);
        g.bezierCurveTo(x + 39 * s, y - 88 * s, x + 9 * s, y - 87 * s, x, y - 73 * s);
        g.lineTo(x - 18 * s, y - 50 * s);
        g.bezierCurveTo(x - 25 * s, y - 39 * s, x - 19 * s, y - 32 * s, x - 9 * s, y - 38 * s);
        g.close(); g.fill(); g.stroke();
        g.strokeColor = color('#FFEED4', Math.round(frame.opacity * 200)); g.lineWidth = 3 * s;
        g.moveTo(x - 3 * s, y - 12 * s); g.lineTo(x - 3 * s, y - 34 * s); g.stroke();
    }

    private star(g: Graphics, x: number, y: number, radius: number): void {
        if (radius <= 0) return;
        for (let i = 0; i < 10; i += 1) {
            const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 === 0 ? 1 : .46);
            if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.close(); g.fill();
    }

    private touchPoint(event: EventTouch): Vec2 {
        const point = event.getUILocation();
        const local = this.boardInput!.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        return new Vec2(local.x, local.y);
    }

    private cellAt(point: Vec2): number {
        const level = this.model!.level, layout = this.layout!, pitch = layout.boardPitch;
        const x = Math.floor((point.x + layout.boardWidth / 2) / pitch);
        const y = Math.floor((layout.boardHeight / 2 - point.y) / pitch);
        return x < 0 || y < 0 || x >= level.width || y >= level.height ? -1 : y * level.width + x;
    }

    private onBoardStart(event: EventTouch): void {
        if (this.state !== 'playing' || this.overlay || this.touchId !== undefined || !this.model) return;
        const point = this.touchPoint(event);
        if (!this.model.startStroke(this.cellAt(point))) return;
        this.guide.dismiss();
        this.touchId = event.getID(); this.lastTouch = point; this.pointerPoint = point; this.renderBoard();
        this.context?.services.feedback.play('drop', { volume: .55 });
        event.propagationStopped = true;
    }

    private onBoardMove(event: EventTouch): void {
        if (event.getID() !== this.touchId || this.state !== 'playing' || !this.model || !this.lastTouch) return;
        const to = this.touchPoint(event), from = this.lastTouch;
        // 快速拖动按格宽采样整条手指轨迹，避免一帧跨过多个格子漏画。
        const samples = Math.max(1, Math.ceil(Vec2.distance(from, to) / (this.layout!.boardPitch * .2)));
        let changed = false, sound: 'drop' | 'toggle' | undefined;
        for (let i = 1; i <= samples; i += 1) {
            const point = new Vec2(from.x + (to.x - from.x) * i / samples, from.y + (to.y - from.y) * i / samples);
            const result = this.model.moveTo(this.cellAt(point));
            if (result === 'extended' || result === 'backtracked') { changed = true; sound = result === 'extended' ? 'drop' : 'toggle'; }
        }
        this.lastTouch = to; this.pointerPoint = to;
        if (changed) {
            if (sound) this.context?.services.feedback.play(sound, { volume: .6 });
        }
        this.renderBoard();
        event.propagationStopped = true;
    }

    private onBoardEnd(event: EventTouch): void {
        if (event.getID() !== this.touchId) return;
        this.onBoardMove(event);
        this.finishStroke();
        this.renderBoard(); this.persist(); this.completeLevel();
        event.propagationStopped = true;
    }

    private onBoardCancel(event: EventTouch): void {
        if (event.getID() !== this.touchId) return;
        this.model?.cancelStroke(); this.touchId = undefined; this.lastTouch = undefined; this.pointerPoint = undefined;
        this.renderBoard(); this.persist();
    }

    private finishStroke(): void {
        this.model?.endStroke(); this.touchId = undefined; this.lastTouch = undefined; this.pointerPoint = undefined;
    }

    private undo(): void {
        if (this.state !== 'playing') return;
        this.finishStroke();
        if (!this.model?.undo()) { this.showToast('还没有可以撤销的路线'); return; }
        this.context?.services.feedback.play('toggle'); this.renderBoard(); this.persist();
    }

    private giveHint(): void {
        if (this.state !== 'playing' || !this.model) return;
        this.guide.dismiss();
        this.finishStroke();
        this.completeLevel();
        if ((this.state as FillState) !== 'playing') return;
        const hint = this.model.hint();
        if (!hint.applied) return;
        this.context?.services.feedback.play('drop');
        const route = this.model.paths[hint.color];
        this.effects.hint(route[route.length - 1]);
        this.renderBoard(); this.persist();
        const name = this.colors[hint.color].name;
        this.showToast(hint.corrected ? `已校正路线，并补出${name}色下一格` : `已补出${name}色下一格`);
        this.completeLevel();
    }

    private completeLevel(): void {
        if (this.state !== 'playing' || !this.model?.completed || !this.save) return;
        this.finishStroke(); this.state = 'completed';
        this.guide.dismiss();
        completeFillLevel(this.mode, this.save.modes[this.mode], this.levelNumber);
        this.persist(false);
        this.context?.reportScore(this.save.modes.normal.cleared + this.save.modes.hard.cleared);
        this.context?.reportEvent?.('level_complete', { mode: this.mode, level: this.levelNumber,
            duration: Math.floor(this.model.elapsed), strokes: this.model.strokes, hints: this.model.hints },
        `${this.context.sessionId}:${this.mode}:${this.levelNumber}`);
        this.context?.services.feedback.play('milestone');
        this.effects.complete(this.model.paths); this.renderBoard();
    }

    private showCompletion(): void {
        if (this.state !== 'completed' || !this.model || !this.save || !this.page || this.overlay) return;
        const progress = this.save.modes[this.mode], allCleared = progress.cleared === this.levels().length;
        const target = progress.current;
        this.overlay = this.makeNode('FillOverlay', this.page, 750, 1110);
        this.overlay.addComponent(BlockInputEvents);
        const dim = this.makeNode('Dim', this.overlay, 750, 1110);
        dim.addComponent(Graphics); dim.addComponent(BlockInputEvents);
        this.winGraphics = this.makeNode('WinSparkles', this.overlay, 750, 1110).addComponent(Graphics);
        this.winTime = 0; this.resizeOverlayDim(); this.renderCelebration();
        const title = allCleared ? '全部通关！' : '漂亮！';
        const titleGroup = this.makeNode('WinTitleGroup', this.overlay, 700, 134, 0, 126);
        this.text('WinTitleShadow', titleGroup, title, 3, -6, 700, 134, 76, '#492849', true);
        this.text('WinTitle', titleGroup, title, 0, 0, 700, 134, 76, FILL_THEME.yellow, true);
        titleGroup.setScale(.65, .65, 1);
        tween(titleGroup).to(.36, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        this.text('WinLevel', this.overlay, `${FILL_MODE_NAMES[this.mode]} · 第 ${this.levelNumber} 关`,
            0, 39, 660, 44, 25, FILL_THEME.ink, true);
        this.text('WinDetail', this.overlay, `${timeText(this.model.elapsed)}  ·  ${this.model.strokes} 次拖动`,
            0, -9, 660, 36, 21, '#E1CADF');
        const next = this.button('Continue', this.overlay, allCleared ? '选择关卡' : `继续第 ${target} 关`,
            0, -127, 380, 88, () => { if (allCleared) this.openLevelSelect(); else this.startLevel(this.mode, target, true); });
        const g = next.node.getComponent(Graphics)!; g.clear();
        g.fillColor = color('#DC9400'); g.roundRect(-190, -50, 380, 88, 17); g.fill();
        g.fillColor = color('#FFB000'); g.roundRect(-190, -44, 380, 88, 17); g.fill();
        next.label.fontSize = 31; next.label.color = color(FILL_THEME.ink);
        this.button('Replay', this.overlay, '再玩一次', allCleared ? -90 : -175, -249, 156, 64,
            () => this.context?.requestRestart());
        if (!allCleared) this.button('Select', this.overlay, '选择关卡', 0, -249, 156, 64, () => this.openLevelSelect());
        this.button('Lobby', this.overlay, '返回大厅', allCleared ? 90 : 175, -249, 156, 64,
            () => this.context?.requestLobby());
    }

    private renderCelebration(): void {
        const g = this.winGraphics;
        if (!g?.isValid) return;
        g.clear();
        for (let i = 0; i < 36; i += 1) {
            const life = (this.winTime * .27 + i * .139) % 1, angle = i * 2.39996 + this.winTime * .08;
            const radius = 100 + 165 * life, alpha = Math.round(240 * Math.sin(life * Math.PI));
            g.fillColor = color([FILL_THEME.yellow, '#F4A5DD', '#D769E6', '#FFEFC1'][i % 4], alpha);
            this.star(g, Math.cos(angle) * radius, 100 + Math.sin(angle) * radius * .9,
                (i % 3 === 0 ? 7 : 4) * Math.sin(life * Math.PI));
        }
    }

    private openLevelSelect(): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready' || this.state === 'paused') return;
        this.finishStroke(); this.completeLevel(); this.persist(); this.destroyOverlay();
        this.selectionMode = this.mode;
        this.selectionPage = Math.floor((this.save!.modes[this.mode].current - 1) / PER_PAGE);
        this.state = 'selecting'; this.rebuildPage();
    }

    private switchMode(mode: MultiColorFillMode): void {
        if (this.state !== 'selecting' || !this.save || mode === this.selectionMode) return;
        this.selectionMode = mode; this.save.mode = mode;
        this.selectionPage = Math.floor((this.save.modes[mode].current - 1) / PER_PAGE);
        this.persist(); this.rebuildPage();
    }

    private buildLevelSelect(): void {
        const page = this.page!, mode = this.selectionMode, progress = this.save!.modes[mode], levels = this.levels(mode);
        const unlocked = fillUnlocked(mode, progress), maxPage = Math.ceil(levels.length / PER_PAGE) - 1;
        this.selectionPage = Math.max(0, Math.min(maxPage, this.selectionPage));
        this.text('SelectTitle', page, '选择关卡', -160, 514, 360, 52, 36, FILL_THEME.ink, true, Label.HorizontalAlign.LEFT);
        this.button('BackToGame', page, '返回', 273, 514, 112, 62, () => this.startLevel(mode, progress.current, true));
        this.panel('ModeSwitch', page, 660, 82, 0, 423, FILL_THEME.panel, 24);
        this.button('ModeNormal', page, '普通模式', -164, 423, 318, 70, () => this.switchMode('normal'), mode === 'normal');
        this.button('ModeHard', page, '困难模式', 164, 423, 318, 70, () => this.switchMode('hard'), mode === 'hard');
        this.text('SelectProgress', page, `已通关 ${progress.cleared} / ${levels.length}`, 0, 357, 660, 36, 25, FILL_THEME.ink, true);
        this.text('SelectExplanation', page, '逐关解锁 · 点击页码可按关卡号跳转', 0, 323, 680, 30, 20, FILL_THEME.muted);
        const start = this.selectionPage * PER_PAGE;
        for (let slot = 0; slot < PER_PAGE && start + slot < levels.length; slot += 1) {
            const number = start + slot + 1, locked = number > unlocked, cleared = number <= progress.cleared;
            const current = number === progress.current, x = (slot % 5 - 2) * 136, y = 233 - Math.floor(slot / 5) * 111;
            const tile = this.button(`Level${number}`, page, '', x, y, 119, 97, () => {
                if (locked) { this.showToast(`先通关第 ${unlocked} 关，再继续挑战`); return; }
                this.startLevel(mode, number, true);
            }, current);
            tile.label.string = String(number); tile.label.node.setPosition(0, 10); tile.label.fontSize = 31;
            tile.label.color = color(current ? FILL_THEME.background : locked ? FILL_THEME.faint : FILL_THEME.ink);
            const currentStatus = progress.draft ? '进行中' : cleared ? '已通关' : '当前关';
            this.text(`Status${number}`, tile.node, current ? currentStatus : cleared ? '已通关' : locked ? '未解锁' : '新解锁',
                0, -27, 115, 28, 16, current ? FILL_THEME.background : cleared ? FILL_THEME.mint : FILL_THEME.faint);
            if (cleared) {
                const g = tile.node.getComponent(Graphics)!; g.strokeColor = color(current ? FILL_THEME.background : FILL_THEME.mint);
                g.lineWidth = 3; g.lineCap = Graphics.LineCap.ROUND;
                g.moveTo(34, 31); g.lineTo(40, 25); g.lineTo(49, 36); g.stroke();
            }
        }
        this.button('PreviousPage', page, '上一页', -246, -414, 156, 62, () => this.changePage(-1));
        const jump = this.button('PageJump', page, `${this.selectionPage + 1} / ${maxPage + 1} 页`, 0, -414, 260, 62, () => this.showLevelJump());
        jump.label.fontSize = 23;
        this.button('NextPage', page, '下一页', 246, -414, 156, 62, () => this.changePage(1));
        this.button('JumpCurrent', page, `当前第 ${progress.current} 关`, -168, -492, 312, 60, () => this.jumpPage(progress.current));
        this.button('JumpLatest', page, `最新第 ${unlocked} 关`, 168, -492, 312, 60, () => this.jumpPage(unlocked));
        this.toastLabel = this.text('SelectToast', page, '', 0, -538, 700, 26, 19, FILL_THEME.muted);
    }

    private changePage(delta: number): void {
        if (this.state !== 'selecting') return;
        const next = this.selectionPage + delta, maxPage = Math.ceil(this.levels(this.selectionMode).length / PER_PAGE) - 1;
        if (next < 0 || next > maxPage) return;
        this.selectionPage = next; this.rebuildPage();
    }
    private jumpPage(number: number): void {
        this.selectionPage = Math.floor((number - 1) / PER_PAGE); this.rebuildPage();
    }

    /** 大题库按关卡号定位页面；浏览锁定关不改变逐关解锁规则。 */
    private showLevelJump(): void {
        if (this.state !== 'selecting' || !this.page) return;
        this.destroyOverlay();
        this.overlay = this.makeNode('FillOverlay', this.page, 750, 1110);
        this.overlay.addComponent(BlockInputEvents);
        const dim = this.makeNode('Dim', this.overlay, 750, 1110);
        dim.addComponent(Graphics); dim.addComponent(BlockInputEvents); this.resizeOverlayDim();
        const panel = this.panel('OverlayPanel', this.overlay, 638, 836, 0, 0, FILL_THEME.panel, 34);
        const total = this.levels(this.selectionMode).length;
        this.text('JumpTitle', panel, '跳转到关卡', 0, 353, 580, 62, 36, FILL_THEME.ink, true);
        this.text('JumpDescription', panel, `输入 1–${total} · 可浏览未解锁关卡`, 0, 294, 590, 40, 22, FILL_THEME.muted);
        this.panel('JumpInput', panel, 552, 82, 0, 214, FILL_THEME.background, 20);
        const input = this.text('JumpValue', panel, '请输入关卡号', 0, 214, 528, 60, 34, FILL_THEME.faint, true);
        const error = this.text('JumpError', panel, '', 0, -220, 590, 36, 21, FILL_THEME.red);
        let digits = '';
        const refresh = () => { input.string = digits || '请输入关卡号'; input.color = color(digits ? FILL_THEME.ink : FILL_THEME.faint); error.string = ''; };
        const append = (digit: number) => {
            if (digits.length >= String(total).length || (!digits && digit === 0)) return;
            digits += String(digit); refresh();
        };
        for (let digit = 1; digit <= 9; digit += 1) {
            const index = digit - 1;
            this.button(`JumpDigit${digit}`, panel, String(digit), (index % 3 - 1) * 188,
                112 - Math.floor(index / 3) * 94, 168, 76, () => append(digit));
        }
        this.button('JumpDelete', panel, '退格', -188, -170, 168, 76, () => { digits = digits.slice(0, -1); refresh(); });
        this.button('JumpDigit0', panel, '0', 0, -170, 168, 76, () => append(0));
        this.button('JumpClear', panel, '清空', 188, -170, 168, 76, () => { digits = ''; refresh(); });
        this.button('JumpCancel', panel, '取消', -144, -326, 264, 76, () => this.destroyOverlay());
        this.button('JumpConfirm', panel, '定位关卡', 144, -326, 264, 76, () => {
            const number = Number(digits);
            if (!digits || number < 1 || number > total) { error.string = `请输入 1–${total} 之间的关卡号`; return; }
            this.destroyOverlay(); this.jumpPage(number);
        }, true);
    }

    private showRules(model: MiniGamePauseModel): void {
        this.showOverlay('怎么玩', '数字表示这条路线还需要填几格', [
            { name: 'Resume', text: '明白了，继续游戏', primary: true, action: () => model.resume() },
        ], '从每个彩色圆点出发，上下左右拖动。\n铺满所有灰色格子，即可通关。\n不能穿过其他颜色的起点。\n经过别的路线时，旧路线会退回。\n原路拖回可以退格，点已有路线可重画。\n提示会校正路线，并补出下一格。');
    }

    private showOverlay(title: string, subtitle: string | undefined, actions: readonly OverlayAction[], detail?: string): void {
        this.destroyOverlay();
        if (!this.page || this.state === 'disposed') return;
        this.overlay = this.makeNode('FillOverlay', this.page, 750, 1110);
        this.overlay.addComponent(BlockInputEvents);
        const dim = this.makeNode('Dim', this.overlay, 750, 1110); dim.addComponent(Graphics); dim.addComponent(BlockInputEvents);
        this.resizeOverlayDim();
        const rules = actions.length === 1, height = rules ? 618 : (detail ? 306 : 236) + actions.length * 88;
        const panel = this.panel('OverlayPanel', this.overlay, 638, height, 0, 0, FILL_THEME.panel, 34);
        this.text('OverlayTitle', panel, title, 0, height / 2 - 64, 590, 62, 39, FILL_THEME.ink, true);
        if (subtitle) this.text('OverlaySubtitle', panel, subtitle, 0, height / 2 - 121, 590, 42, 23, FILL_THEME.muted);
        if (detail) this.text('OverlayDetail', panel, detail, 0, rules ? 0 : height / 2 - 183, 596, rules ? 232 : 46,
            rules ? 23 : 22, FILL_THEME.muted, false);
        actions.forEach((entry, i) => this.button(entry.name, panel, entry.text, 0,
            rules ? -height / 2 + 65 : height / 2 - (detail ? 259 : 199) - i * 88, 552, 70, entry.action, !!entry.primary));
        panel.setScale(.96, .96, 1);
        tween(panel).to(.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }

    private resizeOverlayDim(): void {
        const dim = this.overlay?.getChildByName('Dim'), layout = this.layout;
        if (!dim || !layout) return;
        const width = layout.width / layout.scale, height = layout.height / layout.scale;
        dim.getComponent(UITransform)!.setContentSize(width, height); dim.setPosition(0, -layout.centerY / layout.scale);
        const graphics = dim.getComponent(Graphics)!; graphics.clear(); graphics.fillColor = this.winGraphics ? color('#5B4076', 195) : color('#111820', 214);
        graphics.rect(-width / 2, -height / 2, width, height); graphics.fill();
    }

    private showToast(message: string): void {
        const label = this.toastLabel;
        if (!label?.isValid) return;
        const token = ++this.toastToken, generation = this.pageGeneration;
        label.string = message; label.color = color(FILL_THEME.ink);
        this.scheduleOnce(() => {
            if (!label.isValid || token !== this.toastToken || generation !== this.pageGeneration) return;
            label.string = ''; label.color = color(FILL_THEME.muted);
        }, 2.4);
    }

    private makeNode(name: string, parent: Node, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = this.node.layer; node.addComponent(UITransform).setContentSize(width, height);
        node.setParent(parent); node.setPosition(x, y); return node;
    }

    private text(name: string, parent: Node, value: string, x: number, y: number, width: number, height: number,
        size: number, hex: string, bold = false, align = Label.HorizontalAlign.CENTER): Label {
        const node = this.makeNode(name, parent, width, height, x, y), label = node.addComponent(Label);
        label.string = value; label.fontSize = size; label.lineHeight = size * 1.45; label.color = color(hex);
        label.horizontalAlign = align; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.enableWrapText = true; label.fontFamily = 'Arial'; setLabelBold(label, bold); return label;
    }

    private panel(name: string, parent: Node, width: number, height: number, x: number, y: number, hex: string, radius: number): Node {
        const node = this.makeNode(name, parent, width, height, x, y), g = node.addComponent(Graphics);
        g.fillColor = color(hex); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); return node;
    }

    private button(name: string, parent: Node, value: string, x: number, y: number, width: number, height: number,
        action: () => void | Promise<void>, primary = false): FillButton {
        const node = this.panel(name, parent, width, height, x, y, primary ? FILL_THEME.mint : FILL_THEME.panel, Math.min(21, height / 2));
        const g = node.getComponent(Graphics)!;
        if (!primary) {
            g.strokeColor = color(FILL_THEME.edge); g.lineWidth = 2;
            g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, Math.min(20, height / 2)); g.stroke();
        }
        const label = this.text(`${name}Label`, node, value, 0, 0, width - 12, height - 8, 24,
            primary ? FILL_THEME.background : FILL_THEME.ink, true);
        const generation = this.pageGeneration;
        let start: Vec2 | undefined, pointer: number | undefined;
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (this.actionBusy || pointer !== undefined) return;
            start = event.getUILocation().clone(); pointer = event.getID(); node.setScale(.97, .97, 1); event.propagationStopped = true;
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => { start = undefined; pointer = undefined; node.setScale(1, 1, 1); });
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (pointer !== event.getID()) return;
            const from = start; start = undefined; pointer = undefined; node.setScale(1, 1, 1); event.propagationStopped = true;
            if (!from || Vec2.distance(from, event.getUILocation()) > 16 || this.actionBusy
                || generation !== this.pageGeneration || !node.activeInHierarchy || this.state === 'disposed') return;
            this.actionBusy = true;
            this.context?.services.feedback.play('uiButton');
            void Promise.resolve().then(action).then(() => { this.actionBusy = false; }, (error: unknown) => {
                this.actionBusy = false;
                console.warn('[MultiColorFill] Action failed', error); this.showToast('操作未完成，请重试');
            });
        });
        return { node, label };
    }

    private destroyOverlay(): void {
        this.destroyNode(this.overlay); this.overlay = undefined; this.winGraphics = undefined; this.winTime = 0;
    }

    private clearPage(): void {
        this.pageGeneration += 1; this.toastToken += 1;
        if (this.boardInput?.isValid) {
            this.boardInput.off(Node.EventType.TOUCH_START, this.onBoardStart, this);
            this.boardInput.off(Node.EventType.TOUCH_MOVE, this.onBoardMove, this);
            this.boardInput.off(Node.EventType.TOUCH_END, this.onBoardEnd, this);
            this.boardInput.off(Node.EventType.TOUCH_CANCEL, this.onBoardCancel, this);
        }
        this.boardInput = undefined; this.tiles = []; this.pointerPoint = undefined;
        this.routeGraphics = undefined; this.capGraphics = undefined; this.fingerGraphics = undefined;
        this.boardSparkles = undefined; this.guideGraphics = undefined; this.guideLabel = undefined;
        this.toastLabel = undefined; this.undoButton = undefined; this.resetButton = undefined;
        this.destroyNode(this.page); this.page = undefined;
    }

    private destroyNode(node?: Node): void {
        if (!node?.isValid) return;
        const pending = [node];
        for (let i = 0; i < pending.length; i += 1) { Tween.stopAllByTarget(pending[i]); pending.push(...pending[i].children); }
        node.active = false; node.destroy();
    }
}

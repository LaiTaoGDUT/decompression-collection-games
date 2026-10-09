import {
    Color,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
} from 'cc';
import {
    MEOWDOKU_COLORS,
    MEOWDOKU_TIMING,
    MEOWDOKU_TUTORIAL_MASK_ALPHA,
    MEOWDOKU_TUTORIAL_STEP_PAUSE,
    MEOWDOKU_TUTORIAL_STEPS,
} from './MeowdokuTheme';

/**
 * 新手引导的**界面层**，对齐原作 `scripts/module/tutorial/view/tutorial_page.gd`
 * 的默认流程（`nu_guide` 默认档 `VALUE_CURRENT_FLOW` → `_run_guide_flow_default`）。
 *
 * 关键点：**演示盘直接用游戏自己的棋盘**。原作引导页是一整页（自己实例化 `board.tscn` +
 * `cell.tscn`），本项目把引导叠在第一关上，为了让渲染、命中、层级、动效和正式棋盘**完全一致**
 * （不再出现「模糊 / 黑线 / 层级不对 / 点不中」），这里不自己画盘，而是让 `MeowdokuGame`
 * 把**引导关卡的盘面**（原作 SP 题库 `pattern == "guide"` 那一关：4×4、解位 `[2,0,3,1]`、
 * 配色槽位 `[8,4,10,1]`）装进正式棋盘，本模块只负责：
 *
 * - 全屏压暗蒙层（0.75）并在要操作的格子上**挖洞**（格子保持明亮）；
 * - 顶部文案条、棋盘下方副提示条、右上角「跳过」、底部「明白了 / 开始游戏」；
 * - 静态指尖图片的单击、双击与划动演示，以及点击波纹；
 * - 七步流程的状态机 + 点错格子的抖动反馈。
 */

type Cell = readonly [number, number];

interface TutorialHost {
    readonly root: Node;
    readonly width: number;
    readonly height: number;
    readonly k: number;
    /** 棋盘（游戏自己的棋盘）几何，单位是页面坐标。 */
    readonly boardX: number;
    readonly boardY: number;
    readonly boardSize: number;
    readonly cellFace: number;
    /** 胶囊下方 / 底部安全区上方的页面坐标边界。 */
    readonly safeTopY?: number;
    readonly safeBottomY?: number;
    readonly frames: {
        readonly panelBg?: SpriteFrame;
        readonly hintLight?: SpriteFrame;
        readonly promptFrame?: SpriteFrame;
        readonly guideHand?: SpriteFrame;
    };
    /** 透明图片内的指尖触点，按原图左上角为原点的宽/高百分比配置。 */
    readonly guideHandTouch?: readonly [number, number];
    /** 把某格放上猫（走正式棋盘的放猫表现）。 */
    placeCat(row: number, col: number): void;
    /** 把某格标叉（走正式棋盘的打叉表现）。 */
    markCell(row: number, col: number): void;
    /** 取某格当前状态（用于「亮格是否已经有猫/叉」的判定）。 */
    cellStateAt(row: number, col: number): 'empty' | 'mark' | 'cat' | 'error';
    /** 页面坐标下的格子中心（必须用游戏自己的算法，保证和棋盘严格对齐）。 */
    cellCenter(col: number, row: number): readonly [number, number];
    finish(): void;
    skip(): void;
}

/** 步骤参数（原作每一步的 `_allowed_cells` / 文案 / 小手）。 */
interface TutorialStepSpec {
    readonly mode: 'place' | 'mark' | 'free' | 'confirm';
    readonly message: string;
    readonly subMessage: string;
    readonly allowed: readonly Cell[];
    readonly maskCells: readonly Cell[];
    readonly maskKeep?: readonly Cell[];
    readonly hand?: Cell | null;
    readonly swipe?: readonly Cell[];
}

const TUTORIAL_COPY = {
    skip: '跳过',
    gotIt: '明白了',
    start: '开始游戏',
    finish: '太棒了！你已掌握规则！',
} as const;

/** 原作 Skip / Confirm 按钮底色（`StyleBoxFlat_tif87`）。 */
const TUTORIAL_BUTTON_COLOR = new Color(179, 142, 142, 229);

/** 确认按钮与棋盘的留白一起参与短屏等比适配，尺寸沿用 1080 宽参考坐标。 */
const TUTORIAL_CONFIRM_LAYOUT = Object.freeze({ width: 784, height: 192, fontSize: 64, boardGap: 96 });

/** 静态引导手的指尖位置；锚点与按下/波纹共用同一触点，不受透明留白影响。 */
const GUIDE_HAND_TOUCH = Object.freeze([0.196, 0.119] as const);
/** 演示动作分开配置；放慢单击，双击触点间隔 0.33 秒仍位于真实 0.35 秒窗口内。 */
const GUIDE_HAND_TAP_TIMING = Object.freeze({
    single: Object.freeze({ press: 0.28, hold: 0.12, release: 0.28, gap: 0 }),
    double: Object.freeze({ press: 0.14, hold: 0.03, release: 0.14, gap: 0.02 }),
    hover: 0.6,
    rest: 1.8,
});
/** 划动演示的按压节奏独立于单/双击。 */
const GUIDE_HAND_SWIPE_PRESS = 0.1;

type TutorialLayout = Pick<TutorialHost, 'width' | 'height' | 'k' | 'boardX' | 'boardY' | 'boardSize' | 'cellFace' | 'safeTopY' | 'safeBottomY'>;

export class MeowdokuTutorial {
    private host: TutorialHost;
    private readonly layer: Node;
    private readonly fxLayer: Node;
    private readonly handLayer: Node;
    private readonly uiLayer: Node;
    private readonly overlays: Node[] = [];
    private handNode?: Node;
    private stepTween?: Tween;
    private readonly ripples: Node[] = [];
    private messageLabel?: Label;
    private subPanel?: Node;
    private subLabel?: Label;
    private confirmButton?: Node;
    private confirmLabel?: Label;
    private step = 0;
    private marksDone = 0;
    private finished = false;
    private disposed = false;
    private paused = false;
    private transitioning = false;

    constructor(host: TutorialHost) {
        this.host = host;
        const layer = new Node('Tutorial');
        layer.layer = host.root.layer;
        layer.setParent(host.root);
        layer.addComponent(UITransform).setContentSize(host.width, host.height);
        layer.setPosition(0, 0, 0);
        this.layer = layer;

        const fx = new Node('FxLayer');
        fx.layer = layer.layer;
        fx.setParent(layer);
        fx.addComponent(UITransform).setContentSize(host.width, host.height);
        this.fxLayer = fx;

        // 小手单独一层：蒙层每次都会新建，如果小手和蒙层同层且先创建，就会被蒙层盖住。
        const hand = new Node('HandLayer');
        hand.layer = layer.layer;
        hand.setParent(layer);
        hand.addComponent(UITransform).setContentSize(host.width, host.height);
        this.handLayer = hand;

        const ui = new Node('UiLayer');
        ui.layer = layer.layer;
        ui.setParent(layer);
        ui.addComponent(UITransform).setContentSize(host.width, host.height);
        this.uiLayer = ui;

        this.buildPanels();
        this.startStep(0);
    }

    /** 页面重排时由游戏保留这一层；重排内部视觉，保留当前步骤与棋盘进度。 */
    get node(): Node { return this.layer; }

    relayout(metrics: TutorialLayout): void {
        if (this.disposed) return;
        this.host = { ...this.host, ...metrics };
        this.clearOverlays();
        this.hideHand();
        if (this.handNode) this.destroyVisualNode(this.handNode);
        this.handNode = undefined;
        for (const child of Array.from(this.uiLayer.children)) this.destroyVisualNode(child);
        for (const node of [this.layer, this.fxLayer, this.handLayer, this.uiLayer]) {
            node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        }
        this.buildPanels();
        if (this.finished) this.showFinish();
        else this.renderStep();
    }

    pause(): void {
        if (this.disposed || this.paused) return;
        this.paused = true;
        this.visitTweenTargets(this.layer, (target) => Tween.pauseAllByTarget(target));
    }

    resume(): void {
        if (this.disposed || !this.paused) return;
        this.paused = false;
        this.visitTweenTargets(this.layer, (target) => Tween.resumeAllByTarget(target));
    }

    /** 标叉、确认或转步时，按住原格不能在下一步骤被识别为放猫。 */
    get acceptsCatPlacement(): boolean {
        const spec = MEOWDOKU_TUTORIAL_STEPS[this.step] as TutorialStepSpec | undefined;
        return !this.finished && !this.disposed && !this.paused && !this.transitioning
            && (spec?.mode === 'place' || spec?.mode === 'free');
    }

    /**
     * 棋盘点击入口。
     * - `place`：接受双击 / 长按放猫，且必须点在允许的那一格；
     * - `mark`：认单击 / 划动，且必须点在允许的那几格；
     * - `free`（最后一步「自由发挥」，原作 `StepMode.FREE_PLAY`）：**单击/划动可以随便画叉**，
     *   在允许的那一格双击或长按才放下最后一只猫。
     */
    handleTap(row: number, col: number, placesCat = false): void {
        if (this.finished || this.disposed || this.paused || this.transitioning) return;
        const spec = MEOWDOKU_TUTORIAL_STEPS[this.step] as TutorialStepSpec | undefined;
        if (!spec) return;
        const allowed = spec.allowed.some(([r, c]) => r === row && c === col);

        if (spec.mode === 'free') {
            if (placesCat) {
                if (!allowed) {
                    this.flashWrong(row, col);
                    return;
                }
                this.host.placeCat(row, col);
                this.completeStep();
                return;
            }
            if (this.host.cellStateAt(row, col) === 'cat') return;
            this.host.markCell(row, col);
            return;
        }

        if (spec.mode === 'place') {
            if (!placesCat) return;
            if (!allowed) {
                this.flashWrong(row, col);
                return;
            }
            this.host.placeCat(row, col);
            this.marksDone = 0;
            this.completeStep();
            return;
        }

        if (spec.mode === 'mark') {
            if (!allowed) {
                this.flashWrong(row, col);
                return;
            }
            if (this.host.cellStateAt(row, col) === 'mark') return;
            this.host.markCell(row, col);
            this.marksDone += 1;
            if (this.marksDone >= spec.allowed.length) this.completeStep();
            else if (!spec.swipe) {
                const next = spec.allowed.find(([r, c]) => this.host.cellStateAt(r, c) !== 'mark');
                if (next) this.showHand(next[0], next[1], false);
            }
        }
    }

    /** 划动：只画叉（不会误放猫）。 */
    handlePaint(row: number, col: number): void {
        const spec = MEOWDOKU_TUTORIAL_STEPS[this.step] as TutorialStepSpec | undefined;
        if (!spec) return;
        if (spec.mode === 'place') return;
        this.handleTap(row, col, false);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.finished = true;
        this.stepTween?.stop();
        this.stepTween = undefined;
        this.clearOverlays();
        this.hideHand();
        this.destroyVisualNode(this.layer);
        this.handNode = undefined;
    }

    // ------------------------------------------------------------------ UI

    private buildPanels(): void {
        const host = this.host;
        const safeTop = host.safeTopY ?? host.height / 2;
        const safeBottom = host.safeBottomY ?? -host.height / 2;
        const boardTop = host.boardY + host.boardSize / 2;
        const boardBottom = host.boardY - host.boardSize / 2;
        const edge = 10 * host.k;
        // 上下提示模块分别按可用纵向空间等比缩小，固定宽度布局在高屏保留原有留白。
        const topK = host.k * Math.min(1, Math.max(0.001, safeTop - boardTop - edge) / (268 * host.k));
        const lowerSpace = Math.max(0.001, boardBottom - safeBottom - edge);
        // 副提示与确认按钮在流程中互斥显示，各自使用整段可用空间，不能为隐藏按钮预留高度。
        const subK = host.k * Math.min(1, lowerSpace / (220 * host.k));
        const confirmLayout = TUTORIAL_CONFIRM_LAYOUT;
        const confirmK = host.k * Math.min(1, lowerSpace / ((confirmLayout.boardGap + confirmLayout.height) * host.k));
        // 顶部文案条（原作 `MessagePanel` 930×190：底边 = 棋盘顶 + 78 设计像素）。
        const messagePanel = new Node('MessagePanel');
        messagePanel.layer = this.layer.layer;
        messagePanel.setParent(this.uiLayer);
        messagePanel.addComponent(UITransform).setContentSize(930 * topK, 190 * topK);
        messagePanel.setPosition(
            0,
            boardTop + 78 * topK + 95 * topK,
            0,
        );
        this.drawPanel(messagePanel, 930 * topK, 190 * topK);
        this.messageLabel = this.makeLabel(messagePanel, 'Msg', 870 * topK, 150 * topK, 48 * topK);

        // 副提示条（原作 `SubMsgPanel` 800×190：顶边 = 棋盘底 − 30 设计像素）。
        const subPanel = new Node('SubMsgPanel');
        subPanel.layer = this.layer.layer;
        subPanel.setParent(this.uiLayer);
        subPanel.addComponent(UITransform).setContentSize(800 * subK, 190 * subK);
        subPanel.setPosition(0, boardBottom - 30 * subK - 95 * subK, 0);
        this.drawPanel(subPanel, 800 * subK, 190 * subK);
        this.subLabel = this.makeLabel(subPanel, 'SubMsg', 740 * subK, 150 * subK, 48 * subK);
        subPanel.active = false;
        this.subPanel = subPanel;

        // 右上角「跳过」：原作 `SkipBtn` 是 138×60（距右 36、距顶 75），
        // 需求：做得更好点按一些，整体放大到 1.25 倍（172×75、字号 33）。
        const skipScale = 1.25;
        const skipWidth = 138 * skipScale;
        const skipHeight = 60 * skipScale;
        const skip = this.makeButton(
            'Skip',
            TUTORIAL_COPY.skip,
            skipWidth * host.k,
            skipHeight * host.k,
            26 * skipScale * host.k,
        );
        skip.setPosition(
            host.width / 2 - 36 * host.k - (skipWidth / 2) * host.k,
            safeTop - 75 * host.k - (skipHeight / 2) * host.k,
            0,
        );
        skip.on(Node.EventType.TOUCH_END, () => {
            if (this.disposed || this.paused) return;
            this.dispose();
            host.skip();
        }, this);
        skip.on(Node.EventType.MOUSE_UP, () => {
            if (this.disposed || this.paused) return;
            this.dispose();
            host.skip();
        }, this);

        // 「明白了 / 开始游戏」固定在棋盘下方，按按钮高度与留白的总空间适配底部安全区。
        const confirm = this.makeButton('Confirm', TUTORIAL_COPY.gotIt,
            confirmLayout.width * confirmK, confirmLayout.height * confirmK, confirmLayout.fontSize * confirmK);
        confirm.setPosition(0, boardBottom - (confirmLayout.boardGap + confirmLayout.height / 2) * confirmK, 0);
        confirm.active = false;
        confirm.on(Node.EventType.TOUCH_END, () => this.onConfirm(), this);
        confirm.on(Node.EventType.MOUSE_UP, () => this.onConfirm(), this);
        this.confirmButton = confirm;
        this.confirmLabel = confirm.getChildByName('Label')?.getComponent(Label);
    }

    private onConfirm(): void {
        if (this.disposed || this.paused || this.transitioning) return;
        if (this.step === 1) {
            if (this.confirmButton?.isValid) this.confirmButton.active = false;
            this.completeStep();
            return;
        }
        this.host.finish();
    }

    // ------------------------------------------------------------------ 步骤

    private startStep(index: number): void {
        const spec = MEOWDOKU_TUTORIAL_STEPS[index] as TutorialStepSpec | undefined;
        if (!spec) {
            this.finish();
            return;
        }
        this.step = index;
        this.marksDone = 0;
        this.renderStep();
    }

    private renderStep(): void {
        const spec = MEOWDOKU_TUTORIAL_STEPS[this.step] as TutorialStepSpec | undefined;
        if (!spec || this.disposed) return;
        this.clearOverlays();
        this.hideHand();
        if (this.messageLabel) this.messageLabel.string = spec.message;
        if (this.subPanel) this.subPanel.active = spec.subMessage.length > 0;
        if (this.subLabel) this.subLabel.string = spec.subMessage;
        if (this.confirmButton) this.confirmButton.active = spec.mode === 'confirm';
        if (this.confirmLabel) this.confirmLabel.string = TUTORIAL_COPY.gotIt;
        if (this.transitioning) return;
        this.showMask(spec.maskCells, spec.maskKeep ?? []);
        if (spec.hand) {
            this.showHand(spec.hand[0], spec.hand[1], spec.mode === 'place');
        } else if (spec.swipe) {
            this.playSwipeHand(spec.swipe);
        } else if (spec.mode === 'mark') {
            // 叉格步骤：给每个待叉格子一个呼吸光圈，手指指向第一个。
            for (const [row, col] of spec.allowed) this.showGuideRing(row, col);
            const first = spec.allowed.find(([r, c]) => this.host.cellStateAt(r, c) !== 'mark');
            if (first) this.showHand(first[0], first[1], false);
        }
    }

    private completeStep(): void {
        if (this.transitioning || this.disposed) return;
        this.transitioning = true;
        const next = this.step + 1;
        this.clearOverlays();
        this.hideHand();
        this.stepTween = tween(this.layer)
            .delay(MEOWDOKU_TUTORIAL_STEP_PAUSE)
            .call(() => {
                this.stepTween = undefined;
                this.transitioning = false;
                if (!this.disposed && this.layer.isValid) this.startStep(next);
            });
        this.startTween(this.stepTween);
    }

    private finish(): void {
        if (this.finished) return;
        this.finished = true;
        this.clearOverlays();
        this.hideHand();
        this.showFinish();
        this.step = MEOWDOKU_TUTORIAL_STEPS.length;
    }

    private showFinish(): void {
        if (this.messageLabel) this.messageLabel.string = TUTORIAL_COPY.finish;
        if (this.subPanel) this.subPanel.active = false;
        if (this.confirmButton) this.confirmButton.active = true;
        if (this.confirmLabel) this.confirmLabel.string = TUTORIAL_COPY.start;
    }

    // ------------------------------------------------------------- 蒙层 / 小手

    /**
     * 页面坐标下的格子中心：**直接用游戏自己的 `cellCenter`**（里面含 `cellPadding` 与
     * 「槽位 − 色块」的 origin 偏移）。自己按 `boardSize / 4` 反推会整体偏十几个像素，
     * 表现就是洞/光圈/小手和棋盘对不上、最后一步点不到。
     */
    private cellCenter(row: number, col: number): readonly [number, number] {
        return this.host.cellCenter(col, row);
    }

    /**
     * 全屏压暗（0.75），在要操作的格子上挖洞（原作 `_show_mask_hints`）。
     * 挖洞是**按游戏棋盘的几何**算的，所以和格子严格对齐。
     */
    private showMask(cells: readonly Cell[], keep: readonly Cell[]): void {
        const host = this.host;
        const blocks = [...cells, ...keep];
        if (blocks.length === 0) return;
        const mask = new Node('Mask');
        mask.layer = this.layer.layer;
        mask.setParent(this.fxLayer);
        mask.addComponent(UITransform).setContentSize(host.width, host.height);
        mask.setPosition(0, 0, 0);
        const graphics = mask.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, Math.round(255 * MEOWDOKU_TUTORIAL_MASK_ALPHA));
        const hole = host.cellFace;
        // 用「整屏 + 逐格盖块」的方式挖洞：把**不需要亮的格子**整片盖住（色块大小、
        // 位置取游戏自己的格子中心），要操作的格子自然保持明亮。
        const boardLeft = host.boardX - host.boardSize / 2;
        const boardTop = host.boardY + host.boardSize / 2;
        const size = 4;
        for (let row = 0; row < size; row += 1) {
            for (let col = 0; col < size; col += 1) {
                const lit = blocks.some(([r, c]) => r === row && c === col);
                if (lit) continue;
                const [cx, cy] = this.cellCenter(row, col);
                graphics.rect(cx - hole / 2, cy - hole / 2, hole, hole);
                graphics.fill();
            }
        }
        // 棋盘以外的区域整块压暗（上下左右四条）。
        // 棋盘以外分四块压暗：上 / 下 / 左 / 右。
        // 注意下面那块的高度：以前写成 `boardTop - height/2 - boardSize`（负数，被下面的
        // `h <= 0 continue` 直接跳过），所以道具行那一带没有被盖住。
        const boardBottom = boardTop - host.boardSize;
        const outer: [number, number, number, number][] = [
            [-host.width / 2, boardTop, host.width, host.height / 2 - boardTop],
            [-host.width / 2, -host.height / 2, host.width, boardBottom + host.height / 2],
            [-host.width / 2, boardBottom, boardLeft + host.width / 2, host.boardSize],
            [boardLeft + host.boardSize, boardBottom,
                host.width / 2 - (boardLeft + host.boardSize), host.boardSize],
        ];
        for (const [x, y, w, h] of outer) {
            if (w <= 0 || h <= 0) continue;
            graphics.rect(x, y, w, h);
            graphics.fill();
        }
        this.overlays.push(mask);

        // 待操作格子的呼吸光圈（原作 `play_hint`：光圈 + 提示框）。
        for (const [row, col] of cells) {
            this.showGuideRing(row, col);
        }
    }

    private showGuideRing(row: number, col: number): void {
        const host = this.host;
        const [x, y] = this.cellCenter(row, col);
        const lightFrame = host.frames.hintLight;
        if (lightFrame) {
            const light = new Node('HintLight');
            light.layer = this.layer.layer;
            light.setParent(this.fxLayer);
            light.addComponent(UITransform).setContentSize(host.cellFace * 1.1, host.cellFace * 1.1);
            light.setPosition(x, y, 0);
            const sprite = light.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = lightFrame;
            const opacity = light.addComponent(UIOpacity);
            opacity.opacity = Math.round(255 * MEOWDOKU_TIMING.hintAlphaMin);
            this.startTween(tween(opacity)
                .to(MEOWDOKU_TIMING.hintHalfCycle, { opacity: 255 }, { easing: 'sineInOut' })
                .to(MEOWDOKU_TIMING.hintHalfCycle, { opacity: Math.round(255 * MEOWDOKU_TIMING.hintAlphaMin) }, { easing: 'sineInOut' })
                .union()
                .repeatForever());
            this.overlays.push(light);
        }
        const frame = host.frames.promptFrame;
        if (frame) {
            const prompt = new Node('HintFrame');
            prompt.layer = this.layer.layer;
            prompt.setParent(this.fxLayer);
            prompt.addComponent(UITransform).setContentSize(host.cellFace, host.cellFace);
            prompt.setPosition(x, y, 0);
            const sprite = prompt.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            const opacity = prompt.addComponent(UIOpacity);
            opacity.opacity = Math.round(255 * MEOWDOKU_TIMING.hintAlphaMin);
            this.startTween(tween(opacity)
                .to(MEOWDOKU_TIMING.hintHalfCycle, { opacity: 255 }, { easing: 'sineInOut' })
                .to(MEOWDOKU_TIMING.hintHalfCycle, { opacity: Math.round(255 * MEOWDOKU_TIMING.hintAlphaMin) }, { easing: 'sineInOut' })
                .union()
                .repeatForever());
            this.overlays.push(prompt);
        }
    }

    private clearOverlays(): void {
        for (const node of this.overlays) {
            this.destroyVisualNode(node);
        }
        this.overlays.length = 0;
    }

    private createHand(): Node | undefined {
        const host = this.host;
        const frame = host.frames.guideHand;
        if (!frame) return undefined;
        let node = this.handNode;
        if (!node?.isValid) {
            node = new Node('GuideHand');
            node.layer = this.layer.layer;
            node.setParent(this.handLayer);
            // 手根节点的原点就是指尖触点；只缩放/移动它，波纹始终落在真实格子中心。
            node.addComponent(UITransform).setContentSize(1, 1);
            node.addComponent(UIOpacity);
            const image = new Node('HandImage');
            image.layer = node.layer;
            image.setParent(node);
            const transform = image.addComponent(UITransform);
            const touch = host.guideHandTouch ?? GUIDE_HAND_TOUCH;
            transform.setAnchorPoint(touch[0], 1 - touch[1]);
            const width = host.cellFace * 1.45;
            const aspect = frame.originalSize.height / Math.max(1, frame.originalSize.width);
            transform.setContentSize(width, width * aspect);
            const sprite = image.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            sprite.spriteFrame = frame;
            this.handNode = node;
        }
        node.active = true;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
        return node;
    }

    private showHand(row: number, col: number, isDouble: boolean): void {
        this.hideHand();
        const node = this.createHand();
        if (!node) return;
        const [x, y] = this.cellCenter(row, col);
        const contact = new Vec3(x, y, 0);
        const direction = this.fitHand([contact]);
        const hover = new Vec3(x + this.host.cellFace * 0.03 * direction, y + this.host.cellFace * 0.07, 0);
        node.setPosition(hover);
        const timing = isDouble ? GUIDE_HAND_TAP_TIMING.double : GUIDE_HAND_TAP_TIMING.single;
        let chain = tween(node).delay(GUIDE_HAND_TAP_TIMING.hover);
        const count = isDouble ? 2 : 1;
        for (let index = 0; index < count; index += 1) {
            if (index > 0) chain = chain.delay(timing.gap);
            chain = chain
                .to(timing.press, { position: contact, scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineIn' })
                .call(() => this.showTapRipple(x, y))
                .delay(timing.hold)
                .to(timing.release, { position: hover, scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' });
        }
        this.startTween(chain.delay(GUIDE_HAND_TAP_TIMING.rest).union().repeatForever());
    }

    private playSwipeHand(path: readonly Cell[]): void {
        if (path.length === 0) return;
        const node = this.createHand();
        if (!node) return;
        const points = path.map(([row, col]) => {
            const [x, y] = this.cellCenter(row, col);
            return new Vec3(x, y, 0);
        });
        this.fitHand(points);
        node.setPosition(points[0]!);
        const opacity = node.getComponent(UIOpacity)!;
        let chain = tween(node)
            .delay(0.35)
            .to(GUIDE_HAND_SWIPE_PRESS, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineIn' })
            .call(() => this.showTapRipple(points[0]!.x, points[0]!.y));
        for (let index = 1; index < points.length; index += 1) {
            const point = points[index]!;
            chain = chain
                .to(0.3, { position: point }, { easing: 'sineInOut' })
                .call(() => this.showTapRipple(point.x, point.y));
        }
        this.startTween(chain
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
            .delay(0.4)
            .call(() => { opacity.opacity = 0; })
            .delay(0.25)
            .call(() => {
                node.setPosition(points[0]!);
                opacity.opacity = 255;
            })
            .union()
            .repeatForever());
    }

    /**
     * 以真实指尖为固定原点，把手掌朝可用空间更宽的一侧翻转；短屏时再等比缩小。
     * 检查完整原图矩形（含留白）及悬停位移，避免右边列/底行手腕越过安全边界。
     */
    private fitHand(points: readonly Vec3[]): 1 | -1 {
        const image = this.handNode?.getChildByName('HandImage');
        const size = image?.getComponent(UITransform)?.contentSize;
        if (!image || !size || points.length === 0) return 1;
        const host = this.host;
        const touch = host.guideHandTouch ?? GUIDE_HAND_TOUCH;
        const gap = host.cellFace * 0.025;
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const leftRoom = Math.max(0, minX + host.width / 2 - gap - host.cellFace * 0.03);
        const rightRoom = Math.max(0, host.width / 2 - maxX - gap - host.cellFace * 0.03);
        const topRoom = Math.max(0, (host.safeTopY ?? host.height / 2) - maxY - gap - host.cellFace * 0.07);
        const bottomRoom = Math.max(0, minY - (host.safeBottomY ?? -host.height / 2) - gap);
        const leftExtent = Math.max(1, size.width * touch[0]);
        const rightExtent = Math.max(1, size.width * (1 - touch[0]));
        const normal = Math.min(leftRoom / leftExtent, rightRoom / rightExtent);
        const mirror = Math.min(leftRoom / rightExtent, rightRoom / leftExtent);
        const direction = mirror > normal ? -1 : 1;
        const scale = Math.max(0.001, Math.min(
            1,
            direction === -1 ? mirror : normal,
            topRoom / Math.max(1, size.height * touch[1]),
            bottomRoom / Math.max(1, size.height * (1 - touch[1])),
        ));
        image.setScale(direction * scale, scale, 1);
        return direction;
    }

    /** 由演示手按下触发；环的位置直接使用棋盘触点，与指尖锚点一致。 */
    private showTapRipple(x: number, y: number): void {
        if (this.disposed || this.paused || this.transitioning) return;
        const ring = new Node('TapRipple');
        ring.layer = this.layer.layer;
        // 与手同层但放在手图片之前，波纹不会被蒙层压暗。
        ring.setParent(this.handLayer);
        ring.setSiblingIndex(0);
        const radius = this.host.cellFace * 0.34;
        ring.addComponent(UITransform).setContentSize(radius * 2, radius * 2);
        ring.setPosition(x, y, 0);
        const graphics = ring.addComponent(Graphics);
        graphics.lineWidth = Math.max(2, this.host.cellFace * 0.035);
        graphics.strokeColor = new Color(255, 250, 229, 255);
        graphics.circle(0, 0, radius);
        graphics.stroke();
        graphics.lineWidth = Math.max(1.5, this.host.cellFace * 0.018);
        graphics.strokeColor = new Color(145, 103, 68, 210);
        graphics.circle(0, 0, radius * 0.81);
        graphics.stroke();
        const opacity = ring.addComponent(UIOpacity);
        opacity.opacity = 230;
        ring.setScale(0.22, 0.22, 1);
        this.ripples.push(ring);
        this.startTween(tween(ring).to(0.55, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' }));
        this.startTween(tween(opacity)
            .to(0.55, { opacity: 0 }, { easing: 'sineOut' })
            .call(() => {
                const index = this.ripples.indexOf(ring);
                if (index >= 0) this.ripples.splice(index, 1);
                this.destroyVisualNode(ring);
            }));
    }

    private hideHand(): void {
        const node = this.handNode;
        if (node?.isValid) {
            this.visitTweenTargets(node, (target) => Tween.stopAllByTarget(target));
            node.active = false;
        }
        for (const ripple of this.ripples) this.destroyVisualNode(ripple);
        this.ripples.length = 0;
    }

    private flashWrong(row: number, col: number): void {
        const host = this.host;
        const [x, y] = this.cellCenter(row, col);
        const ring = new Node('Wrong');
        ring.layer = this.layer.layer;
        ring.setParent(this.fxLayer);
        ring.addComponent(UITransform).setContentSize(host.cellFace, host.cellFace);
        ring.setPosition(x, y, 0);
        const graphics = ring.addComponent(Graphics);
        graphics.lineWidth = 6;
        graphics.strokeColor = new Color(217, 72, 72, 220);
        const half = host.cellFace * 0.46;
        graphics.rect(-half, -half, half * 2, half * 2);
        graphics.stroke();
        const opacity = ring.addComponent(UIOpacity);
        opacity.opacity = 200;
        this.overlays.push(ring);
        this.startTween(tween(opacity)
            .to(0.24, { opacity: 0 })
            .call(() => {
                const index = this.overlays.indexOf(ring);
                if (index >= 0) this.overlays.splice(index, 1);
                this.destroyVisualNode(ring);
            }));
    }

    // ------------------------------------------------------------------ 小工具

    private startTween(animation: Tween): void {
        animation.start();
        if (this.paused) animation.pause();
    }

    private visitTweenTargets(node: Node, action: (target: object) => void): void {
        if (!node.isValid) return;
        action(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) action(opacity);
        for (const child of node.children) this.visitTweenTargets(child, action);
    }

    private destroyVisualNode(node: Node): void {
        if (!node.isValid) return;
        this.visitTweenTargets(node, (target) => Tween.stopAllByTarget(target));
        node.active = false;
        node.removeFromParent();
        node.destroy();
    }

    /**
     * 面板背景：和游戏里其它提示语（暂停弹窗、失败页、Toast）**用同一套画法**——
     * `Graphics` 圆角矩形 + 白色 246 alpha。之前用 9-slice 贴图，观感和它们不一致。
     */
    private drawPanel(node: Node, width: number, height: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = MEOWDOKU_COLORS.toast;
        graphics.roundRect(-width / 2, -height / 2, width, height, Math.min(24 * this.host.k, width / 2, height / 2));
        graphics.fill();
    }

    private makeLabel(
        parent: Node,
        name: string,
        width: number,
        height: number,
        fontSize: number,
    ): Label {
        const node = new Node(name);
        node.layer = this.layer.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = '';
        label.fontSize = Math.round(fontSize);
        label.lineHeight = Math.round(fontSize * 1.25);
        label.color = MEOWDOKU_COLORS.ruleText;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        node.setPosition(0, 0, 0);
        return label;
    }

    private makeButton(
        name: string,
        text: string,
        width: number,
        height: number,
        fontSize: number,
    ): Node {
        const node = new Node(name);
        node.layer = this.layer.layer;
        node.setParent(this.uiLayer);
        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = TUTORIAL_BUTTON_COLOR;
        graphics.roundRect(-width / 2, -height / 2, width, height, Math.min(height, width) / 2);
        graphics.fill();
        const label = this.makeLabel(node, 'Label', width - 30, height - 20, fontSize);
        label.string = text;
        label.color = Color.WHITE;
        return node;
    }
}

export type { TutorialHost, TutorialStepSpec };

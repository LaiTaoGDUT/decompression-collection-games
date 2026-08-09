import {
    BlockInputEvents,
    Button,
    Color,
    Graphics,
    Label,
    Node,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import type {
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import {
    calculateWatermelonOverlayMetrics,
    readWatermelonViewport,
} from './WatermelonResponsiveRules';

interface ActionSpec {
    readonly name: string;
    readonly label: string;
    readonly action: () => Promise<void>;
    readonly tone: 'leaf' | 'coral' | 'danger' | 'paper';
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

const COLORS = {
    ink: new Color(75, 43, 32, 255),
    cream: new Color(255, 242, 214, 255),
    paper: new Color(255, 226, 168, 255),
    leaf: new Color(40, 122, 78, 255),
    coral: new Color(242, 139, 102, 255),
    danger: new Color(184, 46, 62, 255),
    overlay: new Color(61, 33, 24, 165),
    disabled: new Color(199, 184, 165, 255),
};

/** W1 自有暂停与结果层；行为模型仍由公共运行层提供。 */
export class WatermelonOverlayView {
    private pause?: OverlayState;
    private result?: OverlayState;

    constructor(
        private readonly owner: Node,
        private readonly feedback: FeedbackService,
    ) {}

    showPause(model: MiniGamePauseModel, score: number): void {
        this.hidePause();
        this.pause = this.build(
            'W1PauseOverlay',
            '暂停一下',
            `当前分数  ${score}\n纸片们会在原位等你回来`,
            [
                { name: 'ResumeButton', label: '继续游戏', action: model.resume, tone: 'leaf' },
                { name: 'RestartButton', label: '重新开始', action: model.restart, tone: 'coral' },
                { name: 'LobbyButton', label: '回到大厅', action: model.exit, tone: 'paper' },
            ],
        );
    }

    hidePause(): void {
        this.destroyState(this.pause);
        this.pause = undefined;
    }

    showResult(model: MiniGameResultModel): void {
        this.hideResult();
        const extra = model.result.extra ?? {};
        const newRecord = extra.newRecord === true;
        const maxFruitLevel = typeof extra.maxFruitLevel === 'number'
            ? Math.max(0, Math.min(10, Math.floor(extra.maxFruitLevel)))
            : 0;
        this.result = this.build(
            'W1ResultOverlay',
            newRecord ? '新纪录！' : '本局完成',
            `最终分数  ${model.result.score}\n本局最大水果等级  ${maxFruitLevel}`,
            [
                { name: 'RestartButton', label: '再来一局', action: model.restart, tone: 'coral' },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, tone: 'paper' },
            ],
            newRecord,
        );
    }

    hideResult(): void {
        this.destroyState(this.result);
        this.result = undefined;
    }

    dispose(): void {
        this.hidePause();
        this.hideResult();
    }

    private build(
        name: string,
        title: string,
        body: string,
        actions: readonly ActionSpec[],
        highlight = false,
    ): OverlayState {
        const viewport = readWatermelonViewport(this.owner);
        const metrics = calculateWatermelonOverlayMetrics(
            viewport.width,
            viewport.height,
            viewport.safeTop,
            viewport.safeBottom,
        );
        const root = new Node(name);
        root.layer = this.owner.layer;
        root.setParent(this.owner);
        root.setSiblingIndex(this.owner.children.length - 1);
        root.addComponent(UITransform).setContentSize(metrics.width, metrics.height);
        root.addComponent(BlockInputEvents);
        const widget = root.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = true;
        widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;
        widget.updateAlignment();
        const shade = root.addComponent(Graphics);
        shade.fillColor = COLORS.overlay;
        shade.rect(
            -metrics.width / 2,
            -metrics.height / 2,
            metrics.width,
            metrics.height,
        );
        shade.fill();

        const panel = new Node('PaperPanel');
        panel.layer = root.layer;
        panel.setParent(root);
        panel.setPosition(0, metrics.panelY);
        panel.addComponent(UITransform).setContentSize(metrics.panelWidth, metrics.panelHeight);
        const paper = panel.addComponent(Graphics);
        paper.fillColor = new Color(75, 43, 32, 45);
        paper.roundRect(
            -metrics.panelWidth / 2 + 14,
            -metrics.panelHeight / 2 - 12,
            metrics.panelWidth - 10,
            metrics.panelHeight - 10,
            28,
        );
        paper.fill();
        paper.fillColor = COLORS.cream;
        paper.strokeColor = COLORS.ink;
        paper.lineWidth = 8;
        paper.roundRect(
            -metrics.panelWidth / 2,
            -metrics.panelHeight / 2,
            metrics.panelWidth,
            metrics.panelHeight,
            28,
        );
        paper.fill();
        paper.stroke();
        paper.fillColor = highlight ? new Color(249, 199, 79, 255) : COLORS.paper;
        const foldRight = metrics.panelWidth / 2;
        const foldTop = metrics.panelHeight / 2;
        paper.moveTo(foldRight - 120, foldTop);
        paper.lineTo(foldRight, foldTop - 120);
        paper.lineTo(foldRight - 120, foldTop - 120);
        paper.close();
        paper.fill();

        const contentWidth = metrics.panelWidth - 90;
        this.createLabel(panel, 'Title', title, 0, 214, 42, highlight ? COLORS.danger : COLORS.ink, contentWidth, 62);
        this.createLabel(panel, 'Body', body, 0, 112, 26, COLORS.ink, contentWidth, 100);

        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        const startY = actions.length === 3 ? -14 : -54;
        actions.forEach((action, index) => {
            buttons.push(this.createButton(
                panel,
                action,
                startY - index * 92,
                () => this.run(state, action),
            ));
        });

        panel.setScale(0.88, 0.72, 1);
        tween(panel).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private createButton(
        parent: Node,
        spec: ActionSpec,
        y: number,
        handler: () => void,
    ): Button {
        const node = new Node(spec.name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(0, y);
        const panelWidth = parent.getComponent(UITransform)?.contentSize.width ?? 610;
        const buttonWidth = Math.min(450, panelWidth - 80);
        node.addComponent(UITransform).setContentSize(buttonWidth, 88);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = spec.tone === 'leaf'
            ? COLORS.leaf
            : spec.tone === 'coral'
                ? COLORS.coral
                : spec.tone === 'danger' ? COLORS.danger : COLORS.paper;
        graphics.roundRect(-buttonWidth / 2, -44, buttonWidth, 88, 18);
        graphics.fill();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const label = this.createLabel(
            node,
            'Label',
            spec.label,
            0,
            0,
            28,
            spec.tone === 'leaf' || spec.tone === 'danger'
                ? Color.WHITE
                : COLORS.ink,
            buttonWidth - 30,
            62,
        );
        label.isBold = true;
        return button;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
    ): Label {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 10;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private async run(state: OverlayState, spec: ActionSpec): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = button.node.name === spec.name ? 230 : 145;
        });
        const selected = state.root.getChildByName('PaperPanel')
            ?.getChildByName(spec.name)
            ?.getChildByName('Label')
            ?.getComponent(Label);
        const original = selected?.string;
        if (selected) selected.string = '处理中…';
        try {
            await spec.action();
        } catch (error: unknown) {
            console.error(`[WatermelonOverlayView] ${spec.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
                if (selected && original) selected.string = original;
            }
        }
    }

    private destroyState(state?: OverlayState): void {
        if (state?.root.isValid) state.root.destroy();
    }
}

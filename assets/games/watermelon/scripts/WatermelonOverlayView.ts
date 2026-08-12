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
import { CAT_UI_SHAPE, catUiColor } from './WatermelonUiTheme';

interface ActionSpec {
    readonly name: string;
    readonly label: string;
    readonly action: () => Promise<void>;
    readonly tone: 'mint' | 'peach' | 'danger' | 'soft';
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

/** 萌系猫咪主题暂停与结果层；行为模型仍由公共运行层提供。 */
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
            `当前分数  ${score}\n猫咪们会在原位等你回来`,
            [
                { name: 'ResumeButton', label: '继续游戏', action: model.resume, tone: 'mint' },
                { name: 'RestartButton', label: '重新开始', action: model.restart, tone: 'peach' },
                { name: 'LobbyButton', label: '回到大厅', action: model.exit, tone: 'soft' },
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
            `最终分数  ${model.result.score}\n本局最大猫咪等级  ${maxFruitLevel}`,
            [
                { name: 'RestartButton', label: '再来一局', action: model.restart, tone: 'peach' },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, tone: 'soft' },
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
        shade.fillColor = catUiColor('ink', 172);
        shade.rect(
            -metrics.width / 2,
            -metrics.height / 2,
            metrics.width,
            metrics.height,
        );
        shade.fill();

        const panel = new Node('CozyPanel');
        panel.layer = root.layer;
        panel.setParent(root);
        panel.setPosition(0, metrics.panelY);
        panel.addComponent(UITransform).setContentSize(metrics.panelWidth, metrics.panelHeight);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = catUiColor('ink', 38);
        panelGraphics.roundRect(
            -metrics.panelWidth / 2 + 14,
            -metrics.panelHeight / 2 - 12,
            metrics.panelWidth - 10,
            metrics.panelHeight - 10,
            CAT_UI_SHAPE.panelRadius,
        );
        panelGraphics.fill();
        panelGraphics.fillColor = catUiColor('surface');
        panelGraphics.strokeColor = highlight
            ? catUiColor('butter')
            : catUiColor('lavender');
        panelGraphics.lineWidth = 7;
        panelGraphics.roundRect(
            -metrics.panelWidth / 2,
            -metrics.panelHeight / 2,
            metrics.panelWidth,
            metrics.panelHeight,
            CAT_UI_SHAPE.panelRadius,
        );
        panelGraphics.fill();
        panelGraphics.stroke();
        panelGraphics.fillColor = highlight
            ? catUiColor('butter')
            : catUiColor('blush');
        panelGraphics.roundRect(-104, metrics.panelHeight / 2 - 70, 208, 38, 19);
        panelGraphics.fill();
        // A compact paw mark establishes theme without crowding the content.
        panelGraphics.fillColor = catUiColor('peach', 190);
        panelGraphics.circle(0, metrics.panelHeight / 2 - 51, 9);
        panelGraphics.circle(-14, metrics.panelHeight / 2 - 37, 5);
        panelGraphics.circle(0, metrics.panelHeight / 2 - 33, 5);
        panelGraphics.circle(14, metrics.panelHeight / 2 - 37, 5);
        panelGraphics.fill();

        const contentWidth = metrics.panelWidth - 90;
        this.createLabel(panel, 'Title', title, 0, 214, 42, highlight ? catUiColor('danger') : catUiColor('ink'), contentWidth, 62);
        this.createLabel(panel, 'Body', body, 0, 112, 26, catUiColor('ink'), contentWidth, 100);

        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        const startY = actions.length === 3 ? -18 : -54;
        actions.forEach((action, index) => {
            buttons.push(this.createButton(
                panel,
                action,
                startY - index * 88,
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
        const buttonWidth = Math.min(400, panelWidth - 130);
        const buttonHeight = 66;
        node.addComponent(UITransform).setContentSize(buttonWidth, buttonHeight);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = spec.tone === 'mint'
            ? catUiColor('mintDark')
            : spec.tone === 'peach'
                ? catUiColor('peach')
                : spec.tone === 'danger' ? catUiColor('danger') : catUiColor('cream');
        graphics.strokeColor = spec.tone === 'soft'
            ? catUiColor('blush')
            : catUiColor('surface', 190);
        graphics.lineWidth = 3;
        graphics.roundRect(
            -buttonWidth / 2,
            -buttonHeight / 2,
            buttonWidth,
            buttonHeight,
            CAT_UI_SHAPE.buttonRadius,
        );
        graphics.fill();
        graphics.stroke();
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
            25,
            spec.tone === 'mint' || spec.tone === 'danger'
                ? catUiColor('surface')
                : catUiColor('ink'),
            buttonWidth - 30,
            48,
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
        const selected = state.root.getChildByName('CozyPanel')
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

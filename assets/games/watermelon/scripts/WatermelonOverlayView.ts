import {
    BlockInputEvents,
    Button,
    Color,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
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
import type { WatermelonPopupFrames } from './WatermelonPopupAssets';
import {
    calculateWatermelonOverlayMetrics,
    readWatermelonViewport,
} from './WatermelonResponsiveRules';
import { catUiColor } from './WatermelonUiTheme';

type PopupKind = 'pause' | 'continue' | 'result';
type PopupArtworkKind = 'pause' | 'continue' | 'record';

function layoutVideoIconBeforeLabel(
    icon: Node | undefined,
    label: Label,
    text: string,
    fontSize: number,
    iconSize: number,
    buttonWidth: number,
    gap = 10,
): void {
    if (!icon) return;
    const labelTransform = label.node.getComponent(UITransform);
    if (!labelTransform) return;
    let measuredTextWidth = 0;
    for (const character of text) {
        if (character === ' ') measuredTextWidth += fontSize * 0.35;
        else if (/^[\u0000-\u00ff]$/.test(character)) measuredTextWidth += fontSize * 0.56;
        else measuredTextWidth += fontSize;
    }
    const textWidth = Math.min(
        Math.max(fontSize, measuredTextWidth),
        Math.max(fontSize, buttonWidth - iconSize - gap - 28),
    );
    const totalWidth = iconSize + gap + textWidth;
    const centerY = label.node.position.y;
    labelTransform.setContentSize(textWidth, labelTransform.contentSize.height);
    label.node.setPosition((iconSize + gap) / 2, centerY);
    icon.setPosition(-totalWidth / 2 + iconSize / 2, centerY);
}

interface PopupAction {
    readonly name: string;
    readonly label: string;
    readonly action: () => void | Promise<void>;
    readonly textOnly?: boolean;
    readonly videoIcon?: boolean;
    readonly busyLabel?: string;
}

interface PopupStat {
    readonly label: string;
    readonly value: string;
}

interface PopupSpec {
    readonly name: string;
    readonly kind: PopupKind;
    readonly body?: string;
    readonly stats?: readonly PopupStat[];
    readonly actions: readonly PopupAction[];
    readonly highlight?: boolean;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

export interface WatermelonContinueModel {
    readonly continueGame: () => void | Promise<void>;
    readonly settle: () => void | Promise<void>;
    readonly restart: () => void | Promise<void>;
    readonly returnToLobby: () => void | Promise<void>;
}

const PANEL_WIDTH = 565;
const PANEL_HEIGHT = 930;
// The source panel has had its transparent margin removed and now uses the
// final 1x design width. Only its quiet vertical centre is stretched.
const PAUSE_PANEL_ART_WIDTH = 550;
const PAUSE_PANEL_ART_HEIGHT = 900;
const PAUSE_ART_SCALE = 1;
const PAUSE_PANEL_DISPLAY_HEIGHT = 860;
const RECORD_PANEL_ART_WIDTH = 550;
const RECORD_PANEL_BASE_ART_HEIGHT = 930;
const RECORD_PANEL_ART_HEIGHT = 980;
const RECORD_PANEL_VERTICAL_EXPANSION = RECORD_PANEL_ART_HEIGHT - RECORD_PANEL_BASE_ART_HEIGHT;
const RECORD_PANEL_SOURCE_WIDTH = 750;
const RECORD_PANEL_SOURCE_HEIGHT = 1261;
const RECORD_PANEL_DISPLAY_SCALE = RECORD_PANEL_ART_WIDTH / RECORD_PANEL_SOURCE_WIDTH;
const RECORD_PANEL_SOURCE_LOGICAL_HEIGHT = Math.max(
    RECORD_PANEL_SOURCE_HEIGHT,
    RECORD_PANEL_ART_HEIGHT / RECORD_PANEL_DISPLAY_SCALE,
);
const CONTINUE_PANEL_ART_WIDTH = 550;
const CONTINUE_PANEL_ART_HEIGHT = 800;
const CONTINUE_PANEL_DISPLAY_SCALE = RECORD_PANEL_ART_WIDTH / CONTINUE_PANEL_ART_WIDTH;
const NORMAL_RESULT_PANEL_ART_HEIGHT = 880;
const NORMAL_RESULT_PANEL_VERTICAL_TRIM = RECORD_PANEL_BASE_ART_HEIGHT - NORMAL_RESULT_PANEL_ART_HEIGHT;
const NORMAL_RESULT_PANEL_SOURCE_LOGICAL_HEIGHT = Math.max(
    CONTINUE_PANEL_ART_HEIGHT,
    NORMAL_RESULT_PANEL_ART_HEIGHT / CONTINUE_PANEL_DISPLAY_SCALE,
);
const PAUSE_CONTROL_WIDTH = 350;
const PAUSE_TEXT_COLOR = new Color(0x69, 0x47, 0x38, 255);
const POPUP_TITLE_TEXT_COLOR = new Color(0x57, 0x3d, 0x30, 255);
const RECORD_TEXT_COLOR = new Color(0x57, 0x3d, 0x30, 255);
const RECORD_RESTART_TEXT_COLOR = new Color(0xfa, 0xf7, 0xf8, 255);
const RECORD_STAT_BACKGROUND = new Color(0xf7, 0xe8, 0xd0, 255);

/** 使用水果果冻主题图片资源构建暂停、续玩和结算弹窗。 */
export class WatermelonOverlayView {
    private pause?: OverlayState;
    private continuePrompt?: OverlayState;
    private result?: OverlayState;

    constructor(
        private readonly owner: Node,
        private readonly feedback: FeedbackService,
        private readonly frames: WatermelonPopupFrames,
    ) {}

    showPause(model: MiniGamePauseModel, score: number): void {
        this.hidePause();
        this.pause = this.build({
            name: 'W1PauseOverlay',
            kind: 'pause',
            body: '水果们会在原位等你回来',
            stats: [{ label: '当前分数', value: String(score) }],
            actions: [
                { name: 'ResumeButton', label: '继续游戏', action: model.resume },
                { name: 'RestartButton', label: '重新开始', action: model.restart },
                { name: 'LobbyButton', label: '回到大厅', action: model.exit, textOnly: true },
            ],
        });
    }

    hidePause(): void {
        this.destroyState(this.pause);
        this.pause = undefined;
    }

    showContinue(model: WatermelonContinueModel): void {
        this.hideContinue();
        this.continuePrompt = this.build({
            name: 'W1ContinueOverlay',
            kind: 'continue',
            body: '清除越线水果，继续本局',
            actions: [
                {
                    name: 'ContinueButton',
                    label: '看视频续玩',
                    action: model.continueGame,
                    videoIcon: true,
                    busyLabel: '正在播放视频…',
                },
                { name: 'SettleButton', label: '查看本局结算', action: model.settle },
                { name: 'RestartButton', label: '再来一局', action: model.restart },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, textOnly: true },
            ],
        });
    }

    hideContinue(): void {
        this.destroyState(this.continuePrompt);
        this.continuePrompt = undefined;
    }

    showResult(model: MiniGameResultModel, dismiss: () => void): void {
        this.hideResult();
        const extra = model.result.extra ?? {};
        const newRecord = extra.newRecord === true;
        const maxFruitLevel = typeof extra.maxFruitLevel === 'number'
            ? Math.max(0, Math.min(10, Math.floor(extra.maxFruitLevel)))
            : 0;
        this.result = this.build({
            name: 'W1ResultOverlay',
            kind: 'result',
            stats: [
                { label: '最终分数', value: String(model.result.score) },
                { label: '最大水果等级', value: String(maxFruitLevel) },
            ],
            actions: [
                { name: 'RestartButton', label: '再来一局', action: model.restart },
                { name: 'InspectFruitsButton', label: '关闭并查看水果', action: dismiss },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, textOnly: true },
            ],
            highlight: newRecord,
        });
    }

    hideResult(): void {
        this.destroyState(this.result);
        this.result = undefined;
    }

    dispose(): void {
        this.hidePause();
        this.hideContinue();
        this.hideResult();
    }

    private build(spec: PopupSpec): OverlayState {
        const viewport = readWatermelonViewport(this.owner);
        const recordArtwork = spec.kind === 'result' && spec.highlight === true;
        const resultArtwork = spec.kind === 'result';
        const metrics = calculateWatermelonOverlayMetrics(
            viewport.width,
            viewport.height,
            viewport.safeTop,
            viewport.safeBottom,
            spec.kind === 'pause'
                ? PAUSE_PANEL_DISPLAY_HEIGHT
                : spec.kind === 'continue'
                    ? CONTINUE_PANEL_ART_HEIGHT
                    : resultArtwork
                        ? recordArtwork ? RECORD_PANEL_ART_HEIGHT : NORMAL_RESULT_PANEL_ART_HEIGHT
                    : PANEL_HEIGHT,
            viewport.safeLeft,
            viewport.safeRight,
        );
        const root = new Node(spec.name);
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
        shade.fillColor = new Color(48, 39, 30, 178);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();

        const panel = resultArtwork
            ? this.createResultPanel(
                root,
                metrics.contentX,
                metrics.panelY - 16 + (recordArtwork
                    ? RECORD_PANEL_VERTICAL_EXPANSION
                    : -NORMAL_RESULT_PANEL_VERTICAL_TRIM) / 2,
                recordArtwork ? this.frames.recordBackground : this.frames.continuePanel,
                recordArtwork ? RECORD_PANEL_SOURCE_WIDTH : CONTINUE_PANEL_ART_WIDTH,
                recordArtwork ? RECORD_PANEL_SOURCE_LOGICAL_HEIGHT : NORMAL_RESULT_PANEL_SOURCE_LOGICAL_HEIGHT,
            )
            : this.createSpriteSurface(
                root,
                'FruitPopupPanel',
                this.getBackgroundFrame(spec),
                spec.kind === 'pause' ? PAUSE_PANEL_ART_WIDTH : spec.kind === 'continue' ? CONTINUE_PANEL_ART_WIDTH : PANEL_WIDTH,
                spec.kind === 'pause' ? PAUSE_PANEL_ART_HEIGHT : spec.kind === 'continue' ? CONTINUE_PANEL_ART_HEIGHT : PANEL_HEIGHT,
                metrics.contentX,
                spec.kind === 'pause' || spec.kind === 'continue' ? metrics.panelY - 16 : metrics.panelY - 35,
            );
        const contentPanel = resultArtwork
            ? this.createResultContent(
                panel,
                recordArtwork ? RECORD_PANEL_DISPLAY_SCALE : CONTINUE_PANEL_DISPLAY_SCALE,
                recordArtwork ? RECORD_PANEL_ART_HEIGHT : NORMAL_RESULT_PANEL_ART_HEIGHT,
                recordArtwork
                    ? -RECORD_PANEL_VERTICAL_EXPANSION / 2
                    : NORMAL_RESULT_PANEL_VERTICAL_TRIM / 2,
            )
            : panel;
        const panelSprite = panel.getComponent(Sprite);
        if (panelSprite) {
            panelSprite.type = spec.kind === 'pause' || spec.kind === 'continue'
                ? Sprite.Type.SLICED
                : Sprite.Type.SIMPLE;
        }
        const pauseArtwork = spec.kind === 'pause';
        const title = this.createLabel(
            contentPanel,
            'PopupTitle',
            this.getPopupTitle(spec),
            0,
            resultArtwork ? 245 : 238,
            resultArtwork ? 64 : 54,
            pauseArtwork || spec.kind === 'continue'
                ? POPUP_TITLE_TEXT_COLOR
                : resultArtwork
                    ? RECORD_TEXT_COLOR
                : catUiColor(spec.highlight ? 'peachDark' : 'ink'),
            pauseArtwork || spec.kind === 'continue' || resultArtwork ? 470 : 500,
            resultArtwork ? 88 : 76,
        );
        title.isBold = true;
        if (pauseArtwork || spec.kind === 'continue') title.spacingX = 8;
        if (resultArtwork) title.spacingX = 5;
        this.createContent(contentPanel, spec);

        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        this.createActions(contentPanel, spec, state, buttons);

        const resultDisplayScale = recordArtwork ? RECORD_PANEL_DISPLAY_SCALE : CONTINUE_PANEL_DISPLAY_SCALE;
        const finalScale = (resultArtwork ? resultDisplayScale : PAUSE_ART_SCALE) * metrics.panelScale;
        const initialScale = 0.88 * finalScale;
        panel.setScale(initialScale, resultArtwork ? initialScale : 0.74 * finalScale, 1);
        tween(panel)
            .to(0.24, { scale: new Vec3(finalScale, finalScale, 1) }, { easing: 'backOut' })
            .start();
        return state;
    }

    private createContent(panel: Node, spec: PopupSpec): void {
        if (spec.kind === 'pause') {
            this.createBodyLine(panel, spec.body!, 168, 27, 430, 54, PAUSE_TEXT_COLOR);
            this.createPauseStat(panel, spec.stats![0]);
            return;
        }
        if (spec.kind === 'continue') {
            this.createBodyLine(panel, spec.body!, 158, 27, 430, 54, PAUSE_TEXT_COLOR);
            return;
        }
        if (spec.kind === 'result') {
            // Keep a breathing gap below the title and above the first action;
            // the lobby link remains fixed so its bottom inset stays aligned
            // with the pause popup.
            const recordStatY = [105, -20];
            spec.stats!.forEach((stat, index) => {
                this.createRecordStat(panel, stat, recordStatY[index] ?? -65);
            });
            return;
        }
    }

    private createActions(panel: Node, spec: PopupSpec, state: OverlayState, buttons: Button[]): void {
        if (spec.kind === 'pause') {
            const pauseY = [-125, -232, -325];
            spec.actions.forEach((action, index) => {
                buttons.push(this.createButton(
                    panel,
                    action,
                    pauseY[index],
                    () => this.run(state, action),
                    'pause',
                ));
            });
            return;
        }
        if (spec.kind === 'continue') {
            const continueY = [16, -98, -204, -295];
            spec.actions.forEach((action, index) => {
                buttons.push(this.createButton(
                    panel,
                    action,
                    continueY[index],
                    () => this.run(state, action),
                    'continue',
                ));
            });
            return;
        }
        if (spec.kind === 'result') {
            const resultY = [-150, -255, -340];
            spec.actions.forEach((action, index) => {
                buttons.push(this.createButton(
                    panel,
                    action,
                    resultY[index],
                    () => this.run(state, action),
                    'record',
                ));
            });
            return;
        }
    }

    private getBackgroundFrame(spec: PopupSpec): SpriteFrame {
        if (spec.kind === 'pause') return this.frames.pauseBackground;
        return this.frames.continuePanel;
    }

    private getPopupTitle(spec: PopupSpec): string {
        if (spec.kind === 'pause') return '暂停一下';
        if (spec.kind === 'continue') return '再坚持一下';
        return spec.highlight ? '新纪录！' : '本局完成';
    }

    private createPauseStat(parent: Node, stat: PopupStat): void {
        const node = this.createSpriteSurface(
            parent,
            `Stat-${stat.label}`,
            this.frames.pauseScoreBackground,
            PAUSE_CONTROL_WIDTH,
            130,
            0,
            38,
        );
        node.getComponent(Sprite)!.type = Sprite.Type.SLICED;
        const label = this.createLabel(node, 'StatLabel', stat.label, 0, 24, 22, PAUSE_TEXT_COLOR, 280, 38);
        label.isBold = false;
        const value = this.createLabel(node, 'StatValue', stat.value, 0, -24, 46, PAUSE_TEXT_COLOR, 280, 58);
        value.isBold = true;
    }

    private createRecordStat(parent: Node, stat: PopupStat, y: number): void {
        const width = PAUSE_CONTROL_WIDTH;
        const height = 112;
        const node = new Node(`Stat-${stat.label}`);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(0, y);
        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = RECORD_STAT_BACKGROUND;
        graphics.roundRect(-width / 2, -height / 2, width, height, 30);
        graphics.fill();
        const label = this.createLabel(node, 'StatLabel', stat.label, 0, 29, 25, RECORD_TEXT_COLOR, 300, 36);
        label.isBold = false;
        const value = this.createLabel(node, 'StatValue', stat.value, 0, -21, 52, RECORD_TEXT_COLOR, 320, 72);
        value.isBold = true;
    }

    /**
     * Keep the source artwork at its native 750px width and let Cocos' native
     * SLICED assembler stretch only the centre band. The popup root is then
     * uniformly scaled to the 550px design width, so the top fruit crown and
     * bottom glow retain their original aspect ratio.
     */
    private createResultPanel(
        parent: Node,
        x: number,
        y: number,
        frame: SpriteFrame,
        sourceWidth: number,
        sourceLogicalHeight: number,
    ): Node {
        const panel = new Node('FruitPopupPanel');
        panel.layer = parent.layer;
        panel.setParent(parent);
        panel.setPosition(x, y);
        panel.addComponent(UITransform).setContentSize(sourceWidth, sourceLogicalHeight);
        const artwork = this.createSpriteSurface(
            panel,
            'RecordPanelArtwork',
            frame,
            sourceWidth,
            sourceLogicalHeight,
            0,
            0,
        );
        artwork.getComponent(Sprite)!.type = Sprite.Type.SLICED;
        return panel;
    }

    private createResultContent(
        panel: Node,
        displayScale: number,
        contentHeight: number,
        contentOffsetY: number,
    ): Node {
        const content = new Node('FruitPopupContent');
        content.layer = panel.layer;
        content.setParent(panel);
        content.addComponent(UITransform).setContentSize(RECORD_PANEL_ART_WIDTH, contentHeight);
        // Keep the title, scores, actions and lobby link at their established
        // world positions while the result panel's top/bottom bounds change.
        content.setPosition(0, contentOffsetY);
        content.setScale(1 / displayScale, 1 / displayScale, 1);
        return content;
    }

    private createBodyLine(
        parent: Node,
        text: string,
        y: number,
        fontSize = 27,
        width = 430,
        height = 54,
        color = catUiColor('ink'),
    ): void {
        this.createLabel(parent, 'Body', text, 0, y, fontSize, color, width, height);
    }

    private createButton(
        parent: Node,
        spec: PopupAction,
        y: number,
        handler: () => void,
        popupKind: PopupArtworkKind,
    ): Button {
        const pauseArtwork = popupKind === 'pause';
        const recordArtwork = popupKind === 'record';
        const continueVideoArtwork = popupKind === 'continue' && spec.videoIcon;
        const textOnly = spec.textOnly === true;
        const width = textOnly ? 260 : continueVideoArtwork ? PAUSE_CONTROL_WIDTH + 20 : PAUSE_CONTROL_WIDTH;
        const frame = textOnly
            ? undefined
                : continueVideoArtwork
                ? this.frames.continueVideoButton
                : pauseArtwork
                ? spec.name === 'ResumeButton'
                    ? this.frames.pauseResumeButton
                    : this.frames.pauseRestartButton
                : recordArtwork
                    ? spec.name === 'RestartButton'
                        ? this.frames.recordRestartButton
                        : this.frames.pauseRestartButton
                : this.frames.pauseRestartButton;
        const height = textOnly ? 58 : continueVideoArtwork ? 104 : 90;
        const node = new Node(spec.name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(0, y);
        node.addComponent(UITransform).setContentSize(width, height);
        node.addComponent(UIOpacity);
        if (!textOnly) {
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SLICED;
            sprite.spriteFrame = frame!;
        } else {
            const graphics = node.addComponent(Graphics);
            graphics.strokeColor = recordArtwork
                ? RECORD_TEXT_COLOR
                : PAUSE_TEXT_COLOR;
            graphics.lineWidth = 3.5;
            const underlineY = -19;
            graphics.moveTo(-width * 0.265, underlineY);
            graphics.lineTo(width * 0.265, underlineY);
            graphics.stroke();
            graphics.fillColor = catUiColor('peach', 180);
            graphics.circle(-width * 0.35, 0, 4);
            graphics.circle(width * 0.35, 0, 4);
            graphics.fill();
        }
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const color = continueVideoArtwork || (pauseArtwork && spec.name === 'ResumeButton')
            ? POPUP_TITLE_TEXT_COLOR
            : recordArtwork && spec.name === 'RestartButton'
            ? RECORD_RESTART_TEXT_COLOR
            : recordArtwork
                ? RECORD_TEXT_COLOR
                : PAUSE_TEXT_COLOR;
        const labelX = 0;
        const labelWidth = width - 72;
        const labelFontSize = textOnly ? 28 : 34;
        const labelY = textOnly ? 1 : 2;
        const label = this.createLabel(node, 'Label', spec.label, labelX, labelY, labelFontSize, color, labelWidth, Math.max(62, height - 36));
        label.enableWrapText = false;
        label.isBold = continueVideoArtwork === true
            || (pauseArtwork && spec.name === 'ResumeButton')
            || (recordArtwork && spec.name === 'RestartButton');
        label.spacingX = continueVideoArtwork ? 2 : 4;
        if (continueVideoArtwork) {
            const icon = this.createSpriteSurface(node, 'FruitVideoIcon', this.frames.continueVideoIcon, 64, 64, 0, 0);
            icon.getComponent(Sprite)!.type = Sprite.Type.SIMPLE;
            layoutVideoIconBeforeLabel(
                icon,
                label,
                spec.label,
                labelFontSize,
                64,
                width,
                6,
            );
        }
        return button;
    }

    private createSpriteSurface(
        parent: Node,
        name: string,
        frame: SpriteFrame,
        width: number,
        height: number,
        x: number,
        y: number,
    ): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        return node;
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
        label.fontFamily = 'PingFang SC';
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 10;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private findButtonLabel(parent: Node, buttonName: string): Label | undefined {
        const button = parent.getChildByName(buttonName);
        const directLabel = button?.getChildByName('Label')?.getComponent(Label);
        if (directLabel) return directLabel;
        for (const child of parent.children) {
            const nestedLabel = this.findButtonLabel(child, buttonName);
            if (nestedLabel) return nestedLabel;
        }
        return undefined;
    }

    private async run(state: OverlayState, spec: PopupAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = button.node.name === spec.name ? 230 : 145;
        });
        const panel = state.root.getChildByName('FruitPopupPanel');
        const selected = panel ? this.findButtonLabel(panel, spec.name) : undefined;
        const original = selected?.string;
        if (selected) selected.string = spec.busyLabel ?? '处理中…';
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

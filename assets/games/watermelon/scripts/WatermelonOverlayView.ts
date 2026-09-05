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
type ButtonTone = 'mint' | 'peach' | 'cream' | 'creamMint' | 'text';

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
    readonly tone: ButtonTone;
    readonly videoIcon?: boolean;
    readonly busyLabel?: string;
    readonly compact?: boolean;
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

const PANEL_WIDTH = 650;
const PANEL_HEIGHT = 1155;
const BUTTON_ART_HEIGHT_RATIO = 0.68;
const BUTTON_VISUAL_GAP = 32;
const FIXED_BUTTON_TEXT_OFFSET_Y = 8;
const ADJUSTED_BACKGROUND_TEXT_OFFSET_Y = 6;
const RESULT_STAT_GAP = 102;

/** 使用猫咪游戏独占图片资源构建暂停、续玩和结算弹窗。 */
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
            body: '猫咪们会在原位等你回来',
            stats: [{ label: '当前分数', value: String(score) }],
            actions: [
                { name: 'ResumeButton', label: '继续游戏', action: model.resume, tone: 'mint' },
                { name: 'RestartButton', label: '重新开始', action: model.restart, tone: 'cream' },
                { name: 'LobbyButton', label: '回到大厅', action: model.exit, tone: 'text' },
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
            body: '清除越线猫咪，继续本局',
            actions: [
                {
                    name: 'ContinueButton',
                    label: '看视频续玩',
                    action: model.continueGame,
                    tone: 'mint',
                    videoIcon: true,
                    busyLabel: '正在播放视频…',
                },
                { name: 'SettleButton', label: '查看本局结算', action: model.settle, tone: 'cream' },
                { name: 'RestartButton', label: '再来一局', action: model.restart, tone: 'cream' },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, tone: 'text' },
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
                { label: '最大猫咪等级', value: String(maxFruitLevel) },
            ],
            actions: [
                { name: 'RestartButton', label: '再来一局', action: model.restart, tone: 'peach' },
                { name: 'LobbyButton', label: '回到大厅', action: model.returnToLobby, tone: 'cream' },
                { name: 'InspectCatsButton', label: '关闭并查看猫咪', action: dismiss, tone: 'creamMint' },
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
        const metrics = calculateWatermelonOverlayMetrics(
            viewport.width,
            viewport.height,
            viewport.safeTop,
            viewport.safeBottom,
            PANEL_HEIGHT,
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
        shade.fillColor = catUiColor('ink', 194);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();

        const panel = this.createSpriteSurface(
            root,
            'CatPopupPanel',
            this.getBackgroundFrame(spec),
            PANEL_WIDTH,
            PANEL_HEIGHT,
            metrics.contentX,
            metrics.panelY,
        );
        panel.getComponent(Sprite)!.type = Sprite.Type.SIMPLE;
        this.createContent(panel, spec);

        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        this.createActions(panel, spec, state, buttons);

        panel.setScale(0.88 * metrics.panelScale, 0.74 * metrics.panelScale, 1);
        tween(panel)
            .to(0.24, { scale: new Vec3(metrics.panelScale, metrics.panelScale, 1) }, { easing: 'backOut' })
            .start();
        return state;
    }

    private createContent(panel: Node, spec: PopupSpec): void {
        if (spec.kind === 'pause') {
            this.createStat(panel, spec.stats![0], 78);
            this.createBodyLine(panel, spec.body!, -28);
            return;
        }
        if (spec.kind === 'continue') {
            this.createBodyLine(panel, spec.body!, 78);
            return;
        }
        spec.stats!.forEach((stat, index) => {
            this.createStat(panel, stat, 88 - index * RESULT_STAT_GAP);
        });
    }

    private createActions(panel: Node, spec: PopupSpec, state: OverlayState, buttons: Button[]): void {
        let visualTop = spec.kind === 'continue' ? 18 : -80;
        spec.actions.forEach((action) => {
            const visualHeight = this.getButtonVisualHeight(action);
            const y = visualTop - visualHeight / 2;
            buttons.push(this.createButton(panel, action, y, () => this.run(state, action)));
            visualTop = y - visualHeight / 2 - BUTTON_VISUAL_GAP;
        });
    }

    private getBackgroundFrame(spec: PopupSpec): SpriteFrame {
        if (spec.kind === 'pause') return this.frames.pauseBackground;
        if (spec.kind === 'continue') return this.frames.continueBackground;
        return spec.highlight ? this.frames.resultBackground : this.frames.resultNormalBackground;
    }

    private createStat(parent: Node, stat: PopupStat, y: number): void {
        const width = 510;
        const height = this.heightForFrame(this.frames.statStrip, width);
        const node = this.createSpriteSurface(parent, `Stat-${stat.label}`, this.frames.statStrip, width, height, 0, y);
        node.getComponent(Sprite)!.type = Sprite.Type.SIMPLE;
        const labelText = this.createLabel(node, 'StatLabel', stat.label, -54, ADJUSTED_BACKGROUND_TEXT_OFFSET_Y, 29, catUiColor('ink'), 260, 62);
        labelText.isBold = true;
        const value = this.createLabel(node, 'StatValue', stat.value, 153, ADJUSTED_BACKGROUND_TEXT_OFFSET_Y, 40, catUiColor('peachDark'), 170, 66);
        value.isBold = true;
    }

    private createBodyLine(parent: Node, text: string, y: number): void {
        const decorations = this.createGraphicsLayer(parent, 'BodyDecorations', 560, 64);
        decorations.node.setPosition(0, y);
        this.drawFlower(decorations, -246, 0, catUiColor('peach'));
        this.drawFlower(decorations, 246, 0, catUiColor('peach'));
        this.createLabel(parent, 'Body', text, 0, y, 29, catUiColor('ink'), 470, 58);
    }

    private createButton(parent: Node, spec: PopupAction, y: number, handler: () => void): Button {
        const textOnly = spec.tone === 'text';
        const width = this.getButtonWidth(spec);
        const frame = textOnly ? undefined : this.getButtonFrame(spec.tone);
        const height = this.getButtonHeight(spec);
        const node = new Node(spec.name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(0, y);
        node.addComponent(UITransform).setContentSize(width, height);
        node.addComponent(UIOpacity);
        if (!textOnly) {
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.spriteFrame = frame!;
        } else {
            const graphics = node.addComponent(Graphics);
            graphics.strokeColor = catUiColor('peachDark', 145);
            graphics.lineWidth = 2;
            graphics.moveTo(-width * 0.265, -22);
            graphics.lineTo(width * 0.265, -22);
            graphics.stroke();
            this.drawPaw(graphics, -width * 0.385, 0, catUiColor('peach', 215), 0.58);
            this.drawPaw(graphics, width * 0.385, 0, catUiColor('peach', 215), 0.58);
        }
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const color = spec.tone === 'mint' || spec.tone === 'creamMint'
            ? catUiColor('mintText') : catUiColor('ink');
        const labelX = 0;
        const labelWidth = width - 72;
        const labelFontSize = textOnly ? 28 : spec.tone === 'creamMint' ? 34 : 40;
        const labelY = spec.tone === 'mint' ? ADJUSTED_BACKGROUND_TEXT_OFFSET_Y : FIXED_BUTTON_TEXT_OFFSET_Y;
        const label = this.createLabel(node, 'Label', spec.label, labelX, labelY, labelFontSize, color, labelWidth, Math.max(62, height - 36));
        label.enableWrapText = false;
        label.isBold = !textOnly;
        if (!textOnly) label.fontFamily = 'Arial Rounded MT Bold';
        if (spec.videoIcon) {
            const icon = this.createSpriteSurface(node, 'CatVideoIcon', this.frames.videoIcon, 78, 78, 0, 0);
            icon.getComponent(Sprite)!.type = Sprite.Type.SIMPLE;
            layoutVideoIconBeforeLabel(
                icon,
                label,
                spec.label,
                labelFontSize,
                78,
                width,
                6,
            );
        }
        return button;
    }

    private getButtonFrame(tone: Exclude<ButtonTone, 'text'>): SpriteFrame {
        if (tone === 'mint') return this.frames.mintButton;
        if (tone === 'peach') return this.frames.peachButton;
        if (tone === 'creamMint') return this.frames.creamMintButton;
        return this.frames.creamButton;
    }

    private getButtonWidth(spec: PopupAction): number {
        if (spec.tone === 'text') return 280;
        if (spec.compact || spec.tone === 'creamMint') return 390;
        return 450;
    }

    private getButtonHeight(spec: PopupAction): number {
        if (spec.tone === 'text') return 60;
        if (spec.compact || spec.tone === 'creamMint') {
            return this.heightForFrame(this.frames.creamMintButton, this.getButtonWidth(spec));
        }
        // 结算页的“回到大厅”和“再来一局”需要同一按钮几何尺寸；
        // 两套底图纵横比不同，因此 cream 按钮沿用 peach 的逻辑高度。
        if (spec.tone === 'cream') {
            return this.heightForFrame(this.frames.peachButton, this.getButtonWidth(spec));
        }
        return this.heightForFrame(this.getButtonFrame(spec.tone), this.getButtonWidth(spec));
    }

    private getButtonVisualHeight(spec: PopupAction): number {
        if (spec.tone === 'text') return 42;
        return this.getButtonHeight(spec) * BUTTON_ART_HEIGHT_RATIO;
    }

    private heightForFrame(frame: SpriteFrame, width: number): number {
        const texture = frame.texture;
        if (!texture || texture.width <= 0 || texture.height <= 0) return width;
        return width * texture.height / texture.width;
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

    private createGraphicsLayer(parent: Node, name: string, width: number, height: number): Graphics {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(width, height);
        return node.addComponent(Graphics);
    }

    private drawPaw(graphics: Graphics, x: number, y: number, color: Color, scale: number): void {
        graphics.fillColor = color;
        graphics.circle(x, y - 3 * scale, 10 * scale);
        graphics.circle(x - 11 * scale, y + 9 * scale, 5 * scale);
        graphics.circle(x, y + 14 * scale, 5 * scale);
        graphics.circle(x + 11 * scale, y + 9 * scale, 5 * scale);
        graphics.fill();
    }

    private drawFlower(graphics: Graphics, x: number, y: number, color: Color): void {
        graphics.fillColor = color;
        graphics.circle(x - 8, y, 7);
        graphics.circle(x + 8, y, 7);
        graphics.circle(x, y - 8, 7);
        graphics.circle(x, y + 8, 7);
        graphics.fill();
        graphics.fillColor = catUiColor('butter');
        graphics.circle(x, y, 5);
        graphics.fill();
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

    private async run(state: OverlayState, spec: PopupAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = button.node.name === spec.name ? 230 : 145;
        });
        const selected = state.root.getChildByName('CatPopupPanel')
            ?.getChildByName(spec.name)
            ?.getChildByName('Label')
            ?.getComponent(Label);
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

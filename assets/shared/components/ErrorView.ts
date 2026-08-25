import {
    _decorator,
    BlockInputEvents,
    Button,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    UITransform,
    VerticalTextAlignment,
    view,
    Widget,
} from 'cc';
import type {
    GameErrorModel,
    GameErrorPresenter,
} from '../../runtime/GameRuntime';

const { ccclass } = _decorator;

/** 公共失败弹窗：用遮罩、独立面板和恢复操作承载所有异常信息。 */
@ccclass('ErrorView')
export class ErrorView extends Component implements GameErrorPresenter {
    private model?: GameErrorModel;
    private retryButton?: Button;
    private lobbyButton?: Button;
    private retryLabel?: Label;
    private lobbyLabel?: Label;
    private busy = false;

    protected onLoad(): void {
        const widget = this.node.getComponent(Widget) ?? this.node.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = true;
        widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;
        widget.updateAlignment();
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }
        this.ensureStructure();
        this.bindActions();
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.hide();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.retryButton?.node.off(Button.EventType.CLICK, this.handleRetry, this);
        this.lobbyButton?.node.off(Button.EventType.CLICK, this.handleLobby, this);
    }

    show(model: GameErrorModel): void {
        this.model = model;
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
        this.node.getComponent(Widget)?.updateAlignment();
        this.ensureStructure();
        this.bindActions();
        this.layoutAndDraw();
        const title = this.node.getChildByName('ErrorTitle')?.getComponent(Label);
        const message = this.node.getChildByName('ErrorMessage')?.getComponent(Label);
        if (title) title.string = model.title ?? '加载出现问题';
        if (message) message.string = model.message;
        this.retryButton!.node.active = Boolean(model.retry);
        this.lobbyButton!.node.active = Boolean(model.returnToLobby);
        this.setBusy(false);
    }

    hide(): void {
        this.model = undefined;
        this.setBusy(false);
        this.node.active = false;
    }

    private ensureStructure(): void {
        const layer = this.node.layer;
        const ensureNode = (name: string): Node => {
            let node = this.node.getChildByName(name);
            if (!node) {
                node = new Node(name);
                node.layer = layer;
                node.setParent(this.node);
                node.addComponent(UITransform);
            }
            return node;
        };
        const ensureGraphics = (name: string): Graphics => {
            const node = ensureNode(name);
            return node.getComponent(Graphics) ?? node.addComponent(Graphics);
        };
        const ensureLabel = (name: string): Label => {
            const node = ensureNode(name);
            return node.getComponent(Label) ?? node.addComponent(Label);
        };
        const ensureButton = (name: string, copy: string): Button => {
            const node = ensureNode(name);
            const button = node.getComponent(Button) ?? node.addComponent(Button);
            let labelNode = node.getChildByName('Label');
            if (!labelNode) {
                labelNode = new Node('Label');
                labelNode.layer = layer;
                labelNode.setParent(node);
                labelNode.addComponent(UITransform);
                labelNode.addComponent(Label);
            }
            labelNode.getComponent(Label)!.string = copy;
            return button;
        };

        ensureGraphics('ErrorBackdrop');
        ensureGraphics('ErrorPanel');
        ensureGraphics('ErrorIcon');
        ensureLabel('ErrorTitle');
        ensureLabel('ErrorMessage');
        this.retryButton = ensureButton('RetryButton', '重新加载');
        this.lobbyButton = ensureButton('LobbyButton', '返回大厅');
        this.retryLabel = this.retryButton.getComponentInChildren(Label) ?? undefined;
        this.lobbyLabel = this.lobbyButton.getComponentInChildren(Label) ?? undefined;
        [
            'ErrorBackdrop',
            'ErrorPanel',
            'ErrorIcon',
            'ErrorTitle',
            'ErrorMessage',
            'RetryButton',
            'LobbyButton',
        ].forEach((name, index) => this.node.getChildByName(name)?.setSiblingIndex(index));
    }

    private bindActions(): void {
        this.retryButton?.node.off(Button.EventType.CLICK, this.handleRetry, this);
        this.lobbyButton?.node.off(Button.EventType.CLICK, this.handleLobby, this);
        this.retryButton?.node.on(Button.EventType.CLICK, this.handleRetry, this);
        this.lobbyButton?.node.on(Button.EventType.CLICK, this.handleLobby, this);
    }

    private layoutAndDraw(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        const visibleSize = view.getVisibleSize();
        const width = Math.max(1, visibleSize.width || size?.width || 750);
        const height = Math.max(1, visibleSize.height || size?.height || 1334);
        const panelWidth = Math.min(594, Math.max(1, width - 72));
        const panelHeight = 520;

        // ErrorLayer is persistent across scene switches. Keep its UI space
        // and the backdrop in the current camera's visible coordinate system;
        // the scene-authored 100x100 placeholder is not a reliable viewport.
        this.node.getComponent(UITransform)?.setContentSize(width, height);
        const backdrop = this.graphics('ErrorBackdrop');
        backdrop.node.setPosition(0, 0);
        backdrop.node.getComponent(UITransform)?.setContentSize(width, height);
        backdrop.clear();
        backdrop.fillColor = new Color(22, 25, 35, 148);
        backdrop.rect(-width / 2, -height / 2, width, height);
        backdrop.fill();

        const panel = this.graphics('ErrorPanel');
        panel.node.getComponent(UITransform)?.setContentSize(panelWidth, panelHeight);
        panel.clear();
        panel.fillColor = new Color(42, 28, 22, 40);
        panel.roundRect(-panelWidth / 2 + 7, -panelHeight / 2 - 13, panelWidth - 14, panelHeight, 38);
        panel.fill();
        panel.fillColor = new Color(255, 250, 239, 255);
        panel.strokeColor = new Color(242, 196, 135, 255);
        panel.lineWidth = 4;
        panel.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 38);
        panel.fill();
        panel.stroke();

        const icon = this.graphics('ErrorIcon');
        icon.node.setPosition(0, 154);
        icon.node.getComponent(UITransform)?.setContentSize(84, 84);
        icon.clear();
        icon.fillColor = new Color(255, 226, 166, 255);
        icon.circle(0, 0, 42);
        icon.fill();
        icon.strokeColor = new Color(224, 122, 66, 255);
        icon.lineWidth = 7;
        icon.moveTo(0, 21);
        icon.lineTo(0, -6);
        icon.stroke();
        icon.circle(0, -22, 4);
        icon.fillColor = new Color(224, 122, 66, 255);
        icon.fill();

        this.styleLabel('ErrorTitle', 36, new Color(77, 47, 35, 255), 0, 78, panelWidth - 80, 52, true);
        this.styleLabel('ErrorMessage', 23, new Color(113, 87, 73, 255), 0, -14, panelWidth - 96, 118, false);
        this.layoutButton(this.retryButton!, -132, -166, new Color(237, 127, 79, 255), Color.WHITE);
        this.layoutButton(this.lobbyButton!, 132, -166, new Color(255, 227, 173, 255), new Color(77, 47, 35, 255));
    }

    private layoutButton(button: Button, x: number, y: number, fill: Color, text: Color): void {
        button.node.setPosition(x, y);
        button.node.getComponent(UITransform)?.setContentSize(218, 76);
        const graphics = button.node.getComponent(Graphics) ?? button.node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = fill;
        graphics.roundRect(-109, -38, 218, 76, 24);
        graphics.fill();
        const label = button.getComponentInChildren(Label);
        if (!label) return;
        label.node.getComponent(UITransform)?.setContentSize(204, 62);
        label.fontSize = 27;
        label.lineHeight = 36;
        label.isBold = true;
        label.color = text;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
    }

    private styleLabel(name: string, fontSize: number, color: Color, x: number, y: number, width: number, height: number, bold: boolean): void {
        const label = this.node.getChildByName(name)?.getComponent(Label);
        if (!label) return;
        label.node.setPosition(x, y);
        label.node.getComponent(UITransform)?.setContentSize(width, height);
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.45);
        label.isBold = bold;
        label.color = color;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
    }

    private graphics(name: string): Graphics {
        const graphics = this.node.getChildByName(name)?.getComponent(Graphics);
        if (!graphics) throw new Error(`ErrorView is missing ${name}.`);
        return graphics;
    }

    private readonly handleCanvasResize = (): void => {
        if (this.node.active) {
            this.layoutAndDraw();
        }
    };

    private readonly handleRetry = (): void => {
        void this.runAction(this.model?.retry, 'retry');
    };

    private readonly handleLobby = (): void => {
        void this.runAction(this.model?.returnToLobby, 'lobby');
    };

    private async runAction(action: (() => Promise<void>) | undefined, source: 'retry' | 'lobby'): Promise<void> {
        if (!action || this.busy) return;
        this.setBusy(true, source);
        try {
            await action();
        } catch (error: unknown) {
            console.error('[ErrorView] Recovery action failed.', error);
        } finally {
            if (this.node.active) this.setBusy(false);
        }
    }

    private setBusy(busy: boolean, source?: 'retry' | 'lobby'): void {
        this.busy = busy;
        if (this.retryButton) this.retryButton.interactable = !busy;
        if (this.lobbyButton) this.lobbyButton.interactable = !busy;
        if (this.retryLabel) this.retryLabel.string = busy && source === 'retry' ? '加载中…' : '重新加载';
        if (this.lobbyLabel) this.lobbyLabel.string = busy && source === 'lobby' ? '返回中…' : '返回大厅';
    }
}

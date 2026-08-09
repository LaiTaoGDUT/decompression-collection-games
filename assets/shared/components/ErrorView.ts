import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    Label,
    Widget,
} from 'cc';
import type {
    GameErrorModel,
    GameErrorPresenter,
} from '../../runtime/GameRuntime';

const { ccclass } = _decorator;

/** 游戏加载失败后的常驻恢复页。 */
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
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.left = 0;
        widget.right = 0;
        widget.top = 0;
        widget.bottom = 0;
        widget.updateAlignment();

        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }

        this.retryButton = this.node.getChildByName('RetryButton')
            ?.getComponent(Button) ?? undefined;
        this.lobbyButton = this.node.getChildByName('LobbyButton')
            ?.getComponent(Button) ?? undefined;
        this.retryLabel = this.retryButton?.getComponentInChildren(Label) ?? undefined;
        this.lobbyLabel = this.lobbyButton?.getComponentInChildren(Label) ?? undefined;
        this.retryButton?.node.on(Button.EventType.CLICK, this.handleRetry, this);
        this.lobbyButton?.node.on(Button.EventType.CLICK, this.handleLobby, this);
        this.hide();
    }

    protected onDestroy(): void {
        this.retryButton?.node.off(Button.EventType.CLICK, this.handleRetry, this);
        this.lobbyButton?.node.off(Button.EventType.CLICK, this.handleLobby, this);
    }

    show(model: GameErrorModel): void {
        this.model = model;
        const label = this.node.getChildByName('ErrorMessage')?.getComponent(Label);

        if (label) {
            label.string = model.message;
        }

        this.setBusy(false);
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
    }

    hide(): void {
        this.model = undefined;
        this.setBusy(false);
        this.node.active = false;
    }

    private readonly handleRetry = (): void => {
        void this.runAction(this.model?.retry, 'retry');
    };

    private readonly handleLobby = (): void => {
        void this.runAction(this.model?.returnToLobby, 'lobby');
    };

    private async runAction(
        action: (() => Promise<void>) | undefined,
        source: 'retry' | 'lobby',
    ): Promise<void> {
        if (!action || this.busy) {
            return;
        }

        this.setBusy(true, source);

        try {
            await action();
        } catch (error: unknown) {
            console.error('[ErrorView] Recovery action failed.', error);
        } finally {
            if (this.node.active) {
                this.setBusy(false);
            }
        }
    }

    private setBusy(busy: boolean, source?: 'retry' | 'lobby'): void {
        this.busy = busy;

        if (this.retryButton) {
            this.retryButton.interactable = !busy;
        }

        if (this.lobbyButton) {
            this.lobbyButton.interactable = !busy;
        }

        if (this.retryLabel) {
            this.retryLabel.string = busy && source === 'retry' ? '重试中…' : '重试';
        }

        if (this.lobbyLabel) {
            this.lobbyLabel.string = busy && source === 'lobby' ? '返回中…' : '回大厅';
        }
    }
}

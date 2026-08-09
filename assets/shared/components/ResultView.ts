import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    Label,
    Widget,
} from 'cc';
import type {
    ResultPresenter,
    ResultViewModel,
} from '../../runtime/GameRuntime';

const { ccclass } = _decorator;

/** 只展示标准 GameResult 的公共结算层。 */
@ccclass('ResultView')
export class ResultView extends Component implements ResultPresenter {
    private model?: ResultViewModel;
    private buttons: Button[] = [];
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

        this.bindButton('RestartButton', this.handleRestart);
        this.bindButton('LobbyButton', this.handleLobby);
        this.hide();
    }

    protected onDestroy(): void {
        this.unbindButton('RestartButton', this.handleRestart);
        this.unbindButton('LobbyButton', this.handleLobby);
    }

    show(model: ResultViewModel): void {
        this.model = model;
        const message = this.node.getChildByName('ResultMessage')
            ?.getComponent(Label);

        if (message) {
            const seconds = (model.result.duration / 1000).toFixed(1);
            message.string = `得分：${model.result.score}\n用时：${seconds} 秒`;
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

    private readonly handleRestart = (): void => {
        void this.runAction(this.model?.restart);
    };

    private readonly handleLobby = (): void => {
        void this.runAction(this.model?.returnToLobby);
    };

    private bindButton(name: string, handler: () => void): void {
        const button = this.node.getChildByName(name)?.getComponent(Button);

        if (button) {
            this.buttons.push(button);
            button.node.on(Button.EventType.CLICK, handler, this);
        }
    }

    private unbindButton(name: string, handler: () => void): void {
        this.node.getChildByName(name)?.off(Button.EventType.CLICK, handler, this);
    }

    private async runAction(action?: () => Promise<void>): Promise<void> {
        if (!action || this.busy) {
            return;
        }

        this.setBusy(true);

        try {
            await action();
        } catch (error: unknown) {
            console.error('[ResultView] Result action failed.', error);
        } finally {
            if (this.node.active) {
                this.setBusy(false);
            }
        }
    }

    private setBusy(busy: boolean): void {
        this.busy = busy;

        for (const button of this.buttons) {
            button.interactable = !busy;
        }
    }
}

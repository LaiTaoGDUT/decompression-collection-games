import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    Widget,
} from 'cc';
import type {
    PauseMenuModel,
    PausePresenter,
} from '../../runtime/GameRuntime';

const { ccclass } = _decorator;

/** 所有小游戏共用的暂停操作层。 */
@ccclass('PauseView')
export class PauseView extends Component implements PausePresenter {
    private model?: PauseMenuModel;
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

        this.bindButton('ResumeButton', this.handleResume);
        this.bindButton('RestartButton', this.handleRestart);
        this.bindButton('ExitButton', this.handleExit);
        this.hide();
    }

    protected onDestroy(): void {
        this.unbindButton('ResumeButton', this.handleResume);
        this.unbindButton('RestartButton', this.handleRestart);
        this.unbindButton('ExitButton', this.handleExit);
    }

    show(model: PauseMenuModel): void {
        this.model = model;
        this.setBusy(false);
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
    }

    hide(): void {
        this.model = undefined;
        this.setBusy(false);
        this.node.active = false;
    }

    private readonly handleResume = (): void => {
        void this.runAction(this.model?.resume);
    };

    private readonly handleRestart = (): void => {
        void this.runAction(this.model?.restart);
    };

    private readonly handleExit = (): void => {
        void this.runAction(this.model?.exit);
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
            console.error('[PauseView] Pause action failed.', error);
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

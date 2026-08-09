import {
    _decorator,
    BlockInputEvents,
    Component,
    Label,
    Widget,
} from 'cc';
import type { LoadingPresenter } from '../../runtime/GameRuntime';

const { ccclass } = _decorator;

/** 常驻场景切换遮罩；只负责提示文字、显隐和拦截输入。 */
@ccclass('LoadingView')
export class LoadingView extends Component implements LoadingPresenter {
    private messageLabel?: Label;

    protected onLoad(): void {
        this.messageLabel = this.node.getChildByName('LoadingMessage')
            ?.getComponent(Label) ?? undefined;

        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }

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

        this.hide();
    }

    show(message: string): void {
        if (!this.messageLabel) {
            this.messageLabel = this.node.getChildByName('LoadingMessage')
                ?.getComponent(Label) ?? undefined;
        }

        if (this.messageLabel) {
            this.messageLabel.string = message;
            this.messageLabel.node.active = true;
        }

        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
    }

    hide(): void {
        if (this.messageLabel) {
            this.messageLabel.node.active = false;
        }

        this.node.active = false;
    }
}

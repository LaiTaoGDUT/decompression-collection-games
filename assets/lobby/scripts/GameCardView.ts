import { _decorator, Button, Component, Label } from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';

const { ccclass } = _decorator;
export type GameCardClickHandler = (manifest: GameManifest) => void;

/** 将一条游戏清单渲染到卡片；不处理资源加载或点击行为。 */
@ccclass('GameCardView')
export class GameCardView extends Component {
    private manifest?: GameManifest;
    private clickHandler?: GameCardClickHandler;

    protected onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.handleClick, this);
    }

    protected onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.handleClick, this);
    }

    bind(manifest: GameManifest, clickHandler: GameCardClickHandler): void {
        this.manifest = manifest;
        this.clickHandler = clickHandler;
        this.requireLabel('NameLabel').string = manifest.name;
        this.requireLabel('DescriptionLabel').string = manifest.description;
        this.requireLabel('StatusLabel').string = manifest.enabled
            ? '可游玩'
            : '暂不可用';

        const button = this.getComponent(Button);

        if (!button) {
            throw new Error('GameCard is missing Button.');
        }

        button.interactable = manifest.enabled;
        this.node.name = `GameCard-${manifest.id}`;
    }

    private readonly handleClick = (): void => {
        if (this.manifest && this.clickHandler) {
            this.clickHandler(this.manifest);
        }
    };

    private requireLabel(nodeName: string): Label {
        const child = this.node.getChildByName(nodeName);
        const label = child?.getComponent(Label);

        if (!child || !label) {
            throw new Error(`GameCard is missing ${nodeName}.`);
        }

        return label;
    }
}

import { Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { FINISH_X, type MemeRunnerModel } from './MemeRunnerModel';
import { V38_ART } from './MemeRunnerArtV38';
import { runnerLabel, runnerNode, runnerPlate, RUNNER_UI as T } from './MemeRunnerUI';

/** The arch art's blank banner centre and half its width, measured from the painted frame. */
const ARCH = { half: 150, bannerY: 240 };
const CUSTOMER_X = 214, CHEER_TIME = 1.2;

/** The delivery point at the end of the course: the night-market pickup arch the runner stops under,
 * and the customer, another milk-white 咧咧团, who waits with a phone and cheers once the order arrives. */
export class MemeRunnerCustomer {
    readonly root: Node;
    private readonly customer: Sprite;
    private readonly thanks: Node;
    private readonly thanksText: Label;
    private frame = '';

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = runnerNode('DeliveryPoint', parent, 560, 340);
        const arch = this.sprite('PickupArch', 'arch'); arch.node.setPosition(0, 0);
        runnerLabel('PickupTitle', this.root, '收货点', 0, ARCH.bannerY, 150, 34, 26, T.ink);
        this.customer = this.sprite('Customer', 'customer-wait'); this.customer.node.setPosition(CUSTOMER_X, 0);
        this.thanks = runnerPlate(this.root, 'CustomerThanks', 184, 58, frames); this.thanks.setPosition(CUSTOMER_X + 10, 176);
        this.thanksText = runnerLabel('ThanksText', this.thanks, '', 0, 0, 160, 40, 24, T.ink);
        this.thanks.active = false; this.root.active = false;
    }

    render(m: MemeRunnerModel, heroX: number, floor: number, left: number, right: number, endingAge: number): void {
        const x = heroX + FINISH_X - m.x;
        this.root.active = x - ARCH.half < right && x + CUSTOMER_X + 80 > left;
        if (!this.root.active) return;
        this.root.setPosition(x, floor);
        // Waiting with the phone, a cheering hop as the order lands, then hugging the milk tea.
        const cheering = m.delivered, hopping = cheering && endingAge < CHEER_TIME;
        this.setFrame(!cheering ? 'customer-wait' : hopping ? 'customer-cheer' : 'customer-tea');
        this.customer.node.setPosition(CUSTOMER_X, hopping ? Math.abs(Math.sin(endingAge * 8)) * 26 : Math.abs(Math.sin(m.time * 3)) * 3);
        this.thanks.active = cheering && endingAge > .25;
        this.thanksText.string = ['', '总算到了…', '谢谢外卖！', '五星好评！'][m.stars];
        if (this.thanks.active) { const pop = 1 + .25 * Math.max(0, 1 - (endingAge - .25) / .18); this.thanks.setScale(pop, pop, 1); }
    }

    reset(): void { this.root.active = false; this.thanks.active = false; this.frame = ''; }

    dispose(): void {
        for (const sprite of this.root.getComponentsInChildren(Sprite)) sprite.spriteFrame = null;
        this.root.destroy();
    }

    private setFrame(key: string): void {
        if (this.frame === key) return;
        this.frame = key; this.customer.spriteFrame = this.frames[key];
    }
    private sprite(name: string, key: string): Sprite {
        const n = runnerNode(name, this.root, ...V38_ART[key].size); n.getComponent(UITransform)!.setAnchorPoint(.5, 0);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames[key];
        return s;
    }
}

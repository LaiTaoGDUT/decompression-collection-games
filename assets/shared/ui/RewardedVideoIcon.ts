import {
    assetManager,
    Node,
    Label,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
} from 'cc';

/** 统一的激励视频图标位于 resources Bundle，供各小游戏按钮按需读取。 */
export const REWARDED_VIDEO_ICON_PATH = 'ui/rewarded-video-icon-v1/texture';

export function loadRewardedVideoIcon(): Promise<SpriteFrame | undefined> {
    const bundle = assetManager.getBundle('resources');
    if (!bundle) {
        console.warn('[RewardedVideoIcon] resources bundle is unavailable.');
        return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
        bundle.load(
            REWARDED_VIDEO_ICON_PATH,
            Texture2D,
            (error, texture) => {
                if (error || !texture) {
                    console.warn(
                        '[RewardedVideoIcon] Failed to load rewarded video icon.',
                        error ?? 'Asset missing.',
                    );
                    resolve(undefined);
                    return;
                }

                const frame = new SpriteFrame();
                frame.texture = texture;
                resolve(frame);
            },
        );
    });
}

export function attachRewardedVideoIcon(
    parent: Node,
    frame: SpriteFrame | undefined,
    x: number,
    y: number,
    size: number,
): Node | undefined {
    if (!frame) return undefined;

    const node = new Node('RewardedVideoIcon');
    node.layer = parent.layer;
    node.setParent(parent);
    node.setPosition(x, y);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(size, size);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    // Assigning a SpriteFrame may restore the source texture dimensions.
    transform.setContentSize(size, size);
    return node;
}

/** 将广告图标与按钮文案作为一个整体居中，避免图标贴在按钮边缘。 */
export function layoutRewardedVideoIconBeforeLabel(
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
        if (character === ' ') {
            measuredTextWidth += fontSize * 0.35;
        } else if (/^[\u0000-\u00ff]$/.test(character)) {
            measuredTextWidth += fontSize * 0.56;
        } else {
            measuredTextWidth += fontSize;
        }
    }

    const maxTextWidth = Math.max(
        fontSize,
        buttonWidth - iconSize - gap - 28,
    );
    const textWidth = Math.min(
        maxTextWidth,
        Math.max(fontSize, measuredTextWidth),
    );
    const totalWidth = iconSize + gap + textWidth;
    const centerY = label.node.position.y;

    labelTransform.setContentSize(textWidth, labelTransform.contentSize.height);
    label.node.setPosition((iconSize + gap) / 2, centerY);
    icon.setPosition(
        -totalWidth / 2 + iconSize / 2,
        centerY,
    );
}

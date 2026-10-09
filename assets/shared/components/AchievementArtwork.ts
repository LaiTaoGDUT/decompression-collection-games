import { Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite, UITransform, VerticalTextAlignment } from 'cc';
import type { AchievementArtService, AchievementArtKey } from '../../services/achievements/AchievementArtService';
import type { AchievementDefinition, GameManifest } from '../../runtime/GameManifest';
import { setLabelBold } from '../../services/font/FontBinding';

/** 星光珍藏馆 v10 冻结色板：纸白展廊、梅紫文字、暖金描边，每座奖杯另用自己的主题色点缀。 */
export const ACHIEVEMENT_COLORS = {
    ink: '#4A3A58', muted: '#8C7F96', paper: '#FFF9EE', card: '#FFFDF8', gold: '#E9BE6A', goldDeep: '#B7863A',
    goldLight: '#FFE7AE', dark: '#1B1B36', unlocked: '#5E9C7E', lockedTint: '#EFEAF2',
};

export type AchievementTextAlign = 'left' | 'center' | 'right';

/** 中文界面以北京时间展示固定的首次获得时间，重播不会重新计算时间。 */
export function formatAchievementObtainedAt(timestamp: number): string {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    const two = (value: number): string => ('0' + value).slice(-2);
    return `${date.getUTCFullYear()}.${two(date.getUTCMonth() + 1)}.${two(date.getUTCDate())} `
        + `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`;
}

/** 珍藏编号按清单中带成就的游戏顺序固定，不随获得先后变化。 */
export function achievementSerial(manifests: readonly GameManifest[], manifest: GameManifest): string {
    const collection = manifests.filter(game => !!game.achievement);
    const two = (value: number): string => ('0' + value).slice(-2);
    return `No.${two(Math.max(0, collection.indexOf(manifest)) + 1)} / ${two(collection.length)}`;
}

export function hexColor(hex: string, alpha = 255): Color {
    const color = Color.fromHEX(new Color(), hex);
    color.a = alpha;
    return color;
}

/** 与白色按比例混合，用于从奖杯主题色派生浅色底。 */
export function tintColor(hex: string, whiteRatio: number, alpha = 255): Color {
    const base = Color.fromHEX(new Color(), hex);
    const mix = (value: number): number => Math.round(value + (255 - value) * whiteRatio);
    return new Color(mix(base.r), mix(base.g), mix(base.b), alpha);
}

/** 与黑色按比例混合，用于主题色上的深色文字。 */
export function shadeColor(hex: string, blackRatio: number, alpha = 255): Color {
    const base = Color.fromHEX(new Color(), hex);
    const mix = (value: number): number => Math.round(value * (1 - blackRatio));
    return new Color(mix(base.r), mix(base.g), mix(base.b), alpha);
}

export function achievementNode(parent: Node, name: string, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
}

export function achievementLabel(parent: Node, name: string, text: string, x: number, y: number,
    width: number, height: number, size: number, color: string | Color = ACHIEVEMENT_COLORS.ink, bold = false,
    align: AchievementTextAlign = 'center'): Label {
    const node = achievementNode(parent, name, width, height);
    node.setPosition(x, y);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.3;
    label.color = typeof color === 'string' ? hexColor(color) : color;
    label.horizontalAlign = align === 'left' ? HorizontalTextAlignment.LEFT
        : align === 'right' ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    setLabelBold(label, bold);
    return label;
}

/** 在已有 Graphics 上叠画圆角矩形；坐标以节点中心为原点。 */
export function fillRoundRect(g: Graphics, x: number, y: number, width: number, height: number,
    radius: number, color: Color): void {
    g.fillColor = color;
    g.roundRect(x - width / 2, y - height / 2, width, height, Math.min(radius, width / 2, height / 2));
    g.fill();
}

export function strokeRoundRect(g: Graphics, x: number, y: number, width: number, height: number,
    radius: number, color: Color, lineWidth: number): void {
    g.strokeColor = color;
    g.lineWidth = lineWidth;
    g.roundRect(x - width / 2, y - height / 2, width, height, Math.min(radius, width / 2, height / 2));
    g.stroke();
}

export function achievementPanel(parent: Node, name: string, width: number, height: number,
    color: string | Color, radius = 24): Node {
    const node = achievementNode(parent, name, width, height);
    fillRoundRect(node.addComponent(Graphics), 0, 0, width, height, radius,
        typeof color === 'string' ? hexColor(color) : color);
    return node;
}

export function makeAchievementButton(node: Node, action: () => void, zoomScale = 0.95): Button {
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = zoomScale;
    node.on(Button.EventType.CLICK, action);
    return button;
}

/** 立体胶囊按钮：底部深色厚边 + 亮面，文字居中。 */
export function achievementButton(parent: Node, name: string, text: string, width: number,
    height: number, action: () => void, face: string, textColor: string | Color = ACHIEVEMENT_COLORS.ink,
    fontSize = Math.round(height * 0.42)): Node {
    const node = achievementNode(parent, name, width, height);
    const g = node.addComponent(Graphics);
    const lip = Math.max(3, Math.round(height * 0.08));
    fillRoundRect(g, 0, -lip / 2, width, height - lip, (height - lip) / 2, shadeColor(face, 0.22));
    fillRoundRect(g, 0, lip / 2, width, height - lip, (height - lip) / 2, hexColor(face));
    makeAchievementButton(node, action);
    achievementLabel(node, 'Caption', text, 0, lip / 2, width - height * 0.5, height - lip - 6, fontSize,
        textColor, true);
    return node;
}

/** 成就所属游戏的彩色小标签。 */
export function achievementChip(parent: Node, name: string, text: string, color: string, height = 34,
    fontSize = 19, width = Math.max(96, text.length * fontSize + 34)): Node {
    const chip = achievementNode(parent, name, width, height);
    fillRoundRect(chip.addComponent(Graphics), 0, 0, width, height, height / 2, tintColor(color, 0.78));
    achievementLabel(chip, 'Text', text, 0, 0, width - 16, height - 4, fontSize, shadeColor(color, 0.45), true);
    return chip;
}

/** 图片是正式奖杯；主题名只选择公共美术，不引用具体游戏资源。未获得时使用灰度失色雕塑，仅轻微透明。 */
export function createAchievementTrophy(parent: Node, definition: AchievementDefinition,
    art: AchievementArtService, locked = false, size = 240): Node {
    const root = createAchievementImage(parent, `Trophy-${definition.trophy}`, `trophy-${definition.trophy}`,
        size, size, art);
    if (locked) {
        const sprite = root.getComponent(Sprite)!;
        sprite.grayscale = true;
        sprite.color = new Color(255, 255, 255, 220);
    }
    return root;
}

export function createAchievementImage(parent: Node, name: string, key: AchievementArtKey,
    width: number, height: number, art: AchievementArtService, fit: 'contain' | 'cover' = 'contain'): Node {
    const node = achievementNode(parent, name, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    art.bind(sprite, key, width, height, fit);
    return node;
}

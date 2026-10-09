import { _decorator, Component, Font, Label } from 'cc';

const { ccclass, property } = _decorator;

export interface AppFontPalette {
    readonly regular: Font;
    readonly bold: Font;
    readonly characters: ReadonlySet<number>;
}

interface OriginalFont {
    readonly font: Font | null;
    readonly useSystemFont: boolean;
    readonly family: string;
}

/** 公共字体绑定；仅由 FontService 注入资源，不自行加载或访问全局对象。 */
@ccclass('FontBinding')
export class FontBinding extends Component {
    /** 昵称、特殊符号或独立视觉主题可显式退出全局字体。 */
    @property
    systemFontOnly = false;

    private label?: Label;
    private palette?: AppFontPalette;
    private original?: OriginalFont;
    private bold?: boolean;
    private lastText?: string;
    private lastBold?: boolean;
    private lastSystemOnly?: boolean;
    private appliedFont?: Font;

    get isBound(): boolean { return !!this.palette; }

    bind(label: Label, palette: AppFontPalette): void {
        this.label = label;
        this.palette = palette;
        this.lastText = undefined;
        this.enabled = true;
        // 动态节点的 string/fontFamily/isBold 常在 addComponent 之后设置，
        // 首次快照放到 lateUpdate，避免捕获构造中的半成品。
    }

    setBold(value: boolean): void {
        this.bold = value;
        const label = this.label;
        if (label?.isValid && (!this.original
            || (label.font && label.font !== this.palette?.regular && label.font !== this.palette?.bold))) {
            label.isBold = value;
        }
        if (this.original) this.refresh();
    }

    unbind(): void {
        const label = this.label;
        if (label?.isValid && this.original) this.restore(label);
        this.palette = undefined;
        this.bold = undefined;
        this.original = undefined;
        this.appliedFont = undefined;
        this.lastText = undefined;
        this.label = undefined;
        this.enabled = false;
    }

    protected lateUpdate(): void {
        this.refresh();
    }

    protected onDestroy(): void {
        this.unbind();
    }

    private refresh(): void {
        const label = this.label;
        const palette = this.palette;
        if (!label?.isValid || !palette) return;
        if (!this.original) {
            this.original = {
                font: label.font,
                useSystemFont: label.useSystemFont,
                family: label.fontFamily,
            };
            this.bold ??= label.isBold;
        }
        // 保留小游戏自己的 TTF/位图字体，不能把它们替换成公共字体。
        if (this.original.font && !this.original.useSystemFont) return;
        if (label.font && label.font !== palette.regular && label.font !== palette.bold) {
            this.original = { font: label.font, useSystemFont: label.useSystemFont, family: label.fontFamily };
            this.appliedFont = undefined;
            return;
        }
        const bold = this.bold === true;
        if (this.lastText === label.string && this.lastBold === bold
            && this.lastSystemOnly === this.systemFontOnly
            && (!this.appliedFont || label.font === this.appliedFont)) return;
        this.lastText = label.string;
        this.lastBold = bold;
        this.lastSystemOnly = this.systemFontOnly;
        let supported = !this.systemFontOnly;
        for (const character of label.string) {
            const code = character.codePointAt(0)!;
            if (code === 9 || code === 10 || code === 13) continue;
            if (!palette.characters.has(code)) { supported = false; break; }
        }
        if (!supported) {
            this.restore(label);
            this.appliedFont = undefined;
            return;
        }
        const font = bold ? palette.bold : palette.regular;
        if (label.font !== font) label.font = font;
        if (label.useSystemFont) label.useSystemFont = false;
        // 使用真正的 Bold 字体，不再叠加 Canvas 合成加粗。
        if (label.isBold) label.isBold = false;
        this.appliedFont = font;
    }

    private restore(label: Label): void {
        const original = this.original!;
        label.font = original.font;
        label.fontFamily = original.family;
        label.useSystemFont = original.useSystemFont;
        label.isBold = this.bold === true;
    }
}

/** 表达文字语义字重：关闭字体功能时仍保持原有系统字体加粗行为。 */
export function setLabelBold(label: Label, bold: boolean): void {
    const binding = label.node.getComponent(FontBinding);
    if (binding?.isBound) binding.setBold(bold);
    else label.isBold = bold;
}

import { _decorator, Component, Font, Label, Node } from 'cc';
const { ccclass } = _decorator;
/** Fonts belong to this game session and are released with its bundle. */
@ccclass('CubeAwayTypography')
export class CubeAwayTypography extends Component {
    regular?: Font;
    bold?: Font;
}
export function applyCubeFont(label: Label, bold: boolean): void {
    for (let n: Node | null = label.node; n; n = n.parent) {
        const typography = n.getComponent(CubeAwayTypography);
        if (!typography) continue;
        const font = bold ? typography.bold : typography.regular;
        if (font) { label.font = font; label.useSystemFont = false; label.isBold = false; }
        return;
    }
}

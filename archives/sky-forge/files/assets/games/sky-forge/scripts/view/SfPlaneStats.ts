import { Graphics, Label, Node } from 'cc';
import { MAX_PLANE_LEVEL, heartsForLevel } from '../core/SfBalance';
import { PLANE_BY_ID } from '../core/SfPlaneDefs';
import type { SfProgress } from '../core/SfProgress';
import type { PlaneId } from '../core/SfTypes';
import { COLORS, color, node, num, text, type UiContext } from './SfUi';

const SEGMENTS = 10;
type StatsLayout = 'inline' | 'rows';

/**
 * tidal-wings 式机体数值条（机库与机体详情共用）：图标、名称、右侧读数和横向分段格。
 * 机库并排展示两项数值；详情页让火力、装甲各占一行，保留同款数值条。
 * 火力按满级战斗力换算成 10 格，装甲每点生命一格（上限为满级生命）。
 */
export class SfPlaneStats {
    readonly root: Node;
    private readonly g: Graphics;
    private readonly power: Label;
    private readonly armor: Label;

    constructor(ui: UiContext, parent: Node, x: number, y: number, private readonly width = 640, private readonly layout: StatsLayout = 'inline') {
        this.root = node(parent, 'PlaneStats', 0, 0, x, y);
        this.g = this.root.addComponent(Graphics);
        const rows = layout === 'rows';
        text(ui, this.root, '火力', -width / 2 + 34, rows ? 36 : 0, { size: 24, color: COLORS.cream, align: 'left' });
        this.power = num(ui, this.root, '', rows ? width / 2 : -18, rows ? 36 : 0, { size: 24, color: '#FF8A7A', align: 'right' });
        text(ui, this.root, '装甲', rows ? -width / 2 + 34 : 18 + 34, rows ? -54 : 0, { size: 24, color: COLORS.cream, align: 'left' });
        this.armor = num(ui, this.root, '', width / 2, rows ? -54 : 0, { size: 24, color: COLORS.foam, align: 'right' });
    }

    /** fill：0～1 的点亮进度（详情页入场时逐格点亮）。 */
    show(progress: SfProgress, id: PlaneId, owned: boolean, fill = 1): void {
        const def = PLANE_BY_ID[id];
        const power = progress.power(id);
        const hearts = progress.hearts(id);
        const maxHearts = heartsForLevel(MAX_PLANE_LEVEL, def.baseHearts);
        const powerLit = Math.max(1, Math.round(power / progress.maxPower() * SEGMENTS));
        this.power.string = String(power);
        this.armor.string = String(hearts);
        const rows = this.layout === 'rows';
        const g = this.g, w = this.width, barWidth = rows ? w : w / 2 - 18;
        g.clear();
        // 图标：火力为红色十字，装甲为青色盾形。
        const ix = -w / 2 + 12, jx = rows ? ix : 18 + 12;
        const iy = rows ? 36 : 0, jy = rows ? -54 : 0;
        g.fillColor = color('#FF5A4A');
        g.rect(ix - 9, iy - 3, 18, 6);
        g.rect(ix - 3, iy - 9, 6, 18);
        g.fill();
        g.fillColor = color('#5ADCFF');
        g.moveTo(jx - 9, jy + 9); g.lineTo(jx + 9, jy + 9); g.lineTo(jx + 9, jy - 1); g.lineTo(jx, jy - 10); g.lineTo(jx - 9, jy - 1); g.close();
        g.fill();
        const bar = (x0: number, y: number, total: number, litAll: number, tone: string) => {
            const lit = Math.round(litAll * fill);
            const seg = barWidth / total;
            for (let i = 0; i < total; i++) {
                const x = x0 + i * seg;
                const sw = seg - 3, sh = 14;
                g.fillColor = color(COLORS.ink, 220);
                g.rect(x, y, sw, sh);
                g.fill();
                g.fillColor = color(i < lit && owned ? tone : '#2A4A5E');
                g.rect(x + 1, y + 1, sw - 2, sh - 2);
                g.fill();
            }
        };
        bar(-w / 2, iy - 34, SEGMENTS, powerLit, '#FF6A5A');
        bar(rows ? -w / 2 : 18, jy - 34, maxHearts, hearts, '#5ADCFF');
    }
}

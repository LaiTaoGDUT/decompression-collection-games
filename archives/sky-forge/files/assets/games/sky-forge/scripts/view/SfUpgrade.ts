import { Node } from 'cc';
import type { PlaneDef } from '../core/SfPlaneDefs';
import {
    MAX_PART_LEVEL, MAX_PLANE_LEVEL, SLOTS, UPGRADE_REFUND_PERCENT, heartsForLevel, partLevelMultiplier, planeLevelMultiplier, type SlotId,
} from '../core/SfBalance';
import type { SfShell } from './SfShell';
import {
    COLORS, blocker, button, easeOutBack, formatNumber, node, num, panel, pixelSprite, sheetIn, sheetOut, size, sprite, text,
} from './SfUi';

const SLOT_COLOR: Record<SlotId, string> = { main: '#FF6A5A', wing: '#5AB4FF', special: '#6AE07A' };
const SLOT_NAME: Record<SlotId, string> = { main: '主炮', wing: '翼炮', special: '特装' };

/**
 * 改装弹窗：机体与三个零件的升级，以及还原全部强化并返还金币。
 * onChange 在每次升级或还原后调用（宿主刷新显示）；onClose 在开始关闭时调用。
 */
export function openUpgradeSheet(shell: SfShell, parent: Node, p: PlaneDef, onChange: () => void, onClose: () => void): Node {
    const ui = shell.ui;
    const sheet = node(parent, 'UpgradeSheet', shell.width, shell.height);
    let open = true;
    let confirmation: Node | undefined;
    blocker(sheet, shell.width, shell.height, 200);
    const fit = Math.min(1, shell.width / 750, (shell.safeTop - shell.safeBottom) / 1160);
    const holder = node(sheet, 'Holder', 0, 0, 0, (shell.safeTop + shell.safeBottom) / 2);
    holder.setScale(fit, fit, 1);
    const card = panel(holder, 700, 1080, 0, 0, { corners: true, accent: COLORS.foam });
    const close = () => { if (!open || confirmation) return; open = false; onClose(); sheetOut(shell.tweens, sheet, holder); };
    text(ui, card, '改装', -320, 496, { size: 40, color: COLORS.cream, align: 'left' });
    text(ui, card, p.name, -220, 492, { size: 30, color: COLORS.foam, align: 'left' });
    button(ui, card, { w: 70, h: 64, x: 300, y: 494, skin: 'red', label: '✕', size: 30, sound: 'back', onTap: close });
    const goldBox = panel(card, 260, 60, -190, 420);
    pixelSprite(ui, goldBox, 'icon/coin', 0.8, -96, 0, 'Coin');
    const goldLabel = num(ui, goldBox, '', 110, 0, { size: 48, color: COLORS.gold, align: 'right' });
    text(ui, card, '战力', 120, 420, { size: 24, color: COLORS.foam, align: 'right' });
    const power = num(ui, card, '', 136, 420, { size: 48, color: COLORS.gold, align: 'left' });
    const rows: (() => void)[] = [];
    const addRow = (y: number, icon: string, tone: string, title: string,
        read: () => { level: number; max: number; detail: string; cost: number | null }, buy: () => boolean) => {
        const row = panel(card, 650, 160, 0, y, { border: tone, borderAlpha: 150, skew: 10 });
        const f = ui.frame(icon);
        const iconSprite = sprite(ui, row, icon, 10, 10, -262, 0, 'Icon');
        if (f) { const k = Math.min(90 / f.originalSize.width, 90 / f.originalSize.height); size(iconSprite.node, f.originalSize.width * k, f.originalSize.height * k); }
        text(ui, row, title, -200, 44, { size: 26, color: COLORS.cream, align: 'left' });
        const lv = num(ui, row, '', 110, 44, { size: 24, color: tone, align: 'right' });
        const detail = text(ui, row, '', -200, -22, { size: 22, color: '#C9E6F0', align: 'left', width: 330, wrap: true, bold: false });
        const btn = button(ui, row, {
            w: 160, h: 92, x: 222, y: 0, skin: 'gold', label: '', size: 30, sound: 'confirm',
            onTap: () => {
                if (!open || confirmation || !buy()) return;
                shell.sfx('ui-upgrade');
                shell.save();
                shell.tweens.add(0.35, k => { if (lv.isValid) { const s = 1.3 - 0.3 * k; lv.node.setScale(s, s, 1); } }, { ease: easeOutBack });
                rows.forEach(r => r());
                onChange();
            },
        });
        rows.push(() => {
            const r = read();
            lv.string = `${r.level}/${r.max}`;
            detail.string = r.detail;
            btn.setPrice(r.cost);
            btn.setLabel(r.cost === null ? '已满级' : '');
            btn.setEnabled(r.cost !== null && shell.progress.data.gold >= r.cost);
        });
    };
    const progress = shell.progress;
    addRow(266, `plane/${p.id}/body`, COLORS.gold, '机体', () => {
        const s = progress.plane(p.id);
        const nextHearts = heartsForLevel(Math.min(MAX_PLANE_LEVEL, s.level + 1), p.baseHearts) > heartsForLevel(s.level, p.baseHearts);
        return {
            level: s.level, max: MAX_PLANE_LEVEL, cost: progress.planeCost(p.id),
            detail: `全部伤害 ×${planeLevelMultiplier(s.level).toFixed(2)}${nextHearts ? '\n下一级：装甲 +1' : ''}`,
        };
    }, () => progress.upgradePlane(p.id));
    SLOTS.forEach((slot, i) => {
        addRow(92 - i * 178, `plane/${p.id}/${slot}-3`, SLOT_COLOR[slot], `${SLOT_NAME[slot]} · ${p.slots[slot].name}`, () => {
            const level = progress.plane(p.id).parts[slot];
            const next = [4, 7, 10].find(l => l > level);
            const featureIndex = next ? [4, 7, 10].indexOf(next) : -1;
            return {
                level, max: MAX_PART_LEVEL, cost: progress.partCost(p.id, slot),
                detail: `伤害 ×${partLevelMultiplier(level).toFixed(2)}${next ? `\nLv${next}：${p.features[slot][featureIndex]}` : '\n全部特性已解锁'}`,
            };
        }, () => progress.upgradePart(p.id, slot));
    });
    text(ui, card, `还原返还 ${UPGRADE_REFUND_PERCENT}% 强化金币`, 0, -374, { size: 24, color: COLORS.foam });
    const reset = button(ui, card, {
        w: 300, h: 88, x: -160, y: -452, skin: 'dark', label: '还原强化', size: 30,
        onTap: () => {
            if (!open || confirmation) return;
            const refund = progress.resetRefund(p.id);
            if (refund === null) return;
            const layer = node(sheet, 'ResetConfirm', shell.width, shell.height);
            confirmation = layer;
            let pending = true;
            blocker(layer, shell.width, shell.height, 210);
            const confirmHolder = node(layer, 'Holder', 0, 0, 0, (shell.safeTop + shell.safeBottom) / 2);
            const confirmFit = Math.min(1, shell.width / 750, (shell.safeTop - shell.safeBottom) / 620);
            confirmHolder.setScale(confirmFit, confirmFit, 1);
            const confirmCard = panel(confirmHolder, 640, 500, 0, 0, { corners: true, accent: COLORS.gold });
            const dismiss = () => {
                if (!pending) return;
                pending = false;
                sheetOut(shell.tweens, layer, confirmHolder, () => { confirmation = undefined; });
            };
            text(ui, confirmCard, '还原强化', 0, 190, { size: 40, color: COLORS.cream });
            text(ui, confirmCard, p.name, 0, 130, { size: 30, color: COLORS.foam });
            text(ui, confirmCard, '机体、主炮、翼炮和特装将回到 Lv1', 0, 70, { size: 24, color: COLORS.cream });
            text(ui, confirmCard, `返还 ${UPGRADE_REFUND_PERCENT}% 强化金币`, 0, 20, { size: 24, color: COLORS.foam });
            pixelSprite(ui, confirmCard, 'icon/coin', 1, -160, -46, 'RefundCoin');
            num(ui, confirmCard, String(refund), 20, -46, { size: 56, color: COLORS.gold });
            button(ui, confirmCard, { w: 270, h: 88, x: -154, y: -168, skin: 'dark', label: '取消', size: 30, sound: 'back', onTap: dismiss });
            button(ui, confirmCard, {
                w: 270, h: 88, x: 154, y: -168, skin: 'gold', label: '确认还原', size: 30, sound: 'confirm',
                onTap: () => {
                    if (!open || !pending) return;
                    const returned = progress.resetPlane(p.id);
                    dismiss();
                    if (returned === null) return;
                    shell.save();
                    shell.sfx('coin-big');
                    rows.forEach(r => r());
                    onChange();
                    shell.toast(`已还原强化，返还 ${returned} 金币`);
                },
            });
            sheetIn(shell.tweens, layer, confirmHolder);
        },
    });
    text(ui, card, '可返还金币', 166, -426, { size: 22, color: COLORS.foam });
    const refundLabel = num(ui, card, '', 166, -472, { size: 34, color: COLORS.gold });
    rows.push(() => {
        goldLabel.string = formatNumber(progress.data.gold);
        power.string = String(progress.power(p.id));
        const refund = progress.resetRefund(p.id);
        refundLabel.string = String(refund ?? 0);
        reset.setEnabled(refund !== null);
    });
    rows.forEach(r => r());
    sheetIn(shell.tweens, sheet, holder);
    return sheet;
}

import { Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { SLING_ART } from './SlingPuckArt';
import { SLING_HUD, type SlingPuckLayout } from './SlingPuckLayout';
import { SIDES, SLING_WORLD as W, type Side, type SlingPuckModel } from './SlingPuckModel';
import { project } from './SlingPuckProjection';
import { SLING_THEME as T } from './SlingPuckTheme';
import { color, easeOutBack, type SlingPuckUi } from './SlingPuckUi';
export type SlingMode = 'cpu' | 'local';
interface TeamBar {
    root: Node; medal: Sprite; puckIcon: Node; name: Label; count: Label; shownCount: number; timer: Node; time: Label;
    pause: Node; power: Node; track: Graphics; value: Label; hint: Label; botStatus: Label;
    notice: string; noticeColor: string; noticeTime: number;
}
const SHOT_HINTS = { notPulling: '拉到弹力带后方', weak: '再向后拉一点', blocked: '冰球挡住了，换个位置', cooldown: '出手太快了，稍等一下' };

/** All status, input feedback and power live outside the board. Only the countdown covers the ice. */
export class SlingPuckHud {
    readonly root: Node;
    private readonly bars: Record<Side, TeamBar>;
    private readonly messages: Node;
    private readonly shade: Node;
    private readonly badges: Node[] = [];
    private mode: SlingMode = 'cpu';
    private layout?: SlingPuckLayout;
    private opponentStatus = '';
    private opponentName = '';
    private startBadgeTime = 0;
    private currentBadge = '';
    constructor(private readonly ui: SlingPuckUi, parent: Node, onPause: () => void) {
        this.root = ui.make('SlingHUD', parent);
        this.bars = { south: this.buildBar('south', onPause), north: this.buildBar('north', onPause) };
        this.messages = ui.make('Messages', this.root);
        this.shade = ui.make('CountdownShade', this.messages);
        for (const [name, frame, layer] of [['BoardShade','board',SLING_ART.board],['NearShade','nearRail',SLING_ART.nearRail]] as const) {
            ui.sprite(name,this.shade,frame,layer.width,layer.height,'#071B2B',32).node.setPosition(layer.x,layer.y);
        }
        this.shade.active = false;
    }
    configure(mode: SlingMode, _botName: string, botLevel: string): void {
        this.mode = mode;
        this.opponentName = `AI · ${botLevel}`;
        const north = this.bars.north, south = this.bars.south;
        north.root.angle = mode === 'local' ? 180 : 0;
        north.medal.spriteFrame = this.ui.frame(mode === 'cpu' ? 'medalBot' : 'medalNorth');
        for (const side of SIDES) {
            const bar = this.bars[side], human = side === 'south' || mode === 'local';
            bar.notice = ''; bar.noticeTime = 0;
            bar.power.active = human; bar.hint.node.active = human; bar.name.node.active = !human;
            bar.botStatus.node.active = false; bar.pause.active = human;
            bar.root.getComponent(UITransform)!.setContentSize(SLING_HUD.barWidth,human?SLING_HUD.barHeight:SLING_HUD.opponentHeight);
            bar.medal.node.setPosition(human?-238:-303,human?24:0);
            bar.medal.node.getComponent(UITransform)!.setContentSize(human?76:88,human?76:88);
            bar.puckIcon.setPosition(human?-181:-218,human?24:0);
            bar.count.node.setPosition(human?-133:-165,human?24:0);
            bar.name.node.setPosition(-8,0);
            bar.timer.active = mode === 'local' || !human;
            bar.timer.setPosition(mode==='local'?-248:238,mode==='local'?-36:0);
        }
        north.name.string = this.opponentName;
        this.clearMessages();
    }
    place(layout: SlingPuckLayout): void {
        this.layout = layout;
        for (const side of SIDES) {
            this.bars[side].root.setPosition(layout.boardX, side === 'south' ? layout.bottomBarY : layout.topBarY);
            this.bars[side].root.setScale(layout.hudScale, layout.hudScale, 1);
        }
        this.shade.setPosition(layout.boardX,layout.boardY);this.shade.setScale(layout.scale,layout.scale,1);
        if (this.currentBadge) this.rebuildBadge();
    }
    setOpponentStatus(status: string): void { this.opponentStatus = status; }
    sync(model: SlingPuckModel, dt = 0): void {
        const seconds = Math.max(0, Math.ceil(model.timeLeft)), urgent = seconds <= 10 && model.phase === 'play';
        for (const side of SIDES) {
            const bar = this.bars[side], count = model.count(side), human = side === 'south' || this.mode === 'local';
            if (count !== bar.shownCount) {
                if (count === 1 && bar.shownCount > 1) {
                    if (human) this.notify(side, '最后一枚！', T.brass, 2);
                    else this.notify('south', 'AI 只剩最后一枚！', T.coral, 2);
                }
                bar.shownCount = count; bar.count.string = String(count);
            }
            bar.time.string = `${Math.floor(seconds / 60)}:${seconds % 60 < 10 ? '0' : ''}${seconds % 60}`;
            bar.time.color = color(urgent ? T.coral : model.suddenDeath ? T.brass : T.white);
            const feedback = model.shotFeedback(side), percent = Math.round(feedback.power * 100);
            this.drawPower(bar.track, feedback.power, feedback.mode === 'pull' && !feedback.valid);
            bar.value.string = `力度 ${percent}%`; bar.value.color = color(feedback.power > .9 ? T.brass : T.white);
            if (!human) bar.name.string = model.phase==='countdown'||!this.opponentStatus||this.opponentStatus.indexOf('AI ·')===0
                ? this.opponentName : this.opponentStatus;
            bar.botStatus.string = model.phase === 'countdown' ? '等待开局' : this.opponentStatus.indexOf('AI ·') === 0 ? '观察球局' : this.opponentStatus || '观察球局';
            bar.noticeTime = Math.max(0, bar.noticeTime - dt);
            let hint = model.phase === 'countdown' ? '先清空己方半场者胜'
                : !human ? ''
                : feedback.mode === 'idle' ? '按住己方冰球，向后拉弓'
                : feedback.mode === 'hold' ? '压上弹力带，向后拉'
                : feedback.valid ? '松手发射' : SHOT_HINTS[feedback.reason ?? 'weak'];
            if (model.phase === 'roundEnd' || model.phase === 'matchEnd') hint = model.winner ? model.winner === side ? '已获胜' : '对手获胜' : '平局';
            bar.hint.string = bar.noticeTime > 0 ? bar.notice : hint;
            bar.hint.color = color(bar.noticeTime > 0 ? bar.noticeColor : feedback.mode === 'pull' && feedback.valid ? T.teal : T.muted);
        }
        if (model.phase === 'roundEnd' || model.phase === 'matchEnd') { this.startBadgeTime = 0; this.clearBadge(); }
        if (model.phase === 'play' && this.startBadgeTime > 0) {
            this.startBadgeTime = Math.max(0, this.startBadgeTime - dt);
            if (this.startBadgeTime === 0) this.clearBadge();
        } else if (model.phase !== 'countdown' && this.startBadgeTime <= 0) this.clearBadge();
        this.shade.active = model.phase === 'countdown' || this.startBadgeTime > 0;
    }
    resetCounts(): void { for (const side of SIDES) this.bars[side].shownCount = -1; }
    notify(side: Side, text: string, tint: string = T.white, seconds = 1.8): void {
        const bar = this.bars[side]; bar.notice = text; bar.noticeColor = tint; bar.noticeTime = seconds;
    }
    /** Stable dark medallion persists for the full count; pause cannot fade the number away. */
    countdown(text: string, _tint: string = T.white, _size = 132): void {
        this.currentBadge = text; this.startBadgeTime = text === '开始' ? .65 : 0; this.rebuildBadge();
    }
    private rebuildBadge(): void {
        if (!this.layout) return;
        const text = this.currentBadge; this.destroyBadges();
        for (const side of this.mode === 'local' ? SIDES : ['south'] as Side[]) {
            const node = this.ui.make(`CountdownBadge-${side}`, this.messages, 360, 360);
            const center = this.toScreen(0, this.mode === 'local' ? (side === 'south' ? -1 : 1) * W.halfLength * .46 : 0);
            node.setPosition(center.x, center.y); node.angle = side === 'north' ? 180 : 0;
            node.setScale(this.layout.scale, this.layout.scale, 1);
            this.ui.sprite('Medallion',node,'countdownMedal',360,360);
            const g = this.ui.make('Rim',node,360,360).addComponent(Graphics);
            g.strokeColor = color(T.teal,35);g.lineWidth=12;g.circle(0,0,169);g.stroke();
            g.strokeColor = color('#74F0FF'); g.lineWidth = 4; g.circle(0, 0, 169); g.stroke();
            g.strokeColor = color('#F1FDFF'); g.lineWidth = 2; g.arc(0, 0, 170, Math.PI * .12, Math.PI * 1.15, false); g.stroke();
            this.ui.label('BadgeCaption', node, text === '开始' ? '实时对战' : text === '准备' ? '双方就位' : '准备', 0, 105, 260, 50, { size: 38, color: T.white });
            this.ui.label('BadgeValue', node, text, 0, -24, 300, 228, { size: text.length > 1 ? 86 : 202, color: T.white, shadow:true });
            this.ui.animate(.18, t => { const k = this.layout!.scale * (.92 + easeOutBack(t) * .08); node.setScale(k, k, 1); }, node);
            this.badges.push(node);
        }
    }
    banner(text: string, frame: 'bannerSouth' | 'bannerNorth' | 'bannerGold', sub = '', duration = 1.5, facing?: Side): void {
        const tint = frame === 'bannerGold' ? T.brass : frame === 'bannerNorth' ? T.coral : T.white;
        const message = sub ? `${text} · ${sub}` : text;
        for (const side of facing ? [facing] : this.mode === 'local' ? SIDES : ['south'] as Side[]) this.notify(side, message, tint, duration);
    }
    callout(text: string, tint: string, _x: number, from: Side): void { this.notify(from, text, tint, 1); }
    private destroyBadges(): void { for (const node of this.badges) { this.ui.stop(node); node.destroy(); } this.badges.length = 0; }
    private clearBadge(): void { if (!this.currentBadge && !this.badges.length) return; this.destroyBadges(); this.currentBadge = ''; }
    clearMessages(): void { this.clearBadge(); this.startBadgeTime = 0; this.shade.active = false; }
    setPauseVisible(visible: boolean): void {
        this.bars.south.pause.active = visible; this.bars.north.pause.active = visible && this.mode === 'local';
    }
    private drawPower(g: Graphics, power: number, invalid: boolean): void {
        g.clear(); const width = 250, height = 32, left = -width / 2;
        g.fillColor = color('#091C2E'); g.roundRect(left, -height / 2, width, height, 12); g.fill();
        g.strokeColor = color('#4D718E', 180); g.lineWidth = 1.5; g.roundRect(left, -height / 2, width, height, 12); g.stroke();
        for (let i = 0; i < 20; i++) {
            const active = power * 20 > i;
            g.fillColor = color(active ? invalid ? T.coral : i >= 16 ? T.brass : T.teal : '#23435D');
            g.roundRect(left + 5 + i * 12.05, -11, 9.5, 22, 2); g.fill();
        }
    }
    private buildBar(side: Side, onPause: () => void): TeamBar {
        const ui = this.ui, root = ui.make(`Bar-${side}`, this.root, SLING_HUD.barWidth, SLING_HUD.barHeight);
        const pause = ui.roundButton(side === 'south' ? 'SlingPause' : 'SlingPauseNorth', root, 'pause', 72, onPause); pause.setPosition(-320, 24);
        const medal = ui.sprite('Medal', root, side === 'south' ? 'medalSouth' : 'medalNorth', 76, 76); medal.node.setPosition(-238, 24);
        const puckIcon=ui.sprite('PuckIcon', root, side==='south'?'puckIvory':'puck', 38, 40).node;
        const count = ui.label('Value', root, '5', -133, 24, 52, 54, { size: 42, color: T.white });
        const name = ui.label('Name', root, '', -8, 0, 220, 44, { size: 28, color: T.white });
        const timer = ui.make('Timer', root, 160, 52); timer.setPosition(233, 44);
        const clock = ui.make('Clock', timer, 32, 32).addComponent(Graphics); clock.node.setPosition(-62, 0); ui.drawIcon(clock, 'clock', T.white, .6);
        const time = ui.label('Time', timer, '3:00', 17, 0, 113, 48, { size: 34, color: T.white });
        const power = ui.make('Power', root, 450, 38); power.setPosition(112, 24);
        const track = ui.make('PowerTrack', power, 250, 32).addComponent(Graphics); track.node.setPosition(-72, 0);
        const value = ui.label('PowerValue', power, '力度 0%', 170, 0, 148, 38, { size: 26, color: T.white });
        const hint = ui.label('ActionHint', root, '', 100, -36, 490, 34, { size: 25, color: T.muted });
        const botStatus = ui.label('BotStatus', root, '', 0, -12, 640, 34, { size: 25, color: T.teal });
        botStatus.node.active = false;
        return { root, medal, puckIcon, name, count, shownCount: -1, timer, time, pause, power, track, value, hint, botStatus,
            notice: '', noticeColor: T.white, noticeTime: 0 };
    }
    private toScreen(x: number, y: number): { x: number; y: number } {
        const l = this.layout!, p = project(x, y); return { x: l.boardX + p.x * l.scale, y: l.boardY + p.y * l.scale };
    }
}

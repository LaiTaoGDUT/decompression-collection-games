import { BlockInputEvents, Graphics, Label, Node, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { bindPressFeedback, drawCapsuleButton, drawPorcelainCard, heart, hexColor, icon, INK, IVORY, MUTED, picture, snakePortrait, textLabel, uiNode } from './CubeAwayChrome';
import type { CapsuleColorVariant } from './CubeAwayChrome';
import type { CubeAwayLayoutMetrics } from './CubeAwayLayout';
import { CUBE_AWAY_THEME } from './CubeAwayTheme';
import type { CubeAwayUICallbacks, PlayHudModel } from './CubeAwayUI';
interface Ripple { node: Node; elapsed: number; risesFrom?: number; }
interface VictoryEntrance {
    backdrop: UIOpacity;
    content: Node;
    contentOpacity: UIOpacity;
    badge: Node;
    primary: Node;
    confetti: Graphics;
    settledScale: number;
    settledY: number;
    elapsed: number;
}
interface PanelEntrance {
    backdrop: Graphics;
    content: Node;
    scale: number;
    y: number;
    elapsed: number;
}
interface VictoryIdle {
    badge: Node;
    confetti: Graphics;
    sparkles: Graphics;
    elapsed: number;
}

const VICTORY_ENTRANCE_DURATION = .44;
const PANEL_ENTRANCE_DURATION = .27;

export class CubeAwayInGameUI {
    private count?: Label;
    private hearts?: Node;
    private hintBadge?: Node;
    private hintLabel?: Label;
    private hintButton?: Node;
    private hintIcon?: Node;
    private fx?: Node;
    private layout?: CubeAwayLayoutMetrics;
    private model?: PlayHudModel;
    private readonly ripples: Ripple[] = [];
    private victoryEntrance?: VictoryEntrance;
    private panelEntrance?: PanelEntrance;
    private victoryIdle?: VictoryIdle;
    constructor(private readonly frames: Readonly<Record<string, SpriteFrame>>, private readonly callbacks: CubeAwayUICallbacks, private readonly bgFrame?: SpriteFrame) {}
    get hintTarget(): Node | undefined { return this.hintIcon; }
    get hintStock(): Node | undefined { return this.hintBadge; }
    buildPlayHud(root: Node, model: PlayHudModel, layout: CubeAwayLayoutMetrics): void {
        this.layout = layout; this.model = undefined; this.ripples.length = 0; root.destroyAllChildren();
        const s = layout.chromeScale;
        const header = uiNode(root, 'TopHud', 750, layout.headerHeight);
        header.setPosition(layout.centerX, layout.headerTopY - 46 * s); header.setScale(s, s, 1);
        const gear = drawPorcelainCard(header, 'SettingBtn', 80, 80, 40);
        gear.setPosition(298, 0); icon(gear, 'SettingIcon', 'gear', 58); bindPressFeedback(gear, () => this.callbacks.onOpenSettings());
        textLabel(header, 'LevelTitle', `第 ${model.levelNumber} 关`, 52, 360, 76);
        const counter = drawPorcelainCard(header, 'SnakeCountPill', 146, 66, 33); counter.setPosition(-267, 0);
        snakePortrait(counter, this.frames.snake_head_side, 47).setPosition(-34, 0);
        this.count = textLabel(counter, 'RemainingCount', '', 40, 73, 58); this.count.node.setPosition(31, 0);
        this.hearts = uiNode(header, 'Hearts', 300, 48); this.hearts.setPosition(0, -91);
        if (model.difficulty !== 'normal') {
            const expert = model.difficulty === 'expert';
            const badge = drawPorcelainCard(header, 'ChallengeBadge', 136, 31, 15, expert ? '#FFD5C9' : '#FCE2BC'); badge.setPosition(0, -46);
            textLabel(badge, 'ChallengeLabel', expert ? '超高难关' : '高难关', 19, 128, 30, expert ? '#974C44' : '#94672F');
        }
        const footer = uiNode(root, 'BottomHud', 750, layout.footerHeight / s); footer.setScale(s, s, 1);
        footer.setPosition(layout.centerX, layout.footerBottomY);
        this.hintButton = drawCapsuleButton(footer, 'HintButton', '', 368, 94, 'honey', () => {
            if (this.model && (this.model.hints > 0 || this.model.adsEnabled)) this.callbacks.onUseHint();
        });
        this.hintButton.setPosition(0, 108);
        this.hintIcon = icon(this.hintButton, 'HintBulb', 'bulb', 67); this.hintIcon.setPosition(-107, 0);
        textLabel(this.hintButton, 'HintText', '提示', 43, 130, 74).node.setPosition(12, 0);
        this.hintBadge = drawPorcelainCard(this.hintButton, 'HintStock', 60, 60, 30); this.hintBadge.setPosition(116, 0);
        this.hintLabel = textLabel(this.hintBadge, 'HintCount', '', 34, 56, 54);
        textLabel(footer, 'GestureNote', '拖动旋转 · 双指缩放', 26, 500, 44, MUTED, false).node.setPosition(0, 20);
        this.fx = uiNode(root, 'Feedback', layout.visibleWidth, layout.visibleHeight);
        this.refreshPlayHud(model);
    }
    refreshPlayHud(model: PlayHudModel): void {
        if (this.count) this.count.string = String(model.remainingArrows);
        if (this.hearts && (!this.model || this.model.lives !== model.lives || this.model.maxLives !== model.maxLives)) {
            this.hearts.destroyAllChildren();
            for (let i = 0; i < model.maxLives; i++) heart(this.hearts, `Heart_${i}`, i < model.lives, 42).setPosition((i - (model.maxLives - 1) / 2) * 55, 0);
        }
        if (this.hintBadge && this.hintLabel) {
            this.hintLabel.string = model.hints > 0 ? String(model.hints) : model.adsEnabled ? '' : '0';
            const movie = this.hintBadge.getChildByName('HintAd');
            if (model.hints === 0 && model.adsEnabled) { if (!movie) icon(this.hintBadge, 'HintAd', 'movie', 40); }
            else movie?.destroy();
        }
        if (this.hintButton) {
            const opacity = this.hintButton.getComponent(UIOpacity) ?? this.hintButton.addComponent(UIOpacity);
            opacity.opacity = model.hints === 0 && !model.adsEnabled ? 145 : 255;
        }
        this.model = { ...model };
    }
    spawnTapRipple(x: number, y: number, tint = '#90CDA2'): void {
        if (!this.fx) return;
        const n = uiNode(this.fx, 'TapRipple', 100, 100); n.setPosition(x, y); n.addComponent(UIOpacity);
        const g = n.addComponent(Graphics); g.strokeColor = hexColor(tint); g.lineWidth = 3; g.circle(0, 0, 19); g.stroke();
        this.ripples.push({ node: n, elapsed: 0 });
    }
    flashBlockedWarning(x?: number, y?: number): void {
        if (x !== undefined && y !== undefined && this.fx && this.layout) {
            const origin = Math.min(y + 36, this.layout.safeTop - 78);
            const pop = textLabel(this.fx, 'HeartLoss', '-1', 34, 68, 46, '#EC7866').node;
            pop.setPosition(x, origin);
            pop.addComponent(UIOpacity);
            this.ripples.push({ node: pop, elapsed: 0, risesFrom: origin });
        }
        if (!this.hearts) return;
        Tween.stopAllByTarget(this.hearts);
        const p = this.hearts.position.clone();
        tween(this.hearts).to(.06, { position: new Vec3(p.x - 7, p.y) }).to(.08, { position: new Vec3(p.x + 7, p.y) }).to(.08, { position: p }).start();
    }
    update(dt: number, paused: boolean): void {
        const step = Math.min(.05, Math.max(0, dt));
        this.advancePanelEntrance(step);
        if (paused) return;
        if (this.victoryEntrance) this.advanceVictoryEntrance(step);
        else this.advanceVictoryIdle(step);
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const fx = this.ripples[i]; fx.elapsed += dt;
            if (!fx.node.isValid || fx.elapsed > .42) { if (fx.node.isValid) fx.node.destroy(); this.ripples.splice(i, 1); continue; }
            if (fx.risesFrom === undefined) {
                const scale = 1 + fx.elapsed * 3;
                fx.node.setScale(scale, scale, 1);
            } else {
                fx.node.setPosition(fx.node.position.x, fx.risesFrom + fx.elapsed * 82);
            }
            fx.node.getComponent(UIOpacity)!.opacity = 180 * (1 - fx.elapsed / .42);
        }
    }
    clearModalAnimation(): void {
        this.victoryEntrance = undefined;
        this.panelEntrance = undefined;
        this.victoryIdle = undefined;
    }

    private drawBackdrop(g: Graphics, color: string, alpha: number): void {
        const { visibleWidth: w, visibleHeight: h } = this.layout!;
        g.clear();
        g.fillColor = hexColor(color, alpha);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }

    private startPanelEntrance(backdrop: Node, content: Node): void {
        this.panelEntrance = {
            backdrop: backdrop.getComponent(Graphics)!,
            content, scale: content.scale.x, y: content.position.y, elapsed: 0,
        };
        this.advancePanelEntrance(0);
    }

    private advancePanelEntrance(dt: number): void {
        const entrance = this.panelEntrance;
        if (!entrance) return;
        entrance.elapsed += dt;
        const progress = Math.min(1, entrance.elapsed / PANEL_ENTRANCE_DURATION);
        const reveal = 1 - (1 - progress) ** 3;
        const scale = entrance.scale * (.79 + .21 * reveal);
        entrance.content.setScale(scale, scale, 1);
        entrance.content.setPosition(entrance.content.position.x, entrance.y - 25 * entrance.scale * (1 - reveal));
        this.drawBackdrop(entrance.backdrop, CUBE_AWAY_THEME.panelShade, Math.round(118 * reveal));
        if (progress === 1) this.panelEntrance = undefined;
    }

    private panelAction(action: () => void): () => void {
        return () => { if (!this.panelEntrance) action(); };
    }

    private advanceVictoryEntrance(dt: number): void {
        const entrance = this.victoryEntrance;
        if (!entrance) return;
        if (!entrance.content.isValid) {
            this.clearModalAnimation();
            return;
        }
        entrance.elapsed += dt;
        const progress = Math.min(1, entrance.elapsed / VICTORY_ENTRANCE_DURATION);
        const eased = 1 - (1 - progress) ** 3;
        entrance.backdrop.opacity = Math.round(255 * Math.min(1, progress * 1.65));
        entrance.contentOpacity.opacity = Math.round(255 * Math.min(1, progress * 1.7));
        const panelScale = entrance.settledScale * (.9 + .1 * eased);
        entrance.content.setScale(panelScale, panelScale, 1);
        entrance.content.setPosition(entrance.content.position.x, entrance.settledY - 22 * (1 - eased) * entrance.settledScale);
        const badgeScale = .74 + .26 * eased + .13 * Math.sin(Math.PI * progress);
        entrance.badge.setScale(badgeScale, badgeScale, 1);
        entrance.primary.active = progress >= .28;
        this.drawVictoryConfetti(entrance.confetti, progress);
        if (progress === 1) {
            this.victoryEntrance = undefined;
            this.advanceVictoryIdle(0);
        }
    }

    private advanceVictoryIdle(dt: number): void {
        const idle = this.victoryIdle;
        if (!idle) return;
        idle.elapsed = (idle.elapsed + dt) % 6;
        const phase = idle.elapsed * Math.PI / 3;
        idle.badge.setPosition(0, 68 + 7 * Math.sin(phase * 2));
        this.drawVictoryConfetti(idle.confetti, 1, phase);

        const g = idle.sparkles;
        g.clear();
        const stars = [[-210, 211], [222, 170], [202, -68], [-237, -35]];
        for (let i = 0; i < stars.length; i++) {
            const [x, y] = stars[i];
            const glint = .5 - .5 * Math.cos(phase * 2 + i * 1.7);
            const r = 6 + 9 * glint;
            g.fillColor = hexColor(i % 2 ? '#C7AAE1' : '#F4CC6D', Math.round(36 + 165 * glint));
            g.moveTo(x, y + r);
            g.quadraticCurveTo(x + 2, y + 2, x + r, y);
            g.quadraticCurveTo(x + 2, y - 2, x, y - r);
            g.quadraticCurveTo(x - 2, y - 2, x - r, y);
            g.quadraticCurveTo(x - 2, y + 2, x, y + r);
            g.close();
            g.fill();
        }
    }

    private drawVictoryConfetti(g: Graphics, progress: number, phase = 0): void {
        g.clear();
        const colors = ['#FFD36A', '#FF927E', '#CBA4E5', '#AECBE4'];
        for (let i = 0; i < 12; i++) {
            const enter = Math.max(0, Math.min(1, (progress - .18 - (i % 3) * .06) / .67));
            if (enter === 0) continue;
            const endX = Math.sin(i * 7.1) * 320, endY = 545 - i * 58;
            const x = endX * (.82 + .18 * enter) + 7 * (Math.sin(phase + i) - Math.sin(i));
            const y = endY + 60 * (1 - enter) + 4 * (Math.cos(phase * 2 + i) - Math.cos(i));
            g.fillColor = hexColor(colors[i % colors.length], Math.round(255 * enter));
            g.roundRect(x, y, 13, 22, 3);
            g.fill();
        }
    }

    private overlay(root: Node, full = false): Node {
        this.clearModalAnimation();
        root.destroyAllChildren(); root.active = true;
        const l = this.layout!; root.getComponent(UITransform)!.setContentSize(l.visibleWidth, l.visibleHeight);
        if (!root.getComponent(BlockInputEvents)) root.addComponent(BlockInputEvents);
        const cover = uiNode(root, 'ModalBackdrop', l.visibleWidth, l.visibleHeight);
        if (full && this.bgFrame) {
            const scale = Math.max(l.visibleWidth / 750, l.visibleHeight / 1334);
            picture(cover, 'Paper', this.bgFrame, 750 * scale, 1334 * scale);
        } else {
            this.drawBackdrop(cover.addComponent(Graphics), full ? CUBE_AWAY_THEME.backdropTop : CUBE_AWAY_THEME.panelShade, full ? 255 : 118);
        }
        return cover;
    }
    private content(root: Node, name: string, height: number, maxScale = 1): Node {
        const l = this.layout!; const n = uiNode(root, name, 650, height);
        const s = Math.min(maxScale, (l.safeWidth - 40) / 650, (l.safeHeight - 28) / height);
        n.setScale(s, s, 1); n.setPosition(l.centerX, (l.safeTop + l.safeBottom) / 2); return n;
    }
    private close(parent: Node, x: number, y: number, cb: () => void): void {
        const n = uiNode(parent, 'CloseButton', 68, 68); n.setPosition(x, y); icon(n, 'CloseIcon', 'close', 58); bindPressFeedback(n, cb);
    }
    showSettingsModal(root: Node, level: number, resume: () => void, restart: () => void, map: () => void, lobby: () => void, animate: boolean): void {
        const backdrop = this.overlay(root);
        const content = this.content(root, 'SettingsContent', 478);
        content.setPosition(content.position.x, content.position.y - Math.min(68 * content.scale.y, Math.max(0, (this.layout!.safeHeight - 478 * content.scale.y) / 2 - 14)));
        const card = drawPorcelainCard(content, 'SettingsCard', 556, 478, 48);
        this.close(card, 236, 199, this.panelAction(resume));
        textLabel(card, 'SettingsTitle', `设置 · 第 ${level} 关`, 40, 500, 80).node.setPosition(0, 162);
        const rows: Array<[string, string, CapsuleColorVariant, () => void]> = [
            ['RestartLevel', '重玩本关', 'primary', restart],
            ['LevelMap', '关卡地图', 'honey', map],
            ['ReturnLobby', '返回大厅', 'secondary', lobby],
        ];
        rows.forEach((r, i) => drawCapsuleButton(card, r[0], r[1], 460, 76, r[2], this.panelAction(r[3]), 39).setPosition(0, 54 - i * 101));
        if (animate) this.startPanelEntrance(backdrop, content);
    }
    showVictoryModal(root: Node, level: number, moves: number, mistakes: number, hasNext: boolean, next: () => void, map: () => void, animate: boolean): void {
        const backdrop = this.overlay(root, true);
        const content = this.content(root, 'VictoryContent', 1190);
        textLabel(content, 'VictoryTitle', hasNext ? '小蛇都溜走啦！' : '全关解开啦！', 63, 700, 104).node.setPosition(0, 450);
        textLabel(content, 'CompletedLevel', `第 ${level} 关完成`, 41, 600, 70).node.setPosition(0, 360);
        const badge = picture(content, 'VictoryBadge', this.frames.victory_badge, 480, 480);
        badge.setPosition(0, 68);
        textLabel(content, 'MoveValue', String(moves), 80, 245, 110).node.setPosition(-170, -236);
        textLabel(content, 'MistakeValue', mistakes ? String(mistakes) : '零失误', mistakes ? 80 : 68, 270, 110, mistakes ? CUBE_AWAY_THEME.accentColor : INK).node.setPosition(165, -236);
        textLabel(content, 'MoveCaption', '消除步数', 32, 250, 55, INK, false).node.setPosition(-170, -306);
        textLabel(content, 'MistakeCaption', '失误次数', 32, 250, 55, INK, false).node.setPosition(165, -306);
        const g = content.addComponent(Graphics); g.strokeColor = hexColor(CUBE_AWAY_THEME.cardBorder); g.lineWidth = 2;
        g.moveTo(0, -213); g.lineTo(0, -313); g.stroke();
        if (!hasNext) textLabel(content, 'AllComplete', `${level}关，全部完成`, 28, 600, 55, MUTED, false).node.setPosition(0, -362);
        const tapWhenSettled = (action: () => void) => () => { if (!this.victoryEntrance) action(); };
        const primary = drawCapsuleButton(content, 'VictoryPrimary', hasNext ? '下一关' : '返回关卡地图', 430, 106,
            'primary', tapWhenSettled(hasNext ? next : map), hasNext ? 51 : 38);
        primary.setPosition(0, -472);
        if (hasNext) {
            const back = textLabel(content, 'VictoryMap', '返回关卡地图', 33, 400, 65, INK, false).node;
            back.setPosition(0, -575);
            bindPressFeedback(back, tapWhenSettled(map));
        }
        const confetti = uiNode(content, 'Confetti', 750, 1100).addComponent(Graphics);
        confetti.node.setSiblingIndex(0);
        const sparkles = uiNode(content, 'VictorySparkles', 500, 480).addComponent(Graphics);
        this.victoryIdle = { badge, confetti, sparkles, elapsed: 0 };
        if (animate) {
            this.victoryEntrance = {
                backdrop: backdrop.addComponent(UIOpacity),
                content,
                contentOpacity: content.addComponent(UIOpacity),
                badge,
                primary,
                confetti,
                settledScale: content.scale.x,
                settledY: content.position.y,
                elapsed: 0,
            };
            this.advanceVictoryEntrance(0);
        } else {
            this.advanceVictoryIdle(0);
        }
    }
    showReviveModal(root: Node, level: number, remaining: number, ads: boolean, revive: () => void, restart: () => void, map: () => void, animate: boolean): void {
        const backdrop = this.overlay(root);
        const height = 748;
        const content = this.content(root, 'FailureContent', height);
        const safeMargin = Math.max(0, (this.layout!.safeHeight - height * content.scale.y) / 2 - 12);
        content.setPosition(content.position.x, content.position.y - Math.min(46 * content.scale.y, safeMargin));
        const card = drawPorcelainCard(content, 'FailureCard', 578, height, 64);
        const top = height / 2;
        const close = drawPorcelainCard(card, 'CloseButton', 58, 58, 29, CUBE_AWAY_THEME.secondaryButton);
        close.setPosition(230, top - 56);
        icon(close, 'CloseIcon', 'close', 47);
        bindPressFeedback(close, this.panelAction(map));
        textLabel(card, 'FailureTitle', '爱心用完啦', 58, 510, 90).node.setPosition(0, top - 100);
        const badge = drawPorcelainCard(card, 'FailedLevelBadge', 182, 46, 23, CUBE_AWAY_THEME.secondaryButton);
        badge.setPosition(0, top - 174);
        textLabel(badge, 'FailedLevel', `第 ${level} 关`, 29, 180, 42);
        picture(card, 'SadSnake', this.frames.failure_portrait, 380, 190).setPosition(0, top - 292);
        textLabel(card, 'RemainingMessage', `还差 ${remaining} 条小蛇，就能过关啦`, 32, 550, 70).node.setPosition(0, top - 399);
        const reviveHeight = 96, actionGap = 24;
        let actionTop = top - (ads ? 447 : 484);
        if (ads) {
            const ad = drawCapsuleButton(card, 'ReviveAd', '', 488, reviveHeight, 'coral', this.panelAction(revive));
            ad.setPosition(0, actionTop - reviveHeight / 2);
            icon(ad, 'ReviveMovie', 'movie', 80).setPosition(-162, 0);
            textLabel(ad, 'Label', '看视频复活 +2', 38, 270, 80, IVORY).node.setPosition(24, 0);
            heart(ad, 'ReviveHeart', true, 39, IVORY).setPosition(183, 0);
            actionTop -= reviveHeight + actionGap;
        }
        const retryHeight = ads ? 82 : 92;
        drawCapsuleButton(card, 'Retry', '重新挑战', ads ? 430 : 458, retryHeight, ads ? 'secondary' : 'primary', this.panelAction(restart), 38)
            .setPosition(0, actionTop - retryHeight / 2);
        const back = textLabel(card, 'FailureMap', '返回关卡地图', 28, 400, 64, MUTED, false).node;
        back.setPosition(0, actionTop - retryHeight - (ads ? 46 : 55));
        bindPressFeedback(back, this.panelAction(map));
        if (animate) this.startPanelEntrance(backdrop, content);
    }
    dispose(): void { this.clearModalAnimation(); this.ripples.length = 0; if (this.hearts) Tween.stopAllByTarget(this.hearts); }
}

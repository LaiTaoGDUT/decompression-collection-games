import { _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node, Sprite, tween,
    Tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';
import type { GameRuntime } from '../../runtime/GameRuntime';
import type { AchievementService } from '../../services/achievements/AchievementService';
import type { AchievementArtService } from '../../services/achievements/AchievementArtService';
import type { AchievementAudioService } from '../../services/achievements/AchievementAudioService';
import type { AppStateMachine } from '../../core/state/AppStateMachine';
import type { Platform } from '../../platform/Platform';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import { calculateSafeContentBounds } from '../ui/PlatformSafeLayout';
import { achievementButton, achievementChip, achievementLabel, achievementNode, achievementSerial, createAchievementImage,
    createAchievementTrophy, fillRoundRect, formatAchievementObtainedAt, hexColor, makeAchievementButton,
    strokeRoundRect } from './AchievementArtwork';

const { ccclass } = _decorator;
/** 首次领奖看完升起动画才可收下；回顾是主动打开的，很快即可返回。 */
const COLLECT_DELAY = 2.2;
const REPLAY_CLOSE_DELAY = 0.8;
const LOCKED_CLOSE_DELAY = 0.35;
/** 领奖舞台的设计坐标（内容节点中心为原点），短屏整体等比缩小。 */
const CONTENT_WIDTH = 670;
const CONTENT_HEIGHT = 1000;
const TITLE_Y = 384;
const STAGE_Y = 136;
const PLAQUE_Y = -222;
const PLAQUE_WIDTH = 600;
const PLAQUE_HEIGHT = 230;
const BUTTON_Y = -424;
/** award：首次领奖；replay：已获得奖杯回顾；locked：未获得奖杯的详情与进度。 */
type PresentationMode = 'award' | 'replay' | 'locked';
interface CelebrationServices {
    readonly achievements: AchievementService;
    readonly art: AchievementArtService;
    readonly audio: AchievementAudioService;
    readonly runtime: GameRuntime;
    readonly stateMachine: AppStateMachine;
    readonly platform: Platform;
    readonly feedback: FeedbackService;
    readonly manifests: () => readonly GameManifest[];
}

/** 常驻领奖、珍藏回顾与未获得详情共用同一舞台；后两者只读存档，不发奖也不改写记录。 */
@ccclass('AchievementCelebration')
export class AchievementCelebration extends Component {
    private services?: CelebrationServices;
    private activeManifest?: GameManifest;
    private pendingManifest?: GameManifest;
    private waitElapsed = 0;
    private animationElapsed = 0;
    private overlay?: Node;
    private content?: Node;
    private rays?: Node;
    private halo?: Node;
    private innerHalo?: Node;
    private collectButton?: Node;
    private backButton?: Node;
    private hidden = false;
    private resumeOwned = false;
    private mode: PresentationMode = 'award';
    private challenge?: () => void;
    private readonly cleanups: (() => void)[] = [];

    configure(services: CelebrationServices): void {
        this.services = services;
        this.cleanups.push(services.platform.onHide(() => {
            this.hidden = true;
            this.visitAnimationTargets(target => Tween.pauseAllByTarget(target));
        }));
        this.cleanups.push(services.platform.onShow(() => {
            this.hidden = false;
            this.visitAnimationTargets(target => Tween.resumeAllByTarget(target));
        }));
        view.on('canvas-resize', this.layout, this);
    }

    /** 只允许大厅中的已获得奖杯回顾；连续点击不会叠加动画或更改获得时间。 */
    replay(manifest: GameManifest): boolean {
        const services = this.services;
        if (!services || this.hidden || this.activeManifest || !manifest.achievement
            || services.stateMachine.currentState !== 'lobby') return false;
        const record = services.achievements.getRecord(manifest);
        if (!record?.unlockedAt) return false;
        this.resumeOwned = false;
        // 未收下的存量奖杯仍走领取流程，避免回顾关闭后再弹同一份待领奖。
        this.show(manifest, record.celebratedAt ? 'replay' : 'award');
        return true;
    }

    /** 大厅中查看未获得奖杯：展示条件与最高进度，“去挑战”交给调用方进入游戏。 */
    preview(manifest: GameManifest, challenge: () => void): boolean {
        const services = this.services;
        if (!services || this.hidden || this.activeManifest || !manifest.achievement
            || services.stateMachine.currentState !== 'lobby') return false;
        if (services.achievements.getRecord(manifest)?.unlockedAt) return this.replay(manifest);
        this.resumeOwned = false;
        this.challenge = challenge;
        this.show(manifest, 'locked');
        return true;
    }

    get isReplay(): boolean {
        return this.mode === 'replay';
    }

    get isPendingOrVisible(): boolean {
        const services = this.services;
        return !!this.activeManifest || !!(services && services.achievements.pending(services.manifests()));
    }

    protected update(dt: number): void {
        const services = this.services;
        if (!services || this.hidden) return;
        if (this.activeManifest) {
            this.animationElapsed += dt;
            if (this.rays?.isValid) this.rays.angle += dt * 3;
            if (this.halo?.isValid) this.halo.angle += dt * 5;
            if (this.innerHalo?.isValid) this.innerHalo.angle -= dt * 8;
            if (this.animationElapsed >= this.closeDelay) this.revealCloseControls();
            return;
        }
        const state = services.stateMachine.currentState;
        if (state !== 'lobby' && state !== 'playing' && state !== 'paused') return;
        const pending = services.achievements.pending(services.manifests());
        if (pending !== this.pendingManifest) { this.pendingManifest = pending; this.waitElapsed = 0; }
        if (!pending) return;
        this.waitElapsed += dt;
        if (this.waitElapsed < 0.9) return;
        if (state !== 'lobby' && !services.runtime.beginAchievementPresentation()) return;
        this.resumeOwned = state === 'playing';
        this.show(pending, 'award');
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.layout, this);
        this.cleanups.splice(0).forEach(cleanup => cleanup());
        this.stopAnimation();
        this.services?.audio.stop();
        this.overlay?.destroy();
        this.services = undefined;
        this.activeManifest = undefined;
    }

    private show(manifest: GameManifest, mode: PresentationMode): void {
        const services = this.services!;
        const definition = manifest.achievement!;
        const locked = mode === 'locked';
        this.activeManifest = manifest;
        this.mode = mode;
        this.animationElapsed = 0;
        const root = achievementNode(this.node, 'AchievementObtained', 750, 1334);
        root.addComponent(BlockInputEvents);
        root.addComponent(Graphics);
        this.overlay = root;
        this.createAwardBackdrop(root);

        const content = achievementNode(root, 'AwardContent', CONTENT_WIDTH, CONTENT_HEIGHT);
        this.content = content;
        const manifests = services.manifests();
        if (!locked) {
            const eyebrow = mode === 'award'
                ? `你的第 ${services.achievements.collection(manifests).filter(game => !!services.achievements.getRecord(game)?.unlockedAt).length} 座专属奖杯`
                : `我的珍藏 · ${achievementSerial(manifests, manifest)}`;
            achievementLabel(content, 'AwardEyebrow', eyebrow, 0, 458, 560, 34, 23, '#E6CB8E');
        }
        this.createQuietTitle(content, mode === 'award' ? '成就达成' : locked ? '待点亮' : '荣耀回顾', locked);

        const stage = achievementNode(content, 'TrophyStage', 480, 480);
        stage.setPosition(0, STAGE_Y);
        this.createStageHalo(stage, locked);
        if (!locked) {
            this.createRevealBloom(stage);
            this.createSparkles(stage);
        }

        // 未获得时为灰度失色雕塑，直接缓缓浮现，不做升起与星芒爆发。
        const trophy = createAchievementTrophy(stage, definition, services.art, locked);
        const trophyOpacity = trophy.addComponent(UIOpacity);
        trophyOpacity.opacity = 0;
        const float = tween(trophy).to(2.4, { position: new Vec3(0, 5, 0) }, { easing: 'sineInOut' })
            .to(2.4, { position: new Vec3(0, -5, 0) }, { easing: 'sineInOut' }).repeatForever();
        if (locked) {
            trophy.setScale(1.6, 1.6, 1);
            tween(trophyOpacity).delay(0.1).to(0.45, { opacity: 255 }, { easing: 'sineOut' }).start();
            tween(trophy).to(0.55, { scale: new Vec3(1.7, 1.7, 1) }, { easing: 'cubicOut' }).then(float).start();
        } else {
            trophy.setScale(0.12, 0.12, 1);
            trophy.setPosition(0, -65);
            tween(trophyOpacity).delay(0.3).to(0.55, { opacity: 255 }, { easing: 'sineOut' }).start();
            tween(trophy).delay(0.3).to(1.15, { scale: new Vec3(1.78, 1.78, 1), position: new Vec3(0, 5, 0) },
                { easing: 'cubicOut' }).to(0.4, { scale: new Vec3(1.7, 1.7, 1), position: new Vec3(0, 0, 0) },
                { easing: 'sineInOut' }).then(float).start();
        }

        this.createPlaque(content, manifest, mode);
        const caption = mode === 'award' ? '收下奖杯' : locked ? '去挑战' : '返回成就墙';
        const collect = achievementButton(content, 'CollectTrophy', caption, 360, 92, this.collect, '#F2CB77', '#5A3712', 32);
        collect.setPosition(0, BUTTON_Y);
        collect.active = false;
        this.collectButton = collect;
        if (mode !== 'award') {
            const back = createAchievementImage(root, 'CloseReplay', 'wall-back', 84, 84, services.art);
            makeAchievementButton(back, this.close, 0.92);
            back.active = false;
            this.backButton = back;
        }
        const contentOpacity = content.addComponent(UIOpacity);
        contentOpacity.opacity = 0;
        tween(contentOpacity).to(locked ? 0.3 : 0.55, { opacity: 255 }, { easing: 'sineOut' }).start();
        if (!locked) services.audio.play(mode === 'replay');
        if (mode === 'award') services.feedback.vibrate('heavy');
        this.layout();
    }

    /** 领奖背景与暖金星芒。 */
    private createAwardBackdrop(root: Node): void {
        createAchievementImage(root, 'AwardBackground', 'award-background', 750, 1334, this.services!.art, 'cover');
        const rays = achievementNode(root, 'StarlightRays', 900, 900);
        const g = rays.addComponent(Graphics);
        g.fillColor = new Color(255, 225, 158, 10);
        for (let i = 0; i < 18; i++) {
            const angle = i * Math.PI * 2 / 18;
            g.moveTo(Math.cos(angle) * 150, Math.sin(angle) * 150);
            g.lineTo(Math.cos(angle - 0.035) * 530, Math.sin(angle - 0.035) * 530);
            g.lineTo(Math.cos(angle + 0.035) * 530, Math.sin(angle + 0.035) * 530);
            g.close(); g.fill();
        }
        const opacity = rays.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).delay(0.2).to(1.4, { opacity: this.mode === 'locked' ? 90 : 255 }, { easing: 'sineOut' }).start();
        this.rays = rays;
    }

    private createStageHalo(stage: Node, locked: boolean): void {
        const glow = stage.addComponent(Graphics);
        for (let i = 10; i >= 1; i--) {
            const alpha = 3 + Math.floor((10 - i) * 0.7);
            glow.fillColor = new Color(247, 199, 107, alpha);
            glow.circle(0, 0, 135 + i * 15); glow.fill();
        }
        this.halo = createAchievementImage(stage, 'CelestialHalo', 'award-halo', 500, 500, this.services!.art);
        this.innerHalo = createAchievementImage(stage, 'InnerHalo', 'award-halo', 390, 390, this.services!.art);
        const haloOpacity = this.halo.addComponent(UIOpacity);
        haloOpacity.opacity = 0;
        const haloPeak = locked ? 80 : 215, haloLow = locked ? 50 : 155;
        tween(haloOpacity).delay(0.25).to(1.25, { opacity: haloPeak }, { easing: 'sineOut' })
            .then(tween(haloOpacity).to(2.2, { opacity: haloLow }).to(2.2, { opacity: haloPeak }).repeatForever()).start();
        this.innerHalo.angle = 12;
        const innerOpacity = this.innerHalo.addComponent(UIOpacity);
        innerOpacity.opacity = 0;
        tween(innerOpacity).delay(0.4).to(1.3, { opacity: locked ? 36 : 88 }).start();
    }

    /** 领奖与详情统一使用文字、投影和两侧细线；未获得时改用淡紫灰。 */
    private createQuietTitle(parent: Node, text: string, muted: boolean): void {
        achievementLabel(parent, 'AwardTitleShadow', text, 0, TITLE_Y - 4, 460, 80, 54, muted ? '#2C2740' : '#5C4424', true);
        achievementLabel(parent, 'AwardTitle', text, 0, TITLE_Y, 460, 80, 54, muted ? '#D9D1E8' : '#FFF0BF', true);
        const node = achievementNode(parent, 'GoldTitleOrnament', 560, 24);
        node.setPosition(0, TITLE_Y);
        const g = node.addComponent(Graphics);
        g.strokeColor = new Color(226, 183, 107, 160); g.lineWidth = 1.5;
        g.moveTo(-270, 0); g.lineTo(-150, 0); g.moveTo(150, 0); g.lineTo(270, 0); g.stroke();
        g.fillColor = new Color(253, 224, 159, 255);
        for (const x of [-142, 142]) {
            g.moveTo(x, 7); g.lineTo(x + 5, 0); g.lineTo(x, -7); g.lineTo(x - 5, 0); g.close(); g.fill();
        }
    }

    /** 深色琉璃铭牌：游戏标签压在上沿，承载成就名、条件，以及首次获得时间或当前最高进度。 */
    private createPlaque(parent: Node, manifest: GameManifest, mode: PresentationMode): void {
        const definition = manifest.achievement!;
        const plaque = achievementNode(parent, 'AwardPlaque', PLAQUE_WIDTH, PLAQUE_HEIGHT);
        const plaqueY = PLAQUE_Y;
        plaque.setPosition(0, plaqueY - 24);
        const g = plaque.addComponent(Graphics);
        fillRoundRect(g, 0, 0, PLAQUE_WIDTH, PLAQUE_HEIGHT, 34, new Color(20, 18, 44, 205));
        strokeRoundRect(g, 0, 0, PLAQUE_WIDTH - 2, PLAQUE_HEIGHT - 2, 33, new Color(233, 190, 106, 200), 2);
        strokeRoundRect(g, 0, 0, PLAQUE_WIDTH - 16, PLAQUE_HEIGHT - 16, 27, new Color(233, 190, 106, 55), 1.5);
        fillRoundRect(g, 0, PLAQUE_HEIGHT / 2 - 16, PLAQUE_WIDTH - 90, 3, 1.5, new Color(255, 236, 190, 40));
        const chip = achievementChip(plaque, 'AwardGame', manifest.name, definition.color, 42, 22);
        chip.setPosition(0, PLAQUE_HEIGHT / 2);
        achievementLabel(plaque, 'TrophyName', definition.name, 0, 50, 540, 60, 44, '#FFF1C9', true);
        achievementLabel(plaque, 'AwardRequirement', definition.description, 0, 2, 540, 34, 24, '#D6CCE6');
        g.strokeColor = new Color(233, 190, 106, 120); g.lineWidth = 1.2;
        g.moveTo(-200, -34); g.lineTo(-14, -34); g.moveTo(14, -34); g.lineTo(200, -34); g.stroke();
        g.fillColor = new Color(253, 224, 159, 255);
        g.moveTo(0, -27); g.lineTo(6, -34); g.lineTo(0, -41); g.lineTo(-6, -34); g.close(); g.fill();
        const record = this.services!.achievements.getRecord(manifest);
        if (mode === 'locked') {
            // 进度条与右侧数值作为一组居中：数值按文字实际宽度排版，中间留出固定间距。
            const progress = Math.floor(record?.progress ?? 0), trackWidth = 300, gap = 22;
            const value = achievementLabel(plaque, 'ProgressValue', `${progress} / ${definition.target}${definition.unit}`,
                0, -70, 200, 32, 22, '#E6CB8E', true);
            value.overflow = Label.Overflow.NONE;
            value.updateRenderData(true);
            const valueWidth = value.node.getComponent(UITransform)!.width;
            const left = -(trackWidth + gap + valueWidth) / 2;
            value.node.setPosition(left + trackWidth + gap + valueWidth / 2, -70);
            const ratio = Math.min(1, progress / Math.max(1, definition.target));
            fillRoundRect(g, left + trackWidth / 2, -70, trackWidth, 14, 7, new Color(255, 255, 255, 40));
            if (progress > 0) {
                const fill = Math.max(14, trackWidth * ratio);
                fillRoundRect(g, left + fill / 2, -70, fill, 14, 7, hexColor(definition.color));
            }
        } else {
            const obtainedAt = record?.unlockedAt;
            achievementLabel(plaque, 'ObtainedTime', obtainedAt
                ? (mode === 'replay' ? '珍藏于 ' : '获得于 ') + formatAchievementObtainedAt(obtainedAt) : '',
            0, -70, 540, 32, 22, '#E6CB8E');
        }
        // 未获得详情：铭牌与“去挑战”按钮同一时刻出现；领奖与回顾在奖杯升起后滑入。
        const delay = mode === 'locked' ? LOCKED_CLOSE_DELAY : 0.75, duration = mode === 'locked' ? 0.32 : 0.5;
        const opacity = plaque.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).delay(delay).to(duration, { opacity: 255 }, { easing: 'sineOut' }).start();
        tween(plaque).delay(delay).to(duration, { position: new Vec3(0, plaqueY, 0) }, { easing: 'cubicOut' }).start();
    }

    private createRevealBloom(parent: Node): void {
        const bloom = achievementNode(parent, 'RevealBloom', 470, 470);
        const g = bloom.addComponent(Graphics);
        for (let i = 8; i >= 1; i--) {
            g.fillColor = new Color(255, 229, 157, 5);
            g.circle(0, 0, 70 + i * 21); g.fill();
        }
        bloom.setScale(0.2, 0.2, 1);
        const opacity = bloom.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).delay(0.2).to(0.7, { opacity: 255 }).to(1.1, { opacity: 0 }).start();
        tween(bloom).delay(0.2).to(1.6, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'cubicOut' }).start();
    }

    private createSparkles(parent: Node): void {
        for (let i = 0; i < 32; i++) {
            const spark = this.createSpark(parent, 'AwardBurst-' + i, 4 + i % 4,
                i % 5 === 0 ? '#FFF8DE' : '#EDCA82');
            const opacity = spark.addComponent(UIOpacity);
            opacity.opacity = 0;
            const angle = i * Math.PI * 2 / 32;
            const radius = 206 + (i % 4) * 16;
            spark.setScale(0.1, 0.1, 1);
            tween(spark).delay(0.55 + (i % 6) * 0.04)
                .to(1.05, { position: new Vec3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0),
                    scale: new Vec3(1, 1, 1), angle: i * 23 }, { easing: 'cubicOut' })
                .to(1.2, { scale: new Vec3(0.2, 0.2, 1) }).start();
            tween(opacity).delay(0.55 + (i % 6) * 0.04).to(0.25, { opacity: 240 })
                .delay(0.75).to(1.1, { opacity: 0 }).start();
        }
        for (let i = 0; i < 24; i++) {
            const spark = this.createSpark(parent, 'GoldenDust-' + i, 1.4 + (i % 4) * 0.7,
                i % 5 === 0 ? '#FFF6E1' : '#E9C57F');
            const opacity = spark.addComponent(UIOpacity);
            opacity.opacity = 0;
            const x = (i * 73 % 560) - 280;
            const duration = 3.5 + (i % 6) * 0.35;
            tween(spark).delay(0.6 + i * 0.11).then(tween(spark)
                .call(() => spark.setPosition(x, -240 + (i % 4) * 20))
                .to(duration, { position: new Vec3(x + Math.sin(i) * 38, 235 + (i % 4) * 18, 0) })
                .repeatForever()).start();
            tween(opacity).delay(0.6 + i * 0.11).then(tween(opacity)
                .to(0.7, { opacity: 165 }).delay(duration - 1.4).to(0.7, { opacity: 0 }).repeatForever()).start();
        }
    }

    private createSpark(parent: Node, name: string, radius: number, color: string): Node {
        const spark = achievementNode(parent, name, radius * 2, radius * 2);
        const g = spark.addComponent(Graphics);
        g.fillColor = Color.fromHEX(new Color(), color);
        g.moveTo(0, radius); g.lineTo(radius * 0.22, radius * 0.22); g.lineTo(radius, 0);
        g.lineTo(radius * 0.22, -radius * 0.22); g.lineTo(0, -radius);
        g.lineTo(-radius * 0.22, -radius * 0.22); g.lineTo(-radius, 0);
        g.lineTo(-radius * 0.22, radius * 0.22); g.close(); g.fill();
        return spark;
    }

    /** 主按钮：领奖时收下，回顾时返回，未获得时关闭后进入对应游戏。 */
    private readonly collect = (): void => {
        if (!this.activeManifest || this.animationElapsed < this.closeDelay) return;
        if (this.mode === 'award') this.services?.achievements.celebrate(this.activeManifest);
        const challenge = this.mode === 'locked' ? this.challenge : undefined;
        this.finish();
        challenge?.();
    };

    /** 左上返回：回顾与未获得详情直接回到成就墙。 */
    private readonly close = (): void => {
        if (!this.activeManifest || this.mode === 'award' || this.animationElapsed < this.closeDelay) return;
        this.finish();
    };

    private finish(): void {
        const services = this.services;
        if (!services) return;
        services.feedback.play('uiButton');
        services.audio.stop();
        this.stopAnimation();
        this.overlay?.destroy();
        this.overlay = undefined; this.content = undefined; this.rays = undefined;
        this.halo = undefined; this.innerHalo = undefined; this.collectButton = undefined; this.backButton = undefined;
        this.activeManifest = undefined; this.pendingManifest = undefined; this.waitElapsed = 0;
        this.mode = 'award';
        this.challenge = undefined;
        if (this.resumeOwned) services.runtime.endAchievementPresentation();
        this.resumeOwned = false;
    }

    private get closeDelay(): number {
        return this.mode === 'award' ? COLLECT_DELAY : this.mode === 'replay' ? REPLAY_CLOSE_DELAY : LOCKED_CLOSE_DELAY;
    }

    /** 关闭入口到时只弹出一次；按钮自身的缩放动画随舞台一起暂停与清理。 */
    private revealCloseControls(): void {
        const button = this.collectButton;
        if (button?.isValid && !button.active) {
            button.active = true;
            button.setScale(0.7, 0.7, 1);
            tween(button).to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        if (this.backButton?.isValid && !this.backButton.active) this.backButton.active = true;
    }

    private visitAnimationTargets(action: (target: Node | UIOpacity) => void): void {
        const visit = (node: Node): void => {
            action(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) action(opacity);
            node.children.forEach(visit);
        };
        if (this.overlay?.isValid) visit(this.overlay);
    }

    private stopAnimation(): void {
        this.visitAnimationTargets(target => Tween.stopAllByTarget(target));
    }

    private readonly layout = (): void => {
        const root = this.overlay;
        if (!root?.isValid || !this.services) return;
        const size = view.getVisibleSize();
        const width = size.width || 750, height = size.height || 1334;
        root.getComponent(UITransform)!.setContentSize(width, height);
        const graphics = root.getComponent(Graphics)!;
        graphics.clear(); graphics.fillColor = new Color(18, 22, 43, 255);
        graphics.rect(-width / 2, -height / 2, width, height); graphics.fill();
        const background = root.getChildByName('AwardBackground')?.getComponent(Sprite);
        if (background) this.services.art.fit(background, width, height, 'cover');
        const safe = calculateSafeContentBounds(width, height, this.services.platform.getLayoutInfo(), 20);
        const scale = Math.min(1, Math.max(1, safe.width - 40) / CONTENT_WIDTH,
            Math.max(1, safe.height - 24) / CONTENT_HEIGHT);
        this.content?.setScale(scale, scale, 1);
        this.content?.setPosition(safe.centerX, safe.centerY);
        this.rays?.setScale(scale, scale, 1);
        this.rays?.setPosition(safe.centerX, safe.centerY + STAGE_Y * scale);
        const back = this.backButton;
        if (back?.isValid) {
            const backScale = Math.min(1, safe.width / 750);
            back.setScale(backScale, backScale, 1);
            back.setPosition(safe.leftX + 16 + 42 * backScale, safe.topY - 42 * backScale);
        }
    };
}

import {
    _decorator, BlockInputEvents, Camera, Canvas, Component, EventTouch, Graphics, Node, Sprite, SpriteFrame,
    UITransform, Vec3, view,
} from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { BOT_PROFILES, SlingPuckBot } from './SlingPuckBot';
import { SlingPuckHud, type SlingMode } from './SlingPuckHud';
import { calculateSlingPuckLayout, type SlingPuckLayout } from './SlingPuckLayout';
import { SIDES, SLING_RULES, SLING_WORLD as W, SlingPuckModel, type GrabDenial, type ShotDenial, type Side, type SlingEvent } from './SlingPuckModel';
import { unproject } from './SlingPuckProjection';
import {
    SIDE_COLOR, SLING_AUDIO, SLING_FRAMES, SLING_TABLE, SLING_THEME as T, type SlingFrame,
} from './SlingPuckTheme';
import { color, easeOutBack, easeOutCubic, SlingPuckUi } from './SlingPuckUi';
import { SlingPuckView } from './SlingPuckView';

const { ccclass } = _decorator;
const BUNDLE = 'game-sling-puck-assets';
const LEVEL_NAMES = ['简单', '普通', '困难'];
interface Services { assets: AssetService; platform: Platform; audio: AudioService; feedback: FeedbackService; storage: StorageService; }
type State = 'idle' | 'ready' | 'playing' | 'paused' | 'finished' | 'disposed';
interface Finger { side: Side; puck: number; offsetX: number; offsetY: number }

@ccclass('SlingPuckGame')
export class SlingPuckGame extends Component implements MiniGame<Services> {
    private context?: MiniGameContext<Services>;
    private state: State = 'idle';
    private loading?: Promise<void>;
    private frames?: Readonly<Record<SlingFrame, SpriteFrame>>;
    private audioBank?: BundleAudioBank;
    private uiCamera?: Camera;
    private unsubscribeLayout?: Unsubscribe;
    private layout?: SlingPuckLayout;
    private ui?: SlingPuckUi;
    private floor?: Graphics;
    private tableTop?: Node;
    private stage?: Node;
    private input?: Node;
    private rink?: SlingPuckView;
    private hud?: SlingPuckHud;
    private overlay?: Node;
    private overlayShade = 150;
    private startButton?: Node;
    private model = new SlingPuckModel();
    private bot?: SlingPuckBot;
    private mode: SlingMode = 'cpu';
    private difficulty = 1;
    private tutorialSeen = false;
    private readonly fingers = new Map<number, Finger>();
    private readonly touchScreen = new Vec3();
    private readonly touchWorld = new Vec3();
    private readonly touchLocal = new Vec3();
    private lastHitSound = 0;
    private lastWallSound = 0;
    private clock = 0;
    private resultRequested = false;

    async initialize(context: MiniGameContext<Services>): Promise<void> {
        if (this.state !== 'idle') throw Error('SlingPuck already initialized');
        this.uiCamera = this.node.parent?.getComponent(Canvas)?.cameraComponent;
        if (!this.uiCamera) throw Error('Missing SlingPuck Canvas camera');
        this.context = context;
        const saved = context.services.storage.getGameData(context.gameId)?.custom;
        if (saved?.slingMode === 'cpu' || saved?.slingMode === 'local') this.mode = saved.slingMode;
        this.tutorialSeen = saved?.slingGuideSeen === true;
        const level = Number(saved?.slingDifficulty);
        if (Number.isInteger(level) && level >= 0 && level < BOT_PROFILES.length) this.difficulty = level;
        this.loading = this.prepare(context);
        try { await this.loading; } finally { this.loading = undefined; }
    }

    private async prepare(context: MiniGameContext<Services>): Promise<void> {
        const keys = Object.keys(SLING_FRAMES) as SlingFrame[];
        const frames = await context.services.assets.loadSpriteFrames(BUNDLE,
            keys.map(key => ({ key, path: PACKED_SPRITE_PATHS[`${SLING_FRAMES[key]}/spriteFrame`], type: 'frame' as const })));
        if (this.state === 'disposed') {
            Object.keys(frames).forEach(key => context.services.assets.releaseRuntimeAsset(frames[key])); return;
        }
        this.frames = frames as Record<SlingFrame, SpriteFrame>;
        this.audioBank = new BundleAudioBank(SLING_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as State) === 'disposed') return;
        this.build();
        view.on('canvas-resize', this.applyLayout, this);
        this.unsubscribeLayout = context.services.platform.onLayoutChange(this.applyLayout);
        this.state = 'ready';
        this.newMatch(); this.applyLayout();
    }

    begin(): void { if (this.state === 'ready') this.showReady(); }
    isGameplayActive(): boolean { return this.state === 'playing'; }
    pause(): boolean {
        if (this.state !== 'playing') return false;
        this.state = 'paused'; this.releaseFingers(); this.hud?.sync(this.model); this.audioBank?.stopEffects(); this.context?.services.audio.pauseMusic(); return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.releaseFingers(); this.state = 'playing'; this.context?.services.audio.resumeMusic();
    }
    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.clearOverlay(); this.releaseFingers(); this.audioBank?.stopEffects();
        this.context?.services.audio.resumeMusic(); this.audioBank?.restartMusic();
        this.newMatch(); this.startMatch();
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.state = 'disposed'; this.fingers.clear(); this.bot?.reset(); this.bot = undefined;
        view.off('canvas-resize', this.applyLayout, this); this.unsubscribeLayout?.(); this.unsubscribeLayout = undefined;
        this.audioBank?.dispose();
        this.input?.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.input?.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.input?.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.input?.off(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        await this.loading?.catch(() => undefined);
        this.ui?.clear();
        for (const sprite of this.node.getComponentsInChildren(Sprite)) sprite.spriteFrame = null;
        this.clearOverlay();
        for (const child of this.node.children.slice()) child.destroy();
        if (this.frames) Object.keys(this.frames).forEach(key => this.context?.services.assets.releaseRuntimeAsset(this.frames![key as SlingFrame]));
        this.context = this.frames = this.audioBank = this.layout = this.ui = this.rink = this.hud = undefined;
        this.floor = this.tableTop = this.stage = this.input = this.overlay = undefined;
        this.uiCamera = undefined;
    }

    update(dt: number): void {
        if (this.state === 'disposed' || !this.ui || !this.rink || !this.hud) return;
        const frame = Math.min(dt, .1);
        this.clock += frame;
        this.ui.tick(frame);
        if (this.startButton?.isValid && this.startButton.getChildByName('Face')!.position.y === 0) {
            const s = 1 + Math.sin(this.clock * 4) * .025; this.startButton.setScale(s, s, 1);
        }
        if (this.state === 'playing') {
            const step = frame;
            this.bot?.update(step);
            this.model.advance(step);
            this.consumeEvents();
            this.hud.setOpponentStatus(this.bot?.status ?? '');
            this.hud.sync(this.model, step);
            this.rink.render(this.model, step);
        } else if (this.state !== 'paused') {
            this.rink.render(this.model, frame);
        }
    }

    // ── Match ────────────────────────────────────────────────────────────────

    private newMatch(): void {
        this.bot?.reset(); this.model.releaseAll();
        this.model = new SlingPuckModel();
        this.bot = this.mode === 'cpu' ? new SlingPuckBot(this.model, 'north', BOT_PROFILES[this.difficulty]) : undefined;
        this.resultRequested = false; this.fingers.clear();
        this.rink?.reset(this.model);
        if (this.rink) this.rink.tutorialEnabled = !this.tutorialSeen;
        if (this.rink) this.rink.guideSides = this.mode === 'cpu' ? ['south'] : ['south', 'north'];
        this.hud?.configure(this.mode, BOT_PROFILES[this.difficulty].name, LEVEL_NAMES[this.difficulty]);
        this.hud?.resetCounts(); this.hud?.sync(this.model);
        this.context?.reportScore(0);
    }

    private startMatch(): void {
        this.state = 'playing'; this.applyLayout();
        this.hud?.setPauseVisible(true);
        this.announceRound();
    }

    private announceRound(): void {
        this.hud!.countdown('准备');
    }

    private consumeEvents(): void {
        const feedback = this.context?.services.feedback, hud = this.hud!, rink = this.rink!, m = this.model;
        for (const event of m.drainEvents()) {
            rink.onEvent(event);
            switch (event.type) {
                case 'countdown':
                    // The round banner covers the first second; the digits take over after it.
                    if (event.value < SLING_RULES.countdownSeconds) { hud.countdown(String(event.value)); feedback?.play('popup', { vibrate: false }); }
                    break;
                case 'start':
                    hud.countdown('开始', T.brass, 96); feedback?.play('continue', { vibrate: false });
                    break;
                case 'grab':
                    if (this.isHuman(event.side)) feedback?.play('fold', { vibrate: false, volume: .7 });
                    break;
                case 'launch':
                    if (this.isHuman(event.side) && !this.tutorialSeen) { this.tutorialSeen = true; this.rink!.tutorialEnabled = false; this.saveSettings(); }
                    feedback?.play('toggle', { variant: event.power > .6 ? 1 : 0, volume: .55 + event.power * .45, vibrate: this.isHuman(event.side) });
                    break;
                case 'puckHit':
                    if (this.clock - this.lastHitSound > .045) {
                        this.lastHitSound = this.clock;
                        feedback?.play('collision', { variant: event.impulse > 900 ? 1 : 0, volume: Math.min(1, .25 + event.impulse / 1400), vibrate: false });
                    }
                    break;
                case 'wallHit':
                    if (this.clock - this.lastWallSound > .06) {
                        this.lastWallSound = this.clock;
                        feedback?.play('drop', { volume: Math.min(1, .2 + event.impulse / 1800), vibrate: false });
                    }
                    break;
                case 'gate': this.onGate(event); break;
                case 'finalSeconds': hud.banner('最后 10 秒', 'bannerNorth', '', 1.2); break;
                case 'suddenDeath':
                    hud.banner('加时赛', 'bannerGold', '领先并保持片刻即可获胜', 1.8);
                    feedback?.play('record', { vibrate: false });
                    break;
                case 'roundEnd': this.onRoundEnd(event.winner, event.reason); break;
                case 'matchEnd': this.finishMatch(); return;
                default: break;
            }
        }
    }

    private onGate(event: Extract<SlingEvent, { type: 'gate' }>): void {
        const feedback = this.context?.services.feedback, hud = this.hud!, m = this.model;
        if (!event.own) { feedback?.play('chain', { volume: .45, vibrate: false }); return; }
        feedback?.play('chain', { vibrate: this.isHuman(event.from) });
        const shown = this.mode === 'local' || event.from === 'south';
        if (event.clean) {
            feedback?.play('record', { vibrate: false, volume: .8 });
            if (shown) hud.callout('穿针!', T.brass, event.x, event.from);
        } else if (event.combo >= 2 && shown) {
            hud.callout(event.combo >= 3 ? `冰爆 ×${event.combo}` : `连射 ×${event.combo}`, SIDE_COLOR[event.from], event.x, event.from);
        }
        // The puck that empties a half plays out in slow motion.
        if (m.count(event.from) === 0 && m.phase === 'play') this.rink!.kick(5);
    }

    private onRoundEnd(winner: Side | undefined, reason: 'clear' | 'time' | 'sudden'): void {
        const feedback = this.context?.services.feedback, hud = this.hud!, m = this.model;
        this.releaseFingers();
        if (!winner) { hud.banner('平局', 'bannerGold', '', 1.4); return; }
        const sub = reason === 'time' ? '时间到 · 剩余冰球更少' : reason === 'sudden' ? '加时领先' : '';
        if (this.mode === 'cpu') {
            const won = winner === 'south';
            hud.banner(won ? '胜利' : '惜败', won ? 'bannerGold' : 'bannerNorth', sub, 2.2);
            if (!m.winner) feedback?.play(won ? 'merge' : 'danger', { vibrate: won });
        } else {
            for (const side of SIDES) hud.banner(winner === side ? '胜利' : '对手获胜', winner === side ? 'bannerGold' : side === 'south' ? 'bannerSouth' : 'bannerNorth', sub, 2.2, side);
            if (!m.winner) feedback?.play('merge', { vibrate: true });
        }
        this.context?.reportScore(m.roundWins.south);
    }

    private finishMatch(): void {
        if (this.resultRequested) return;
        this.resultRequested = true; this.state = 'finished'; this.releaseFingers();
        this.hud?.sync(this.model); this.hud?.setPauseVisible(false);
        const won = !!this.model.winner && (this.mode === 'local' || this.model.winner === 'south');
        this.context?.services.feedback.play(won ? 'milestone' : 'failure', { vibrate: true });
        this.saveMatch();
        this.context?.reportRoundFinished?.();
        this.context?.requestExit(this.result(true));
    }

    private isHuman(side: Side): boolean { return this.mode === 'local' || side === 'south'; }

    // ── Build ────────────────────────────────────────────────────────────────

    private build(): void {
        const ui = this.ui = new SlingPuckUi(this.node.layer, this.frames!,
            () => this.context?.services.feedback.play('uiButton', { vibrate: false }), () => this.state !== 'disposed');
        this.floor = ui.make('Floor', this.node, 750, 1334).addComponent(Graphics);
        this.tableTop = ui.sprite('SlateTable', this.node, 'table', SLING_TABLE.width, SLING_TABLE.height).node;
        this.input = ui.make('TouchSurface', this.node, 750, 1334);
        this.input.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.input.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.input.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.input.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        this.stage = ui.make('Stage', this.node);
        this.rink = new SlingPuckView(ui, this.stage);
        this.hud = new SlingPuckHud(ui, this.node, () => { if (this.state === 'playing') this.context?.requestPause(); });
    }

    private applyLayout = (): void => {
        if (!this.context || !this.stage || !this.hud || !this.floor || !this.tableTop || !this.input) return;
        const size = view.getVisibleSize();
        const layout = this.layout = calculateSlingPuckLayout(size.width, size.height, this.context.services.platform.getLayoutInfo(), this.mode === 'local');
        this.releaseFingers();
        this.stage.active = this.state !== 'ready';
        this.node.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.input.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.floor.clear(); this.floor.fillColor = color(T.table); this.floor.rect(-size.width / 2, -size.height / 2, size.width, size.height); this.floor.fill();
        const cover = Math.max(size.width / SLING_TABLE.width, size.height / SLING_TABLE.height);
        this.tableTop.setScale(cover, cover, 1);
        this.stage.setPosition(layout.boardX, layout.boardY);
        this.stage.setScale(layout.scale, layout.scale, 1);
        this.hud.place(layout);
        if (this.overlay) this.positionOverlay();
    };

    // ── Input ────────────────────────────────────────────────────────────────

    private touchStart(event: EventTouch): void {
        if (this.state !== 'playing' || this.model.phase !== 'play') return;
        const p = this.touchPoint(event), side: Side = p.y < 0 ? 'south' : 'north';
        if (!this.isHuman(side)) {
            if (this.model.pucks.some(q => Math.hypot(q.x - p.x, q.y - p.y) < W.puckRadius * 1.75)) this.hud?.notify('south', '只能拿自己半场的冰球', T.coral);
            return;
        }
        const finger: Finger = { side, puck: -1, offsetX: 0, offsetY: 0 };
        this.fingers.set(event.getID(), finger);
        this.tryGrab(finger, p.x, p.y);
        event.propagationStopped = true;
    }
    private touchMove(event: EventTouch): void {
        const finger = this.fingers.get(event.getID());
        if (!finger || this.state !== 'playing') return;
        const p = this.touchPoint(event);
        finger.offsetX *= .75; finger.offsetY *= .75;
        if (finger.puck >= 0) this.model.drag(finger.puck, p.x + finger.offsetX, p.y + finger.offsetY);
        event.propagationStopped = true;
    }
    private touchEnd(event: EventTouch): void {
        const finger = this.fingers.get(event.getID());
        if (!finger) return;
        if (finger.puck >= 0) {
            const p = this.touchPoint(event); this.model.drag(finger.puck, p.x + finger.offsetX, p.y + finger.offsetY);
            const feedback = this.model.shotFeedback(finger.side);
            if (!this.model.release(finger.puck)) {
                const messages: Record<ShotDenial, string> = { notPulling: '压上弹力带，向后拉', weak: '力度太小，再向后拉一点', blocked: '冰球挡住了，换个位置', cooldown: '出手太快了，稍等一下' };
                this.hud?.notify(finger.side, messages[feedback.reason ?? 'notPulling'], T.coral);
            }
        }
        this.fingers.delete(event.getID()); event.propagationStopped = true;
    }
    private touchCancel(event: EventTouch): void {
        const finger = this.fingers.get(event.getID());
        if (finger?.puck >= 0) this.model.drop(finger.puck);
        this.fingers.delete(event.getID()); event.propagationStopped = true;
    }
    private tryGrab(finger: Finger, x: number, y: number): void {
        const id = this.model.grab(finger.side, x, y);
        if (id < 0) {
            let nearest = this.model.pucks[0], distance = W.puckRadius * 1.75;
            let found = false;
            for (const q of this.model.pucks) { const d = Math.hypot(q.x - x, q.y - y); if (d < distance) { nearest = q; distance = d; found = true; } }
            if (found) {
                const reason = this.model.grabDenial(finger.side, nearest);
                const messages: Record<GrabDenial, string> = { notPlaying: '等待倒计时结束', alreadyHolding: '一次只能拿一枚', otherHalf: '只能拿自己半场的冰球', held: '这枚球正被拿着', moving: '球还在滑动，等它慢下来' };
                if (reason) this.hud?.notify(finger.side, messages[reason], T.coral);
            }
            return;
        }
        const puck = this.model.pucks[id];
        finger.puck = id; finger.offsetX = puck.x - x; finger.offsetY = puck.y - y;
    }
    private touchPoint(event: EventTouch): { x: number; y: number } {
        const p = event.getLocation();
        this.touchScreen.set(p.x, p.y, 0);
        const world = this.uiCamera!.screenToWorld(this.touchScreen, this.touchWorld);
        const local = this.stage!.getComponent(UITransform)!.convertToNodeSpaceAR(world, this.touchLocal);
        // Fingers rest on the puck tops, half a puck above the ice.
        return unproject(local.x, local.y, 8);
    }
    private releaseFingers(): void {
        for (const finger of this.fingers.values()) if (finger.puck >= 0) this.model.drop(finger.puck);
        this.fingers.clear();
    }

    // ── Screens ──────────────────────────────────────────────────────────────

    private showReady(): void {
        this.clearOverlay(); this.state = 'ready'; this.hud!.root.active = false; this.hud!.clearMessages(); this.applyLayout();
        const ui = this.ui!, overlay = this.overlay = ui.make('SlingReady', this.node, 750, 1334);
        overlay.addComponent(BlockInputEvents);
        ui.roundButton('ReadyLobby', overlay, 'back', 72, () => this.context?.requestLobby(this.result()));
        ui.roundButton('SlingHelp', overlay, 'help', 72, () => this.showHelp());
        const content = ui.make('ReadyControls', overlay, 716, 1320);
        ui.sprite('Logo', content, 'logo', 660, 220).node.setPosition(0, 490);
        ui.sprite('MiniTable', content, 'miniBoard', 450, 280).node.setPosition(0, 278);
        const selectMode = (mode: SlingMode) => { if (mode !== this.mode) { this.mode = mode; this.saveSettings(); this.newMatch(); this.showReady(); } };
        for (const item of [{ mode: 'cpu' as SlingMode, text: '人机对战', frame: 'modeRobot' as SlingFrame },
            { mode: 'local' as SlingMode, text: '双人对战', frame: 'modePlayers' as SlingFrame }]) {
            const selected = this.mode === item.mode;
            const node = ui.make(`Mode-${item.mode}`, content, 314, 364), face = ui.make('Face', node, 314, 364);
            node.setPosition(item.mode === 'cpu' ? -174 : 174, -28);
            ui.sprite('Token', face, 'modeToken', 286, 286).node.setPosition(0, 28);
            const g = ui.make('Selection', face).addComponent(Graphics);
            if (selected) {g.strokeColor=color(T.teal,35);g.lineWidth=13;g.circle(0,28,134);g.stroke();}
            g.strokeColor = color(selected ? '#65F2FF' : '#8AABC5', selected ? 255 : 190); g.lineWidth = selected ? 5 : 2;
            g.circle(0, 28, 134); g.stroke();
            ui.sprite('ModeIcon', face, item.frame, 224, 224).node.setPosition(0, 30);
            if (selected) {
                g.fillColor = color('#061D30',170);g.circle(0,-106,29);g.fill();
                g.fillColor = color(T.teal); g.circle(0, -103, 25); g.fill();
                g.strokeColor = color('#A9F9FF');g.lineWidth=2;g.circle(0,-103,24);g.stroke();
                g.strokeColor = color('#0C3044'); g.lineWidth = 5; g.moveTo(-10,-102);g.lineTo(-2,-110);g.lineTo(12,-96);g.stroke();
            }
            ui.label('ModeTitle', node, item.text, 0, -166, 314, 54, { size: 38, color: T.white, shadow:true });
            ui.bind(node, () => selectMode(item.mode), face);
        }
        if (this.mode === 'cpu') {
            BOT_PROFILES.forEach((profile, i) => {
                const selected = this.difficulty === i, node = ui.make(`Level-${i}`, content, 180, 72), face = ui.make('Face', node, 180, 72);
                node.setPosition((i - 1) * 205, -278);
                ui.sprite('Chip',face,selected?'chipOn':'chipOff',180,72);
                ui.label('Text', face, profile.name, 0, 1, 160, 48, { size: 30, color: selected ? '#073143' : T.white });
                ui.bind(node, () => { this.difficulty = i; this.saveSettings(); this.newMatch(); this.showReady(); }, face);
            });
        } else {
            ui.label('LocalModeHint', content, '面对面 · 一人一边 · 同时开打', 0, -278, 650, 44, { size: 28, color: T.muted });
        }
        this.startButton = ui.roundButton('StartSling', content, 'play', 172, () => {
            if (this.state !== 'ready') return;
            this.clearOverlay(); this.hud!.root.active = true; this.newMatch(); this.startMatch();
        }, true);
        this.startButton.setPosition(0, -413);
        ui.label('StartCaption', content, '开始对战', 0, -522, 280, 42, { size: 30, color: T.white,shadow:true });
        ['按住', '后拉', '松手'].forEach((text, i) => {
            const x = (i - 1) * 190, step = ui.make(`Gesture-${i}`, content, 150, 68); step.setPosition(x, -590);
            const g = step.addComponent(Graphics); ui.drawIcon(g, i === 0 ? 'touch' : i === 1 ? 'pull' : 'release', T.ice, 1.2);
            ui.label('Hint', content, text, x, -643, 150, 32, { size: 26, color: T.muted });
            if(i<2)ui.label('Arrow',content,'→',x+95,-590,42,32,{size:27,color:T.muted});
        });
        this.positionOverlay();
    }
    private showHelp(): void {
        const ui = this.ui!, content = this.createOverlay('SlingHelpView', 620, 480, 130);
        ui.label('Title', content, '拉住 · 后拉 · 松手', 0, 130, 600, 76, { size: 40, shadow: true });
        ui.label('Rule', content, '把自己半场的冰球全部弹过中央窄门', 0, 45, 600, 42, { size: 24, color: T.paper });
        ui.label('LocalHint', content, '双人同屏：一人一边，同时出手', 0, -10, 600, 40, { size: 24, color: T.muted });
        ui.roundButton('CloseSlingHelp', content, 'back', 88, () => this.showReady()).setPosition(0, -130);
        this.positionOverlay();
    }
    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        const content = this.createOverlay('SlingPauseMenu', 640, this.mode === 'local' ? 780 : 520, 135);
        const build = (parent: Node, north: boolean) => {
            const ui = this.ui!, group = ui.make(north ? 'NorthPauseActions' : 'SouthPauseActions', parent, 600, 330);
            group.angle = north ? 180 : 0; group.setPosition(0, this.mode === 'local' ? north ? 210 : -210 : 0);
            ui.label('Title', group, '暂停', 0, 110, 480, 80, { size: 52, shadow: true });
            ui.roundButton(north ? 'ResumeSlingNorth' : 'ResumeSling', group, 'play', 136, model.resume, true).setPosition(0, -4);
            ui.roundButton(north ? 'RestartSlingNorth' : 'RestartSling', group, 'restart', 80, model.restart).setPosition(-160, -15);
            ui.roundButton(north ? 'LeaveSlingNorth' : 'LeaveSling', group, 'home', 80, model.exit).setPosition(160, -15);
        };
        build(content, false); if (this.mode === 'local') build(content, true); this.positionOverlay();
    }
    hidePauseMenu(): void { this.clearOverlay(); }
    showResultView(model: MiniGameResultModel): void {
        const m = this.model, ui = this.ui!, local = this.mode === 'local';
        const content = this.createOverlay('SlingResult', 640, local ? 940 : 740, 130);
        const build = (side: Side, y: number) => {
            const group = ui.make(`Result-${side}`, content, 620, local ? 420 : 720);
            group.setPosition(0, y); group.angle = side === 'north' ? 180 : 0;
            const won = m.winner === side, draw = !m.winner;
            const heroY = local ? 125 : 150;
            if (won) ui.sprite('Trophy', group, 'trophy', local ? 120 : 210, local ? 120 : 210).node.setPosition(0, heroY);
            else if (draw) {
                const mark = ui.make('DrawMark', group, 100, 100).addComponent(Graphics);
                mark.node.setPosition(0, heroY); ui.drawIcon(mark, 'users', T.muted, 2);
            } else ui.sprite('WinnerAvatar', group, local ? side === 'south' ? 'medalNorth' : 'medalSouth' : 'medalBot', 70, 70).node.setPosition(0, heroY);
            ui.label('Title', group, draw ? '平局' : won ? '胜利' : '惜败', 0, local ? 20 : -5, 500, 90,
                { size: local ? 54 : 72, color: draw ? T.white : won ? T.brass : T.paper, shadow: true });
            const order: Side[] = side === 'south' ? ['south', 'north'] : ['north', 'south'];
            order.forEach((team, i) => {
                const x = i === 0 ? -110 : 110;
                ui.sprite(`Avatar-${team}`, group, team === 'north' && !local ? 'medalBot' : team === 'south' ? 'medalSouth' : 'medalNorth', 52, 52).node.setPosition(x - 38, local ? -58 : -110);
                ui.label(`Count-${team}`, group, String(m.count(team)), x + 28, local ? -58 : -110, 64, 62, { size: 42, color: SIDE_COLOR[team] });
            });
            ui.label('Colon', group, ':', 0, local ? -58 : -110, 36, 60, { size: 38, color: T.muted });
            if (local) {
                ui.roundButton(side === 'south' ? 'PlayAgainSling' : 'PlayAgainSlingNorth', group, 'restart', 88, model.restart, true).setPosition(-64, -154);
                ui.roundButton(side === 'south' ? 'ResultLobbySling' : 'ResultLobbySlingNorth', group, 'home', 64, model.returnToLobby).setPosition(72, -154);
            } else {
                ui.label('Stats', group, `${Math.floor(m.elapsed / 60)}:${(Math.floor(m.elapsed % 60) < 10 ? '0' : '') + Math.floor(m.elapsed % 60)}  ·  ${m.stats.south.through} 次过门`, 0, -178, 480, 34, { size: 22, color: T.muted });
                ui.roundButton('PlayAgainSling', group, 'restart', 136, model.restart, true).setPosition(-66, -288);
                ui.roundButton('ResultLobbySling', group, 'home', 86, model.returnToLobby).setPosition(116, -288);
            }
        };
        build('south', local ? -235 : 0);
        if (local) {
            build('north', 235);
        }
        this.positionOverlay();
    }
    hideResultView(): void { this.clearOverlay(); }
    private createOverlay(name: string, width: number, height: number, shade: number): Node {
        this.clearOverlay(); const ui = this.ui!;
        this.overlay = ui.make(name, this.node, 750, 1334); this.overlay.addComponent(BlockInputEvents); this.overlayShade = shade;
        ui.make('Shade', this.overlay, 750, 1334).addComponent(Graphics);
        const holder = ui.make('DialogPanel', this.overlay, width, height), content = ui.make('Content', holder, width, height);
        const fade = ui.opacity(content, 0);
        ui.animate(.25, t => { fade.opacity = Math.round(255 * t); }, content); return content;
    }
    private positionOverlay(): void {
        if (!this.overlay || !this.layout) return;
        const ui = this.ui!, size = view.getVisibleSize(), safe = this.layout.safe;
        this.overlay.getComponent(UITransform)!.setContentSize(size.width, size.height);
        const ready = this.overlay.getChildByName('ReadyControls');
        if (ready) {
            const k = Math.max(.01, Math.min(1, (safe.width - 32) / 716, (safe.height - 94) / 1320));
            ready.setPosition(safe.centerX, safe.centerY - 30 * k); ready.setScale(k,k,1);
            this.overlay.getChildByName('ReadyLobby')?.setPosition(safe.leftX + 46, safe.topY - 44);
            this.overlay.getChildByName('SlingHelp')?.setPosition(safe.rightX - 46, safe.topY - 44);
            return;
        }
        const shade = this.overlay.getChildByName('Shade')!.getComponent(Graphics)!;
        shade.clear(); shade.fillColor = color(T.shade, this.overlayShade); shade.rect(-size.width/2,-size.height/2,size.width,size.height); shade.fill();
        const holder = this.overlay.getChildByName('DialogPanel')!, dimensions = holder.getComponent(UITransform)!;
        const k = Math.max(.01, Math.min(1,(safe.width-32)/dimensions.width,(safe.height-32)/dimensions.height));
        holder.setPosition(safe.centerX,safe.centerY); holder.setScale(k,k,1);
    }

    private clearOverlay(): void {
        this.startButton = undefined;
        if (!this.overlay) return;
        this.overlay.active = false; this.overlay.destroy(); this.overlay = undefined;
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    private result(completed = false): GameResult {
        const m = this.model;
        return { score: m.roundWins.south, duration: Math.round(m.elapsed * 1000), completed,
            extra: { mode: this.mode, difficulty: this.difficulty, winner: m.winner ?? '', south: m.roundWins.south,
                north: m.roundWins.north, rounds: m.round, through: m.stats.south.through, clean: m.stats.south.clean } };
    }
    private saveSettings(): void {
        if (!this.context) return;
        const { storage } = this.context.services, old = storage.getGameData(this.context.gameId);
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }),
            custom: { ...old?.custom, slingMode: this.mode, slingDifficulty: this.difficulty, slingGuideSeen: this.tutorialSeen } });
    }
    private saveMatch(): void {
        if (!this.context || this.mode !== 'cpu' || this.model.winner !== 'south') return;
        const { storage } = this.context.services, old = storage.getGameData(this.context.gameId);
        const key = `slingWins${this.difficulty}`;
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }),
            custom: { ...old?.custom, [key]: (Number(old?.custom?.[key]) || 0) + 1 } });
    }
}


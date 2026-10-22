import {
    _decorator, BlockInputEvents, Camera, Canvas, Color, Component, EventTouch, Graphics,
    JsonAsset, Label, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, view,
} from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { setLabelBold } from '../../../services/font/FontBinding';
import { calculatePingPongLayout, PINGPONG_HUD as H, PINGPONG_NET_HUD as N } from './PingPongLayout';
import { PingPongModel, PINGPONG_WORLD as W, clamp, pingPongCurve, validatePingPongConfig,
    type PingPongConfig, type PingPongEvent, type PingPongMode, type Player } from './PingPongModel';
import { PINGPONG_AUDIO, PINGPONG_HIT_TIERS, PINGPONG_THEME as T } from './PingPongTheme';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';

const { ccclass } = _decorator;
const BUNDLE = 'game-pingpong-assets', U = 30, BACKDROP = { width: 750, height: 1334 };
const FRAMES = Object.freeze({
    'paddle-red': 'visual/objects/paddle-red', 'paddle-black': 'visual/objects/paddle-black',
    Cerchio_128: 'visual/objects/Cerchio_128', Cerchio_128_Bucato: 'visual/objects/Cerchio_128_Bucato',
    Impatto: 'visual/objects/Impatto', 'arena-floor': 'visual/backdrop/arena-floor',
    'ready-hero': 'visual/ui/ready-hero-v2',
});
type FrameKey = keyof typeof FRAMES;
const PLAYERS: readonly Player[] = ['red', 'blue'];
/** Model ids stay red/blue; the skin plays red rubber against black rubber. */
const PADDLE_FRAME: Readonly<Record<Player, FrameKey>> = { red: 'paddle-red', blue: 'paddle-black' };
const ACCENT: Readonly<Record<Player, string>> = { red: '#FF6B5E', blue: T.blackAccent };
const FLIP_HALF = .11, BANNER_SECONDS = .95;
const READY_BACK_SIZE = 76, READY_BACK_MARGIN = 16;
interface Services { assets: AssetService; platform: Platform; audio: AudioService; feedback: FeedbackService; storage: StorageService; }
type State = 'idle' | 'ready' | 'playing' | 'paused' | 'finished' | 'disposed';
interface TouchControl { player: Player; x: number; z: number; previousX: number; previousZ: number; }
interface Action { name: string; text: string; run: () => void | Promise<void>; }
interface Impact { node: Node; sprites: Sprite[]; age: number; }
interface ScoreView { player: Player; card: Node; digits: Label; name?: Label; pips?: Graphics; serve: Node; shown: number; flip?: { age: number; value: number; swapped: boolean } }
interface Banner { node: Node; opacity: UIOpacity; text: Label; stripe: Graphics; age: number }

@ccclass('PingPongGame')
export class PingPongGame extends Component implements MiniGame<Services> {
    private context?: MiniGameContext<Services>;
    private state: State = 'idle';
    private config?: PingPongConfig;
    private model?: PingPongModel;
    private mode: PingPongMode = 'cpu';
    private difficulty = 0;
    private loading?: Promise<void>;
    private frames?: Readonly<Record<FrameKey, SpriteFrame>>;
    private audioBank?: BundleAudioBank;
    private uiCamera?: Camera;
    private unsubscribeLayout?: Unsubscribe;
    private layout?: ReturnType<typeof calculatePingPongLayout>;
    private floor?: Graphics;
    private backdrop?: Node;
    private stage?: Node;
    private world?: Node;
    private hud?: Node;
    private overlay?: Node;
    private ball?: Node;
    private shadow?: Node;
    private belowShadow?: Node;
    private ballScale = 1;
    private trailGraphics?: Graphics;
    private impactRoot?: Node;
    private tableShadowMask?: Node;
    private serveHint?: Node;
    private banner?: Banner;
    private rallyCount?: Label;
    private readonly paddleViews = new Map<Player, Node>();
    private readonly shadowViews = new Map<Player, Node>();
    /** Top scoreboard and net-side widget both stay in sync; the layout shows one of them. */
    private readonly scoreViews: ScoreView[] = [];
    private readonly touches = new Map<number, TouchControl>();
    private readonly trail: { x: number; z: number; life: number }[] = [];
    private readonly impacts: Impact[] = [];
    private resultRequested = false;

    async initialize(context: MiniGameContext<Services>): Promise<void> {
        if (this.state !== 'idle') throw Error('PingPong already initialized');
        this.uiCamera = this.node.parent?.getComponent(Canvas)?.cameraComponent;
        if (!this.uiCamera) throw Error('Missing PingPong Canvas camera');
        this.context = context;
        const saved = context.services.storage.getGameData(context.gameId)?.custom;
        if (saved?.pingPongMode === 'cpu' || saved?.pingPongMode === 'local') this.mode = saved.pingPongMode;
        if (Number.isInteger(saved?.pingPongDifficulty) && Number(saved?.pingPongDifficulty) >= 0 && Number(saved?.pingPongDifficulty) < 3) {
            this.difficulty = Number(saved?.pingPongDifficulty);
        }
        this.loading = this.prepare(context);
        try { await this.loading; } finally { this.loading = undefined; }
    }

    private async prepare(context: MiniGameContext<Services>): Promise<void> {
        const source = await context.services.assets.loadAsset(BUNDLE, 'configs/original', JsonAsset);
        if (this.state === 'disposed') return;
        this.config = validatePingPongConfig(source.json);
        const keys = Object.keys(FRAMES) as FrameKey[];
        const frames = await context.services.assets.loadSpriteFrames(BUNDLE,
            keys.map(key => ({ key, path: PACKED_SPRITE_PATHS[`${FRAMES[key]}/spriteFrame`], type: 'frame' as const })));
        if ((this.state as State) === 'disposed') {
            Object.keys(frames).forEach(key => context.services.assets.releaseRuntimeAsset(frames[key])); return;
        }
        this.frames = frames as Record<FrameKey, SpriteFrame>;
        this.audioBank = new BundleAudioBank(PINGPONG_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as State) === 'disposed') return;
        this.build();
        view.on('canvas-resize', this.applyLayout, this);
        this.unsubscribeLayout = context.services.platform.onLayoutChange(this.applyLayout);
        this.state = 'ready';
        this.resetModel(); this.applyLayout();
    }

    begin(): void { if (this.state === 'ready') this.showReady(); }
    isGameplayActive(): boolean { return this.state === 'playing'; }
    pause(): boolean {
        if (this.state !== 'playing') return false;
        this.state = 'paused'; this.clearTouches(); this.audioBank?.stopEffects(); this.context?.services.audio.pauseMusic(); return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.clearTouches(); this.state = 'playing'; this.context?.services.audio.resumeMusic();
    }
    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.clearTouches(); this.audioBank?.stopEffects(); this.context?.services.audio.resumeMusic();
        this.state = 'ready'; this.resetModel(); this.showReady();
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.state = 'disposed'; this.clearTouches(); this.model?.dispose();
        view.off('canvas-resize', this.applyLayout, this); this.unsubscribeLayout?.(); this.unsubscribeLayout = undefined;
        this.audioBank?.dispose();
        this.stage?.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.stage?.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.stage?.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.stage?.off(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        await this.loading?.catch(() => undefined);
        for (const sprite of this.node.getComponentsInChildren(Sprite)) sprite.spriteFrame = null;
        this.clearOverlay(); this.stage?.destroy(); this.hud?.destroy(); this.backdrop?.destroy(); this.floor?.node.destroy();
        if (this.frames) Object.keys(this.frames).forEach(key => this.context?.services.assets.releaseRuntimeAsset(this.frames![key as FrameKey]));
        this.paddleViews.clear(); this.shadowViews.clear(); this.scoreViews.length = 0; this.trail.length = this.impacts.length = 0;
        this.context = this.config = this.frames = this.model = this.audioBank = this.layout = undefined;
        this.stage = this.world = this.hud = this.ball = this.shadow = this.belowShadow = this.backdrop = undefined;
        this.floor = this.trailGraphics = undefined;
        this.uiCamera = undefined;
        this.impactRoot = this.tableShadowMask = this.serveHint = undefined;
        this.banner = undefined; this.rallyCount = undefined;
    }

    update(dt: number): void {
        if (this.state === 'disposed' || !this.model) return;
        // Score flips and point banners finish even after the match settles or pauses.
        this.animateHud(Math.min(dt, .1));
        if (this.state !== 'playing') return;
        const model = this.model;
        for (const control of Array.from(this.touches.values())) {
            model.keep(control.player, control.x, control.z, control.x - control.previousX, control.z - control.previousZ);
            control.previousX = control.x; control.previousZ = control.z;
        }
        model.advance(dt);
        this.consumeEvents(); this.animate(Math.min(dt, .1)); this.render();
        if (model.winner && !this.resultRequested) {
            this.resultRequested = true; this.state = 'finished'; this.clearTouches(); this.saveMatch();
            // The runtime may stop ticking once the result opens; settle the scoreboard on the final score now.
            this.syncScores(true); if (this.banner) this.banner.node.active = false;
            this.context?.requestExit(this.result(true));
        }
    }

    private resetModel(): void {
        this.model?.dispose(); this.model = new PingPongModel(this.config!, this.mode, this.difficulty);
        this.resultRequested = false; this.ballScale = 1;
        this.trail.length = 0; for (const impact of this.impacts) impact.node.active = false;
        if (this.banner) this.banner.node.active = false;
        this.context?.reportScore(0); this.applyLayout(); this.syncScores(true); this.render(); this.drawEffects();
    }

    // ── Build ────────────────────────────────────────────────────────────────

    private build(): void {
        this.floor = this.make('PingPongFloor', this.node, 750, 1334).addComponent(Graphics);
        this.backdrop = this.sprite('PingPongArena', this.node, 'arena-floor', BACKDROP.width, BACKDROP.height);
        this.stage = this.make('PingPongPlayfield', this.node, 750, 1334);
        this.stage.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.stage.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.stage.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.stage.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.stage.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        this.world = this.make('PingPongWorld', this.stage, 750, 1380);
        this.belowShadow = this.sprite('BallFloorShadow', this.world, 'Cerchio_128', 1.2387 * U, 1.2387 * U, '#000000', 70);
        this.ball = this.make('PingPongBall', this.world, U * 1.7, U * 1.7);
        this.buildBall(this.ball, 1.7 * U);
        this.drawCourt(this.make('Court', this.world, U * W.tableWidth, U * W.tableLength).addComponent(Graphics));
        this.serveHint = this.make('ServeHint', this.world, 9 * U, 1.4 * U);
        this.serveHint.setPosition(0, -4.4 * U);
        this.label('Text', this.serveHint, '向前推拍 · 发球', 0, 0, 9 * U, 1.4 * U, 26, T.cream, true).color = color(T.cream, 190);
        this.trailGraphics = this.make('BallTrail', this.world, 750, 1380).addComponent(Graphics);
        // All three native table shadows use SpriteMaskInteraction.VisibleInsideMask.
        // Preserve that distinction from the small unmasked floor shadow below the table.
        const tableShadowMask = this.tableShadowMask = this.make('TableShadowMask', this.world, 11.007208 * U, 20.801973 * U);
        tableShadowMask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.shadow = this.sprite('BallTableShadow', tableShadowMask, 'Cerchio_128', 2.064516 * U, 2.064516 * U, T.ballShadow, 80);
        for (const player of PLAYERS) {
            const shadow = this.sprite(`PaddleShadow-${player}`, tableShadowMask, PADDLE_FRAME[player], W.paddleWidth * U, W.paddleLength * U, '#000000', 80);
            if (player === 'blue') shadow.angle = 180;
            this.shadowViews.set(player, shadow);
        }
        this.ball.setSiblingIndex(this.world.children.length - 1);
        this.impactRoot = this.make('Impacts', this.world, 750, 1380);
        for (const player of PLAYERS) {
            const paddle = this.sprite(`Paddle-${player}`, this.world, PADDLE_FRAME[player], W.paddleWidth * U, W.paddleLength * U);
            if (player === 'blue') paddle.angle = 180;
            this.paddleViews.set(player, paddle);
        }
        this.banner = this.buildBanner(this.stage);
        this.buildHud();
    }

    /** Orange 40 mm match ball: darker rim, warm core and a specular dot. */
    private buildBall(parent: Node, size: number): void {
        this.sprite('BallRim', parent, 'Cerchio_128', size, size, T.ballRim);
        this.sprite('BallCore', parent, 'Cerchio_128', size * .82, size * .82, T.ball).setPosition(size * .03, -size * .03);
        this.sprite('BallShine', parent, 'Cerchio_128', size * .26, size * .26, T.ballHighlight, 230).setPosition(-size * .17, size * .17);
    }

    /** Tournament table: floor shadow, front apron, blue top in the spotlight, white edges and a mesh net. */
    private drawCourt(g: Graphics): void {
        const hw = W.tableWidth * U / 2, hl = W.tableLength * U / 2, edge = .3 * U;
        rounded(g, -hw - .9 * U, -hl - 2.1 * U, hw * 2 + 1.8 * U, hl * 2 + 2.6 * U, 1.2 * U, T.tableShadow, 55);
        rounded(g, -hw - .4 * U, -hl - 1.4 * U, hw * 2 + .8 * U, hl * 2 + 1.6 * U, .6 * U, T.tableShadow, 90);
        rect(g, -hw, -hl - .62 * U, hw * 2, .7 * U, T.tableApron);
        rect(g, -hw, -hl - .62 * U, hw * 2, .12 * U, '#081A40');
        rect(g, -hw, -hl, hw * 2, hl * 2, T.table);
        // Spotlight falloff and a soft lacquer sheen down the left third.
        for (const [radius, alpha] of [[.95, 18], [.7, 18], [.45, 16]] as const) {
            g.fillColor = color(T.tableSheen, alpha); g.ellipse(0, 0, hw * radius * 1.05, hl * radius); g.fill();
        }
        rect(g, -hw * .66, -hl, hw * .34, hl * 2, '#FFFFFF', 7);
        rect(g, -hw, hl - edge, hw * 2, edge, T.tableLine);
        rect(g, -hw, -hl, hw * 2, edge, T.tableLine);
        rect(g, -hw, -hl, edge, hl * 2, T.tableLine);
        rect(g, hw - edge, -hl, edge, hl * 2, T.tableLine);
        rect(g, -.06 * U, -hl, .12 * U, hl * 2, T.tableLine, 230);
        const reach = hw + .75 * U, net = .52 * U;
        rect(g, -reach, -net / 2 - .55 * U, reach * 2, net, T.tableShadow, 70);
        rect(g, -reach, -net / 2, reach * 2, net, T.net, 215);
        g.strokeColor = color('#FFFFFF', 34); g.lineWidth = 1.2;
        for (let x = -reach + .3 * U; x < reach; x += .3 * U) { g.moveTo(x, -net / 2); g.lineTo(x, net / 2); }
        g.moveTo(-reach, 0); g.lineTo(reach, 0); g.stroke();
        rect(g, -reach, net / 2 - .17 * U, reach * 2, .17 * U, T.netTape);
        for (const side of [-1, 1]) {
            rounded(g, side * reach - .32 * U, -.62 * U, .64 * U, 1.24 * U, .2 * U, T.netPost);
            rect(g, side * reach - .2 * U, .1 * U, .4 * U, .34 * U, '#5C6170');
        }
    }

    private buildBanner(parent: Node): Banner {
        const node = this.make('PointBanner', parent, 420, 92);
        const opacity = node.addComponent(UIOpacity);
        const g = node.addComponent(Graphics);
        rounded(g, -210, -46 - 6, 420, 92, 46, '#000000', 90);
        rounded(g, -210, -46, 420, 92, 46, T.glass, 238);
        g.strokeColor = color(T.gold, 120); g.lineWidth = 2; g.roundRect(-209, -45, 418, 90, 45); g.stroke();
        const stripe = this.make('Stripe', node, 420, 92).addComponent(Graphics);
        const text = this.label('Text', node, '', 0, 0, 340, 60, 36, T.cream);
        node.active = false;
        return { node, opacity, text, stripe, age: 0 };
    }

    private buildHud(): void {
        this.hud = this.make('PingPongHUD', this.node, 750, 1334);
        const pause = () => { if (this.state === 'playing') this.context?.requestPause(); };
        const top = this.make('TopHUD', this.hud, 750, H.boardHeight);
        this.iconButton('PingPongBack', top, 'back', () => this.context?.requestLobby(this.result()), H.button);
        this.iconButton('PingPongPause', top, 'pause', pause, H.button);
        this.buildScoreboard(top);
        const net = this.make('NetHUD', this.hud, 750, N.scoreHeight);
        this.buildNetScore(net);
        this.iconButton('NetPause', net, 'pause', pause, N.button);
    }

    private buildScoreboard(parent: Node): void {
        const board = this.make('Scoreboard', parent, H.boardWidth, H.boardHeight), w = H.boardWidth / 2, h = H.boardHeight / 2;
        const g = board.addComponent(Graphics);
        rounded(g, -w, -h - 7, w * 2, h * 2, 28, '#000000', 110);
        rounded(g, -w, -h, w * 2, h * 2, 28, T.board);
        g.strokeColor = color(T.boardEdge); g.lineWidth = 2; g.roundRect(-w + 3, -h + 3, w * 2 - 6, h * 2 - 6, 25); g.stroke();
        rect(g, -1, -h + 18, 2, h * 2 - 36, T.boardEdge);
        const rings = this.make('Rings', board, H.boardWidth, H.boardHeight);
        for (const player of PLAYERS) {
            const cx = player === 'red' ? -98 : 98;
            const flip = this.flipCard(`Card-${player}`, board, 128, 64, 52);
            flip.node.setPosition(cx, -4);
            const name = this.label(`Name-${player}`, board, '', cx, 44, 96, 24, 19, ACCENT[player]);
            const serve = this.make(`Serve-${player}`, board, 14, 14); serve.setPosition(cx + 34, 44);
            this.buildBall(serve, 14);
            const pips = this.make(`Pips-${player}`, board, 100, 10).addComponent(Graphics); pips.node.setPosition(cx, -48);
            this.scoreViews.push({ player, card: flip.node, digits: flip.digits, name, pips, serve, shown: -1 });
        }
        rings.setSiblingIndex(board.children.length - 1);
        const rg = rings.addComponent(Graphics);
        for (const cx of [-98, 98]) for (const dx of [-40, 40]) {
            rounded(rg, cx + dx - 4, 20, 8, 17, 4, T.ring);
            rounded(rg, cx + dx - 1.5, 24, 3, 9, 1.5, T.board);
        }
        this.label('RallyCaption', board, '连拍', 0, 20, 60, 22, 15, T.faint, false);
        this.rallyCount = this.label('RallyCount', board, '0', 0, -10, 62, 40, 32, T.orange);
    }

    /** Face-to-face score beside the net: each card faces its own player, the top one turned 180°. */
    private buildNetScore(parent: Node): void {
        const w = N.scoreWidth / 2, h = N.scoreHeight / 2;
        const board = this.make('NetScore', parent, N.scoreWidth, N.scoreHeight), g = board.addComponent(Graphics);
        rounded(g, -w, -h - 5, w * 2, h * 2, 22, '#000000', 110);
        rounded(g, -w, -h, w * 2, h * 2, 22, T.board, 240);
        g.strokeColor = color(T.boardEdge); g.lineWidth = 2; g.roundRect(-w + 3, -h + 3, w * 2 - 6, h * 2 - 6, 19); g.stroke();
        rect(g, -w + 14, -1, w * 2 - 28, 2, T.boardEdge);
        for (const player of PLAYERS) {
            const flip = this.flipCard(`NetCard-${player}`, board, 84, 46, 38);
            flip.node.setPosition(0, player === 'red' ? -29 : 29);
            if (player === 'blue') flip.node.angle = 180;
            const dot = this.make('Team', flip.node, 10, 10).addComponent(Graphics); dot.node.setPosition(-30, 0);
            dot.fillColor = color(player === 'red' ? T.red : T.black); dot.circle(0, 0, 5); dot.fill();
            const serve = this.make('Serve', flip.node, 12, 12); serve.setPosition(30, 0); this.buildBall(serve, 12);
            this.scoreViews.push({ player, card: flip.node, digits: flip.digits, serve, shown: -1 });
        }
    }

    /** Cream flip card split at the hinge, as on a courtside scoreboard. */
    private flipCard(name: string, parent: Node, width: number, height: number, size: number): { node: Node; digits: Label } {
        const node = this.make(name, parent, width, height), g = node.addComponent(Graphics), r = Math.min(12, height * .2);
        rounded(g, -width / 2, -height / 2 - 3, width, height, r, '#000000', 70);
        rounded(g, -width / 2, -height / 2, width, height / 2 - 1, r, T.cardShade);
        rounded(g, -width / 2, 1, width, height / 2 - 1, r, T.card);
        rect(g, -width / 2 + r, height / 2 - 3, width - 2 * r, 2, '#FFFFFF', 140);
        const digits = this.label('Digits', node, '0', 0, -1, width - 12, height, size, T.cardInk);
        rect(this.make('Hinge', node, width, 2).addComponent(Graphics), -width / 2, -1, width, 2, T.cardInk, 70);
        return { node, digits };
    }

    // ── Frame ────────────────────────────────────────────────────────────────

    private render(): void {
        const m = this.model;
        if (!m || !this.world || !this.config) return;
        for (const player of PLAYERS) {
            const p = m.paddles[player];
            this.paddleViews.get(player)!.setPosition(p.x * U, p.z * U);
            this.shadowViews.get(player)!.setPosition((p.x + .5) * U, (p.z - .35) * U);
        }
        const b = m.ball;
        for (const range of this.config.ballScale) {
            if (b.y >= Math.min(range.a, range.b) && b.y <= Math.max(range.a, range.b)) {
                this.ballScale = range.scaleA + (range.scaleB - range.scaleA) * pingPongCurve(range.curve, (b.y - range.a) / (range.b - range.a));
            }
        }
        this.ball!.setPosition(b.x * U, b.z * U); this.ball!.setScale(this.ballScale, this.ballScale, 1);
        // Source ball falls behind the table below Y=0; paddle silhouettes always cover it.
        const maskIndex = this.tableShadowMask!.getSiblingIndex();
        this.ball!.setSiblingIndex(b.y < 0 ? 1 : maskIndex + (this.ball!.getSiblingIndex() < maskIndex ? 0 : 1));
        this.belowShadow!.setPosition((b.x + .3) * U, b.z * U);
        this.shadow!.setPosition((b.x + .25) * U, (b.z - .25) * U);
        const shadowScale = Math.max(0, 1 - b.y * .1); this.shadow!.setScale(shadowScale, shadowScale, 1);
        this.serveHint!.active = m.phase === 'serve' && m.server === 'red' && m.hits === 0;
        for (const view of this.scoreViews) {
            if (view.name) view.name.string = this.playerName(view.player);
            view.serve.active = m.phase === 'serve' && m.server === view.player;
        }
        this.rallyCount!.string = String(m.rally);
        this.syncScores(false);
    }

    private playerName(player: Player): string {
        if (this.mode === 'cpu') return player === 'red' ? '你' : '电脑';
        return player === 'red' ? '红拍' : '黑拍';
    }

    /** Immediate on reset; otherwise a changed score flips its card once. */
    private syncScores(immediate: boolean): void {
        const m = this.model;
        if (!m) return;
        for (const view of this.scoreViews) {
            const value = m.scores[view.player];
            if (immediate) {
                view.flip = undefined; view.card.setScale(1, 1, 1); this.showScore(view, value);
            } else if (value !== (view.flip ? view.flip.value : view.shown)) {
                view.flip = { age: 0, value, swapped: false };
            }
        }
    }

    private showScore(view: ScoreView, value: number): void {
        view.shown = value; view.digits.string = String(value);
        const g = view.pips, total = this.config!.scoreToWin;
        if (!g) return;
        g.clear();
        const spacing = Math.min(14, (g.node.getComponent(UITransform)!.width - 7) / Math.max(1, total - 1));
        for (let i = 0; i < total; i++) {
            g.fillColor = color(i < value ? ACCENT[view.player] : T.boardEdge);
            g.circle((i - (total - 1) / 2) * spacing, 0, 3.5); g.fill();
        }
    }

    private animateHud(dt: number): void {
        for (const view of this.scoreViews) {
            const flip = view.flip;
            if (!flip) continue;
            flip.age += dt;
            if (flip.age >= FLIP_HALF && !flip.swapped) {
                flip.swapped = true; this.showScore(view, flip.value);
                if (view.card.activeInHierarchy) this.context?.services.feedback.play('fold', { vibrate: false, volume: .9 });
            }
            const scale = flip.age < FLIP_HALF ? 1 - flip.age / FLIP_HALF : Math.min(1, (flip.age - FLIP_HALF) / FLIP_HALF);
            view.card.setScale(1, Math.max(.02, scale), 1);
            if (flip.age >= FLIP_HALF * 2) { view.flip = undefined; view.card.setScale(1, 1, 1); }
        }
        const banner = this.banner;
        if (banner?.node.active) {
            banner.age += dt;
            const t = banner.age, pop = Math.min(1, t / .16), eased = 1 - (1 - pop) * (1 - pop);
            const scale = .82 + .18 * eased + (t < .16 ? 0 : Math.max(0, .04 * (1 - (t - .16) / .14)));
            banner.node.setScale(scale, scale, 1);
            banner.opacity.opacity = Math.round(255 * clamp(Math.min(t / .1, (BANNER_SECONDS - t) / .25), 0, 1));
            if (t >= BANNER_SECONDS) banner.node.active = false;
        }
    }

    private showBanner(player: Player): void {
        const banner = this.banner, m = this.model;
        if (!banner || !m || m.winner) return;
        banner.text.string = this.mode === 'cpu' ? player === 'red' ? '漂亮！得分' : '电脑得分' : `${this.playerName(player)}得分`;
        const g = banner.stripe; g.clear();
        g.fillColor = color(ACCENT[player]); g.circle(-160, 0, 9); g.fill(); g.circle(160, 0, 9); g.fill();
        banner.age = 0; banner.opacity.opacity = 0; banner.node.active = true;
    }

    private consumeEvents(): void {
        for (const event of this.model!.drainEvents()) {
            const feedback = this.context?.services.feedback;
            if (event.type === 'serve') { this.trail.length = 0; continue; }
            if (event.type === 'point') {
                this.showBanner(event.player!);
                this.playPointSound(event.player!);
                this.context?.reportScore(this.model!.scores.red); continue;
            }
            if (event.type === 'hit') {
                const power = this.model!.paddles[event.player!].shot.power;
                const variant = PINGPONG_HIT_TIERS.filter(tier => power >= tier).length;
                feedback?.play('collision', { vibrate: false, variant });
            } else if (event.type === 'bounce') feedback?.play('drop', { vibrate: false, volume: .85 });
            else continue;
            this.playImpact(event);
        }
    }

    /** The chime and crowd say who took the point. */
    private playPointSound(player: Player): void {
        const feedback = this.context?.services.feedback, m = this.model;
        if (!feedback || !m) return;
        // Face to face every point and every match end belongs to someone at the table, so both celebrate.
        const ours = this.mode === 'local' || player === 'red';
        if (m.winner) feedback.play(ours ? 'milestone' : 'failure', { vibrate: false });
        else feedback.play(ours ? 'merge' : 'danger', { vibrate: false });
    }

    private playImpact(event: PingPongEvent): void {
        const c = this.config!.impact;
        let impact = this.impacts.find(item => !item.node.active);
        if (!impact) {
            const node = this.make('Impact', this.impactRoot!, 1, 1);
            const sprites = c.parts.map((part, i) => {
                const wedge = this.sprite(`Wedge-${i}`, node, 'Impatto', c.width * U, c.height * U, T.impact);
                wedge.getComponent(UITransform)!.setAnchorPoint(.5, -.5);
                wedge.angle = part.angle; return wedge.getComponent(Sprite)!;
            });
            impact = { node, sprites, age: 0 }; this.impacts.push(impact);
        }
        impact.age = 0; impact.node.active = true; impact.node.setPosition(event.x * U, event.z * U);
        impact.node.setScale(c.size, c.size, 1);
        impact.node.angle = Math.hypot(event.dx, event.dz) > 1e-5
            ? Math.atan2(event.dx, -event.dz) * 180 / Math.PI : event.player === 'blue' ? 180 : 0;
        // Impatto.Play: directional hits enable wedges 0, 1, 6; small radial
        // table impacts independently enable each wedge with probability 1/2.
        impact.sprites.forEach((sprite, i) => { sprite.node.active = event.type === 'hit' ? i === 0 || i === 1 || i === 6 : Math.random() > .5; });
    }

    private animate(dt: number): void {
        for (const t of this.trail) t.life -= dt;
        while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();
        const b = this.model!.ball, last = this.trail[this.trail.length - 1];
        if (this.model!.phase === 'rally' && (!last || Math.hypot(b.x - last.x, b.z - last.z) >= .1)) {
            this.trail.push({ x: b.x, z: b.z, life: .3 });
        }
        const c = this.config!.impact;
        for (const impact of this.impacts) {
            if (!impact.node.active) continue;
            impact.age += dt;
            if (impact.age >= c.seconds) { impact.node.active = false; continue; }
            const t = impact.age / c.seconds, eased = t * t * (3 - 2 * t);
            // Native clip uses zero endpoint tangents for position, scale and alpha.
            impact.sprites.forEach((sprite, i) => {
                const p = c.parts[i], mix = (v: number[][], axis: number) => v[0][axis] + (v[1][axis] - v[0][axis]) * eased;
                sprite.node.setPosition(mix(p.position, 0) * U, mix(p.position, 1) * U);
                sprite.node.setScale(mix(p.scale, 0), mix(p.scale, 1), 1);
                sprite.color = color(T.impact, Math.round((1 - eased) * 230));
            });
        }
        this.drawEffects();
    }

    private drawEffects(): void {
        const g = this.trailGraphics;
        if (!g) return;
        g.clear();
        for (let i = 1; i < this.trail.length; i++) {
            const a = this.trail[i - 1], b = this.trail[i], age = 1 - b.life / .3;
            // Native trail alpha rises from 0 at the ball to 1 at .57, then fades at the tail.
            const alpha = age < .57 ? age / .57 : (1 - age) / .43;
            g.strokeColor = color(T.trail, Math.round(clamp(alpha, 0, 1) * 200));
            g.lineWidth = Math.max(.5, 1.3 * U * (1 - age));
            g.moveTo(a.x * U, a.z * U); g.lineTo(b.x * U, b.z * U); g.stroke();
        }
    }

    // ── Input ────────────────────────────────────────────────────────────────

    private touchStart(event: EventTouch): void {
        if (this.state !== 'playing') return;
        const p = this.touchPoint(event), player: Player = p.z < 0 ? 'red' : 'blue';
        if (player === 'blue' && this.mode === 'cpu') return;
        if (Math.abs(p.z) < .5 || Array.from(this.touches.values()).some(t => t.player === player)) return;
        this.touches.set(event.getID(), { player, x: p.x, z: p.z, previousX: p.x, previousZ: p.z });
        event.propagationStopped = true;
    }
    private touchMove(event: EventTouch): void {
        const t = this.touches.get(event.getID()); if (!t || this.state !== 'playing') return;
        const p = this.touchPoint(event); t.x = p.x; t.z = p.z; event.propagationStopped = true;
    }
    private touchEnd(event: EventTouch): void {
        const t = this.touches.get(event.getID()); if (!t) return;
        this.model?.release(t.player); this.touches.delete(event.getID()); event.propagationStopped = true;
    }
    private touchPoint(event: EventTouch): { x: number; z: number } {
        const p = event.getLocation();
        // Fit Width can offset the Canvas camera from UI-space coordinates.
        const world = this.uiCamera!.screenToWorld(new Vec3(p.x, p.y, 0));
        const local = this.world!.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        return { x: local.x / U, z: local.y / U };
    }
    private clearTouches(): void { this.touches.clear(); this.model?.release(); }

    // ── Layout ───────────────────────────────────────────────────────────────

    private applyLayout = (): void => {
        if (!this.context || !this.stage || !this.world || !this.hud || !this.floor || !this.backdrop) return;
        const size = view.getVisibleSize(), layout = calculatePingPongLayout(size.width, size.height, this.context.services.platform.getLayoutInfo(), this.mode);
        this.layout = layout; this.clearTouches();
        this.model?.setPaddleBounds(layout.paddleBounds);
        this.node.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.floor.clear(); rect(this.floor, -size.width / 2, -size.height / 2, size.width, size.height, T.floorDeep);
        // Arena floor covers the whole screen without stretching; the spotlight follows the court.
        const cover = Math.max(size.width / BACKDROP.width, size.height / BACKDROP.height);
        this.backdrop.setScale(cover, cover, 1);
        const slack = (BACKDROP.height * cover - size.height) / 2;
        this.backdrop.setPosition(0, clamp(layout.worldY, -slack, slack));
        this.stage.getComponent(UITransform)!.setContentSize(layout.safe.width, layout.playTop - layout.playBottom);
        this.stage.setPosition(layout.safe.centerX, layout.worldY);
        this.world.setPosition(0, 0);
        this.world.setScale(layout.unit / U, layout.unit / U, 1);
        this.hud.getComponent(UITransform)!.setContentSize(size.width, size.height);
        const top = this.hud.getChildByName('TopHUD')!, net = this.hud.getChildByName('NetHUD')!;
        top.active = layout.topHud; net.active = !layout.topHud;
        top.setPosition(layout.worldX, layout.hudY);
        net.setPosition(layout.worldX, layout.worldY);
        const placements: [Node, string, number, number][] = [
            [top, 'PingPongBack', -layout.buttonX, layout.hudScale], [top, 'PingPongPause', layout.buttonX, layout.hudScale],
            [top, 'Scoreboard', 0, layout.hudScale],
            [net, 'NetScore', -layout.netX, layout.netScale], [net, 'NetPause', layout.netX, layout.netScale],
        ];
        for (const [parent, name, x, scale] of placements) {
            const node = parent.getChildByName(name)!; node.setPosition(x, 0); node.setScale(scale, scale, 1);
        }
        if (this.overlay) this.positionOverlay();
        this.render();
    };

    // ── Screens ──────────────────────────────────────────────────────────────

    private showReady(): void {
        const panel = this.createOverlay('PingPongReady', 640, 1000, false);
        this.stage!.active = this.hud!.active = false;
        this.iconButton('ReadyLobbyPingPong', this.overlay!, 'back', () => this.context?.requestLobby(this.result()), READY_BACK_SIZE);

        this.buildReadyHero(panel);

        this.label('ReadyTitle', panel, '乒乓球对战', 0, 92, 520, 96, 80, T.cream);
        this.label('ReadySubtitle', panel, `${this.config!.scoreToWin}分获胜`, 0, 28, 520, 36, 25, T.muted, false);

        const modes = this.panelCard('ModeSwitch', panel, 568, 124, 30, T.glass, 210, T.glassEdge);
        modes.setPosition(0, -78);
        for (const mode of ['cpu', 'local'] as const) {
            const selected = this.mode === mode;
            const choice = this.panelCard(`Mode-${mode}`, modes, 270, 106, 24, selected ? T.cream : T.glass, selected ? 255 : 0);
            choice.setPosition(mode === 'cpu' ? -140 : 140, 0);
            this.label('ModeName', choice, mode === 'cpu' ? '单人练习' : '双人对战', 0, 16, 230, 40, 30, selected ? T.cardInk : T.cream);
            this.label('ModeDetail', choice, mode === 'cpu' ? '挑战电脑对手' : '同屏面对面', 0, -24, 230, 30, 20, selected ? '#7A5A60' : T.muted, false);
            this.bindAction(choice, () => {
                if (this.mode === mode) return;
                this.mode = mode; this.saveSettings(); this.resetModel(); this.showReady();
            });
        }
        if (this.mode === 'cpu') {
            this.label('DifficultyHeading', panel, '电脑难度', 0, -176, 300, 28, 20, T.faint, false);
            T.difficulties.forEach((text, i) => {
                const selected = this.difficulty === i;
                const choice = this.panelCard(`Difficulty-${i}`, panel, 176, 80, 22,
                    selected ? T.orange : T.glass, selected ? 255 : 210, selected ? undefined : T.glassEdge);
                choice.setPosition((i - 1) * 196, -236);
                this.label('DifficultyName', choice, text, 0, 11, 150, 36, 27, selected ? T.orangeInk : T.cream);
                const pips = this.make('Level', choice, 60, 10).addComponent(Graphics); pips.node.setPosition(0, -21);
                for (let p = 0; p < 3; p++) {
                    pips.fillColor = color(p <= i ? selected ? T.orangeInk : T.gold : selected ? '#C76A26' : T.glassEdge);
                    pips.circle((p - 1) * 14, 0, 4); pips.fill();
                }
                this.bindAction(choice, () => {
                    if (this.difficulty === i) return;
                    this.difficulty = i; this.saveSettings(); this.resetModel(); this.showReady();
                });
            });
        } else {
            const guide = this.panelCard('LocalPlayGuide', panel, 568, 116, 26, T.glass, 210, T.glassEdge); guide.setPosition(0, -220);
            const g = this.make('Sides', guide, 568, 116).addComponent(Graphics);
            g.fillColor = color(ACCENT.red); g.circle(-218, 18, 8); g.fill();
            g.fillColor = color(ACCENT.blue); g.circle(218, 18, 8); g.fill();
            this.label('LocalSides', guide, '红拍在下  ·  黑拍在上', 0, 18, 400, 36, 26, T.cream);
            this.label('LocalGesture', guide, '面对面开打，看看谁的反应更快', 0, -24, 480, 30, 21, T.muted, false);
        }
        this.button('StartPingPong', panel, '开始比赛', 0, -364, () => {
            if (this.state !== 'ready') return;
            this.clearOverlay(); this.state = 'playing';
            this.context?.services.feedback.play('popup', { vibrate: false });
        }, true, 568);
        this.positionOverlay();
    }

    /** One cohesive perspective illustration keeps both paddles in the same light and space. */
    private buildReadyHero(panel: Node): void {
        const art = this.sprite('ReadyHero', panel, 'ready-hero', 456, 304);
        art.setPosition(0, 310);
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused' || !this.model) return;
        const m = this.model;
        this.dialog('PingPongPauseMenu', 'TIME OUT', '暂停', `先得 ${this.config!.scoreToWin} 分获胜  ·  当前 ${m.scores.red} : ${m.scores.blue}`, [
            { name: 'ResumePingPong', text: '继续比赛', run: model.resume },
            { name: 'RestartPingPong', text: '重新开始', run: model.restart },
            { name: 'LeavePingPong', text: '返回大厅', run: model.exit },
        ]);
    }
    hidePauseMenu(): void { this.clearOverlay(); }

    showResultView(model: MiniGameResultModel): void {
        const m = this.model!, won = m.winner === 'red';
        const title = this.mode === 'cpu' ? won ? '你赢了！' : '惜败一局' : `${this.playerName(m.winner ?? 'red')}获胜`;
        const best = Number(this.context?.services.storage.getGameData(this.context.gameId)?.custom?.pingPongBestRally) || m.bestRally;
        const panel = this.dialog('PingPongResult', 'MATCH OVER', title, `本局最长 ${m.bestRally} 拍  ·  最佳纪录 ${best} 拍`, [
            { name: 'PlayAgainPingPong', text: '再来一局', run: model.restart },
            { name: 'ResultLobbyPingPong', text: '返回大厅', run: model.returnToLobby },
        ], 150);
        const top = panel.getComponent(UITransform)!.height / 2, y = top - 268;
        for (const player of PLAYERS) {
            const x = player === 'red' ? -92 : 92;
            const card = this.flipCard(`ResultCard-${player}`, panel, 136, 84, 62);
            card.node.setPosition(x, y); card.digits.string = String(m.scores[player]);
            this.label(`ResultName-${player}`, panel, this.playerName(player), x, y + 56, 136, 26, 19,
                m.winner === player ? T.gold : T.faint);
        }
        this.label('ResultColon', panel, ':', 0, y + 2, 30, 70, 50, T.cream);
        this.positionOverlay();
    }
    hideResultView(): void { this.clearOverlay(); }

    private result(completed = false): GameResult {
        const m = this.model;
        return { score: m?.scores.red ?? 0, duration: Math.round((m?.time ?? 0) * 1000), completed,
            extra: { red: m?.scores.red ?? 0, blue: m?.scores.blue ?? 0, winner: m?.winner ?? '',
                mode: this.mode, difficulty: this.difficulty, bestRally: m?.bestRally ?? 0 } };
    }
    private saveSettings(): void {
        if (!this.context) return;
        const { storage } = this.context.services, old = storage.getGameData(this.context.gameId);
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }),
            custom: { ...old?.custom, pingPongMode: this.mode, pingPongDifficulty: this.difficulty } });
    }
    private saveMatch(): void {
        if (!this.context || !this.model) return;
        const { storage } = this.context.services, old = storage.getGameData(this.context.gameId);
        const previous = Number(old?.custom?.pingPongBestRally) || 0;
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }),
            custom: { ...old?.custom, pingPongBestRally: Math.max(previous, this.model.bestRally) } });
    }

    /** Dark glass dialog; `extra` reserves space under the subtitle for custom content. */
    private dialog(name: string, eyebrow: string, title: string, subtitle: string, actions: Action[], extra = 0): Node {
        const height = 250 + actions.length * 108 + extra;
        const panel = this.createOverlay(name, 620, height, true), top = height / 2;
        const accent = this.make('Accent', panel, 620, 8).addComponent(Graphics);
        rounded(accent, -36, top - 4, 72, 4, 2, T.gold);
        this.label('DialogEyebrow', panel, eyebrow, 0, top - 48, 500, 30, 18, T.gold);
        this.label('DialogTitle', panel, title, 0, top - 108, 540, 72, 52, T.cream);
        this.label('DialogSubtitle', panel, subtitle, 0, top - 166, 560, 34, 22, T.muted, false);
        actions.forEach((action, i) => this.button(action.name, panel, action.text, 0, top - 256 - extra - i * 108, action.run, i === 0));
        this.positionOverlay();
        return panel;
    }
    private createOverlay(name: string, width: number, height: number, card: boolean): Node {
        this.clearOverlay();
        this.overlay = this.make(name, this.node, 750, 1334); this.overlay.addComponent(BlockInputEvents);
        this.make('Shade', this.overlay, 750, 1334).addComponent(Graphics);
        if (!card) return this.make('DialogPanel', this.overlay, width, height);
        const shadow = this.make('PanelShadow', this.overlay, width, height).addComponent(Graphics);
        rounded(shadow, -width / 2, -height / 2 - 10, width, height, 40, '#000000', 120);
        return this.panelCard('DialogPanel', this.overlay, width, height, 40, T.glass, 248, T.glassEdge);
    }
    private positionOverlay(): void {
        if (!this.overlay || !this.layout) return;
        const size = view.getVisibleSize(), shade = this.overlay.getChildByName('Shade')!, panel = this.overlay.getChildByName('DialogPanel')!;
        this.overlay.getComponent(UITransform)!.setContentSize(size.width, size.height);
        const ready = this.overlay.name === 'PingPongReady', g = shade.getComponent(Graphics)!;
        g.clear(); rect(g, -size.width / 2, -size.height / 2, size.width, size.height, T.shade, ready ? 90 : 170);
        const safe = this.layout.safe, dimensions = panel.getComponent(UITransform)!;
        // Keep navigation at the safe top edge, independent of the centred setup's scale.
        const headerHeight = ready ? READY_BACK_SIZE + 2 * READY_BACK_MARGIN : 0;
        const panelTop = safe.topY - headerHeight;
        const scale = Math.max(.01, Math.min(1, (safe.width - 48) / dimensions.width,
            (panelTop - safe.bottomY - 40) / (dimensions.height + 10)));
        for (const node of [panel, this.overlay.getChildByName('PanelShadow')]) {
            if (!node) continue;
            node.setPosition(safe.centerX, (panelTop + safe.bottomY) / 2); node.setScale(scale, scale, 1);
        }
        this.overlay.getChildByName('ReadyLobbyPingPong')?.setPosition(
            safe.leftX + READY_BACK_MARGIN + READY_BACK_SIZE / 2,
            safe.topY - READY_BACK_MARGIN - READY_BACK_SIZE / 2);
    }
    private clearOverlay(): void {
        if (this.overlay) { this.overlay.active = false; this.overlay.destroy(); this.overlay = undefined; }
        if (this.state !== 'disposed' && this.stage && this.hud) this.stage.active = this.hud.active = true;
    }

    // ── Primitives ───────────────────────────────────────────────────────────

    private make(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name); node.layer = this.node.layer; parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height); return node;
    }
    private sprite(name: string, parent: Node, frame: FrameKey, width: number, height: number, tint = '#FFFFFF', alpha = 255): Node {
        const node = this.make(name, parent, width, height), sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.frames![frame]; sprite.color = color(tint, alpha); return node;
    }
    private panelCard(name: string, parent: Node, width: number, height: number, radius: number,
        fill: string, fillAlpha = 255, border?: string, stroke = 2): Node {
        const node = this.make(name, parent, width, height), g = node.addComponent(Graphics);
        if (fillAlpha > 0) rounded(g, -width / 2, -height / 2, width, height, radius, fill, fillAlpha);
        if (border) {
            g.strokeColor = color(border); g.lineWidth = stroke;
            g.roundRect(-width / 2 + stroke / 2, -height / 2 + stroke / 2, width - stroke, height - stroke, radius); g.stroke();
        }
        return node;
    }
    private label(name: string, parent: Node, text: string, x: number, y: number, width: number, height: number, size: number, tint: string, bold = true): Label {
        const node = this.make(name, parent, width, height); node.setPosition(x, y);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size + 6;
        label.color = color(tint); label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; setLabelBold(label, bold); return label;
    }
    /** Primary: orange pill on a darker lip. Secondary: glass outline. */
    private button(name: string, parent: Node, text: string, x: number, y: number, run: Action['run'], primary = false, width = 520): Node {
        const height = 92, node = this.make(name, parent, width, height), g = node.addComponent(Graphics);
        node.setPosition(x, y);
        if (primary) {
            rounded(g, -width / 2, -height / 2 - 6, width, height, height / 2, T.orangeLip);
            rounded(g, -width / 2, -height / 2, width, height, height / 2, T.orange);
            rect(g, -width / 2 + 40, height / 2 - 12, width - 80, 3, '#FFFFFF', 70);
        } else {
            rounded(g, -width / 2, -height / 2, width, height, height / 2, '#FFFFFF', 14);
            g.strokeColor = color(T.glassEdge); g.lineWidth = 2;
            g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, height / 2 - 1); g.stroke();
        }
        this.label('Text', node, text, 0, 0, width - 140, 60, 31, primary ? T.orangeInk : T.cream);
        if (primary) {
            const arrow = this.make('Arrow', node, 40, 40).addComponent(Graphics); arrow.node.setPosition(width / 2 - 52, 0);
            arrow.strokeColor = color(T.orangeInk); arrow.lineWidth = 4; arrow.lineCap = Graphics.LineCap.ROUND; arrow.lineJoin = Graphics.LineJoin.ROUND;
            arrow.moveTo(-10, 0); arrow.lineTo(11, 0); arrow.moveTo(3, 8); arrow.lineTo(11, 0); arrow.lineTo(3, -8); arrow.stroke();
        }
        this.bindAction(node, run); return node;
    }
    private iconButton(name: string, parent: Node, icon: 'back' | 'pause', run: Action['run'], size: number): Node {
        const node = this.make(name, parent, size, size), g = node.addComponent(Graphics);
        g.fillColor = color('#000000', 90); g.circle(0, -4, size / 2); g.fill();
        g.fillColor = color(T.board, 235); g.circle(0, 0, size / 2); g.fill();
        g.strokeColor = color(T.glassEdge); g.lineWidth = 2; g.circle(0, 0, size / 2 - 1); g.stroke();
        const glyph = this.make('Icon', node, size, size).addComponent(Graphics);
        glyph.node.setScale(size / H.button, size / H.button, 1);
        glyph.strokeColor = color(T.cream); glyph.lineWidth = 4; glyph.lineCap = Graphics.LineCap.ROUND; glyph.lineJoin = Graphics.LineJoin.ROUND;
        if (icon === 'back') { glyph.moveTo(5, 11); glyph.lineTo(-6, 0); glyph.lineTo(5, -11); glyph.stroke(); }
        else { rounded(glyph, -9, -11, 6, 22, 3, T.cream); rounded(glyph, 3, -11, 6, 22, 3, T.cream); }
        this.bindAction(node, run); return node;
    }
    private bindAction(node: Node, run: Action['run']): void {
        node.addComponent(BlockInputEvents);
        // Layout scales HUD buttons; the press restores whatever scale the button had.
        let pressed = false, rest = node.scale.x;
        const release = () => { if (pressed) node.setScale(rest, rest, 1); };
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true; release(); pressed = true; rest = node.scale.x;
            node.setScale(rest * .96, rest * .96, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => { release(); pressed = false; });
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            release();
            if (!pressed || this.state === 'disposed' || !node.activeInHierarchy) return;
            pressed = false;
            if (!node.getComponent(UITransform)!.hitTest(event.getLocation(), event.windowId)) return;
            this.context?.services.feedback.play('uiButton', { vibrate: false });
            const result = run(); if (result) void result.catch(error => console.error('[PingPong]', error));
        });
    }
}

function color(hex: string, alpha = 255): Color { const c = Color.fromHEX(new Color(), hex); c.a = alpha; return c; }
function rect(g: Graphics, x: number, y: number, width: number, height: number, tint: string, alpha = 255): void {
    g.fillColor = color(tint, alpha); g.rect(x, y, width, height); g.fill();
}
function rounded(g: Graphics, x: number, y: number, width: number, height: number, radius: number, tint: string, alpha = 255): void {
    g.fillColor = color(tint, alpha); g.roundRect(x, y, width, height, radius); g.fill();
}

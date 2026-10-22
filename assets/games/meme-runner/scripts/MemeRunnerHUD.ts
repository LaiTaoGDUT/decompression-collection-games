import { Color, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerModel, PowerKind } from './MemeRunnerModel';
import { runnerButton, runnerLabel as label, runnerNode as node, runnerPlate, runnerSprite as sprite, runnerTitle as title, RUNNER_UI as T } from './MemeRunnerUI';

interface CoinFlight { node: Node; sprite: Sprite; x: number; y: number; age: number; amount: number; }
const COIN_FLIGHT_TIME = .48;
const POWERS: PowerKind[] = ['magnet', 'shield'];
const CHANCES = 3;
const ROUTE = { width: 312, height: 40, y: 228 };
/** The Fever groove and its inner channel, measured from the painted groove (centred, 280 × 19). The
 * fill is a 9-sliced felt strip as tall as the channel that grows from the channel's left edge, so both
 * of its rounded ends stay whole at any charge. */
const FEVER = { width: 296, height: 40, x: 10, y: 184, inner: 280, fill: 20 };
const FULL = new Color(255, 255, 255, 255);

/** Felt-patch HUD (visual spec v38): the distance and delivery route are the focal counter at the top
 * centre with the Fever gauge beneath; score and chances top-left; coins and pause top-right. */
export class MemeRunnerHUD {
    private readonly score: Label;
    private readonly distance: Label;
    private readonly coins: Label;
    private readonly combo: Label;
    private readonly comboOpacity: UIOpacity;
    private readonly coinIcon: Node;
    private readonly coinFlights: Node;
    private readonly flightPool: CoinFlight[] = [];
    private readonly flights: CoinFlight[] = [];
    private coinPulseAge = 1;
    private readonly powers: { node: Node; timer: Label }[] = [];
    private readonly hearts: Sprite[] = [];
    private readonly bag: Node;
    private readonly feverFill: Sprite;
    private readonly flame: Node;
    private readonly multiplier: Node;
    private readonly multiplierText: Label;
    private lastCombo = 0;
    private comboAt = -10;
    private lostAt = -10;
    private shownChances = CHANCES;

    constructor(readonly root: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>, pause: () => void) {
        const scoreCard = runnerPlate(root, 'ScoreCard', 204, 86, frames); scoreCard.setPosition(-520, 266);
        label('ScoreCaption', scoreCard, '得分', -62, 22, 60, 22, 16, T.muted);
        this.score = label('Score', scoreCard, '0', 6, -8, 170, 46, 36);
        // Chances: the kangaroo closes in by one heart per unprotected mistake.
        const chances = node('Chances', root, 200, 44); chances.setPosition(-528, 200);
        sprite('ChaserIcon', chances, frames['hud-kangaroo'], 44, 44).node.setPosition(-74, 0);
        for (let i = 0; i < CHANCES; i++) {
            const heart = sprite(`Chance-${i}`, chances, frames['hud-heart'], 36, 36); heart.node.setPosition(-26 + i * 40, 0);
            heart.node.addComponent(UIOpacity); this.hearts.push(heart);
        }
        POWERS.forEach((kind, i) => {
            const n = runnerPlate(root, 'PowerStatus-' + kind, 96, 56, frames); n.setPosition(-566 + i * 104, 146);
            sprite('PowerIcon', n, frames['power-' + kind], 34, 34).node.setPosition(-20, 0);
            const timer = label('PowerTime', n, '', 20, 0, 40, 30, 18); this.powers.push({ node: n, timer });
        });

        this.distance = title('Distance', root, '0 米', 0, 282, 360, 58, 46);
        sprite('DeliveryRoute', root, frames['hud-route'], ROUTE.width, ROUTE.height).node.setPosition(0, ROUTE.y);
        sprite('CustomerHouse', root, frames['hud-house'], 44, 44).node.setPosition(ROUTE.width / 2 + 24, ROUTE.y + 2);
        this.bag = sprite('DeliveryBag', root, frames['hud-bag'], 44, 44).node; this.bag.setPosition(-ROUTE.width / 2, ROUTE.y + 4);

        // Perfects fill the Fever gauge directly beneath the route.
        sprite('FeverTrack', root, frames['hud-track'], FEVER.width, FEVER.height).node.setPosition(FEVER.x, FEVER.y);
        this.feverFill = sprite('FeverFill', root, frames['hud-fever-fill'], FEVER.fill, FEVER.fill, true);
        this.feverFill.node.getComponent(UITransform)!.setAnchorPoint(0, .5);
        this.feverFill.node.setPosition(FEVER.x - FEVER.inner / 2, FEVER.y);
        this.flame = sprite('FeverFlame', root, frames['hud-flame'], 44, 44).node; this.flame.setPosition(FEVER.x - FEVER.width / 2 - 12, FEVER.y + 2);
        this.multiplier = sprite('ComboMultiplier', root, frames['hud-tag'], 60, 36).node; this.multiplier.setPosition(FEVER.x + FEVER.width / 2 + 40, FEVER.y);
        this.multiplierText = label('MultiplierText', this.multiplier, '', 0, 1, 50, 32, 22);

        const coinCard = runnerPlate(root, 'CoinCard', 150, 70, frames); coinCard.setPosition(452, 270);
        const coin = this.coinIcon = sprite('CoinIcon', coinCard, frames.coin, 40, 40).node; coin.setPosition(-38, 0);
        this.coins = label('Coins', coinCard, '0', 22, 0, 80, 44, 30);
        const pauseNode = sprite('RunnerPause', root, frames['hud-pause'], 72, 72).node; pauseNode.setPosition(584, 270);
        runnerButton(pauseNode, pause);

        this.combo = title('Combo', root, '', 0, 128, 360, 64, 38, T.gold);
        this.comboOpacity = this.combo.node.addComponent(UIOpacity);
        this.coinFlights = node('CoinFlights', root, 1280, 640); this.coinFlights.active = false;
    }
    reset(): void {
        this.lastCombo = 0; this.comboAt = -10; this.coinPulseAge = 1; this.lostAt = -10; this.shownChances = CHANCES;
        for (const flight of this.flights) { flight.node.active = false; this.flightPool.push(flight); }
        this.flights.length = 0; this.coinFlights.active = false; this.coinIcon.setScale(1, 1, 1);
    }
    /** Sources are stage coordinates, detached from the scrolling street/camera after pickup. */
    collectCoin(x: number, y: number, amount: number): void {
        if (this.flights.length >= 32) { this.flights[this.flights.length - 1].amount += amount; return; }
        let flight = this.flightPool.pop();
        if (!flight) {
            const s = sprite('CoinFlight', this.coinFlights, this.frames.coin, 36, 36);
            flight = { node: s.node, sprite: s, x, y, age: 0, amount };
        }
        Object.assign(flight, { x, y, amount, age: 0 }); flight.node.active = this.coinFlights.active = true;
        flight.node.setPosition(x, y); flight.node.setScale(1, 1, 1); this.flights.push(flight);
    }
    advance(dt: number): void {
        this.coinPulseAge += dt;
        for (let i = this.flights.length - 1; i >= 0; i--) {
            const flight = this.flights[i]; flight.age += dt;
            if (flight.age >= COIN_FLIGHT_TIME) {
                flight.node.active = false; this.flightPool.push(flight); this.flights.splice(i, 1); this.coinPulseAge = 0;
            }
        }
        this.coinFlights.active = this.flights.length > 0;
    }
    dispose(): void {
        this.reset(); for (const flight of this.flightPool) flight.sprite.spriteFrame = null;
        this.flightPool.length = 0; this.coinFlights.destroy();
    }
    render(m: MemeRunnerModel): void {
        [m.magnetTime, m.shieldTime].forEach((time, i) => { this.powers[i].node.active = time > 0; this.powers[i].timer.string = `${Math.ceil(time)}s`; });
        this.score.string = String(m.score);
        this.distance.string = m.delivered ? '已送达！' : `${m.remainingMeters} 米`;
        this.coins.string = String(Math.max(0, m.coins - this.flights.reduce((sum, flight) => sum + flight.amount, 0)));
        this.renderCoinFlights();
        this.bag.setPosition(-ROUTE.width / 2 + ROUTE.width * m.progress, ROUTE.y + 4 + Math.abs(Math.sin(m.time * 9)) * 3);
        this.renderChances(m);
        this.renderFever(m);
        if (m.combo !== this.lastCombo) { this.lastCombo = m.combo; this.comboAt = m.time; }
        const age = m.time - this.comboAt; this.combo.node.active = m.combo > 1 && age < 1.1;
        this.combo.string = `完美 ${m.combo} 连击！`; this.comboOpacity.opacity = Math.round(255 * Math.min(1, Math.max(0, (1.1 - age) / .3)));
        const pop = 1 + .13 * Math.max(0, 1 - age / .2); this.combo.node.setScale(pop, pop, 1);
    }
    private renderCoinFlights(): void {
        const target = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(this.coinIcon.worldPosition);
        for (const flight of this.flights) {
            const u = Math.min(1, flight.age / COIN_FLIGHT_TIME), t = u * u * (3 - 2 * u), rest = 1 - t;
            const controlX = flight.x + (target.x - flight.x) * .25;
            const controlY = Math.min(288, Math.max(flight.y, target.y) + 80);
            flight.node.setPosition(rest * rest * flight.x + 2 * rest * t * controlX + t * t * target.x,
                rest * rest * flight.y + 2 * rest * t * controlY + t * t * target.y);
            flight.node.setScale(1 - u * .45, 1 - u * .45, 1);
        }
        const pulse = 1 + .2 * Math.sin(Math.PI * Math.min(1, this.coinPulseAge / .18));
        this.coinIcon.setScale(pulse, pulse, 1);
    }
    /** Full hearts are the mistakes left before the kangaroo catches up; the one just lost pops and fades. */
    private renderChances(m: MemeRunnerModel): void {
        const left = m.ended && !m.delivered ? 0 : Math.max(0, CHANCES - m.mistakes);
        if (left < this.shownChances) this.lostAt = m.time;
        this.shownChances = left;
        const age = m.time - this.lostAt;
        this.hearts.forEach((heart, i) => {
            const full = i < left, justLost = i === left && age < .45;
            // A spent heart turns to grey felt and fades back, still marking how many chances there were.
            heart.grayscale = !full;
            heart.node.getComponent(UIOpacity)!.opacity = full ? 255 : justLost ? Math.round(255 - 135 * age / .45) : 120;
            const s = justLost ? 1 + .5 * Math.sin(Math.PI * age / .45) : full && left === 1 ? 1 + .08 * Math.sin(m.time * 8) : 1;
            heart.node.setScale(s, s, 1);
        });
    }
    private renderFever(m: MemeRunnerModel): void {
        const active = m.feverTime > 0;
        const charge = Math.max(0, Math.min(1, m.fever));
        this.feverFill.node.active = charge > 0;
        // Never narrower than its two rounded ends.
        this.feverFill.node.getComponent(UITransform)!.setContentSize(Math.max(FEVER.fill, FEVER.inner * charge), FEVER.fill);
        const flash = active ? .5 + .5 * Math.sin(m.time * 18) : 0;
        this.feverFill.color = active ? new Color(255, Math.round(215 + 40 * flash), Math.round(200 + 55 * flash)) : FULL;
        // The flame grows as the gauge fills and dances while Fever lasts.
        const s = active ? 1.15 + .12 * Math.sin(m.time * 20) : .9 + .25 * m.fever;
        this.flame.setScale(s, s, 1);
        this.multiplier.active = m.multiplier > 1;
        this.multiplierText.string = `×${m.multiplier}`;
    }
}

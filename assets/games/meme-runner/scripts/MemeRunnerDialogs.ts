import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { runnerNode as node, runnerPlate, runnerSprite as sprite } from './MemeRunnerUI';
import { V38_ART } from './MemeRunnerArtV38';

type Frames = Readonly<Record<string, SpriteFrame>>;
/** Wires a dialog button; the game owns the click sound and the busy guard. */
export type BindButton = (button: Node, run: () => unknown) => void;
/** A dialog button: its painted word (`dlg-word-<word>`) and what it runs. */
export interface DialogAction { name: string; word: string; run: () => unknown; }

export interface DeliveredResult { runScore: number; deliveryBonus: number; stars: number; starBonus: number; score: number; time: string; best: number; newRecord: boolean; }
export interface CaughtResult { remaining: number; runScore: number; best: number; newRecord: boolean; }
/** What the result card animates after it is built: the illustration bob, the stars and the score count. */
export interface ResultMotion { art: Node; artY: number; stars: Node[]; score?: FeltNumber; target: number; stamp?: Node; }

type Align = 'left' | 'center' | 'right';
/** A line of painted lettering: word keys (`dlg-word-*`) and numbers in painted digits. */
type Part = { word: string } | { number: string };

/** Result card geometry: a thick-rimmed felt board, the title ribbon overlapping its top edge and the
 * round buttons sitting on its bottom edge, as in the v38 dialog mockups. */
const CARD = { width: 980, height: 500, ribbonY: 288, buttonY: -250 };
/** The receipt's writing grid, measured from its painted frame: the inner margins and the dashed divider. */
const RECEIPT = { left: -150, right: 150, divider: -36 };
const GLYPHS: Readonly<Record<string, string>> = { '+': 'plus', ':': 'colon' };

/** A number set in painted felt digits; re-laid out only when its text changes. */
export class FeltNumber {
    private text = '';
    private readonly glyphs: Sprite[] = [];
    constructor(readonly root: Node, private readonly frames: Frames, private readonly height: number, private readonly align: Align) {}
    get width(): number { return Array.from(this.text, ch => glyphWidth(this.frames[digitKey(ch)], this.height)).reduce((a, b) => a + b, 0); }
    set(text: string): void {
        if (text === this.text) return;
        this.text = text;
        while (this.glyphs.length < text.length) this.glyphs.push(sprite('Digit', this.root, this.frames['dlg-digit-0'], 1, 1));
        const widths = Array.from(text, ch => glyphWidth(this.frames[digitKey(ch)], this.height));
        let x = this.align === 'left' ? 0 : this.align === 'right' ? -this.width : -this.width / 2;
        this.glyphs.forEach((glyph, i) => {
            glyph.node.active = i < text.length;
            if (i >= text.length) return;
            glyph.spriteFrame = this.frames[digitKey(text[i])];
            glyph.node.getComponent(UITransform)!.setContentSize(widths[i], this.height);
            glyph.node.setPosition(x + widths[i] / 2, 0); x += widths[i];
        });
    }
}

/** Felt dialogs (visual spec v38): a title ribbon or hanging sign overlapping a thick-rimmed felt
 * board, a character illustration, a receipt and tags for the numbers, and chunky round icon buttons on
 * the board's edge with their word beneath. Titles, words and digits are all painted lettering. Every
 * dialog is one container node sized to its full extent, so the overlay can fit it to the safe area. */
export class MemeRunnerDialogs {
    constructor(private readonly frames: Frames, private readonly bind: BindButton) {}

    pause(parent: Node, resume: () => unknown, restart: () => unknown, exit: () => unknown): Node {
        // The sign hangs over the board's top edge; the buttons sit inside its lower part, as in the mockup.
        const root = node('Panel', parent, 600, 800);
        this.board(root, 540, 600, -45);
        const sign = this.art('TitleSign', root, 'dlg-sign'); sign.setPosition(0, 285);
        this.art('DialogTitle', sign, 'dlg-title-pause').setPosition(0, -26);
        this.art('RestArt', root, 'dlg-art-pause').setPosition(0, 30);
        this.roundButton(root, { name: 'PauseRestart', word: 'restart', run: restart }, 'dlg-btn-restart', -172, -230);
        this.roundButton(root, { name: 'ResumeRunner', word: 'resume', run: resume }, 'dlg-btn-play', 0, -245);
        this.roundButton(root, { name: 'PauseLobby', word: 'home', run: exit }, 'dlg-btn-home', 172, -230);
        return root;
    }

    delivered(parent: Node, r: DeliveredResult, actions: DialogAction[]): { root: Node; motion: ResultMotion } {
        const root = this.resultCard(parent, 'dlg-ribbon-win', 'dlg-title-win', true);
        // The middle star is the full-size frame; the side stars sit a little smaller and tilted outward.
        const stars = [0, 1, 2].map(i => {
            const [w, h] = V38_ART['dlg-star'].size, k = i === 1 ? 1 : .82;
            const star = sprite(`RatingStar-${i}`, root, this.frames['dlg-star'], w * k, h * k);
            star.node.setPosition((i - 1) * 124, i === 1 ? 196 : 182); star.node.angle = (1 - i) * 12;
            star.grayscale = i >= r.stars; star.node.setScale(0, 0, 1); return star.node;
        });
        const art = this.art('CelebrationArt', root, 'dlg-art-win'); art.setPosition(-212, -20);
        // The order receipt: every row shares the same left and right writing edges.
        const receipt = this.art('Receipt', root, 'dlg-receipt'); receipt.setPosition(242, -4);
        this.line(receipt, 'ReceiptTime', [{ word: 'time' }, { number: r.time }], RECEIPT.left, 106, 22, 'left');
        const row = (name: string, word: string, value: string, y: number): void => {
            this.line(receipt, name, [{ word }], RECEIPT.left, y, 30, 'left');
            this.line(receipt, name + 'Value', [{ number: value }], RECEIPT.right, y, 30, 'right');
        };
        row('ScoreRun', 'run', String(r.runScore), 72);
        row('ScoreDelivery', 'delivery', `+${r.deliveryBonus}`, 36);
        row('ScoreRating', 'rating', `+${r.starBonus}`, 0);
        this.line(receipt, 'ResultScoreCaption', [{ word: 'total' }], RECEIPT.left, RECEIPT.divider - 22, 28, 'left');
        const score = this.number(receipt, 'ResultScore', RECEIPT.left, RECEIPT.divider - 70, 58, 'left');
        let stamp: Node | undefined;
        if (r.newRecord) stamp = this.stamp(receipt, 106, RECEIPT.divider - 64);
        else this.line(root, 'ResultBest', [{ word: 'best' }, { number: String(r.best) }], 242, -200, 24, 'center');
        this.actions(root, actions);
        return { root, motion: { art, artY: art.position.y, stars, score, target: r.score, stamp } };
    }

    caught(parent: Node, r: CaughtResult, actions: DialogAction[]): { root: Node; motion: ResultMotion } {
        const root = this.resultCard(parent, 'dlg-ribbon-lose', 'dlg-title-lose', false);
        const art = this.art('ChaseArt', root, 'dlg-art-lose'); art.setPosition(-222, 4);
        const tag = this.art('RemainingTag', root, 'dlg-tag'); tag.setPosition(252, 80);
        this.line(tag, 'ResultDistance', [{ word: 'short' }, { number: String(r.remaining) }, { word: 'meter' }], 0, 2, 52, 'center');
        const plate = runnerPlate(root, 'RunScore', 330, 92, this.frames); plate.setPosition(252, -40);
        this.line(plate, 'ScoreRun', [{ word: 'run' }, { number: String(r.runScore) }], 0, 0, 34, 'center');
        let stamp: Node | undefined;
        if (r.newRecord) stamp = this.stamp(root, 380, -60);
        else this.line(root, 'ResultBest', [{ word: 'best' }, { number: String(r.best) }], 252, -116, 24, 'center');
        this.actions(root, actions);
        return { root, motion: { art, artY: art.position.y, stars: [], target: r.runScore, stamp } };
    }

    /** Stars land one after another with an overshoot, the score counts up, the art bobs, the stamp thumps. */
    animate(m: ResultMotion, age: number): void {
        m.art.setPosition(m.art.position.x, m.artY + Math.sin(age * 3) * 4);
        m.stars.forEach((star, i) => {
            const t = Math.max(0, Math.min(1, (age - .25 - i * .18) / .22));
            const scale = t < 1 ? t * 1.25 : 1 + .25 * Math.max(0, 1 - (age - .47 - i * .18) / .12);
            star.setScale(scale, scale, 1);
        });
        if (m.score) { const count = Math.min(1, age / .8); m.score.set(String(Math.round(m.target * (1 - (1 - count) ** 3)))); }
        if (m.stamp) {
            const t = Math.max(0, Math.min(1, (age - .95) / .16)), s = t < 1 ? 2.2 - 1.2 * t : 1;
            m.stamp.setScale(s, s, 1); m.stamp.getComponent(UIOpacity)!.opacity = Math.round(255 * t);
        }
    }

    /** The result card body: the board, confetti for a win, and the title ribbon across the board's top edge. */
    private resultCard(parent: Node, ribbon: string, titleKey: string, confetti: boolean): Node {
        const root = node('Panel', parent, 1040, 730);
        this.board(root, CARD.width, CARD.height, 0);
        if (confetti) this.art('Confetti', root, 'dlg-confetti').setPosition(0, CARD.ribbonY - 10);
        const banner = this.art('TitleRibbon', root, ribbon); banner.setPosition(0, CARD.ribbonY);
        this.art('DialogTitle', banner, titleKey).setPosition(0, 10);
        return root;
    }
    /** The thick-rimmed felt board, 9-sliced to any size. */
    private board(root: Node, width: number, height: number, y: number): void {
        sprite('Board', root, this.frames['dlg-board'], width, height, true).node.setPosition(0, y);
    }
    private actions(root: Node, actions: DialogAction[]): void {
        const [primary, ...rest] = actions;
        this.roundButton(root, primary, 'dlg-btn-replay', -112, CARD.buttonY);
        rest.forEach((a, i) => this.roundButton(root, a, 'dlg-btn-home', 92 + i * 180, CARD.buttonY + 16));
    }
    private stamp(parent: Node, x: number, y: number): Node {
        const s = this.art('RecordStamp', parent, 'dlg-stamp'); s.setPosition(x, y);
        s.addComponent(UIOpacity).opacity = 0; return s;
    }
    /** A round felt icon button on the board's edge with its painted word beneath. */
    private roundButton(parent: Node, action: DialogAction, key: string, x: number, y: number): Node {
        const size = V38_ART[key].size[0], n = node(action.name, parent, size, size); n.setPosition(x, y);
        sprite('Face', n, this.frames[key], size, size);
        this.line(n, 'ButtonText', [{ word: action.word }], 0, -size / 2 - 14, 32, 'center');
        this.bind(n, action.run); return n;
    }
    /** Painted words and numbers in a row at one letter height, aligned on x. */
    private line(parent: Node, name: string, parts: Part[], x: number, y: number, height: number, align: Align): Node {
        const row = node(name, parent, 1, height); row.setPosition(x, y);
        const pieces = parts.map(part => {
            if ('word' in part) {
                const frame = this.frames[`dlg-word-${part.word}`], width = glyphWidth(frame, height);
                return { node: sprite('Word', row, frame, width, height).node, width, centred: true };
            }
            const n = new FeltNumber(node('Number', row, 1, height), this.frames, height, 'left'); n.set(part.number);
            return { node: n.root, width: n.width, centred: false };
        });
        const gap = height * .25, total = pieces.reduce((sum, p) => sum + p.width, 0) + gap * (pieces.length - 1);
        let cursor = align === 'left' ? 0 : align === 'right' ? -total : -total / 2;
        for (const p of pieces) { p.node.setPosition(p.centred ? cursor + p.width / 2 : cursor, 0); cursor += p.width + gap; }
        return row;
    }
    private number(parent: Node, name: string, x: number, y: number, height: number, align: Align): FeltNumber {
        const n = new FeltNumber(node(name, parent, 1, height), this.frames, height, align); n.root.setPosition(x, y); n.set('0'); return n;
    }
    /** Dialog art at its painted 1:1 display size. */
    private art(name: string, parent: Node, key: string): Node {
        const [w, h] = V38_ART[key].size; return sprite(name, parent, this.frames[key], w, h).node;
    }
}

function digitKey(ch: string): string { return `dlg-digit-${GLYPHS[ch] ?? ch}`; }
function glyphWidth(frame: SpriteFrame, height: number): number {
    const size = frame.originalSize; return size.width * height / size.height;
}

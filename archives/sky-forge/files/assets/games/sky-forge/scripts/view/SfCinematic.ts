import { Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { COLORS, cap, color, easeOutBack, easeOutCubic, node, num, opacity, sprite, text, type UiContext } from './SfUi';

/** 必杀：1.15 秒，0.98 秒时真正释放；Boss 出场：1.18 秒，0.98 秒时落位。 */
const SPECIAL_DURATION = 1.15;
const BOSS_DURATION = 1.18;
const RELEASE_AT = 0.98;

type Kind = 'special' | 'boss';

/**
 * tidal-wings 风格的全屏插入演出（必杀切入、Boss 出场）。
 * 演出期间战斗模拟暂停；到达释放点时回调，由调用方真正释放必杀或放出 Boss。
 */
export class SfCinematic {
    readonly root: Node;
    private readonly back: Graphics;
    private readonly panel: Node;
    private readonly panelG: Graphics;
    private readonly art: Node;
    private readonly artMain: Sprite;
    private readonly echoes: Sprite[] = [];
    private readonly plate: Node;
    private readonly plateG: Graphics;
    private readonly tag: Label;
    private readonly sub: Label;
    private readonly titleShadow: Label;
    private readonly title: Label;
    private readonly front: Graphics;
    private kind: Kind | null = null;
    private t = 0;
    private duration = 1;
    private released = false;
    private tone = COLORS.foam;
    private side = 1;
    private onRelease?: () => void;
    private width = 750;
    private height = 1334;
    private centerY = 0;

    constructor(private readonly ui: UiContext, parent: Node) {
        this.root = node(parent, 'Cinematic');
        this.back = node(this.root, 'Back').addComponent(Graphics);
        this.panel = node(this.root, 'Panel');
        this.panelG = node(this.panel, 'G').addComponent(Graphics);
        this.art = node(this.root, 'Art');
        for (let i = 0; i < 3; i++) this.echoes.push(sprite(ui, this.art, 'plane/vanguard/body', 10, 10, 0, 0, `Echo${i}`));
        this.artMain = sprite(ui, this.art, 'plane/vanguard/body', 10, 10, 0, 0, 'Main');
        this.plate = node(this.root, 'Plate');
        this.plateG = node(this.plate, 'G').addComponent(Graphics);
        this.tag = text(ui, this.plate, '', 0, 58, { size: 26, color: COLORS.cream, align: 'left' });
        this.sub = text(ui, this.plate, '', 0, 58, { size: 26, color: COLORS.cream, align: 'left' });
        this.titleShadow = text(ui, this.plate, '', 0, 0, { size: 76, color: COLORS.foam, align: 'left' });
        this.title = text(ui, this.plate, '', 0, 0, { size: 76, color: COLORS.cream, align: 'left', outline: 4 });
        this.front = node(this.root, 'Front').addComponent(Graphics);
        this.root.active = false;
    }

    get active(): boolean { return this.kind !== null; }

    layout(width: number, height: number, safeTop: number, safeBottom: number): void {
        this.width = width;
        this.height = height;
        this.root.getComponent(UITransform)?.setContentSize(width, height);
        this.centerY = (safeTop + safeBottom) / 2 + 60;
    }

    /** 必杀切入：机体立绘从侧面压入，名称板 + 十格充能，0.98 秒闪白释放。 */
    playSpecial(planeId: string, planeName: string, specialName: string, tone: string, onRelease: () => void): void {
        this.start('special', SPECIAL_DURATION, tone, onRelease);
        this.side = -1;
        this.setArt(`plane/${planeId}/body`, 2.6);
        this.tag.string = '必杀技 //';
        this.sub.string = planeName;
        this.title.string = specialName;
        this.titleShadow.string = specialName;
    }

    /** Boss 出场：大斜切底板 + 速度线，Boss 立绘放大压入，信息板“首领出现”。 */
    playBoss(frameKey: string, bossName: string, tone: string, onRelease: () => void): void {
        this.start('boss', BOSS_DURATION, tone, onRelease);
        this.side = 1;
        this.setArt(frameKey, 0);
        this.tag.string = '首领出现 //';
        this.sub.string = '';
        this.title.string = bossName;
        this.titleShadow.string = bossName;
    }

    /** 跳过剩余演出（暂停、退出时）；未释放的回调立即执行，保证必杀与 Boss 不会丢。 */
    finish(): void {
        if (!this.kind) return;
        if (!this.released) { this.released = true; this.onRelease?.(); }
        this.kind = null;
        this.root.active = false;
    }

    private start(kind: Kind, duration: number, tone: string, onRelease: () => void): void {
        this.finish();
        this.kind = kind;
        this.t = 0;
        this.duration = duration;
        this.released = false;
        this.tone = tone;
        this.onRelease = onRelease;
        this.root.active = true;
        this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.title.fontSize = kind === 'boss' ? 68 : 76;
        this.titleShadow.fontSize = this.title.fontSize;
        this.titleShadow.color = color(tone);
        this.tag.color = color(kind === 'boss' ? COLORS.red : COLORS.cream);
    }

    /** scale = 0 时按 440 宽的框等比放大（Boss 立绘尺寸不一）。 */
    private setArt(key: string, scale: number): void {
        const frame = this.ui.frame(key);
        const all = this.echoes.concat([this.artMain]);
        for (const s of all) s.spriteFrame = frame ?? null;
        if (!frame) return;
        const w = frame.originalSize.width, h = frame.originalSize.height;
        const k = scale > 0 ? scale : Math.min(460 / w, 360 / h);
        for (const s of all) s.node.getComponent(UITransform)!.setContentSize(w * k, h * k);
    }

    /** 返回 true 表示演出仍在进行（调用方暂停模拟与操作）。 */
    update(dt: number): boolean {
        if (!this.kind) return false;
        this.t += dt;
        const t = this.t;
        if (!this.released && t >= RELEASE_AT) {
            this.released = true;
            this.onRelease?.();
        }
        if (t >= this.duration) {
            this.kind = null;
            this.root.active = false;
            return false;
        }
        if (this.kind === 'special') this.drawSpecial(t);
        else this.drawBoss(t);
        return true;
    }

    private drawBackdrop(t: number, wash: number): number {
        const w = this.width, h = this.height, g = this.back;
        const inK = easeOutCubic(t / 0.16);
        const out = t > RELEASE_AT ? 1 - cap((t - RELEASE_AT) / (this.duration - RELEASE_AT)) : 1;
        const a = inK * out;
        g.clear();
        g.fillColor = color('#020A14', 205 * a);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.fillColor = color(this.tone, wash * 255 * a);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        // 斜向墨色平行四边形带，缓慢横移。
        g.fillColor = color(COLORS.ink, 150 * a);
        for (let i = 0; i < 6; i++) {
            const x = -w / 2 - 260 + ((i * 190 + t * 420 * this.side) % (w + 520) + w + 520) % (w + 520);
            g.moveTo(x, h / 2); g.lineTo(x + 70, h / 2); g.lineTo(x - 180, -h / 2); g.lineTo(x - 250, -h / 2); g.close();
        }
        g.fill();
        // 上下亮色条纹：3 像素实线 + 流动短划。
        const cy = this.centerY;
        for (const y of [cy + 250, cy - 250]) {
            g.fillColor = color(COLORS.cream, 210 * a);
            g.rect(-w / 2, y, w, 3);
            g.fill();
            g.fillColor = color(this.tone, 230 * a);
            const off = (t * 600 * this.side) % 60;
            for (let x = -w / 2 - 60; x < w / 2 + 60; x += 60) g.rect(x + off, y + (y > cy ? 8 : -12), 30, 4);
            g.fill();
        }
        return a;
    }

    private drawSpecial(t: number): void {
        const w = this.width, cy = this.centerY;
        const a = this.drawBackdrop(t, 0.42);
        const slide = easeOutBack(t / 0.24);
        const out = t > RELEASE_AT ? cap((t - RELEASE_AT) / 0.17) : 0;
        // 斜切面板从右侧滑入。
        const pg = this.panelG;
        pg.clear();
        const px = (1 - slide) * w * 1.1 - out * w * 0.4;
        this.panel.setPosition(px, cy);
        pg.fillColor = color(COLORS.ink, 235);
        pg.moveTo(-w / 2 - 40, 186); pg.lineTo(w / 2 + 80, 226); pg.lineTo(w / 2 + 80, -186); pg.lineTo(-w / 2 - 40, -226); pg.close();
        pg.fill();
        pg.fillColor = color(this.tone, 225);
        pg.moveTo(-w / 2 - 40, 170); pg.lineTo(w / 2 + 80, 210); pg.lineTo(w / 2 + 80, -170); pg.lineTo(-w / 2 - 40, -210); pg.close();
        pg.fill();
        pg.fillColor = color(COLORS.cream, 70);
        pg.moveTo(-w / 2 - 40, 170); pg.lineTo(w / 2 + 80, 210); pg.lineTo(w / 2 + 80, 196); pg.lineTo(-w / 2 - 40, 156); pg.close();
        pg.fill();
        opacity(this.panel, a * 255);
        // 机体立绘：从左侧推入，轻微放大；三层残影（亮、主色、墨影）。
        // 立绘在右半边，文字板在左下，互不遮挡。
        const artK = easeOutCubic(t / 0.3);
        const ax = w * 0.75 - artK * w * 0.55 + t * 20 + out * w * 0.6;
        this.layoutArt(ax, cy + 40, 1 + t * 0.06, 22, a);
        // 文字板。
        this.plate.setPosition(-w / 2 + 36 + (1 - slide) * 300, cy - 120);
        opacity(this.plate, a * 255);
        this.tag.node.setPosition(0, 58);
        this.sub.node.setPosition(130, 58);
        this.title.node.setPosition(0, 0);
        this.titleShadow.node.setPosition(6, -6);
        const g = this.plateG;
        g.clear();
        const lineW = 560 * easeOutCubic((t - 0.12) / 0.5);
        g.fillColor = color(COLORS.cream);
        g.rect(0, -50, lineW, 4);
        g.fill();
        const charge = cap((t - 0.18) / 0.72);
        for (let i = 0; i < 10; i++) {
            const lit = i < Math.floor(charge * 10 + 1e-6);
            g.fillColor = color(lit ? COLORS.cream : COLORS.ink, lit ? 255 : 180);
            g.rect(i * 30, -78, 24, 12);
            g.fill();
        }
        this.drawRelease(t);
    }

    private drawBoss(t: number): void {
        const w = this.width, cy = this.centerY;
        const a = this.drawBackdrop(t, 0.5);
        const slide = easeOutCubic(t / 0.22);
        const out = t > RELEASE_AT ? cap((t - RELEASE_AT) / 0.2) : 0;
        const pg = this.panelG;
        pg.clear();
        this.panel.setPosition((1 - slide) * -w * 1.1, cy);
        // 大斜切平行四边形 + 横向速度线。
        pg.fillColor = color(COLORS.ink, 240);
        pg.moveTo(-w / 2 - 80, 250); pg.lineTo(w / 2 + 80, 170); pg.lineTo(w / 2 + 80, -250); pg.lineTo(-w / 2 - 80, -170); pg.close();
        pg.fill();
        pg.fillColor = color(this.tone, 200);
        pg.moveTo(-w / 2 - 80, 232); pg.lineTo(w / 2 + 80, 152); pg.lineTo(w / 2 + 80, -232); pg.lineTo(-w / 2 - 80, -152); pg.close();
        pg.fill();
        pg.fillColor = color(COLORS.cream, 120);
        for (let i = 0; i < 14; i++) {
            const y = -200 + i * 30 + ((i * 37) % 11);
            const len = 80 + ((i * 53) % 140);
            const x = w / 2 - ((t * (900 + i * 60) + i * 97) % (w + 300));
            pg.rect(x, y, len, i % 3 === 0 ? 4 : 2);
        }
        pg.fill();
        opacity(this.panel, a * 255);
        // Boss 立绘：从上方压下并放大到位。
        const k = easeOutBack(t / 0.36);
        this.layoutArt(80, cy + 60 + (1 - k) * 260 - out * 40, 0.86 + k * 0.14 + out * 0.08, 18, a);
        this.plate.setPosition(-w / 2 + 36 + (1 - slide) * -400, cy - 160);
        opacity(this.plate, a * 255);
        this.tag.node.setPosition(0, 58);
        this.title.node.setPosition(0, 0);
        this.titleShadow.node.setPosition(6, -6);
        const g = this.plateG;
        g.clear();
        g.fillColor = color(COLORS.red);
        g.rect(0, -50, 520 * easeOutCubic((t - 0.1) / 0.5), 5);
        g.fill();
        this.drawRelease(t);
    }

    private layoutArt(x: number, y: number, scale: number, spread: number, alpha: number): void {
        this.art.setPosition(x, y);
        this.art.setScale(scale, scale, 1);
        opacity(this.art, alpha * 255);
        const tints = [COLORS.cream, this.tone, COLORS.ink];
        const offs = [[-spread, spread * 0.4], [-spread * 2, spread * 0.8], [spread * 0.5, -spread * 0.9]];
        this.echoes.forEach((s, i) => {
            s.color = color(tints[i], i === 2 ? 200 : 110);
            s.node.setPosition(offs[i][0] * this.side, offs[i][1]);
        });
        this.artMain.node.setPosition(0, 0);
    }

    /** 释放瞬间：全屏亮闪 + 10 像素白色横线向两侧拉开。 */
    private drawRelease(t: number): void {
        const g = this.front, w = this.width, h = this.height;
        g.clear();
        const pre = cap((t - (RELEASE_AT - 0.08)) / 0.08);
        const post = t >= RELEASE_AT ? 1 - cap((t - RELEASE_AT) / 0.16) : pre;
        if (post <= 0) return;
        g.fillColor = color('#FFFFFF', 200 * post);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        const len = w * (t >= RELEASE_AT ? 1 : pre);
        g.fillColor = color('#FFFFFF');
        g.rect(-len / 2, this.centerY - 5, len, 10);
        g.fill();
    }

    dispose(): void {
        this.kind = null;
        this.onRelease = undefined;
        this.root.destroy();
    }
}

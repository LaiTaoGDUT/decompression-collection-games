import { Color, Graphics, Node, SpriteFrame } from 'cc';
import type { PowerKind } from './MemeRunnerModel';
import { runnerNode, runnerSprite } from './MemeRunnerUI';

/** Original town-machine badges. The effect is readable as an icon, independent of coin trails. */
export function powerIcon(parent: Node, kind: PowerKind, frames: Readonly<Record<string, SpriteFrame>>, size = 80): Node {
    if (kind === 'magnet' || kind === 'shield') return runnerSprite('PowerIcon-' + kind, parent, frames['power-' + kind], size, size).node;
    const n = runnerNode('PowerIcon-' + kind, parent, size, size), art = runnerNode('BadgeDrawing', n, 80, 80);
    art.setScale(size / 80, size / 80, 1);
    const g = art.addComponent(Graphics);
    const colors = { giant: '#A46AC2', flight: '#E98C4E', bridge: '#46A7AA', convert: '#DEAB42' };
    g.fillColor = new Color('#443049'); g.circle(0, 0, 39); g.fill();
    g.fillColor = new Color(colors[kind]); g.circle(0, 0, 35); g.fill();
    g.strokeColor = new Color('#FFF0C8'); g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a + .12) * 30, Math.sin(a + .12) * 30); } g.stroke();
    g.fillColor = new Color('#FFF2D3'); g.strokeColor = new Color('#FFF2D3'); g.lineWidth = 5;
    if (kind === 'giant') {
        g.moveTo(-7, 22); g.lineTo(7, 22); g.lineTo(7, 7); g.lineTo(19, -14); g.quadraticCurveTo(22, -22, 12, -22);
        g.lineTo(-12, -22); g.quadraticCurveTo(-22, -22, -19, -14); g.lineTo(-7, 7); g.close(); g.fill();
        g.strokeColor = new Color('#795192'); g.lineWidth = 3; g.moveTo(-10, -11); g.lineTo(10, -11); g.moveTo(0, -19); g.lineTo(0, -2); g.stroke();
    } else if (kind === 'bridge') {
        g.moveTo(0, 18); g.quadraticCurveTo(-13, 24, -24, 16); g.lineTo(-24, -19); g.quadraticCurveTo(-12, -12, 0, -19);
        g.quadraticCurveTo(12, -12, 24, -19); g.lineTo(24, 16); g.quadraticCurveTo(13, 24, 0, 18); g.close(); g.fill();
        g.strokeColor = new Color('#34868C'); g.lineWidth = 3; g.moveTo(0, 17); g.lineTo(0, -15); g.stroke();
        for (const side of [-1, 1]) { g.moveTo(side * 6, 9); g.lineTo(side * 19, 9); g.moveTo(side * 6, 1); g.lineTo(side * 19, 1); } g.stroke();
    } else if (kind === 'flight') {
        for (const side of [-1, 1]) {
            g.moveTo(side * 3, -16); g.lineTo(side * 24, 18); g.quadraticCurveTo(side * 29, 25, side * 17, 20);
            g.lineTo(side * 5, 12); g.lineTo(side * 13, 8); g.lineTo(side * 2, -2); g.close(); g.fill();
        }
        g.circle(0, -15, 5); g.fill();
    } else {
        for (const [x, y] of [[-12, -10], [11, 1]]) { g.circle(x, y, 12); g.fill(); }
        g.strokeColor = new Color('#9B6E21'); g.lineWidth = 3; g.moveTo(-12, -17); g.lineTo(-12, -3); g.moveTo(11, -6); g.lineTo(11, 8); g.stroke();
        g.strokeColor = new Color('#FFF2D3'); g.moveTo(-12, 11); g.lineTo(-12, 25); g.moveTo(-19, 18); g.lineTo(-5, 18); g.stroke();
    }
    return n;
}

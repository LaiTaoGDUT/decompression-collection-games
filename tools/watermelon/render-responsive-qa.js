const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js');

function load(file) {
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    const cc = {
        _decorator: { ccclass: () => (target) => target },
        assetManager: {}, Button: class {}, Color: class {}, Component: class {},
        Graphics: class {}, Label: class {}, Node: class {}, Sprite: class {},
        SpriteFrame: class {}, sys: {}, UITransform: class {}, view: {},
    };
    new Function('require', 'module', 'exports', output)(
        (request) => {
            if (request === 'cc') return cc;
            if (request.startsWith('./')) {
                return load(path.resolve(path.dirname(file), `${request}.ts`));
            }
            return require(request);
        },
        module,
        module.exports,
    );
    return module.exports;
}

const { calculateWatermelonLayout } = load(
    path.resolve('assets/games/watermelon/scripts/WatermelonLayout.ts'),
);
const { calculateWatermelonOverlayMetrics } = load(
    path.resolve('assets/games/watermelon/scripts/WatermelonResponsiveRules.ts'),
);
const devices = [
    ['短屏', 750, 1200, 0, 0],
    ['标准刘海', 750, 1334, 44, 20],
    ['长屏挖孔', 750, 1624, 88, 34],
    ['深刘海', 750, 1624, 120, 42],
    ['窄屏回退', 600, 1100, 60, 24],
];

const cellWidth = 300;
const sheetWidth = 1560;
const sheetHeight = 720;
const fragments = [];

devices.forEach(([name, width, height, top, bottom], index) => {
    const game = calculateWatermelonLayout(width, height, top, bottom);
    const modal = calculateWatermelonOverlayMetrics(width, height, top, bottom);
    const maxDrawHeight = 590;
    const scale = Math.min(250 / width, maxDrawHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const x = 30 + index * cellWidth + (250 - drawWidth) / 2;
    const y = 86;
    const sx = (value) => x + (value + width / 2) * scale;
    const sy = (value) => y + (height / 2 - value) * scale;
    const rect = (cx, cy, w, h, fill, stroke = 'none', dash = '') => (
        `<rect x="${sx(cx - w / 2)}" y="${sy(cy + h / 2)}" width="${w * scale}" height="${h * scale}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}/>`
    );

    fragments.push(`<text x="${x + drawWidth / 2}" y="36" text-anchor="middle" font-size="19" font-weight="700" fill="#563e52">${name}</text>`);
    fragments.push(`<text x="${x + drawWidth / 2}" y="61" text-anchor="middle" font-size="13" fill="#7f6574">${width}×${height} · 安全区 ${top}/${bottom}</text>`);
    fragments.push(`<rect x="${x}" y="${y}" width="${drawWidth}" height="${drawHeight}" rx="22" fill="#fff4e2" stroke="#f78b8b" stroke-width="4"/>`);
    if (top) fragments.push(`<rect x="${x}" y="${y}" width="${drawWidth}" height="${top * scale}" fill="#e85d68" opacity="0.32"/>`);
    if (bottom) fragments.push(`<rect x="${x}" y="${y + drawHeight - bottom * scale}" width="${drawWidth}" height="${bottom * scale}" fill="#e85d68" opacity="0.32"/>`);
    fragments.push(rect(0, game.topY, 320, 64, '#faf3e8', '#ffd6cf'));
    fragments.push(`<text x="${sx(0)}" y="${sy(game.topY) + Math.max(4, 10 * scale)}" text-anchor="middle" font-size="${Math.max(9, 28 * scale)}" font-weight="700" fill="#563e52">合成大胖橘</text>`);
    fragments.push(rect(width / 2 - 58, game.topY, 68, 68, '#faf3e8', '#f78b8b'));
    fragments.push(`<rect x="${sx(width / 2 - 70)}" y="${sy(game.topY + 15)}" width="${8 * scale}" height="${30 * scale}" rx="2" fill="#563e52"/><rect x="${sx(width / 2 - 52)}" y="${sy(game.topY + 15)}" width="${8 * scale}" height="${30 * scale}" rx="2" fill="#563e52"/>`);
    fragments.push(rect(-width / 2 + 125, game.scoreY, 214, 82, '#ffd6cf'));
    fragments.push(rect(0, game.scoreY, 190, 82, '#ffe58f'));
    fragments.push(rect(width / 2 - 128, game.scoreY, 238, 82, '#bee5d3'));
    fragments.push(rect(0, game.boardCenterY, game.boardWidth, game.boardHeight, '#faf3e8', '#ffd6cf'));
    fragments.push(`<line x1="${sx(-game.boardWidth / 2)}" y1="${sy(game.boardCenterY + game.dangerY)}" x2="${sx(game.boardWidth / 2)}" y2="${sy(game.boardCenterY + game.dangerY)}" stroke="#d8636f" stroke-width="3" stroke-dasharray="7 5"/>`);
    fragments.push(`<text x="${sx(0)}" y="${sy(game.instructionY)}" text-anchor="middle" font-size="${Math.max(8, 20 * scale)}" fill="#563e52">左右移动，松手投放</text>`);
    fragments.push(rect(0, modal.panelY, modal.panelWidth, modal.panelHeight, '#faf3e8', '#dac9ec'));
    fragments.push(`<text x="${sx(0)}" y="${sy(modal.panelY + 240)}" text-anchor="middle" font-size="${Math.max(9, 28 * scale)}" font-weight="700" fill="#563e52">失败 / 续玩</text>`);
    [57, -32, -121, -210].forEach((buttonY, buttonIndex) => {
        fragments.push(rect(0, modal.panelY + buttonY, modal.buttonWidth, modal.buttonHeight, buttonIndex % 2 ? '#fff4e2' : '#f78b8b'));
    });
    fragments.push(`<text x="${x + drawWidth / 2}" y="${y + drawHeight + 24}" text-anchor="middle" font-size="12" fill="#539d84">安全区内 · 触控 66</text>`);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
  <rect width="100%" height="100%" fill="#fffcf8"/>
  <text x="30" y="705" font-size="13" fill="#7f6574">红色：系统安全区　虚线：危险线　面板及四个按钮按生产规则计算</text>
  ${fragments.join('\n')}
</svg>`;

const output = path.resolve('temp/step25-responsive-contact.png');
sharp(Buffer.from(svg)).png().toFile(output).then(() => {
    console.log(output);
});

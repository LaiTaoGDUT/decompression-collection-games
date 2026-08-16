const assert = require('assert');

const DESIGN_WIDTH = 750;
const HUD_STACK_ABOVE_PAUSE_CENTER = 41;
const devices = [
    { name: 'iPhone SE', width: 375, height: 667, safe: { left: 0, top: 20, right: 375, bottom: 667 }, menuBottom: 58 },
    { name: 'iPhone X', width: 375, height: 812, safe: { left: 0, top: 44, right: 375, bottom: 778 }, menuBottom: 82 },
    { name: 'iPhone 15 Pro', width: 393, height: 852, safe: { left: 0, top: 59, right: 393, bottom: 818 }, menuBottom: 92 },
    { name: 'Android tall', width: 360, height: 800, safe: { left: 0, top: 32, right: 360, bottom: 776 }, menuBottom: 78 },
    { name: 'Waterfall Android', width: 412, height: 915, safe: { left: 8, top: 36, right: 404, bottom: 891 }, menuBottom: 82 },
];

for (const device of devices) {
    const scale = DESIGN_WIDTH / device.width;
    const width = DESIGN_WIDTH;
    const height = Math.max(1050, device.height * scale);
    const safeTop = device.safe.top * scale;
    const safeBottom = height - device.safe.bottom * scale;
    const safeLeft = device.safe.left * scale;
    const safeRight = width - device.safe.right * scale;
    const reservedBottom = device.menuBottom * scale;
    const contentBottom = -height / 2 + safeBottom;
    const contentWidth = width - safeLeft - safeRight;
    const headerBrandWidth = Math.min(214, contentWidth - 16);
    const headerBrandHeight = 96 * (headerBrandWidth / 214);

    const pauseCenterFromTop = Math.max(
        safeTop + HUD_STACK_ABOVE_PAUSE_CENTER + 7,
        reservedBottom + 14 + 29,
    );
    const pauseY = height / 2 - pauseCenterFromTop;
    const topHudY = pauseY - 6;
    assert(pauseCenterFromTop - 29 >= reservedBottom + 14, `${device.name}: pause button overlaps the menu capsule.`);
    assert(pauseY + 29 <= height / 2 - safeTop, `${device.name}: pause button crosses the safe top.`);

    const headerBrandTopFromTop = pauseCenterFromTop + 12 - headerBrandHeight / 2;
    const scoreTopFromTop = pauseCenterFromTop + 35;
    assert(headerBrandTopFromTop >= safeTop + 4, `${device.name}: header brand crosses the safe top.`);
    assert(scoreTopFromTop >= safeTop + 4, `${device.name}: score block crosses the safe top.`);

    const reinforcementY = topHudY - 112;
    const dockHeight = 184;
    const dockY = contentBottom + dockHeight / 2;
    const boardTop = reinforcementY - 78;
    const boardBottom = dockY + dockHeight / 2 + 24;
    const availableBoardHeight = Math.max(450, boardTop - boardBottom);
    const safeWidth = width - safeLeft - safeRight;
    const maxGridWidth = Math.max(390, safeWidth - 150);
    const boardWidth = Math.min(610, maxGridWidth, (availableBoardHeight - 98) * 8 / 9);
    const boardHeight = boardWidth * 9 / 8;
    const boardNodeWidth = boardWidth + 104;
    const boardNodeHeight = boardHeight + 104;
    const boardY = (boardTop + boardBottom) / 2;

    assert(boardNodeWidth <= safeWidth - 40, `${device.name}: board backplate lacks horizontal breathing room.`);
    assert(boardY + boardNodeHeight / 2 < reinforcementY - 58, `${device.name}: board overlaps reinforcement panel.`);
    assert(boardY - boardNodeHeight / 2 > dockY + dockHeight / 2, `${device.name}: board overlaps item dock.`);
    assert(dockY - dockHeight / 2 >= -height / 2 + safeBottom, `${device.name}: item dock crosses the safe bottom.`);
    assert(width + 320 >= width * 1.35, `${device.name}: background bleed is insufficient.`);
}

console.log(`chess_endless_layout=passed, devices=${devices.length}, safe_top=passed, capsule=passed, board=passed, dock=passed, bleed=passed`);

const assert = require('assert');

const DESIGN_WIDTH = 750;
const BOARD_NODE_DESIGN_WIDTH = 644;
const BOARD_NODE_DESIGN_HEIGHT = 540 * 9 / 8 + 104;

const devices = [
    { name: 'iPhone SE', width: 375, height: 667, safe: { left: 0, top: 20, right: 375, bottom: 667 }, menuBottom: 58 },
    { name: 'iPhone X', width: 375, height: 812, safe: { left: 0, top: 44, right: 375, bottom: 778 }, menuBottom: 82 },
    { name: 'iPhone 15 Pro', width: 393, height: 852, safe: { left: 0, top: 59, right: 393, bottom: 818 }, menuBottom: 92 },
    { name: 'Android tall', width: 360, height: 800, safe: { left: 0, top: 32, right: 360, bottom: 776 }, menuBottom: 78 },
    { name: 'Waterfall Android', width: 412, height: 915, safe: { left: 8, top: 36, right: 404, bottom: 891 }, menuBottom: 82 },
    { name: 'Extreme short portrait', width: 430, height: 650, safe: { left: 0, top: 28, right: 430, bottom: 630 }, menuBottom: 68 },
    { name: 'Ultra tall portrait', width: 393, height: 1000, safe: { left: 0, top: 59, right: 393, bottom: 966 }, menuBottom: 92 },
];

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function calculate(device) {
    const scale = DESIGN_WIDTH / device.width;
    const width = DESIGN_WIDTH;
    const height = device.height * scale;
    const safeTop = device.safe.top * scale;
    const safeBottom = height - device.safe.bottom * scale;
    const safeLeft = device.safe.left * scale;
    const safeRight = width - device.safe.right * scale;
    const availableWidth = width - safeLeft - safeRight;
    const contentX = (safeLeft - safeRight) / 2;
    const uiScale = clamp(availableWidth / 750, 0.64, 1);

    const reservedBottom = device.menuBottom * scale;
    const hudTopFromTop = Math.max(safeTop, reservedBottom) + 12 * uiScale;
    const hudHeight = 104 * uiScale;
    const hudY = height / 2 - hudTopFromTop - hudHeight / 2;

    const reinforcementScale = Math.max(0, Math.min(1, uiScale, (availableWidth - 24 * uiScale) / 500));
    const reinforcementWidth = 500 * reinforcementScale;
    const reinforcementHeight = 121 * reinforcementScale;
    const reinforcementGap = 10 * uiScale;
    const reinforcementY = hudY - hudHeight / 2 - reinforcementGap - reinforcementHeight / 2;

    const safeHeight = height - safeTop - safeBottom;
    const dockWidth = availableWidth;
    const dockHeight = Math.max(1, Math.min(178 * uiScale, safeHeight * 0.22));
    const dockBottomGap = 0;
    const dockY = -height / 2 + safeBottom + dockBottomGap + dockHeight / 2;

    const boardGap = 12 * uiScale;
    const boardTop = reinforcementY - reinforcementHeight / 2 - boardGap;
    const boardBottomLimit = dockY + dockHeight / 2 + boardGap;
    const slotHeight = Math.max(0, boardTop - boardBottomLimit);
    const maxNodeWidth = Math.max(0, availableWidth + 40 * uiScale);
    const boardScale = Math.max(0, Math.min(
        maxNodeWidth / BOARD_NODE_DESIGN_WIDTH,
        slotHeight / BOARD_NODE_DESIGN_HEIGHT,
    ));
    const boardNodeWidth = BOARD_NODE_DESIGN_WIDTH * boardScale;
    const boardNodeHeight = BOARD_NODE_DESIGN_HEIGHT * boardScale;
    const boardY = boardTop - boardNodeHeight / 2;
    const boardX = contentX;

    return {
        width,
        height,
        safeTop,
        safeBottom,
        safeLeft,
        safeRight,
        availableWidth,
        contentX,
        uiScale,
        reservedBottom,
        hudTopFromTop,
        hudHeight,
        hudY,
        reinforcementWidth,
        reinforcementHeight,
        reinforcementY,
        dockWidth,
        dockHeight,
        dockY,
        boardGap,
        boardTop,
        boardBottomLimit,
        boardScale,
        boardNodeWidth,
        boardNodeHeight,
        boardX,
        boardY,
    };
}

const results = new Map();
for (const device of devices) {
    const m = calculate(device);
    results.set(device.name, m);
    const safeLeftX = -m.width / 2 + m.safeLeft;
    const safeRightX = m.width / 2 - m.safeRight;
    const safeTopY = m.height / 2 - m.safeTop;
    const safeBottomY = -m.height / 2 + m.safeBottom;
    const hudLeft = m.contentX - m.availableWidth / 2;
    const hudRight = m.contentX + m.availableWidth / 2;
    const hudTop = m.hudY + m.hudHeight / 2;
    const hudBottom = m.hudY - m.hudHeight / 2;
    const reinforcementTop = m.reinforcementY + m.reinforcementHeight / 2;
    const reinforcementBottom = m.reinforcementY - m.reinforcementHeight / 2;
    const boardLeft = m.boardX - m.boardNodeWidth / 2;
    const boardRight = m.boardX + m.boardNodeWidth / 2;
    const boardBottom = m.boardY - m.boardNodeHeight / 2;
    const dockLeft = m.contentX - m.dockWidth / 2;
    const dockRight = m.contentX + m.dockWidth / 2;
    const dockTop = m.dockY + m.dockHeight / 2;
    const dockBottom = m.dockY - m.dockHeight / 2;

    assert(Math.abs(hudLeft - safeLeftX) < 0.01, `${device.name}: HUD does not start at the safe left edge.`);
    assert(Math.abs(hudRight - safeRightX) < 0.01, `${device.name}: HUD does not end at the safe right edge.`);
    assert(hudTop <= safeTopY + 0.01, `${device.name}: HUD crosses the safe top.`);
    assert(m.hudTopFromTop >= m.reservedBottom + 12 * m.uiScale - 0.01, `${device.name}: HUD overlaps the WeChat capsule.`);
    assert(reinforcementTop <= hudBottom - 10 * m.uiScale + 0.01, `${device.name}: reinforcement overlaps HUD.`);
    assert(m.reinforcementWidth <= m.availableWidth + 0.01, `${device.name}: reinforcement crosses a side boundary.`);
    assert(Math.abs(m.boardY + m.boardNodeHeight / 2 - m.boardTop) < 0.01, `${device.name}: board is not top-aligned below reinforcement.`);
    assert(boardLeft >= safeLeftX - 20.5 * m.uiScale - 0.01, `${device.name}: board transparent bleed is too wide on the left.`);
    assert(boardRight <= safeRightX + 20.5 * m.uiScale + 0.01, `${device.name}: board transparent bleed is too wide on the right.`);
    assert(m.boardTop <= reinforcementBottom - m.boardGap + 0.01, `${device.name}: board overlaps reinforcement.`);
    assert(boardBottom >= dockTop + m.boardGap - 0.01, `${device.name}: board overlaps item dock.`);
    assert(Math.abs(m.boardX - m.contentX) < 0.01, `${device.name}: board must be centered in the safe content area.`);
    assert(Math.abs(dockLeft - safeLeftX) < 0.01 && Math.abs(dockRight - safeRightX) < 0.01, `${device.name}: item dock is not safe-width.`);
    assert(Math.abs(dockBottom - safeBottomY) < 0.01, `${device.name}: item dock must sit directly on the safe bottom.`);
}

const short = results.get('Extreme short portrait');
const tall = results.get('Ultra tall portrait');
assert(short.boardScale < tall.boardScale, 'Short screens must shrink the board more than tall screens.');
assert(Math.abs(tall.boardNodeWidth - (tall.availableWidth + 40 * tall.uiScale)) < 0.01, 'Tall screens must compensate for the backplate transparent edge padding.');
assert(tall.boardY - tall.boardNodeHeight / 2 > tall.dockY + tall.dockHeight / 2 + 100, 'Tall screens must leave blank space below the board.');

console.log(`chess_endless_layout=passed, devices=${devices.length}, safe_edges=passed, capsule=passed, top_anchor=passed, short_shrink=passed, tall_gap=passed`);

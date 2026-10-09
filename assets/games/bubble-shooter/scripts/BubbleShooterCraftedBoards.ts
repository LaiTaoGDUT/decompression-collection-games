import { Bubble, BubbleColor, Cell, COLUMNS, neighbors } from './BubbleShooterModel';
import type { ToyRail } from './BubbleShooterRound';
import { CAMPAIGN_BOARDS } from './BubbleShooterCampaignBoards';

/** A dot is an empty hex cell; odd rows have twelve cells. Coordinates own the puzzle. */
export interface CraftedLayout {
    rows: readonly string[];
    phase?: 0 | 1;
    frost?: readonly Cell[];
    anchors?: readonly Cell[];
    runes?: readonly (Cell & { next: BubbleColor })[];
    rails?: readonly ToyRail[];
}
export interface CraftedBoard extends CraftedLayout {
    palette: BubbleColor[];
    current: BubbleColor;
    next: BubbleColor;
    queue: BubbleColor[];
    budget: number;
    three: number;
    two: number;
    targets?: readonly Cell[];
    tip: string;
}
const R: BubbleColor = 'red', Y: BubbleColor = 'yellow', B: BubbleColor = 'blue', P: BubbleColor = 'purple';
const colorOf: Record<string, BubbleColor> = { R, Y, B, P };
const cells = (...pairs: number[][]): Cell[] => pairs.map(([row, col]) => ({ row, col }));

export const CRAFTED_BOARDS: Readonly<Record<string, CraftedBoard>> = {
    ...CAMPAIGN_BOARDS,
    'cloud-01': {
        rows: ['.RR...YY..RR.', '.RR...YY..RR', '.RR...YY..RR.'],
        palette: [R, Y], current: R, next: Y, queue: [R, Y, R, Y], budget: 6, three: 3, two: 4,
        tip: '先看下一颗球，左右两团都可以先清。',
    },
    'cloud-02': {
        rows: ['..RR.....YY..', '..RR....YY..', '...YY...RR...', '...YY..RR...', '....RRYY.....'],
        palette: [R, Y], current: R, next: Y, queue: [Y, R, Y, R, Y, R], budget: 7, three: 3, two: 5,
        tip: '从心形空口向上瞄准，试着拆掉上方连接。',
    },
    'cloud-03': {
        rows: ['.YY.......RR.', '.RR......YY.', '.RRR....YYY..', '..YY....RR..', '..YYY..RRR...', '...YY..RR...'],
        palette: [R, Y], current: R, next: Y, queue: [R, Y, R, Y, R, Y], budget: 7, three: 3, two: 5,
        targets: cells([0, 1], [0, 11]), tip: '两侧上方各有一个目标，墙边能把球送上去。',
    },
    'cloud-04': {
        rows: ['..RR.....YY..', '..R......Y..', '.BBB....RRR..', '.BBY....RRY.', '.YYB....YYR..', '.YY.....YY..'],
        palette: [R, Y, B], current: B, next: R, queue: [Y, R, B, Y, R, Y, B, R], budget: 8, three: 3, two: 5,
        tip: '两个挂坠各有一座细桥，换球可以改变先后顺序。',
    },
    'cloud-05': {
        rows: ['.YY....RR....', '.Y.....R....', '.BB....Y.....', '.BB.YYYYRR..', '.BB.YYBBRR...', '..BBYYBBYY..', '...RRYYBBR...', '...RRYYBB...'],
        palette: [R, Y, B], current: B, next: Y, queue: [R, Y, B, R, Y, B, R, Y], budget: 9, three: 4, two: 6,
        tip: '先打开左侧，再沿露出的空口寻找细桥。',
    },
    'cloud-06': {
        rows: ['..YY.....BB..', '..YR.....RB.', '..RR....RR...', '..YY....BB..', '...YY..BB....'],
        palette: [R, Y, B], current: R, next: Y, queue: [R, B, Y, R, B, Y, R, B], budget: 9, three: 4, two: 6,
        targets: cells([0, 3], [0, 9]), frost: cells([0, 3], [0, 9]),
        tip: '先消旁边的红色去霜，再用目标的颜色完成消除。',
    },
    'cloud-07': {
        rows: ['..Y.......B..', '..R......R..', '..YYRRRBB....', '..YYRRBB....', '...BBYYRR....', '...BBYYR....'],
        palette: [R, Y, B], current: R, next: B, queue: [Y, R, B, Y, B, R, Y, B], budget: 11, three: 7, two: 9,
        frost: cells([2, 3], [2, 7], [3, 3]), tip: '红色簇旁有多颗糖霜，也可以从上方断开支撑。',
    },
    'cloud-08': {
        rows: ['.RY......RY..', '.B.......B..', '.RR......YY..', '.RRR....YYY.', '..BBRRYYBB...', '..BBRRYYBB..', '...YYBBRR....'],
        palette: [R, Y, B], current: R, next: B, queue: [Y, R, B, Y, R, B, Y, R], budget: 10, three: 4, two: 7,
        targets: cells([4, 3], [5, 6], [6, 7]), frost: cells([4, 3], [5, 6], [6, 7]),
        tip: '目标带着糖霜，拆掉两侧连接也能让它们一起落下。',
    },
    'cloud-09': {
        rows: ['.RR..YY..BB..', '.R...Y...B..', '.YY..RR..YY..', '.YYY.RR.YYY.', '..BB.RR.BB...', '..BBYYYBB...', '...RRYYRR....', '...RR..RR...'],
        palette: [R, Y, B], current: R, next: B, queue: [Y, R, B, Y, R, B, Y, R, B, Y], budget: 12, three: 6, two: 9,
        frost: cells([2, 1], [2, 9]), tip: '先清中间的小门，新的射角会通向更高的连接。',
    },
    'cloud-10': {
        rows: ['.RY..BR..YB..', '.RY..BR..YB.', '.BB..YY..RR..', '.BBB.YY.RRR.', '.BBY.RR.YYR..', '.BBY.RR.YYR.', '.YYB.BB.RRY..', '.YYB.BB.RRY.'],
        palette: [R, Y, B], current: B, next: R, queue: [Y, R, B, Y, B, R, Y, R, B, Y, R, B, Y, R], budget: 14, three: 6, two: 9,
        frost: cells([2, 2], [2, 6]), tip: '挂坠有两处支撑；冻结预告出现后，试着先清掉标记。',
    },
    'ocean-01': {
        rows: ['..RR.....YY..', '..R......Y..', '..BB....RR...', '..BB....RR..', '...YY..BB....', '...YY..BB...'],
        palette: [R, Y, B], current: B, next: R, queue: [Y, B, R, Y, R, B, Y, R], budget: 8, three: 3, two: 5,
        targets: cells([3, 3], [4, 8]), anchors: cells([3, 3], [4, 8]), tip: '锚珠无法直接消除，沿连接往上找它的支撑。',
    },
    'ocean-02': {
        rows: ['.RR..BB..YY..', '.R...B...Y..', '.YY..RR..BB..', '.YYY.RR.BBB.', '..BB.RR.YY...', '..BBYYYRR...', '...RRYYBB....', '...RR..BB...'],
        palette: [R, Y, B], current: R, next: Y, queue: [B, R, Y, B, Y, R, B, R, Y, B], budget: 12, three: 6, two: 9,
        anchors: cells([3, 2], [3, 9]), tip: '先开中间的通道，或从两边绕到珊瑚背后。',
    },
};

export function craftedBubbles(id: string, board: CraftedLayout): Bubble[] {
    const bubbles: Bubble[] = [];
    board.rows.forEach((row, r) => {
        if (row.length !== COLUMNS - (r + (board.phase ?? 0)) % 2) throw new Error('Invalid crafted row width: ' + id + '/' + r);
        for (let col = 0; col < row.length; col++) {
            if (row[col] === '.') continue;
            const color = colorOf[row[col]];
            if (!color) throw new Error('Unknown crafted color: ' + id);
            const at = (list?: readonly Cell[]) => !!list?.some(c => c.row === r && c.col === col);
            const anchor = at(board.anchors);
            const rune = board.runes?.find(c => c.row === r && c.col === col);
            bubbles.push({ id: id + '/crafted/' + r + ':' + col, row: r, col, color: anchor ? R : color,
                frosted: at(board.frost), ...(anchor ? { indestructible: true as const, solidKind: 'ocean' as const } : {}),
                ...(rune ? { runeNext: rune.next } : {}) });
        }
    });
    for (const list of [board.frost, board.anchors, board.runes]) for (const cell of list ?? []) {
        if (!bubbles.some(b => b.row === cell.row && b.col === cell.col)) throw new Error('Missing crafted marker: ' + id);
    }
    for (const list of [board.frost, board.anchors, board.runes]) {
        if (list && new Set(list.map(c => c.row + ':' + c.col)).size !== list.length) throw new Error('Duplicate crafted marker: ' + id);
    }
    return bubbles;
}

/** Four distinct support graphs: three pendants, an arch, a window, and dense chambers. */
const ENDLESS_MASKS: readonly (readonly string[])[] = [
    ['.##..##..##..', '.##..##..##.', '.##..##..##..', '.###.##.###.', '.###.##.###..', '.###.##.###.', '.###.##.###..', '.###.##.###.', '..##.##.##...', '..##.##.##..'],
    ['##.........##', '##........##', '.###.....###.', '.###....###.', '..###...###..', '..###..###..', '...###.###...', '...######...', '....#####....', '....####....'],
    ['.##..##..##..', '.#...#...#..', '.##..##..##..', '.###.##.###.', '..##.##.##...', '..#######...', '...######....', '...##..##...', '...##..##....', '...#....#...'],
    ['#############', '############', '###..###..###', '.##..##..##.', '.###.###.###.', '.##########.', '#############', '############', '.###########.', '.##########.'],
];

export function initialBoardConnected(bubbles: readonly Bubble[], phase = 0): boolean {
    const occupied = new Map(bubbles.map(b => [b.row + ':' + b.col, b]));
    const seen = new Set<string>(), queue = bubbles.filter(b => b.row === 0);
    for (let i = 0; i < queue.length; i++) {
        const b = queue[i], key = b.row + ':' + b.col;
        if (seen.has(key)) continue;
        seen.add(key);
        neighbors(b, phase).forEach(c => { const next = occupied.get(c.row + ':' + c.col); if (next) queue.push(next); });
    }
    return seen.size === bubbles.length;
}

export function structuredBubbles(rows: number, pattern: number, palette: readonly BubbleColor[], phase = 0): Bubble[] {
    const mask = ENDLESS_MASKS[pattern % ENDLESS_MASKS.length], bubbles: Bubble[] = [];
    for (let row = 0; row < Math.min(rows, mask.length); row++) {
        const line = mask[row];
        for (let c = 0; c < line.length; c++) {
            const col = c + (phase && row % 2 ? 1 : 0);
            if (line[c] !== '#' || col >= COLUMNS - (row + phase) % 2) continue;
            // Different root colors avoid trivial one-shot roofs; lower groups offer visible pairs.
            const band = row < 2 ? c + row + pattern : Math.floor((c + row % 2) / 2) + Math.floor((row - 2) / 3) + pattern;
            bubbles.push({ row, col, color: palette[band % palette.length], frosted: false });
        }
    }
    if (!initialBoardConnected(bubbles, phase)) throw new Error('Disconnected structured board.');
    return bubbles;
}

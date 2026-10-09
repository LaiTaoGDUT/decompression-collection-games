import { Bubble, BubbleColor, BubbleShooterModel, COLORS, COLUMNS, MAX_ROW, neighbors, valid } from './BubbleShooterModel';
import { BubbleItem, BubbleRegion, ToyRail } from './BubbleShooterRound';
import { CRAFTED_BOARDS, CraftedLayout, craftedBubbles } from './BubbleShooterCraftedBoards';
import { CAMPAIGN_BOSS_REFILLS } from './BubbleShooterCampaignRefills';

export const CAMPAIGN_RULES_VERSION = 2;
/** Supply semantics are unchanged when campaign items are removed; keep legacy shot sequences stable. */
export const CAMPAIGN_SUPPLY_VERSION = 1;
export const CAMPAIGN_BOARD_PROFILE = 'hex-13x15-v1' as const;
export type LevelGoal = { kind: 'clear-board' } | { kind: 'remove-targets' | 'drop-anchors'; bubbleIds: string[] } | { kind: 'boss'; health: number };
export interface CampaignLayout { bubbles: Bubble[]; phase: 0 | 1; rails: ToyRail[]; }
export interface CampaignBossPlan {
    rows: { phase0: Bubble[]; phase1: Bubble[] }[];
    refills: CampaignLayout[];
    frostTargets: number;
    anchorTargets: number;
}
export interface BubbleLevel {
    id: string; revision: number; rulesVersion: number; boardProfile: typeof CAMPAIGN_BOARD_PROFILE;
    region: BubbleRegion; numberInRegion: number; routeIndex: number; name: string; design: string;
    palette: BubbleColor[]; goal: LevelGoal; shotBudget: number;
    stars: { threeMaxShots: number; twoMaxShots: number };
    initial: CampaignLayout;
    supply: { current: BubbleColor; next: BubbleColor; openingQueue: BubbleColor[]; seed: number; maxUnhelpfulDraws: number };
    items: Record<BubbleItem, number>; bossPlan?: CampaignBossPlan; tutorialKeys: string[];
    /** Explicit puzzle content; human difficulty balancing is recorded separately. */
    contentStatus: 'authored';
    tip?: string;
}
type LevelSpec = [string, number, string, LevelGoal['kind']];
const SPECS: LevelSpec[] = [
    ["cloud-01",1,"第一口软糖","clear-board"],
    ["cloud-02",2,"心形缺口","clear-board"],
    ["cloud-03",3,"云边弹一弹","remove-targets"],
    ["cloud-04",4,"两座糖桥","clear-board"],
    ["cloud-05",5,"软糖瀑布","clear-board"],
    ["cloud-06",6,"第一层糖霜","remove-targets"],
    ["cloud-07",7,"邻座也能解冻","clear-board"],
    ["cloud-08",8,"绕过糖衣","remove-targets"],
    ["cloud-09",9,"云顶小咽喉","clear-board"],
    ["cloud-10",10,"布丁王·初次见面","boss"],
    ["cloud-11",41,"错开的糖桥","clear-board"],
    ["cloud-12",42,"两扇糖霜窗","remove-targets"],
    ["cloud-13",43,"交替台阶","clear-board"],
    ["cloud-14",44,"糖伞的伞柄","remove-targets"],
    ["cloud-15",45,"抖落糖霜雨","clear-board"],
    ["cloud-16",46,"左甜右脆","remove-targets"],
    ["cloud-17",47,"解冻后的岔路","clear-board"],
    ["cloud-18",48,"斜巷深处","remove-targets"],
    ["cloud-19",49,"三桥交会","clear-board"],
    ["cloud-20",50,"布丁王·双层糖衣","boss"],
    ["cloud-21",81,"三层软糖架","clear-board"],
    ["cloud-22",82,"先拆小半边","remove-targets"],
    ["cloud-23",83,"云缝折射","clear-board"],
    ["cloud-24",84,"透明的颜色题","remove-targets"],
    ["cloud-25",85,"整片云朵落下来","clear-board"],
    ["cloud-26",86,"上桥留给下一球","remove-targets"],
    ["cloud-27",87,"两条路的会合点","clear-board"],
    ["cloud-28",88,"糖衣回廊","remove-targets"],
    ["cloud-29",89,"云顶连锁桥","clear-board"],
    ["cloud-30",90,"布丁王·云顶盛宴","boss"],
    ["ocean-01",11,"第一根锚链","drop-anchors"],
    ["ocean-02",12,"珊瑚两侧","clear-board"],
    ["ocean-03",13,"从礁边绕过去","drop-anchors"],
    ["ocean-04",14,"双链小浮标","drop-anchors"],
    ["ocean-05",15,"一桥落一串","drop-anchors"],
    ["ocean-06",16,"还有另一条链","drop-anchors"],
    ["ocean-07",17,"深处的蓝珠","remove-targets"],
    ["ocean-08",18,"高低锚位","drop-anchors"],
    ["ocean-09",19,"锚链交叉口","clear-board"],
    ["ocean-10",20,"鲨鱼大王·浅海试探","boss"],
    ["ocean-11",51,"左右潮道","drop-anchors"],
    ["ocean-12",52,"两层锚架","clear-board"],
    ["ocean-13",53,"共用一截链","drop-anchors"],
    ["ocean-14",54,"海沟的反弹口","remove-targets"],
    ["ocean-15",55,"六锚齐落","drop-anchors"],
    ["ocean-16",56,"高桥还是短桥","drop-anchors"],
    ["ocean-17",57,"锚后留一条缝","clear-board"],
    ["ocean-18",58,"一颗牵两团","drop-anchors"],
    ["ocean-19",59,"三支路会师","drop-anchors"],
    ["ocean-20",60,"鲨鱼大王·回流礁阵","boss"],
    ["ocean-21",91,"海底三叉树","drop-anchors"],
    ["ocean-22",92,"先清无锚小岛","clear-board"],
    ["ocean-23",93,"对岸的连接点","drop-anchors"],
    ["ocean-24",94,"保留下一次落点","remove-targets"],
    ["ocean-25",95,"深海大幕落下","drop-anchors"],
    ["ocean-26",96,"内环外环","drop-anchors"],
    ["ocean-27",97,"三次开窗","clear-board"],
    ["ocean-28",98,"锚链借道","drop-anchors"],
    ["ocean-29",99,"六锚连接网","drop-anchors"],
    ["ocean-30",100,"鲨鱼大王·深海回响","boss"],
    ["toy-01",21,"小车挪一格","clear-board"],
    ["toy-02",22,"窗口向右开","remove-targets"],
    ["toy-03",23,"同色排好了","clear-board"],
    ["toy-04",24,"来回的小门","remove-targets"],
    ["toy-05",25,"玩具串落地","clear-board"],
    ["toy-06",26,"空格先让出来","clear-board"],
    ["toy-07",27,"滑到反弹口","remove-targets"],
    ["toy-08",28,"先消这一端","clear-board"],
    ["toy-09",29,"两层玩具架","remove-targets"],
    ["toy-10",30,"发条熊·第一声咔嗒","boss"],
    ["toy-11",61,"一左一右","clear-board"],
    ["toy-12",62,"双窗只开半边","remove-targets"],
    ["toy-13",63,"开门前的两发","clear-board"],
    ["toy-14",64,"让路还是断桥","remove-targets"],
    ["toy-15",65,"咔嗒连锁落","clear-board"],
    ["toy-16",66,"被挡住的一格","clear-board"],
    ["toy-17",67,"回程接同色","remove-targets"],
    ["toy-18",68,"空口留给反弹","clear-board"],
    ["toy-19",69,"双轨连接检查","remove-targets"],
    ["toy-20",70,"发条熊·双轨巡游","boss"],
    ["toy-21",101,"三层空位图","clear-board"],
    ["toy-22",102,"目标跟着走","remove-targets"],
    ["toy-23",103,"三发一组的安排","clear-board"],
    ["toy-24",104,"先切静止支路","remove-targets"],
    ["toy-25",105,"满桌玩具一起落","clear-board"],
    ["toy-26",106,"先开左窗再右窗","remove-targets"],
    ["toy-27",107,"反弹口的回程","clear-board"],
    ["toy-28",108,"阻挡也有顺序","remove-targets"],
    ["toy-29",109,"三轨最后一格","clear-board"],
    ["toy-30",110,"发条熊·桌面总动员","boss"],
    ["magic-01",31,"第一颗符文","clear-board"],
    ["magic-02",32,"蓝色之后是红色","remove-targets"],
    ["magic-03",33,"排好也要再一发","clear-board"],
    ["magic-04",34,"先用当前的紫色","remove-targets"],
    ["magic-05",35,"魔法桥变色了","clear-board"],
    ["magic-06",36,"两种预告","clear-board"],
    ["magic-07",37,"反弹送到符文旁","remove-targets"],
    ["magic-08",38,"等一轮也有事做","clear-board"],
    ["magic-09",39,"双色岔路口","remove-targets"],
    ["magic-10",40,"小紫龙·第一道咒语","boss"],
    ["magic-11",71,"先后两种桥色","clear-board"],
    ["magic-12",72,"目标仍是那颗珠","remove-targets"],
    ["magic-13",73,"第三发先开路","clear-board"],
    ["magic-14",74,"两面反弹镜","remove-targets"],
    ["magic-15",75,"同色魔法大幕","clear-board"],
    ["magic-16",76,"留下配对珠","remove-targets"],
    ["magic-17",77,"这一轮与下一轮","clear-board"],
    ["magic-18",78,"斜塔换色","remove-targets"],
    ["magic-19",79,"双桥不会一起断","clear-board"],
    ["magic-20",80,"小紫龙·双咒回廊","boss"],
    ["magic-21",111,"三层咒语架","clear-board"],
    ["magic-22",112,"提前把球换好","remove-targets"],
    ["magic-23",113,"先拆普通旁路","clear-board"],
    ["magic-24",114,"四种色的两份计划","remove-targets"],
    ["magic-25",115,"星幕一起落下","clear-board"],
    ["magic-26",116,"开窗与留色","remove-targets"],
    ["magic-27",117,"错开的切色收益","clear-board"],
    ["magic-28",118,"回到第一种颜色","remove-targets"],
    ["magic-29",119,"十二符文连接网","clear-board"],
    ["magic-30",120,"小紫龙·奇境终章","boss"],
];

export const CAMPAIGN_REGIONS: readonly BubbleRegion[] = ['cloud', 'ocean', 'toy', 'magic'];
export const REGION_NAMES: Record<BubbleRegion, string> = { cloud: '云端软糖', ocean: '深海微光', toy: '桌面玩具', magic: '魔幻世界' };

/** Every route entry resolves an authored puzzle. A missing entry is a content error. */
function buildLevel(spec: LevelSpec): BubbleLevel {
    const [id, routeIndex, name, kind] = spec;
    const region = id.split('-')[0] as BubbleRegion, local = Number(id.split('-')[1]);
    const tier = Math.floor((local - 1) / 10), boss = kind === 'boss';
    const crafted = CRAFTED_BOARDS[id];
    if (!crafted) throw new Error('Missing authored campaign board: ' + id);
    const palette = crafted.palette.slice();
    const layout = (key: string, board: CraftedLayout): CampaignLayout => ({
        bubbles: craftedBubbles(key, board), phase: board.phase ?? 0, rails: board.rails?.map(r => ({ ...r })) ?? [],
    });
    const initial = layout(id, crafted);
    const targets = (crafted.targets ?? []).map(c => {
        const bubble = initial.bubbles.find(b => b.row === c.row && b.col === c.col);
        if (!bubble) throw new Error('Missing authored target: ' + id + '/' + c.row + ':' + c.col);
        return bubble.id!;
    });
    const goal: LevelGoal = boss ? { kind, health: 60 } : kind === 'clear-board' ? { kind } : { kind, bubbleIds: targets };
    const refillPlan = CAMPAIGN_BOSS_REFILLS[id];
    if (boss && (!refillPlan || refillPlan.length !== 3)) throw new Error('Missing authored finite boss refills: ' + id);
    const refills = boss ? refillPlan.map((board, i) => layout(id + '/refill-' + (i + 1), board)) : [];
    const revision = id === 'cloud-10' ? 3 : 2;
    const rows = Array.from({ length: boss ? 5 + tier * 2 : 0 }, (_, index) => {
        const make = (phase: number) => Array.from({ length: COLUMNS - phase }, (_, col): Bubble => ({
            id: `${id}/row/${index}/${phase}/${col}`, row: 0, col,
            color: palette[(Math.floor(col / 3) + index) % palette.length], frosted: false,
        }));
        return { phase0: make(0), phase1: make(1) };
    });
    return {
        id, revision, rulesVersion: CAMPAIGN_RULES_VERSION, boardProfile: CAMPAIGN_BOARD_PROFILE,
        region, numberInRegion: local, routeIndex, name, design: crafted.tip, palette, goal, shotBudget: crafted.budget, initial,
        stars: { threeMaxShots: crafted.three, twoMaxShots: crafted.two },
        supply: { current: crafted.current, next: crafted.next, openingQueue: crafted.queue.slice(), seed: routeIndex * 2654435761 >>> 0, maxUnhelpfulDraws: 2 },
        items: { bomb: 0, wildcard: 0, 'clear-bottom': 0 },
        bossPlan: boss ? { rows, refills, frostTargets: tier + 1, anchorTargets: Math.min(2, tier + 1) } : undefined,
        tutorialKeys: ['goal:' + id + ':v' + revision], contentStatus: 'authored', tip: crafted.tip,
    };
}

export function campaignBoardConnected(bubbles: readonly Bubble[], phase: number): boolean {
    const occupied = new Map(bubbles.map(b => [`${b.row}:${b.col}`, b]));
    const connected = new Set<string>(), queue = bubbles.filter(b => b.row === 0);
    for (let i = 0; i < queue.length; i++) {
        const bubble = queue[i], key = `${bubble.row}:${bubble.col}`;
        if (connected.has(key)) continue;
        connected.add(key);
        neighbors(bubble, phase).forEach(c => { const neighbor = occupied.get(`${c.row}:${c.col}`); if (neighbor) queue.push(neighbor); });
    }
    return connected.size === bubbles.length;
}

export function validateCampaignLayout(layout: CampaignLayout, palette: readonly BubbleColor[], region: BubbleRegion): void {
    if (layout.rails.length > 3) throw new Error('Campaign rail cap exceeded.');
    const model = new BubbleShooterModel();
    model.reset(layout.bubbles, layout.phase);
    if (model.danger || !model.removableBubbles.length) throw new Error('Unsafe or empty initial campaign board.');
    const ids = new Set<string>();
    for (const b of layout.bubbles) {
        if (!b.id || ids.has(b.id) || (!b.indestructible && !(palette.indexOf(b.color) >= 0))
            || (b.runeNext && (!(palette.indexOf(b.runeNext) >= 0) || region !== 'magic'))
            || (b.frosted && region !== 'cloud') || (b.solidKind && region !== 'ocean')) throw new Error('Invalid campaign bubble identity or theme.');
        ids.add(b.id);
    }
    if (layout.bubbles.filter(b => b.solidKind === 'ocean').length > 6 || layout.bubbles.filter(b => b.runeNext).length > 12) throw new Error('Campaign mechanic cap exceeded.');
    if (!campaignBoardConnected(layout.bubbles, layout.phase)) throw new Error('Floating initial campaign bubble.');
    const rows = new Set<number>();
    for (const rail of layout.rails) {
        if (region !== 'toy' || rows.has(rail.row) || !Number.isInteger(rail.row) || !Number.isInteger(rail.start)
            || !Number.isInteger(rail.end) || rail.start >= rail.end || (rail.direction !== 1 && rail.direction !== -1)
            || !valid({ row: rail.row, col: rail.start }, layout.phase) || !valid({ row: rail.row, col: rail.end }, layout.phase)
            || !layout.bubbles.some(b => b.row === rail.row && b.col >= rail.start && b.col <= rail.end && !b.indestructible)
            || layout.bubbles.filter(b => b.row === rail.row && b.col >= rail.start && b.col <= rail.end).length >= rail.end - rail.start + 1) throw new Error('Invalid initial campaign rail.');
        rows.add(rail.row);
    }
}

export function validateBubbleLevel(level: BubbleLevel): void {
    if (['clear-board','remove-targets','drop-anchors','boss'].indexOf(level.goal.kind) < 0
        || CAMPAIGN_REGIONS.indexOf(level.region) < 0 || !Number.isInteger(level.routeIndex) || level.routeIndex < 1 || level.routeIndex > 120
        || !Number.isInteger(level.numberInRegion) || level.numberInRegion < 1 || level.numberInRegion > 30
        || level.rulesVersion !== CAMPAIGN_RULES_VERSION || level.boardProfile !== CAMPAIGN_BOARD_PROFILE
        || !Number.isInteger(level.revision) || level.revision < 1 || level.palette.length < 2 || level.palette.length > 4
        || new Set(level.palette).size !== level.palette.length || level.palette.some(c => !(COLORS.indexOf(c) >= 0))
        || !Number.isInteger(level.shotBudget) || level.shotBudget < 1
        || !Number.isInteger(level.stars.threeMaxShots) || !Number.isInteger(level.stars.twoMaxShots) || level.stars.threeMaxShots < 1 || level.stars.twoMaxShots < level.stars.threeMaxShots || level.stars.twoMaxShots > level.shotBudget
        || !Number.isInteger(level.supply.maxUnhelpfulDraws) || level.supply.maxUnhelpfulDraws < 1 || level.supply.maxUnhelpfulDraws > 3
        || !['bomb', 'wildcard', 'clear-bottom'].every(k => level.items[k] === 0)) throw new Error('Invalid campaign configuration.');
    validateCampaignLayout(level.initial, level.palette, level.region);
    const ids = new Set(level.initial.bubbles.map(b => b.id));
    if ('bubbleIds' in level.goal && (!level.goal.bubbleIds.length || new Set(level.goal.bubbleIds).size !== level.goal.bubbleIds.length
        || level.goal.bubbleIds.some(id => !ids.has(id) || (level.goal.kind === 'drop-anchors'
            ? !level.initial.bubbles.some(b => b.id === id && b.solidKind === 'ocean' && b.row > 0)
            : level.initial.bubbles.some(b => b.id === id && b.indestructible))))) throw new Error('Invalid campaign targets.');
    const available = new Set<BubbleColor>();
    level.initial.bubbles.filter(b => !b.indestructible).forEach(b => { available.add(b.color); if (b.runeNext) available.add(b.runeNext); });
    if (!available.has(level.supply.current) || !available.has(level.supply.next) || level.supply.openingQueue.some(c => !(level.palette.indexOf(c) >= 0))) throw new Error('Invalid initial campaign supply.');
    if (level.goal.kind === 'boss') {
        if (!level.bossPlan || level.goal.health < 1 || level.goal.health > 60) throw new Error('Missing finite boss plan.');
        for (const layout of level.bossPlan.refills) { validateCampaignLayout(layout, level.palette, level.region); for (const b of layout.bubbles) { if (ids.has(b.id)) throw new Error('Reused refill identity.'); ids.add(b.id); } }
        for (const row of level.bossPlan.rows) for (const phase of [0, 1] as const) {
            const bubbles = phase === 0 ? row.phase0 : row.phase1;
            if (bubbles.length > COLUMNS - phase) throw new Error('Invalid finite top-row width.');
            const cells = new Set<number>();
            for (const b of bubbles) {
                if (b.row !== 0 || !valid(b, phase) || !b.id || ids.has(b.id) || cells.has(b.col)
                    || !(level.palette.indexOf(b.color) >= 0) || b.indestructible || b.frosted || b.runeNext) throw new Error('Invalid finite top row.');
                cells.add(b.col); ids.add(b.id);
            }
        }
    }
}

export const BUBBLE_LEVELS: readonly BubbleLevel[] = SPECS.map(buildLevel).sort((a, b) => a.routeIndex - b.routeIndex);
export function bubbleLevel(id: string): BubbleLevel | undefined { return BUBBLE_LEVELS.find(level => level.id === id); }
export function campaignGoalText(goal: LevelGoal): string {
    return goal.kind === 'clear-board' ? '清空彩色泡泡' : goal.kind === 'remove-targets' ? `清除 ${goal.bubbleIds.length} 颗目标泡泡`
        : goal.kind === 'drop-anchors' ? `让 ${goal.bubbleIds.length} 颗锚珠掉落` : '击败首领';
}

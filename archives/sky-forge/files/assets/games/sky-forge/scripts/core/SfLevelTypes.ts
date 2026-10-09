import type { BossTier, PickupKind } from './SfTypes';

export type FormationKind =
    | 'column' | 'v' | 'row' | 'snake' | 'swoop' | 'hover' | 'float' | 'ground'
    | 'cross' | 'circle' | 'scatter' | 'charge' | 'carrier' | 'elite' | 'mimic'
    | 'solo' | 'pincer' | 'stair' | 'escort' | 'edge';

/**
 * 波次编排里的一个编队事件（DESIGN.md §7.1）。
 * 坐标：x 为设计像素（战场宽 750，中心为 0）；y 为 0～1 的战场高度比例（1 = 顶部）。
 */
export interface WaveEvent {
    t: number;
    /** 编队模板：通用模板或章节注册的专属编队名（content/ch<N>/formations）。 */
    f: FormationKind | (string & {});
    e: string;
    n?: number;
    x?: number;
    side?: -1 | 1;
    /** 成员间隔：横向编队为像素，纵向/路径编队为秒。 */
    gap?: number;
    speed?: number;
    y?: number;
    hold?: number;
    /** 整队全歼奖励（补给机则为必掉物）。 */
    drop?: PickupKind;
    amp?: number;
    /** 覆盖默认开火间隔倍率（>1 更慢）。 */
    fireScale?: number;
    /** 护航编队的护航机（默认纸翼小贼）。 */
    escort?: string;
}

export interface LevelDef {
    id: string;
    chapter: number;
    index: number;
    /** 全局关卡序号 1～30，用于推荐战力与敌人血量。 */
    number: number;
    name: string;
    boss: string;
    tier: BossTier;
    /** 波次结束、Boss 警报开始的时间（秒）。 */
    bossAt: number;
    waves: WaveEvent[];
    scroll: number;
    /** 三星分数线。 */
    starScore: number;
    /** 特殊规则（x-3）。 */
    rule?: string;
    /** 新敌人首次出现时的提示。 */
    intro?: string;
}

export interface ChapterDef {
    id: number;
    name: string;
    subtitle: string;
    /** 场景资源目录名。 */
    scene: string;
    levels: LevelDef[];
    hiddenBoss: string;
    available: boolean;
}

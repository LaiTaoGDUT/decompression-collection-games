/**
 * 机体套件的视觉状态（纯数据，不依赖 cc）：套件每帧在 update 末尾刷新，视图 `SfKitView` 只读。
 * 只描述“子弹之外”需要画出来的机制元素，例如幻影分身、寒冰水晶护盾、曙光激光与日轮。
 */
export interface KitVisual {
    /** 半透明机体分身（幻影镜像、万花镜分身）：tint 为分身染色。 */
    clones: { x: number; y: number; alpha: number; tint: string }[];
    /** 两点之间的光束（幻影本体 ↔ 分身）。 */
    links: { ax: number; ay: number; bx: number; by: number; width: number; color: string }[];
    /** 环绕玩家的护盾晶体（frame 为弹体贴图键）；ready 为 false 时处于再生冷却。 */
    orbs: { x: number; y: number; radius: number; ready: boolean; color: string; frame: string }[];
    /** 激光束（曙光主炮、翼光束、日轮短激光）：从 a 到 b，width 为核心宽度。 */
    beams: { ax: number; ay: number; bx: number; by: number; width: number; alpha: number; color: string }[];
    /** 任意贴图演员（雁阵僚机、黑洞）：frame 为贴图键，scale 相对贴图显示尺寸。 */
    actors: { frame: string; x: number; y: number; angle: number; scale: number; alpha: number; tint: string }[];
    /** 机头光球（曙光枪口）：value 为 0～1。 */
    charge?: { x: number; y: number; value: number; color: string };
}

export function emptyKitVisual(): KitVisual {
    return { clones: [], links: [], orbs: [], beams: [], actors: [] };
}

/** 清空复用（避免每帧分配新对象）。 */
export function resetKitVisual(v: KitVisual): void {
    v.clones.length = 0;
    v.links.length = 0;
    v.orbs.length = 0;
    v.beams.length = 0;
    v.actors.length = 0;
    v.charge = undefined;
}

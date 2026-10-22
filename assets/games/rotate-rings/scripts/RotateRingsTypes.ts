export type RingMode = 'normal' | 'hard';
export type RingProp = 'hint';
export interface RingPoint { x: number; y: number; }
export interface RingRect { cx: number; cy: number; hx: number; hy: number; axisX: RingPoint; axisY: RingPoint; }
export interface RingPin {
    featureId: string; angleDeg: number; rotDeg: number; radius: number;
    mouthSize: RingPoint;
    prongs: { offset: number; halfThick: number; halfLen: number }[];
}
export interface RingPart {
    id: string; index: number; x: number; y: number; angle: number;
    inner: number; outer: number; gapWidth: number; gapDir: number; renderGap: number;
    /** 原本体碰撞轮廓；多路径按奇偶规则保留闭合环的孔。 */
    bodyLocal?: RingPoint[][];
    pins: RingPin[]; hardBlocks: RingPoint[][];
}
export interface RingPull {
    id: string; x: number; y: number; angle: number; polyLocal: RingPoint[];
    /** 拖动轴在滑杆局部坐标中的角度：原 lockDirectionType=1 沿局部 X（0），=0 沿局部 Y（90）。 */
    dragAxis: 0 | 90;
    moveThreshold: number; negative: boolean; positive: boolean;
}
export interface RingFixed { id: string; x: number; y: number; angle: number; polygons: RingPoint[][]; }
export interface RingLink { sourceRingId: string; pinFeatureId: string; targetPartId: string; }
export interface RingBomb {
    /** 二者均无值时为独立棋盘炸弹；圆环炸弹沿用 ringId 以兼容原存档索引。 */
    ringId?: string; pullId?: string; x: number; y: number; radius: number;
    /** 原图片中心与碰撞圆偏移分别保存，保留原旋转方向。 */
    visual?: { x: number; y: number; angle: number };
}
export interface RingLevel {
    id: number; rings: RingPart[]; pullObjects: RingPull[]; fixedObjects: RingFixed[];
    referenceBounds?: { minX: number; minY: number; maxX: number; maxY: number };
    links: RingLink[]; guides: { guidePartId: string; stickPartId: string }[];
    bombs: RingBomb[];
}
export interface RingLevelSummary { id: number; rings: number; links: number; pulls: number; bombs: number; }
export interface RingLevelBank { version: number; modes: Record<RingMode, RingLevelSummary[]>;
    packing?: { version: number; meshCount: number; bankSize: number; collisionShapeCount: number }; }
export interface RingSnapshot {
    levelId: number; angles: Record<string, number>; offsets: Record<string, number>;
    solved: number[]; removedRings: string[]; removedPulls: string[]; moves: number; seconds: number;
    explodedBombs?: number[]; removedFixed?: string[];
    /** 1 表示滑杆偏移按各自拖动轴记录；此前的存档一律按局部 X 记录。 */
    pullAxes?: number;
    comboStreak?: number; comboMisses?: number;
}
export interface RingHint { kind: 'ring' | 'pull'; id: string; target: number; }

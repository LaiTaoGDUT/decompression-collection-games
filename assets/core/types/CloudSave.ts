/** 云存档字段契约只描述数据，不引用任何游戏 Bundle。发布后 code 和字段次序不可复用。 */
export interface CloudNumberField {
    readonly path: string;
    readonly starProgress?: boolean;
    readonly metric?: string;
    /** 固定格式字段只接受当前值，不转换其他版本。 */
    readonly constant?: number;
    readonly max?: number;
    /** 累计场次/胜场可同步，但不作为非关卡游戏结算破纪录的上传触发器。 */
    readonly record?: boolean;
    readonly restoreAlso?: readonly { path: string; offset: number; max?: number; preserveWhen?: string }[];
}

export interface CloudStarsField {
    readonly path: string;
    readonly keys: readonly string[];
    readonly valuePath?: string;
    readonly thresholds?: readonly number[];
    readonly defaults?: Readonly<Record<string, unknown>>;
    readonly restoreValues?: readonly number[];
}

export interface CloudGameSchema {
    readonly gameId: string;
    readonly code: number;
    readonly dataVersion: number;
    readonly numbers: readonly CloudNumberField[];
    /** 用于展示/校验的进度指标；合并时各字段独立取最大值。 */
    readonly rank: readonly number[];
    readonly levels?: readonly number[];
    readonly stars?: CloudStarsField;
    readonly defaults?: Readonly<Record<string, unknown>>;
    readonly achievement?: { readonly code: number; readonly id: string; readonly metric: string;
        readonly target: number; readonly field?: number; readonly threeStars?: boolean };
}

export interface CloudSaveCatalog { readonly version: 1; readonly games: readonly CloudGameSchema[]; }

export interface CloudSavePatch {
    readonly v: 2;
    readonly op: 'save';
    readonly device: string;
    readonly seq: number;
    readonly m: Readonly<Record<string, string>>;
    readonly a?: string;
    /** 本批尚未确认的实际玩法毫秒数，以 gameId 为键；与进度在同一事务内去重。 */
    readonly t: Readonly<Record<string, number>>;
}

export interface CloudPendingUpload {
    readonly request: CloudSavePatch;
    readonly cleared: number;
    readonly trigger: number;
}

/** 与本地游戏数据放在同一个持久化根快照，ACK 不会清掉请求期间的新进度。 */
export interface CloudSaveLocalState {
    readonly version: 2;
    readonly device: string;
    readonly seq: number;
    readonly enabled: boolean;
    readonly restore: 'pending' | 'done';
    readonly totalMs: number;
    readonly gameMs: Readonly<Record<string, number>>;
    readonly loginDays: readonly string[];
    readonly progressPeaks: Readonly<Record<string, string>>;
    readonly playMs: Readonly<Record<string, number>>;
    readonly unsavedClears: number;
    readonly lastUploadAt: number;
    readonly ack: Readonly<Record<string, string>>;
    readonly ackAchievements: string;
    readonly requested: boolean;
    readonly trigger: number;
    /** 当前自建后端至少确认过一次保存；CloudBase 的旧 ACK 不沿用。 */
    readonly seeded: boolean;
    readonly pending?: CloudPendingUpload;
}

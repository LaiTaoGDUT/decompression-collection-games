/** 云存档字段契约只描述数据，不引用任何游戏 Bundle。发布后 code 和字段次序不可复用。 */
export interface CloudNumberField {
    readonly path: string;
    readonly starProgress?: boolean;
    readonly metric?: string;
    /** 固定格式字段只接受当前值，不转换其他版本。 */
    readonly constant?: number;
    readonly max?: number;
    readonly restoreAlso?: readonly { path: string; offset: number; max?: number }[];
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
    /** 这些字段求和作为整模块比较依据；绝不分别挑选字段。 */
    readonly rank: readonly number[];
    readonly levels?: readonly number[];
    readonly stars?: CloudStarsField;
    readonly defaults?: Readonly<Record<string, unknown>>;
    readonly achievement?: { readonly code: number; readonly id: string; readonly metric: string;
        readonly target: number; readonly field?: number; readonly threeStars?: boolean };
}

export interface CloudSaveCatalog { readonly version: 1; readonly games: readonly CloudGameSchema[]; }

export interface CloudSavePatch {
    readonly v: 1;
    readonly op: 'save';
    readonly device: string;
    readonly seq: number;
    readonly m: Readonly<Record<string, string>>;
    readonly a?: string;
}

export interface CloudPendingUpload {
    readonly request: CloudSavePatch;
    readonly cleared: number;
}

/** 与本地游戏数据放在同一个持久化根快照，ACK 不会清掉请求期间的新进度。 */
export interface CloudSaveLocalState {
    readonly version: 1;
    readonly device: string;
    readonly seq: number;
    readonly enabled: boolean;
    readonly restore: 'pending' | 'done';
    readonly totalMs: number;
    readonly gameMs: Readonly<Record<string, number>>;
    readonly days: Readonly<Record<string, number>>;
    readonly levelPeaks: Readonly<Record<string, number>>;
    readonly unsavedClears: number;
    readonly lastUploadAt: number;
    readonly ack: Readonly<Record<string, string>>;
    readonly ackAchievements: string;
    readonly requested: boolean;
    readonly pending?: CloudPendingUpload;
}

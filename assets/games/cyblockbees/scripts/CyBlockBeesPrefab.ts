import type { CyBlockBeesCollider } from './CyBlockBeesLevels';

/** 来自 Unity prefab 的完整运行时数据；由 build-level-bank.py 生成实例。 */
export interface CyBlockBeesPrefab {
    readonly name: string;
    readonly layer: number;
    readonly body: {
        readonly type: number;
        readonly mass: number;
        readonly gravity: number;
        readonly drag: number;
        readonly angularDrag: number;
        readonly constraints: number;
    } | null;
    readonly colliders: readonly (CyBlockBeesCollider & {
        readonly role?: string | null;
        readonly sensor: boolean;
        readonly layer: number;
        readonly friction: number;
        readonly restitution: number;
    })[];
    readonly visuals: readonly {
        readonly slug: string;
        /** [a,b,c,d,tx,ty]，相对物理入口的二维仿射变换。 */
        readonly matrix: readonly number[];
        readonly width: number;
        readonly height: number;
        readonly mode: number;
        readonly order: number;
        readonly color: readonly number[];
    }[];
    readonly generated: readonly {
        readonly path: readonly number[];
        readonly red: boolean;
        readonly wood: boolean;
        readonly rounding: number;
        readonly edges: readonly { readonly path: readonly number[]; readonly upper: boolean }[];
    }[];
    readonly joints: readonly {
        readonly type: string;
        readonly target: number;
        readonly anchor: readonly number[];
        readonly connectedAnchor: readonly number[];
        readonly autoAnchor: boolean;
        readonly distance: number;
        readonly frequency: number;
        readonly damping: number;
        readonly collision: boolean;
    }[];
    readonly points?: Readonly<Record<string, readonly number[]>>;
    readonly refs: Readonly<Record<string, number>>;
}

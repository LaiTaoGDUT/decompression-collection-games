import {
    DEFAULT_WATERMELON_GAMEPLAY_CONFIG,
    type WatermelonGameplayConfig,
} from './WatermelonGameplayConfig';

export interface FruitLevelConfig {
    readonly level: number;
    readonly id: string;
    readonly displayName: string;
    readonly radius: number;
    readonly mass: number;
    readonly density: number;
    readonly friction: number;
    readonly restitution: number;
    readonly gravityScale: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly score: number;
    readonly color: Readonly<{
        r: number;
        g: number;
        b: number;
    }>;
    readonly backgroundColor: Readonly<{
        r: number;
        g: number;
        b: number;
    }>;
    readonly prefab: string;
    readonly sprite: string;
    readonly animationSprites: readonly [string, string, string];
    readonly initialSpawn: boolean;
    readonly nextLevel?: number;
}

/** C6 sprites keep a two-pixel transparent gutter for safe texture filtering. */
export const CAT_TOKEN_VISIBLE_DIAMETER_RATIO = 252 / 256;

const DEFINITIONS = [
    ['cream-kitten', '小奶猫', [247, 221, 176], 'cherry'],
    ['gray-tabby', '灰灰', [157, 164, 173], 'strawberry'],
    ['calico', '三花猫', [224, 155, 85], 'grape'],
    ['tuxedo', '奶牛猫', [62, 65, 74], 'dekopon'],
    ['white-fluffy', '小白团', [244, 244, 238], 'orange'],
    ['brown-tabby', '虎斑猫', [153, 104, 62], 'apple'],
    ['siamese', '暹罗猫', [210, 185, 151], 'pear'],
    ['golden-shorthair', '金渐层', [230, 169, 73], 'peach'],
    ['blue-scottish-fold', '蓝灰折耳', [103, 111, 134], 'pineapple'],
    ['orange-tabby', '黑烟虎斑', [67, 65, 76], 'melon'],
    ['fat-orange', '大胖橘', [235, 128, 28], 'watermelon'],
] as const;

const FRAME_VERSIONS = [
    'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1',
    'c6-v1', 'c6-v1', 'c8-v1', 'c6-v1', 'c6-v1',
] as const;

/** Per-level pair with the smallest measured pixel delta among the old three idle frames. */
const IDLE_FRAME_PAIRS = [
    [1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2],
    [1, 2], [1, 2], [1, 2], [1, 2], [1, 2],
] as const;

/**
 * 1～11 级猫咪的独立背景色相。
 *
 * Each level deliberately uses a different hue family so the cat silhouette
 * remains readable after merges and the next-cat preview is easy to scan.
 */
const BALL_BACKGROUND_COLORS = [
    [154, 184, 234], // 01 sky blue
    [238, 158, 148], // 02 coral
    [111, 201, 188], // 03 turquoise
    [242, 199, 91],  // 04 sunflower
    [192, 167, 229], // 05 lilac
    [155, 201, 158], // 06 sage
    [119, 169, 216], // 07 denim
    [201, 141, 187], // 08 plum
    [230, 164, 110], // 09 apricot
    [182, 200, 107], // 10 olive
    [215, 123, 157], // 11 berry
] as const;

function createFruitCatalog(
    gameplay: WatermelonGameplayConfig,
): readonly FruitLevelConfig[] {
    return Object.freeze(
    DEFINITIONS.map((definition, level) => {
        const [id, displayName, rgb, legacyPrefabId] = definition;
        const physics = gameplay.fruits[level];
        const assetPrefix = `visual/cats/frames-c6/cat-${level < 10 ? '0' : ''}${level}-${id}`;
        const frameVersion = FRAME_VERSIONS[level];
        const [firstIdle, secondIdle] = IDLE_FRAME_PAIRS[level];
        const animationSprites = Object.freeze([
            `${assetPrefix}-idle-${firstIdle}-${frameVersion}/texture`,
            `${assetPrefix}-idle-${secondIdle}-${frameVersion}/texture`,
            `${assetPrefix}-fall-${frameVersion}/texture`,
        ]) as readonly [string, string, string];
        return Object.freeze({
            level,
            id,
            displayName,
            radius: physics.radius,
            mass: physics.mass,
            density: Number((physics.mass / (Math.PI * physics.radius * physics.radius)).toFixed(6)),
            friction: physics.friction,
            restitution: physics.restitution,
            gravityScale: gameplay.gravityScale,
            linearDamping: gameplay.linearDamping,
            angularDamping: gameplay.angularDamping,
            score: gameplay.mergeScores[level],
            color: Object.freeze({ r: rgb[0], g: rgb[1], b: rgb[2] }),
            backgroundColor: Object.freeze({
                r: BALL_BACKGROUND_COLORS[level][0],
                g: BALL_BACKGROUND_COLORS[level][1],
                b: BALL_BACKGROUND_COLORS[level][2],
            }),
            // Keep the existing serialized physics prefabs for save and scene
            // compatibility; only the runtime visual catalog changes to cats.
            prefab: `prefabs/fruits/fruit-${level < 10 ? '0' : ''}${level}-${legacyPrefabId}`,
            sprite: animationSprites[0],
            animationSprites,
            initialSpawn: level <= 4,
            ...(level < DEFINITIONS.length - 1 ? { nextLevel: level + 1 } : {}),
        });
    }),
    );
}

export const FRUIT_LEVELS: readonly FruitLevelConfig[] = createFruitCatalog(
    DEFAULT_WATERMELON_GAMEPLAY_CONFIG,
);

let activeFruitLevels = FRUIT_LEVELS;

export function configureFruitCatalog(gameplay: WatermelonGameplayConfig): void {
    activeFruitLevels = createFruitCatalog(gameplay);
}

export function getFruitConfig(level: number): FruitLevelConfig {
    const config = activeFruitLevels[level];

    if (!config || config.level !== level) {
        throw new Error(`Unknown fruit level: ${level}.`);
    }

    return config;
}

export function validateFruitCatalog(
    catalog: readonly FruitLevelConfig[] = FRUIT_LEVELS,
): readonly string[] {
    const errors: string[] = [];
    const ids = new Set<string>();

    catalog.forEach((fruit, index) => {
        if (fruit.level !== index) {
            errors.push(`Level ${index} is missing or out of order.`);
        }

        if (!fruit.id || ids.has(fruit.id)) {
            errors.push(`Fruit ID at level ${index} is empty or duplicated.`);
        }

        ids.add(fruit.id);

        if (fruit.radius <= 0
            || fruit.mass <= 0
            || fruit.density <= 0
            || fruit.friction < 0
            || fruit.restitution < 0
            || fruit.gravityScale <= 0
            || fruit.linearDamping < 0
            || fruit.angularDamping < 0
            || fruit.score <= 0
            || !fruit.prefab
            || !fruit.sprite
            || fruit.animationSprites.length !== 3
            || fruit.animationSprites.some((path) => !path)) {
            errors.push(`Fruit level ${index} has incomplete physical data.`);
        }

        const expectedNext = index < catalog.length - 1 ? index + 1 : undefined;

        if (fruit.nextLevel !== expectedNext) {
            errors.push(`Fruit level ${index} has an invalid next level.`);
        }
    });

    return Object.freeze(errors);
}

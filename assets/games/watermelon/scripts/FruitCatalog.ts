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
    readonly prefab: string;
    readonly sprite: string;
    readonly initialSpawn: boolean;
    readonly nextLevel?: number;
}

/** C6 sprites keep a two-pixel transparent gutter for safe texture filtering. */
export const CAT_TOKEN_VISIBLE_DIAMETER_RATIO = 252 / 256;

// Fruit IDs and display names are the gameplay source of truth. The final
// column only preserves the legacy cat texture key until those files are
// physically renamed; it must not determine fruit identity or merge order.
const DEFINITIONS = [
    ['cherry', '小樱桃', [247, 221, 176], 'cherry', 'cream-kitten'],
    ['grape', '葡萄', [224, 155, 85], 'strawberry', 'calico'],
    ['strawberry', '草莓', [157, 164, 173], 'grape', 'gray-tabby'],
    ['dekopon', '小橘子', [62, 65, 74], 'dekopon', 'tuxedo'],
    ['orange', '橙子', [244, 244, 238], 'orange', 'white-fluffy'],
    ['apple', '苹果', [153, 104, 62], 'apple', 'brown-tabby'],
    ['pear', '梨子', [210, 185, 151], 'pear', 'siamese'],
    ['peach', '桃子', [230, 169, 73], 'peach', 'golden-shorthair'],
    ['pineapple', '菠萝', [103, 111, 134], 'pineapple', 'blue-scottish-fold'],
    ['melon', '哈密瓜', [67, 65, 76], 'melon', 'orange-tabby'],
    ['watermelon', '大西瓜', [235, 128, 28], 'watermelon', 'fat-orange'],
] as const;

const FRAME_VERSIONS = [
    'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1', 'c6-v1',
    'c6-v1', 'c6-v1', 'c8-v1', 'c6-v1', 'c6-v1',
] as const;

function createFruitCatalog(
    gameplay: WatermelonGameplayConfig,
): readonly FruitLevelConfig[] {
    return Object.freeze(
    DEFINITIONS.map((definition, level) => {
        const [id, displayName, rgb, legacyPrefabId, legacyCatAssetId] = definition;
        const physics = gameplay.fruits[level];
        const assetPrefix = `visual/cats/frames-c6/cat-${level < 10 ? '0' : ''}${level}-${legacyCatAssetId}`;
        const frameVersion = FRAME_VERSIONS[level];
        const sprite = `${assetPrefix}-idle-1-${frameVersion}/texture`;
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
            // Keep the existing serialized prefab filename for scene and save
            // compatibility; gameplay identity comes from the fruit ID above.
            prefab: `prefabs/fruits/fruit-${level < 10 ? '0' : ''}${level}-${legacyPrefabId}`,
            sprite,
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
            || !fruit.sprite) {
            errors.push(`Fruit level ${index} has incomplete physical data.`);
        }

        const expectedNext = index < catalog.length - 1 ? index + 1 : undefined;

        if (fruit.nextLevel !== expectedNext) {
            errors.push(`Fruit level ${index} has an invalid next level.`);
        }
    });

    return Object.freeze(errors);
}

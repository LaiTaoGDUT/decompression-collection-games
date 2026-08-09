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

const DEFINITIONS = [
    ['cherry', '樱桃', [245, 67, 74]],
    ['strawberry', '草莓', [255, 96, 112]],
    ['grape', '葡萄', [132, 81, 201]],
    ['dekopon', '橘子', [255, 151, 52]],
    ['orange', '橙子', [255, 181, 43]],
    ['apple', '苹果', [238, 72, 63]],
    ['pear', '梨', [189, 213, 77]],
    ['peach', '桃子', [255, 155, 165]],
    ['pineapple', '菠萝', [240, 190, 60]],
    ['melon', '甜瓜', [126, 190, 84]],
    ['watermelon', '西瓜', [62, 157, 82]],
] as const;

function createFruitCatalog(
    gameplay: WatermelonGameplayConfig,
): readonly FruitLevelConfig[] {
    return Object.freeze(
    DEFINITIONS.map((definition, level) => {
        const [id, displayName, rgb] = definition;
        const physics = gameplay.fruits[level];
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
            prefab: `prefabs/fruits/fruit-${level < 10 ? '0' : ''}${level}-${id}`,
            // The generated paper fruit PNGs are imported as Texture2D assets.
            // WatermelonGame owns the runtime SpriteFrames created from them.
            sprite: `visual/fruits/fruit-${level < 10 ? '0' : ''}${level}-${id}-w1-v1/texture`,
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

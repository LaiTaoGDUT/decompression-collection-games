/**
 * CyBlockBees 的精灵帧路径（离线生成，运行时只读）。
 *
 * 键是 `sprite-atlas-sources/cyblockbees` 里的 slug，值是 Bundle 内帧或独立纹理的路径，
 * 由 `project-scripts/cyblockbees/extract-art.py` 生成；重新导出素材后需要重新生成。
 */

import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';

export const CYBLOCKBEES_SPRITES = Object.freeze({
    'ball': PACKED_SPRITE_PATHS['visual/game/ball-v1/spriteFrame'],
    'bar-fill': PACKED_SPRITE_PATHS['visual/ui/bar-fill-v1/spriteFrame'],
    'bar-track': PACKED_SPRITE_PATHS['visual/ui/bar-track-v1/spriteFrame'],
    'bee': PACKED_SPRITE_PATHS['visual/game/bee-v1/spriteFrame'],
    'bee-die': PACKED_SPRITE_PATHS['visual/game/bee-die-v1/spriteFrame'],
    'black-hole': PACKED_SPRITE_PATHS['visual/game/black-hole-v1/spriteFrame'],
    'bomb': PACKED_SPRITE_PATHS['visual/game/bomb-v1/spriteFrame'],
    'box-1': PACKED_SPRITE_PATHS['visual/game/box-1-v1/spriteFrame'],
    'box-2': PACKED_SPRITE_PATHS['visual/game/box-2-v1/spriteFrame'],
    'box-3': PACKED_SPRITE_PATHS['visual/game/box-3-v1/spriteFrame'],
    'box-inner': PACKED_SPRITE_PATHS['visual/game/box-inner-v1/spriteFrame'],
    'box-outline': PACKED_SPRITE_PATHS['visual/game/box-outline-v1/spriteFrame'],
    'brick-1': PACKED_SPRITE_PATHS['visual/game/brick-1-v1/spriteFrame'],
    'brick-2': PACKED_SPRITE_PATHS['visual/game/brick-2-v1/spriteFrame'],
    'cloud-1': PACKED_SPRITE_PATHS['visual/backdrop/cloud-1-v1/spriteFrame'],
    'cloud-2': PACKED_SPRITE_PATHS['visual/backdrop/cloud-2-v1/spriteFrame'],
    'cloud-3': PACKED_SPRITE_PATHS['visual/backdrop/cloud-3-v1/spriteFrame'],
    'dog-beaten': PACKED_SPRITE_PATHS['visual/game/dog-beaten-v1/spriteFrame'],
    'dog-idle': PACKED_SPRITE_PATHS['visual/game/dog-idle-v1/spriteFrame'],
    'dog-lose': PACKED_SPRITE_PATHS['visual/game/dog-lose-v1/spriteFrame'],
    'dog-scared': PACKED_SPRITE_PATHS['visual/game/dog-scared-v1/spriteFrame'],
    'dog-win': PACKED_SPRITE_PATHS['visual/game/dog-win-v1/spriteFrame'],
    'fx-bubble': PACKED_SPRITE_PATHS['visual/effect/fx-bubble-v1/spriteFrame'],
    'fx-glow-1': PACKED_SPRITE_PATHS['visual/effect/fx-glow-1-v1/spriteFrame'],
    'fx-glow-2': PACKED_SPRITE_PATHS['visual/effect/fx-glow-2-v1/spriteFrame'],
    'fx-glow-3': PACKED_SPRITE_PATHS['visual/effect/fx-glow-3-v1/spriteFrame'],
    'fx-noise': PACKED_SPRITE_PATHS['visual/effect/fx-noise-v1/spriteFrame'],
    'fx-noise-poison': PACKED_SPRITE_PATHS['visual/effect/fx-noise-poison-v1/spriteFrame'],
    'fx-prop': PACKED_SPRITE_PATHS['visual/effect/fx-prop-v1/spriteFrame'],
    'fx-ring': PACKED_SPRITE_PATHS['visual/effect/fx-ring-v1/spriteFrame'],
    'fx-ripple': PACKED_SPRITE_PATHS['visual/effect/fx-ripple-v1/spriteFrame'],
    'fx-sequence-1': PACKED_SPRITE_PATHS['visual/effect/fx-sequence-1-v1/spriteFrame'],
    'fx-sequence-2': PACKED_SPRITE_PATHS['visual/effect/fx-sequence-2-v1/spriteFrame'],
    'fx-sequence-3': PACKED_SPRITE_PATHS['visual/effect/fx-sequence-3-v1/spriteFrame'],
    'fx-sequence-4': PACKED_SPRITE_PATHS['visual/effect/fx-sequence-4-v1/spriteFrame'],
    'fx-smoke': PACKED_SPRITE_PATHS['visual/effect/fx-smoke-v1/spriteFrame'],
    'fx-spark': PACKED_SPRITE_PATHS['visual/effect/fx-spark-v1/spriteFrame'],
    'fx-swirl': PACKED_SPRITE_PATHS['visual/effect/fx-swirl-v1/spriteFrame'],
    'fx-wind': PACKED_SPRITE_PATHS['visual/effect/fx-wind-v1/spriteFrame'],
    'grass-1': PACKED_SPRITE_PATHS['visual/backdrop/grass-1-v1/spriteFrame'],
    'grass-2': PACKED_SPRITE_PATHS['visual/backdrop/grass-2-v1/spriteFrame'],
    'grass-3': PACKED_SPRITE_PATHS['visual/backdrop/grass-3-v1/spriteFrame'],
    'grass-outline-1': PACKED_SPRITE_PATHS['visual/backdrop/grass-outline-1-v1/spriteFrame'],
    'grass-outline-2': PACKED_SPRITE_PATHS['visual/backdrop/grass-outline-2-v1/spriteFrame'],
    'ground': PACKED_SPRITE_PATHS['visual/backdrop/ground-v1/spriteFrame'],
    'hand': PACKED_SPRITE_PATHS['visual/ui/hand-v1/spriteFrame'],
    'hive-a': PACKED_SPRITE_PATHS['visual/game/hive-a-v1/spriteFrame'],
    'hive-b': PACKED_SPRITE_PATHS['visual/game/hive-b-v1/spriteFrame'],
    'hive-fan-1': PACKED_SPRITE_PATHS['visual/game/hive-fan-1-v1/spriteFrame'],
    'hive-fan-2': PACKED_SPRITE_PATHS['visual/game/hive-fan-2-v1/spriteFrame'],
    'ice-1': PACKED_SPRITE_PATHS['visual/game/ice-1-v1/spriteFrame'],
    'ice-2': PACKED_SPRITE_PATHS['visual/game/ice-2-v1/spriteFrame'],
    'ice-3': PACKED_SPRITE_PATHS['visual/game/ice-3-v1/spriteFrame'],
    'icon-pencil': PACKED_SPRITE_PATHS['visual/ui/icon-pencil-v1/spriteFrame'],
    'knife': PACKED_SPRITE_PATHS['visual/game/knife-v1/spriteFrame'],
    'move-arrow': PACKED_SPRITE_PATHS['visual/game/move-arrow-v1/spriteFrame'],
    'platform-cube': PACKED_SPRITE_PATHS['visual/backdrop/platform-cube-v1/spriteFrame'],
    'platform-round': PACKED_SPRITE_PATHS['visual/backdrop/platform-round-v1/spriteFrame'],
    'saw-gear': PACKED_SPRITE_PATHS['visual/game/saw-gear-v1/spriteFrame'],
    'saw-spin': PACKED_SPRITE_PATHS['visual/game/saw-spin-v1/spriteFrame'],
    'sky': 'visual/backdrop/sky/texture',
    'solid-red': PACKED_SPRITE_PATHS['visual/game/solid-red-v1/spriteFrame'],
    'spider-1': PACKED_SPRITE_PATHS['visual/game/spider-1-v1/spriteFrame'],
    'spider-2': PACKED_SPRITE_PATHS['visual/game/spider-2-v1/spriteFrame'],
    'spider-3': PACKED_SPRITE_PATHS['visual/game/spider-3-v1/spriteFrame'],
    'spider-4': PACKED_SPRITE_PATHS['visual/game/spider-4-v1/spriteFrame'],
    'spider-5': PACKED_SPRITE_PATHS['visual/game/spider-5-v1/spriteFrame'],
    'spider-6': PACKED_SPRITE_PATHS['visual/game/spider-6-v1/spriteFrame'],
    'spike': PACKED_SPRITE_PATHS['visual/game/spike-v1/spriteFrame'],
    'spiky-ball-1': PACKED_SPRITE_PATHS['visual/game/spiky-ball-1-v1/spriteFrame'],
    'spiky-ball-2': PACKED_SPRITE_PATHS['visual/game/spiky-ball-2-v1/spriteFrame'],
    'spiky-ball-3': PACKED_SPRITE_PATHS['visual/game/spiky-ball-3-v1/spriteFrame'],
    'star-off': PACKED_SPRITE_PATHS['visual/ui/star-off-v1/spriteFrame'],
    'star-on': PACKED_SPRITE_PATHS['visual/ui/star-on-v1/spriteFrame'],
    'stone': PACKED_SPRITE_PATHS['visual/game/stone-v1/spriteFrame'],
    'timer-fill': PACKED_SPRITE_PATHS['visual/ui/timer-fill-v1/spriteFrame'],
    'timer-track': PACKED_SPRITE_PATHS['visual/ui/timer-track-v1/spriteFrame'],
    'tree': PACKED_SPRITE_PATHS['visual/backdrop/tree-v1/spriteFrame'],
    'water': PACKED_SPRITE_PATHS['visual/backdrop/water-v1/spriteFrame'],
}) as Readonly<Record<string, string>>;

/** 帧所在的资源目录；运行时按目录整体加载，避开图集分页带来的页名变化。 */
export const CYBLOCKBEES_SPRITE_DIRECTORIES = Object.freeze([
    'visual/game',
    'visual/backdrop',
    'visual/ui',
    'visual/effect',
] as const);

/** 统一生成器产出的全部合图页，包含自动分页。 */
export const CYBLOCKBEES_ATLASES = Object.freeze(Array.from(new Set(
    Object.keys(PACKED_SPRITE_PATHS).map(key => PACKED_SPRITE_PATHS[key])
        .map(path => path.slice(0, path.lastIndexOf('/'))),
)).sort());

import type { Component, Scene } from 'cc';
import type { GameManifest } from './GameManifest';
import type { MiniGame } from './MiniGame';

const MINI_GAME_METHODS: readonly (keyof MiniGame)[] = [
    'initialize',
    'begin',
    'pause',
    'resume',
    'restart',
    'dispose',
];

export type GameLoaderErrorCode =
    | 'entry-not-found'
    | 'entry-ambiguous'
    | 'entry-protocol-invalid';

export class GameLoaderError extends Error {
    constructor(
        readonly code: GameLoaderErrorCode,
        readonly gameId: string,
        readonly entryComponent: string,
        message: string,
        readonly missingMethods: readonly (keyof MiniGame)[] = [],
    ) {
        super(message);
        this.name = 'GameLoaderError';
    }
}

function findMissingMethods(component: Component): readonly (keyof MiniGame)[] {
    const candidate = component as unknown as Record<string, unknown>;
    return Object.freeze(MINI_GAME_METHODS.filter(
        (method) => typeof candidate[method] !== 'function',
    ));
}

/** 只负责在已加载场景中定位并校验 MiniGame 入口组件。 */
export class GameLoader {
    locateEntry(
        scene: Scene,
        manifest: Pick<GameManifest, 'id' | 'entryComponent'>,
    ): MiniGame {
        const components = scene.getComponentsInChildren(
            manifest.entryComponent,
        );

        if (components.length === 0) {
            throw new GameLoaderError(
                'entry-not-found',
                manifest.id,
                manifest.entryComponent,
                `Game "${manifest.id}" entry component `
                + `"${manifest.entryComponent}" was not found in the loaded scene.`,
            );
        }

        if (components.length > 1) {
            throw new GameLoaderError(
                'entry-ambiguous',
                manifest.id,
                manifest.entryComponent,
                `Game "${manifest.id}" has ${components.length} `
                + `"${manifest.entryComponent}" entry components; expected exactly one.`,
            );
        }

        const entry = components[0]!;
        const missingMethods = findMissingMethods(entry);

        if (missingMethods.length > 0) {
            throw new GameLoaderError(
                'entry-protocol-invalid',
                manifest.id,
                manifest.entryComponent,
                `Game "${manifest.id}" entry component `
                + `"${manifest.entryComponent}" does not implement MiniGame: `
                + `missing ${missingMethods.join(', ')}.`,
                missingMethods,
            );
        }

        return entry as unknown as MiniGame;
    }
}

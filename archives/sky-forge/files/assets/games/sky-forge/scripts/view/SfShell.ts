import type { Node } from 'cc';
import type { SfProgress } from '../core/SfProgress';
import type { Tweens, UiContext } from './SfUi';

/** 菜单界面依赖的宿主能力（由 SkyForgeGame 实现）。 */
export interface SfShell {
    readonly ui: UiContext;
    readonly progress: SfProgress;
    readonly tweens: Tweens;
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly gameRoot: Node;
    openHangar(): void;
    openMap(chapter?: number): void;
    startLevel(levelId: string): void;
    exitToLobby(): void;
    save(): void;
    sfx(key: string, volume?: number): void;
    toast(message: string): void;
    startEndless(): void;
}

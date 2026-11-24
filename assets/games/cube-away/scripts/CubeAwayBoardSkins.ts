const SKINS = ['coast', 'meadow', 'snow', 'windmill', 'maple'] as const;
export type BoardSkinId = typeof SKINS[number];
export interface BoardSkin { readonly level: number; readonly id: BoardSkinId; }

export function readBoardSkinId(id: unknown): BoardSkinId | undefined {
    return id === 'cake' ? 'windmill' : SKINS.find(skin => skin === id);
}

export function chooseBoardSkin(level: number, previous?: BoardSkin): BoardSkin {
    if (previous?.level === level) return previous;
    const available = SKINS.filter(id => id !== previous?.id);
    return { level, id: available[Math.floor(Math.random() * available.length)] };
}

export function boardSkinDirectory(id: BoardSkinId): string {
    return `visual/board-skins/${id}`;
}

import { Bubble, BubbleColor, BubbleShooterModel, MAX_AIM_ANGLE } from './BubbleShooterModel';

/** Only telegraph normal bubbles that one of the two displayed balls can actually clear. */
export function counterableFrostBubbles(board: BubbleShooterModel, colors: readonly BubbleColor[]): Bubble[] {
    const cells = new Map(board.bubbles.map(b => [`${b.row}:${b.col}`, b]));
    const reachable = new Set<string>(), checked = new Set<string>();
    for (let angle = -MAX_AIM_ANGLE; angle <= MAX_AIM_ANGLE; angle += 2.5) {
        if (angle < -MAX_AIM_ANGLE + .75 || angle > MAX_AIM_ANGLE - .75) continue;
        const radians = angle * Math.PI / 180;
        const shot = board.trace({ x: Math.sin(radians), y: Math.cos(radians) });
        if (!shot) continue;
        // Keep a visible aiming margin; a single tangent ray cannot be the only counter.
        const hasMargin = [-.75, .75].every(offset => {
            const a = (angle + offset) * Math.PI / 180, edge = board.trace({ x: Math.sin(a), y: Math.cos(a) });
            return edge?.cell.row === shot.cell.row && edge.cell.col === shot.cell.col;
        });
        if (!hasMargin) continue;
        for (const color of Array.from(new Set(colors))) {
            const shotKey = `${shot.cell.row}:${shot.cell.col}:${color}`;
            if (checked.has(shotKey)) continue;
            checked.add(shotKey);
            const group = new Set<string>(), queue = board.neighbors(shot.cell);
            for (let i = 0; i < queue.length; i++) {
                const cell = queue[i]!, key = `${cell.row}:${cell.col}`, bubble = cells.get(key);
                if (!bubble || group.has(key) || bubble.frosted || bubble.indestructible || bubble.color !== color) continue;
                group.add(key); queue.push(...board.neighbors(cell));
            }
            if (group.size >= 2) group.forEach(key => reachable.add(key));
        }
    }
    return Array.from(cells.values()).filter(b => reachable.has(`${b.row}:${b.col}`))
        .sort((a, b) => a.row - b.row || a.col - b.col);
}

/** 将还原目录的关卡编译成独立资源包数据；以后更新源关卡时复用，原始 Unity 场景不进入 assets。 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'tmp/rotate-rings');
const core = require(path.join(source, 'src/core'));
const dataRoot = path.join(root, 'local/rotate-rings-build-source/configs');
const round = value => typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value;
function meta(file, importer, version, userData = {}) {
    if (fs.existsSync(file + '.meta')) return;
    fs.writeFileSync(file + '.meta', JSON.stringify({ ver: version, importer, imported: true,
        uuid: crypto.randomUUID(), files: importer === 'json' ? ['.json'] : [], subMetas: {}, userData }, null, 2) + '\n');
}
function localTransform(raw, go, ancestor, point = { x: 0, y: 0 }) {
    const byTransform = new Map(raw.gameObjectList.map(g => [String(g.transformPathId), g]));
    let x = point.x, y = point.y, angle = 0, scaleX = 1, scaleY = 1, current = go;
    while (current && current !== ancestor) {
        const a = 2 * Math.atan2(current.rotation?.z || 0, current.rotation?.w ?? 1);
        const sx = current.scale?.x ?? 1, sy = current.scale?.y ?? 1;
        const px = x * sx, py = y * sy;
        x = (current.position?.x || 0) + px * Math.cos(a) - py * Math.sin(a);
        y = (current.position?.y || 0) + px * Math.sin(a) + py * Math.cos(a);
        angle += a * 180 / Math.PI;
        scaleX *= sx; scaleY *= sy;
        current = byTransform.get(String(current.parent));
    }
    return { x, y, angle, scaleX, scaleY };
}
function bombs(raw, level) {
    const transforms = new Map(raw.gameObjectList.map(go => [String(go.transformPathId), go]));
    const result = [];
    for (const go of raw.gameObjectList) {
        const component = go.components.find(c => c.script?.class === 'BombRelative');
        if (!component) continue;
        // 引用是 JSON 数值而 pathId 是字符串，统一以读取器的数值表示匹配同一对象内的组件。
        const collider = go.components.find(c => Number(c.pathId) === Number(component.fields.activeCollider?.m_PathID));
        if (collider?.type !== 'CircleCollider2D' || !(collider.fields.m_Radius > 0)) throw Error(`Invalid bomb collider ${raw.level}/${go.path}`);
        let ancestor = transforms.get(String(go.parent)), ringId, pullId;
        while (ancestor && ancestor.name !== 'Board') {
            const id = ancestor.components.find(c => c.fields?.partData)?.fields.partData['<PhysicPartId>k__BackingField'];
            if (level.rings.some(r => r.id === id)) { ringId = id; break; }
            if (level.pullObjects.some(p => p.id === id)) { pullId = id; break; }
            ancestor = transforms.get(String(ancestor.parent));
        }
        if (!ancestor) throw Error(`Missing bomb parent ${raw.level}/${go.path}`);
        const center = localTransform(raw, go, ancestor, collider.fields.m_Offset || { x: 0, y: 0 });
        const image = localTransform(raw, go, ancestor);
        result.push({ ringId, pullId, x: center.x, y: center.y,
            radius: collider.fields.m_Radius * Math.max(Math.abs(center.scaleX), Math.abs(center.scaleY)),
            visual: { x: image.x, y: image.y, angle: image.angle } });
    }
    // 已发布的 v1 存档用数组索引记录圆环炸弹；保留旧顺序，新类型追加，避免改变旧索引含义。
    return result.filter(b => b.ringId).concat(result.filter(b => !b.ringId));
}
function polygons(raw, go, descendants = true) {
    const result = [];
    if (!go) return result;
    for (const child of raw.gameObjectList) {
        if (child !== go && (!descendants || !child.path.startsWith(go.path + '/'))) continue;
        for (const c of child.components || []) {
            if (c.fields?.m_IsTrigger || c.fields?.m_Enabled === 0) continue;
            const f = c.fields || {}, offset = f.m_Offset || { x: 0, y: 0 };
            let paths;
            if (c.type === 'PolygonCollider2D') paths = f.m_Points?.m_Paths;
            if (c.type === 'BoxCollider2D') paths = [[
                { x: -f.m_Size.x / 2, y: -f.m_Size.y / 2 }, { x: f.m_Size.x / 2, y: -f.m_Size.y / 2 },
                { x: f.m_Size.x / 2, y: f.m_Size.y / 2 }, { x: -f.m_Size.x / 2, y: f.m_Size.y / 2 },
            ]];
            for (const pts of paths || []) result.push(pts.map(p => {
                const t = localTransform(raw, child, go, { x: p.x + offset.x, y: p.y + offset.y });
                return { x: t.x, y: t.y };
            }));
        }
    }
    return result;
}
function compile(file) {
    const level = core.level.loadLevelFile(file), raw = level.raw;
    const find = id => raw.gameObjectList.find(go => (go.components || []).some(c =>
        c.fields?.partData?.['<PhysicPartId>k__BackingField'] === id));
    const partData = id => find(id)?.components.find(c => c.fields?.partData)?.fields.partData || {};
    const releaseScore = (part, base = 100) => base * (1 + (part['<LockedBy>k__BackingField']?.length || 0)
        + (part['<Locks>k__BackingField']?.length || 0) + (part['<Id>k__BackingField'] >= 1 ? 1 : 0));
    return {
        id: level.id,
        // 原世界边界存储在设计坐标，Y 朝下；与网格统一转换成环局部单位。
        referenceBounds: raw.bounds ? { minX: raw.bounds.minX * core.DESIGN_TO_LOCAL,
            maxX: raw.bounds.maxX * core.DESIGN_TO_LOCAL, minY: -raw.bounds.maxY * core.DESIGN_TO_LOCAL,
            maxY: -raw.bounds.minY * core.DESIGN_TO_LOCAL } : undefined,
        rings: level.rings.map(r => {
            const go = find(r.id), hardBlocks = [];
            const part = partData(r.id);
            for (const child of raw.gameObjectList) {
                if (!go || !child.path.startsWith(go.path + '/') || !child.name.startsWith('HardBlock_')) continue;
                for (const poly of polygons(raw, child)) hardBlocks.push(poly.map(p => {
                    const t = localTransform(raw, child, go, p); return { x: t.x, y: t.y };
                }));
            }
            return { id: r.id, index: r.index, x: r.x, y: r.y, angle: r.angle, inner: r.inner, outer: r.outer,
                gapWidth: r.gapWidth, gapDir: r.gapDir, renderGap: r.renderGap ?? r.gapWidth,
                // 只取本体轮廓，不能将扩大点击区 DragArea 或子物体触发口当成实体。
                bodyLocal: polygons(raw, go, false),
                releaseScore: releaseScore(part),
                pins: r.pins.map(p => ({ featureId: p.featureId, angleDeg: p.angleDeg, rotDeg: p.rotDeg,
                    radius: p.radius, mouthSize: p.mouthSize, prongs: p.prongs })), hardBlocks };
        }),
        pullObjects: level.pullObjects.map(p => ({ id: p.id, x: p.x, y: p.y, angle: p.angle,
            polyLocal: p.polyLocal || [],
            // 原 ResolveLockedDragDirection：lockDirectionType=0 沿 transform.up（局部 Y），否则沿 transform.right（局部 X）。
            dragAxis: p.lockDirectionType === 0 ? 90 : 0, moveThreshold: p.moveThreshold, negative: !p.locks.left, positive: !p.locks.right,
            releaseScore: releaseScore(partData(p.id), 50) })),
        fixedObjects: level.fixedObjects.map(p => ({ id: p.id, x: p.x, y: p.y, angle: p.angle,
            polygons: polygons(raw, find(p.id) || raw.gameObjectList.find(g => g.path === raw.fixedObjects.find(f => f.id === p.id)?.path)) })),
        links: level.links.map(l => ({ sourceRingId: l.sourceRingId, pinFeatureId: l.pinFeatureId, targetPartId: l.targetPartId })),
        guides: raw.guides,
        bombs: bombs(raw, level),
    };
}
fs.mkdirSync(dataRoot, { recursive: true });
const modes = { normal: [], hard: [] };
for (const file of fs.readdirSync(path.join(source, 'extract/levels')).filter(f => /^level\d+\.json$/.test(f)).sort()) {
    const level = compile(path.join(source, 'extract/levels', file));
    modes[Math.floor(level.id / 1000) === 20 ? 'hard' : 'normal'].push(level);
}
const dest = path.join(dataRoot, 'index.json');
let bytes = 0;
for (const mode of Object.keys(modes)) for (const level of modes[mode]) {
    const destLevel = path.join(dataRoot, `level${level.id}.json`);
    const text = JSON.stringify(level, (_, value) => round(value)) + '\n';
    fs.writeFileSync(destLevel, text); meta(destLevel, 'json', '2.0.0'); bytes += Buffer.byteLength(text);
}
const catalog = Object.fromEntries(Object.entries(modes).map(([mode, levels]) => [mode, levels.map(l => ({
    id: l.id, rings: l.rings.length, links: l.links.length, pulls: l.pullObjects.length, bombs: l.bombs.length,
}))]));
fs.writeFileSync(dest, JSON.stringify({ version: 1, modes: catalog }) + '\n');
meta(dest, 'json', '2.0.0');
console.log(`Imported ${modes.normal.length} normal + ${modes.hard.length} hard levels (${bytes} bytes; index ${fs.statSync(dest).size} bytes)`);

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
    'games',
    'doodle-jump',
    'visual',
);

async function collect(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return collect(absolute);
        return entry.name.endsWith('.png.meta') ? [absolute] : [];
    }));
    return nested.flat();
}

const files = await collect(root);
for (const file of files) {
    const meta = JSON.parse(await readFile(file, 'utf8'));
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const repeatingBackground = relative.startsWith('backgrounds/parallax-v2/');
    const textureMeta = Object.values(meta.subMetas ?? {}).find((candidate) => (
        candidate?.name === 'texture'
    ));
    if (textureMeta?.userData) {
        textureMeta.userData.wrapModeS = repeatingBackground ? 'repeat' : 'clamp-to-edge';
        textureMeta.userData.wrapModeT = repeatingBackground ? 'repeat' : 'clamp-to-edge';
        textureMeta.userData.minfilter = 'linear';
        textureMeta.userData.magfilter = 'linear';
        textureMeta.userData.mipfilter = 'none';
    }
    if (meta.userData) {
        meta.userData.fixAlphaTransparencyArtifacts = !repeatingBackground;
    }
    await writeFile(file, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

console.log(`doodle_jump_textures_configured=${files.length}`);

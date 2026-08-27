/* eslint-disable no-console */
/**
 * Deterministic production-asset checks for Desktop Cleanup's 3D catalog.
 *
 * This intentionally uses only Node's standard library so it can run in CI,
 * before Cocos refreshes the asset database, and on a clean checkout.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GLB_PATH = path.join(ROOT, 'assets/games/catch-3d/models/desktop-cleanup-items-v1.glb');
const COLLIDER_PATH = path.join(ROOT, 'assets/games/catch-3d/models/desktop-cleanup-item-colliders-v1.json');
const PROVENANCE_PATH = path.join(ROOT, 'art_sources/桌面大清理/3d/desktop-cleanup-items-v1.provenance.json');
const SOURCE_BLEND_PATH = path.join(ROOT, 'art_sources/桌面大清理/3d/desktop-cleanup-items-v1.blend');
const CONTACT_SHEET_PATH = path.join(ROOT, 'art_sources/桌面大清理/3d/desktop-cleanup-items-contact-sheet-v1.png');
const RUNTIME_ITEMS_DIR = path.join(ROOT, 'assets/games/catch-3d/visual/items');

const EXPECTED_TYPES = Object.freeze([
  'blue-pen',
  'red-pencil',
  'yellow-eraser',
  'mint-notes',
  'binder-clip',
  'orange-tape',
  'teal-usb',
  'cream-earbuds',
  'coral-keycap',
  'purple-stress-ball',
  'round-coaster',
  'spiral-notebook',
  'clear-ruler',
  'lucky-badge',
  'teal-wireless-mouse',
  'cream-alarm-clock',
  'coral-candle-jar',
  'mustard-glasses-case',
  'mint-compact-mirror',
  'purple-mini-speaker',
]);

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function finiteArray(value, length) {
  return Array.isArray(value)
    && value.length === length
    && value.every((entry) => Number.isFinite(entry));
}

function identityTransform(node) {
  const translation = node.translation || [0, 0, 0];
  const rotation = node.rotation || [0, 0, 0, 1];
  const scale = node.scale || [1, 1, 1];
  return finiteArray(translation, 3)
    && finiteArray(rotation, 4)
    && finiteArray(scale, 3)
    && translation.every((entry) => Math.abs(entry) < 1e-5)
    && rotation.every((entry, index) => Math.abs(entry - (index === 3 ? 1 : 0)) < 1e-5)
    && scale.every((entry) => Math.abs(entry - 1) < 1e-5);
}

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  check(buffer.length >= 20, `GLB is too small: ${filePath}`);
  check(buffer.toString('ascii', 0, 4) === 'glTF', 'GLB header magic must be glTF.');
  check(buffer.readUInt32LE(4) === 2, 'GLB version must be 2.');
  check(buffer.readUInt32LE(8) === buffer.length, 'GLB declared length must match file length.');
  let offset = 12;
  let json = null;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    check(dataEnd <= buffer.length, 'GLB chunk extends beyond file length.');
    chunks.push({ type, length });
    if (type === 0x4e4f534a) {
      json = JSON.parse(buffer.subarray(dataStart, dataEnd).toString('utf8').replace(/[\u0000\u0020]+$/g, ''));
    }
    offset = dataEnd;
  }
  check(offset === buffer.length, 'GLB chunks must consume the complete file.');
  check(json !== null, 'GLB must contain a JSON chunk.');
  return { buffer, json, chunks };
}

function descendants(nodes, index, output = [], seen = new Set()) {
  if (seen.has(index)) return output;
  seen.add(index);
  const node = nodes[index];
  if (!node) return output;
  (node.children || []).forEach((child) => {
    output.push(child);
    descendants(nodes, child, output, seen);
  });
  return output;
}

function verifyGlb() {
  const { buffer, json, chunks } = readGlb(GLB_PATH);
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const scene = json.scenes && json.scenes[json.scene || 0];
  const roots = scene && Array.isArray(scene.nodes) ? scene.nodes : [];
  const rootItems = roots
    .map((index) => nodes[index])
    .filter((node) => node && /^ITEM_/.test(node.name || ''));
  const types = rootItems.map((node) => node.name.slice('ITEM_'.length));
  check(rootItems.length === EXPECTED_TYPES.length, `Expected ${EXPECTED_TYPES.length} ITEM roots, got ${rootItems.length}.`);
  check(new Set(types).size === types.length, 'ITEM root names must be unique.');
  check(JSON.stringify([...types].sort()) === JSON.stringify([...EXPECTED_TYPES].sort()), 'GLB ITEM types do not match the DesktopCleanup catalog.');
  rootItems.forEach((root) => check(identityTransform(root), `${root.name} root transform is not applied/identity.`));

  const allMeshNodeIndexes = [];
  const allColliderNodeIndexes = [];
  rootItems.forEach((root) => {
    const rootIndex = nodes.indexOf(root);
    const childIndexes = descendants(nodes, rootIndex);
    const meshChildren = childIndexes.filter((index) => Number.isInteger(nodes[index]?.mesh));
    const type = root.name.slice('ITEM_'.length);
    const namedMesh = meshChildren.filter((index) => nodes[index].name === `MESH_${type}`);
    check(meshChildren.length === 1 && namedMesh.length === 1, `${root.name} must contain exactly one named render Mesh node.`);
    meshChildren.forEach((index) => allMeshNodeIndexes.push(index));
    childIndexes
      .filter((index) => /^COLLIDER_/.test(nodes[index]?.name || ''))
      .forEach((index) => allColliderNodeIndexes.push(index));
  });
  check(allMeshNodeIndexes.length === EXPECTED_TYPES.length, `Expected ${EXPECTED_TYPES.length} render mesh nodes, got ${allMeshNodeIndexes.length}.`);
  check(allColliderNodeIndexes.length === 31, `Expected 31 exported collider proxy nodes, got ${allColliderNodeIndexes.length}.`);
  check((json.meshes || []).length === EXPECTED_TYPES.length, `Expected ${EXPECTED_TYPES.length} meshes, got ${(json.meshes || []).length}.`);
  check(!json.cameras || json.cameras.length === 0, 'Runtime GLB must not contain cameras.');
  check(!json.animations || json.animations.length === 0, 'Runtime GLB must not contain animations.');
  check(!json.lights || json.lights.length === 0, 'Runtime GLB must not contain lights.');

  const materials = Array.isArray(json.materials) ? json.materials : [];
  check(materials.length === 1, `Expected one shared material, got ${materials.length}.`);
  check(materials[0]?.name === 'MAT_desktop_cleanup_soft_clay', 'Shared material name is invalid.');
  const pbr = materials[0]?.pbrMetallicRoughness || {};
  check(Number.isInteger(pbr.baseColorTexture?.index), 'Shared material must reference a base-color texture.');
  check(Number.isInteger(pbr.metallicRoughnessTexture?.index), 'Shared material must reference a roughness texture.');
  check((json.textures || []).length === 2, `Expected two shared textures, got ${(json.textures || []).length}.`);
  check((json.images || []).length === 2, `Expected two embedded PNG images, got ${(json.images || []).length}.`);
  (json.images || []).forEach((image) => {
    check(!image.uri && Number.isInteger(image.bufferView), `Image ${image.name || '<unnamed>'} must be embedded in the GLB.`);
    check(image.mimeType === 'image/png', `Image ${image.name || '<unnamed>'} must be PNG.`);
  });

  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const referencedMeshIndexes = new Set();
  allMeshNodeIndexes.forEach((nodeIndex) => {
    const meshIndex = nodes[nodeIndex].mesh;
    referencedMeshIndexes.add(meshIndex);
    const mesh = meshes[meshIndex];
    check(mesh && Array.isArray(mesh.primitives) && mesh.primitives.length === 1, `Mesh ${meshIndex} must contain one primitive.`);
    const primitive = mesh?.primitives?.[0];
    check(primitive?.material === 0, `Mesh ${meshIndex} must use the shared material.`);
    check(Number.isInteger(primitive?.attributes?.POSITION), `Mesh ${meshIndex} is missing POSITION.`);
    check(Number.isInteger(primitive?.attributes?.NORMAL), `Mesh ${meshIndex} is missing NORMAL.`);
    check(Number.isInteger(primitive?.attributes?.TEXCOORD_0), `Mesh ${meshIndex} is missing TEXCOORD_0.`);
    const position = accessors[primitive?.attributes?.POSITION];
    check(position?.type === 'VEC3' && position?.componentType === 5126, `Mesh ${meshIndex} POSITION accessor must be float VEC3.`);
    if (position?.min && position?.max) {
      check(finiteArray(position.min, 3) && finiteArray(position.max, 3), `Mesh ${meshIndex} position bounds must be finite.`);
      const extents = position.max.map((value, index) => value - position.min[index]);
      check(extents.every((value) => value > 0 && value < 4.5), `Mesh ${meshIndex} has unreasonable dimensions.`);
      const center = position.max.map((value, index) => (value + position.min[index]) * 0.5);
      check(center.every((value) => Math.abs(value) < 0.03), `Mesh ${meshIndex} pivot is not centered.`);
    }
  });
  check(referencedMeshIndexes.size === EXPECTED_TYPES.length, 'Every catalog type must reference a distinct render mesh.');

  const chunkTypes = new Set(chunks.map((chunk) => chunk.type));
  check(chunkTypes.has(0x4e4f534a), 'GLB JSON chunk is missing.');
  check(chunkTypes.has(0x004e4942), 'GLB BIN chunk is missing.');
  return { bytes: buffer.length, itemTypes: types, meshes: meshes.length, images: (json.images || []).length };
}

function verifyColliders() {
  const config = readJson(COLLIDER_PATH);
  check(config.schemaVersion === 1, 'Collider config schemaVersion must be 1.');
  check(config.unit === 'meter', 'Collider config unit must be meter.');
  check(config.coordinateSystem === 'cocos-y-up', 'Collider config coordinate system must be cocos-y-up.');
  const items = config.items && typeof config.items === 'object' ? config.items : {};
  const types = Object.keys(items);
  check(JSON.stringify([...types].sort()) === JSON.stringify([...EXPECTED_TYPES].sort()), 'Collider types do not match the DesktopCleanup catalog.');
  let count = 0;
  types.forEach((type) => {
    const specs = items[type];
    check(Array.isArray(specs) && specs.length >= 1 && specs.length <= 3, `${type} must have 1–3 collider primitives.`);
    (specs || []).forEach((spec, index) => {
      count += 1;
      check(['box', 'sphere', 'capsule'].includes(spec.shape), `${type}[${index}] uses an unsupported collider shape.`);
      check(finiteArray(spec.center, 3), `${type}[${index}] center must be finite.`);
      if (spec.shape === 'box') {
        check(finiteArray(spec.size, 3) && spec.size.every((value) => value > 0 && value < 5), `${type}[${index}] box size is invalid.`);
      } else {
        check(Number.isFinite(spec.radius) && spec.radius > 0 && spec.radius < 3, `${type}[${index}] radius is invalid.`);
      }
      if (spec.shape === 'capsule') {
        check(Number.isFinite(spec.height) && spec.height > 0 && ['x', 'y', 'z'].includes(spec.direction), `${type}[${index}] capsule dimensions are invalid.`);
      }
      if (spec.rotation) check(finiteArray(spec.rotation, 3), `${type}[${index}] rotation must be finite.`);
    });
  });
  check(count === 31, `Expected 31 collider primitives, got ${count}.`);
  return { types: types.length, primitives: count };
}

function verifyProvenance() {
  const provenance = readJson(PROVENANCE_PATH);
  check(provenance.assetId === 'desktop-cleanup-items-v1', 'Provenance assetId is invalid.');
  check(provenance.authorship === 'original-procedural-low-poly-models', 'Provenance authorship is missing or invalid.');
  check(provenance.licenseScope === 'project-owned-original-assets', 'Provenance license scope is missing or invalid.');
  check(provenance.itemCount === EXPECTED_TYPES.length, 'Provenance itemCount is invalid.');
  check(JSON.stringify([...provenance.itemTypes].sort()) === JSON.stringify([...EXPECTED_TYPES].sort()), 'Provenance itemTypes do not match the catalog.');
  [SOURCE_BLEND_PATH, CONTACT_SHEET_PATH, GLB_PATH, COLLIDER_PATH].forEach((filePath) => check(fs.existsSync(filePath), `Missing 3D asset source: ${path.relative(ROOT, filePath)}`));
  return { itemCount: provenance.itemCount, blenderVersion: provenance.blenderVersion };
}

function verifyNoRuntime2dAtlas() {
  if (!fs.existsSync(RUNTIME_ITEMS_DIR)) return;
  const leftovers = fs.readdirSync(RUNTIME_ITEMS_DIR).filter((name) => (
    /desktop-cleanup-items-atlas|desktop-cleanup-items-hitmask|desktop-cleanup-items.*\.json/i.test(name)
  ));
  check(leftovers.length === 0, `Legacy 2D item runtime files remain: ${leftovers.join(', ')}`);
  return { leftovers };
}

let summary;
try {
  const glb = verifyGlb();
  const colliders = verifyColliders();
  const provenance = verifyProvenance();
  const runtime = verifyNoRuntime2dAtlas();
  summary = { glb, colliders, provenance, runtime };
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures, summary }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

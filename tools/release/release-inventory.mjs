// Explicit release sets protect historical receipts and make additions reviewable.
// A source candidate at an already-published version may select the native
// inventory explicitly; it does not imply that version was published with it.
const BASE = [
  '@aura3d/animation', '@aura3d/apps', '@aura3d/asset-index', '@aura3d/assets',
  '@aura3d/audio', '@aura3d/cli', '@aura3d/controls', '@aura3d/core',
  '@aura3d/debug', '@aura3d/ecs', '@aura3d/editor-runtime', '@aura3d/engine',
  '@aura3d/input', '@aura3d/math', '@aura3d/navigation-recast', '@aura3d/physics',
  '@aura3d/physics-rapier', '@aura3d/product-studio', '@aura3d/react',
  '@aura3d/rendering', '@aura3d/scene', '@aura3d/scripting', '@aura3d/workflows',
  'create-aura3d'
];
const HISTORICAL_3 = [...BASE, '@aura3d/editor', '@aura3d/environments', '@aura3d/lean', '@aura3d/materials', '@aura3d/three-compat'].sort();
const HISTORICAL_4 = [...BASE].sort();
const NATIVE = [...BASE, '@aura3d/addons'].sort();
export const RELEASE_INVENTORIES = Object.freeze({
  'historical-3': Object.freeze(HISTORICAL_3),
  'historical-4': Object.freeze(HISTORICAL_4),
  'native-1': Object.freeze(NATIVE)
});
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version ?? '');
  if (!match) throw new Error(`Invalid release version: ${version}`);
  return match.slice(1).map(Number);
}
export function releaseInventoryId(version, requested) {
  const [major, minor, patch] = parseVersion(version);
  const historical4Version = major === 4 && (minor < 7 || (minor === 7 && patch <= 1));
  if (requested !== undefined) {
    if (!Object.hasOwn(RELEASE_INVENTORIES, requested)) throw new Error(`Unknown release inventory: ${requested}`);
    if ((major < 4 && requested !== 'historical-3') || (major >= 4 && requested === 'historical-3') || (requested === 'historical-4' && !historical4Version)) throw new Error(`Inventory ${requested} is invalid for ${version}`);
    return requested;
  }
  if (major < 4) return 'historical-3';
  // Releases through the currently published 4.7.1 retain their old set.
  return historical4Version ? 'historical-4' : 'native-1';
}
export function publicPackageNames(version, inventoryId) {
  return RELEASE_INVENTORIES[releaseInventoryId(version, inventoryId)];
}
export function expectedPublicPackageCount(version, inventoryId) {
  return publicPackageNames(version, inventoryId).length;
}
export function assertReleaseInventory(version, names, inventoryId) {
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) throw new Error('Release package names must be unique strings');
  const expected = publicPackageNames(version, inventoryId);
  const actual = [...names].sort();
  const missing = expected.filter(name => !actual.includes(name));
  const unexpected = actual.filter(name => !expected.includes(name));
  if (missing.length || unexpected.length) throw new Error(`Release package inventory mismatch: missing [${missing.join(', ')}]; unexpected [${unexpected.join(', ')}]`);
  return expected;
}

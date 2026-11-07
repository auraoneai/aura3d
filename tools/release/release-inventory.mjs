// One versioned package inventory. Explicit release sets protect historical
// receipts and make additions reviewable. Every entry also records its
// workspace directory (null when it no longer exists in this tree) and its
// dependency tier, so release planning, tarball target discovery and the
// package-tier gates (tools/package-tiers.ts, the ESLint boundary rule) all
// derive from this record. A source candidate at an already-published
// version may select the native inventory explicitly; it does not imply that
// version was published with it.
//
// Tiers: dependencies point DOWN only (an edge from tier N to tier M > N is a
// layer violation); nothing may depend on tier 5 or 6 except tier 6.
const H3 = 'historical-3', H4 = 'historical-4', N1 = 'native-1';
const ALL = Object.freeze([H3, H4, N1]);
const entry = (name, directory, tier, inventories) => Object.freeze({ name, directory, tier, inventories: Object.freeze([...inventories]) });
export const PACKAGE_INVENTORY = Object.freeze([
  // 0 - foundation: no Aura3D dependencies at all.
  entry('@aura3d/math', 'packages/math', 0, ALL),
  entry('@aura3d/physics', 'packages/physics', 0, ALL),
  entry('@aura3d/physics-rapier', 'packages/physics-rapier', 0, ALL),
  entry('@aura3d/navigation-recast', 'packages/navigation-recast', 0, ALL),
  entry('@aura3d/scripting', 'packages/scripting', 0, ALL),
  entry('@aura3d/asset-index', 'packages/asset-index', 0, ALL),
  // 1 - core data model.
  entry('@aura3d/core', 'packages/core', 1, ALL),
  entry('@aura3d/scene', 'packages/scene', 1, ALL),
  // 2 - subsystems over the data model.
  entry('@aura3d/animation', 'packages/animation', 2, ALL),
  entry('@aura3d/rendering', 'packages/rendering', 2, ALL),
  entry('@aura3d/input', 'packages/input', 2, ALL),
  entry('@aura3d/audio', 'packages/audio', 2, ALL),
  entry('@aura3d/ecs', 'packages/ecs', 2, ALL),
  // 3 - subsystems that compose other subsystems.
  entry('@aura3d/assets', 'packages/assets', 3, ALL),
  entry('@aura3d/controls', 'packages/controls', 3, ALL),
  entry('@aura3d/materials', 'packages/materials', 3, [H3]),
  entry('@aura3d/environments', 'packages/environments', 3, [H3]),
  entry('@aura3d/debug', 'packages/debug', 3, ALL),
  entry('@aura3d/editor-runtime', 'packages/editor-runtime', 3, ALL),
  // 4 - product surfaces.
  entry('@aura3d/product-studio', 'packages/product-studio', 4, ALL),
  entry('@aura3d/apps', 'packages/apps', 4, ALL),
  entry('@aura3d/workflows', 'packages/workflows', 4, ALL),
  entry('@aura3d/editor', 'packages/editor', 4, [H3]),
  // 5 - aggregates. Nothing may depend on these except other aggregates.
  entry('@aura3d/engine-runtime', 'packages/engine', 5, []),
  entry('@aura3d/game', 'packages/game', 5, []),
  // Optional outputs compose rendering and other lower-level packages.
  entry('@aura3d/addons', 'packages/addons', 5, [N1]),
  entry('@aura3d/react', 'packages/react', 6, ALL),
  entry('@aura3d/three-compat', 'packages/three-compat', 6, [H3]),
  entry('@aura3d/cli', 'packages/aura3d-cli', 6, ALL),
  entry('create-aura3d', 'packages/create-aura3d', 6, ALL),
  // Agent MCP server (E3-03 phase 1): private workspace package, in no release inventory until the owner decides.
  entry('@aura3d/mcp', 'packages/aura3d-mcp', 6, []),
  // The published root aggregate is the repository manifest itself; it has no
  // packages/ directory and therefore no workspace tier.
  entry('@aura3d/engine', '.', null, ALL),
  entry('@aura3d/lean', null, null, [H3])
]);
const inventorySet = id => PACKAGE_INVENTORY.filter(item => item.inventories.includes(id)).map(item => item.name).sort();
export const RELEASE_INVENTORIES = Object.freeze({
  'historical-3': Object.freeze(inventorySet(H3)),
  'historical-4': Object.freeze(inventorySet(H4)),
  'native-1': Object.freeze(inventorySet(N1))
});
/** Tier per workspace directory basename (packages/<dir>), derived from the inventory. */
export function packageTiers() {
  return Object.fromEntries(PACKAGE_INVENTORY.filter(item => item.tier !== null && item.directory?.startsWith('packages/'))
    .map(item => [item.directory.slice('packages/'.length), item.tier]));
}
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version ?? '');
  if (!match) throw new Error(`Invalid release version: ${version}`);
  return match.slice(1).map(Number);
}
export function releaseInventoryId(version, requested) {
  const [major, minor, patch] = parseVersion(version);
  // Every 4.x release (through 4.7.16) shipped the historical package set; 5.0.0 is the first release of the native set (adds @aura3d/addons).
  const historical4Version = major === 4;
  if (requested !== undefined) {
    if (!Object.hasOwn(RELEASE_INVENTORIES, requested)) throw new Error(`Unknown release inventory: ${requested}`);
    if ((major < 4 && requested !== 'historical-3') || (major >= 4 && requested === 'historical-3') || (requested === 'historical-4' && !historical4Version)) throw new Error(`Inventory ${requested} is invalid for ${version}`);
    return requested;
  }
  if (major < 4) return 'historical-3';
  // 4.x releases retain their old set.
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
/** Package name and workspace directory for every package in the selected release inventory. */
export function releasePackageTargets(version, inventoryId) {
  return publicPackageNames(version, inventoryId).map(name => {
    const item = PACKAGE_INVENTORY.find(candidate => candidate.name === name);
    if (!item || !item.directory) throw new Error(`Release inventory package has no workspace directory: ${name}`);
    return { name, directory: item.directory };
  });
}

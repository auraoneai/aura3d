import { consumeWorkspacePnpmAdmission } from './workspace-pnpm-admission.mjs';

// This model is intentionally narrower than pnpm. It does not discover the
// host, execute a package manager, authorize omissions, or establish that an
// actual installation used the assumptions below.
const MAX_PACKAGES = 10000;
const MAX_EDGES = 500000;
const MAX_LIST = 256;
const HASH = /^[a-f0-9]{64}$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const TOKEN = /^[a-z0-9_]+$/;
const fail = message => { throw new Error(`PNPM_PLATFORM_SELECTION: ${message}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sorted = values => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

function exactKeys(value, keys, label) {
  if (!object(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(`invalid ${label}`);
}
function packageName(value) {
  if (typeof value !== 'string' || value.length > 214 || !PACKAGE.test(value)) fail('invalid package name');
  return value;
}
function sourcePath(value, allowRoot = false) {
  if (allowRoot && value === '.') return value;
  if (typeof value !== 'string' || !value || value.length > 4096 || value.startsWith('/') || value.includes('\\') || value.includes(':') ||
      /[\x00-\x1f\x7f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) fail('invalid importer path');
  return value;
}
function snapshotIdentity(key) {
  // Parenthesized peer and patch bindings require a separate materialization
  // contract; they must not be silently reduced to a base package.
  if (typeof key !== 'string' || !key || key.length > 8192 || /[()\x00-\x20\x7f]/.test(key)) fail('unsupported snapshot identity');
  const at = key.lastIndexOf('@');
  if (at < 1 || at === key.length - 1) fail('invalid snapshot identity');
  const version = key.slice(at + 1);
  if (!/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(version) ||
      version.split('.').some(part => !Number.isSafeInteger(Number(part)))) fail('unsupported snapshot version');
  return { key, name: packageName(key.slice(0, at)), version };
}
function constraint(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > MAX_LIST ||
      value.some(token => typeof token !== 'string' || token.length > 128 || !TOKEN.test(token) || token === 'any' || token === 'current' || token === 'unknown') ||
      new Set(value).size !== value.length) fail(`unsupported ${label} constraint`);
  return [...value];
}
function parsePlatform(value) {
  exactKeys(value, ['os', 'cpu', 'libc'], 'declared platform');
  for (const key of ['os', 'cpu', 'libc']) {
    if (typeof value[key] !== 'string' || value[key].length > 128 || !TOKEN.test(value[key]) || value[key] === 'any' || value[key] === 'current' ||
        (key !== 'libc' && value[key] === 'unknown')) fail('invalid declared platform');
  }
  return { os: value.os, cpu: value.cpu, libc: value.libc };
}
function archiveIdentity(admitted) {
  if (!Array.isArray(admitted.archives) || admitted.archives.length > MAX_PACKAGES) fail('invalid admitted archive inventory');
  const records = new Map();
  for (const archive of admitted.archives) {
    if (!object(archive) || typeof archive.version !== 'string' || !archive.version || !HASH.test(archive.sha256 ?? '') ||
        typeof archive.integrity !== 'string' || !(archive.bytes instanceof Uint8Array)) fail('invalid admitted archive identity');
    const key = `${packageName(archive.name)}@${archive.version}`;
    snapshotIdentity(key);
    if (records.has(key)) fail('duplicate admitted archive identity');
    records.set(key, { key, sha256: archive.sha256, integrity: archive.integrity });
  }
  return records;
}
function admissionIdentity(admitted) {
  if (!object(admitted) || !object(admitted.source) || !HASH.test(admitted.source.inputDigest ?? '') ||
      !HASH.test(admitted.source.manifestSha256 ?? '') || !HASH.test(admitted.source.fingerprint ?? '') ||
      !HASH.test(admitted.lockSha256 ?? '') || admitted.source.lockfileSha256 !== admitted.lockSha256 ||
      !HASH.test(admitted.workspaceSha256 ?? '')) fail('invalid admitted source identity');
  if (!Array.isArray(admitted.unresolvedOptionalPeers) || admitted.unresolvedOptionalPeers.length) fail('unresolved optional peers are unsupported');
  if (!Array.isArray(admitted.patches) || admitted.patches.length) fail('patched snapshots are unsupported');
  if (!Array.isArray(admitted.deferredBins) || admitted.deferredBins.length > MAX_PACKAGES ||
      !Array.isArray(admitted.links) || admitted.links.length > MAX_EDGES ||
      !Array.isArray(admitted.overrides) || admitted.overrides.length > MAX_PACKAGES) fail('invalid admitted workspace inventory');
  const archives = archiveIdentity(admitted);
  return { archives, identity: JSON.stringify({ source: admitted.source, workspaceSha256: admitted.workspaceSha256,
    lockSha256: admitted.lockSha256, graph: admitted.graph, archives: sorted([...archives.values()].map(item => JSON.stringify(item))),
    deferredBins: admitted.deferredBins, links: admitted.links, overrides: admitted.overrides,
    unresolvedOptionalPeers: admitted.unresolvedOptionalPeers, patches: admitted.patches }) };
}
function makePlan(admitted, platform, archives) {
  const graph = admitted.graph;
  if (!object(graph) || Object.keys(graph).some(key => !['settings', 'importers', 'packages', 'snapshots'].includes(key)) ||
      !object(graph.settings) || Object.entries(graph.settings).some(([key, value]) =>
        !['autoInstallPeers', 'excludeLinksFromLockfile'].includes(key) || typeof value !== 'boolean') ||
      !Array.isArray(graph.importers) || !Array.isArray(graph.packages) || !Array.isArray(graph.snapshots) ||
      graph.importers.length > MAX_PACKAGES || graph.packages.length > MAX_PACKAGES || graph.snapshots.length > MAX_PACKAGES) fail('invalid admitted graph');

  const packages = new Map(), snapshots = new Map(), importers = new Map();
  for (const item of graph.packages) {
    if (!object(item)) fail('invalid package graph entry');
    const id = snapshotIdentity(item.key);
    if (packages.has(id.key) || !object(item.resolution) ||
        Object.keys(item.resolution).some(key => !['integrity', 'tarball'].includes(key))) fail('unsupported package resolution');
    const archive = archives.get(id.key);
    if (!archive || archive.integrity !== item.resolution.integrity) fail('package does not match admitted archive');
    if (item.engines !== undefined && (!object(item.engines) || Object.values(item.engines).some(value => typeof value !== 'string'))) fail('invalid engine constraint');
    if (item.peerDependencies !== undefined && (!object(item.peerDependencies) || Object.keys(item.peerDependencies).length)) fail('peer dependencies are unsupported');
    if (item.peerDependenciesMeta !== undefined && (!object(item.peerDependenciesMeta) || Object.keys(item.peerDependenciesMeta).length)) fail('peer metadata is unsupported');
    packages.set(id.key, { os: constraint(item.os, 'os'), cpu: constraint(item.cpu, 'cpu'), libc: constraint(item.libc, 'libc'),
      hasEngines: item.engines !== undefined && Object.keys(item.engines).length > 0 });
  }
  if (packages.size !== archives.size) fail('admitted archive inventory differs from graph');
  for (const item of graph.snapshots) {
    if (!object(item)) fail('invalid snapshot graph entry');
    const id = snapshotIdentity(item.key);
    if (!packages.has(id.key) || snapshots.has(id.key) || (item.optional !== undefined && typeof item.optional !== 'boolean')) fail('invalid snapshot graph entry');
    if (item.transitivePeerDependencies !== undefined && (!Array.isArray(item.transitivePeerDependencies) || item.transitivePeerDependencies.length)) fail('transitive peers are unsupported');
    for (const field of ['dependencies', 'optionalDependencies']) {
      if (item[field] !== undefined && !object(item[field])) fail('invalid snapshot dependency map');
    }
    snapshots.set(id.key, item);
  }
  if (snapshots.size !== packages.size) fail('package and snapshot inventories differ');
  for (const item of graph.importers) {
    if (!object(item)) fail('invalid importer graph entry');
    sourcePath(item.path, true);
    if (importers.has(item.path) || !Array.isArray(item.roots) || !HASH.test(item.manifestSha256 ?? '')) fail('invalid importer graph entry');
    packageName(item.name);
    if ((item.peerDependencies && Object.keys(item.peerDependencies).length) || (item.peerDependenciesMeta && Object.keys(item.peerDependenciesMeta).length)) fail('importer peers are unsupported');
    importers.set(item.path, item);
  }
  if (!importers.has('.')) fail('root importer is missing');
  const targetFor = (name, version) => {
    packageName(name);
    if (typeof version !== 'string' || !version || /[()\x00-\x20\x7f]/.test(version) || /^(?:link|file):/.test(version)) fail('unsupported snapshot dependency');
    const target = snapshots.has(version) ? version : `${name}@${version}`;
    if (!snapshots.has(target)) fail('unresolved snapshot dependency');
    return target;
  };
  const queue = [], includedEdges = [], omittedEdges = [], states = new Map();
  let edgeCount = 0;
  const countEdge = () => { if (++edgeCount > MAX_EDGES) fail('graph edge limit exceeded'); };
  const enqueue = edge => {
    countEdge();
    queue.push(edge);
  };
  for (const importer of importers.values()) {
    const names = new Set();
    for (const edge of importer.roots) {
      if (!object(edge) || !['dependencies', 'devDependencies', 'optionalDependencies'].includes(edge.group)) fail('invalid importer dependency');
      const name = packageName(edge.name);
      if (names.has(name)) fail('duplicate importer dependency');
      names.add(name);
      if (edge.kind === 'workspace') {
        const target = importers.get(sourcePath(edge.target, true));
        if (!target || target.name !== name) fail('unresolved workspace dependency');
        countEdge();
        includedEdges.push({ ownerKind: 'importer', owner: importer.path, name, group: edge.group, targetKind: 'workspace', target: edge.target });
      } else if (edge.kind === 'archive') {
        const targetName = packageName(edge.target), target = targetFor(targetName, edge.version);
        if (snapshotIdentity(target).name !== targetName) fail('archive dependency identity differs');
        enqueue({ ownerKind: 'importer', owner: importer.path, name, group: edge.group, targetKind: 'snapshot', target,
          parentOmitted: false, requiredPath: edge.group !== 'optionalDependencies' });
      } else fail('unsupported importer dependency');
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const edge = queue[index], snapshot = snapshots.get(edge.target), metadata = packages.get(edge.target);
    let state, mismatches = [];
    if (edge.parentOmitted) state = 'ancestor-omitted';
    else {
      if (snapshot.optional === true && edge.requiredPath) fail('optional snapshot is reachable by a required path');
      if (metadata.hasEngines) fail('engine constraints are unsupported');
      for (const field of ['os', 'cpu']) if (metadata[field] && !metadata[field].includes(platform[field])) mismatches.push(field);
      if (metadata.libc) {
        if (platform.libc === 'unknown') {
          if (!mismatches.length) fail('declared libc is unknown for a platform decision');
        } else if (!metadata.libc.includes(platform.libc)) mismatches.push('libc');
      }
      if (mismatches.length) {
        if (edge.group !== 'optionalDependencies' || snapshot.optional !== true) fail('platform mismatch is not directly omittable');
        state = 'platform-mismatch';
      } else state = 'selected';
    }
    const existing = states.get(edge.target), signature = `${state}:${edge.requiredPath}`;
    if (existing && existing.signature !== signature) fail('ambiguous mixed-path snapshot reachability');
    const record = { ownerKind: edge.ownerKind, owner: edge.owner, name: edge.name, group: edge.group,
      targetKind: edge.targetKind, target: edge.target };
    if (state === 'selected') includedEdges.push(record);
    else omittedEdges.push({ ...record, reason: state });
    if (existing) continue;
    states.set(edge.target, { signature, state, mismatches });
    const required = snapshot.dependencies ?? {}, optional = snapshot.optionalDependencies ?? {};
    for (const [group, dependencies] of [['dependencies', required], ['optionalDependencies', optional]]) {
      for (const [name, version] of Object.entries(dependencies)) {
        if (group === 'dependencies' && Object.hasOwn(optional, name)) fail('duplicate snapshot dependency');
        enqueue({ ownerKind: 'snapshot', owner: edge.target, name: packageName(name), group, targetKind: 'snapshot',
          target: targetFor(name, version), parentOmitted: state !== 'selected',
          requiredPath: state === 'selected' && edge.requiredPath && group === 'dependencies' });
      }
    }
  }
  if (states.size !== snapshots.size) fail('graph contains unreachable snapshots');
  const edgeSort = (a, b) => {
    const left = JSON.stringify([a.ownerKind, a.owner, a.name, a.group, a.targetKind, a.target]);
    const right = JSON.stringify([b.ownerKind, b.owner, b.name, b.group, b.targetKind, b.target]);
    return left < right ? -1 : left > right ? 1 : 0;
  };
  const selectedSnapshots = sorted([...states].filter(([, value]) => value.state === 'selected').map(([id]) => id));
  const omittedSnapshots = [...states].filter(([, value]) => value.state !== 'selected').map(([id, value]) =>
    Object.freeze({ id, reason: value.state, mismatches: Object.freeze([...value.mismatches]) }));
  omittedSnapshots.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const freezeEdges = edges => Object.freeze(edges.sort(edgeSort).map(edge => Object.freeze(edge)));
  return { selectedSnapshots: Object.freeze(selectedSnapshots), omittedSnapshots: Object.freeze(omittedSnapshots),
    includedEdges: freezeEdges(includedEdges), omittedEdges: freezeEdges(omittedEdges) };
}

/** A conditional model over an admitted graph; never install or runtime authority. */
export function planConditionalPnpmPlatform(input) {
  exactKeys(input, ['capability', 'root', 'sourceManifestPath', 'platform'], 'platform plan input');
  const platform = parsePlatform(input.platform);
  const request = { capability: input.capability, root: input.root, sourceManifestPath: input.sourceManifestPath };
  const admitted = consumeWorkspacePnpmAdmission(request), initial = admissionIdentity(admitted);
  const plan = makePlan(admitted, platform, initial.archives);
  const confirmed = consumeWorkspacePnpmAdmission(request), final = admissionIdentity(confirmed);
  if (final.identity !== initial.identity) fail('workspace admission changed during planning');
  return Object.freeze({ schema: 'aura3d.pnpm-conditional-platform-plan/1',
    sourceInputDigest: admitted.source.inputDigest, sourceManifestSha256: admitted.source.manifestSha256,
    lockfileSha256: admitted.lockSha256, workspaceSha256: admitted.workspaceSha256,
    platform: Object.freeze(platform), admittedArchives: Object.freeze(sorted(initial.archives.keys())), ...plan,
    assumptions: Object.freeze(['All importers and dependency groups are included.',
      'Platform lists use positive membership only; engines, peer bindings and patches are unsupported.',
      'Only directly optional, optional-flagged mismatches and their exclusively unreachable descendants are omitted.',
      'No initial skipped set, omitted optional fetches, lifecycle failures or architecture expansion are modeled.']),
    authority: 'Conditional graph model only; not pnpm conformance, actual host identity, installed-tree evidence, isolation, or permission to install or execute.' });
}

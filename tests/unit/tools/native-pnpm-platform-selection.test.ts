import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceArchiveCapability } from '../../../tools/release/workspace-pnpm-admission.mjs';
import { sourceManifestInputDigest } from '../../../tools/release/source-identity.mjs';

const mock = vi.hoisted(() => ({ enabled: false, capability: {} as object, snapshot: undefined as unknown,
  onConsume: undefined as undefined | (() => void) }));
vi.mock('../../../tools/release/workspace-pnpm-admission.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../tools/release/workspace-pnpm-admission.mjs')>();
  return {
    ...actual,
    consumeWorkspacePnpmAdmission(input: Parameters<typeof actual.consumeWorkspacePnpmAdmission>[0]) {
      if (mock.enabled && input.capability === mock.capability) {
        mock.onConsume?.();
        return structuredClone(mock.snapshot) as ReturnType<typeof actual.consumeWorkspacePnpmAdmission>;
      }
      return actual.consumeWorkspacePnpmAdmission(input);
    }
  };
});

import { planConditionalPnpmPlatform } from '../../../tools/release/pnpm-platform-selection.mjs';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sri = (bytes: Uint8Array) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const platform = { os: 'linux', cpu: 'x64', libc: 'glibc' } as const;
const roots: string[] = [];
type Node = { name: string; optional?: boolean; os?: string[]; cpu?: string[]; libc?: string[];
  engines?: Record<string, string>; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
  transitivePeerDependencies?: string[]; peerDependencies?: Record<string, string> };
type Root = { name: string; target?: string; optional?: boolean };

function fixture(nodes: Node[], rootsInput: Root[]) {
  const packages = nodes.map(node => ({ key: `${node.name}@1.0.0`, resolution: { integrity: sri(Buffer.from(node.name)) },
    ...(node.os ? { os: node.os } : {}), ...(node.cpu ? { cpu: node.cpu } : {}), ...(node.libc ? { libc: node.libc } : {}),
    ...(node.engines ? { engines: node.engines } : {}), ...(node.peerDependencies ? { peerDependencies: node.peerDependencies } : {}) }));
  const snapshots = nodes.map(node => ({ key: `${node.name}@1.0.0`, ...(node.optional !== undefined ? { optional: node.optional } : {}),
    ...(node.dependencies ? { dependencies: node.dependencies } : {}),
    ...(node.optionalDependencies ? { optionalDependencies: node.optionalDependencies } : {}),
    ...(node.transitivePeerDependencies ? { transitivePeerDependencies: node.transitivePeerDependencies } : {}) }));
  const graph = { settings: { autoInstallPeers: true },
    importers: [{ path: '.', name: 'root-fixture', version: '1.0.0', manifestSha256: 'a'.repeat(64),
      peerDependencies: {}, peerDependenciesMeta: {}, roots: rootsInput.map(root => ({ name: root.name, target: root.target ?? root.name,
        version: '1.0.0', specifier: '1.0.0', kind: 'archive', group: root.optional ? 'optionalDependencies' : 'dependencies' })) }],
    packages, snapshots };
  const archives = nodes.map(node => {
    const bytes = Buffer.from(node.name);
    return { name: node.name, version: '1.0.0', sha256: hash(bytes), integrity: sri(bytes), bytes };
  });
  const lockSha256 = 'b'.repeat(64);
  const snapshot = { source: { inputDigest: 'c'.repeat(64), manifestSha256: 'd'.repeat(64), fingerprint: 'e'.repeat(64),
    lockfileSha256: lockSha256, commit: '1'.repeat(40), tree: '2'.repeat(40) }, workspaceSha256: 'f'.repeat(64), lockSha256,
    graph, archives, deferredBins: [] as unknown[], links: [] as unknown[], overrides: [] as unknown[],
    unresolvedOptionalPeers: [] as unknown[], patches: [] as unknown[] };
  mock.snapshot = snapshot;
  return snapshot;
}
function input(declared: { os: string; cpu: string; libc: string } = platform) {
  return { capability: mock.capability as WorkspaceArchiveCapability, root: '/synthetic-admitted-root',
    sourceManifestPath: '.native-source-manifest.json', platform: declared };
}

beforeEach(() => { mock.enabled = true; mock.capability = {}; mock.snapshot = undefined; mock.onConsume = undefined; });
afterEach(() => {
  mock.enabled = false; mock.snapshot = undefined; mock.onConsume = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('conditional admitted pnpm platform graph model', () => {
  it('requires a genuine opaque workspace capability at the public boundary', () => {
    mock.enabled = false;
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/invalid workspace archive capability/);
  });

  it('models a directly optional mismatch and its unreachable required descendant', () => {
    fixture([{ name: 'app', optionalDependencies: { native: '1.0.0' } },
      { name: 'native', optional: true, os: ['darwin'], dependencies: { leaf: '1.0.0' } }, { name: 'leaf' }], [{ name: 'app' }]);
    let consumptions = 0; mock.onConsume = () => { consumptions++; };
    const plan = planConditionalPnpmPlatform(input());
    expect(consumptions).toBe(2);
    expect(plan.selectedSnapshots).toEqual(['app@1.0.0']);
    expect(plan.omittedSnapshots).toEqual([
      { id: 'leaf@1.0.0', reason: 'ancestor-omitted', mismatches: [] },
      { id: 'native@1.0.0', reason: 'platform-mismatch', mismatches: ['os'] }
    ]);
    expect(plan.omittedEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: 'app@1.0.0', name: 'native', reason: 'platform-mismatch' }),
      expect.objectContaining({ owner: 'native@1.0.0', name: 'leaf', reason: 'ancestor-omitted' })
    ]));
    expect(plan.admittedArchives).toEqual(['app@1.0.0', 'leaf@1.0.0', 'native@1.0.0']);
    expect(plan.authority).toMatch(/not pnpm conformance.*permission to install/i);
    expect(Object.isFrozen(plan.omittedSnapshots[0].mismatches)).toBe(true);
    expect(Object.isFrozen(plan.includedEdges[0])).toBe(true);
  });

  it('includes matching positive constraints and preserves archive aliases', () => {
    fixture([{ name: 'app', optionalDependencies: { nativealias: 'native@1.0.0' } },
      { name: 'native', optional: true, os: ['darwin', 'linux'], cpu: ['x64'], libc: ['glibc'] }],
    [{ name: 'appalias', target: 'app' }]);
    const plan = planConditionalPnpmPlatform(input());
    expect(plan.selectedSnapshots).toEqual(['app@1.0.0', 'native@1.0.0']);
    expect(plan.omittedSnapshots).toEqual([]);
    expect(plan.includedEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: '.', name: 'appalias', target: 'app@1.0.0' }),
      expect.objectContaining({ owner: 'app@1.0.0', name: 'nativealias', target: 'native@1.0.0' })
    ]));
  });

  it('includes workspace edges while considering every admitted importer', () => {
    const f = fixture([{ name: 'app' }, { name: 'native', optional: true, cpu: ['arm64'] }], [{ name: 'app' }]);
    f.graph.importers.push({ path: 'packages/ui', name: 'ui', version: '1.0.0', manifestSha256: 'b'.repeat(64),
      peerDependencies: {}, peerDependenciesMeta: {}, roots: [{ name: 'native', target: 'native', version: '1.0.0',
        specifier: '1.0.0', kind: 'archive', group: 'optionalDependencies' }] });
    f.graph.importers[0].roots.push({ name: 'ui', target: 'packages/ui', version: 'link:packages/ui',
      specifier: 'workspace:*', kind: 'workspace', group: 'devDependencies' });
    const plan = planConditionalPnpmPlatform(input());
    expect(plan.includedEdges).toContainEqual({ ownerKind: 'importer', owner: '.', name: 'ui', group: 'devDependencies',
      targetKind: 'workspace', target: 'packages/ui' });
    expect(plan.omittedEdges).toContainEqual(expect.objectContaining({ owner: 'packages/ui', name: 'native', reason: 'platform-mismatch' }));
  });

  it('does not infer an unknown libc when its value would affect a decision', () => {
    const f = fixture([{ name: 'native', optional: true, os: ['linux'], libc: ['musl'] }], [{ name: 'native', optional: true }]);
    const unknown = { ...platform, libc: 'unknown' };
    expect(() => planConditionalPnpmPlatform(input(unknown))).toThrow(/libc is unknown/);
    f.graph.packages[0].os = ['darwin'];
    const plan = planConditionalPnpmPlatform(input(unknown));
    expect(plan.omittedSnapshots).toEqual([{ id: 'native@1.0.0', reason: 'platform-mismatch', mismatches: ['os'] }]);
  });

  it('rejects required mismatches, missing optional flags and ambiguous shared descendants', () => {
    fixture([{ name: 'native', os: ['darwin'] }], [{ name: 'native' }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/not directly omittable/);
    fixture([{ name: 'native', os: ['darwin'] }], [{ name: 'native', optional: true }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/not directly omittable/);
    fixture([{ name: 'good', dependencies: { shared: '1.0.0' } },
      { name: 'bad', optional: true, os: ['darwin'], dependencies: { shared: '1.0.0' } }, { name: 'shared' }],
    [{ name: 'good' }, { name: 'bad', optional: true }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/ambiguous mixed-path/);
  });

  it('rejects optional markers on a required path and a mismatched required child', () => {
    fixture([{ name: 'native', optional: true }], [{ name: 'native' }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/optional snapshot.*required path/);
    fixture([{ name: 'parent', optional: true, dependencies: { child: '1.0.0' } },
      { name: 'child', optional: true, os: ['darwin'] }], [{ name: 'parent', optional: true }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/not directly omittable/);
  });

  it.each(['!linux', 'any', 'current', 'unknown'])('rejects an unmodeled platform constraint: %s', token => {
    fixture([{ name: 'native', optional: true, os: [token] }], [{ name: 'native', optional: true }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/unsupported os constraint/);
  });

  it('rejects unmodeled engines, peer metadata, peer variants and architecture configuration', () => {
    fixture([{ name: 'native', optional: true, engines: { node: '>=18' } }], [{ name: 'native', optional: true }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/engine constraints are unsupported/);
    fixture([{ name: 'native', peerDependencies: { peer: '1.0.0' } }], [{ name: 'native' }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/peer dependencies are unsupported/);
    fixture([{ name: 'native', transitivePeerDependencies: ['peer'] }], [{ name: 'native' }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/transitive peers are unsupported/);
    const f = fixture([{ name: 'native' }], [{ name: 'native' }]);
    f.graph.snapshots[0].key = 'native@1.0.0(peer@1.0.0)';
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/unsupported snapshot identity/);
    expect(() => planConditionalPnpmPlatform({ ...input(), supportedArchitectures: { os: ['linux'] } } as never)).toThrow(/invalid platform plan input/);
  });

  it('requires the complete admitted archive inventory and rejects unresolved edges', () => {
    const f = fixture([{ name: 'app', dependencies: { missing: '1.0.0' } }], [{ name: 'app' }]);
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/unresolved snapshot dependency/);
    f.archives.length = 0;
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/does not match admitted archive/);
  });

  it('rejects unresolved optional peers and reviewed patches outside the supported model', () => {
    const f = fixture([{ name: 'app' }], [{ name: 'app' }]);
    f.unresolvedOptionalPeers.push({ name: 'peer' });
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/unresolved optional peers/);
    f.unresolvedOptionalPeers.length = 0;
    f.patches.push({ packageKey: 'app@1.0.0' });
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/patched snapshots are unsupported/);
  });

  it('revalidates the opaque admission after constructing the plan', () => {
    const f = fixture([{ name: 'app' }], [{ name: 'app' }]);
    let consumptions = 0;
    mock.onConsume = () => { if (++consumptions === 2) f.source.fingerprint = '0'.repeat(64); };
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/workspace admission changed during planning/);
  });

  it('rejects a changed deferred-bin inventory on the second capability consumption', () => {
    const f = fixture([{ name: 'app' }], [{ name: 'app' }]);
    let consumptions = 0;
    mock.onConsume = () => { if (++consumptions === 2) f.deferredBins.push({ importer: 'packages/cli' }); };
    expect(() => planConditionalPnpmPlatform(input())).toThrow(/workspace admission changed during planning/);
  });
});

function tar(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, text] of Object.entries(files)) {
    const bytes = Buffer.from(text), header = Buffer.alloc(512);
    const put = (value: string, offset: number, length: number) => header.write(value, offset, length, 'ascii');
    const octal = (value: number, offset: number, length: number) => put(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length);
    put(`package/${path}`, 0, 100); octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes.length, 124, 12); octal(0, 136, 12); header.fill(32, 148, 156); header[156] = 48;
    put('ustar\0', 257, 6); put('00', 263, 2);
    put(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8);
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

it('uses a real source-bound admission capability without invoking a package manager', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aura-platform-plan-')); roots.push(root);
  const tracked = new Set<string>(), repository = process.cwd();
  const put = (path: string, bytes: string | Uint8Array, source = true) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes);
    if (source) tracked.add(path);
  };
  for (const file of ['portable-npm-lock.mjs', 'portable-pnpm-lock.mjs', 'source-identity.mjs', 'release-inventory.mjs',
    'archive-admission.mjs', 'admitted-archive-modes.mjs', 'pnpm-platform-selection.mjs', 'pnpm-installed-tree.mjs']) {
    put(`tools/release/${file}`, readFileSync(join(repository, 'tools/release', file)));
  }
  const packageJson = JSON.stringify({ name: 'native', version: '1.0.0', os: ['darwin'] });
  const index = 'export const syntheticNative = true;\n';
  const bytes = tar({ 'package.json': packageJson, 'index.js': index });
  const archive = { name: 'native', version: '1.0.0', sha256: hash(bytes), integrity: sri(bytes) };
  const evidence = 'Synthetic independent-review evidence used solely in an isolated source test.\n';
  put('review-input/package.json', packageJson); put('review-input/index.js', index); put('review-input/evidence.txt', evidence);
  const reviewed = (path: string, data: string, sourcePath: string) => ({ path, sha256: hash(data), size: Buffer.byteLength(data),
    origin: 'source-match', sources: [{ path: sourcePath, sha256: hash(data) }],
    evidence: [{ path: 'review-input/evidence.txt', sha256: hash(evidence) }],
    rationale: 'An independent fixture reviewer checked this exact complete file against its separately recorded source.' });
  const review = { schema: 'aura3d.archive-review/1', archive, decision: 'approved', scope: 'complete-archive',
    reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' },
    files: [reviewed('package.json', packageJson, 'review-input/package.json'), reviewed('index.js', index, 'review-input/index.js')] };
  const reviewText = `${JSON.stringify(review, null, 2)}\n`; put('review-input/review.json', reviewText);
  const policyText = `${JSON.stringify({ schema: 'aura3d.workspace-archive-policy/1', admissions: [
    { archive, review: { path: 'review-input/review.json', sha256: hash(reviewText) } }
  ] }, null, 2)}\n`;
  put('tools/release/workspace-archive-admission-policy.json', policyText);
  const original = readFileSync(join(repository, 'tools/release/workspace-pnpm-admission.mjs'), 'utf8');
  const marker = 'const TRUSTED_WORKSPACE_POLICY_SHA256 = null;';
  if (!original.includes(marker)) throw new Error('synthetic policy pin marker is missing');
  put('tools/release/workspace-pnpm-admission.mjs', original.replace(marker, `const TRUSTED_WORKSPACE_POLICY_SHA256 = '${hash(policyText)}';`));
  put('package.json', JSON.stringify({ name: 'root-fixture', version: '1.0.0', packageManager: 'pnpm@11.1.3',
    optionalDependencies: { native: '1.0.0' } }));
  put('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
  const lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    optionalDependencies:
      native:
        specifier: 1.0.0
        version: 1.0.0
packages:
  native@1.0.0:
    resolution: {integrity: ${archive.integrity}}
    os: [darwin]
snapshots:
  native@1.0.0:
    optional: true
`;
  put('pnpm-lock.yaml', lock);
  const files = [...tracked].sort().map(path => ({ path, type: 'file', mode: '100644', sha256: hash(readFileSync(join(root, path))) }));
  const manifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
    files, administrativeFiles: [], lockfileSha256: hash(lock), inputDigest: sourceManifestInputDigest(files) };
  const sourceManifestPath = '.native-source-manifest.json'; put(sourceManifestPath, JSON.stringify(manifest), false);
  const workspace = await import(/* @vite-ignore */ pathToFileURL(join(root, 'tools/release/workspace-pnpm-admission.mjs')).href) as typeof import('../../../tools/release/workspace-pnpm-admission.mjs');
  const planner = await import(/* @vite-ignore */ pathToFileURL(join(root, 'tools/release/pnpm-platform-selection.mjs')).href) as typeof import('../../../tools/release/pnpm-platform-selection.mjs');
  const { capability } = workspace.verifyWorkspacePnpmAdmission({ root, sourceManifestPath,
    archives: [{ resolved: 'https://registry.npmjs.org/native/-/native-1.0.0.tgz', bytes }] });
  const plan = () => planner.planConditionalPnpmPlatform({ capability, root, sourceManifestPath, platform });
  expect(plan().omittedSnapshots).toEqual([{ id: 'native@1.0.0', reason: 'platform-mismatch', mismatches: ['os'] }]);
  expect(plan().admittedArchives).toEqual(['native@1.0.0']);
  expect(() => workspace.assertWorkspacePnpmInstallReady()).toThrow(/custody, offline store and installed-tree/);
  writeFileSync(join(root, 'review-input/index.js'), 'changed');
  expect(plan).toThrow(/source|mismatch/i);
});

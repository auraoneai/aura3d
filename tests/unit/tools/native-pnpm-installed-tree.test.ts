import { createHash } from 'node:crypto';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { describePnpmPlatformClosure, verifyInstalledPnpmWorkspace, verifyInstalledPnpmWorkspaceForPlatform } from '../../../tools/release/pnpm-installed-tree.mjs';
import { sourceManifestInputDigest, stagedSourceIdentity } from '../../../tools/release/source-identity.mjs';
import type { WorkspaceArchiveCapability, WorkspacePnpmGraph } from '../../../tools/release/workspace-pnpm-admission.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const integrity = (bytes: Uint8Array) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const roots: string[] = [];
const capability = () => mock.capability as WorkspaceArchiveCapability;
type PatchRecord = {
  packageKey: string;
  archive: { name: string; version: string; sha256: string; integrity: string };
  patch: { path: string; sha256: string };
  snapshotKeys: string[];
  files: { path: string; before: { sha256: string; size: number; executable: number };
    after: { sha256: string; size: number; executable: number }; bytes: Uint8Array }[];
};
type DeferredBin = {
  importer: string; name: string; manifestSha256: string; commands: string[]; target: string;
  source: { path: string; sha256: string };
};

function archive(name: string, version: string, contents: Record<string, { data: string | Uint8Array; mode: number }>, metadata: Record<string, unknown> = {}) {
  const files = { 'package.json': { data: JSON.stringify({ name, version, ...metadata }), mode: 0o644 }, ...contents };
  const blocks: Buffer[] = [];
  const reviewed: { path: string; size: number; sha256: string }[] = [];
  for (const [path, item] of Object.entries(files)) {
    const bytes = typeof item.data === 'string' ? Buffer.from(item.data) : Buffer.from(item.data), header = Buffer.alloc(512);
    const text = (value: string, offset: number, size: number) => header.write(value, offset, size, 'ascii');
    const octal = (value: number, offset: number, size: number) => text(`${value.toString(8).padStart(size - 1, '0')}\0`, offset, size);
    text(`package/${path}`, 0, 100); octal(item.mode, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes.length, 124, 12); octal(0, 136, 12); header.fill(32, 148, 156); header[156] = 48;
    text('ustar\0', 257, 6); text('00', 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    text(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
    reviewed.push({ path, size: bytes.length, sha256: hash(bytes) });
  }
  blocks.push(Buffer.alloc(1024));
  const bytes = gzipSync(Buffer.concat(blocks));
  return { name, version, bytes, sha256: hash(bytes), integrity: integrity(bytes),
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    review: { path: 'review.json', sha256: 'f'.repeat(64) }, files: reviewed };
}

function write(path: string, data: string | Uint8Array, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data); chmodSync(path, mode);
}
function link(path: string, target: string) {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(relative(dirname(path), target), path, 'dir');
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'a3d-pnpm-installed-'));
  roots.push(root);
  const install = resolve(root, 'install'), store = resolve(install, 'node_modules/.pnpm');
  const rootManifest = Buffer.from(JSON.stringify({ name: 'root-fixture', version: '1.0.0' }));
  const childManifest = Buffer.from(JSON.stringify({ name: 'widget', version: '1.0.0' }));
  const cliSource = Buffer.from('export const syntheticCli = true;\n');
  const lockBytes = Buffer.from('lockfileVersion: 9.0\n');
  const patchBytes = Buffer.from('--- a/bin/tool.js\n+++ b/bin/tool.js\n@@ -1 +1 @@\n-export const tool = true;\n+export const tool = false;\n');
  write(resolve(install, 'package.json'), rootManifest);
  write(resolve(install, 'packages/widget/package.json'), childManifest);
  write(resolve(install, 'packages/widget/src/cli.ts'), cliSource);
  write(resolve(install, 'patches/alpha.patch'), patchBytes);
  write(resolve(install, 'pnpm-lock.yaml'), lockBytes);
  const sourceFiles = [
    { path: 'package.json', type: 'file', mode: '100644', sha256: hash(rootManifest) },
    { path: 'packages/widget/package.json', type: 'file', mode: '100644', sha256: hash(childManifest) },
    { path: 'packages/widget/src/cli.ts', type: 'file', mode: '100644', sha256: hash(cliSource) },
    { path: 'patches/alpha.patch', type: 'file', mode: '100644', sha256: hash(patchBytes) },
    { path: 'pnpm-lock.yaml', type: 'file', mode: '100644', sha256: hash(lockBytes) }
  ];
  const sourceManifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'b'.repeat(40), tree: 'c'.repeat(40) },
    files: sourceFiles, inputDigest: sourceManifestInputDigest(sourceFiles), lockfileSha256: hash(lockBytes) };
  write(resolve(install, '.native-source-manifest.json'), JSON.stringify(sourceManifest));
  const source = stagedSourceIdentity(install, '.native-source-manifest.json');
  write(resolve(store, 'lock.yaml'), lockBytes);

  const alpha = archive('alpha', '1.0.0', { 'bin/tool.js': { data: 'export const tool = true;\n', mode: 0o755 } });
  const beta = archive('beta', '2.0.0', { 'index.js': { data: 'export const beta = 2;\n', mode: 0o644 } });
  const gamma = archive('gamma', '1.0.0', { 'index.js': { data: 'export const gamma = 1;\n', mode: 0o644 } });
  const alphaDir = resolve(store, 'alpha@1.0.0/node_modules/alpha');
  const betaDir = resolve(store, 'beta@2.0.0_gamma@1.0.0/node_modules/beta');
  const gammaDir = resolve(store, 'gamma@1.0.0/node_modules/gamma');
  const installFiles = (directory: string, name: string, version: string, path: string, content: string, mode: number) => {
    write(resolve(directory, 'package.json'), JSON.stringify({ name, version }));
    write(resolve(directory, path), content, mode);
  };
  installFiles(alphaDir, 'alpha', '1.0.0', 'bin/tool.js', 'export const tool = true;\n', 0o755);
  installFiles(betaDir, 'beta', '2.0.0', 'index.js', 'export const beta = 2;\n', 0o644);
  installFiles(gammaDir, 'gamma', '1.0.0', 'index.js', 'export const gamma = 1;\n', 0o644);
  link(resolve(install, 'node_modules/renamed'), alphaDir);
  link(resolve(install, 'node_modules/widget'), resolve(install, 'packages/widget'));
  link(resolve(install, 'packages/widget/node_modules/beta'), betaDir);
  link(resolve(dirname(alphaDir), 'beta'), betaDir);
  link(resolve(dirname(alphaDir), 'gamma'), gammaDir);
  link(resolve(dirname(betaDir), 'gamma'), gammaDir);
  const graph = {
    settings: { autoInstallPeers: true },
    importers: [
      { path: '.', name: 'root-fixture', version: '1.0.0', manifestSha256: hash(rootManifest), peerDependencies: {}, peerDependenciesMeta: {},
        roots: [{ group: 'dependencies', name: 'renamed', specifier: 'npm:alpha@1.0.0', version: '1.0.0', kind: 'archive', target: 'alpha' },
          { group: 'dependencies', name: 'widget', specifier: 'workspace:*', version: 'link:packages/widget', kind: 'workspace', target: 'packages/widget' }] },
      { path: 'packages/widget', name: 'widget', version: '1.0.0', manifestSha256: hash(childManifest), peerDependencies: {}, peerDependenciesMeta: {},
        roots: [{ group: 'dependencies', name: 'beta', specifier: '2.0.0', version: '2.0.0(gamma@1.0.0)', kind: 'archive', target: 'beta' }] }
    ],
    packages: [alpha, beta, gamma].map(item => ({ key: `${item.name}@${item.version}`, resolution: { integrity: item.integrity } })),
    snapshots: [{ key: 'alpha@1.0.0', dependencies: { beta: '2.0.0(gamma@1.0.0)' }, optionalDependencies: { gamma: '1.0.0' } },
      { key: 'beta@2.0.0(gamma@1.0.0)', dependencies: { gamma: '1.0.0' }, transitivePeerDependencies: ['gamma'] },
      { key: 'gamma@1.0.0' }]
  };
  const snapshot = { source, workspaceSha256: 'f'.repeat(64), lockSha256: hash(lockBytes),
    lockBytes, workspaceBytes: Buffer.from('packages: []\n'), graph, deferredBins: [] as DeferredBin[],
    links: [], archives: [alpha, beta, gamma], patches: [] as PatchRecord[] };
  mock.snapshot = snapshot;
  return { root, install, store, alphaDir, betaDir, gammaDir, snapshot, patchBytes, cliSource,
    verify: () => verifyInstalledPnpmWorkspace({ root, sourceManifestPath: '.native-source-manifest.json', capability: capability(), installRoot: install }) };
}

function applyApprovedPatch(f: ReturnType<typeof fixture>) {
  const alpha = f.snapshot.archives[0], output = Buffer.from('export const tool = false;\n');
  const original = alpha.files.find(file => file.path === 'bin/tool.js')!;
  f.snapshot.patches.push({ packageKey: 'alpha@1.0.0',
    archive: { name: alpha.name, version: alpha.version, sha256: alpha.sha256, integrity: alpha.integrity },
    patch: { path: 'patches/alpha.patch', sha256: hash(f.patchBytes) }, snapshotKeys: ['alpha@1.0.0'],
    files: [{ path: 'bin/tool.js', before: { sha256: original.sha256, size: original.size, executable: 0o111 },
      after: { sha256: hash(output), size: output.length, executable: 0o111 }, bytes: output }] });
  write(resolve(f.alphaDir, 'bin/tool.js'), output, 0o755);
  return f.snapshot.patches[0];
}

function declareAlphaBin(f: ReturnType<typeof fixture>, command = 'alpha-tool', input: string | Uint8Array = '#!/usr/bin/env node\r\nexport const tool = true;\n') {
  const bin = { [command]: 'bin/tool.js' };
  const alpha = archive('alpha', '1.0.0', { 'bin/tool.js': { data: input, mode: 0o644 } }, { bin });
  f.snapshot.archives[0] = alpha;
  f.snapshot.graph.packages[0].resolution.integrity = alpha.integrity;
  write(resolve(f.alphaDir, 'package.json'), JSON.stringify({ name: 'alpha', version: '1.0.0', bin }));
  write(resolve(f.alphaDir, 'bin/tool.js'), input, 0o644);
}

function deferWidget(f: ReturnType<typeof fixture>): DeferredBin {
  const importer = f.snapshot.graph.importers.find(item => item.path === 'packages/widget')!;
  const record = { importer: importer.path, name: importer.name, manifestSha256: importer.manifestSha256,
    commands: ['widget'], target: 'dist/cli.js', source: { path: `${importer.path}/src/cli.ts`, sha256: hash(f.cliSource) } };
  f.snapshot.deferredBins.push(record);
  return record;
}

function platformFixture(constraint: string = process.platform === 'linux' ? 'darwin' : 'linux') {
  const f = fixture(), gamma = archive('gamma', '1.0.0',
    { 'index.js': { data: 'export const gamma = 1;\n', mode: 0o644 } }, { os: [constraint] });
  f.snapshot.archives[2] = gamma;
  const metadata = f.snapshot.graph.packages[2];
  metadata.resolution.integrity = gamma.integrity;
  Object.assign(metadata, { os: [constraint] });
  const beta = f.snapshot.graph.snapshots[1];
  beta.key = 'beta@2.0.0';
  Object.assign(beta, { dependencies: {} });
  Reflect.deleteProperty(beta, 'transitivePeerDependencies');
  f.snapshot.graph.snapshots[0].dependencies!.beta = '2.0.0';
  f.snapshot.graph.importers[1].roots[0].version = '2.0.0';
  Object.assign(f.snapshot.graph.snapshots[2], { optional: true });
  rmSync(resolve(dirname(f.alphaDir), 'gamma'));
  const newBeta = resolve(f.store, 'beta@2.0.0/node_modules/beta');
  rmSync(resolve(f.install, 'packages/widget/node_modules/beta'));
  rmSync(resolve(dirname(f.alphaDir), 'beta'));
  renameSync(dirname(dirname(f.betaDir)), dirname(dirname(newBeta)));
  f.betaDir = newBeta;
  link(resolve(f.install, 'packages/widget/node_modules/beta'), f.betaDir);
  link(resolve(dirname(f.alphaDir), 'beta'), f.betaDir);
  rmSync(resolve(dirname(f.betaDir), 'gamma'));
  rmSync(dirname(dirname(f.gammaDir)), { recursive: true });
  const verify = () => verifyInstalledPnpmWorkspaceForPlatform({ root: f.root, sourceManifestPath: '.native-source-manifest.json',
    capability: capability(), installRoot: f.install });
  return { ...f, verifyPlatform: verify };
}

beforeEach(() => { mock.enabled = true; mock.capability = {}; mock.snapshot = undefined; mock.onConsume = undefined; });
afterEach(() => { mock.enabled = false; mock.snapshot = undefined; mock.onConsume = undefined; for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('pnpm installed workspace verification', () => {
  it('requires the real workspace admission capability at the public boundary', () => {
    const f = fixture(); mock.enabled = false;
    expect(f.verify).toThrow(/invalid workspace archive capability/);
  });

  it('checks a complete multi-importer graph, aliases, peer variants, optional edges, bytes and modes', () => {
    const f = fixture(), result = f.verify();
    expect(result.schema).toBe('aura3d.pnpm-installed-workspace/1');
    expect(result.snapshotKeys).toEqual(['alpha@1.0.0', 'beta@2.0.0(gamma@1.0.0)', 'gamma@1.0.0']);
    expect(result.importerCount).toBe(2);
    expect(result.fileCount).toBe(9);
    expect(result.sourceInputDigest).toBe(f.snapshot.source.inputDigest);
    expect(result.scope).toMatch(/not|separate/);
  });

  it('accepts a matching deferred bin when its installed output ancestor is absent', () => {
    const f = fixture(); deferWidget(f);
    expect(f.verify().importerCount).toBe(2);
    const sameRoot = verifyInstalledPnpmWorkspace({ root: f.install, sourceManifestPath: '.native-source-manifest.json',
      capability: capability(), installRoot: f.install });
    expect(sameRoot.sourceInputDigest).toBe(f.snapshot.source.inputDigest);
  });

  it.each(['file', 'empty directory', 'nonempty directory', 'symlink', 'dangling symlink'] as const)(
    'rejects a deferred output ancestor under the installed root: %s', kind => {
      const f = fixture(); deferWidget(f);
      const output = resolve(f.install, 'packages/widget/dist');
      if (kind === 'file') write(output, 'unreviewed');
      else if (kind === 'empty directory') mkdirSync(output);
      else if (kind === 'nonempty directory') write(resolve(output, 'cli.js'), 'unreviewed');
      else symlinkSync(kind === 'symlink' ? 'src' : 'missing', output);
      expect(f.verify).toThrow(/deferred workspace bin output directory exists/);
    }
  );

  it('keeps non-deferred excluded outputs outside this verification contract', () => {
    const f = fixture();
    write(resolve(f.install, 'packages/widget/dist/generated.js'), 'unreviewed');
    expect(f.verify().importerCount).toBe(2);
  });

  it('requires a complete deferred inventory and validates its importer binding', () => {
    const missing = fixture(); Reflect.deleteProperty(missing.snapshot, 'deferredBins');
    expect(missing.verify).toThrow(/invalid deferred workspace bin inventory/);
    const f = fixture(), record = deferWidget(f);
    const original = record.manifestSha256;
    record.manifestSha256 = '0'.repeat(64);
    expect(f.verify).toThrow(/deferred workspace bin differs from importer graph/);
    record.manifestSha256 = original;
    record.target = '../dist/cli.js';
    expect(f.verify).toThrow(/deferred workspace bin target/);
    record.target = 'dist/cli.js';
    record.source.path = 'packages/widget/src/other.ts';
    expect(f.verify).toThrow(/invalid deferred workspace bin record/);
    record.source.path = 'packages/widget/src/cli.ts';
    f.snapshot.deferredBins.push({ ...record, source: { ...record.source } });
    expect(f.verify).toThrow(/deferred workspace bin differs from importer graph/);
  });

  it('rejects an installed output created during inspection', () => {
    const f = fixture(); deferWidget(f);
    let consumed = 0;
    mock.onConsume = () => {
      if (++consumed === 2) mkdirSync(resolve(f.install, 'packages/widget/dist'));
    };
    expect(f.verify).toThrow(/installed tree changed during inspection|deferred workspace bin output directory exists/);
  });

  it('rejects a changed deferred inventory on final capability consumption', () => {
    const f = fixture(), record = deferWidget(f);
    let consumed = 0;
    mock.onConsume = () => { if (++consumed === 2) record.source.sha256 = '0'.repeat(64); };
    expect(f.verify).toThrow(/deferred workspace bin admission changed/);
  });

  it('rejects changed package bytes and executable bits', () => {
    const f = fixture(); write(resolve(f.alphaDir, 'bin/tool.js'), 'changed\n', 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
    write(resolve(f.alphaDir, 'bin/tool.js'), 'export const tool = true;\n', 0o644);
    expect(f.verify).toThrow(/differs from reviewed archive/);
  });

  it('allows only the reviewed declared-bin chmod and valid UTF-8 shebang normalization', () => {
    const f = fixture(); declareAlphaBin(f);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
    write(resolve(f.alphaDir, 'bin/tool.js'), '#!/usr/bin/env node\nexport const tool = true;\n', 0o755);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
    write(resolve(f.alphaDir, 'bin/tool.js'), '#!/usr/bin/env node\nexport const tool = false;\n', 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
  });

  it('does not infer ordinary bin normalization for node shims or invalid UTF-8', () => {
    const f = fixture(); declareAlphaBin(f, 'node');
    write(resolve(f.alphaDir, 'bin/tool.js'), '#!/usr/bin/env node\nexport const tool = true;\n', 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
    const binary = Buffer.concat([Buffer.from('#!/usr/bin/env node\r\n'), Buffer.from([0xff, 0x0a])]);
    declareAlphaBin(f, 'alpha-tool', binary);
    write(resolve(f.alphaDir, 'bin/tool.js'), Buffer.from('#!/usr/bin/env node\n\ufffd\n'), 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
  });

  it('matches the 2048-byte detection boundary and preserves later CRLFs', () => {
    const f = fixture(), short = `#!${'x'.repeat(2044)}\r\nsecond\r\n`;
    declareAlphaBin(f, 'alpha-tool', short);
    write(resolve(f.alphaDir, 'bin/tool.js'), `#!${'x'.repeat(2044)}\nsecond\r\n`, 0o755);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
    write(resolve(f.alphaDir, 'bin/tool.js'), `#!${'x'.repeat(2044)}\nsecond\n`, 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
    const long = `#!${'x'.repeat(2045)}\r\nsecond\r\n`;
    declareAlphaBin(f, 'alpha-tool', long);
    write(resolve(f.alphaDir, 'bin/tool.js'), `#!${'x'.repeat(2045)}\nsecond\r\n`, 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
    write(resolve(f.alphaDir, 'bin/tool.js'), long, 0o755);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
  });

  it('does not normalize an empty shebang line', () => {
    const f = fixture(); declareAlphaBin(f, 'alpha-tool', '#!\r\ncontent\r\n');
    write(resolve(f.alphaDir, 'bin/tool.js'), '#!\ncontent\r\n', 0o755);
    expect(f.verify).toThrow(/differs from reviewed archive/);
    write(resolve(f.alphaDir, 'bin/tool.js'), '#!\r\ncontent\r\n', 0o755);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
  });

  it('rejects undeclared files, directories and symlinks within a package', () => {
    const f = fixture(); write(resolve(f.alphaDir, 'extra.js'), 'extra');
    expect(f.verify).toThrow(/unrecorded package file/);
    rmSync(resolve(f.alphaDir, 'extra.js'));
    mkdirSync(resolve(f.alphaDir, 'empty'));
    expect(f.verify).toThrow(/unrecorded package directory/);
    rmSync(resolve(f.alphaDir, 'empty'), { recursive: true });
    symlinkSync('package.json', resolve(f.alphaDir, 'unexpected'));
    expect(f.verify).toThrow(/contains a symlink/);
  });

  it('rejects missing optional edges and a changed peer-variant link', () => {
    const f = fixture(), optional = resolve(dirname(f.alphaDir), 'gamma');
    rmSync(optional); expect(f.verify).toThrow(/missing installed dependency entry/);
    link(optional, f.gammaDir);
    const peer = resolve(dirname(f.alphaDir), 'beta');
    rmSync(peer); link(peer, f.gammaDir);
    expect(f.verify).toThrow(/virtual-store.*location|identity/);
  });

  it('rejects a peer-variant package moved to a different virtual-store identity', () => {
    const f = fixture(), wrong = resolve(f.store, 'beta@2.0.0_other@1.0.0/node_modules/beta');
    rmSync(resolve(f.install, 'packages/widget/node_modules/beta'));
    rmSync(resolve(dirname(f.alphaDir), 'beta'));
    renameSync(dirname(dirname(f.betaDir)), dirname(dirname(wrong)));
    link(resolve(f.install, 'packages/widget/node_modules/beta'), wrong);
    link(resolve(dirname(f.alphaDir), 'beta'), wrong);
    expect(f.verify).toThrow(/exact virtual-store snapshot location/);
  });

  it('rejects workspace links and package links escaping or misrepresenting their target', () => {
    const f = fixture(), path = resolve(f.install, 'node_modules/widget');
    rmSync(path); symlinkSync(f.alphaDir, path, 'dir');
    expect(f.verify).toThrow(/invalid importer dependency link/);
    rmSync(path); link(path, f.alphaDir);
    expect(f.verify).toThrow(/workspace dependency target differs/);
    rmSync(path); link(path, f.root);
    expect(f.verify).toThrow(/invalid importer dependency link/);
  });

  it('rejects extra modules, unreviewed generated metadata and extra virtual-store entries', () => {
    const f = fixture(); link(resolve(f.install, 'node_modules/unrecorded'), f.gammaDir);
    expect(f.verify).toThrow(/unrecorded installed entry/);
    rmSync(resolve(f.install, 'node_modules/unrecorded'));
    write(resolve(f.install, 'node_modules/.modules.yaml'), '{}');
    expect(f.verify).toThrow(/invalid package name|unrecorded/);
    rmSync(resolve(f.install, 'node_modules/.modules.yaml'));
    write(resolve(dirname(dirname(f.alphaDir)), 'unrecorded'), 'extra');
    expect(f.verify).toThrow(/unrecorded virtual-store package entry/);
    rmSync(resolve(dirname(dirname(f.alphaDir)), 'unrecorded'));
    mkdirSync(resolve(f.store, 'unrecorded'));
    expect(f.verify).toThrow(/unrecorded virtual-store entry/);
  });

  it('rejects a hard-linked installed file even when its bytes match', () => {
    const f = fixture(), target = resolve(f.alphaDir, 'bin/tool.js'), external = resolve(f.root, 'external.js');
    write(external, 'export const tool = true;\n', 0o755);
    rmSync(target); linkSync(external, target);
    expect(f.verify).toThrow(/linked.*installed file/);
  });

  it('requires the exact admitted virtual-store lock and importer manifests', () => {
    const f = fixture(); write(resolve(f.store, 'lock.yaml'), 'different\n');
    expect(f.verify).toThrow(/virtual-store lock differs/);
    write(resolve(f.store, 'lock.yaml'), f.snapshot.lockBytes);
    write(resolve(f.install, 'packages/widget/package.json'), '{}');
    expect(f.verify).toThrow(/installed source does not match/);
  });

  it('rejects an undeclared nested node_modules directory in otherwise staged source', () => {
    const f = fixture();
    mkdirSync(resolve(f.install, 'packages/widget/src/node_modules'), { recursive: true });
    expect(f.verify).toThrow(/unrecorded workspace node_modules directory/);
  });

  it('rejects a reviewed-file inventory that differs from the admitted archive', () => {
    const f = fixture(), alpha = f.snapshot.archives[0];
    alpha.files[0].sha256 = '0'.repeat(64);
    expect(f.verify).toThrow(/reviewed archive file differs/);
  });

  it('checks independently reviewed source-bound patch outputs against the original archive and installed bytes', () => {
    const f = fixture(); applyApprovedPatch(f);
    expect(f.verify().snapshotKeys).toContain('alpha@1.0.0');
  });

  it('rejects altered patch inputs, outputs, snapshots and mode changes', () => {
    const f = fixture(), patch = applyApprovedPatch(f), file = patch.files[0];
    const before = file.before.sha256; file.before.sha256 = '0'.repeat(64);
    expect(f.verify).toThrow(/patch input differs from archive/); file.before.sha256 = before;
    const after = file.after.sha256; file.after.sha256 = '0'.repeat(64);
    expect(f.verify).toThrow(/patch output differs/); file.after.sha256 = after;
    file.after.executable = 0;
    expect(f.verify).toThrow(/unsupported reviewed patch file/); file.after.executable = 0o111;
    patch.snapshotKeys = ['gamma@1.0.0'];
    expect(f.verify).toThrow(/invalid patched snapshot identity/);
  });

  it('rejects a patch source outside the staged input inventory', () => {
    const f = fixture(), patch = applyApprovedPatch(f);
    patch.patch.path = '.native-source-manifest.json';
    expect(f.verify).toThrow(/patch is not a staged source input/);
  });

  it('rejects a patch touching a declared bin until transform order is proven', () => {
    const f = fixture(); declareAlphaBin(f); applyApprovedPatch(f);
    expect(f.verify).toThrow(/unsupported reviewed patch file/);
  });

  it('binds platform metadata to archived bytes and rejects caller-invented graph forms', () => {
    const f = fixture();
    (f.snapshot.graph.packages[0] as { os?: string[] }).os = ['linux'];
    expect(f.verify).toThrow(/archive platform metadata differs/);
    delete (f.snapshot.graph.packages[0] as { os?: string[] }).os;
    Object.assign(f.snapshot.graph, { patchedDependencies: {} });
    expect(f.verify).toThrow(/invalid admitted workspace graph/);
  });

  it('strictly checks platform-specific packages when every admitted snapshot exists', () => {
    const f = fixture(), other = process.platform === 'linux' ? 'darwin' : 'linux';
    const gamma = archive('gamma', '1.0.0', { 'index.js': { data: 'export const gamma = 1;\n', mode: 0o644 } }, { os: [other] });
    f.snapshot.archives[2] = gamma;
    Object.assign(f.snapshot.graph.packages[2], { os: [other] });
    f.snapshot.graph.packages[2].resolution.integrity = gamma.integrity;
    write(resolve(f.gammaDir, 'package.json'), JSON.stringify({ name: 'gamma', version: '1.0.0', os: [other] }));
    expect(f.verify().snapshotKeys).toContain('gamma@1.0.0');
  });

  it('checks an omitted incompatible optional subtree only as a conditional host report', () => {
    const f = platformFixture(), leaf = archive('leaf', '1.0.0',
      { 'index.js': { data: 'export const leaf = 1;\n', mode: 0o644 } });
    Object.assign(f.snapshot.graph.snapshots[2], { dependencies: { leaf: '1.0.0' } });
    f.snapshot.archives.push(leaf);
    f.snapshot.graph.packages.push({ key: 'leaf@1.0.0', resolution: { integrity: leaf.integrity } });
    f.snapshot.graph.snapshots.push({ key: 'leaf@1.0.0' });
    expect(f.verify).toThrow(/missing installed dependency entry/);
    const result = f.verifyPlatform();
    expect(result).toMatchObject({ schema: 'aura3d.pnpm-installed-workspace-platform/1',
      platform: { os: process.platform, cpu: process.arch }, installationAuthorized: false,
      snapshotKeys: ['alpha@1.0.0', 'beta@2.0.0'], omittedSnapshotKeys: ['gamma@1.0.0', 'leaf@1.0.0'] });
    expect(result.scope).toMatch(/runtime identity.*unverified/);
  });

  it('never infers omissions of required, compatible, unsupported, or unreviewed packages', () => {
    const compatible = platformFixture(process.platform);
    expect(compatible.verifyPlatform).toThrow(/missing installed dependency entry/);
    const required = platformFixture();
    Reflect.deleteProperty(required.snapshot.graph.snapshots[0], 'optionalDependencies');
    Object.assign(required.snapshot.graph.snapshots[0].dependencies!, { gamma: '1.0.0' });
    expect(required.verifyPlatform).toThrow(/missing installed dependency entry/);
    const unsupported = platformFixture(`!${process.platform}`);
    expect(unsupported.verifyPlatform).toThrow(/unsupported platform omission constraint/);
    const altered = platformFixture();
    altered.snapshot.archives[2].files[0].sha256 = '0'.repeat(64);
    expect(altered.verifyPlatform).toThrow(/reviewed archive file differs/);
  });

  it('does not accept a caller-supplied platform as evidence', () => {
    const f = platformFixture();
    expect(() => verifyInstalledPnpmWorkspaceForPlatform({ root: f.root, sourceManifestPath: '.native-source-manifest.json',
      capability: capability(), installRoot: f.install, platform: { os: 'linux', cpu: 'x64', libc: 'glibc' } } as never))
      .toThrow(/unsupported platform verification options/);
  });
});

type PlatformNode = { name: string; optional?: boolean; os?: string[]; cpu?: string[]; libc?: string[];
  engines?: Record<string, string>; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
function platformGraph(nodes: PlatformNode[], roots: { name: string; optional?: boolean }[]): WorkspacePnpmGraph {
  return {
    settings: {},
    importers: [{ path: '.', name: 'fixture-root', version: '1.0.0', manifestSha256: 'a'.repeat(64),
      peerDependencies: {}, peerDependenciesMeta: {}, roots: roots.map(item => ({ name: item.name, target: item.name,
        version: '1.0.0', specifier: '1.0.0', kind: 'archive' as const,
        group: item.optional ? 'optionalDependencies' as const : 'dependencies' as const })) }],
    packages: nodes.map(item => ({ key: `${item.name}@1.0.0`, resolution: { integrity: 'sha512-test' },
      ...(item.os ? { os: item.os } : {}), ...(item.cpu ? { cpu: item.cpu } : {}),
      ...(item.libc ? { libc: item.libc } : {}), ...(item.engines ? { engines: item.engines } : {}) })),
    snapshots: nodes.map(item => ({ key: `${item.name}@1.0.0`, ...(item.optional ? { optional: true } : {}),
      ...(item.dependencies ? { dependencies: item.dependencies } : {}),
      ...(item.optionalDependencies ? { optionalDependencies: item.optionalDependencies } : {}) }))
  };
}
const linux = { os: 'linux', cpu: 'x64', libc: 'glibc' };

describe('provisional pnpm platform closure', () => {
  it('describes compatible and incompatible optional snapshots without authorizing installation', () => {
    const graph = platformGraph([{ name: 'app', optionalDependencies: { native: '1.0.0' } },
      { name: 'native', optional: true, os: ['darwin'] }], [{ name: 'app' }]);
    const result = describePnpmPlatformClosure({ graph, platform: linux });
    expect(result.selected).toEqual(['app@1.0.0']);
    expect(result.skipped).toEqual([{ id: 'native@1.0.0', reason: 'platform-incompatible' }]);
    expect(result.authority).toMatch(/not runtime identity.*permission to install/);
    expect(result.assumptions.initialSkipped).toBe('empty');
  });

  it('retains incompatible nonoptional snapshots and traverses their optional descendants', () => {
    const graph = platformGraph([{ name: 'optionalparent', optional: true, os: ['darwin'], dependencies: { core: '1.0.0' } },
      { name: 'core', os: ['darwin'], optionalDependencies: { leaf: '1.0.0' } }, { name: 'leaf', optional: true }],
    [{ name: 'optionalparent', optional: true }]);
    const result = describePnpmPlatformClosure({ graph, platform: linux });
    expect(result.selected).toEqual(['core@1.0.0']);
    expect(result.skipped).toEqual([{ id: 'leaf@1.0.0', reason: 'ancestor-incompatible' },
      { id: 'optionalparent@1.0.0', reason: 'platform-incompatible' }]);
  });

  it('rejects a shared snapshot reached with incompatible parent states', () => {
    const graph = platformGraph([{ name: 'good', dependencies: { shared: '1.0.0' } },
      { name: 'bad', optional: true, os: ['darwin'], dependencies: { shared: '1.0.0' } }, { name: 'shared' }],
    [{ name: 'good' }, { name: 'bad', optional: true }]);
    expect(() => describePnpmPlatformClosure({ graph, platform: linux })).toThrow(/ambiguous mixed-parent/);
  });

  it('does not omit an optional-flagged snapshot reached by a fully required path', () => {
    const graph = platformGraph([{ name: 'app', dependencies: { native: '1.0.0' } },
      { name: 'native', optional: true, os: ['darwin'] }], [{ name: 'app' }]);
    expect(() => describePnpmPlatformClosure({ graph, platform: linux })).toThrow(/fully required path/);
  });

  it('treats unknown libc as ignored and does not infer glibc or musl', () => {
    const graph = platformGraph([{ name: 'native', optional: true, libc: ['musl'] }], [{ name: 'native', optional: true }]);
    expect(describePnpmPlatformClosure({ graph, platform: { ...linux, libc: 'unknown' } }).selected).toEqual(['native@1.0.0']);
    expect(describePnpmPlatformClosure({ graph, platform: linux }).skipped).toEqual([{ id: 'native@1.0.0', reason: 'platform-incompatible' }]);
  });

  it('uses singleton any and matching-negation precedence', () => {
    const any = platformGraph([{ name: 'native', optional: true, os: ['any'] }], [{ name: 'native', optional: true }]);
    expect(describePnpmPlatformClosure({ graph: any, platform: linux }).selected).toEqual(['native@1.0.0']);
    const mixed = platformGraph([{ name: 'native', optional: true, os: ['any', '!linux'] }], [{ name: 'native', optional: true }]);
    expect(describePnpmPlatformClosure({ graph: mixed, platform: linux }).skipped[0].id).toBe('native@1.0.0');
    const excludedOther = platformGraph([{ name: 'native', optional: true, os: ['!darwin'] }], [{ name: 'native', optional: true }]);
    expect(describePnpmPlatformClosure({ graph: excludedOther, platform: linux }).selected).toEqual(['native@1.0.0']);
    const wrongCpu = platformGraph([{ name: 'native', optional: true, cpu: ['arm64'] }], [{ name: 'native', optional: true }]);
    expect(describePnpmPlatformClosure({ graph: wrongCpu, platform: linux }).skipped[0].reason).toBe('platform-incompatible');
  });

  it('rejects unverified engines, non-current architecture configuration and unresolved graph edges', () => {
    const engines = platformGraph([{ name: 'native', optional: true, engines: { node: '>=22' } }], [{ name: 'native', optional: true }]);
    expect(() => describePnpmPlatformClosure({ graph: engines, platform: linux })).toThrow(/engine selection is unavailable/);
    const graph = platformGraph([{ name: 'app', dependencies: { missing: '1.0.0' } }], [{ name: 'app' }]);
    expect(() => describePnpmPlatformClosure({ graph, platform: linux, supportedArchitectures: { os: ['darwin'] } })).toThrow(/non-current architecture/);
    expect(() => describePnpmPlatformClosure({ graph, platform: linux })).toThrow(/unresolved platform dependency/);
    const variations = platformGraph([{ name: 'native' }], [{ name: 'native' }]);
    Object.assign(variations.packages[0].resolution, { type: 'variations' });
    expect(() => describePnpmPlatformClosure({ graph: variations, platform: linux })).toThrow(/unsupported platform package metadata/);
  });
});

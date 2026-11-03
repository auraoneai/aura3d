import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceArchiveCapability, WorkspacePnpmInput, WorkspaceSourceApprovalSubject } from '../../../tools/release/workspace-pnpm-admission.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const sri = (data: Uint8Array) => `sha512-${createHash('sha512').update(data).digest('base64')}`;
const formatted = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const stable = (value: unknown) => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
function fixtureStoreName(graph: { snapshots: readonly { key: string }[] }, name: string, version: string) {
  const base = `${name}@${version}`, found = graph.snapshots.filter(item => item.key === base || item.key.startsWith(`${base}(`));
  if (found.length !== 1) throw new Error(`ambiguous synthetic snapshot: ${base}`);
  return found[0].key.replaceAll('/', '+').replaceAll('(', '_').replaceAll(')', '');
}

/** This tar is built in memory; no package manager, install, or network is used. */
function archive(files: Array<{ path: string; data: string; type?: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const data = Buffer.from(file.data), header = Buffer.alloc(512);
    header.write(`package/${file.path}`, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii');
    header.fill(32, 148, 156); header[156] = (file.type ?? '0').charCodeAt(0); header.write('ustar\0', 257, 6, 'ascii');
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

type FixtureOptions = {
  readonly noPin?: boolean;
  readonly badPin?: boolean;
  readonly actualForms?: boolean;
  readonly includeSourceRunner?: boolean;
  readonly syntheticToolchain?: boolean;
  readonly incompleteToolchainReview?: boolean;
  readonly withoutSourceAuthority?: boolean;
  readonly omitPatchReview?: boolean;
  readonly wrongPatchOutput?: boolean;
  readonly patch?: (value: string) => string;
  readonly helperBin?: unknown;
  readonly helperScripts?: Record<string, string>;
  readonly helperDirectoriesBin?: unknown;
  readonly archiveSymlink?: boolean;
  readonly childBin?: unknown;
  readonly deferredCli?: 'aura' | 'create';
  readonly bothDeferredClis?: boolean;
  readonly deferredSource?: 'regular' | 'missing' | 'symlink';
  readonly childDir?: string;
  readonly verifierSuffix?: string;
  readonly sourceBin?: 'regular' | 'symlink';
  readonly hookPath?: string;
  readonly noPlatform?: boolean;
  readonly lock?: (value: string) => string;
  readonly config?: (value: string) => string;
  readonly childManifest?: (value: Record<string, unknown>) => Record<string, unknown>;
  readonly review?: (value: { files: Array<Record<string, unknown>> }) => void;
};

/** Only the isolated synthetic copy receives a synthetic test policy pin. */
async function fixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aura-workspace-admission-')); roots.push(root);
  // The key exists only in this disposable synthetic fixture, as in the
  // existing candidate-review tests. It never becomes a production root.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  const sourceAuthority = { keyId: sha(publicDer), spkiDerBase64: publicDer.toString('base64') };
  const tracked = new Set<string>(), repository = process.cwd();
  const put = (path: string, data: string | Uint8Array, source = true) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data);
    if (source) tracked.add(path);
  };
  for (const file of ['portable-npm-lock.mjs', 'portable-pnpm-lock.mjs', 'source-identity.mjs', 'release-inventory.mjs', 'archive-admission.mjs', 'admitted-archive-modes.mjs', 'pnpm-installed-tree.mjs', 'pnpm-loopback-registry.mjs']) {
    put(`tools/release/${file}`, readFileSync(join(repository, 'tools/release', file)));
  }
  put('tools/remote-acr/offline-archive-store.mjs', readFileSync(join(repository, 'tools/remote-acr/offline-archive-store.mjs')));
  if (options.includeSourceRunner) {
    for (const file of ['tools/remote-acr/source-checks.mjs', 'tools/remote-acr/portable-inputs.mjs',
      'tools/remote-acr/source-resume.mjs', 'tools/native-source-inventory/index.mjs']) {
      put(file, readFileSync(join(repository, file)));
    }
  }
  const sourceText = 'export const independentFixture = 1;\n';
  const descriptors = [
    { name: 'helper', version: '1.2.0', dependencies: { common: '^2.0.0' }, peerDependencies: { peer: '^4.0.0' }, optionalDependencies: { opt: '~3.2.0' },
      ...(options.helperBin === undefined ? {} : { bin: options.helperBin }),
      ...(options.helperScripts === undefined ? {} : { scripts: options.helperScripts }),
      ...(options.helperDirectoriesBin === undefined ? {} : { directories: { bin: options.helperDirectoriesBin } }) },
    { name: 'helper', version: '1.3.0', ...(options.actualForms
      ? { peerDependencies: { 'optional-tag': 'latest' }, peerDependenciesMeta: { 'optional-tag': { optional: true } } } : {}) },
    { name: 'common', version: '2.0.0' },
    { name: 'peer', version: '4.0.0' },
    { name: 'opt', version: '3.2.1', ...(options.noPlatform ? {} : { os: ['linux'], cpu: ['x64'] }) }
  ];
  const packages = descriptors.map((manifest, index) => {
    const packageJson = JSON.stringify(manifest), code = `${sourceText}// ${manifest.name}@${manifest.version}\n`;
    const files = [{ path: 'package.json', data: packageJson }, { path: 'index.js', data: code },
      ...(index === 0 && options.archiveSymlink ? [{ path: 'bin.js', data: '', type: '2' }] : [])];
    const bytes = archive(files);
    const packageSource = `independent/pkg-${index}.json`, codeSource = `independent/pkg-${index}.js`, evidencePath = `independent/review-${index}.txt`;
    const evidence = 'Synthetic independent-review evidence used solely in an isolated source test.\n';
    put(packageSource, packageJson); put(codeSource, code); put(evidencePath, evidence);
    const identity = { name: manifest.name, version: manifest.version, sha256: sha(bytes), integrity: sri(bytes) };
    const reviewed = (path: string, data: string, sourcePath: string) => ({
      path, sha256: sha(data), size: Buffer.byteLength(data), origin: 'source-match',
      sources: [{ path: sourcePath, sha256: sha(data) }], evidence: [{ path: evidencePath, sha256: sha(evidence) }],
      rationale: 'An independent fixture reviewer checked this exact complete file against its separately recorded source.'
    });
    const review = { schema: 'aura3d.archive-review/1', archive: identity, decision: 'approved', scope: 'complete-archive',
      reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' },
      files: [reviewed('package.json', packageJson, packageSource), reviewed('index.js', code, codeSource)] };
    if (index === 0) options.review?.(review);
    const reviewBytes = formatted(review), reviewPath = `independent/review-${index}.json`;
    put(reviewPath, reviewBytes);
    return { ...identity, bytes, resolved: `https://registry.npmjs.org/${manifest.name}/-/${manifest.name}-${manifest.version}.tgz`,
      review: { path: reviewPath, sha256: sha(reviewBytes) } };
  });
  const [helperOne, helperTwo, common, peer, optional] = packages;
  const deferred = options.deferredCli === 'aura'
    ? { dir: 'packages/aura3d-cli', name: '@aura3d/cli', bin: { aura3d: 'dist/cli.js', aura: 'dist/cli.js', cli: 'dist/cli.js' } }
    : options.deferredCli === 'create'
      ? { dir: 'packages/create-aura3d', name: 'create-aura3d', bin: { 'create-aura3d': 'dist/cli.js' } }
      : undefined;
  const childDir = options.childDir ?? deferred?.dir ?? 'packages/lib';
  const childBin = options.childBin === undefined ? deferred?.bin : options.childBin;
  const rootManifest = { name: '@aura3d/engine', version: '4.7.1', packageManager: 'pnpm@11.1.3',
    dependencies: { helper: '^1.0.0' }, devDependencies: { helper: '^1.0.0' } };
  const child = { name: deferred?.name ?? '@aura3d/lib', version: '4.7.1', devDependencies: { '@aura3d/engine': 'workspace:*' },
    dependencies: { 'helper-alias': 'npm:helper@~1.3.0' }, optionalDependencies: { opt: '3.2.1' },
    peerDependencies: { peer: '^4.0.0' }, ...(childBin === undefined ? {} : { bin: childBin }) };
  put('package.json', formatted(rootManifest));
  put(`${childDir}/package.json`, formatted(options.childManifest?.(child) ?? child));
  if (options.sourceBin === 'regular') put(`${childDir}/bin.js`, 'export const fixtureBin = true;\n');
  if (options.sourceBin === 'symlink') {
    put(`${childDir}/actual.js`, 'export const fixtureBin = true;\n');
    symlinkSync('actual.js', join(root, childDir, 'bin.js')); tracked.add(`${childDir}/bin.js`);
  }
  if (deferred && options.deferredSource !== 'missing') {
    const source = `${childDir}/src/cli.ts`;
    if (options.deferredSource === 'symlink') {
      put(`${childDir}/src/actual.ts`, 'export const fixtureCli = true;\n');
      symlinkSync('actual.ts', join(root, source)); tracked.add(source);
    } else put(source, 'export const fixtureCli = true;\n');
  }
  if (options.bothDeferredClis) {
    put('packages/create-aura3d/package.json', formatted({ name: 'create-aura3d', version: '4.7.1',
      bin: { 'create-aura3d': 'dist/cli.js' } }));
    put('packages/create-aura3d/src/cli.ts', 'export const fixtureCli = true;\n');
  }
  if (options.hookPath) put(options.hookPath, 'export default {};\n');
  put('tools/not-workspace/package.json', formatted({ name: 'unlisted-fixture', version: '1.0.0' }));
  const patchSource = `diff --git a/index.js b/index.js
index 0000000..1111111 100644
--- a/index.js
+++ b/index.js
@@ -1,2 +1,2 @@
-export const independentFixture = 1;
+export const independentFixture = 2;
 // helper@1.2.0
`;
  const patchText = options.patch?.(patchSource) ?? patchSource, patchHash = sha(patchText);
  if (options.actualForms) put('patches/helper.patch', patchText);
  let config = `packages:\n  - "packages/*"\n  - "workers/*"\nallowBuilds:\n  helper: true\n`;
  if (options.actualForms) config += `overrides:\n  'helper>common': 2.0.0\npatchedDependencies:\n  helper@1.2.0: patches/helper.patch\n`;
  put('pnpm-workspace.yaml', options.config?.(config) ?? config);
  let lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      helper:
        specifier: ^1.0.0
        version: 1.2.0${options.actualForms ? `(patch_hash=${patchHash})` : ''}(peer@4.0.0)
  ${childDir}:
    dependencies:
      helper-alias:
        specifier: npm:helper@~1.3.0
        version: helper@1.3.0
      peer:
        specifier: ^4.0.0
        version: 4.0.0
    devDependencies:
      '@aura3d/engine':
        specifier: workspace:*
        version: link:../..
    optionalDependencies:
      opt:
        specifier: 3.2.1
        version: 3.2.1
${options.bothDeferredClis ? '  packages/create-aura3d: {}\n' : ''}packages:
  helper@1.2.0:
    resolution: {integrity: ${helperOne.integrity}}
    peerDependencies:
      peer: ^4.0.0
  helper@1.3.0:
    resolution: {integrity: ${helperTwo.integrity}}
${options.actualForms ? "    peerDependencies:\n      optional-tag: latest\n    peerDependenciesMeta:\n      optional-tag:\n        optional: true\n" : ''}  common@2.0.0:
    resolution: {integrity: ${common.integrity}}
  peer@4.0.0:
    resolution: {integrity: ${peer.integrity}}
  opt@3.2.1:
    resolution: {integrity: ${optional.integrity}}
${options.noPlatform ? '' : '    os: [linux]\n    cpu: [x64]\n'}snapshots:
  'helper@1.2.0${options.actualForms ? `(patch_hash=${patchHash})` : ''}(peer@4.0.0)':
    dependencies:
      common: 2.0.0
      peer: 4.0.0
    optionalDependencies:
      opt: 3.2.1
  helper@1.3.0: {}
  common@2.0.0: {}
  peer@4.0.0: {}
  opt@3.2.1:
    optional: true
`;
  if (options.actualForms) lock += `\noverrides:\n  'helper>common': 2.0.0\npatchedDependencies:\n  helper@1.2.0: ${patchHash}\n`;
  const lockText = options.lock?.(lock) ?? lock;
  put('pnpm-lock.yaml', lockText);
  const patchPolicy = [];
  if (options.actualForms) {
    const patch = { path: 'patches/helper.patch', sha256: patchHash };
    const beforeText = `${sourceText}// helper@1.2.0\n`;
    const afterText = beforeText.replace('independentFixture = 1', 'independentFixture = 2');
    const patchReview = {
      schema: 'aura3d.workspace-patch-review/1',
      archive: { name: helperOne.name, version: helperOne.version, sha256: helperOne.sha256, integrity: helperOne.integrity },
      patch, decision: 'approved', scope: 'complete-patch', reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' },
      files: [{ path: 'index.js', before: { sha256: sha(beforeText), size: Buffer.byteLength(beforeText), executable: 0 },
        after: { sha256: options.wrongPatchOutput ? '0'.repeat(64) : sha(afterText), size: Buffer.byteLength(afterText), executable: 0 },
        sources: [patch], evidence: [{ path: 'independent/review-0.txt', sha256: sha('Synthetic independent-review evidence used solely in an isolated source test.\n') }],
        rationale: 'An independent fixture reviewer compared the exact patch input and complete output bytes against the approved sources.' }]
    };
    const bytes = formatted(patchReview), path = 'independent/helper-patch-review.json';
    put(path, bytes);
    if (!options.omitPatchReview) patchPolicy.push({ archive: patchReview.archive, patch, review: { path, sha256: sha(bytes) } });
  }
  let toolchain: { managerRoot: string; nodePath: string } | undefined;
  let toolchainPolicy: Record<string, unknown> | undefined;
  if (options.syntheticToolchain) {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-synthetic-toolchain-'))); roots.push(parent);
    const managerRoot = join(parent, 'pnpm'), nodePath = join(parent, 'node');
    const nodeBytes = 'This inert fixture is not a Node binary.\n';
    const fileData = [
      { path: 'bin/pnpm.cjs', data: '// inert synthetic pnpm entrypoint\n' },
      { path: 'dist/runtime.js', data: '// inert synthetic pnpm runtime\n' }
    ];
    mkdirSync(managerRoot);
    for (const file of fileData) {
      const path = join(managerRoot, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.data);
    }
    writeFileSync(nodePath, nodeBytes, { mode: 0o755 }); chmodSync(nodePath, 0o755);
    const subject = { manager: 'pnpm@11.1.3', nodeVersion: '22.23.2',
      node: { sha256: sha(nodeBytes), size: Buffer.byteLength(nodeBytes), executable: 0o111 },
      entrypoint: 'bin/pnpm.cjs',
      files: fileData.map(file => ({ path: file.path, sha256: sha(file.data), size: Buffer.byteLength(file.data), executable: 0 })) };
    const evidencePath = 'independent/toolchain-evidence.txt';
    const evidence = 'Synthetic evidence only; no actual package manager is reviewed or executed.\n';
    put(evidencePath, evidence);
    const review = { schema: 'aura3d.pnpm-toolchain-review/1',
      subject: options.incompleteToolchainReview ? { ...subject, files: subject.files.slice(0, 1) } : subject,
      decision: 'approved', scope: 'complete-toolchain',
      reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' },
      evidence: [{ path: evidencePath, sha256: sha(evidence) }],
      rationale: 'The isolated test reviewer compared every inert fixture file and fake runtime byte against this synthetic inventory.' };
    const reviewPath = 'independent/toolchain-review.json', reviewBytes = formatted(review);
    put(reviewPath, reviewBytes);
    toolchainPolicy = { ...subject, review: { path: reviewPath, sha256: sha(reviewBytes) } };
    toolchain = { managerRoot, nodePath };
  }
  const policyBytes = formatted({ schema: 'aura3d.workspace-archive-policy/1', admissions: packages.map(item => ({
    archive: { name: item.name, version: item.version, sha256: item.sha256, integrity: item.integrity }, review: item.review
  })), ...(options.actualForms ? { patches: patchPolicy } : {}), ...(toolchainPolicy ? { toolchain: toolchainPolicy } : {}),
    ...(options.withoutSourceAuthority ? {} : { sourceAuthorities: [sourceAuthority] }) });
  put('tools/release/workspace-archive-admission-policy.json', policyBytes);
  let code = readFileSync(join(repository, 'tools/release/workspace-pnpm-admission.mjs'), 'utf8');
  if (!options.noPin) code = code.replace('const TRUSTED_WORKSPACE_POLICY_SHA256 = null;',
    `const TRUSTED_WORKSPACE_POLICY_SHA256 = '${options.badPin ? '0'.repeat(64) : sha(policyBytes)}';`);
  code += options.verifierSuffix ?? '';
  put('tools/release/workspace-pnpm-admission.mjs', code);
  const files = [...tracked].sort().map(path => {
    const full = join(root, path), link = lstatSync(full).isSymbolicLink();
    return { path, type: link ? 'symlink' : 'file', mode: link ? '120000' : '100644',
      sha256: sha(link ? readlinkSync(full) : readFileSync(full)) };
  });
  const sourceManifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
    files, administrativeFiles: [], lockfileSha256: sha(lockText), inputDigest: sha(stable(files)) };
  const sourceManifestPath = '.native-source-manifest.json'; put(sourceManifestPath, formatted(sourceManifest), false);
  const api = await import(/* @vite-ignore */ pathToFileURL(join(root, 'tools/release/workspace-pnpm-admission.mjs')).href) as typeof import('../../../tools/release/workspace-pnpm-admission.mjs');
  const input: WorkspacePnpmInput = { root, sourceManifestPath,
    archives: packages.map(item => ({ resolved: item.resolved, bytes: item.bytes })) };
  const signSubject = (subject: WorkspaceSourceApprovalSubject) => {
    const payload = { schema: 'aura3d.workspace-source-approval/1', subject, decision: 'approved',
      scope: 'workspace-dependency-inputs', reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' } };
    const signature = sign(null, Buffer.from(`aura3d.workspace-source-approval/1\0${stable(payload)}`), privateKey).toString('base64');
    return Buffer.from(formatted({ schema: 'aura3d.workspace-source-approval-envelope/1', payload,
      signature: { algorithm: 'ed25519', keyId: sourceAuthority.keyId, value: signature } }));
  };
  const approvalFor = (capability: WorkspaceArchiveCapability) => signSubject(api.workspacePnpmSourceApprovalSubject({
    root, sourceManifestPath, capability
  }));
  const runnerApproval = () => approvalFor(api.verifyWorkspacePnpmAdmission({ ...input, allowDeferredWorkspaceBins: true }).capability);
  return { root, api, input, packages, lockText, toolchain, sourceAuthority, signSubject, approvalFor, runnerApproval };
}

/**
 * Construct an observed tree from the synthetic archives, without executing a
 * package manager. This demonstrates the verification boundaries only.
 */
async function syntheticInstalledWorkspace(
  f: Awaited<ReturnType<typeof fixture>>,
  capability: WorkspaceArchiveCapability,
  installRoot: string
) {
  cpSync(f.root, installRoot, { recursive: true });
  const admitted = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
  const modes = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/admitted-archive-modes.mjs')).href) as typeof import('../../../tools/release/admitted-archive-modes.mjs');
  const directories = new Map<string, string>();
  const write = (path: string, bytes: Uint8Array | string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
  const link = (path: string, target: string) => { mkdirSync(dirname(path), { recursive: true }); symlinkSync(relative(dirname(path), target), path, 'dir'); };
  for (const item of admitted.archives) {
    const directory = join(installRoot, 'node_modules/.pnpm', fixtureStoreName(admitted.graph, item.name, item.version), 'node_modules', item.name);
    directories.set(`${item.name}@${item.version}`, directory);
    for (const file of modes.inspectAdmittedArchiveFiles(item.bytes).files) write(join(directory, file.path), file.bytes);
  }
  const get = (key: string): string => {
    const path = directories.get(key); if (!path) throw new Error(`missing synthetic package ${key}`); return path;
  };
  const patched = get('helper@1.2.0'), other = get('helper@1.3.0'), common = get('common@2.0.0');
  const peer = get('peer@4.0.0'), optional = get('opt@3.2.1');
  if (admitted.patches.length) write(join(patched, 'index.js'), admitted.patches[0].files[0].bytes);
  write(join(installRoot, 'node_modules/.pnpm/lock.yaml'), f.lockText);
  link(join(installRoot, 'node_modules/helper'), patched);
  link(join(installRoot, 'packages/aura3d-cli/node_modules/helper-alias'), other);
  link(join(installRoot, 'packages/aura3d-cli/node_modules/peer'), peer);
  link(join(installRoot, 'packages/aura3d-cli/node_modules/opt'), optional);
  link(join(installRoot, 'packages/aura3d-cli/node_modules/@aura3d/engine'), installRoot);
  link(join(dirname(patched), 'common'), common);
  link(join(dirname(patched), 'peer'), peer);
  link(join(dirname(patched), 'opt'), optional);
  return { admitted, patched };
}

describe('pre-candidate pnpm workspace admission', () => {
  it('threads a synthetically pinned graph through the source runner, private store and separately observed installed tree without installing', async () => {
    // The fake review and pin exist only inside this disposable fixture. They
    // are not evidence or an approved policy for the Aura3D workspace.
    const f = await fixture({ includeSourceRunner: true, syntheticToolchain: true, actualForms: true, noPlatform: true,
      helperScripts: { preinstall: 'node -e "require(\'fs\').writeFileSync(\'DO_NOT_EXECUTE\', \'bad\')"' },
      deferredCli: 'aura', bothDeferredClis: true });
    const runner = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-source-runner-boundaries-'))); roots.push(parent);
    const storeDir = join(parent, 'store');
    const prepared = runner.prepareWorkspaceDependencyAdmission({
      root: f.root, sourceManifestPath: f.input.sourceManifestPath, archives: f.input.archives, storeDir,
      approvalBytes: f.runnerApproval()
    });
    expect(prepared.installationAuthorized).toBe(false);
    expect(prepared.approval).toMatchObject({ keyId: f.sourceAuthority.keyId, installationAuthorized: false });
    expect(prepared.receipt.archives).toHaveLength(5);
    expect(prepared.receipt.patches).toHaveLength(1);
    expect(prepared.receipt.deferredBins).toHaveLength(2);
    expect(prepared.store).toMatchObject({ schema: 'aura3d.pnpm-native-store/1',
      archiveCount: 5, installationAuthorized: false });
    const base = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, capability: prepared.capability, storeDir };
    const toolchainInput = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, capability: prepared.capability,
      toolchainRoot: f.toolchain!.managerRoot, nodePath: f.toolchain!.nodePath };
    const toolchain = runner.inspectWorkspaceDependencyToolchain(toolchainInput);
    expect(toolchain).toMatchObject({ schema: 'aura3d.workspace-pnpm-toolchain-observation/1',
      declaredManager: 'pnpm@11.1.3', declaredNodeVersion: '22.23.2', fileCount: 2, executionAuthorized: false });
    expect(toolchain.scope).toMatch(/runtime identity.*not attested/);
    // A complete byte review and store still cannot authorize a subprocess.
    const ready = { ...base, approvalCapability: prepared.approvalCapability };
    expect(() => runner.assertWorkspaceDependencyAdmission(ready))
      .toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE.*package-manager custody.*isolation/);
    expect(() => runner.assertWorkspaceDependencyAdmission({ ...ready, ...toolchainInput }))
      .toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE.*package-manager custody.*isolation/);
    expect(() => f.api.assertWorkspacePnpmInstallReady({ ...base, custody: true } as never))
      .toThrow(/unsupported workspace install readiness field/);

    const entry = join(f.toolchain!.managerRoot, 'bin/pnpm.cjs'), entryBytes = readFileSync(entry);
    writeFileSync(entry, Buffer.alloc(entryBytes.length, 0x78));
    expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/toolchain file differs/);
    expect(() => runner.assertWorkspaceDependencyAdmission({ ...ready, ...toolchainInput }))
      .toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE.*toolchain file differs/);
    writeFileSync(entry, entryBytes);
    rmSync(entry);
    symlinkSync('../dist/runtime.js', entry);
    expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/linked/);
    rmSync(entry); writeFileSync(entry, entryBytes);
    const extra = join(f.toolchain!.managerRoot, 'dist/unreviewed.js');
    writeFileSync(extra, 'not reviewed');
    expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/unreviewed package-manager file/);
    rmSync(extra);
    const nodeBytes = readFileSync(f.toolchain!.nodePath);
    writeFileSync(f.toolchain!.nodePath, Buffer.alloc(nodeBytes.length, 0x79));
    expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/toolchain file differs/);
    writeFileSync(f.toolchain!.nodePath, nodeBytes);
    const alias = `${f.toolchain!.nodePath}-hardlink`;
    linkSync(f.toolchain!.nodePath, alias);
    expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/linked/);
    rmSync(alias);
    if (process.platform !== 'win32') {
      chmodSync(f.toolchain!.nodePath, 0o777);
      expect(() => runner.inspectWorkspaceDependencyToolchain(toolchainInput)).toThrow(/writable by others/);
      chmodSync(f.toolchain!.nodePath, 0o755);
    }
    expect(runner.inspectWorkspaceDependencyToolchain(toolchainInput).executionAuthorized).toBe(false);

    const installRoot = join(parent, 'project');
    const { patched } = await syntheticInstalledWorkspace(f, prepared.capability, installRoot);
    // Synthetic recreation of pnpm's project registration; it is not evidence
    // that pnpm was invoked or confined.
    const projects = join(storeDir, 'v11/projects');
    mkdirSync(projects, { mode: 0o700 });
    symlinkSync(relative(projects, installRoot), join(projects, sha(installRoot).slice(0, 32)));
    const input = { ...base, installRoot };
    const observe = () => runner.inspectWorkspaceDependencyInstallation(input);
    const observed = observe();
    expect(observed).toMatchObject({ schema: 'aura3d.workspace-pnpm-installed-observation/1',
      installationAuthorized: false, tree: { importerCount: 3 } });
    expect(observed.tree.snapshotKeys).toHaveLength(5);
    expect(observed.store.manifestSha256).toBe(prepared.store.manifestSha256);
    expect(observed.scope).toMatch(/no package-manager execution or process isolation/);
    expect(existsSync(join(installRoot, 'DO_NOT_EXECUTE'))).toBe(false);
    expect(() => runner.inspectWorkspaceDependencyInstallation({ ...input, capability: {} as WorkspaceArchiveCapability }))
      .toThrow(/invalid workspace archive capability/);
    expect(() => runner.inspectWorkspaceDependencyInstallation({ ...input, installRoot: f.root }))
      .toThrow(/must be separate/);
    expect(runner.inspectWorkspaceDependencyInstallation({ ...input, conditionalPlatform: true }))
      .toMatchObject({ installationAuthorized: false, tree: { installationAuthorized: false } });

    // Workspace bin shims are not yet covered by this verifier. Do not mistake
    // the separately verified archive bin target for custody of a generated
    // command or silently accept an unreviewed shim.
    const shimDir = join(installRoot, 'node_modules/.bin');
    mkdirSync(shimDir);
    writeFileSync(join(shimDir, 'helper'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    expect(observe).toThrow(/invalid package name|unrecorded installed entry/);
    rmSync(shimDir, { recursive: true });

    const patchedBytes = readFileSync(join(patched, 'index.js'));
    writeFileSync(join(patched, 'index.js'), 'tampered installed patch');
    expect(observe).toThrow(/differs from reviewed archive/);
    writeFileSync(join(patched, 'index.js'), patchedBytes);

    const deferred = join(installRoot, 'packages/aura3d-cli/dist');
    mkdirSync(deferred);
    expect(observe).toThrow(/deferred workspace bin output directory exists/);
    rmSync(deferred, { recursive: true });

    const storeManifest = JSON.parse(readFileSync(join(storeDir, 'manifest.json'), 'utf8')) as {
      archives: { files: { sha512: string }[] }[];
    };
    const blob = storeManifest.archives[0].files[0].sha512;
    const blobPath = join(storeDir, 'v11/files', blob.slice(0, 2), blob.slice(2));
    const blobBytes = readFileSync(blobPath);
    writeFileSync(blobPath, 'tampered store byte');
    expect(observe).toThrow(/native store content differs/);
    writeFileSync(blobPath, blobBytes);

    expect(observe().installationAuthorized).toBe(false);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'tampered source');
    expect(observe).toThrow(/mismatch/);
  });

  it('requires an independent signed approval of the exact source, policy and reviewed workspace before seeding', async () => {
    const f = await fixture({ includeSourceRunner: true });
    const runner = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
    const admitted = f.api.verifyWorkspacePnpmAdmission({ ...f.input, allowDeferredWorkspaceBins: true });
    const base = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, capability: admitted.capability };
    const subject = f.api.workspacePnpmSourceApprovalSubject(base);
    const approvalBytes = f.signSubject(subject);
    const verified = f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes });
    expect(verified.approval).toMatchObject({ subject, keyId: f.sourceAuthority.keyId, installationAuthorized: false });
    expect(f.api.consumeWorkspacePnpmSourceApproval({ ...base, approvalCapability: verified.approvalCapability }))
      .toEqual(verified.approval);

    for (const field of ['sourceInputSha256', 'sourceManifestSha256', 'workspaceSha256', 'lockfileSha256', 'policySha256', 'admissionSha256'] as const) {
      const wrong = f.signSubject({ ...subject, [field]: '0'.repeat(64) });
      expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: wrong }), field)
        .toThrow(/does not bind the staged source, policy and admission/);
    }
    const forged = JSON.parse(approvalBytes.toString('utf8'));
    forged.signature.value = `${'A'.repeat(86)}==`;
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: Buffer.from(formatted(forged)) }))
      .toThrow(/invalid workspace source approval signature/);
    forged.signature.keyId = '0'.repeat(64);
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: Buffer.from(formatted(forged)) }))
      .toThrow(/untrusted workspace source approval authority/);
    const altered = JSON.parse(approvalBytes.toString('utf8'));
    altered.payload.reviewer.id = 'different-independent-reviewer';
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: Buffer.from(formatted(altered)) }))
      .toThrow(/invalid workspace source approval signature/);
    const unsigned = JSON.parse(approvalBytes.toString('utf8'));
    unsigned.payload.decision = 'denied';
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: Buffer.from(formatted(unsigned)) }))
      .toThrow(/invalid independent workspace source approval/);
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes: Buffer.from('{}') }))
      .toThrow(/workspace source approval/);
    expect(() => f.api.consumeWorkspacePnpmSourceApproval({ ...base, approvalCapability: {} as never }))
      .toThrow(/invalid workspace source approval capability/);
    const anotherCapability = f.api.verifyWorkspacePnpmAdmission({ ...f.input, allowDeferredWorkspaceBins: true }).capability;
    expect(() => f.api.consumeWorkspacePnpmSourceApproval({ ...base, capability: anotherCapability, approvalCapability: verified.approvalCapability }))
      .toThrow(/invalid workspace source approval capability/);

    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-signed-workspace-'))); roots.push(parent);
    const runnerInput = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, archives: f.input.archives,
      storeDir: join(parent, 'store') };
    expect(() => runner.prepareWorkspaceDependencyAdmission(runnerInput)).toThrow(/workspace source approval/);
    expect(existsSync(runnerInput.storeDir)).toBe(false);
    expect(() => runner.prepareWorkspaceDependencyAdmission({ ...runnerInput, approvalBytes: Buffer.from(formatted(forged)) }))
      .toThrow(/untrusted workspace source approval authority/);
    expect(existsSync(runnerInput.storeDir)).toBe(false);
    const prepared = runner.prepareWorkspaceDependencyAdmission({ ...runnerInput, approvalBytes });
    expect(prepared.approval.subject).toEqual(subject);
    expect(prepared.installationAuthorized).toBe(false);
    expect(() => runner.assertWorkspaceDependencyAdmission({ ...base, capability: prepared.capability, storeDir: runnerInput.storeDir,
      approvalCapability: verified.approvalCapability })).toThrow(/invalid workspace source approval capability/);
    expect(() => runner.assertWorkspaceDependencyAdmission({ ...base, capability: prepared.capability, storeDir: runnerInput.storeDir,
      approvalCapability: prepared.approvalCapability })).toThrow(/package-manager custody.*isolation/);

    // Callers cannot mutate the saved signature or keep using an approval
    // after any source byte or policy input changes.
    approvalBytes.fill(0);
    expect(f.api.consumeWorkspacePnpmSourceApproval({ ...base, approvalCapability: verified.approvalCapability }))
      .toEqual(verified.approval);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed after source approval');
    expect(() => f.api.consumeWorkspacePnpmSourceApproval({ ...base, approvalCapability: verified.approvalCapability }))
      .toThrow(/mismatch/);
  });

  it('refuses source approval when a pinned policy has no authorized reviewer', async () => {
    const f = await fixture({ withoutSourceAuthority: true });
    const { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const base = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, capability };
    const approvalBytes = f.approvalFor(capability);
    expect(() => f.api.verifyWorkspacePnpmSourceApproval({ ...base, approvalBytes }))
      .toThrow(/no independently trusted workspace source approval authority/);
  });

  it('rejects missing or mismatched policy roots and forged capabilities before trusting a source-runner store', async () => {
    for (const option of [{ noPin: true }, { badPin: true }]) {
      const f = await fixture({ ...option, includeSourceRunner: true });
      const runner = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
      const parent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-source-runner-root-'))); roots.push(parent);
      const storeDir = join(parent, 'store');
      expect(() => runner.prepareWorkspaceDependencyAdmission({ root: f.root, sourceManifestPath: f.input.sourceManifestPath,
        archives: f.input.archives, storeDir })).toThrow(option.noPin ? /no independently trusted workspace policy anchor/ : /differs from independently trusted anchor/);
      expect(existsSync(storeDir)).toBe(false);
    }
    const f = await fixture({ includeSourceRunner: true });
    const runner = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-source-runner-forgery-'))); roots.push(parent);
    const storeDir = join(parent, 'store');
    const base = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, storeDir };
    const approvalBytes = f.runnerApproval();
    expect(() => runner.assertWorkspaceDependencyAdmission({ ...base, capability: {} as WorkspaceArchiveCapability }))
      .toThrow(/invalid workspace archive capability/);
    expect(existsSync(storeDir)).toBe(false);
    const { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    expect(() => runner.inspectWorkspaceDependencyToolchain({ root: f.root, sourceManifestPath: f.input.sourceManifestPath,
      capability, toolchainRoot: parent, nodePath: join(parent, 'node') }))
      .toThrow(/no independently reviewed workspace package-manager byte policy/);
    expect(() => runner.prepareWorkspaceDependencyAdmission({ ...base, archives: f.input.archives, approvalBytes, storeDir: join(f.root, 'store') }))
      .toThrow(/store must be separate/);
    expect(existsSync(join(f.root, 'store'))).toBe(false);
    for (const path of ['node_modules', 'packages/lib/node_modules', 'packages/lib/dist', '.git']) {
      mkdirSync(join(f.root, path));
      expect(() => runner.prepareWorkspaceDependencyAdmission({ ...base, archives: f.input.archives, approvalBytes }))
        .toThrow(/preexisting dependency or build output/);
      expect(existsSync(storeDir)).toBe(false);
      rmSync(join(f.root, path), { recursive: true });
    }
    symlinkSync('missing', join(f.root, 'node_modules'));
    expect(() => runner.prepareWorkspaceDependencyAdmission({ ...base, archives: f.input.archives, approvalBytes }))
      .toThrow(/preexisting dependency or build output/);
    rmSync(join(f.root, 'node_modules'));
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed staged bytes');
    expect(() => runner.prepareWorkspaceDependencyAdmission({ ...base, archives: f.input.archives, approvalBytes }))
      .toThrow(/mismatch/);
    expect(existsSync(storeDir)).toBe(false);

    const loaded = await fixture({ includeSourceRunner: true });
    const replacement = await fixture({ includeSourceRunner: true, verifierSuffix: '\n// substituted verifier\n' });
    const loadedRunner = await import(/* @vite-ignore */ pathToFileURL(join(loaded.root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
    const otherParent = realpathSync(mkdtempSync(join(tmpdir(), 'aura-source-runner-substitution-'))); roots.push(otherParent);
    expect(() => loadedRunner.prepareWorkspaceDependencyAdmission({ root: replacement.root,
      sourceManifestPath: replacement.input.sourceManifestPath, archives: replacement.input.archives,
      approvalBytes: replacement.runnerApproval(), storeDir: join(otherParent, 'store') })).toThrow(/workspace admission implementation differs from staged source/);
    expect(existsSync(join(otherParent, 'store'))).toBe(false);

    const incomplete = await fixture({ syntheticToolchain: true, incompleteToolchainReview: true });
    const incompleteCapability = incomplete.api.verifyWorkspacePnpmAdmission(incomplete.input).capability;
    expect(() => incomplete.api.inspectWorkspacePnpmToolchain({ root: incomplete.root,
      sourceManifestPath: incomplete.input.sourceManifestPath, capability: incompleteCapability,
      toolchainRoot: incomplete.toolchain!.managerRoot, nodePath: incomplete.toolchain!.nodePath }))
      .toThrow(/invalid independent package-manager review/);
  });

  it('inspects every importer, linked workspace package, peer variant and optional platform archive without authorizing install', async () => {
    const f = await fixture(), result = f.api.inspectWorkspacePnpmGraph(f.input);
    expect(result.graph.importers.map(item => item.path)).toEqual(['.', 'packages/lib']);
    expect(result.links).toEqual([{ importer: 'packages/lib', name: '@aura3d/engine', target: '.', version: '4.7.1' }]);
    expect(result.graph.importers.find(item => item.path === 'packages/lib')?.peerDependencies).toEqual({ peer: '^4.0.0' });
    expect(result.graph.snapshots.map(item => item.key)).toContain('helper@1.2.0(peer@4.0.0)');
    expect(result.graph.packages.find(item => item.key === 'opt@3.2.1')?.os).toEqual(['linux']);
    expect(result.archives).toHaveLength(5);
    expect(result.allowedBuilds).toEqual(['helper']);
    expect(() => f.api.assertWorkspacePnpmInstallReady()).toThrow(/custody, offline store and installed-tree/);
  });

  it('requires a real pin and exact independent reviews before issuing a byte-custody capability', async () => {
    const noPin = await fixture({ noPin: true });
    expect(() => noPin.api.verifyWorkspacePnpmAdmission(noPin.input)).toThrow(/no independently trusted workspace policy anchor/);
    const badPin = await fixture({ badPin: true });
    expect(() => badPin.api.verifyWorkspacePnpmAdmission(badPin.input)).toThrow(/differs from independently trusted anchor/);
    const f = await fixture(), { capability, receipt } = f.api.verifyWorkspacePnpmAdmission(f.input);
    expect(receipt.archives).toHaveLength(5);
    expect(receipt.archives.every(item => item.files.length === 2)).toBe(true);
    expect(receipt.source.lockfileSha256).toBe(sha(f.lockText));
    expect(receipt.prerequisites.join(' ')).toMatch(/package-manager custody/);
    const first = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    expect(Buffer.from(first.lockBytes).toString('utf8')).toBe(f.lockText);
    const saved = Buffer.from(first.archives[0].bytes);
    (f.input.archives[0].bytes as Uint8Array).fill(0);
    first.archives[0].bytes.fill(0);
    const second = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    expect(Buffer.from(second.archives[0].bytes)).toEqual(saved);
  });

  it('rejects forged capabilities and changed staged source after successful review', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    expect(() => f.api.consumeWorkspacePnpmAdmission({ capability: {} as WorkspaceArchiveCapability, root: f.root,
      sourceManifestPath: f.input.sourceManifestPath })).toThrow(/invalid workspace archive capability/);
    const consumer = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/archive-admission.mjs')).href) as typeof import('../../../tools/release/archive-admission.mjs');
    expect(() => consumer.consumePnpmArchiveAdmission({ capability: capability as never,
      manifestBytes: Buffer.from('{}'), lockBytes: Buffer.from('{}') })).toThrow(/invalid admission capability/);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed after review');
    expect(() => f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root,
      sourceManifestPath: f.input.sourceManifestPath })).toThrow(/mismatch/);
  });

  it('stops serving workspace archives when staged source changes after registry creation', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const registryApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/pnpm-loopback-registry.mjs')).href) as typeof import('../../../tools/release/pnpm-loopback-registry.mjs');
    const registry = registryApi.createWorkspacePnpmLoopbackRegistry({
      capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath
    });
    const request = { method: 'GET', target: `${registry.registryPath}helper/-/helper-1.2.0.tgz` };
    expect(registry.handle(request).status).toBe(200);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed after registry creation');
    expect(() => registry.handle(request)).toThrow(/admission.*(changed|unavailable)/i);
    expect(registry.status()).toMatchObject({ closed: true, denied: 1 });
  });

  it('stores source-reviewed workspace archives privately and rejects tampering before serving', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const storeApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/offline-archive-store.mjs')).href) as typeof import('../../../tools/remote-acr/offline-archive-store.mjs');
    const registryApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/pnpm-loopback-registry.mjs')).href) as typeof import('../../../tools/release/pnpm-loopback-registry.mjs');
    const parent = mkdtempSync(join(tmpdir(), 'aura-archive-store-')); roots.push(parent);
    const input = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath, storeDir: join(parent, 'store') };
    expect(() => storeApi.createWorkspaceOfflineArchiveStore({ ...input, capability: {} as WorkspaceArchiveCapability })).toThrow(/invalid workspace archive capability/);
    expect(existsSync(input.storeDir)).toBe(false);
    const created = storeApi.createWorkspaceOfflineArchiveStore(input);
    expect(created).toMatchObject({ archiveCount: 5, blobCount: 5, installationAuthorized: false });
    const restored = storeApi.readWorkspaceOfflineArchiveStore(input);
    expect(restored.manifestSha256).toBe(created.manifestSha256);
    for (const item of f.input.archives) {
      expect(Buffer.from(restored.archives.find(entry => entry.resolved === item.resolved)!.bytes)).toEqual(Buffer.from(item.bytes));
    }
    const router = registryApi.createStoredWorkspacePnpmLoopbackRegistry(input);
    const request = { method: 'GET', target: `${router.registryPath}helper/-/helper-1.2.0.tgz` };
    expect(Buffer.from(router.handle(request).body)).toEqual(Buffer.from(f.input.archives[0].bytes));
    const file = join(input.storeDir, 'archives', `${sha(f.input.archives[0].bytes)}.tgz`);
    writeFileSync(file, 'tampered');
    expect(() => storeApi.readWorkspaceOfflineArchiveStore(input)).toThrow(/archive differs/);
    expect(() => router.handle(request)).toThrow(/admission.*(changed|unavailable)/i);
    expect(router.status()).toMatchObject({ closed: true, denied: 1 });
  });

  it('materializes all reviewed platform archives in a source-bound native pnpm v11 store', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/portable-pnpm-lock.mjs')).href) as typeof import('../../../tools/release/portable-pnpm-lock.mjs');
    const parent = mkdtempSync(join(tmpdir(), 'aura-pnpm-native-')); roots.push(parent);
    const input = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath, storeDir: join(parent, 'store') };
    expect(() => api.seedVerifiedWorkspacePnpmStore({ ...input, capability: {} as WorkspaceArchiveCapability })).toThrow(/invalid workspace archive capability/);
    expect(existsSync(input.storeDir)).toBe(false);
    const result = api.seedVerifiedWorkspacePnpmStore(input);
    expect(result).toMatchObject({ schema: 'aura3d.pnpm-native-store/1', archiveCount: 5, installationAuthorized: false });
    expect(api.verifyWorkspacePnpmNativeStore(input).manifestSha256).toBe(result.manifestSha256);
    const manifest = JSON.parse(readFileSync(join(input.storeDir, 'manifest.json'), 'utf8')) as {
      archives: { name: string; version: string; integrity: string; key: string; files: { path: string; sha512: string; mode: number }[] }[];
    };
    const optional = manifest.archives.find(item => item.name === 'opt')!;
    expect(optional.key).toBe(`${optional.integrity}\topt@3.2.1`);
    expect(optional.files.map(file => file.path)).toEqual(['index.js', 'package.json']);
    const blob = optional.files[0].sha512;
    const path = join(input.storeDir, 'v11', 'files', blob.slice(0, 2), blob.slice(2));
    expect(readFileSync(path, 'utf8')).toContain('independentFixture');
    writeFileSync(path, 'changed');
    expect(() => api.verifyWorkspacePnpmNativeStore(input)).toThrow(/native store content differs/);
  });

  it('binds post-use workspace registration and statistics to the admitted staged source', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/portable-pnpm-lock.mjs')).href) as typeof import('../../../tools/release/portable-pnpm-lock.mjs');
    const project = realpathSync(f.root), storeDir = `${project}-store`; roots.push(storeDir);
    const base = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath, storeDir };
    api.seedVerifiedWorkspacePnpmStore(base);
    const projects = join(storeDir, 'v11/projects');
    mkdirSync(projects, { mode: 0o700 });
    symlinkSync(relative(projects, project), join(projects, sha(project).slice(0, 32)));
    const db = new DatabaseSync(join(storeDir, 'v11/index.db'));
    try { db.exec('ANALYZE'); } finally { db.close(); }
    const input = { ...base, afterUse: { projectDir: project } };
    expect(api.verifyWorkspacePnpmNativeStore(input)).toMatchObject({ archiveCount: 5, installationAuthorized: false });
    writeFileSync(join(project, 'independent/pkg-0.js'), 'modified');
    expect(() => api.verifyWorkspacePnpmNativeStore(input)).toThrow(/mismatch|differs/);
  }, 30000);

  it('refuses changed native indexes, extra entries, linked bytes, unsafe parents and stale source', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/portable-pnpm-lock.mjs')).href) as typeof import('../../../tools/release/portable-pnpm-lock.mjs');
    const parent = mkdtempSync(join(tmpdir(), 'aura-pnpm-native-')); roots.push(parent);
    const base = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath };
    const existing = { ...base, storeDir: join(parent, 'existing') };
    mkdirSync(existing.storeDir); writeFileSync(join(existing.storeDir, 'sentinel'), 'preserve');
    expect(() => api.seedVerifiedWorkspacePnpmStore(existing)).toThrow();
    expect(readFileSync(join(existing.storeDir, 'sentinel'), 'utf8')).toBe('preserve');
    const index = { ...base, storeDir: join(parent, 'index') };
    api.seedVerifiedWorkspacePnpmStore(index);
    writeFileSync(join(index.storeDir, 'v11', 'index.db'), 'not sqlite');
    expect(() => api.verifyWorkspacePnpmNativeStore(index)).toThrow(/index cannot be verified|index is corrupt/);
    const extra = { ...base, storeDir: join(parent, 'extra') };
    api.seedVerifiedWorkspacePnpmStore(extra);
    writeFileSync(join(extra.storeDir, 'v11', 'unexpected'), 'not admitted');
    expect(() => api.verifyWorkspacePnpmNativeStore(extra)).toThrow(/unexpected native store entries/);
    const linked = { ...base, storeDir: join(parent, 'linked') };
    api.seedVerifiedWorkspacePnpmStore(linked);
    const manifest = JSON.parse(readFileSync(join(linked.storeDir, 'manifest.json'), 'utf8')) as {
      archives: { files: { sha512: string; mode: number }[] }[];
    };
    const file = manifest.archives[0].files[0], blob = file.sha512;
    const path = join(linked.storeDir, 'v11', 'files', blob.slice(0, 2), blob.slice(2) + ((file.mode & 0o111) ? '-exec' : ''));
    linkSync(path, join(parent, 'linked-elsewhere'));
    expect(() => api.verifyWorkspacePnpmNativeStore(linked)).toThrow(/private|unlinked/);
    if (process.platform !== 'win32') {
      const open = join(parent, 'open'); mkdirSync(open); chmodSync(open, 0o755);
      expect(() => api.seedVerifiedWorkspacePnpmStore({ ...base, storeDir: join(open, 'store') })).toThrow(/private/);
      expect(existsSync(join(open, 'store'))).toBe(false);
    }
    const stale = { ...base, storeDir: join(parent, 'stale') };
    api.seedVerifiedWorkspacePnpmStore(stale);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed');
    expect(() => api.verifyWorkspacePnpmNativeStore(stale)).toThrow(/mismatch/);
  });

  // Only register the executable conformance case when the caller explicitly
  // supplies the pinned CLI. The child is always network-denied on macOS.
  // Unregistered is not reported as a passed or skipped conformance result.
  if (process.env.AURA3D_TEST_PINNED_PNPM) it(
    'imports inert reviewed synthetic registry bytes using pnpm 11.1.3 offline', async () => {
      // This opt-in conformance test is for an explicitly supplied existing
      // pnpm CLI and a separate synthetic project, never the Aura3D workspace.
      // Run it inside an OS network-denying sandbox; --offline alone does not
      // prevent pnpm 11's independent registry-policy verification requests.
      const f = await fixture({ helperBin: { helper: 'index.js' },
        helperScripts: { preinstall: 'node -e "require(\'fs\').writeFileSync(\'unsafe-script-ran\', \'bad\')"' } });
      const { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
      const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/portable-pnpm-lock.mjs')).href) as typeof import('../../../tools/release/portable-pnpm-lock.mjs');
      const parent = mkdtempSync(join(tmpdir(), 'aura-pnpm-conformance-')); roots.push(parent);
      const project = join(parent, 'project'), home = join(parent, 'home');
      mkdirSync(project); mkdirSync(home);
      const input = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath, storeDir: join(parent, 'store') };
      api.seedVerifiedWorkspacePnpmStore(input);
      const archive = (name: string, version: string) => f.packages.find(item => item.name === name && item.version === version)!;
      writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'synthetic-project', version: '1.0.0',
        private: true, packageManager: 'pnpm@11.1.3', dependencies: { helper: '1.2.0', peer: '4.0.0' } }));
      // This configuration belongs only to the inert fixture. It does not
      // modify, relax, or authorize any product/release policy.
      writeFileSync(join(project, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 0\n');
      writeFileSync(join(project, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      helper:
        specifier: 1.2.0
        version: 1.2.0(peer@4.0.0)
      peer:
        specifier: 4.0.0
        version: 4.0.0
packages:
  helper@1.2.0:
    resolution: {integrity: ${archive('helper', '1.2.0').integrity}}
    hasBin: true
    peerDependencies:
      peer: ^4.0.0
  common@2.0.0:
    resolution: {integrity: ${archive('common', '2.0.0').integrity}}
  peer@4.0.0:
    resolution: {integrity: ${archive('peer', '4.0.0').integrity}}
  opt@3.2.1:
    resolution: {integrity: ${archive('opt', '3.2.1').integrity}}
    os: [linux]
    cpu: [x64]
snapshots:
  helper@1.2.0(peer@4.0.0):
    dependencies:
      common: 2.0.0
      peer: 4.0.0
    optionalDependencies:
      opt: 3.2.1
  common@2.0.0: {}
  peer@4.0.0: {}
  opt@3.2.1:
    optional: true
`);
      const env = { HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'),
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, CI: 'true', COREPACK_ENABLE_NETWORK: '0' };
      const cli = process.env.AURA3D_TEST_PINNED_PNPM!;
      if (process.platform !== 'darwin') throw new Error('no independently enforced network-denying sandbox for this conformance fixture');
      const run = (args: string[]) => spawnSync('/usr/bin/sandbox-exec',
        ['-p', '(version 1)(allow default)(deny network*)', process.execPath, cli, ...args],
        { cwd: project, env, encoding: 'utf8', timeout: 20000 });
      const version = run(['--version']);
      expect(version.status).toBe(0); expect(version.stdout.trim()).toBe('11.1.3');
      const installed = run(['install', '--offline', '--ignore-scripts', '--ignore-pnpmfile',
        '--frozen-lockfile', '--package-import-method=copy', '--store-dir', input.storeDir,
        '--registry=http://127.0.0.1:9/', '--reporter=append-only']);
      expect({ status: installed.status, error: installed.error?.message, output: installed.stdout + installed.stderr })
        .toMatchObject({ status: 0 });
      expect(readFileSync(join(project, 'node_modules', 'helper', 'index.js'), 'utf8'))
        .toBe('export const independentFixture = 1;\n// helper@1.2.0\n');
      expect(relative(realpathSync(join(project, 'node_modules/.pnpm')), realpathSync(join(project, 'node_modules/helper'))))
        .toBe('helper@1.2.0_peer@4.0.0/node_modules/helper');
      expect(existsSync(join(project, 'node_modules', '.bin', 'helper'))).toBe(true);
      expect(existsSync(join(project, 'unsafe-script-ran'))).toBe(false);
      expect(existsSync(join(project, 'node_modules', '.pnpm', 'opt@3.2.1'))).toBe(false);
      // Actual pnpm adds a projects symlink and SQLite statistics. They are
      // not yet modeled by the strict post-use store verifier.
      expect(() => api.verifyWorkspacePnpmNativeStore(input)).toThrow(/unexpected native store entries/);
    }, 45000);

  it('rejects undeclared store entries, symlinked archive bytes, and source changes', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/offline-archive-store.mjs')).href) as typeof import('../../../tools/remote-acr/offline-archive-store.mjs');
    const parent = mkdtempSync(join(tmpdir(), 'aura-archive-store-')); roots.push(parent);
    const base = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath };
    const extras = { ...base, storeDir: join(parent, 'extras') };
    api.createWorkspaceOfflineArchiveStore(extras);
    writeFileSync(join(extras.storeDir, 'archives', 'extra.tgz'), 'unexpected');
    expect(() => api.readWorkspaceOfflineArchiveStore(extras)).toThrow(/inventory differs/);
    const linked = { ...base, storeDir: join(parent, 'linked') };
    api.createWorkspaceOfflineArchiveStore(linked);
    const path = join(linked.storeDir, 'archives', `${sha(f.input.archives[0].bytes)}.tgz`);
    rmSync(path); symlinkSync(join(f.root, 'independent/pkg-0.js'), path);
    expect(() => api.readWorkspaceOfflineArchiveStore(linked)).toThrow(/private|unavailable/);
    const sourceChanged = { ...base, storeDir: join(parent, 'source') };
    api.createWorkspaceOfflineArchiveStore(sourceChanged);
    writeFileSync(join(f.root, 'independent/pkg-0.js'), 'changed');
    expect(() => api.readWorkspaceOfflineArchiveStore(sourceChanged)).toThrow(/mismatch/);
  });

  it('refuses existing stores, hardlinked files, changed manifests and nonprivate parents', async () => {
    const f = await fixture(), { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/remote-acr/offline-archive-store.mjs')).href) as typeof import('../../../tools/remote-acr/offline-archive-store.mjs');
    const parent = mkdtempSync(join(tmpdir(), 'aura-archive-store-')); roots.push(parent);
    const base = { capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath };
    const existing = { ...base, storeDir: join(parent, 'existing') };
    mkdirSync(existing.storeDir);
    writeFileSync(join(existing.storeDir, 'sentinel'), 'preserve');
    expect(() => api.createWorkspaceOfflineArchiveStore(existing)).toThrow();
    expect(readFileSync(join(existing.storeDir, 'sentinel'), 'utf8')).toBe('preserve');
    const linked = { ...base, storeDir: join(parent, 'hardlinked') };
    api.createWorkspaceOfflineArchiveStore(linked);
    const archive = join(linked.storeDir, 'archives', `${sha(f.input.archives[0].bytes)}.tgz`);
    linkSync(archive, join(parent, 'hardlink'));
    expect(() => api.readWorkspaceOfflineArchiveStore(linked)).toThrow(/private|unlinked/);
    const changed = { ...base, storeDir: join(parent, 'manifest') };
    api.createWorkspaceOfflineArchiveStore(changed);
    writeFileSync(join(changed.storeDir, 'manifest.json'), '{}');
    expect(() => api.readWorkspaceOfflineArchiveStore(changed)).toThrow(/manifest differs/);
    if (process.platform !== 'win32') {
      const openParent = join(parent, 'open');
      mkdirSync(openParent, { mode: 0o700 }); chmodSync(openParent, 0o755);
      expect(() => api.createWorkspaceOfflineArchiveStore({ ...base, storeDir: join(openParent, 'store') })).toThrow(/private/);
      expect(existsSync(join(openParent, 'store'))).toBe(false);
    }
  });

  it('rejects missing, extra, duplicated or changed archive bytes', async () => {
    const f = await fixture();
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, archives: f.input.archives.slice(1) })).toThrow(/missing package archive/);
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, archives: [...f.input.archives, f.input.archives[0]] })).toThrow(/duplicate or invalid archive resolution/);
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, archives: [...f.input.archives,
      { resolved: 'https://registry.npmjs.org/extra/-/extra-1.0.0.tgz', bytes: f.input.archives[0].bytes }] })).toThrow(/unused entries/);
    const changed = [...f.input.archives]; changed[0] = { ...changed[0], bytes: f.input.archives[1].bytes };
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, archives: changed })).toThrow(/integrity mismatch/);
  });

  it('rejects an incomplete file-level review and missing evidence even when the policy is pinned', async () => {
    const missing = await fixture({ review: review => { review.files.pop(); } });
    expect(() => missing.api.verifyWorkspacePnpmAdmission(missing.input)).toThrow(/does not cover every archive file/);
    const noEvidence = await fixture({ review: review => { review.files[0].evidence = []; } });
    expect(() => noEvidence.api.verifyWorkspacePnpmAdmission(noEvidence.input)).toThrow(/requires sources and evidence/);
  });

  it.each([
    ['patches', (value: string) => `${value}\npatchedDependencies:\n  helper@1.2.0: deadbeef\n`, /patches differ from lock/],
    ['overrides', (value: string) => `${value}\noverrides:\n  helper: 1.3.0\n`, /overrides/],
    ['a second importer', (value: string) => value.replace('  packages/lib:\n', '  packages/unknown: {}\n  packages/lib:\n'), /importers differ/],
    ['a changed workspace link', (value: string) => value.replace('version: link:../..', 'version: link:../other'), /workspace link identity mismatch/],
    ['an unsupported registry tag', (value: string) => value.replace('specifier: ^1.0.0', 'specifier: latest'), /differs from staged manifest/],
    ['a missing optional edge', (value: string) => value.replace('    optionalDependencies:\n      opt: 3.2.1\n', '    optionalDependencies: {}\n'), /missing snapshot optional dependency/],
    ['a changed platform constraint', (value: string) => value.replace('    os: [linux]', '    os: [darwin]'), /archive os metadata differs/],
    ['duplicate YAML keys', (value: string) => `${value}\nlockfileVersion: '9.0'\n`, /duplicate workspace lock key/]
  ] as const)('fails closed for %s', async (_label, change, expected) => {
    const f = await fixture({ lock: change });
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(expected);
  });

  it('rejects unmodeled workspace config and importer manifest changes', async () => {
    const patch = await fixture({ config: value => `${value}\npatchedDependencies:\n  helper@1.2.0: patches/helper.patch\n` });
    expect(() => patch.api.inspectWorkspacePnpmGraph(patch.input)).toThrow(/patches differ from lock/);
    const changed = await fixture({ childManifest: value => ({ ...value, devDependencies: { '@aura3d/engine': 'workspace:^9.0.0' } }) });
    expect(() => changed.api.inspectWorkspacePnpmGraph(changed.input)).toThrow(/differs from staged manifest/);
    const extglob = await fixture({ config: value => value.replace('  - "packages/*"', '  - "packages/@(lib|extra)"') });
    expect(() => extglob.api.inspectWorkspacePnpmGraph(extglob.input)).toThrow(/unsupported workspace package pattern/);
  });

  it('rejects package-manager configuration in an intermediate workspace ancestor', async () => {
    const f = await fixture();
    writeFileSync(join(f.root, 'packages/.npmrc'), 'registry=https://example.invalid\n');
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(/configuration or hook is unsupported/);
  });

  it.each([
    '.pnpmfile.mjs',
    'pnpmfile.mjs',
    'packages/.pnpmfile.mjs',
    'packages/lib/pnpmfile.mjs'
  ])('rejects a staged pnpm hook before any package-manager startup: %s', async hookPath => {
    const f = await fixture({ hookPath });
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(/configuration or hook is unsupported/);
  });

  it('accepts only archive and workspace bins bound to existing regular files', async () => {
    const f = await fixture({ helperBin: { helper: './index.js' }, childBin: './bin.js', sourceBin: 'regular' });
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).not.toThrow();
    expect(() => f.api.verifyWorkspacePnpmAdmission(f.input)).not.toThrow();
  });

  it.each(['../outside.js', '/outside.js', 'C:/outside.js', '././index.js', 'missing.js'])
    ('rejects an escaping or missing archive bin target: %s', async helperBin => {
      const f = await fixture({ helperBin });
      expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(/archive bin target/);
    });

  it('rejects archive bin enumeration, malformed command names, and symlink tar entries', async () => {
    const directory = await fixture({ helperDirectoriesBin: 'bin' });
    expect(() => directory.api.inspectWorkspacePnpmGraph(directory.input)).toThrow(/directories\.bin is unsupported/);
    const malformed = await fixture({ helperBin: { '../outside': './index.js' } });
    expect(() => malformed.api.inspectWorkspacePnpmGraph(malformed.input)).toThrow(/invalid archive bin name/);
    const symlink = await fixture({ helperBin: 'bin.js', archiveSymlink: true });
    expect(() => symlink.api.inspectWorkspacePnpmGraph(symlink.input)).toThrow(/unsupported tar entry type/);
  });

  it('rejects missing or symlinked workspace bin targets even when declared by the source manifest', async () => {
    const missing = await fixture({ childBin: 'bin.js' });
    expect(() => missing.api.inspectWorkspacePnpmGraph(missing.input)).toThrow(/workspace bin target/);
    const symlink = await fixture({ childBin: 'bin.js', sourceBin: 'symlink' });
    expect(() => symlink.api.inspectWorkspacePnpmGraph(symlink.input)).toThrow(/workspace bin target/);
  });

  it.each([
    ['aura', 'packages/aura3d-cli', '@aura3d/cli', ['aura', 'aura3d', 'cli']],
    ['create', 'packages/create-aura3d', 'create-aura3d', ['create-aura3d']]
  ] as const)('records the explicitly enabled, source-bound %s CLI output without authorizing it', async (deferredCli, importer, name, commands) => {
    const f = await fixture({ deferredCli });
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(/workspace bin target/);
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, allowDeferredWorkspaceBins: false })).toThrow(/workspace bin target/);
    const input = { ...f.input, allowDeferredWorkspaceBins: true };
    const result = f.api.inspectWorkspacePnpmGraph(input);
    const expected = { importer, name, manifestSha256: sha(readFileSync(join(f.root, importer, 'package.json'))),
      commands, target: 'dist/cli.js', source: { path: `${importer}/src/cli.ts`, sha256: sha('export const fixtureCli = true;\n') } };
    expect(result.deferredBins).toEqual([expected]);
    const { capability, receipt } = f.api.verifyWorkspacePnpmAdmission(input);
    expect(receipt.deferredBins).toEqual([expected]);
    expect(Object.isFrozen(receipt.deferredBins[0].source)).toBe(true);
    expect(receipt.prerequisites.join(' ')).toMatch(/output bytes.*remain unverified/);
    const first = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    expect(first.deferredBins).toEqual([expected]);
    (first.deferredBins[0].commands as string[])[0] = 'changed';
    (first.deferredBins[0].source as { path: string; sha256: string }).sha256 = '0'.repeat(64);
    expect(f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath }).deferredBins).toEqual([expected]);
    expect(() => f.api.assertWorkspacePnpmInstallReady()).toThrow(/custody, offline store and installed-tree/);
  });

  it('binds both CLI importers to one staged graph and rechecks each deferred output', async () => {
    const f = await fixture({ deferredCli: 'aura', bothDeferredClis: true });
    const input = { ...f.input, allowDeferredWorkspaceBins: true };
    const result = f.api.inspectWorkspacePnpmGraph(input);
    expect(result.graph.importers.map(item => item.path)).toEqual(['.', 'packages/aura3d-cli', 'packages/create-aura3d']);
    expect(result.deferredBins.map(item => item.importer)).toEqual(['packages/aura3d-cli', 'packages/create-aura3d']);
    const { capability } = f.api.verifyWorkspacePnpmAdmission(input);
    expect(f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root,
      sourceManifestPath: f.input.sourceManifestPath }).deferredBins).toHaveLength(2);
    mkdirSync(join(f.root, 'packages/create-aura3d/dist'));
    expect(() => f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root,
      sourceManifestPath: f.input.sourceManifestPath })).toThrow(/output directory exists/);
  });

  it.each([
    ['wrong importer', { deferredCli: 'aura', childDir: 'packages/lib' }],
    ['wrong package name', { deferredCli: 'aura', childManifest: (value: Record<string, unknown>) => ({ ...value, name: '@aura3d/other' }) }],
    ['missing command', { deferredCli: 'aura', childBin: { aura3d: 'dist/cli.js', aura: 'dist/cli.js' } }],
    ['extra command', { deferredCli: 'aura', childBin: { aura3d: 'dist/cli.js', aura: 'dist/cli.js', cli: 'dist/cli.js', extra: 'dist/cli.js' } }],
    ['changed target', { deferredCli: 'create', childBin: { 'create-aura3d': 'dist/other.js' } }],
    ['escaping target', { deferredCli: 'create', childBin: { 'create-aura3d': '../dist/cli.js' } }]
  ] as Array<[string, FixtureOptions]>)('does not defer an unlisted workspace bin: %s', async (_label, options) => {
    const f = await fixture(options);
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, allowDeferredWorkspaceBins: true })).toThrow(/workspace bin target/);
  });

  it('requires a boolean opt-in and continues to reject unrelated archive and workspace bins', async () => {
    const invalid = await fixture({ deferredCli: 'aura' });
    expect(() => invalid.api.inspectWorkspacePnpmGraph({ ...invalid.input, allowDeferredWorkspaceBins: 'yes' as unknown as boolean })).toThrow(/invalid deferred workspace bin opt-in/);
    const archiveBin = await fixture({ deferredCli: 'aura', helperBin: 'missing.js' });
    expect(() => archiveBin.api.inspectWorkspacePnpmGraph({ ...archiveBin.input, allowDeferredWorkspaceBins: true })).toThrow(/archive bin target/);
    const otherBin = await fixture({ childBin: 'missing.js' });
    expect(() => otherBin.api.inspectWorkspacePnpmGraph({ ...otherBin.input, allowDeferredWorkspaceBins: true })).toThrow(/workspace bin target/);
    const noPin = await fixture({ deferredCli: 'aura', noPin: true });
    expect(() => noPin.api.verifyWorkspacePnpmAdmission({ ...noPin.input, allowDeferredWorkspaceBins: true })).toThrow(/no independently trusted workspace policy anchor/);
  });

  it.each(['missing', 'symlink'] as const)('requires the staged CLI entry point to be a regular file: %s', async deferredSource => {
    const f = await fixture({ deferredCli: 'aura', deferredSource });
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, allowDeferredWorkspaceBins: true })).toThrow(/deferred workspace bin source/);
  });

  it.each(['directory', 'file', 'symlink', 'dangling symlink'] as const)('rejects a pre-existing excluded output ancestor: %s', async kind => {
    const f = await fixture({ deferredCli: 'create' }), dist = join(f.root, 'packages/create-aura3d/dist');
    if (kind === 'directory') mkdirSync(dist);
    else if (kind === 'file') writeFileSync(dist, 'not an admitted output');
    else symlinkSync(kind === 'symlink' ? 'src' : 'missing', dist);
    expect(() => f.api.inspectWorkspacePnpmGraph({ ...f.input, allowDeferredWorkspaceBins: true })).toThrow(/output directory exists/);
  });

  it('rechecks excluded output absence and staged source when a capability is consumed', async () => {
    const output = await fixture({ deferredCli: 'aura' });
    const outputCapability = output.api.verifyWorkspacePnpmAdmission({ ...output.input, allowDeferredWorkspaceBins: true }).capability;
    mkdirSync(join(output.root, 'packages/aura3d-cli/dist'));
    expect(() => output.api.consumeWorkspacePnpmAdmission({ capability: outputCapability, root: output.root,
      sourceManifestPath: output.input.sourceManifestPath })).toThrow(/output directory exists/);

    const source = await fixture({ deferredCli: 'create' });
    const sourceCapability = source.api.verifyWorkspacePnpmAdmission({ ...source.input, allowDeferredWorkspaceBins: true }).capability;
    writeFileSync(join(source.root, 'packages/create-aura3d/src/cli.ts'), 'changed after admission');
    expect(() => source.api.consumeWorkspacePnpmAdmission({ capability: sourceCapability, root: source.root,
      sourceManifestPath: source.input.sourceManifestPath })).toThrow(/mismatch/);

    const manifest = await fixture({ deferredCli: 'aura' });
    const manifestCapability = manifest.api.verifyWorkspacePnpmAdmission({ ...manifest.input, allowDeferredWorkspaceBins: true }).capability;
    writeFileSync(join(manifest.root, 'packages/aura3d-cli/package.json'), '{}\n');
    expect(() => manifest.api.consumeWorkspacePnpmAdmission({ capability: manifestCapability, root: manifest.root,
      sourceManifestPath: manifest.input.sourceManifestPath })).toThrow(/mismatch/);
  });

  it('requires the verifier file at the module path to match the staged source', async () => {
    const loaded = await fixture({ deferredCli: 'aura' });
    const staged = await fixture({ deferredCli: 'aura', verifierSuffix: '\n// Different synthetic staged verifier.\n' });
    expect(() => loaded.api.inspectWorkspacePnpmGraph({ ...staged.input, allowDeferredWorkspaceBins: true })).toThrow(/deferred-bin verifier differs/);
  });

  it('models a source-bound reviewed patch, exact direct-parent override and absent optional tag peer without changing original archive bytes', async () => {
    const f = await fixture({ actualForms: true }), inspected = f.api.inspectWorkspacePnpmGraph(f.input);
    expect(inspected.patches).toHaveLength(1);
    expect(inspected.patches[0].snapshotKeys).toEqual([`helper@1.2.0(patch_hash=${sha(readFileSync(join(f.root, 'patches/helper.patch'))) })(peer@4.0.0)`]);
    expect(Buffer.from(inspected.patches[0].files[0].bytes).toString('utf8')).toContain('independentFixture = 2');
    expect(inspected.overrides).toEqual([{ selector: 'helper>common', parent: 'helper', dependency: 'common', version: '2.0.0', affectedPackages: ['helper@1.2.0'] }]);
    expect(inspected.unresolvedOptionalPeers).toEqual([{ packageKey: 'helper@1.3.0', name: 'optional-tag', specifier: 'latest', snapshotKeys: ['helper@1.3.0'] }]);
    const { capability, receipt } = f.api.verifyWorkspacePnpmAdmission(f.input);
    expect(receipt.patches[0].files[0].before.executable).toBe(0);
    expect(receipt.patches[0].files[0].after.executable).toBe(0);
    const consumed = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    const original = consumed.archives.find(item => item.name === 'helper' && item.version === '1.2.0');
    expect(original?.sha256).toBe(f.packages[0].sha256);
    expect(Buffer.from(consumed.patches[0].files[0].bytes).toString('utf8')).toContain('independentFixture = 2');
    consumed.patches[0].files[0].bytes.fill(0);
    const again = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    expect(Buffer.from(again.patches[0].files[0].bytes).toString('utf8')).toContain('independentFixture = 2');
    expect(() => f.api.assertWorkspacePnpmInstallReady()).toThrow(/custody, offline store and installed-tree/);
  });

  it('checks a reviewed patch through a genuine capability and synthetic installed tree without running pnpm', async () => {
    const f = await fixture({ actualForms: true, noPlatform: true });
    const { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const admitted = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    const modes = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/admitted-archive-modes.mjs')).href) as typeof import('../../../tools/release/admitted-archive-modes.mjs');
    const installed = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/pnpm-installed-tree.mjs')).href) as typeof import('../../../tools/release/pnpm-installed-tree.mjs');
    const directories = new Map<string, string>();
    const write = (path: string, bytes: Uint8Array | string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
    const link = (path: string, target: string) => {
      mkdirSync(dirname(path), { recursive: true }); symlinkSync(relative(dirname(path), target), path, 'dir');
    };
    for (const item of admitted.archives) {
      const directory = join(f.root, 'node_modules/.pnpm', fixtureStoreName(admitted.graph, item.name, item.version), 'node_modules', item.name);
      directories.set(`${item.name}@${item.version}`, directory);
      for (const file of modes.inspectAdmittedArchiveFiles(item.bytes).files) write(join(directory, file.path), file.bytes);
    }
    const get = (key: string): string => {
      const path = directories.get(key); if (!path) throw new Error(`missing synthetic package ${key}`); return path;
    };
    const patched = get('helper@1.2.0'), other = get('helper@1.3.0'), common = get('common@2.0.0');
    const peer = get('peer@4.0.0'), optional = get('opt@3.2.1');
    write(join(patched, 'index.js'), admitted.patches[0].files[0].bytes);
    write(join(f.root, 'node_modules/.pnpm/lock.yaml'), f.lockText);
    link(join(f.root, 'node_modules/helper'), patched);
    link(join(f.root, 'packages/lib/node_modules/helper-alias'), other);
    link(join(f.root, 'packages/lib/node_modules/peer'), peer);
    link(join(f.root, 'packages/lib/node_modules/opt'), optional);
    link(join(f.root, 'packages/lib/node_modules/@aura3d/engine'), f.root);
    link(join(dirname(patched), 'common'), common);
    link(join(dirname(patched), 'peer'), peer);
    link(join(dirname(patched), 'opt'), optional);
    const verify = () => installed.verifyInstalledPnpmWorkspace({ root: f.root, sourceManifestPath: f.input.sourceManifestPath,
      capability, installRoot: f.root });
    const report = verify();
    expect(report.importerCount).toBe(2);
    expect(report.snapshotKeys).toContain(admitted.patches[0].snapshotKeys[0]);
    write(join(patched, 'index.js'), 'altered output\n');
    expect(verify).toThrow(/differs from reviewed archive/);
  });

  it('conditionally verifies platform omissions with a real source-bound capability and reviewed patch', async () => {
    const f = await fixture({ actualForms: true });
    const { capability } = f.api.verifyWorkspacePnpmAdmission(f.input);
    const admitted = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    const modes = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/admitted-archive-modes.mjs')).href) as typeof import('../../../tools/release/admitted-archive-modes.mjs');
    const installed = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/pnpm-installed-tree.mjs')).href) as typeof import('../../../tools/release/pnpm-installed-tree.mjs');
    const directories = new Map<string, string>(), includeOptional = process.platform === 'linux' && process.arch === 'x64';
    const write = (path: string, bytes: Uint8Array | string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
    const link = (path: string, target: string) => { mkdirSync(dirname(path), { recursive: true }); symlinkSync(relative(dirname(path), target), path, 'dir'); };
    for (const item of admitted.archives) {
      if (item.name === 'opt' && !includeOptional) continue;
      const directory = join(f.root, 'node_modules/.pnpm', fixtureStoreName(admitted.graph, item.name, item.version), 'node_modules', item.name);
      directories.set(`${item.name}@${item.version}`, directory);
      for (const file of modes.inspectAdmittedArchiveFiles(item.bytes).files) write(join(directory, file.path), file.bytes);
    }
    const get = (key: string): string => {
      const path = directories.get(key); if (!path) throw new Error(`missing synthetic package ${key}`); return path;
    };
    const patched = get('helper@1.2.0'), other = get('helper@1.3.0'), common = get('common@2.0.0'), peer = get('peer@4.0.0');
    write(join(patched, 'index.js'), admitted.patches[0].files[0].bytes);
    write(join(f.root, 'node_modules/.pnpm/lock.yaml'), f.lockText);
    link(join(f.root, 'node_modules/helper'), patched);
    link(join(f.root, 'packages/lib/node_modules/helper-alias'), other);
    link(join(f.root, 'packages/lib/node_modules/peer'), peer);
    link(join(f.root, 'packages/lib/node_modules/@aura3d/engine'), f.root);
    link(join(dirname(patched), 'common'), common); link(join(dirname(patched), 'peer'), peer);
    if (includeOptional) {
      link(join(f.root, 'packages/lib/node_modules/opt'), get('opt@3.2.1'));
      link(join(dirname(patched), 'opt'), get('opt@3.2.1'));
    }
    const input = { root: f.root, sourceManifestPath: f.input.sourceManifestPath, capability, installRoot: f.root };
    const result = installed.verifyInstalledPnpmWorkspaceForPlatform(input);
    expect(result.installationAuthorized).toBe(false);
    expect(result.snapshotKeys).toContain(admitted.patches[0].snapshotKeys[0]);
    expect(result.omittedSnapshotKeys).toEqual(includeOptional ? [] : ['opt@3.2.1']);
    if (!includeOptional) expect(() => installed.verifyInstalledPnpmWorkspace(input)).toThrow(/missing installed dependency entry/);
    write(join(f.root, 'independent/pkg-4.js'), 'changed after review');
    expect(() => installed.verifyInstalledPnpmWorkspaceForPlatform(input)).toThrow(/mismatch/);
  });

  it('checks deferred outputs in a separate installed root using a genuine capability', async () => {
    const f = await fixture({ actualForms: true, noPlatform: true, deferredCli: 'aura', bothDeferredClis: true });
    const { capability } = f.api.verifyWorkspacePnpmAdmission({ ...f.input, allowDeferredWorkspaceBins: true });
    const admitted = f.api.consumeWorkspacePnpmAdmission({ capability, root: f.root, sourceManifestPath: f.input.sourceManifestPath });
    expect(admitted.deferredBins).toHaveLength(2);
    const installRoot = mkdtempSync(join(tmpdir(), 'aura-installed-copy-')); roots.push(installRoot);
    cpSync(f.root, installRoot, { recursive: true });

    const modes = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/admitted-archive-modes.mjs')).href) as typeof import('../../../tools/release/admitted-archive-modes.mjs');
    const installed = await import(/* @vite-ignore */ pathToFileURL(join(f.root, 'tools/release/pnpm-installed-tree.mjs')).href) as typeof import('../../../tools/release/pnpm-installed-tree.mjs');
    const directories = new Map<string, string>();
    const write = (path: string, bytes: Uint8Array | string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
    const link = (path: string, target: string) => {
      mkdirSync(dirname(path), { recursive: true }); symlinkSync(relative(dirname(path), target), path, 'dir');
    };
    for (const item of admitted.archives) {
      const directory = join(installRoot, 'node_modules/.pnpm', fixtureStoreName(admitted.graph, item.name, item.version), 'node_modules', item.name);
      directories.set(`${item.name}@${item.version}`, directory);
      for (const file of modes.inspectAdmittedArchiveFiles(item.bytes).files) write(join(directory, file.path), file.bytes);
    }
    const get = (key: string): string => {
      const path = directories.get(key); if (!path) throw new Error(`missing synthetic package ${key}`); return path;
    };
    const patched = get('helper@1.2.0'), other = get('helper@1.3.0'), common = get('common@2.0.0');
    const peer = get('peer@4.0.0'), optional = get('opt@3.2.1');
    write(join(patched, 'index.js'), admitted.patches[0].files[0].bytes);
    write(join(installRoot, 'node_modules/.pnpm/lock.yaml'), f.lockText);
    link(join(installRoot, 'node_modules/helper'), patched);
    link(join(installRoot, 'packages/aura3d-cli/node_modules/helper-alias'), other);
    link(join(installRoot, 'packages/aura3d-cli/node_modules/peer'), peer);
    link(join(installRoot, 'packages/aura3d-cli/node_modules/opt'), optional);
    link(join(installRoot, 'packages/aura3d-cli/node_modules/@aura3d/engine'), installRoot);
    link(join(dirname(patched), 'common'), common);
    link(join(dirname(patched), 'peer'), peer);
    link(join(dirname(patched), 'opt'), optional);
    const verify = () => installed.verifyInstalledPnpmWorkspace({ root: f.root, sourceManifestPath: f.input.sourceManifestPath,
      capability, installRoot });
    expect(verify().importerCount).toBe(3);

    for (const importer of ['packages/aura3d-cli', 'packages/create-aura3d']) {
      const output = join(installRoot, importer, 'dist');
      for (const kind of ['file', 'empty directory', 'nonempty directory', 'symlink', 'dangling symlink'] as const) {
        if (kind === 'file') write(output, 'unreviewed');
        else if (kind === 'empty directory') mkdirSync(output);
        else if (kind === 'nonempty directory') write(join(output, 'cli.js'), 'unreviewed');
        else symlinkSync(kind === 'symlink' ? 'src' : 'missing', output);
        expect(verify, `${importer}: ${kind}`).toThrow(/deferred workspace bin output directory exists/);
        rmSync(output, { recursive: true, force: true });
      }
      expect(() => lstatSync(join(f.root, importer, 'dist'))).toThrow(/ENOENT/);
    }
    expect(verify().importerCount).toBe(3);
    mkdirSync(join(f.root, 'packages/create-aura3d/dist'));
    expect(verify).toThrow(/deferred workspace bin output directory exists/);
    expect(() => f.api.assertWorkspacePnpmInstallReady()).toThrow(/custody, offline store and installed-tree/);
  });

  it('requires independently reviewed exact patch output before byte custody', async () => {
    const missing = await fixture({ actualForms: true, omitPatchReview: true });
    expect(() => missing.api.verifyWorkspacePnpmAdmission(missing.input)).toThrow(/no independently reviewed patch output/);
    const wrong = await fixture({ actualForms: true, wrongPatchOutput: true });
    expect(() => wrong.api.verifyWorkspacePnpmAdmission(wrong.input)).toThrow(/reviewed patch output differs/);
  });

  it('rejects changed patch input, nonmatching context and unmodeled file operations', async () => {
    const digest = await fixture({ actualForms: true, lock: value => value.replace(/(patchedDependencies:\n  helper@1\.2\.0: )[a-f0-9]{64}/, `$1${'0'.repeat(64)}`) });
    expect(() => digest.api.inspectWorkspacePnpmGraph(digest.input)).toThrow(/patch hash differs from lock/);
    const context = await fixture({ actualForms: true, patch: value => value.replace('-export const independentFixture = 1;', '-export const independentFixture = 9;') });
    expect(() => context.api.inspectWorkspacePnpmGraph(context.input)).toThrow(/patch context differs/);
    const creation = await fixture({ actualForms: true, patch: value => value.replace('--- a/index.js', '--- /dev/null') });
    expect(() => creation.api.inspectWorkspacePnpmGraph(creation.input)).toThrow(/must modify an existing file/);
  });

  it('does not coerce an optional registry tag when any snapshot resolves it', async () => {
    const f = await fixture({ actualForms: true, lock: value => value.replace('  helper@1.3.0: {}\n',
      '  helper@1.3.0:\n    optionalDependencies:\n      optional-tag: 1.0.0\n') });
    expect(() => f.api.inspectWorkspacePnpmGraph(f.input)).toThrow(/optional tag peer is resolved or bound/);
  });

  it('rejects broad override selectors and mismatched configuration/lock rules', async () => {
    const global = await fixture({ actualForms: true,
      config: value => value.replace("'helper>common'", 'common'),
      lock: value => value.replace("'helper>common'", 'common') });
    expect(() => global.api.inspectWorkspacePnpmGraph(global.input)).toThrow(/unsupported workspace override selector/);
    const mismatch = await fixture({ actualForms: true, lock: value => value.replace("'helper>common': 2.0.0", "'helper>common': 9.0.0") });
    expect(() => mismatch.api.inspectWorkspacePnpmGraph(mismatch.input)).toThrow(/workspace overrides differ from lock/);
  });
});

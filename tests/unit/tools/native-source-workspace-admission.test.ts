import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const repository = resolve(import.meta.dirname, '../../..');
const temporary: string[] = [];
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const formatted = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const stable = (value: unknown) => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
function temp() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'a3d-source-admission-')));
  temporary.push(dir);
  return dir;
}
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** Inert tar bytes only: this test never invokes a package manager or package code. */
function archive(files: Array<{ path: string; data: string }>) {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const data = Buffer.from(file.data), header = Buffer.alloc(512);
    header.write(`package/${file.path}`, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii');
    header.fill(32, 148, 156); header[156] = '0'.charCodeAt(0); header.write('ustar\0', 257, 6, 'ascii');
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

/**
 * The key, reviews, archive, and optional pin exist solely in a disposable
 * copy. They are not production policy, evidence, or install authorization.
 */
async function fixture(pinned = true) {
  const root = temp(), storeParent = temp(), files = new Set<string>();
  const put = (path: string, data: string | Uint8Array, staged = true) => {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, data);
    if (staged) files.add(path);
  };
  for (const path of [
    'tools/release/portable-npm-lock.mjs', 'tools/release/portable-pnpm-lock.mjs',
    'tools/release/source-identity.mjs', 'tools/release/release-inventory.mjs',
    'tools/release/archive-admission.mjs', 'tools/release/admitted-archive-modes.mjs',
    'tools/release/pnpm-installed-tree.mjs', 'tools/remote-acr/source-checks.mjs',
    'tools/remote-acr/portable-inputs.mjs', 'tools/remote-acr/source-resume.mjs',
    'tools/native-source-inventory/index.mjs'
  ]) put(path, readFileSync(join(repository, path)));

  const packageJson = JSON.stringify({ name: 'helper', version: '1.0.0',
    scripts: { preinstall: 'node -e "require(\'fs\').writeFileSync(\'DO_NOT_EXECUTE\', \'bad\')"' } });
  const code = 'export const inertSyntheticPackage = true;\n';
  const archiveBytes = archive([{ path: 'package.json', data: packageJson }, { path: 'index.js', data: code }]);
  const integrity = `sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;
  const identity = { name: 'helper', version: '1.0.0', sha256: sha(archiveBytes), integrity };
  const evidence = 'Synthetic independent review evidence; no real dependency is reviewed.\n';
  put('independent/package.json', packageJson);
  put('independent/index.js', code);
  put('independent/evidence.txt', evidence);
  const reviewed = (path: string, data: string, source: string) => ({
    path, sha256: sha(data), size: Buffer.byteLength(data), origin: 'source-match',
    sources: [{ path: source, sha256: sha(data) }],
    evidence: [{ path: 'independent/evidence.txt', sha256: sha(evidence) }],
    rationale: 'The synthetic fixture reviewer checked this complete file against its separately recorded fixture source.'
  });
  const review = { schema: 'aura3d.archive-review/1', archive: identity, decision: 'approved',
    scope: 'complete-archive', reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' },
    files: [reviewed('package.json', packageJson, 'independent/package.json'),
      reviewed('index.js', code, 'independent/index.js')] };
  const reviewBytes = formatted(review);
  put('independent/review.json', reviewBytes);
  put('package.json', formatted({ name: '@aura3d/engine', version: '4.7.1',
    packageManager: 'pnpm@11.1.3', dependencies: { helper: '1.0.0' } }));
  put('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
  const lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      helper:
        specifier: 1.0.0
        version: 1.0.0
packages:
  helper@1.0.0:
    resolution: {integrity: ${integrity}}
snapshots:
  helper@1.0.0: {}
`;
  put('pnpm-lock.yaml', lock);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  const keyId = sha(publicDer);
  const policy = formatted({ schema: 'aura3d.workspace-archive-policy/1',
    admissions: [{ archive: identity, review: { path: 'independent/review.json', sha256: sha(reviewBytes) } }],
    sourceAuthorities: [{ keyId, spkiDerBase64: publicDer.toString('base64') }] });
  put('tools/release/workspace-archive-admission-policy.json', policy);
  let verifier = readFileSync(join(repository, 'tools/release/workspace-pnpm-admission.mjs'), 'utf8');
  const unsetPin = 'const TRUSTED_WORKSPACE_POLICY_SHA256 = null;';
  if (!verifier.includes(unsetPin)) throw new Error('fixture expects the unconfigured production policy');
  if (pinned) verifier = verifier.replace(unsetPin, `const TRUSTED_WORKSPACE_POLICY_SHA256 = '${sha(policy)}';`);
  put('tools/release/workspace-pnpm-admission.mjs', verifier);
  const entries = [...files].sort().map(path => ({
    path, type: 'file', mode: '100644', sha256: sha(readFileSync(join(root, path)))
  }));
  const sourceManifestPath = '.native-source-manifest.json';
  const manifest = { schema: 'aura3d.native-source-manifest/1',
    origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
    files: entries, administrativeFiles: [], lockfileSha256: sha(lock), inputDigest: sha(stable(entries)) };
  put(sourceManifestPath, formatted(manifest), false);
  const api = await import(/* @vite-ignore */ pathToFileURL(join(root, 'tools/release/workspace-pnpm-admission.mjs')).href) as typeof import('../../../tools/release/workspace-pnpm-admission.mjs');
  const runner = await import(/* @vite-ignore */ pathToFileURL(join(root, 'tools/remote-acr/source-checks.mjs')).href) as typeof import('../../../tools/remote-acr/source-checks.mjs');
  const archives = [{ resolved: 'https://registry.npmjs.org/helper/-/helper-1.0.0.tgz', bytes: archiveBytes }];
  const input = { root, sourceManifestPath, archives };
  const storeDir = join(storeParent, 'store');
  const prepare = (destination = storeDir) => {
    const { capability } = api.verifyWorkspacePnpmAdmission({ ...input, allowDeferredWorkspaceBins: true });
    const subject = api.workspacePnpmSourceApprovalSubject({ root, sourceManifestPath, capability });
    const payload = { schema: 'aura3d.workspace-source-approval/1', subject, decision: 'approved',
      scope: 'workspace-dependency-inputs', reviewer: { id: 'test-independent-reviewer', kind: 'independent-source-review' } };
    const value = sign(null, Buffer.from(`aura3d.workspace-source-approval/1\0${stable(payload)}`), privateKey).toString('base64');
    const approvalBytes = Buffer.from(formatted({ schema: 'aura3d.workspace-source-approval-envelope/1', payload,
      signature: { algorithm: 'ed25519', keyId, value } }));
    const prepared = runner.prepareWorkspaceDependencyAdmission({ ...input, storeDir: destination, approvalBytes });
    return { prepared, ready: { root, sourceManifestPath, capability: prepared.capability,
      approvalCapability: prepared.approvalCapability, storeDir: destination } };
  };
  return { root, storeParent, storeDir, runner, input, prepare, sourceManifestPath };
}

function sourceEnv(phase = 'prepare') {
  return { NATIVE_RUN_ID: 'synthetic', NATIVE_REPORT_DIR: 'tests/reports/native-capabilities/synthetic',
    NATIVE_RELEASE_KIND: 'patch', NATIVE_SOURCE_PHASE: phase, AURA3D_SOURCE_MANIFEST: '.native-source-manifest.json' };
}

describe('source runner live workspace admission handoff', () => {
  it('uses both live capabilities for either source phase but never authorizes execution', async () => {
    const f = await fixture(), { prepared, ready } = f.prepare();
    expect(prepared.installationAuthorized).toBe(false);
    expect(prepared.approval.installationAuthorized).toBe(false);
    expect(prepared.store.installationAuthorized).toBe(false);
    const denial = /WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE:.*package-manager custody.*process\/network isolation/;
    expect(() => f.runner.assertSourceWorkspaceAdmission(f.root, ready)).toThrow(denial);
    for (const phase of ['prepare', 'resume']) {
      expect(() => f.runner.runSource(f.root, sourceEnv(phase), ready), phase).toThrow(denial);
    }
    expect(() => f.runner.runSource(f.root, { ...sourceEnv(), AURA3D_SOURCE_MANIFEST: 'other.json' }, ready))
      .toThrow(/invalid source job environment/);
    expect(() => f.runner.runSource(f.root, sourceEnv(), { ...ready,
      toolchainRoot: f.storeParent, nodePath: join(f.storeParent, 'node') }))
      .toThrow(/no independently reviewed workspace package-manager byte policy/);
    expect(existsSync(join(f.root, 'DO_NOT_EXECUTE'))).toBe(false);
    expect(existsSync(join(f.root, 'tests/reports/native-capabilities/synthetic'))).toBe(false);
  });

  it('fails closed without an explicit live input and does not read admission from env or CLI', async () => {
    const f = await fixture();
    const env = { ...sourceEnv(), AURA3D_SKIP_WORKSPACE_ADMISSION: '1',
      AURA3D_WORKSPACE_APPROVAL: 'synthetic', AURA3D_WORKSPACE_ADMISSION: '{"capability":{}}' };
    expect(() => f.runner.assertSourceWorkspaceAdmission(f.root)).toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE.*signed source approval/);
    expect(() => f.runner.runSource(f.root, env)).toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE.*signed source approval/);
    const cli = spawnSync(process.execPath, [join(f.root, 'tools/remote-acr/source-checks.mjs'), 'workspace-admission'],
      { cwd: f.root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain('WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE');
    const extra = spawnSync(process.execPath, [join(f.root, 'tools/remote-acr/source-checks.mjs'), 'workspace-admission', '{"capability":{}}'],
      { cwd: f.root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(extra.status).toBe(2);
    expect(extra.stderr).toMatch(/accepts only fixed source staging/);
    expect(existsSync(f.storeDir)).toBe(false);
  });

  it('rejects forged, mismatched and receipt-shaped inputs rather than trusting their representations', async () => {
    const f = await fixture(), first = f.prepare(), second = f.prepare(join(f.storeParent, 'second-store'));
    const run = (ready: typeof first.ready) => f.runner.runSource(f.root, sourceEnv(), ready);
    expect(() => run({ ...first.ready, capability: {} as never })).toThrow(/invalid workspace archive capability/);
    expect(() => run({ ...first.ready, approvalCapability: {} as never })).toThrow(/invalid workspace source approval capability/);
    expect(() => run({ ...first.ready, approvalCapability: second.ready.approvalCapability }))
      .toThrow(/invalid workspace source approval capability/);
    const alternateUrl = `${pathToFileURL(join(f.root, 'tools/release/workspace-pnpm-admission.mjs')).href}?other-instance`;
    const alternate = await import(/* @vite-ignore */ alternateUrl) as typeof import('../../../tools/release/workspace-pnpm-admission.mjs');
    const foreign = alternate.verifyWorkspacePnpmAdmission({ ...f.input, allowDeferredWorkspaceBins: true });
    expect(() => run({ ...first.ready, capability: foreign.capability })).toThrow(/invalid workspace archive capability/);
    // An independently rechecked byte-identical store for this same source is
    // still not install authority; store location is not a capability identity.
    expect(() => run({ ...first.ready, storeDir: second.ready.storeDir }))
      .toThrow(/package-manager custody.*process\/network isolation/);
    expect(() => run({ ...first.ready, sourceManifestPath: 'other.json' }))
      .toThrow(/source root or manifest differs/);
    expect(() => run({ ...first.ready, root: f.storeParent })).toThrow(/source root or manifest differs/);
    expect(() => run({ ...first.ready, receipt: first.prepared.receipt } as typeof first.ready))
      .toThrow(/invalid source workspace admission fields/);
    expect(() => run({ ...first.ready, installationAuthorized: true } as typeof first.ready))
      .toThrow(/invalid source workspace admission fields/);
    const getter = { ...first.ready };
    Object.defineProperty(getter, 'capability', { enumerable: true, get() { throw new Error('getter must not run'); } });
    expect(() => run(getter)).toThrow(/invalid source workspace admission fields/);
  });

  it('binds the admission to the staged root and the exact manifest bytes', async () => {
    const f = await fixture(), { ready } = f.prepare(), other = temp();
    cpSync(f.root, other, { recursive: true });
    expect(() => f.runner.runSource(other, sourceEnv(), { ...ready, root: other }))
      .toThrow(/workspace capability source or policy differs/);
    const replaced = 'tools/release/workspace-pnpm-admission.mjs', replacementFile = join(other, replaced);
    writeFileSync(replacementFile, `${readFileSync(replacementFile, 'utf8')}\n// substituted staged verifier\n`);
    const otherManifestFile = join(other, f.sourceManifestPath), otherManifest = JSON.parse(readFileSync(otherManifestFile, 'utf8'));
    otherManifest.files.find((entry: { path: string }) => entry.path === replaced).sha256 = sha(readFileSync(replacementFile));
    otherManifest.inputDigest = sha(stable(otherManifest.files));
    writeFileSync(otherManifestFile, formatted(otherManifest));
    expect(() => f.runner.runSource(other, sourceEnv(), { ...ready, root: other }))
      .toThrow(/workspace admission implementation differs from staged source: tools\/release\/workspace-pnpm-admission\.mjs/);
    rmSync(replacementFile);
    symlinkSync('source-identity.mjs', replacementFile);
    const replacedEntry = otherManifest.files.find((entry: { path: string }) => entry.path === replaced);
    Object.assign(replacedEntry, { type: 'symlink', mode: '120000', sha256: sha('source-identity.mjs') });
    otherManifest.inputDigest = sha(stable(otherManifest.files));
    writeFileSync(otherManifestFile, formatted(otherManifest));
    expect(() => f.runner.assertWorkspaceDependencyAdmission({ ...ready, root: other }))
      .toThrow(/workspace admission implementation differs from staged source: tools\/release\/workspace-pnpm-admission\.mjs/);
    const manifestFile = join(f.root, f.sourceManifestPath), bytes = readFileSync(manifestFile, 'utf8');
    const changed = JSON.parse(bytes);
    changed.origin.commit = 'c'.repeat(40);
    writeFileSync(manifestFile, formatted(changed));
    expect(() => f.runner.runSource(f.root, sourceEnv(), ready)).toThrow(/workspace capability source or policy differs/);
    writeFileSync(manifestFile, bytes);
    writeFileSync(join(f.root, 'independent/index.js'), 'changed source bytes\n');
    expect(() => f.runner.runSource(f.root, sourceEnv(), ready)).toThrow(/staged source bytes or mode mismatch/i);
  });

  it('detects changed store bytes and implementations even if a staged manifest is rehashed', async () => {
    const f = await fixture(), { ready } = f.prepare();
    const storeManifest = join(f.storeDir, 'manifest.json'), storeBytes = readFileSync(storeManifest);
    writeFileSync(storeManifest, '{}\n');
    expect(() => f.runner.runSource(f.root, sourceEnv(), ready)).toThrow(/native store.*(?:differs|mismatch)/);
    writeFileSync(storeManifest, storeBytes);
    const modulePath = 'tools/remote-acr/source-resume.mjs', moduleFile = join(f.root, modulePath);
    writeFileSync(moduleFile, `${readFileSync(moduleFile, 'utf8')}\n// changed after runner load\n`);
    const manifestFile = join(f.root, f.sourceManifestPath), manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    manifest.files.find((entry: { path: string }) => entry.path === modulePath).sha256 = sha(readFileSync(moduleFile));
    manifest.inputDigest = sha(stable(manifest.files));
    writeFileSync(manifestFile, formatted(manifest));
    expect(() => f.runner.runSource(f.root, sourceEnv(), ready))
      .toThrow(/workspace admission implementation differs from staged source: tools\/remote-acr\/source-resume\.mjs/);
  });

  it('cannot establish a policy anchor from synthetic input when the verifier has no pin', async () => {
    const f = await fixture(false);
    expect(() => f.runner.prepareWorkspaceDependencyAdmission({ ...f.input, storeDir: f.storeDir, approvalBytes: Buffer.from('{}') }))
      .toThrow(/no independently trusted workspace policy anchor/);
    expect(existsSync(f.storeDir)).toBe(false);
  });
});

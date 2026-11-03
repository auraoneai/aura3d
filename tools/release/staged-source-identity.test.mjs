import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindSourceIdentityToCommit, isSourceInput, sourceManifestInputDigest, stagedSourceIdentity } from './source-identity.mjs';
import { loadValidatedReleasePlan } from './exact-release-plan.mjs';
import { publicPackageNames } from './release-inventory.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'aura-source-manifest-'));
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lock: 1\n');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'input.ts'), 'export const answer = 42;\n');
  const files = ['pnpm-lock.yaml', 'src/input.ts'].map(path => ({ path, sha256: hash(readFileSync(join(root, path))), mode: '100644', type: 'file' }));
  const manifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, files, administrativeFiles: [], lockfileSha256: files[0].sha256, inputDigest: sourceManifestInputDigest(files) };
  const save = () => writeFileSync(join(root, '.native-source-manifest.json'), JSON.stringify(manifest));
  save();
  return { root, manifest, save, remove: () => rmSync(root, { force: true, recursive: true }) };
};
const localGit = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('verifies git-free staging and rejects missing, changed and undeclared implementation inputs', () => {
  const f = fixture();
  try {
    const identity = stagedSourceIdentity(f.root, '.native-source-manifest.json');
    assert.equal(identity.commit, 'a'.repeat(40));
    assert.equal(identity.inputDigest, f.manifest.inputDigest);
    writeFileSync(join(f.root, 'src', 'input.ts'), 'modified');
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /mismatch/);
    writeFileSync(join(f.root, 'src', 'input.ts'), 'export const answer = 42;\n');
    writeFileSync(join(f.root, 'src', 'undeclared.ts'), 'extra');
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /Undeclared/);
    rmSync(join(f.root, 'src', 'undeclared.ts'));
    rmSync(join(f.root, 'src', 'input.ts'));
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /missing/);
  } finally { f.remove(); }
});

test('validates digest, executable mode, deterministic ordering and administrative bytes', () => {
  const f = fixture();
  try {
    f.manifest.inputDigest = '0'.repeat(64); f.save();
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /digest/);
    f.manifest.inputDigest = sourceManifestInputDigest(f.manifest.files); f.save();
    chmodSync(join(f.root, 'src/input.ts'), 0o755);
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /mode mismatch/);
    chmodSync(join(f.root, 'src/input.ts'), 0o644);
    f.manifest.files.reverse(); f.manifest.inputDigest = sourceManifestInputDigest(f.manifest.files); f.save();
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /duplicate staged source path/);
    f.manifest.files.reverse(); f.manifest.inputDigest = sourceManifestInputDigest(f.manifest.files);
    mkdirSync(join(f.root, 'docs/prds'), { recursive: true });
    const path = 'docs/prds/aura3d-native-capability-ledger.json';
    writeFileSync(join(f.root, path), 'ledger');
    f.manifest.administrativeFiles.push({ path, sha256: hash('ledger'), mode: '100644', type: 'file' }); f.save();
    assert.equal(stagedSourceIdentity(f.root, '.native-source-manifest.json').inputDigest, f.manifest.inputDigest);
    writeFileSync(join(f.root, path), 'changed');
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /mismatch/);
    assert.equal(isSourceInput(path), false);
    assert.equal(isSourceInput('docs/prds/aura3d-native-capability-roadmap.md'), true);
  } finally { f.remove(); }
});

test('rejects symlink escapes, including links through another symlink', () => {
  const f = fixture();
  try {
    const path = 'src/outside';
    symlinkSync('/etc/passwd', join(f.root, path));
    f.manifest.files.push({ path, sha256: hash('/etc/passwd'), mode: '120000', type: 'symlink' });
    f.manifest.inputDigest = sourceManifestInputDigest(f.manifest.files); f.save();
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /symlink escapes/);
    rmSync(join(f.root, path));
    symlinkSync('/etc', join(f.root, 'src', 'redirect'));
    symlinkSync('redirect/missing', join(f.root, path));
    f.manifest.files.push({ path: 'src/redirect', sha256: hash('/etc'), mode: '120000', type: 'symlink' });
    f.manifest.files.find(entry => entry.path === path).sha256 = hash('redirect/missing');
    f.manifest.inputDigest = sourceManifestInputDigest(f.manifest.files); f.save();
    assert.throws(() => stagedSourceIdentity(f.root, '.native-source-manifest.json'), /symlink escapes/);
  } finally { f.remove(); }
});

test('binds tested input and exact candidate archive to a later unchanged commit', () => {
  const f = fixture();
  try {
    const staged = stagedSourceIdentity(f.root, '.native-source-manifest.json');
    localGit(f.root, 'init', '-q');
    localGit(f.root, 'config', 'user.email', 'fixture@example.invalid');
    localGit(f.root, 'config', 'user.name', 'Source identity fixture');
    localGit(f.root, 'add', 'pnpm-lock.yaml', 'src/input.ts');
    localGit(f.root, 'commit', '-qm', 'fixture');
    const commit = localGit(f.root, 'rev-parse', 'HEAD');
    mkdirSync(join(f.root, 'tests/reports'), { recursive: true });
    writeFileSync(join(f.root, 'tests/reports/candidate.tgz'), 'candidate bytes');
    const archives = [{ path: 'tests/reports/candidate.tgz', sha256: hash('candidate bytes') }];
    const binding = bindSourceIdentityToCommit(f.root, staged, archives, commit);
    assert.equal(binding.freeze.commit, commit);
    assert.notEqual(binding.origin.commit, binding.freeze.commit);
    assert.equal(binding.inputDigest, staged.inputDigest);
    writeFileSync(join(f.root, 'tests/reports/candidate.tgz'), 'tampered');
    assert.throws(() => bindSourceIdentityToCommit(f.root, staged, archives, commit), /archive differs/);
    writeFileSync(join(f.root, 'tests/reports/candidate.tgz'), 'candidate bytes');
    writeFileSync(join(f.root, 'src/input.ts'), 'new code');
    assert.throws(() => bindSourceIdentityToCommit(f.root, staged, archives, commit), /uncommitted source/);
    localGit(f.root, 'add', 'src/input.ts'); localGit(f.root, 'commit', '-qm', 'changed');
    assert.throws(() => bindSourceIdentityToCommit(f.root, staged, archives, localGit(f.root, 'rev-parse', 'HEAD')), /differs from tested/);
  } finally { f.remove(); }
});

test('validates a native candidate plan in a git-free staged source and rejects changed archives', () => {
  const root = mkdtempSync(join(tmpdir(), 'aura-staged-release-'));
  const previous = process.env.AURA3D_SOURCE_MANIFEST;
  try {
    const names = publicPackageNames('4.7.1', 'native-1');
    const sourceFiles = ['package.json', 'pnpm-lock.yaml'];
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@aura3d/engine', version: '4.7.1' }));
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lock');
    mkdirSync(join(root, 'packages'), { recursive: true });
    for (const name of names.filter(name => name !== '@aura3d/engine')) {
      const dir = name === '@aura3d/cli' ? 'aura3d-cli' : name.replace('@aura3d/', '');
      const path = `packages/${dir}/package.json`;
      mkdirSync(join(root, 'packages', dir), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify({ name, version: '4.7.1' }));
      sourceFiles.push(path);
    }
    const files = sourceFiles.sort().map(path => ({ path, sha256: hash(readFileSync(join(root, path))), mode: '100644', type: 'file' }));
    const manifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, files, lockfileSha256: hash('lock'), inputDigest: sourceManifestInputDigest(files) };
    writeFileSync(join(root, '.native-source-manifest.json'), JSON.stringify(manifest));
    process.env.AURA3D_SOURCE_MANIFEST = '.native-source-manifest.json';
    const source = stagedSourceIdentity(root, process.env.AURA3D_SOURCE_MANIFEST);
    mkdirSync(join(root, 'tests/reports'), { recursive: true });
    const packages = names.map((name, i) => {
      const tarball = `tests/reports/${i}.tgz`, bytes = Buffer.from(`archive ${name}`);
      writeFileSync(join(root, tarball), bytes);
      return { name, version: '4.7.1', tarball, sha256: hash(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
    });
    const plan = { schema: 'aura3d-release-plan/1.0', version: '4.7.1', inventoryId: 'native-1', source, expectedPackageCount: names.length, packageCount: names.length, packages };
    writeFileSync(join(root, 'tests/reports/plan.json'), JSON.stringify(plan));
    assert.equal(loadValidatedReleasePlan(root, 'tests/reports/plan.json').packages.length, names.length);
    writeFileSync(join(root, packages[0].tarball), 'changed');
    assert.throws(() => loadValidatedReleasePlan(root, 'tests/reports/plan.json'), /archive mismatch/);
    writeFileSync(join(root, packages[0].tarball), `archive ${packages[0].name}`);
    plan.packages[0] = { ...plan.packages[1] };
    writeFileSync(join(root, 'tests/reports/plan.json'), JSON.stringify(plan));
    assert.throws(() => loadValidatedReleasePlan(root, 'tests/reports/plan.json'), /unique/);
  } finally {
    if (previous === undefined) delete process.env.AURA3D_SOURCE_MANIFEST;
    else process.env.AURA3D_SOURCE_MANIFEST = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

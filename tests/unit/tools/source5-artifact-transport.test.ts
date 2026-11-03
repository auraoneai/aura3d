// Pure parts of the 5.0 ACR source pass (tools/remote-acr/run-source5.sh):
// the staged JSON manifest must satisfy tools/release/source-identity.mjs
// exactly (publish-all --pack-only reads it through AURA3D_SOURCE_MANIFEST), and
// downloaded tested archives must be re-verified against the candidate plan.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gitSourceInputDigest, sourceIdentity, stagedSourceIdentity } from '../../../tools/release/source-identity.mjs';
import { buildSource5Manifest, SOURCE5_MANIFEST_NAME, writeSource5Manifest } from '../../../tools/remote-acr/source5-manifest.mjs';
import { readSource5Manifest } from '../../../tools/remote-acr/source5-files.mjs';
import { CONSUMER_INDEX_NAME, planArchives, stageArtifacts, stageConsumers, verifyDownloadedArtifacts, verifyDownloadedConsumers } from '../../../tools/remote-acr/source5-artifacts.mjs';

const REPO = resolve(__dirname, '../../..');
const temps: string[] = [];
const temp = (label: string) => { const dir = mkdtempSync(join(tmpdir(), `a3d-source5-${label}-`)); temps.push(dir); return dir; };
afterEach(() => { while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true }); });
const put = (root: string, path: string, text: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** A small committed candidate: identity inputs, an administrative note, an excluded tracked report, an executable and a symlink. */
function candidate() {
  const root = temp('repo');
  put(root, 'package.json', '{"name":"fixture"}\n');
  put(root, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  put(root, 'packages/engine/src/index.ts', 'export const x = 1;\n');
  put(root, 'tools/run.sh', '#!/bin/sh\necho ok\n'); chmodSync(join(root, 'tools/run.sh'), 0o755);
  put(root, 'docs/prds/aura3d-native-acceptance.md', '# acceptance\n');
  put(root, 'tests/reports/final/kept.json', '{}\n');
  put(root, 'BUNDLE_SIZES.md', '# sizes\n');
  symlinkSync('src/index.ts', join(root, 'packages/engine/entry.ts'));
  git(root, 'init', '-q');
  git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A');
  git(root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  return { root, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'), paths: git(root, 'ls-files', '-z').split('\0').filter(Boolean) };
}
/** Stage like run-source5.sh: copy exactly the listed paths (no .git). */
function stage(root: string, paths: string[]) {
  const ctx = temp('ctx');
  for (const path of paths) cpSync(join(root, path), join(ctx, path), { verbatimSymlinks: true, recursive: false, preserveTimestamps: true });
  return ctx;
}

describe('source5 staged manifest (AURA3D_SOURCE_MANIFEST)', () => {
  it('is accepted by stagedSourceIdentity and matches the Git identity used for freeze binding', () => {
    const { root, commit, tree, paths } = candidate();
    const ctx = stage(root, paths);
    const { manifest, identity } = writeSource5Manifest({ root: ctx, paths, commit, tree });
    expect(manifest.schema).toBe('aura3d.native-source-manifest/1');
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(['package.json', 'packages/engine/entry.ts', 'packages/engine/src/index.ts', 'pnpm-lock.yaml', 'tools/run.sh']);
    expect(manifest.administrativeFiles.map((f: { path: string }) => f.path)).toEqual(['docs/prds/aura3d-native-acceptance.md']);
    expect(manifest.stagedExcludedPaths).toEqual(['BUNDLE_SIZES.md', 'tests/reports/final/kept.json']);
    expect(manifest.files.find((f: { path: string }) => f.path === 'tools/run.sh').mode).toBe('100755');
    expect(manifest.files.find((f: { path: string }) => f.path === 'packages/engine/entry.ts')).toMatchObject({ type: 'symlink', mode: '120000', sha256: sha256('src/index.ts') });
    // Same values publish-all would put in plan.source, and the ones the Mac checks at freeze.
    expect(identity).toMatchObject({ commit, tree, inputDigest: manifest.inputDigest, lockfileSha256: sha256("lockfileVersion: '9.0'\n") });
    expect(identity.inputDigest).toBe(gitSourceInputDigest(root));
    const fromGit = sourceIdentity(root, null);
    expect(identity.fingerprint).toBe(fromGit.fingerprint);
    expect(stagedSourceIdentity(ctx, SOURCE5_MANIFEST_NAME).manifestSha256).toBe(sha256(readFileSync(join(ctx, SOURCE5_MANIFEST_NAME))));
    // Without Git, source5-files lists every staged file from the JSON manifest.
    expect(readSource5Manifest(ctx)).toEqual([...paths].sort());
  });

  it('runs as the launcher CLI against a NUL-separated list', () => {
    const { root, commit, tree, paths } = candidate();
    const ctx = stage(root, paths), list = join(temp('list'), 'list');
    writeFileSync(list, paths.join('\0') + '\0');
    const run = spawnSync(process.execPath, [join(REPO, 'tools/remote-acr/source5-manifest.mjs'), 'write', ctx, list, commit, tree], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(ctx, SOURCE5_MANIFEST_NAME), 'utf8')).origin).toEqual({ commit, tree });
  });

  it('refuses inputs the validator would reject', () => {
    const { root, commit, tree, paths } = candidate();
    const ctx = stage(root, paths);
    // A sidecar list under tools/ (the old .source5-manifest.txt location) is an undeclared source input.
    put(ctx, 'tools/remote-acr/.source5-manifest.txt', 'x\n');
    expect(() => writeSource5Manifest({ root: ctx, paths, commit, tree })).toThrow(/Undeclared staged source/);
    expect(() => buildSource5Manifest({ root: ctx, paths: paths.filter(p => p !== 'pnpm-lock.yaml'), commit, tree })).toThrow(/pnpm-lock/);
    expect(() => buildSource5Manifest({ root: ctx, paths, commit: 'abc', tree })).toThrow(/commit and tree/);
  });
});

/** A packed candidate as publish-all --pack-only leaves it under /repo. */
function packed(commit = 'a'.repeat(40), lock = 'b'.repeat(64), inputDigest = 'c'.repeat(64)) {
  const root = temp('packed'), reportDir = join(root, 'tests/reports/native-5/run-1');
  const packages = ['engine', 'math'].map(name => {
    const bytes = Buffer.from(`archive ${name} ${Math.random()}`);
    const tarball = `tests/reports/release-tarballs/aura3d-${name}-5.0.0.tgz`;
    put(root, tarball, bytes);
    return { name: `@aura3d/${name}`, version: '5.0.0', tarball, sha256: sha256(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
  });
  const plan = { schema: 'aura3d-release-plan/1.0', source: { commit, tree: 'd'.repeat(40), lockfileSha256: lock, inputDigest }, commit, lockfileSha256: lock, packOnly: true, packages };
  put(root, 'tests/reports/native-5/run-1/candidate-plan.json', `${JSON.stringify(plan, null, 2)}\n`);
  for (const name of ['api-diff.json', 'public-api.md', 'baseline-manifest.json']) put(reportDir, name, `${name}\n`);
  return { root, reportDir, plan, expected: { commit, lockfileSha256: lock, inputDigest } };
}
function roundTrip(f: ReturnType<typeof packed>) {
  const out = join(temp('out'), 'artifacts');
  stageArtifacts({ root: f.root, planPath: 'tests/reports/native-5/run-1/candidate-plan.json', reportDir: f.reportDir, outDir: out, runId: 'run-1' });
  const mac = temp('mac'), dir = join(mac, 'tests/reports/native-5/run-1/artifacts');
  cpSync(out, dir, { recursive: true });
  return { mac, dir };
}

describe('source5 tested-archive retrieval', () => {
  it('stages plan, archives and packed reports and verifies them after download', () => {
    const f = packed(), { mac, dir } = roundTrip(f);
    const result = verifyDownloadedArtifacts({ dir, root: mac, expected: f.expected });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.plan?.localPath).toBe('tests/reports/native-5/run-1/artifacts/candidate-plan.json');
    expect(result.archives).toEqual(f.plan.packages.map((p) => ({
      name: p.name, version: p.version, planTarball: p.tarball, localPath: `tests/reports/native-5/run-1/artifacts/tarballs/${p.tarball.split('/').pop()}`,
      sha256: p.sha256, size: expect.any(Number), verified: true })));
    expect(result.reports.map((r: { name: string; verified?: boolean }) => [r.name, r.verified])).toEqual([['api-diff.json', true], ['public-api.md', true], ['baseline-manifest.json', true]]);
  });

  it('fails on changed, missing or extra archives and on a plan for another candidate', () => {
    const f = packed();
    let { mac, dir } = roundTrip(f);
    writeFileSync(join(dir, 'tarballs/aura3d-math-5.0.0.tgz'), 'tampered');
    expect(verifyDownloadedArtifacts({ dir, root: mac, expected: f.expected }).problems).toContain('archive bytes differ from the plan: tarballs/aura3d-math-5.0.0.tgz');

    ({ mac, dir } = roundTrip(f));
    rmSync(join(dir, 'tarballs/aura3d-engine-5.0.0.tgz'));
    writeFileSync(join(dir, 'tarballs/stray.tgz'), 'x');
    const missing = verifyDownloadedArtifacts({ dir, root: mac, expected: f.expected });
    expect(missing.ok).toBe(false);
    expect(missing.problems).toEqual(expect.arrayContaining(['archive not downloaded: tarballs/aura3d-engine-5.0.0.tgz', 'unexpected downloaded file: tarballs/stray.tgz']));

    ({ mac, dir } = roundTrip(f));
    expect(verifyDownloadedArtifacts({ dir, root: mac, expected: { ...f.expected, commit: 'e'.repeat(40), inputDigest: 'f'.repeat(64) } }).problems)
      .toEqual(expect.arrayContaining([expect.stringMatching(/plan source commit/), 'plan source input digest is not the staged manifest input digest']));

    // A rewritten plan (even one whose archive hashes are consistent) no longer matches the uploaded index.
    ({ mac, dir } = roundTrip(f));
    writeFileSync(join(dir, 'candidate-plan.json'), JSON.stringify(f.plan));
    expect(verifyDownloadedArtifacts({ dir, root: mac, expected: f.expected }).problems).toContain('candidate plan bytes differ from the uploaded index');

    expect(verifyDownloadedArtifacts({ dir: join(temp('empty'), 'artifacts'), root: mac }).ok).toBe(false);
  });

  it('refuses to stage an incomplete plan or archives that differ from it', () => {
    const f = packed();
    writeFileSync(join(f.root, f.plan.packages[0].tarball), 'changed after pack');
    expect(() => stageArtifacts({ root: f.root, planPath: 'tests/reports/native-5/run-1/candidate-plan.json', reportDir: f.reportDir, outDir: join(temp('o'), 'a'), runId: 'run-1' }))
      .toThrow(/differs from its plan entry/);
    expect(() => planArchives({ ...f.plan, packages: [{ ...f.plan.packages[0], tarball: null }] })).toThrow(/no packed archive/);
    expect(() => planArchives({ ...f.plan, packOnly: false })).toThrow(/pack-only/);
  });

  it('records a packed report that the image did not produce as a problem', () => {
    const f = packed();
    rmSync(join(f.reportDir, 'api-diff.json'));
    const { mac, dir } = roundTrip(f);
    const result = verifyDownloadedArtifacts({ dir, root: mac, expected: f.expected });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['report not produced in the image: api-diff.json']);
    expect(result.archives.every((a: { verified: boolean }) => a.verified)).toBe(true);
  });
});

describe('source5 packed-b consumer report retention (stage-consumers -> verify-consumers)', () => {
  const RUN = 'run-1';
  /** The packed-b job tree: both consumer run directories with reports, projects, logs and a binary archive. */
  function job() {
    const root = temp('job');
    put(root, `tests/reports/native-consumers/${RUN}/source.json`, '{"phase":"source","status":"pass"}\n');
    put(root, `tests/reports/native-consumers/${RUN}/matrix-source.json`, '{"phase":"source","matrix":true}\n');
    put(root, `tests/reports/native-consumers/${RUN}/projects/react-import/dist/index.js`, 'export default 1;\n'.repeat(20));
    put(root, `tests/reports/native-consumers/${RUN}/dependency-archives/${'a'.repeat(64)}.tgz`, Buffer.from([0, 1, 2, 3, 255]));
    put(root, `tests/reports/native-consumer-matrix/${RUN}/projects/npm-react18-peer-present/package.json`, '{"name":"cell"}\n');
    put(root, `tests/reports/native-consumer-matrix/${RUN}/logs/npm-react18-peer-present-install.log`, 'ok\n');
    put(root, 'tests/reports/native-consumers/other-run/source.json', '{}\n');
    return root;
  }
  const upload = (root: string, chunkBytes?: number) => {
    const out = join(temp('upload'), 'consumers');
    const index = stageConsumers({ root, runId: RUN, outDir: out, ...(chunkBytes ? { chunkBytes } : {}) });
    return { out, index };
  };
  const mac = () => { const root = temp('mac'); return { root, dest: join(root, `tests/reports/native-5/${RUN}/artifacts/consumers`) }; };

  it('round-trips every file of both run directories, chunked, and records the two bound reports', () => {
    const root = job();
    const { out, index } = upload(root, 400);
    expect(index.chunks.length).toBeGreaterThan(1);
    expect(index.files.map((f: { path: string }) => f.path)).not.toContain('tests/reports/native-consumers/other-run/source.json');
    expect(index.files).toHaveLength(6);
    expect(index.examplesSourceReport).toBeNull();
    const m = mac();
    const result = verifyDownloadedConsumers({ dir: out, dest: m.dest, root: m.root, runId: RUN });
    expect(result.problems).toEqual([]);
    expect(result).toMatchObject({ ok: true, files: 6, examplesSourceReport: null,
      index: { localPath: `tests/reports/native-5/${RUN}/artifacts/consumers/${CONSUMER_INDEX_NAME}` },
      sourceConsumerReport: { localPath: `tests/reports/native-5/${RUN}/artifacts/consumers/tests/reports/native-consumers/${RUN}/source.json`,
        jobPath: `tests/reports/native-consumers/${RUN}/source.json`, sha256: sha256('{"phase":"source","status":"pass"}\n') },
      matrixSourceReport: { jobPath: `tests/reports/native-consumers/${RUN}/matrix-source.json` } });
    for (const file of index.files) expect(sha256(readFileSync(join(m.dest, file.path)))).toBe(file.sha256);
  });

  it('refuses tampered, missing or extra chunks, another run id and a non-empty destination', () => {
    const root = job();
    let { out } = upload(root, 400);
    const chunk = readdirSync(out).find(name => name.endsWith('.bin'))!;
    writeFileSync(join(out, chunk), 'tampered');
    let m = mac();
    let result = verifyDownloadedConsumers({ dir: out, dest: m.dest, root: m.root, runId: RUN });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(`chunk bytes differ from the index: ${chunk}`);
    expect(existsSync(m.dest)).toBe(false);

    ({ out } = upload(root));
    rmSync(join(out, 'bundle-000.bin'));
    writeFileSync(join(out, 'stray.bin'), 'x');
    m = mac();
    result = verifyDownloadedConsumers({ dir: out, dest: m.dest, root: m.root, runId: RUN });
    expect(result.problems).toEqual(expect.arrayContaining(['chunk not downloaded: bundle-000.bin', 'unexpected downloaded file: stray.bin']));

    ({ out } = upload(root));
    expect(verifyDownloadedConsumers({ dir: out, dest: mac().dest, root: m.root, runId: 'run-2' }).problems).toEqual(['consumer index has an unknown schema or another run id']);
    m = mac();
    put(m.dest, 'leftover.txt', 'x');
    expect(verifyDownloadedConsumers({ dir: out, dest: m.dest, root: m.root, runId: RUN }).problems[0]).toMatch(/not empty/);
    expect(verifyDownloadedConsumers({ dir: join(temp('empty'), 'consumers'), dest: mac().dest, root: m.root, runId: RUN }).ok).toBe(false);
  });

  it('refuses an index that escapes the run directories or drops a bound report', () => {
    const root = job();
    const { out } = upload(root);
    const index = JSON.parse(readFileSync(join(out, CONSUMER_INDEX_NAME), 'utf8'));
    const escaped = { ...index, files: index.files.map((f: { path: string }, i: number) => (i === 0 ? { ...f, path: '../../etc/passwd' } : f)) };
    writeFileSync(join(out, CONSUMER_INDEX_NAME), JSON.stringify(escaped));
    const m = mac();
    expect(verifyDownloadedConsumers({ dir: out, dest: m.dest, root: m.root, runId: RUN }).problems).toEqual(expect.arrayContaining([
      'unsafe or duplicate consumer path "../../etc/passwd"']));
    expect(existsSync(m.dest)).toBe(false);
    const dropped = { ...index, files: index.files.filter((f: { path: string }) => !f.path.endsWith('/matrix-source.json')) };
    writeFileSync(join(out, CONSUMER_INDEX_NAME), JSON.stringify(dropped));
    expect(verifyDownloadedConsumers({ dir: out, dest: mac().dest, root: m.root, runId: RUN }).problems).toEqual([
      `matrixSourceReport is not retained: tests/reports/native-consumers/${RUN}/matrix-source.json`]);
  });

  it('fails staging (and so the packed-b stage) on a missing report, a symlink or an oversize inventory', () => {
    let root = job();
    rmSync(join(root, `tests/reports/native-consumers/${RUN}/matrix-source.json`));
    expect(() => upload(root)).toThrow(/matrixSourceReport was not produced/);
    root = job();
    rmSync(join(root, `tests/reports/native-consumer-matrix/${RUN}`), { recursive: true });
    expect(() => upload(root)).toThrow(/consumer report directory missing/);
    root = job();
    symlinkSync('package.json', join(root, `tests/reports/native-consumer-matrix/${RUN}/projects/npm-react18-peer-present/link.json`));
    expect(() => upload(root)).toThrow(/contain a symlink/);
    root = job();
    expect(() => stageConsumers({ root, runId: RUN, outDir: join(temp('o'), 'c'), maxBytes: 64 })).toThrow(/exceed 64 bytes/);
    expect(() => stageConsumers({ root, runId: '../x', outDir: join(temp('o'), 'c') })).toThrow(/invalid run id/);
  });
});

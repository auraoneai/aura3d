import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareScopeOutcomes, emitCodeCompleteGate, parseScopeOutcomes, validateAcceptanceGate, verifyTapInventory, verifyVitestInventory } from '../../../tools/native-capability-gate/index.mjs';
import { ACCEPTANCE_STAGING_RECORD, createAcceptanceStagingRecord } from '../../../tools/remote-acr/acceptance-staging.mjs';
import { inspectIndependentNpmConsumer } from '../../../tools/release/portable-npm-lock.mjs';
import { inspectIndependentPnpmConsumer } from '../../../tools/release/portable-pnpm-lock.mjs';
import { ARCHIVE_ADMISSION_FILES, ARCHIVE_ADMISSION_TESTS, buildProductsDigest, buildSteps, computeInputDigest, EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST, HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_FIXTURES, HISTORICAL_REPLAY_SOURCE_TEST, HISTORICAL_REPLAY_TEST, HISTORICAL_SOURCE_TEST, expectedExternalCodecAcceptance, expectedHistoricalAcceptance, expectedHistoricalReplay, materializeResults, nativeSourceInventoryForManifest, parseVitestInventory, sourceTestFileCoverage } from '../../../tools/remote-acr/source-checks.mjs';

const observedAdmissionReviews = vi.hoisted(() => ({ npm: [] as unknown[], pnpm: [] as unknown[] }));
vi.setConfig({ testTimeout: 30_000 });

// This synthetic seam exercises gate inventory/receipt binding only. The real
// verifier has separate isolated-policy tests and no production trust anchor.
vi.mock('../../../tools/release/archive-admission.mjs', () => ({
  verifyArchiveAdmissionBatch: ({ root, sourceManifestPath, planPath, consumers, candidateReviews }: { root: string; sourceManifestPath: string; planPath: string; consumers: Array<{ manifestBytes: Buffer; lockBytes: Buffer; archives: Array<{ resolved: string; bytes: Buffer }> }>; candidateReviews: unknown }) => {
    observedAdmissionReviews.npm.push(candidateReviews);
    const plan = JSON.parse(readFileSync(join(root, planPath), 'utf8'));
    return consumers.map(graph => {
      const inputs = graph.archives.map((archive, index) => ({ resolved: archive.resolved, path: `snapshot/${index}` }));
      inspectIndependentNpmConsumer({ manifest: JSON.parse(graph.manifestBytes.toString('utf8')), lock: JSON.parse(graph.lockBytes.toString('utf8')),
        archives: inputs, readArchive: path => graph.archives[Number(path.split('/')[1])].bytes, candidatePackages: plan.packages });
      return syntheticAdmissionReceipt(root, sourceManifestPath, planPath, graph.manifestBytes, graph.lockBytes);
    });
  },
  verifyPnpmArchiveAdmissionBatch: ({ root, sourceManifestPath, planPath, consumers, candidateReviews }: { root: string; sourceManifestPath: string; planPath: string; consumers: Array<{ manifestBytes: Buffer; lockBytes: Buffer; archives: Array<{ resolved: string; bytes: Buffer }> }>; candidateReviews: unknown }) => {
    observedAdmissionReviews.pnpm.push(candidateReviews);
    const plan = JSON.parse(readFileSync(join(root, planPath), 'utf8'));
    return consumers.map(graph => {
      const inputs = graph.archives.map((archive, index) => ({ resolved: archive.resolved, path: `snapshot/${index}` }));
      inspectIndependentPnpmConsumer({ manifestBytes: graph.manifestBytes, lockBytes: graph.lockBytes, archives: inputs,
        readArchive: path => graph.archives[Number(path.split('/')[1])].bytes, candidatePackages: plan.packages });
      return syntheticAdmissionReceipt(root, sourceManifestPath, planPath, graph.manifestBytes, graph.lockBytes, true);
    });
  },
  consumeArchiveAdmission: () => { throw new Error('Synthetic gate tests never authorize installation'); }
}));

const temporary: string[] = [];
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const historicalReplayFixtures = HISTORICAL_REPLAY_FIXTURES.map(fixture => ({ ...fixture, content: readFileSync(new URL(`../../../${fixture.path}`, import.meta.url)) }));

function syntheticAdmissionReceipt(root: string, sourceManifestPath: string, planPath: string, manifestBytes: Buffer, lockBytes: Buffer, pnpm = false) {
  const sourceBytes = readFileSync(join(root, sourceManifestPath)), planBytes = readFileSync(join(root, planPath));
  const source = JSON.parse(sourceBytes.toString('utf8'));
  return { ...(pnpm ? { lockFormat: 'pnpm' } : {}), sourceManifest: { path: sourceManifestPath, sha256: hash(sourceBytes) }, sourceInputSha256: source.inputDigest,
    testedOrigin: source.origin, plan: { path: planPath, sha256: hash(planBytes) }, manifestSha256: hash(manifestBytes), lockSha256: hash(lockBytes) };
}

/** A real minimal npm tarball for exercising the gate's offline archive verifier. */
function syntheticPackageArchive(name: string): Buffer {
  const body = Buffer.from(JSON.stringify({ name: `@aura3d/${name}`, version: '0.0.0' }));
  const header = Buffer.alloc(512);
  header.write('package/package.json', 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(32, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'a3d-gate-'));
  temporary.push(root);
  const sourceRoot = '/source-job/worktree';
  const expectedFiles = ['tests/unit/example.test.ts'];
  const result = {
    success: true,
    numTotalTests: 1,
    testResults: [{
      name: `${sourceRoot}/${expectedFiles[0]}`,
      assertionResults: [{ status: 'passed', title: 'works', fullName: 'example works' }]
    }]
  };
  const path = 'tests/reports/native-capabilities/example/unit.json';
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  const save = (data: unknown) => {
    const bytes = JSON.stringify(data);
    writeFileSync(absolute, bytes);
    return hash(bytes);
  };
  const inventory = {
    checkId: 'unit', sourceRoot, result: { path, sha256: save(result) },
    ...parseVitestInventory(result, expectedFiles, sourceRoot)
  };
  return { root, expectedFiles, result, inventory, absolute, save };
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
  await new Promise<void>(resolve => setImmediate(resolve));
});

describe('code-complete gate record metadata', () => {
  function writeGate(overrides: Record<string, unknown> = {}) {
    const root = mkdtempSync(join(tmpdir(), 'a3d-gate-header-'));
    temporary.push(root);
    const gatePath = 'gate.json';
    writeFileSync(join(root, gatePath), JSON.stringify({
      schema: 'aura3d.native-code-complete/1', status: 'CODE_COMPLETE_GO',
      owner: 'integration-owner', createdAt: '2026-10-31T00:00:00.000Z', ...overrides
    }));
    return { root, gatePath };
  }

  it.each([
    ['object owner', { owner: { name: 'integration-owner' } }],
    ['numeric owner', { owner: 1 }],
    ['blank owner', { owner: '  \t' }],
    ['numeric timestamp', { createdAt: 2026 }],
    ['array timestamp', { createdAt: ['2026-10-31T00:00:00.000Z'] }],
    ['invalid timestamp', { createdAt: 'not-a-date' }],
    ['wrong status', { status: 'PENDING' }],
    ['wrong schema', { schema: 'invalid' }]
  ])('rejects %s before reading source evidence', (_label, overrides) => {
    expect(() => validateAcceptanceGate(writeGate(overrides))).toThrow('native capability gate: invalid gate record');
  });

  it('accepts valid string metadata and proceeds to source evidence validation', () => {
    expect(() => validateAcceptanceGate(writeGate())).toThrow(/unsafe relative path/);
  });
});

describe('code-complete Vitest result binding', () => {
  it('recomputes the inventory from retained results produced under another source root', () => {
    const { root, inventory, expectedFiles } = fixture();
    expect(verifyVitestInventory(root, inventory, expectedFiles)).toBe(inventory.result.path);
  });

  it('rejects missing or modified retained results', () => {
    const missing = fixture();
    rmSync(missing.absolute);
    expect(() => verifyVitestInventory(missing.root, missing.inventory, missing.expectedFiles)).toThrow();

    const changed = fixture();
    changed.save({ ...changed.result, success: false });
    expect(() => verifyVitestInventory(changed.root, changed.inventory, changed.expectedFiles)).toThrow(/hash mismatch/);
  });

  it('rejects a skipped test even when its altered result has a matching digest and the summary claims success', () => {
    const f = fixture();
    const skipped = {
      ...f.result,
      testResults: [{ ...f.result.testResults[0], assertionResults: [{ status: 'pending', title: 'works', fullName: 'example works' }] }]
    };
    f.inventory.result.sha256 = f.save(skipped);
    expect(() => verifyVitestInventory(f.root, f.inventory, f.expectedFiles)).toThrow(/skipped/);
  });

  it('rejects a summary or source root that does not match the retained result', () => {
    const f = fixture();
    expect(() => verifyVitestInventory(f.root, { ...f.inventory, testNames: ['another test'] }, f.expectedFiles)).toThrow(/summary mismatch/);
    expect(() => verifyVitestInventory(f.root, { ...f.inventory, sourceRoot: '/another-job' }, f.expectedFiles)).toThrow(/inventory mismatch/);
    expect(() => verifyVitestInventory(f.root, { ...f.inventory, sourceRoot: 'relative' }, f.expectedFiles)).toThrow(/source root/);
  });
});

function tapFixture(checkId: 'packages' | 'packages-dist' | 'node-release' = 'packages') {
  const root = mkdtempSync(join(tmpdir(), 'a3d-gate-tap-'));
  temporary.push(root);
  const runId = 'example';
  const expectedFiles = checkId === 'node-release' ? ['tools/release/a.test.mjs', 'tools/release/b.test.mjs'] : ['packages/example/tests/a.test.ts', 'packages/example/tests/b.test.ts'];
  const output = (name: string) => `TAP version 13\n# Subtest: ${name}\nok 1 - ${name}\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  const subruns = expectedFiles.map((file, index) => {
    const path = `tests/reports/native-capabilities/${runId}/results/${checkId}/${index}.tap`;
    const absolute = join(root, path), text = output(`test ${index}`);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
    const argv = checkId === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file] : checkId === 'packages-dist' ? ['node', '--import', 'tsx', '--test', '--test-reporter=tap', file] : ['node', '--test', '--test-reporter=tap', file];
    return { file, argv, exitCode: 0, result: { path, sha256: hash(text) } };
  });
  const inventory = { checkId, expectedFiles, discoveredFiles: [...expectedFiles], testCount: 2, passedCount: 2, failedCount: 0, skippedCount: 0, testNames: ['test 0', 'test 1'] };
  const check = { id: checkId, subruns };
  return { root, runId, expectedFiles, output, inventory, check };
}

describe('code-complete TAP result binding', () => {
  it.each(['packages', 'packages-dist', 'node-release'] as const)('recomputes counts and discovered files for %s subruns', checkId => {
    const f = tapFixture(checkId);
    expect(verifyTapInventory(f.root, f.inventory, f.check, f.expectedFiles, f.runId)).toEqual(f.check.subruns.map(s => s.result.path));
  });

  it('rejects missing, modified, skipped or contradictory raw output', () => {
    const missing = tapFixture();
    rmSync(join(missing.root, missing.check.subruns[0].result.path));
    expect(() => verifyTapInventory(missing.root, missing.inventory, missing.check, missing.expectedFiles, missing.runId)).toThrow();

    const changed = tapFixture();
    writeFileSync(join(changed.root, changed.check.subruns[0].result.path), 'changed');
    expect(() => verifyTapInventory(changed.root, changed.inventory, changed.check, changed.expectedFiles, changed.runId)).toThrow(/hash mismatch/);

    const skipped = tapFixture();
    const output = skipped.output('test 0').replace('# skipped 0', '# skipped 1');
    writeFileSync(join(skipped.root, skipped.check.subruns[0].result.path), output);
    skipped.check.subruns[0].result.sha256 = hash(output);
    expect(() => verifyTapInventory(skipped.root, skipped.inventory, skipped.check, skipped.expectedFiles, skipped.runId)).toThrow(/skipped/);

    const contradictory = tapFixture();
    const duplicateSummary = `${contradictory.output('test 0')}# fail 1\n`;
    writeFileSync(join(contradictory.root, contradictory.check.subruns[0].result.path), duplicateSummary);
    contradictory.check.subruns[0].result.sha256 = hash(duplicateSummary);
    expect(() => verifyTapInventory(contradictory.root, contradictory.inventory, contradictory.check, contradictory.expectedFiles, contradictory.runId)).toThrow(/failed/);

    const wrongSummary = tapFixture();
    expect(() => verifyTapInventory(wrongSummary.root, { ...wrongSummary.inventory, testNames: ['wrong'] }, wrongSummary.check, wrongSummary.expectedFiles, wrongSummary.runId)).toThrow(/summary mismatch/);
  });

  it('rejects missing, duplicate, unexecuted, misdirected and incorrectly named subruns', () => {
    const f = tapFixture();
    const verify = (subruns: Array<Record<string, unknown>>) => verifyTapInventory(f.root, f.inventory, { ...f.check, subruns }, f.expectedFiles, f.runId);
    expect(() => verify(f.check.subruns.slice(1))).toThrow(/subrun/);
    expect(() => verify([f.check.subruns[0], f.check.subruns[0]])).toThrow(/subrun/);
    expect(() => verify([{ ...f.check.subruns[0], exitCode: null }, f.check.subruns[1]])).toThrow(/exit/);
    expect(() => verify([{ ...f.check.subruns[0], argv: [...f.check.subruns[0].argv.slice(0, -1), f.expectedFiles[1]] }, f.check.subruns[1]])).toThrow(/command/);
    expect(() => verify([{ ...f.check.subruns[0], result: f.check.subruns[1].result }, f.check.subruns[1]])).toThrow(/result path/);
  });

  it('verifies each retained subrun result when materializing downloaded evidence', () => {
    const f = handoffFixture(), downloaded = mkdtempSync(join(tmpdir(), 'a3d-gate-download-')), destination = mkdtempSync(join(tmpdir(), 'a3d-gate-restore-'));
    temporary.push(downloaded, destination);
    const runId = f.reports.runId, payload = join(downloaded, runId);
    mkdirSync(payload, { recursive: true });
    cpSync(join(f.root, 'tests/reports'), join(payload, 'tests/reports'), { recursive: true });
    const subrun = f.reports.checks.find((check: { id: string }) => check.id === 'packages').subruns[0];
    expect(materializeResults(destination, downloaded, runId)).toContain(`tests/reports/native-capabilities/${runId}`);
    expect(hash(readFileSync(join(destination, subrun.result.path)))).toBe(subrun.result.sha256);
    writeFileSync(join(payload, subrun.result.path), 'tampered');
    const second = mkdtempSync(join(tmpdir(), 'a3d-gate-restore-')); temporary.push(second);
    expect(() => materializeResults(second, downloaded, runId)).toThrow(/hash mismatch/);
  });
});

// This miniature repository and its reports are synthetic fixtures under the
// system temporary directory. They never create a gate for the real checkout.
function handoffFixture(omit?: string) {
  const root = mkdtempSync(join(tmpdir(), 'a3d-gate-handoff-'));
  temporary.push(root);
  const runId = 'synthetic', reportDir = `tests/reports/native-capabilities/${runId}`;
  const task = 'Exercise the independently authored capability.';
  const roadmap = `## 2. Gaps\n| G01 | Required capability |\n## 4. File actions\n### WP-00 — Synthetic work\n| CREATE | src/example.ts | Required implementation |\n## 5. Tasks\n- [ ] ${task}\n`;
  const sourceContents: Record<string, string | Buffer> = {
    'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    'tools/native-source-inventory/index.mjs': 'synthetic inventory implementation\n',
    'tools/agent-templates/cli.test.mjs': 'synthetic supplemental source test\n',
    'tools/release/archive-admission-policy.json': '{"schema":"aura3d.archive-admission-policy/1","admissions":[]}\n',
    'packages/create-aura3d/src/index.ts': 'export const CREATE_AURA3D_TEMPLATES = ["synthetic"] as const;\n',
    'docs/prds/aura3d-native-capability-roadmap.md': roadmap,
    'src/example.ts': 'export const example = true;\n',
    'tests/unit/parity/example.test.ts': 'parity source\n',
    'tests/unit/example.test.ts': 'unit source\n',
    'tests/unit/consumer-bundle/no-tla.test.ts': 'post-build source\n',
    'tests/unit/package-dist/root-gates.test.ts': 'post-build package source\n',
    'tests/unit/tools/packed-consumer-check.test.ts': 'post-pack consumer source\n',
    'tests/assets/example.test.ts': 'asset source\n',
    'tests/qr/example.test.ts': 'qr source\n',
    'tests/integration/example.test.ts': 'integration source\n',
    'packages/example/tests/example.test.ts': 'package source\n',
    'tools/release/example.test.mjs': 'release source\n',
    // An unrelated asset tree that browser acceptance staging may omit.
    'evidence/unrelated/notes.md': 'unrelated evidence\n'
  };
  const originalBaseline = JSON.parse(readFileSync(new URL('../../../tools/muse3jsparity-readiness/baseline-unit-inventory.json', import.meta.url), 'utf8')) as { schema: string; assertions: string[] };
  const historicalBaseline = { schema: originalBaseline.schema, assertions: originalBaseline.assertions.filter(id => HISTORICAL_ACCEPTANCE_TESTS.some(path => id.startsWith(`${path}::`))) };
  sourceContents[HISTORICAL_ACCEPTANCE_INVENTORY] = JSON.stringify(historicalBaseline);
  sourceContents[HISTORICAL_SOURCE_TEST] = 'synthetic historical analyzer tests\n';
  sourceContents[HISTORICAL_LAUNCHER] = 'synthetic historical acceptance launcher\n';
  sourceContents[HISTORICAL_LAUNCHER_TEST] = 'synthetic historical acceptance launcher tests\n';
  sourceContents[HISTORICAL_REPLAY_TEST] = 'synthetic historical replay source\n';
  sourceContents[HISTORICAL_REPLAY_SOURCE_TEST] = 'synthetic historical replay analyzer tests\n';
  for (const path of [...ARCHIVE_ADMISSION_FILES, ...ARCHIVE_ADMISSION_TESTS]) if (!sourceContents[path]) sourceContents[path] = `synthetic archive admission contract ${path}\n`;
  for (const path of [EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST]) sourceContents[path] = `synthetic external codec contract ${path}\n`;
  for (const fixture of historicalReplayFixtures) sourceContents[fixture.path] = fixture.content;
  for (const path of HISTORICAL_ACCEPTANCE_TESTS) sourceContents[path] = `historical acceptance source ${path}\n`;
  if (omit) delete sourceContents[omit];
  const put = (path: string, data: string | Buffer) => {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, data);
    return { path, sha256: hash(data) };
  };
  const putJson = (path: string, value: unknown) => put(path, `${JSON.stringify(value, null, 2)}\n`);
  for (const [path, data] of Object.entries(sourceContents)) put(path, data);
  const template = join(root, '.synthetic-git-template');
  mkdirSync(template);
  const isolatedGitEnv = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TEMPLATE_DIR: template, GIT_TERMINAL_PROMPT: '0' };
  const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(gitEnvironment, isolatedGitEnv);
  const withIsolatedGit = <T>(action: () => T): T => {
    const previous = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_')));
    for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
    Object.assign(process.env, isolatedGitEnv);
    try { return action(); }
    finally {
      for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
      Object.assign(process.env, previous);
    }
  };
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', env: gitEnvironment
  }).trim();
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-q', '--no-verify', '--no-gpg-sign', '-m', 'synthetic source');
  const commit = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  const entries = Object.keys(sourceContents).sort().map(path => ({ path, sha256: hash(sourceContents[path]), mode: '100644', type: 'file' }));
  const inputDigest = computeInputDigest(entries);
  const fingerprintHash = createHash('sha256');
  for (const entry of entries) fingerprintHash.update(entry.path).update('\0').update(sourceContents[entry.path]).update('\0');
  const fingerprint = fingerprintHash.digest('hex');
  const lockfileSha256 = hash(sourceContents['pnpm-lock.yaml']);
  const manifestPath = `${reportDir}/source-manifest.json`;
  const partialManifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit, tree }, files: entries, administrativeFiles: [], inputDigest, lockfileSha256 };
  const deferredAcceptanceTests = expectedHistoricalAcceptance(partialManifest, historicalBaseline);
  const deferredReplayTests = expectedHistoricalReplay(partialManifest);
  const deferredExternalCodecTests = expectedExternalCodecAcceptance(partialManifest);
  const manifest = { ...partialManifest, deferredAcceptanceTests, deferredReplayTests, deferredExternalCodecTests };
  let manifestRef = putJson(manifestPath, manifest);
  const sourcePlan = nativeSourceInventoryForManifest(manifest, runId);
  const sourceInventory = putJson(`${reportDir}/source-inventory.json`, sourcePlan);

  const names = ['engine', 'react', 'assets', 'input', 'controls', 'navigation-recast'];
  const archivePayloads = Object.fromEntries(names.map(name => [name, syntheticPackageArchive(name)]));
  const candidateArchiveRefs = names.map(name => put(`${reportDir}/candidate-tarballs/${name}.tgz`, archivePayloads[name]));
  const archives = [...candidateArchiveRefs].sort((a, b) => a.path.localeCompare(b.path));
  const planPath = `${reportDir}/candidate-plan.json`;
  const plan = {
    schema: 'aura3d-release-plan/1.0', packOnly: true, version: '0.0.0', commit, lockfileSha256,
    expectedPackageCount: names.length, packageCount: names.length,
    source: { commit, tree, inputDigest, fingerprint, manifestSha256: manifestRef.sha256, lockfileSha256 },
    packages: names.map((name, index) => ({ name: `@aura3d/${name}`, version: '0.0.0', tarball: candidateArchiveRefs[index].path, sha256: candidateArchiveRefs[index].sha256,
      integrity: `sha512-${createHash('sha512').update(archivePayloads[name]).digest('base64')}`, internalDependencies: [] as string[] }))
  };
  let planRef = putJson(planPath, plan);
  const matrixCells = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(reactMajor => ['absent', 'present'].map(peer => ({
    id: `${manager}-react${reactMajor}-peer-${peer}`, manager, reactMajor, peer
  }))));
  const matrixCheckIds = ['install', 'installed-identity', 'javascript-esm', 'condition-node', 'condition-browser', 'typescript-nodenext', 'typescript-bundler', 'react-ssr', 'optional-peer', 'browser-build'];
  const matrixProjectHash = (projectPath: string) => {
    const digest = createHash('sha256');
    const visit = (dir: string, prefix = '') => {
      for (const entry of readdirSync(dir).sort()) {
        if (!prefix && entry === 'node_modules') continue;
        const name = prefix ? `${prefix}/${entry}` : entry, absolute = join(dir, entry), stat = lstatSync(absolute);
        digest.update(name).update('\0');
        if (stat.isDirectory()) { digest.update('directory\0'); visit(absolute, name); }
        else if (stat.isFile()) digest.update('file\0').update(readFileSync(absolute));
        else throw new Error('unsupported synthetic matrix entry');
        digest.update('\0');
      }
    };
    visit(join(root, projectPath));
    return digest.digest('hex');
  };
  const matrixFiles = (projectPath: string) => {
    const files: Array<{ path: string; size: number; sha256: string }> = [];
    const collect = (dir: string, prefix = '') => {
      for (const name of readdirSync(dir).sort()) {
        const relative = prefix ? `${prefix}/${name}` : name, full = join(dir, name), stat = lstatSync(full);
        if (stat.isDirectory()) collect(full, relative);
        else { const data = readFileSync(full); files.push({ path: relative, size: data.byteLength, sha256: hash(data) }); }
      }
    };
    collect(join(root, projectPath));
    return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  };
  const matrixProjects = matrixCells.map(cell => {
    const path = `tests/reports/native-consumer-matrix/${runId}/projects/${cell.id}`;
    const lockfile = cell.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
    const installedPackages = plan.packages.filter(pkg => cell.peer === 'present' || pkg.name !== '@aura3d/navigation-recast');
    const dependencies = Object.fromEntries(installedPackages.map(pkg => [pkg.name, `file:./tarballs/${pkg.tarball.split('/').at(-1)}`]));
    const manifestData = JSON.stringify({ name: `synthetic-${cell.id}`, version: '0.0.0', private: true, dependencies });
    const pnpmLock = `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n${installedPackages.map(pkg => `      '${pkg.name}':\n        specifier: ${dependencies[pkg.name]}\n        version: ${dependencies[pkg.name]}\n`).join('')}packages:\n${installedPackages.map(pkg => `  '${pkg.name}@${dependencies[pkg.name]}':\n    resolution: {integrity: ${pkg.integrity}, tarball: ${dependencies[pkg.name]}}\n`).join('')}snapshots:\n${installedPackages.map(pkg => `  '${pkg.name}@${dependencies[pkg.name]}': {}\n`).join('')}`;
    const lockData = cell.manager === 'npm' ? JSON.stringify({ lockfileVersion: 3, packages: {
      '': { name: `synthetic-${cell.id}`, dependencies },
      ...Object.fromEntries(installedPackages.map(pkg => [`node_modules/${pkg.name}`, { version: pkg.version, resolved: dependencies[pkg.name], integrity: pkg.integrity }]))
    } }) : pnpmLock;
    put(`${path}/package.json`, manifestData); put(`${path}/${lockfile}`, lockData);
    put(`${path}/dist/index.html`, '<!doctype html>'); put(`${path}/dist/assets/client.js`, 'synthetic build');
    const archives = installedPackages.map(pkg => {
      const data = archivePayloads[pkg.name.slice('@aura3d/'.length)], name = pkg.tarball.split('/').at(-1);
      put(`${path}/tarballs/${name}`, data);
      const archive = put(`tests/reports/native-consumer-matrix/${runId}/dependency-archives/${pkg.sha256}.tgz`, data);
      return { resolved: dependencies[pkg.name], ...archive, size: data.byteLength, integrity: pkg.integrity };
    }).sort((a, b) => a.resolved < b.resolved ? -1 : a.resolved > b.resolved ? 1 : 0);
    const files = matrixFiles(path);
    return { ...cell, path, lockfile, retention: 'portable-v1', sourceManifest: { ...manifestRef }, candidateReviews: [], files, archives,
      admission: syntheticAdmissionReceipt(root, manifestPath, planPath, Buffer.from(manifestData), Buffer.from(lockData), cell.manager === 'pnpm'),
      manifestSha256: hash(manifestData), lockfileSha256: hash(lockData), projectSha256: matrixProjectHash(path), installedPackages };
  });
  const matrixChecks = matrixCells.flatMap(cell => matrixCheckIds.map(id => {
    const logPath = `tests/reports/native-consumer-matrix/${runId}/logs/${cell.id}-${id}.log`, log = put(logPath, `synthetic ${cell.id} ${id}`);
    return { project: cell.id, id, status: 'pass', exitCode: 0, command: ['synthetic'], logPath, logSize: Buffer.byteLength(`synthetic ${cell.id} ${id}`), logSha256: log.sha256 };
  }));
  const exampleId = 'capability-example:synthetic', exampleSuffix = 'capability-example-synthetic';
  const exampleWrapper = `tests/reports/native-examples-catalog/${runId}/projects/${exampleSuffix}`;
  const exampleProjectPath = `${exampleWrapper}/examples/native-capability/synthetic`;
  const enginePackage = plan.packages.find(pkg => pkg.name === '@aura3d/engine')!;
  const exampleResolution = `file:aura-candidates/${enginePackage.sha256}.tgz`;
  const exampleDependencies = { '@aura3d/engine': exampleResolution };
  const exampleManifest = JSON.stringify({ name: 'synthetic-example', dependencies: exampleDependencies });
  const exampleLock = JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'synthetic-example', dependencies: exampleDependencies }, 'node_modules/@aura3d/engine': { version: enginePackage.version, integrity: enginePackage.integrity, resolved: exampleResolution } } });
  put(`${exampleWrapper}/package.json`, exampleManifest);
  put(`${exampleWrapper}/package-lock.json`, exampleLock);
  put(`${exampleWrapper}/aura-candidates/${enginePackage.sha256}.tgz`, archivePayloads.engine);
  const exampleArchive = put(`tests/reports/native-examples-catalog/${runId}/dependency-archives/${enginePackage.sha256}.tgz`, archivePayloads.engine);
  put(`${exampleProjectPath}/src/main.ts`, 'export const synthetic = true;\n');
  put(`${exampleProjectPath}/dist/index.html`, '<!doctype html>');
  const exampleRows = (directory: string) => {
    const base = join(root, directory), rows: Array<{ path: string; sha256: string; bytes: number }> = [];
    const visit = (dir: string, prefix = '') => {
      for (const name of readdirSync(dir).sort()) {
        const path = prefix ? `${prefix}/${name}` : name, absolute = join(dir, name), stat = lstatSync(absolute);
        if (stat.isDirectory()) visit(absolute, path);
        else if (stat.isFile()) { const data = readFileSync(absolute); rows.push({ path, sha256: hash(data), bytes: data.byteLength }); }
        else throw new Error('unsupported synthetic example entry');
      }
    };
    visit(base);
    return rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  };
  const exampleSourceHash = () => {
    const digest = createHash('sha256');
    const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'test-results', 'playwright-report', '.cache', 'reports']);
    const visit = (dir: string, prefix = '') => {
      for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
        if (ignored.has(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name, absolute = join(dir, name), stat = lstatSync(absolute);
        if (stat.isDirectory()) visit(absolute, path);
        else if (stat.isFile()) digest.update(path).update('\0').update(readFileSync(absolute)).update('\0');
        else throw new Error('unsupported synthetic example source');
      }
    };
    visit(join(root, exampleWrapper));
    return digest.digest('hex');
  };
  const retainedExampleFiles = exampleRows(exampleWrapper), exampleOutputFiles = exampleRows(`${exampleProjectPath}/dist`);
  const exampleProject = { id: exampleId, path: exampleProjectPath, wrapperPath: exampleWrapper, candidateReviews: [],
    sourceSha256: exampleSourceHash(), retainedFiles: retainedExampleFiles, retainedSha256: hash(JSON.stringify(retainedExampleFiles)),
    manifestSha256: hash(exampleManifest), lockSha256: hash(exampleLock), outputEntry: 'index.html', outputFiles: exampleOutputFiles, outputSha256: hash(JSON.stringify(exampleOutputFiles)),
    verifiedArchives: [{ resolved: exampleResolution, ...exampleArchive }],
    admission: syntheticAdmissionReceipt(root, manifestPath, planPath, Buffer.from(exampleManifest), Buffer.from(exampleLock)),
    installedPackages: [{ name: enginePackage.name, version: enginePackage.version, integrity: enginePackage.integrity, resolved: exampleResolution, tarball: enginePackage.tarball, sha256: enginePackage.sha256 }],
    installedPackageContents: [{ path: 'node_modules/@aura3d/engine', sha256: createHash('sha256').update('package.json\0').update(JSON.stringify({ name: '@aura3d/engine', version: '0.0.0' })).update('\0').digest('hex') }] };
  const exampleChecks = ['install', 'build'].map(id => {
    const log = put(`tests/reports/native-examples-catalog/${runId}/logs/${exampleSuffix}/${id}.log`, `synthetic ${id} log`);
    return { id, status: 'passed', exitCode: 0, command: ['synthetic'], logPath: log.path, logSha256: log.sha256 };
  });
  const consumerArchive = put(`tests/reports/native-consumers/${runId}/dependency-archives/${enginePackage.sha256}.tgz`, archivePayloads.engine);
  const consumerArchiveRow = { resolved: exampleResolution, ...consumerArchive, size: archivePayloads.engine.byteLength, integrity: enginePackage.integrity };
  const consumerProject = (template: 'synthetic' | 'react-import') => {
    const fixture = template === 'react-import';
    const path = fixture ? `tests/reports/native-consumers/${runId}/projects/react-import` : `tests/reports/native-consumers/${runId}/projects/templates/${template}/demo`;
    put(`${path}/package.json`, exampleManifest);
    put(`${path}/package-lock.json`, exampleLock);
    put(`${path}/aura-candidates/${enginePackage.sha256}.tgz`, archivePayloads.engine);
    put(`${path}/dist/index.html`, '<!doctype html>');
    const files = exampleRows(path).map(({ path, bytes: size, sha256 }) => ({ path, size, sha256 }));
    const digest = createHash('sha256');
    const compare = (left: { path: string }, right: { path: string }) => {
      const a = left.path.split('/'), b = right.path.split('/');
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const order = a[i].localeCompare(b[i]); if (order) return order; }
      return a.length - b.length;
    };
    for (const file of [...files].sort(compare)) if (file.path !== 'package-lock.json') digest.update(`file\0${file.path}\0`).update(readFileSync(join(root, path, file.path))).update('\0');
    const contentsSha256 = createHash('sha256').update('file\0package.json\0').update(JSON.stringify({ name: '@aura3d/engine', version: '0.0.0' })).update('\0').digest('hex');
    return { template, kind: fixture ? 'fixture' : 'template', path, entry: 'dist/index.html', retention: 'portable-v1', sourceManifest: { ...manifestRef }, candidateReviews: [], files,
      admission: syntheticAdmissionReceipt(root, manifestPath, planPath, Buffer.from(exampleManifest), Buffer.from(exampleLock)),
      manifestSha256: hash(exampleManifest), lockfileSha256: hash(exampleLock), projectSha256: digest.digest('hex'), archives: [consumerArchiveRow],
      installedPackages: [{ name: enginePackage.name, installPath: 'node_modules/@aura3d/engine', version: enginePackage.version, sha256: enginePackage.sha256, integrity: enginePackage.integrity, contentsSha256 }], substitutions: [] };
  };
  const consumerProjects = [consumerProject('synthetic'), consumerProject('react-import')];
  const consumerChecks = [['launcher', 'install'], ['synthetic', 'scaffold'], ['synthetic', 'install'], ['synthetic', 'build'], ['react-import', 'install'], ['react-import', 'build']].map(([project, name]) => {
    const data = `synthetic ${project} ${name} log`, log = put(`tests/reports/native-consumers/${runId}/logs/${project}-${name}.log`, data);
    return { id: `${project}:${name}`, project, command: ['synthetic'], status: 'passed', exitCode: 0, logPath: log.path, logSize: Buffer.byteLength(data), logSha256: log.sha256 };
  });
  const side = `tests/reports/native-source-inputs/${runId}`, sideFiles = new Map<string, Buffer>();
  const sidePut = (path: string, data: string | Buffer) => { const content = Buffer.isBuffer(data) ? data : Buffer.from(data); sideFiles.set(path, content); return { path, size: content.byteLength, sha256: hash(content) }; };
  const sideJson = (path: string, value: unknown) => sidePut(path, `${JSON.stringify(value, null, 2)}\n`);
  const sideResolution = 'file:tarballs/engine.tgz', sideDependencies = { '@aura3d/engine': sideResolution };
  const sideManifest = JSON.stringify({ name: 'synthetic-sidecar', dependencies: sideDependencies });
  const sideLock = JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: sideDependencies },
    'node_modules/@aura3d/engine': { version: enginePackage.version, resolved: sideResolution, integrity: enginePackage.integrity } } });
  const consumerSideManifest = sidePut(`${side}/consumer-manifest.json`, sideManifest), consumerSideLock = sidePut(`${side}/consumer-lock.json`, sideLock);
  const exampleSideManifest = sidePut(`${side}/example-manifest.json`, exampleManifest), exampleSideLock = sidePut(`${side}/example-lock.json`, exampleLock);
  const candidateSideRow = { resolved: sideResolution, path: enginePackage.tarball, size: archivePayloads.engine.byteLength, sha256: enginePackage.sha256, integrity: enginePackage.integrity };
  const consumerBundlePath = `${side}/consumer-bundle.json`, exampleBundlePath = `${side}/example-bundle.json`, matrixBundlePath = `${side}/matrix/bundle.json`;
  const consumerBundle = { schema: 'aura3d.portable-consumer-input/1', candidatePlanSha256: planRef.sha256, sourceManifestSha256: manifestRef.sha256,
    projects: [{ id: 'synthetic', manifest: consumerSideManifest, lockfile: consumerSideLock, archives: [candidateSideRow], assets: [] }] };
  const exampleBundle = { schema: 'aura3d.native-example-locks/1', runId, candidateSha256: planRef.sha256, sourceInputDigest: inputDigest,
    examples: [{ id: exampleId, manifestSha256: exampleSideManifest.sha256, lockPath: exampleSideLock.path, lockSha256: exampleSideLock.sha256,
      archives: [{ resolved: exampleResolution, path: enginePackage.tarball }] }] };
  const matrixSideCells = matrixProjects.map(project => {
    const prefix = `${side}/matrix/cells/${project.id}`;
    const matrixManifest = sidePut(`${prefix}/package.json`, readFileSync(join(root, project.path, 'package.json')));
    const matrixLock = sidePut(`${prefix}/${project.lockfile}`, readFileSync(join(root, project.path, project.lockfile)));
    const rows = project.archives.map(row => {
      const data = readFileSync(join(root, row.path)), path = `${side}/matrix/archives/${row.sha256}.tgz`;
      sidePut(path, data);
      return { ...row, path };
    });
    return { id: project.id, manager: project.manager, manifest: matrixManifest, lockfile: matrixLock, archives: rows };
  });
  const matrixBundle = { schema: 'aura3d.native-matrix-input/1', candidatePlanSha256: planRef.sha256, sourceManifest: { ...manifestRef }, cells: matrixSideCells };
  const portablePath = `${side}/inputs.json`;
  const writePortableInputs = () => {
    const consumerRef = sideJson(consumerBundlePath, consumerBundle), exampleRef = sideJson(exampleBundlePath, exampleBundle), matrixRef = sideJson(matrixBundlePath, matrixBundle);
    for (const [path, data] of sideFiles) put(path, data);
    const ref = ({ path, sha256 }: { path: string; sha256: string }) => ({ path, sha256 });
    const references = { sourceManifest: { ...manifestRef }, candidatePlan: { ...planRef },
      admissionPolicy: { path: 'tools/release/archive-admission-policy.json', sha256: hash(sourceContents['tools/release/archive-admission-policy.json']) },
      consumerBundle: ref(consumerRef), exampleBundle: ref(exampleRef), matrixBundle: ref(matrixRef), candidateReviews: [], candidateReviewEvidence: [] };
    const envelope = { schema: 'aura3d.native-portable-inputs/1', runId, ...references,
      exampleManifests: [{ id: exampleId, ...exampleSideManifest }],
      files: [...sideFiles].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, data]) => ({ path, size: data.byteLength, sha256: hash(data) })) };
    const inputs = putJson(portablePath, envelope);
    return { ...references, inputs };
  };
  let portableInputs = writePortableInputs();
  const phasePaths = {
    sourceConsumerReport: `tests/reports/native-consumers/${runId}/source.json`,
    matrixSourceReport: `tests/reports/native-consumers/${runId}/matrix-source.json`,
    examplesSourceReport: `tests/reports/native-examples-catalog/${runId}/examples-source.json`
  };
  const base = { schema: 'aura3d.native-consumers/1', phase: 'source', runId };
  const phases: Record<keyof typeof phasePaths, any> = {
    sourceConsumerReport: { ...base, pass: true, candidateReviews: [], candidate: { ...planRef, version: plan.version, packages: plan.packages }, source: { revision: commit, stagedSourceSha256: fingerprint, lockfileSha256, manifest: { ...manifestRef } },
      toolVersions: { node: 'synthetic', npm: 'synthetic' }, projects: consumerProjects, checks: consumerChecks, browser: [{ id: 'synthetic', status: 'not-run' }] },
    matrixSourceReport: { ...base, status: 'pass', candidateReviews: [], candidate: { ...planRef, version: plan.version, packages: plan.packages }, source: { revision: commit, stagedSourceSha256: inputDigest, lockfileSha256, manifest: { ...manifestRef } },
      projects: matrixProjects, checks: matrixChecks, browser: matrixCells.flatMap(cell => ['chromium', 'firefox', 'webkit'].map(browser => ({ id: `${cell.id}/${browser}`, status: 'not-run' }))) },
    examplesSourceReport: { ...base, pass: true, candidateReviews: [], candidatePlan: planPath, candidateSha256: planRef.sha256, source: { ...plan.source }, packages: plan.packages,
      stagedSourceSha256: inputDigest, lockfileSha256, browser: 'not-run', failures: [], projects: [exampleProject], cases: [{ id: exampleId, project: exampleProjectPath, status: 'passed', checks: exampleChecks }] }
  };
  const phaseRefs = () => Object.fromEntries(Object.entries(phases).map(([name, value]) => [name, putJson(phasePaths[name as keyof typeof phasePaths], value)]));
  const initialPhaseRefs = phaseRefs();
  const retainedPaths = { bundleSize: `${reportDir}/bundle-size.json`, installedTreeShaking: `${reportDir}/installed-tree-shaking.json` };
  const bundleBytes = 'synthetic JavaScript bundle', gzipBytes = 'synthetic compressed bundle';
  const bundleArtifact = put(`${reportDir}/bundle-size/example-target.js`, bundleBytes);
  const gzipArtifact = put(`${reportDir}/bundle-size/example-target.js.gz`, gzipBytes);
  const retained: Record<keyof typeof retainedPaths, any> = {
    bundleSize: { schema: 'aura3d-real-bundle-size', pass: true, failures: [],
      checks: ['example-target', 'candidate-identity', 'bundle-artifact-identity', 'real-size-limit-bundle-measurement'].map(id => ({ id, pass: true })),
      targets: [{ id: 'example-target', bundlePath: bundleArtifact.path, bundleSha256: bundleArtifact.sha256, jsBytes: Buffer.byteLength(bundleBytes), gzipPath: gzipArtifact.path, gzipSha256: gzipArtifact.sha256, gzipBytes: Buffer.byteLength(gzipBytes) }],
      candidate: { status: 'bound', releasePlan: { ...planRef }, version: plan.version, source: { ...plan.source } } },
    installedTreeShaking: { schema: 'aura3d.installed-tree-shaking/2', pass: true, failures: [], checks: [{ id: 'installed-target', pass: true }],
      candidate: { releasePlan: { ...planRef }, version: plan.version, source: { ...plan.source } },
      sourceReport: { ...initialPhaseRefs.sourceConsumerReport, runId } }
  };
  const retainedRefs = () => Object.fromEntries(Object.entries(retained).map(([name, value]) => [name, putJson(retainedPaths[name as keyof typeof retainedPaths], value)]));
  const inventories: any[] = [];
  const steps = buildSteps(runId, reportDir, 'patch', sourcePlan).map(step => {
    const id = step.id, argv = step.argv;
    if (typeof id !== 'string' || !(argv === null
      || Array.isArray(argv) && argv.every((arg: unknown): arg is string => typeof arg === 'string'))) {
      throw new Error('invalid canonical fixture step');
    }
    return { id, argv };
  });
  const checks = steps.map(({ id, argv }) => {
    const supplemental = sourcePlan.supplementalChecks.find(check => check.id === id);
    return { id, argv, status: 'passed', started: true, exitCode: 0,
      ...(supplemental ? { runner: supplemental.runner, cwd: supplemental.cwd } : {}),
      ...(() => { const ref = put(`${reportDir}/logs/${id}.log`, `${id} passed\n`); return { log: ref.path, sha256: ref.sha256 }; })(), subruns: [] as any[] };
  });
  const inventoryFiles = sourceTestFileCoverage(sourcePlan, []).expectedTestFiles;
  for (const [id, expected] of Object.entries(inventoryFiles) as Array<[string, string[]]>) {
    const supplemental = sourcePlan.supplementalChecks.find(check => check.id === id);
    if (['packages', 'packages-dist', 'node-release'].includes(id) || supplemental) {
      const subruns = expected.map((file, index) => {
        const content = `TAP version 13\n# Subtest: ${file}\nok 1 - ${file}\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
        const result = put(`${reportDir}/results/${id}/${index}.tap`, content);
        const argv = supplemental ? supplemental.invocations[index].argv
          : id === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file]
          : id === 'packages-dist' ? ['node', '--import', 'tsx', '--test', '--test-reporter=tap', file]
            : ['node', '--test', '--test-reporter=tap', file];
        return { file, argv, exitCode: 0, result, ...(supplemental ? { cwd: supplemental.cwd, signal: null, error: null } : {}) };
      });
      checks.find(check => check.id === id)!.subruns = subruns;
      inventories.push({ checkId: id, expectedFiles: expected, discoveredFiles: expected, testCount: expected.length, passedCount: expected.length,
        failedCount: 0, skippedCount: 0, testNames: [...expected], ...(supplemental ? { runner: supplemental.runner, cwd: supplemental.cwd } : {}) });
    } else {
      const sourceRoot = '/source-job/worktree';
      const result = { success: true, numTotalTests: expected.length, testResults: expected.map(path => ({ name: `${sourceRoot}/${path}`, assertionResults: [{ status: 'passed', title: path, fullName: path }] })) };
      const resultRef = putJson(`${reportDir}/${id}.json`, result);
      inventories.push({ checkId: id, result: resultRef, sourceRoot, ...parseVitestInventory(result, expected, sourceRoot) });
    }
  }
  inventories.sort((a, b) => steps.findIndex(step => step.id === a.checkId) - steps.findIndex(step => step.id === b.checkId));
  const prefixLength = steps.findIndex(step => step.id === 'pack') + 1;
  const prefixChecks = checks.slice(0, prefixLength);
  const prefixInventories = inventories.filter(inventory => prefixChecks.some(check => check.id === inventory.checkId));
  const ids = steps.map(step => step.id);
  const buildProducts = [
    { path: 'dist', mode: '040755', size: 0, sha256: hash('') },
    { path: 'dist/index.js', mode: '100644', size: 1, sha256: hash('x') },
    { path: 'packages/example/dist', mode: '040755', size: 0, sha256: hash('') },
    { path: 'packages/example/dist/index.js', mode: '100644', size: 1, sha256: hash('x') }
  ];
  const productSha = buildProductsDigest(buildProducts);
  const buildPath = `${reportDir}/source-build.json`, rebuiltPath = `${reportDir}/resume-build-products.json`;
  const buildReport = { schema: 'aura3d.native-source-build/1', runId, releaseKind: 'patch', sourceManifestPath: manifestPath,
    sourceManifestSha256: manifestRef.sha256, sourceInventory, expectedCheckIds: prefixChecks.map(step => step.id),
    fullExpectedCheckIds: ids, executedCheckIds: prefixChecks.map(step => step.id), checks: prefixChecks,
    testInventories: prefixInventories, ...sourceTestFileCoverage(sourcePlan, prefixInventories), acceptance: 'not-run',
    completedOutcomeIds: ['synthetic-outcome'], candidatePlan: planRef, archives, buildProducts, buildProductsSha256: productSha };
  let buildRef = putJson(buildPath, buildReport);
  const rebuiltReport = { schema: 'aura3d.native-source-build-products/1', runId, sourceManifest: manifestRef, candidatePlan: planRef, buildProducts, buildProductsSha256: productSha };
  let rebuiltRef = putJson(rebuiltPath, rebuiltReport);
  const ledgerPath = 'docs/prds/aura3d-native-capability-ledger.json';
  putJson(ledgerPath, {
    schema: 'aura3d.native-capability-ledger/1', roadmap: { path: 'docs/prds/aura3d-native-capability-roadmap.md', sha256: hash(roadmap) },
    requiredSourceOutcomeIds: ['synthetic-outcome'], outcomes: [{ id: 'synthetic-outcome', required: true, owner: 'WP-00', description: task,
      references: [{ kind: 'gap', locator: 'G01' }, { kind: 'file', locator: 'src/example.ts' }, { kind: 'task', locator: `sha256:${hash(task)}` }],
      implementation: { files: [{ path: 'src/example.ts', action: 'CREATE' }], symbols: ['example'], publicEntrypoints: ['src/example.ts'] },
      source: { status: 'implemented', completion: 'complete', checks: [{ id: 'unit', status: 'passed', runId, command: 'synthetic', artifactHashes: { log: checks[0].sha256 }, measuredResults: { passed: true } }],
        evidence: [{ id: 'synthetic-evidence', kind: 'source', source: 'synthetic', runId, artifactHashes: { log: checks[0].sha256 }, measuredResults: { passed: true } }], provenance: ['synthetic'] },
      acceptance: { status: 'not-run' } }]
  });
  const sourceReportsPath = `${reportDir}/source-reports.json`, gatePath = `${reportDir}/synthetic-gate.json`;
  const reports: any = { schema: 'aura3d.native-source-reports/1', runId, releaseKind: 'patch', acceptance: 'not-run', deferredAcceptanceTests, deferredReplayTests, deferredExternalCodecTests,
    sourceManifestPath: manifestPath, sourceManifestSha256: manifestRef.sha256, sourceInventory, buildHandoff: buildRef, portableInputs, resumeRebuild: { checkId: 'resume-rebuild', inventory: rebuiltRef, buildProductsSha256: productSha },
    expectedCheckIds: ids, fullExpectedCheckIds: ids, executedCheckIds: ids, checks, testInventories: inventories,
    ...sourceTestFileCoverage(sourcePlan, inventories), completedOutcomeIds: ['synthetic-outcome'], candidatePlan: planRef,
    archives, phaseReports: initialPhaseRefs, retainedReports: retainedRefs() };
  const saveReports = () => putJson(sourceReportsPath, reports);
  saveReports();
  const emit = (overrides: Record<string, unknown> = {}) => withIsolatedGit(() => emitCodeCompleteGate({ root, sourceManifest: manifestPath, sourceReports: sourceReportsPath, ledger: ledgerPath, freezeCommit: commit, out: gatePath, owner: 'synthetic-owner', ...overrides }));
  const saveRehashedEvidence = () => {
    planRef = putJson(planPath, plan);
    buildReport.sourceManifestSha256 = manifestRef.sha256;
    buildReport.candidatePlan = planRef;
    buildRef = putJson(buildPath, buildReport);
    reports.buildHandoff = buildRef;
    rebuiltReport.sourceManifest = manifestRef; rebuiltReport.candidatePlan = planRef;
    rebuiltRef = putJson(rebuiltPath, rebuiltReport); reports.resumeRebuild.inventory = rebuiltRef;
    reports.candidatePlan = planRef;
    reports.phaseReports = phaseRefs();
    for (const name of Object.keys(reports.retainedReports) as Array<keyof typeof retainedPaths>) {
      reports.retainedReports[name] = putJson(retainedPaths[name], retained[name]);
    }
    return saveReports();
  };
  const saveRehashedManifestEvidence = () => {
    manifestRef = putJson(manifestPath, manifest);
    plan.source.manifestSha256 = manifestRef.sha256;
    reports.sourceManifestSha256 = manifestRef.sha256;
    planRef = putJson(planPath, plan);
    phases.sourceConsumerReport.candidate.sha256 = planRef.sha256;
    phases.sourceConsumerReport.source.manifest = { ...manifestRef };
    for (const project of phases.sourceConsumerReport.projects) {
      project.sourceManifest = { ...manifestRef };
      project.admission = syntheticAdmissionReceipt(root, manifestPath, planPath, readFileSync(join(root, project.path, 'package.json')), readFileSync(join(root, project.path, 'package-lock.json')));
    }
    for (const project of phases.examplesSourceReport.projects) project.admission = syntheticAdmissionReceipt(root, manifestPath, planPath, readFileSync(join(root, project.wrapperPath, 'package.json')), readFileSync(join(root, project.wrapperPath, 'package-lock.json')));
    phases.matrixSourceReport.source.manifest = { ...manifestRef };
    for (const project of phases.matrixSourceReport.projects) {
      project.sourceManifest = { ...manifestRef };
      project.admission = syntheticAdmissionReceipt(root, manifestPath, planPath, readFileSync(join(root, project.path, 'package.json')), readFileSync(join(root, project.path, project.lockfile)), project.manager === 'pnpm');
    }
    consumerBundle.candidatePlanSha256 = planRef.sha256; consumerBundle.sourceManifestSha256 = manifestRef.sha256;
    exampleBundle.candidateSha256 = planRef.sha256;
    matrixBundle.candidatePlanSha256 = planRef.sha256; matrixBundle.sourceManifest = { ...manifestRef };
    portableInputs = writePortableInputs(); reports.portableInputs = portableInputs;
    phases.matrixSourceReport.candidate.sha256 = planRef.sha256;
    phases.examplesSourceReport.candidateSha256 = planRef.sha256;
    phases.examplesSourceReport.source = { ...plan.source };
    retained.bundleSize.candidate.releasePlan = { ...planRef };
    retained.bundleSize.candidate.source = { ...plan.source };
    retained.installedTreeShaking.candidate.releasePlan = { ...planRef };
    retained.installedTreeShaking.candidate.source = { ...plan.source };
    retained.installedTreeShaking.sourceReport = { ...phaseRefs().sourceConsumerReport, runId };
    return saveRehashedEvidence();
  };
  const saveRehashedState = () => {
    const reportRef = saveRehashedEvidence();
    const gate = JSON.parse(readFileSync(join(root, gatePath), 'utf8'));
    gate.candidatePlan = planRef;
    gate.sourceReports = reportRef;
    gate.retainedReports = reports.retainedReports;
    gate.buildHandoff = reports.buildHandoff; gate.portableInputs = reports.portableInputs; gate.resumeRebuild = reports.resumeRebuild;
    Object.assign(gate, reports.phaseReports);
    putJson(gatePath, gate);
  };
  return { root, gatePath, manifest, plan, phases, retained, retainedPaths, bundleArtifact, gzipArtifact, consumerArchive, consumerBundlePath, rebuiltReport, matrixCells, matrixProjectHash, matrixFiles, exampleWrapper, exampleProjectPath, exampleArchive, exampleRows, exampleSourceHash, reports, emit, saveRehashedEvidence, saveRehashedManifestEvidence, saveRehashedState };
}

describe('synthetic source gate handoff with mocked admission', () => {
  it('isolates synthetic Git operations from inherited repository and index overrides', () => {
    const sentinel = mkdtempSync(join(tmpdir(), 'a3d-git-sentinel-'));
    temporary.push(sentinel);
    const outside = join(sentinel, 'unrelated-repository');
    const keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'] as const;
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    process.env.GIT_DIR = outside;
    process.env.GIT_WORK_TREE = outside;
    process.env.GIT_INDEX_FILE = join(outside, 'index');
    try {
      const f = handoffFixture();
      expect(f.emit().status).toBe('CODE_COMPLETE_GO');
      expect(existsSync(outside)).toBe(false);
      expect(process.env.GIT_DIR).toBe(outside);
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('emits and revalidates a complete source-only candidate', () => {
    const f = handoffFixture();
    const emitted = f.emit();
    expect(emitted.acceptance).toBe('not-run');
    expect(emitted.deferredAcceptanceTests).toHaveLength(3);
    expect(emitted.deferredAcceptanceTests.flatMap(row => row.assertionIds)).toHaveLength(20);
    expect(emitted.deferredAcceptanceTests.every(row => row.phase === 'acceptance' && row.status === 'not-run')).toBe(true);
    expect(emitted.deferredReplayTests.assertionIds).toHaveLength(9);
    expect(emitted.deferredReplayTests.inapplicableAssertionIds).toHaveLength(2);
    expect(emitted.deferredReplayTests.fixtures).toHaveLength(8);
    expect(emitted.deferredReplayTests).toMatchObject({ phase: 'acceptance', status: 'not-run', currentCandidateBrowserReceipt: false });
    expect(emitted.deferredExternalCodecTests.assertionIds).toHaveLength(2);
    expect(emitted.deferredExternalCodecTests).toMatchObject({ phase: 'acceptance', status: 'not-run', currentCandidateBrowserReceipt: false });
    expect(emitted.retainedReports.bundleSize.path).toBe(f.retainedPaths.bundleSize);
    expect(emitted.buildHandoff.path).toMatch(/source-build\.json$/);
    expect(emitted.sourceInventory).toEqual(f.reports.sourceInventory);
    expect(emitted.inputs).toContain(emitted.sourceInventory.path);
    expect(emitted.expectedCheckIds).toEqual(emitted.executedCheckIds);
    expect(emitted.expectedTestFiles).toEqual(emitted.executedTestFiles);
    expect(emitted.expectedSourceTestFiles).toEqual(emitted.executedSourceTestFiles);
    expect(emitted.executedSourceTestFiles).toContain('tools/agent-templates/cli.test.mjs');
    expect(emitted.resumeRebuild.checkId).toBe('resume-rebuild');
    expect(emitted.portableInputs.candidateReviews).toEqual([]);
    expect(emitted.portableInputs.candidateReviewEvidence).toEqual([]);
    expect(observedAdmissionReviews.npm.at(-1)).toEqual([]);
    expect(observedAdmissionReviews.pnpm.at(-1)).toEqual([]);
    expect(emitted.inputs).toContain(f.consumerBundlePath);
    expect(emitted.retainedReports.installedTreeShaking.path).toBe(f.retainedPaths.installedTreeShaking);
    expect(emitted.inputs).toEqual(expect.arrayContaining(Object.values(f.retainedPaths)));
    expect(emitted.inputs).toEqual(expect.arrayContaining([f.bundleArtifact.path, f.gzipArtifact.path]));
    const consumer = f.phases.sourceConsumerReport.projects[0];
    expect(emitted.inputs).toEqual(expect.arrayContaining([`${consumer.path}/package.json`, `${consumer.path}/package-lock.json`, `${consumer.path}/dist/index.html`, f.consumerArchive.path, f.phases.sourceConsumerReport.checks[0].logPath]));
    const project = f.phases.matrixSourceReport.projects[0], firstLog = f.phases.matrixSourceReport.checks[0].logPath;
    expect(emitted.inputs).toEqual(expect.arrayContaining([`${project.path}/package.json`, `${project.path}/${project.lockfile}`, `${project.path}/dist/assets/client.js`, `${project.path}/tarballs/engine.tgz`, project.archives[0].path, firstLog]));
    expect(emitted.inputs).toEqual(expect.arrayContaining([`${f.exampleWrapper}/package.json`, `${f.exampleWrapper}/package-lock.json`, `${f.exampleProjectPath}/src/main.ts`, `${f.exampleProjectPath}/dist/index.html`, f.exampleArchive.path, f.phases.examplesSourceReport.cases[0].checks[0].logPath]));
    expect(emitted.inputs.some(path => path.split('/').includes('node_modules'))).toBe(false);
    expect(validateAcceptanceGate({ root: f.root, gatePath: f.gatePath }).sourceInputDigest).toBe(f.plan.source.inputDigest);
  });

  it('rejects a source inventory changed after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, f.reports.sourceInventory.path), '{}');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source inventory hash mismatch/);
  });

  it('rejects a coherently rehashed source inventory substitution', () => {
    const inventory = handoffFixture();
    inventory.emit();
    const bytes = '{}';
    writeFileSync(join(inventory.root, inventory.reports.sourceInventory.path), bytes);
    inventory.reports.sourceInventory.sha256 = hash(bytes);
    inventory.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: inventory.root, gatePath: inventory.gatePath })).toThrow(/source inventory differs from the staged manifest/);
  });

  it('rejects an omitted supplemental check in the executed check inventory', () => {
    const executed = handoffFixture();
    executed.emit();
    executed.reports.executedCheckIds = executed.reports.executedCheckIds.filter((id: string) => id !== 'template-node');
    executed.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: executed.root, gatePath: executed.gatePath })).toThrow(/expected\/executed checks/);
  });

  it('rejects substituted executed source test coverage', () => {
    const coverage = handoffFixture();
    coverage.emit();
    coverage.reports.executedSourceTestFiles = [];
    coverage.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: coverage.root, gatePath: coverage.gatePath })).toThrow(/source test coverage mismatch/);
  });

  it('rejects a rehashed failed supplemental invocation', () => {
    const f = handoffFixture();
    f.emit();
    f.reports.checks.find((check: { id: string }) => check.id === 'template-node').subruns[0].exitCode = 1;
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/supplemental invocation did not pass/);
  });

  it.each([
    ['missing original suite', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredAcceptanceTests.pop(); }],
    ['missing assertion', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredAcceptanceTests[0].assertionIds.pop(); }],
    ['changed source-test hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredAcceptanceTests[0].sourceTest.sha256 = 'f'.repeat(64); }],
    ['premature pass status', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredAcceptanceTests[0].status = 'passed'; }]
  ])('rejects a coherently rehashed deferred inventory with %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/deferred acceptance inventory mismatch/);
  });

  it('refuses a coherently rehashed manifest and report that replace a historical assertion', () => {
    const f = handoffFixture();
    f.manifest.deferredAcceptanceTests[0].assertionIds[0] = `${f.manifest.deferredAcceptanceTests[0].path}::different assertion`;
    f.saveRehashedManifestEvidence();
    expect(() => f.emit()).toThrow(/deferred acceptance inventory mismatch/);
  });

  it.each([
    ['missing applicable replay assertion', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.assertionIds.pop(); }],
    ['missing inapplicable replay assertion', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.inapplicableAssertionIds.pop(); }],
    ['changed replay fixture identity', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.fixtures[0].sha256 = 'f'.repeat(64); }],
    ['changed replay source-test identity', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.sourceTest.sha256 = 'f'.repeat(64); }],
    ['premature replay pass status', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.status = 'passed'; }],
    ['false current-candidate receipt', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredReplayTests.currentCandidateBrowserReceipt = true; }]
  ])('rejects a coherently rehashed replay inventory with %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/deferred replay inventory mismatch/);
  });

  it.each([
    ['missing codec assertion', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.assertionIds.pop(); }],
    ['substituted codec assertion', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.assertionIds[0] = `${EXTERNAL_CODEC_TEST}::different assertion`; }],
    ['changed codec policy hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.policy.sha256 = 'f'.repeat(64); }],
    ['changed codec declaration hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.contractTypes.sha256 = 'f'.repeat(64); }],
    ['changed portable scanner hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.portableScanner.sha256 = 'f'.repeat(64); }],
    ['changed codec config', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.config.path = 'different-config'; }],
    ['changed codec source-test hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.sourceTest.sha256 = 'f'.repeat(64); }],
    ['changed codec launcher hash', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.launcher.sha256 = 'f'.repeat(64); }],
    ['premature codec pass status', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.status = 'passed'; }],
    ['false codec browser receipt', (f: ReturnType<typeof handoffFixture>) => { f.reports.deferredExternalCodecTests.currentCandidateBrowserReceipt = true; }]
  ])('rejects a coherently rehashed external codec inventory with %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/deferred external codec inventory mismatch/);
  });

  it.each([
    ['assets-qr', EXTERNAL_CODEC_SOURCE_TEST],
    ['unit', EXTERNAL_CODEC_CONTRACT_TEST],
    ['unit', EXTERNAL_CODEC_LAUNCHER_TEST],
    ['unit', PORTABLE_NPM_LOCK_TEST]
  ])('rejects a missing %s source result for %s', (checkId, path) => {
    const f = handoffFixture();
    f.emit();
    const inventory = f.reports.testInventories.find((item: { checkId: string }) => item.checkId === checkId);
    inventory.expectedFiles = inventory.expectedFiles.filter((file: string) => file !== path);
    inventory.discoveredFiles = inventory.discoveredFiles.filter((file: string) => file !== path);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source test coverage mismatch: executedTestFiles/);
  });

  it('refuses a coherently rehashed manifest and report that omit an external codec assertion', () => {
    const f = handoffFixture();
    f.manifest.deferredExternalCodecTests.assertionIds.pop();
    f.saveRehashedManifestEvidence();
    expect(() => f.emit()).toThrow(/deferred external codec inventory mismatch/);
  });

  it('rejects changed external codec policy bytes after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, EXTERNAL_CODEC_POLICY), 'changed synthetic policy');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source file changed/);
  });

  it('rejects a coherently rehashed report that moves a required source check', () => {
    const f = handoffFixture();
    f.emit();
    const checks = f.reports.checks;
    [checks[0], checks[1]] = [checks[1], checks[0]];
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/canonical phase order/);
  });

  it('rejects a coherently rehashed rebuild that differs from the retained build', () => {
    const f = handoffFixture();
    f.emit();
    f.rebuiltReport.buildProducts = f.rebuiltReport.buildProducts.map((row, index) => index === 1 ? { ...row, sha256: 'f'.repeat(64) } : row);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source rebuild inventory mismatch/);
  });

  it('rejects changed portable input bytes after source gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, f.consumerBundlePath), 'changed sidecar');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/PORTABLE_INPUTS/);
  });

  it.each([
    ['source report', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.sourceConsumerReport.candidateReviews = [ref]; }],
    ['matrix report', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.matrixSourceReport.candidateReviews = [ref]; }],
    ['examples report', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.examplesSourceReport.candidateReviews = [ref]; }],
    ['consumer project', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.sourceConsumerReport.projects[0].candidateReviews = [ref]; }],
    ['matrix project', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.matrixSourceReport.projects[0].candidateReviews = [ref]; }],
    ['example project', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.phases.examplesSourceReport.projects[0].candidateReviews = [ref]; }],
    ['portable reviews', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.reports.portableInputs.candidateReviews = [ref]; }],
    ['portable review evidence', (f: ReturnType<typeof handoffFixture>, ref: { path: string; sha256: string }) => { f.reports.portableInputs.candidateReviewEvidence = [ref]; }]
  ])('rejects a rehashed %s with a reference absent from verified inputs', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f, { path: f.consumerBundlePath, sha256: '0'.repeat(64) });
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/review inventory mismatch|project identity|portable source input inventory mismatch/);
  });

  it('rejects changed portable consumer project files, archives and logs', () => {
    const project = handoffFixture();
    project.emit();
    writeFileSync(join(project.root, project.phases.sourceConsumerReport.projects[0].path, 'dist/index.html'), 'changed output');
    expect(() => validateAcceptanceGate({ root: project.root, gatePath: project.gatePath })).toThrow(/consumer retained file inventory mismatch/);

    const archive = handoffFixture();
    archive.emit();
    writeFileSync(join(archive.root, archive.consumerArchive.path), 'changed archive');
    expect(() => validateAcceptanceGate({ root: archive.root, gatePath: archive.gatePath })).toThrow(/consumer archive is unsafe|consumer archive bytes changed/);

    const log = handoffFixture();
    log.emit();
    writeFileSync(join(log.root, log.phases.sourceConsumerReport.checks[0].logPath), 'changed log');
    expect(() => validateAcceptanceGate({ root: log.root, gatePath: log.gatePath })).toThrow(/consumer source log hash mismatch/);
  });

  it('rejects extra files or symlinks in portable consumers', () => {
    const extra = handoffFixture();
    extra.emit();
    writeFileSync(join(extra.root, extra.phases.sourceConsumerReport.projects[0].path, 'extra.txt'), 'extra');
    expect(() => validateAcceptanceGate({ root: extra.root, gatePath: extra.gatePath })).toThrow(/consumer retained file inventory mismatch/);

    const linked = handoffFixture();
    linked.emit();
    symlinkSync('package.json', join(linked.root, linked.phases.sourceConsumerReport.projects[0].path, 'link.json'));
    expect(() => validateAcceptanceGate({ root: linked.root, gatePath: linked.gatePath })).toThrow(/symlink/);
  });

  it.each([
    ['missing scaffold project', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.projects.shift(); }],
    ['missing scaffold check', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.checks = f.phases.sourceConsumerReport.checks.filter((check: { id: string }) => check.id !== 'synthetic:scaffold'); }],
    ['premature browser result', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.browser[0].status = 'passed'; }],
    ['stale admission receipt', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.projects[0].admission.lockSha256 = 'f'.repeat(64); }],
    ['changed installed content digest', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.projects[0].installedPackages[0].contentsSha256 = 'f'.repeat(64); }]
  ])('rejects a rehashed portable consumer report with %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow();
  });

  it('rejects changed retained matrix project and log bytes', () => {
    const projectFixture = handoffFixture();
    projectFixture.emit();
    const project = projectFixture.phases.matrixSourceReport.projects[0];
    writeFileSync(join(projectFixture.root, project.path, 'dist/assets/client.js'), 'changed client');
    expect(() => validateAcceptanceGate({ root: projectFixture.root, gatePath: projectFixture.gatePath })).toThrow(/matrix project changed/);

    const logFixture = handoffFixture();
    logFixture.emit();
    const log = logFixture.phases.matrixSourceReport.checks[0].logPath;
    writeFileSync(join(logFixture.root, log), 'changed log');
    expect(() => validateAcceptanceGate({ root: logFixture.root, gatePath: logFixture.gatePath })).toThrow(/log hash mismatch/);
  });

  it('rejects altered matrix archives even when the project fingerprint is updated', () => {
    const f = handoffFixture();
    f.emit();
    const project = f.phases.matrixSourceReport.projects[0];
    writeFileSync(join(f.root, project.path, 'tarballs/engine.tgz'), 'different archive');
    project.projectSha256 = f.matrixProjectHash(project.path);
    project.files = f.matrixFiles(project.path);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/archive.*hash mismatch/);
  });

  it('rejects a changed matrix lockfile even when the project fingerprint is updated', () => {
    const f = handoffFixture();
    f.emit();
    const project = f.phases.matrixSourceReport.projects[0];
    writeFileSync(join(f.root, project.path, project.lockfile), 'different lock');
    project.projectSha256 = f.matrixProjectHash(project.path);
    project.files = f.matrixFiles(project.path);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/lockfile hash mismatch/);
  });

  it('refuses unstaged empty directories or symlinks inside retained matrix projects', () => {
    const empty = handoffFixture();
    empty.emit();
    mkdirSync(join(empty.root, empty.phases.matrixSourceReport.projects[0].path, 'empty'));
    expect(() => validateAcceptanceGate({ root: empty.root, gatePath: empty.gatePath })).toThrow(/empty matrix project directory/);

    const linked = handoffFixture();
    linked.emit();
    symlinkSync('package.json', join(linked.root, linked.phases.matrixSourceReport.projects[0].path, 'link.json'));
    expect(() => validateAcceptanceGate({ root: linked.root, gatePath: linked.gatePath })).toThrow(/matrix project symlink/);
  });

  it.each([
    ['missing project', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.projects.pop(); }],
    ['failed source check', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.checks[0].status = 'fail'; }],
    ['stale pnpm admission', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.projects.find((project: { manager: string }) => project.manager === 'pnpm').admission.lockFormat = 'npm'; }],
    ['premature browser result', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.browser[0].status = 'pass'; }]
  ])('rejects a coherently rehashed matrix report with %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow();
  });

  it('rejects a changed retained example source or output file', () => {
    const source = handoffFixture();
    source.emit();
    writeFileSync(join(source.root, source.exampleProjectPath, 'src/main.ts'), 'changed source');
    expect(() => validateAcceptanceGate({ root: source.root, gatePath: source.gatePath })).toThrow(/example retained source inventory mismatch/);

    const output = handoffFixture();
    output.emit();
    writeFileSync(join(output.root, output.exampleProjectPath, 'dist/index.html'), 'changed output');
    expect(() => validateAcceptanceGate({ root: output.root, gatePath: output.gatePath })).toThrow(/example retained source inventory mismatch/);
  });

  it('rejects missing or coherently altered example output inventory', () => {
    const f = handoffFixture();
    f.emit();
    f.phases.examplesSourceReport.projects[0].outputFiles[0].sha256 = 'f'.repeat(64);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example retained output inventory mismatch/);
  });

  it('rejects missing or changed retained example dependency archives', () => {
    const missing = handoffFixture();
    missing.emit();
    rmSync(join(missing.root, missing.exampleArchive.path));
    expect(() => validateAcceptanceGate({ root: missing.root, gatePath: missing.gatePath })).toThrow();

    const changed = handoffFixture();
    changed.emit();
    writeFileSync(join(changed.root, changed.exampleArchive.path), 'changed archive');
    expect(() => validateAcceptanceGate({ root: changed.root, gatePath: changed.gatePath })).toThrow(/example verified archive hash mismatch/);
  });

  it('rejects a coherently rehashed example report with a duplicate archive resolution', () => {
    const f = handoffFixture();
    f.emit();
    const rows = f.phases.examplesSourceReport.projects[0].verifiedArchives;
    rows.push({ ...rows[0] });
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example verified archive inventory is invalid/);
  });

  it('rejects an undeclared example source log', () => {
    const f = handoffFixture();
    f.emit();
    const log = f.phases.examplesSourceReport.cases[0].checks[0].logPath;
    writeFileSync(join(f.root, dirname(log), 'unexpected.log'), 'unrecorded');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example source log inventory/);
  });

  it('rejects a changed local candidate even when its example inventories are rehashed', () => {
    const f = handoffFixture();
    f.emit();
    const project = f.phases.examplesSourceReport.projects[0];
    writeFileSync(join(f.root, f.exampleWrapper, 'aura-candidates', `${f.plan.packages[0].sha256}.tgz`), 'changed local archive');
    project.retainedFiles = f.exampleRows(f.exampleWrapper);
    project.retainedSha256 = hash(JSON.stringify(project.retainedFiles));
    project.sourceSha256 = f.exampleSourceHash();
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example local candidate archive mismatch/);
  });

  it('rejects a substituted installed-package content digest in a rehashed example report', () => {
    const f = handoffFixture();
    f.emit();
    f.phases.examplesSourceReport.projects[0].installedPackageContents[0].sha256 = 'f'.repeat(64);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example installed content differs from candidate archive/);
  });

  it('refuses an external example dependency with no archive despite rehashed source records', () => {
    const f = handoffFixture();
    f.emit();
    const project = f.phases.examplesSourceReport.projects[0];
    const manifestPath = join(f.root, f.exampleWrapper, 'package.json'), lockPath = join(f.root, f.exampleWrapper, 'package-lock.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')), lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    manifest.devDependencies = { vite: '^1' };
    lock.packages[''].devDependencies = manifest.devDependencies;
    lock.packages['node_modules/vite'] = { version: '1.0.0', resolved: 'https://registry.npmjs.org/vite/-/vite-1.0.0.tgz', integrity: f.plan.packages[0].integrity };
    const manifestBytes = JSON.stringify(manifest), lockBytes = JSON.stringify(lock);
    writeFileSync(manifestPath, manifestBytes); writeFileSync(lockPath, lockBytes);
    project.manifestSha256 = hash(manifestBytes); project.lockSha256 = hash(lockBytes);
    project.retainedFiles = f.exampleRows(f.exampleWrapper);
    project.retainedSha256 = hash(JSON.stringify(project.retainedFiles));
    project.sourceSha256 = f.exampleSourceHash();
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/archive is missing/);
  });

  it('rejects a coherently rehashed example lock with a noncandidate package', () => {
    const f = handoffFixture();
    f.emit();
    const project = f.phases.examplesSourceReport.projects[0];
    const badLock = JSON.stringify({ packages: { '': {}, 'node_modules/@aura3d/engine': { version: 'different', integrity: f.plan.packages[0].integrity, resolved: 'file:engine.tgz' } } });
    writeFileSync(join(f.root, f.exampleWrapper, 'package-lock.json'), badLock);
    project.lockSha256 = hash(badLock);
    project.retainedFiles = f.exampleRows(f.exampleWrapper);
    project.retainedSha256 = hash(JSON.stringify(project.retainedFiles));
    project.sourceSha256 = f.exampleSourceHash();
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/example lock candidate identity mismatch/);
  });

  it('rejects example secret paths, secret text and symlinks without revealing content', () => {
    const privatePath = handoffFixture();
    privatePath.emit();
    writeFileSync(join(privatePath.root, privatePath.exampleWrapper, '.env.local'), 'private data');
    expect(() => validateAcceptanceGate({ root: privatePath.root, gatePath: privatePath.gatePath })).toThrow(/private or unsafe path/);

    const secret = handoffFixture();
    secret.emit();
    const sensitiveValue = 'synthetic-sensitive-marker';
    writeFileSync(join(secret.root, secret.exampleProjectPath, 'src/main.ts'), `access_token=${sensitiveValue}`);
    try {
      validateAcceptanceGate({ root: secret.root, gatePath: secret.gatePath });
      throw new Error('expected secret rejection');
    } catch (error) {
      expect(String(error)).toMatch(/sensitive content/);
      expect(String(error)).not.toContain(sensitiveValue);
    }

    const linked = handoffFixture();
    linked.emit();
    symlinkSync('package.json', join(linked.root, linked.exampleWrapper, 'link.json'));
    expect(() => validateAcceptanceGate({ root: linked.root, gatePath: linked.gatePath })).toThrow(/symlink/);

    const empty = handoffFixture();
    empty.emit();
    mkdirSync(join(empty.root, empty.exampleWrapper, 'empty'));
    expect(() => validateAcceptanceGate({ root: empty.root, gatePath: empty.gatePath })).toThrow(/empty directory cannot be staged/);
  });

  it('rejects a changed first-party replay fixture after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, historicalReplayFixtures[0].path), 'changed historical fixture');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source file changed/);
  });

  it('rejects retained source report bytes changed after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, f.retainedPaths.bundleSize), '{}');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/bundleSize hash mismatch/);
  });

  it('rejects a changed retained bundle artifact after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    writeFileSync(join(f.root, f.bundleArtifact.path), 'changed bundle');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/JavaScript hash mismatch/);
  });

  it.each([
    ['missing bundle report', (f: ReturnType<typeof handoffFixture>) => { delete f.reports.retainedReports.bundleSize; }],
    ['missing installed-consumer report', (f: ReturnType<typeof handoffFixture>) => { delete f.reports.retainedReports.installedTreeShaking; }],
    ['failed bundle report', (f: ReturnType<typeof handoffFixture>) => { f.retained.bundleSize.pass = false; }],
    ['missing bundle measurement', (f: ReturnType<typeof handoffFixture>) => { f.retained.bundleSize.checks = f.retained.bundleSize.checks.filter((check: { id: string }) => check.id !== 'candidate-identity'); }],
    ['incorrect bundle byte count', (f: ReturnType<typeof handoffFixture>) => { f.retained.bundleSize.targets[0].jsBytes += 1; }],
    ['stale bundle candidate', (f: ReturnType<typeof handoffFixture>) => { f.retained.bundleSize.candidate.releasePlan.sha256 = 'f'.repeat(64); }],
    ['failed installed-consumer report', (f: ReturnType<typeof handoffFixture>) => { f.retained.installedTreeShaking.checks[0].pass = false; }],
    ['stale installed-consumer source', (f: ReturnType<typeof handoffFixture>) => { f.retained.installedTreeShaking.sourceReport.sha256 = 'f'.repeat(64); }],
    ['stale installed-consumer candidate', (f: ReturnType<typeof handoffFixture>) => { f.retained.installedTreeShaking.candidate.source.inputDigest = 'f'.repeat(64); }]
  ])('rejects a coherently rehashed %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/retained/);
  });

  it.each([HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST])('refuses a candidate without the required historical acceptance source %s', path => {
    const f = handoffFixture(path);
    expect(() => f.emit()).toThrow(/historical acceptance (?:launcher|source test)/);
  });

  it.each(['unit-dist', 'unit-packed'])('rejects a missing %s inventory after a synthetic gate is emitted', id => {
    const f = handoffFixture();
    f.emit();
    f.reports.testInventories = f.reports.testInventories.filter((inventory: { checkId: string }) => inventory.checkId !== id);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source test coverage mismatch: executedTestFiles/);
  });

  it.each([
    ['failed consumer', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.pass = false; }],
    ['stale matrix source', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.source.revision = 'f'.repeat(40); }],
    ['mismatched source lock', (f: ReturnType<typeof handoffFixture>) => { f.phases.sourceConsumerReport.source.lockfileSha256 = 'f'.repeat(64); }],
    ['failed matrix', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.status = 'fail'; }],
    ['matrix from a different candidate', (f: ReturnType<typeof handoffFixture>) => { f.phases.matrixSourceReport.candidate.sha256 = 'f'.repeat(64); }],
    ['premature browser result', (f: ReturnType<typeof handoffFixture>) => { f.phases.examplesSourceReport.browser = 'passed'; }],
    ['failed examples', (f: ReturnType<typeof handoffFixture>) => { f.phases.examplesSourceReport.pass = false; }]
  ])('rejects a coherently rehashed %s report during gate validation', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/is invalid/);
  });

  it('refuses emission when an otherwise rehashed source report failed', () => {
    const f = handoffFixture();
    f.phases.sourceConsumerReport.pass = false;
    f.saveRehashedEvidence();
    expect(() => f.emit()).toThrow(/sourceConsumerReport is invalid/);
  });

  it.each([
    ['input digest', (f: ReturnType<typeof handoffFixture>) => { f.plan.source.inputDigest = 'f'.repeat(64); }],
    ['source fingerprint', (f: ReturnType<typeof handoffFixture>) => { f.plan.source.fingerprint = 'f'.repeat(64); }],
    ['manifest digest', (f: ReturnType<typeof handoffFixture>) => { f.plan.source.manifestSha256 = 'f'.repeat(64); }],
    ['source tree', (f: ReturnType<typeof handoffFixture>) => { f.plan.source.tree = 'f'.repeat(40); }]
  ])('rejects a coherently rehashed candidate plan with the wrong %s', (_label, mutate) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    f.saveRehashedState();
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/candidate plan source identity mismatch/);
  });
});

describe('code-complete outcome inventory', () => {
  const ledgerPath = 'docs/prds/aura3d-native-capability-ledger.json';
  const editLedger = (root: string, edit: (ledger: any) => void) => {
    const path = join(root, ledgerPath);
    const ledger = JSON.parse(readFileSync(path, 'utf8'));
    edit(ledger);
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  };
  const renameEverywhere = (ledger: any) => {
    ledger.requiredSourceOutcomeIds = ['different-outcome'];
    ledger.outcomes[0].id = 'different-outcome';
  };

  it('refuses an equal-count ledger whose outcome IDs differ from the completed source outcomes', () => {
    const f = handoffFixture();
    editLedger(f.root, renameEverywhere);
    expect(f.reports.completedOutcomeIds).toHaveLength(1);
    expect(() => f.emit()).toThrow(/required\/completed outcomes differ/);
  });

  it('refuses an equal-count outcome list whose IDs differ from the required IDs', () => {
    const f = handoffFixture();
    editLedger(f.root, ledger => { ledger.outcomes[0].id = 'different-outcome'; });
    expect(() => f.emit()).toThrow(/ledger required\/outcome IDs differ/);
  });

  it.each([
    ['a missing owner', (row: any) => { delete row.owner; }],
    ['a blank owner', (row: any) => { row.owner = ' '; }],
    ['a malformed owner', (row: any) => { row.owner = 'integration-owner'; }],
    ['an owner absent from the roadmap', (row: any) => { row.owner = 'WP-99'; }],
    ['a non-required row', (row: any) => { row.required = false; }]
  ])('refuses an outcome with %s', (_label, mutate) => {
    const f = handoffFixture();
    editLedger(f.root, ledger => mutate(ledger.outcomes[0]));
    expect(() => f.emit()).toThrow(/unowned or incomplete outcome synthetic-outcome/);
  });

  it('rejects an equal-count outcome substitution or an unowned outcome after gate emission', () => {
    const f = handoffFixture();
    f.emit();
    const original = readFileSync(join(f.root, ledgerPath));
    editLedger(f.root, renameEverywhere);
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/required\/completed outcomes differ/);
    writeFileSync(join(f.root, ledgerPath), original);
    editLedger(f.root, ledger => { ledger.outcomes[0].owner = 'WP-99'; });
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/unowned or incomplete outcome/);
    writeFileSync(join(f.root, ledgerPath), original);
    expect(validateAcceptanceGate({ root: f.root, gatePath: f.gatePath }).completedOutcomeIds).toEqual(['synthetic-outcome']);
  });
});

describe('5.0 scope outcome inventory', () => {
  // Inline fixtures under tests/reports (not a source input), never the real scope doc.
  const scopePath = 'tests/reports/native-capabilities/synthetic/scope.md';
  const header = '| ID | Task | Label | Remaining work |\n| --- | --- | --- | --- |\n';
  const scopeDoc = (rows: string, defects = '') => `# Synthetic scope\n\n## Counts\n\n| WP | FINISH-5.0 |\n| --- | ---: |\n| WP-00 | 1 |\n\n### WP-00\n\n${header}${rows}${defects ? `\n## Named defects (always FINISH-5.0)\n\n${header}${defects}` : ''}`;
  const baseRows = '| synthetic-outcome | Synthetic capability | FINISH-5.0 | Verify-only. |\n'
    + '| S5-EXP-01 | Opt-in path | EXPERIMENTAL-5.0 | Ship experimental; WebGL2 fallback reported. |\n'
    + '| S5-SUP-01 | Custody runner | SUPERSEDED-PROCESS | Replaced by ACR source pass. |\n';
  const write = (root: string, text: string, path = scopePath) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };

  it('emits with exact scope set equality, lists experimental and superseded rows, binds the scope digest and keeps the ledger as history', () => {
    const f = handoffFixture();
    const text = scopeDoc(baseRows);
    write(f.root, text);
    const record = f.emit({ scope: scopePath });
    expect(record.outcomeSource).toBe('aura3d-5.0-scope');
    expect(record.scope).toEqual({ path: scopePath, sha256: hash(text) });
    expect(record.requiredOutcomeIds).toEqual(['synthetic-outcome']);
    expect(record.completedOutcomeIds).toEqual(['synthetic-outcome']);
    expect(record.experimentalOutcomes).toEqual([{ id: 'S5-EXP-01', label: 'EXPERIMENTAL-5.0', task: 'Opt-in path', fallback: 'WebGL2 fallback reported.' }]);
    expect(record.supersededOutcomes).toEqual([{ id: 'S5-SUP-01', label: 'SUPERSEDED-PROCESS', task: 'Custody runner', replacement: 'Replaced by ACR source pass.' }]);
    expect(record.ledgerRole).toBe('historical-reference');
    expect(record.inputs).toEqual(expect.arrayContaining([scopePath, 'docs/prds/aura3d-native-capability-ledger.json']));
    expect(validateAcceptanceGate({ root: f.root, gatePath: f.gatePath }).requiredOutcomeIds).toEqual(['synthetic-outcome']);
    write(f.root, scopeDoc(`${baseRows}| S5-EXP-02 | Another opt-in | EXPERIMENTAL-5.0 | Later. |\n`));
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/gate field mismatch: scope/);
  });

  it('rejects a required FINISH or named-defect ID missing from the completed outcomes', () => {
    const f = handoffFixture();
    write(f.root, scopeDoc(baseRows, '| S5-DEF-01 | Named defect | FINISH-5.0 | Fix it. |\n'));
    expect(() => f.emit({ scope: scopePath })).toThrow(/missing \(required but not completed\): S5-DEF-01/);
    write(f.root, scopeDoc(`${baseRows}| S5-WP01-01 | Second capability | FINISH-5.0 | Code. |\n`));
    expect(() => f.emit({ scope: scopePath })).toThrow(/missing \(required but not completed\): S5-WP01-01/);
  });

  it('rejects a completed ID outside the scope required set, including experimental rows', () => {
    const f = handoffFixture();
    write(f.root, scopeDoc('| S5-WP01-01 | Capability | FINISH-5.0 | Code. |\n| synthetic-outcome | Opt-in | EXPERIMENTAL-5.0 | Fallback. |\n'));
    expect(() => f.emit({ scope: scopePath })).toThrow(/extra \(completed but not in scope required set\): synthetic-outcome/);
    expect(() => compareScopeOutcomes(['a'], ['a', 'b'])).toThrow(/scope required\/completed outcomes differ; extra \(completed but not in scope required set\): b$/);
    expect(() => compareScopeOutcomes(['a', 'b'], ['a'])).toThrow(/differ; missing \(required but not completed\): b$/);
    expect(() => compareScopeOutcomes(['a'], ['a', 'a'])).toThrow(/duplicates: a/);
  });

  it.each([
    ['a missing scope file', null, /cannot read scope file/],
    ['no FINISH rows', scopeDoc('| S5-EXP-01 | Opt-in | EXPERIMENTAL-5.0 | Fallback. |\n'), /no FINISH-5\.0 rows/],
    ['duplicate IDs', scopeDoc(`${baseRows}| S5-EXP-01 | Again | EXPERIMENTAL-5.0 | Fallback. |\n`), /duplicate scope row ID: S5-EXP-01/],
    ['an unknown label', scopeDoc(`${baseRows}| S5-WP01-01 | Capability | MAYBE-5.0 | Code. |\n`), /unknown scope label for S5-WP01-01/],
    ['a malformed row ID', scopeDoc(`${baseRows}| not an id | Capability | FINISH-5.0 | Code. |\n`), /malformed scope row ID/],
    ['a superseded named defect', scopeDoc(baseRows, '| S5-DEF-01 | Defect | SUPERSEDED-PROCESS | Gone. |\n'), /named defect S5-DEF-01 cannot be SUPERSEDED-PROCESS/]
  ])('fails closed on %s', (_label, text, message) => {
    const f = handoffFixture();
    const path = text === null ? 'tests/reports/native-capabilities/synthetic/absent-scope.md' : scopePath;
    if (text !== null) write(f.root, text);
    expect(() => f.emit({ scope: path })).toThrow(message);
    expect(existsSync(join(f.root, f.gatePath))).toBe(false);
  });

  it('ignores label-less tables and counts named-defect rows as required', () => {
    const parsed = parseScopeOutcomes(`${scopeDoc(baseRows, '| S5-DEF-01 | Defect | FINISH-5.0 | Fix. |\n')}\n## Acceptance-only rows\n\n| ID | WP | Task | Phase B work |\n| --- | --- | --- | --- |\n| S5-ACC-01 | WP-12 | Device run | Later. |\n`);
    expect(parsed.required).toEqual(['synthetic-outcome', 'S5-DEF-01']);
    expect(parsed.rows.map(row => row.id)).not.toContain('S5-ACC-01');
  });
});

/**
 * Every acceptance entrypoint must validate the global code-complete gate
 * before it submits a job, launches a browser or subprocess, restores a
 * consumer or reads candidate measurements. Each row names the earliest
 * guarded operation; discovery below fails when a new gate consumer appears
 * without a row here.
 */
const ACCEPTANCE_ENTRYPOINTS: ReadonlyArray<{ file: string; after?: string; gate: string; execution: string }> = [
  { file: 'tools/remote-acr/run.sh', gate: 'native-capability-gate/index.mjs --phase acceptance', execution: '"$AZ_WRAPPER" account show' },
  { file: 'tools/remote-acr/Dockerfile.playwright', gate: 'native-capability-gate/index.mjs --phase acceptance', execution: 'RUN pnpm install --frozen-lockfile' },
  { file: 'tools/remote-acr/task-run.sh', gate: 'native-capability-gate/index.mjs --phase acceptance', execution: 'pnpm exec playwright test' },
  { file: 'tools/remote-acr/historical-acceptance.mjs', after: 'function main(args)', gate: 'loadReplayGate(root, gatePath)', execution: 'spawnSync(process.execPath' },
  { file: 'tools/remote-acr/historical-acceptance.mjs', after: "options['--phase'] === 'prepare'", gate: 'validateAcceptanceGate(', execution: 'spawnSync(process.execPath' },
  { file: 'tools/remote-acr/external-codec-run.mjs', after: 'export function runCodecPreflight', gate: 'validateGate()', execution: 'validateFixtures(' },
  { file: 'tools/package-clean-install/index.ts', after: 'async function runBrowser(', gate: 'validateAcceptanceGate(', execution: 'restorePortableConsumerProject(' },
  { file: 'tools/native-consumer-matrix/index.ts', after: 'export async function restoreReactConsumers', gate: 'assertGate(', execution: 'restoreMatrixProject(' },
  { file: 'tools/native-runtime-audit/index.ts', after: 'export async function runBrowserAudit', gate: 'await validateGate(', execution: 'readFileSync(' },
  { file: 'tools/performance/native-benchmark.ts', after: 'export async function analyzeNativeBenchmark', gate: 'await validateGate(', execution: 'readWorkloadSources(' },
  { file: 'tests/browser/native-cross-browser.spec.ts', gate: '"tools/native-capability-gate/index.mjs", "--phase", "acceptance"', execution: 'await startExampleDevServer()' },
  { file: 'tests/browser/native-performance-probe.spec.ts', after: 'test.beforeAll', gate: 'validator.validateAcceptanceGate(', execution: 'await startExampleDevServer()' },
  { file: 'tests/browser/native-examples-catalog.spec.ts', after: 'test.describe("packed native example catalog"', gate: 'gateModule.validateAcceptanceGate(', execution: 'test("all supported' },
  { file: 'tests/browser/native-offline-independence.spec.ts', gate: 'gateModule.validateAcceptanceGate(', execution: 'restoreMatrixProject(' },
  { file: 'tests/browser/native-offline-environments.spec.ts', after: 'const gateModulePath', gate: 'gateModule.validateAcceptanceGate(', execution: 'page.goto(' },
  { file: 'tests/acceptance/gltf-external-decoder-fixtures.test.ts', gate: 'validateAcceptanceGate({ root, gatePath })', execution: 'describe(' },
  { file: 'tests/unit/tools/honest-public-claims.test.ts', gate: 'validateAcceptanceGate({ gatePath: acceptanceGate })', execution: 'describe(' },
  { file: 'tests/unit/tools/developer-value.test.ts', gate: 'validateAcceptanceGate({ gatePath: acceptanceGate })', execution: 'describe(' },
  { file: 'tests/unit/tools/release-metrics-rollup.test.ts', gate: 'validateAcceptanceGate({ gatePath: acceptanceGate })', execution: 'describe(' }
];
// Files that reference the gate only to test or describe it.
const NON_ENTRYPOINT_GATE_REFERENCES = new Set(['tests/unit/tools/native-capability-gate.test.ts', 'tests/unit/tools/native-external-codec-launcher.test.ts']);

describe('acceptance entrypoint gate coverage', () => {
  const repo = new URL('../../../', import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, repo), 'utf8');

  it.each(ACCEPTANCE_ENTRYPOINTS.map(row => [`${row.file}${row.after ? ` (${row.after})` : ''}`, row] as const))(
    '%s validates the gate before its first guarded operation', (_label, row) => {
      const text = read(row.file);
      const start = row.after ? text.indexOf(row.after) : 0;
      expect(start, `anchor ${row.after}`).toBeGreaterThanOrEqual(0);
      const gate = text.indexOf(row.gate, start), execution = text.indexOf(row.execution, start);
      expect(gate, `gate call ${row.gate}`).toBeGreaterThanOrEqual(0);
      expect(execution, `guarded operation ${row.execution}`).toBeGreaterThan(gate);
    });

  it('lists every repository file that invokes the acceptance gate', () => {
    const call = /validateAcceptanceGate\s*\(|native-capability-gate\/index\.mjs"?,?\s*"?--phase"?,?\s*"?acceptance/;
    const found: string[] = [];
    const skip = new Set(['node_modules', 'reports', '_quarantine', 'native-capability-gate', '.git', 'dist']);
    const walk = (dir: string) => {
      for (const entry of readdirSync(new URL(dir, repo), { withFileTypes: true })) {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(`${path}/`); continue; }
        if (/\.(?:[cm]?[jt]s|sh)$|^Dockerfile/.test(entry.name) && call.test(read(path))) found.push(path);
      }
    };
    walk('tools/'); walk('tests/');
    const listed = new Set(ACCEPTANCE_ENTRYPOINTS.map(row => row.file));
    expect(found.filter(path => !listed.has(path) && !NON_ENTRYPOINT_GATE_REFERENCES.has(path)).sort()).toEqual([]);
    // Injected-validator rows (validateGate) are wired through their CLI and are covered by the ordering rows above.
    for (const row of ACCEPTANCE_ENTRYPOINTS) if (!row.gate.includes('validateGate')) expect(found, `${row.file} no longer invokes the gate`).toContain(row.file);
  });
});

describe('staged browser acceptance context', () => {
  const omittedPath = 'evidence/unrelated/notes.md';
  const stage = (f: ReturnType<typeof handoffFixture>, omitted: string[], gateBytes = readFileSync(join(f.root, f.gatePath))) => {
    writeFileSync(join(f.root, ACCEPTANCE_STAGING_RECORD), JSON.stringify(createAcceptanceStagingRecord({ gateBytes, omitted, keepRoots: [] })));
    for (const path of omitted) rmSync(join(f.root, path), { force: true });
  };

  it('accepts only the recorded absence of an unreferenced asset tree and still verifies staged bytes', () => {
    const f = handoffFixture();
    f.emit();
    stage(f, [omittedPath]);
    expect(validateAcceptanceGate({ root: f.root, gatePath: f.gatePath }).status).toBe('CODE_COMPLETE_GO');
    writeFileSync(join(f.root, 'src/example.ts'), 'export const example = false;\n');
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(/source file changed: src\/example\.ts/);
  });

  it('rejects an unrecorded missing source file', () => {
    const f = handoffFixture();
    f.emit();
    rmSync(join(f.root, omittedPath));
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow();
  });

  it.each([
    ['a runtime source path', (f: ReturnType<typeof handoffFixture>) => stage(f, ['src/example.ts']), /non-omittable or unlisted path: src\/example\.ts/],
    ['a path outside the manifest', (f: ReturnType<typeof handoffFixture>) => stage(f, ['evidence/unrelated/other.md']), /non-omittable or unlisted/],
    ['another gate', (f: ReturnType<typeof handoffFixture>) => stage(f, [omittedPath], Buffer.from('other gate')), /bound to another gate/],
    ['a file that is still present', (f: ReturnType<typeof handoffFixture>) => {
      stage(f, [omittedPath]); writeFileSync(join(f.root, omittedPath), 'unrelated evidence\n');
    }, /omits a present file/]
  ])('rejects a staging record that omits %s', (_label, mutate, message) => {
    const f = handoffFixture();
    f.emit();
    mutate(f);
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: f.gatePath })).toThrow(message);
  });

  it('refuses to emit a gate from a staged context', () => {
    const f = handoffFixture();
    writeFileSync(join(f.root, ACCEPTANCE_STAGING_RECORD), '{}');
    expect(() => f.emit()).toThrow(/staged acceptance context cannot emit/);
  });
});

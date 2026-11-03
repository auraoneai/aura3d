import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_UNIT_TESTS, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TEST,
  EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST,
  EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_TEST, HISTORICAL_ACCEPTANCE_INVENTORY,
  HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_FIXTURES, HISTORICAL_REPLAY_SOURCE_TEST,
  HISTORICAL_REPLAY_TEST, HISTORICAL_SOURCE_TEST, MANIFEST_SCHEMA, PACKED_UNIT_TESTS, PORTABLE_NPM_LOCK,
  PORTABLE_NPM_LOCK_TEST, PORTABLE_NPM_LOCK_TYPES, buildSteps, canonicalJson, computeInputDigest,
  expectedExternalCodecAcceptance, expectedHistoricalAcceptance, expectedHistoricalReplay, expectedTestFiles,
  nativeSourceInventoryForManifest, parseTap, parseVitestInventory, sourceHandoffApi, sourceTestFileCoverage
} from '../../../tools/remote-acr/source-checks.mjs';
import { SOURCE_BUILD_SCHEMA, stageSourceBuildHandoff, verifySourceBuildHandoff } from '../../../tools/remote-acr/source-resume.mjs';

type Ref = { path: string; sha256: string };
type Subrun = { file: string; argv: string[]; exitCode: number; result: Ref; cwd?: string; signal?: null; error?: null };
type Check = { id: string; argv: string[] | null; subruns: Subrun[]; status: string; started: boolean; exitCode: number; log: string; sha256: string; runner?: string; cwd?: string };
type Inventory = {
  checkId: string; result?: Ref; sourceRoot?: string; expectedFiles: string[]; discoveredFiles: string[];
  testCount: number; passedCount: number; failedCount: number; skippedCount: number; testNames: string[]; runner?: string; cwd?: string;
};
type BuildProduct = { path: string; mode: string; sha256: string; size: number };
type BuildReport = {
  schema: string; runId: string; releaseKind: string; acceptance: string; expectedCheckIds: string[];
  checks: Check[]; testInventories: Inventory[]; sourceManifestPath: string; sourceManifestSha256: string;
  sourceInventory: Ref; fullExpectedCheckIds: string[]; executedCheckIds: string[];
  expectedTestFiles: Record<string, string[]>; executedTestFiles: Record<string, string[]>;
  expectedSourceTestFiles: string[]; executedSourceTestFiles: string[];
  candidatePlan: Ref; archives: Ref[]; completedOutcomeIds: string[]; buildProducts: BuildProduct[]; buildProductsSha256: string;
};

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const tempDirs: string[] = [];
function temp() { const path = mkdtempSync(join(tmpdir(), 'a3d-source-handoff-')); tempDirs.push(path); return path; }
function put(root: string, path: string, bytes: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
function tap(name: string) {
  return `TAP version 13\n# Subtest: ${name}\nok 1 - ${name}\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
}
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = temp(), dest = temp(), runId = 'example-run', releaseKind = 'patch';
  const dir = `tests/reports/native-capabilities/${runId}`;
  const paths = [
    'pnpm-lock.yaml', 'tools/native-source-inventory/index.mjs',
    'tests/unit/parity/math.test.ts', 'tests/unit/example.test.ts', ...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS,
    'tests/assets/example.test.ts', 'tests/integration/example.test.ts', 'packages/core/tests/core.test.ts',
    'tools/release/example.test.mjs', 'tools/agent-templates/cli.test.mjs',
    HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_SOURCE_TEST, ...HISTORICAL_ACCEPTANCE_TESTS,
    HISTORICAL_REPLAY_TEST, HISTORICAL_REPLAY_SOURCE_TEST, ...HISTORICAL_REPLAY_FIXTURES.map(fixture => fixture.path),
    EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES,
    EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST,
    PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST
  ];
  const realBaseline = JSON.parse(readFileSync(new URL('../../../tools/muse3jsparity-readiness/baseline-unit-inventory.json', import.meta.url), 'utf8')) as { schema: string; assertions: string[] };
  const baseline = { schema: realBaseline.schema, assertions: realBaseline.assertions.filter(id => HISTORICAL_ACCEPTANCE_TESTS.some(path => id.startsWith(`${path}::`))) };
  const files = [...new Set(paths)].sort().map(path => {
    const replay = HISTORICAL_REPLAY_FIXTURES.find(fixture => fixture.path === path);
    const bytes = replay ? readFileSync(new URL(`../../../${path}`, import.meta.url))
      : path === HISTORICAL_ACCEPTANCE_INVENTORY ? JSON.stringify(baseline)
        : path === 'pnpm-lock.yaml' ? 'synthetic lock' : `synthetic source: ${path}\n`;
    put(root, path, bytes);
    return { path, sha256: digest(bytes), mode: '100644', type: 'file' };
  });
  const initial = { schema: MANIFEST_SCHEMA, origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, files,
    administrativeFiles: [], inputDigest: computeInputDigest(files), lockfileSha256: files.find(file => file.path === 'pnpm-lock.yaml')!.sha256 };
  const manifest = {
    ...initial, deferredAcceptanceTests: expectedHistoricalAcceptance(initial, baseline),
    deferredReplayTests: expectedHistoricalReplay(initial), deferredExternalCodecTests: expectedExternalCodecAcceptance(initial)
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const inventory = nativeSourceInventoryForManifest(manifest, runId);
  const expected = expectedTestFiles(manifest);
  const inventoryBytes = `${JSON.stringify(inventory)}\n`;
  const sourceInventory = { path: `${dir}/source-inventory.json`, sha256: digest(inventoryBytes) };
  put(root, sourceInventory.path, inventoryBytes);
  const archive: Ref = { path: `${dir}/candidate-tarballs/engine.tgz`, sha256: digest('candidate') };
  const planPath = `${dir}/candidate-plan.json`;
  const plan = { packOnly: true, expectedPackageCount: 1, lockfileSha256: manifest.lockfileSha256,
    source: { inputDigest: manifest.inputDigest }, packages: [{ name: '@aura3d/synthetic', tarball: archive.path, sha256: archive.sha256,
      integrity: `sha512-${createHash('sha512').update('candidate').digest('base64')}` }] };
  put(root, archive.path, 'candidate');
  put(root, planPath, JSON.stringify(plan));
  put(root, `${dir}/source-manifest.json`, manifestBytes);
  const steps = buildSteps(runId, dir, releaseKind, inventory).map(step => {
    const id = step.id, argv = step.argv;
    if (typeof id !== 'string' || !(argv === null
      || Array.isArray(argv) && argv.every((arg: unknown): arg is string => typeof arg === 'string'))) {
      throw new Error('invalid canonical fixture step');
    }
    return { id, argv };
  });
  const prefix = steps.slice(0, steps.findIndex(step => step.id === 'pack') + 1);
  const checks: Check[] = [], testInventories: Inventory[] = [];
  for (const step of prefix) {
    const log = `${dir}/logs/${step.id}.log`, logBytes = `successful ${step.id}\n`;
    put(root, log, logBytes);
    const supplemental = inventory.supplementalChecks.find(item => item.id === step.id);
    const check: Check = { id: step.id, argv: step.argv, subruns: [], status: 'passed', started: true, exitCode: 0, log, sha256: digest(logBytes),
      ...(supplemental ? { runner: supplemental.runner, cwd: supplemental.cwd } : {}) };
    if (['parity', 'unit', 'assets-qr', 'unit-dist'].includes(step.id)) {
      const raw = { success: true, numTotalTests: expected[step.id].length, testResults: expected[step.id].map(path => ({
        name: path, assertionResults: [{ status: 'passed', fullName: `${path} assertion` }]
      })) };
      const bytes = JSON.stringify(raw), path = `${dir}/${step.id}.json`;
      put(root, path, bytes);
      testInventories.push({ checkId: step.id, result: { path, sha256: digest(bytes) }, sourceRoot: '/source-fixture', ...parseVitestInventory(raw, expected[step.id], '/source-fixture') });
    }
    if (['packages', 'node-release'].includes(step.id) || supplemental) {
      const selected = supplemental ? supplemental.expectedFiles : expected[step.id];
      const observed = { expectedFiles: selected, discoveredFiles: [] as string[], testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0, testNames: [] as string[] };
      for (const [index, file] of selected.entries()) {
        const argv = supplemental ? supplemental.invocations[index].argv
          : step.id === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file] : ['node', '--test', '--test-reporter=tap', file];
        const path = `${dir}/results/${step.id}/${index}.tap`, bytes = tap(file), stats = parseTap(bytes);
        put(root, path, bytes);
        check.subruns.push({ file, argv, exitCode: 0, result: { path, sha256: digest(bytes) },
          ...(supplemental ? { cwd: supplemental.cwd, signal: null, error: null } : {}) });
        observed.discoveredFiles.push(file);
        for (const key of ['testCount', 'passedCount', 'failedCount', 'skippedCount'] as const) {
          const count = stats[key];
          if (typeof count !== 'number' || !Number.isSafeInteger(count)) throw new Error('invalid synthetic TAP count');
          observed[key] += count;
        }
        observed.testNames.push(...stats.testNames);
      }
      testInventories.push({ checkId: step.id, ...observed, ...(supplemental ? { runner: supplemental.runner, cwd: supplemental.cwd } : {}) });
    }
    checks.push(check);
  }
  const buildProducts = [
    { path: 'dist', mode: '040755', sha256: digest(''), size: 0 },
    { path: 'dist/index.js', mode: '100644', sha256: digest('built'), size: 5 },
    { path: 'packages/core/dist', mode: '040755', sha256: digest(''), size: 0 },
    { path: 'packages/core/dist/index.js', mode: '100644', sha256: digest('core'), size: 4 }
  ];
  const report: BuildReport = { schema: SOURCE_BUILD_SCHEMA, runId, releaseKind, acceptance: 'not-run', expectedCheckIds: prefix.map(step => step.id), checks,
    fullExpectedCheckIds: steps.map(step => step.id), executedCheckIds: prefix.map(step => step.id),
    testInventories, ...(sourceTestFileCoverage(inventory, testInventories) as Pick<BuildReport, 'expectedTestFiles' | 'executedTestFiles' | 'expectedSourceTestFiles' | 'executedSourceTestFiles'>), sourceInventory,
    sourceManifestPath: `${dir}/source-manifest.json`, sourceManifestSha256: digest(manifestBytes), candidatePlan: { path: planPath, sha256: digest(JSON.stringify(plan)) },
    archives: [archive], completedOutcomeIds: ['WP-1/outcome'], buildProducts, buildProductsSha256: digest(canonicalJson(buildProducts)) };
  let expectedReportSha256 = '';
  function save() { const bytes = `${JSON.stringify(report)}\n`; put(root, `${dir}/source-build.json`, bytes); expectedReportSha256 = digest(bytes); }
  save();
  const api = sourceHandoffApi();
  const options = () => ({ root, dest, runId, releaseKind, manifestBytes, manifest, report, expectedReportSha256, api });
  return { root, dest, dir, manifest, manifestBytes, report, api, options, save };
}

describe('source build handoff', () => {
  it('verifies checks through pack and atomically stages only their retained files', () => {
    const f = fixture();
    expect(f.report.expectedCheckIds.at(-1)).toBe('pack');
    expect(f.report.expectedCheckIds).not.toContain('resume-rebuild');
    expect(f.report.expectedCheckIds).not.toContain('unit-packed');
    put(f.root, `${f.dir}/unrelated.txt`, 'do not copy');
    const result = verifySourceBuildHandoff(f.options());
    expect(result.reportRef.sha256).toBe(f.options().expectedReportSha256);
    expect(result.report).toEqual(f.report);
    expect(result.report).not.toBe(f.report);
    expect(result.buildProducts).toEqual(f.report.buildProducts);
    expect(result.sourceInventory).toEqual(f.report.sourceInventory);
    expect(result.retainedFiles).toContainEqual(f.report.sourceInventory);
    expect(f.report.expectedCheckIds).toContain('template-node');
    expect(f.report.executedSourceTestFiles).toContain('tools/agent-templates/cli.test.mjs');
    expect(result.retainedFiles.length).toBeGreaterThan(10);
    expect(stageSourceBuildHandoff(f.options())).toEqual(result);
    for (const ref of result.retainedFiles) expect(digest(readFileSync(join(f.dest, ref.path)))).toBe(ref.sha256);
    expect(existsSync(join(f.dest, `${f.dir}/unrelated.txt`))).toBe(false);
    expect(existsSync(join(f.dest, '.native-source-manifest.json'))).toBe(false);
    expect(() => stageSourceBuildHandoff(f.options())).toThrow();
  });

  it('requires an independently retained report digest before trusting its contents', () => {
    const f = fixture();
    expect(() => verifySourceBuildHandoff({ ...f.options(), expectedReportSha256: '' })).toThrow(/digest/);
    put(f.root, `${f.dir}/source-build.json`, '{ not valid JSON');
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/digest mismatch/);
    expect(() => verifySourceBuildHandoff({ ...f.options(), expectedReportSha256: digest('{ not valid JSON') })).toThrow(/invalid build report JSON/);
  });

  it('requires exact source, run, release and acceptance identity', () => {
    const f = fixture();
    expect(() => verifySourceBuildHandoff({ ...f.options(), runId: '../escape' })).toThrow(/invalid run/);
    expect(() => verifySourceBuildHandoff({ ...f.options(), releaseKind: 'minor' })).toThrow(/identity/);
    expect(() => verifySourceBuildHandoff({ ...f.options(), manifestBytes: Buffer.from('{}') })).toThrow(/manifest object/);
    put(f.root, f.report.sourceManifestPath, '{}');
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/digest mismatch/);
    put(f.root, f.report.sourceManifestPath, f.manifestBytes);
    f.report.acceptance = 'passed'; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/acceptance/);
  });

  it('requires every canonical check through pack in order, with exact approved commands and successful exits', () => {
    const f = fixture();
    f.report.expectedCheckIds.pop(); f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/check inventory/);
    f.report.expectedCheckIds.push('pack');
    const first = f.report.checks[0]; f.report.checks[0] = f.report.checks[1]; f.report.checks[1] = first; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/check order/);
    f.report.checks[1] = f.report.checks[0]; f.report.checks[0] = first;
    f.report.checks[0].argv = ['pnpm', 'lint']; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/command mismatch/);
    f.report.checks[0].argv = ['pnpm', 'typecheck']; f.report.checks[0].exitCode = 1; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/did not pass/);
  });

  it('rejects missing, modified or coherently rehashed source inventory evidence', () => {
    const missing = fixture();
    rmSync(join(missing.root, missing.report.sourceInventory.path));
    expect(() => verifySourceBuildHandoff(missing.options())).toThrow();
    const changed = fixture();
    put(changed.root, changed.report.sourceInventory.path, '{}');
    expect(() => verifySourceBuildHandoff(changed.options())).toThrow(/digest mismatch/);
    changed.report.sourceInventory.sha256 = digest('{}'); changed.save();
    expect(() => verifySourceBuildHandoff(changed.options())).toThrow(/differs from the staged manifest/);
  });

  it('binds full and executed check inventories and observed source file coverage', () => {
    const full = fixture();
    full.report.fullExpectedCheckIds.pop(); full.save();
    expect(() => verifySourceBuildHandoff(full.options())).toThrow(/full source check inventory/);
    const executed = fixture();
    executed.report.executedCheckIds.pop(); executed.save();
    expect(() => verifySourceBuildHandoff(executed.options())).toThrow(/executed build check inventory/);
    const coverage = fixture();
    coverage.report.executedSourceTestFiles = []; coverage.save();
    expect(() => verifySourceBuildHandoff(coverage.options())).toThrow(/source test coverage mismatch/);
    const unstarted = fixture();
    unstarted.report.checks[0].started = false; unstarted.save();
    expect(() => verifySourceBuildHandoff(unstarted.options())).toThrow(/did not pass/);
  });

  it('rejects missing, failed or tampered supplemental invocations', () => {
    const missing = fixture();
    missing.report.checks.find(check => check.id === 'template-node')!.subruns = []; missing.save();
    expect(() => verifySourceBuildHandoff(missing.options())).toThrow(/supplemental invocation inventory/);
    const failed = fixture();
    failed.report.checks.find(check => check.id === 'template-node')!.subruns[0].exitCode = 1; failed.save();
    expect(() => verifySourceBuildHandoff(failed.options())).toThrow(/supplemental invocation did not pass/);
    const altered = fixture(), subrun = altered.report.checks.find(check => check.id === 'template-node')!.subruns[0];
    const skipped = tap(subrun.file).replace('# skipped 0', '# skipped 1');
    put(altered.root, subrun.result.path, skipped); subrun.result.sha256 = digest(skipped); altered.save();
    expect(() => verifySourceBuildHandoff(altered.options())).toThrow(/skipped/);
  });

  it('rejects omitted results and skipped, failed or stale Vitest assertions', () => {
    const f = fixture(), unit = f.report.testInventories.find(item => item.checkId === 'unit')!;
    f.report.testInventories = f.report.testInventories.filter(item => item !== unit); f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/inventory order/);
    const g = fixture(), inventory = g.report.testInventories.find(item => item.checkId === 'unit')!, ref = inventory.result!;
    const result = JSON.parse(readFileSync(join(g.root, ref.path), 'utf8')) as { testResults: { assertionResults: { status: string }[] }[] };
    result.testResults[0].assertionResults[0].status = 'skipped';
    const bytes = JSON.stringify(result); put(g.root, ref.path, bytes); ref.sha256 = digest(bytes); g.save();
    expect(() => verifySourceBuildHandoff(g.options())).toThrow(/skipped|failed|missing/);
    const h = fixture(); h.report.testInventories[0].testNames = ['substituted']; h.save();
    expect(() => verifySourceBuildHandoff(h.options())).toThrow(/summary mismatch/);
  });

  it('checks each TAP file, command, raw result and result summary', () => {
    const f = fixture(), check = f.report.checks.find(item => item.id === 'packages')!;
    check.subruns[0].argv.push('--unapproved'); f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/invalid TAP subrun|allowlisted/);
    check.subruns[0].argv.pop();
    const subrun = check.subruns[0], altered = tap(subrun.file).replace('# skipped 0', '# skipped 1');
    put(f.root, subrun.result.path, altered); subrun.result.sha256 = digest(altered); f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/skipped/);
  });

  it('requires the candidate plan, exact archive list, source identity and log bytes', () => {
    const f = fixture(); put(f.root, f.report.checks[0].log, 'tampered');
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/digest mismatch/);
    const g = fixture(); put(g.root, g.report.archives[0].path, 'changed');
    expect(() => verifySourceBuildHandoff(g.options())).toThrow(/digest mismatch/);
    const h = fixture(); h.report.archives = []; h.save();
    expect(() => verifySourceBuildHandoff(h.options())).toThrow(/archives/);
    const j = fixture();
    const plan = JSON.parse(readFileSync(join(j.root, j.report.candidatePlan.path), 'utf8')) as { source: { inputDigest: string } };
    plan.source.inputDigest = digest('other source'); const bytes = JSON.stringify(plan);
    put(j.root, j.report.candidatePlan.path, bytes); j.report.candidatePlan.sha256 = digest(bytes); j.save();
    expect(() => verifySourceBuildHandoff(j.options())).toThrow(/candidate plan source input mismatch/);
  });

  it('checks the full directory/file build inventory, its digest and directory ancestry', () => {
    const f = fixture(); f.report.buildProducts[1].size++; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/inventory digest/);
    f.report.buildProductsSha256 = digest(canonicalJson(f.report.buildProducts)); f.report.buildProducts[0].sha256 = digest('not empty'); f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/directory metadata/);
    const g = fixture(); g.report.buildProducts.shift(); g.report.buildProductsSha256 = digest(canonicalJson(g.report.buildProducts)); g.save();
    expect(() => verifySourceBuildHandoff(g.options())).toThrow(/root/);
    const h = fixture(); h.report.buildProducts[1].path = 'dist/../.env'; h.report.buildProductsSha256 = digest(canonicalJson(h.report.buildProducts)); h.save();
    expect(() => verifySourceBuildHandoff(h.options())).toThrow(/invalid build product/);
    const j = fixture(); j.report.buildProducts = j.report.buildProducts.filter(item => !item.path.startsWith('packages/'));
    j.report.buildProductsSha256 = digest(canonicalJson(j.report.buildProducts)); j.save();
    expect(() => verifySourceBuildHandoff(j.options())).toThrow(/required build product roots/);
  });

  it('rejects traversal, sensitive paths, links and duplicate retained references', () => {
    const f = fixture(); f.report.checks[0].log = `${f.dir}/logs/../../.env`; f.save();
    expect(() => verifySourceBuildHandoff(f.options())).toThrow(/unsafe retained path/);
    const g = fixture(), log = g.report.checks[0].log;
    rmSync(join(g.root, log)); symlinkSync('/etc/passwd', join(g.root, log));
    expect(() => verifySourceBuildHandoff(g.options())).toThrow(/symbolic link/);
    const h = fixture(); h.report.testInventories[1].result = h.report.testInventories[0].result; h.save();
    expect(() => verifySourceBuildHandoff(h.options())).toThrow(/unexpected retained path|duplicate retained path/);
  });

  it('cleans up a failed staging attempt if retained inputs change after verification', () => {
    const f = fixture(), original = f.api.verifyCandidate;
    f.api.verifyCandidate = (...args) => {
      const result = original(...args);
      put(f.root, f.report.checks[0].log, 'changed after verification');
      return result;
    };
    expect(() => stageSourceBuildHandoff(f.options())).toThrow(/changed during staging/);
    expect(existsSync(join(f.dest, f.dir))).toBe(false);
    const parent = join(f.dest, 'tests/reports/native-capabilities');
    expect(lstatSync(parent).isDirectory()).toBe(true);
  });
});

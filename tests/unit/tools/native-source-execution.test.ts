import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMINISTRATIVE_FILES, ARCHIVE_ADMISSION_FILES, ARCHIVE_ADMISSION_TESTS, BUILT_UNIT_TESTS, PACKED_UNIT_TESTS, HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_SOURCE_TEST, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_TEST, HISTORICAL_REPLAY_SOURCE_TEST, HISTORICAL_REPLAY_FIXTURES, HISTORICAL_REPLAY_ASSERTIONS, HISTORICAL_REPLAY_INAPPLICABLE, EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, EXTERNAL_CODEC_ASSERTIONS, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST, EXPECTED_CHECK_IDS, assertFreshSourceOutputs, assertFreshResumeOutputs, assertIndependentLock, assertNoAcceptanceProcess, assertPassingPhaseReport, assertRequiredPayload, assertWorkspaceDependencyAdmission,
  assertSourceScripts, buildSteps, computeInputDigest, collectBuildProducts, buildProductsDigest, createSourceChildEnvironment, evaluateRunResult, expectedHistoricalAcceptance, expectedHistoricalReplay, expectedExternalCodecAcceptance, expectedTestFiles,
  MANIFEST_NAME, MANIFEST_SCHEMA, materializeResults, nativeSourceInventoryForManifest, parseTap, parseVitestInventory,
  runSource, sourceTestFileCoverage, stageResumeInputs, validateSourceArgv, verifySourcePhaseInputs, verifyStagedSource
} from '../../../tools/remote-acr/source-checks.mjs';
import { collectArtifacts, managedIdentityToken, parseArgs, parseBlobUrl, run } from '../../../tools/remote-acr/upload-artifacts.mjs';

const root = resolve(import.meta.dirname, '../../..');
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const temporary: string[] = [];
function temp() { const path = mkdtempSync(join(tmpdir(), 'a3d-source-')); temporary.push(path); return path; }
function put(dir: string, path: string, data: string | Buffer = 'source') { const absolute = join(dir, path); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, data); }
function staged() {
  const dir = temp();
  const paths = [
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'vitest.config.ts',
    'tsconfig.browser-tests.json', 'docs/prds/aura3d-native-capability-roadmap.md',
    'tools/remote-acr/source-checks.mjs', 'tools/remote-acr/source-task-run.sh', 'tools/release/source-identity.mjs',
    'tools/native-source-inventory/index.mjs', 'tools/agent-templates/cli.test.mjs',
    'packages/engine/src/index.ts', 'packages/core/tests/core.test.ts', 'tests/unit/a.test.ts', 'tests/unit/parity/a.test.ts',
    ...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS, ...HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_SOURCE_TEST, HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_TEST, HISTORICAL_REPLAY_SOURCE_TEST, ...HISTORICAL_REPLAY_FIXTURES.map(fixture => fixture.path), EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST, 'tests/integration/a.test.ts', 'tests/assets/a.test.ts',
    'tests/qr/a.test.ts', 'tests/fixtures/a.bin', 'tools/release/a.test.mjs', 'templates/example/a.ts',
    'tools/remote-acr/portable-inputs.mjs', 'tests/unit/tools/native-portable-source-inputs.test.ts',
    'tools/remote-acr/source-resume.mjs', 'tests/unit/tools/native-source-resume.test.ts',
    ...ARCHIVE_ADMISSION_FILES, ...ARCHIVE_ADMISSION_TESTS,
    'packages/create-aura3d/templates/a.ts', 'public/aura-environments/a.json'
  ];
  const realBaseline = JSON.parse(readFileSync(join(root, HISTORICAL_ACCEPTANCE_INVENTORY), 'utf8')) as { schema: string; assertions: string[] };
  const baseline = { schema: realBaseline.schema, assertions: realBaseline.assertions.filter(id => HISTORICAL_ACCEPTANCE_TESTS.some(path => id.startsWith(`${path}::`))) };
  for (const path of [...paths, ...ADMINISTRATIVE_FILES]) put(dir, path, path === 'package.json' ? '{}' : path === 'docs/prds/aura3d-native-capability-roadmap.md' ? '| CREATE | tests/fixtures/a.bin | required |\n' : path === HISTORICAL_ACCEPTANCE_INVENTORY ? JSON.stringify(baseline) : HISTORICAL_REPLAY_FIXTURES.some(fixture => fixture.path === path) ? readFileSync(join(root, path)) : path);
  const entries = (ps: string[]) => ps.sort().map(path => ({ path, sha256: hash(readFileSync(join(dir, path))), mode: '100644', type: 'file' }));
  const files = entries(paths);
  const initial = { schema: MANIFEST_SCHEMA, origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, files, administrativeFiles: entries([...ADMINISTRATIVE_FILES]), lockfileSha256: files.find(f => f.path === 'pnpm-lock.yaml')!.sha256, inputDigest: computeInputDigest(files) };
  const manifest = { ...initial, deferredAcceptanceTests: expectedHistoricalAcceptance(initial, baseline), deferredReplayTests: expectedHistoricalReplay(initial), deferredExternalCodecTests: expectedExternalCodecAcceptance(initial) };
  put(dir, MANIFEST_NAME, JSON.stringify(manifest));
  return { dir, manifest };
}
function materializationFixture(downloaded: string, runId: string, phase?: 'resume') {
  const { manifest } = staged(), reportDir = `tests/reports/native-capabilities/${runId}`;
  const payload = join(downloaded, runId, ...(phase ? [phase] : []));
  const write = (path: string, data: string) => {
    put(payload, path, data);
    return { path, sha256: hash(data) };
  };
  const manifestBytes = `${JSON.stringify(manifest)}\n`;
  const sourceManifest = write(`${reportDir}/source-manifest.json`, manifestBytes);
  const inventory = nativeSourceInventoryForManifest(manifest, runId);
  const sourceInventory = write(`${reportDir}/source-inventory.json`, `${JSON.stringify(inventory)}\n`);
  const steps = buildSteps(runId, reportDir, 'patch', inventory).map(step => {
    const id = step.id, argv = step.argv;
    if (typeof id !== 'string' || !(argv === null
      || Array.isArray(argv) && argv.every((arg: unknown): arg is string => typeof arg === 'string'))) {
      throw new Error('invalid canonical fixture step');
    }
    return { id, argv };
  });
  const expected = sourceTestFileCoverage(inventory, []).expectedTestFiles as Record<string, string[]>;
  const testInventories: any[] = [];
  const checks = steps.map(step => {
    const plan = inventory.supplementalChecks.find(item => item.id === step.id);
    const log = write(`${reportDir}/logs/${step.id}.log`, `synthetic ${step.id}\n`);
    const check: any = { id: step.id, argv: step.argv, status: 'passed', started: true, exitCode: 0,
      log: log.path, sha256: log.sha256, subruns: [], ...(plan ? { runner: plan.runner, cwd: plan.cwd } : {}) };
    if (['parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr', 'integration'].includes(step.id)) {
      const files: string[] = expected[step.id];
      const raw = { success: true, numTotalTests: files.length, testResults: files.map(path => ({
        name: `/synthetic/source/${path}`, assertionResults: [{ status: 'passed', fullName: `${path} assertion` }]
      })) };
      const result = write(`${reportDir}/${step.id}.json`, JSON.stringify(raw));
      testInventories.push({ checkId: step.id, sourceRoot: '/synthetic/source', result,
        ...parseVitestInventory(raw, files, '/synthetic/source') });
    } else if (['packages', 'packages-dist', 'node-release'].includes(step.id) || plan) {
      const files: string[] = expected[step.id];
      const observed = { checkId: step.id, expectedFiles: files, discoveredFiles: [] as string[],
        testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0, testNames: [] as string[],
        ...(plan ? { runner: plan.runner, cwd: plan.cwd } : {}) };
      for (const [index, file] of files.entries()) {
        const text = `TAP version 13\n# Subtest: ${file}\nok 1 - ${file}\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
        const result = write(`${reportDir}/results/${step.id}/${index}.tap`, text);
        const argv = plan ? plan.invocations[index].argv
          : step.id === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file]
            : step.id === 'packages-dist' ? ['node', '--import', 'tsx', '--test', '--test-reporter=tap', file]
              : ['node', '--test', '--test-reporter=tap', file];
        check.subruns.push({ file, argv, exitCode: 0, result, ...(plan ? { cwd: plan.cwd, signal: null, error: null } : {}) });
        const stats = parseTap(text);
        observed.discoveredFiles.push(file);
        for (const key of ['testCount', 'passedCount', 'failedCount', 'skippedCount'] as const) {
          const count = stats[key];
          if (typeof count !== 'number' || !Number.isSafeInteger(count)) throw new Error('invalid synthetic TAP count');
          observed[key] += count;
        }
        observed.testNames.push(...stats.testNames);
      }
      testInventories.push(observed);
    }
    return check;
  });
  const ids = steps.map(step => step.id);
  const report: any = { schema: 'aura3d.native-source-reports/1', runId, releaseKind: 'patch', acceptance: 'not-run',
    sourceManifestPath: sourceManifest.path, sourceManifestSha256: sourceManifest.sha256, sourceInventory,
    expectedCheckIds: ids, fullExpectedCheckIds: ids, executedCheckIds: ids, checks, testInventories,
    ...sourceTestFileCoverage(inventory, testInventories), archives: [], phaseReports: {} };
  const save = () => write(`${reportDir}/source-reports.json`, JSON.stringify(report));
  save();
  return { payload, reportDir, manifestBytes, sourceManifest, report, write, save };
}
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('source execution boundaries', () => {
  it('requires the pnpm installed-tree verifier and platform-selection contracts', () => {
    expect(ARCHIVE_ADMISSION_FILES).toEqual(expect.arrayContaining([
      'tools/release/pnpm-installed-tree.mjs',
      'tools/release/pnpm-installed-tree.d.mts',
      'tools/release/pnpm-platform-selection.mjs',
      'tools/release/pnpm-platform-selection.d.mts',
      'tools/release/admitted-archive-modes.mjs',
      'tools/release/admitted-archive-modes.d.mts'
    ]));
    expect(ARCHIVE_ADMISSION_TESTS).toEqual(expect.arrayContaining([
      'tests/unit/tools/native-pnpm-installed-tree.test.ts',
      'tests/unit/tools/native-pnpm-platform-selection.test.ts'
    ]));
  });

  it('requires staged fixture, template, environment and every planned file', () => {
    const { dir, manifest } = staged();
    expect(() => verifyStagedSource(dir, manifest)).not.toThrow();
    expect(() => assertRequiredPayload(manifest.files.filter(f => !f.path.startsWith('tests/fixtures/')).map(f => f.path), '')).toThrow(/fixture/);
    for (const required of [...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS, ...HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_SOURCE_TEST, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_TEST, HISTORICAL_REPLAY_SOURCE_TEST, ...HISTORICAL_REPLAY_FIXTURES.map(fixture => fixture.path), EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST, ...ARCHIVE_ADMISSION_FILES, ...ARCHIVE_ADMISSION_TESTS]) {
      expect(() => assertRequiredPayload(manifest.files.filter(f => f.path !== required).map(f => f.path), '')).toThrow(/required staged input missing/);
    }
    expect(() => assertRequiredPayload(manifest.files.map(f => f.path), '| CREATE | tests/unit/missing.test.ts | required |')).toThrow(/planned source input missing/);
  });
  it('rejects changed bytes, undeclared files, changed modes and escaping symlinks', () => {
    const a = staged(); put(a.dir, 'tests/fixtures/a.bin', 'changed');
    expect(() => verifyStagedSource(a.dir, a.manifest)).toThrow(/changed staged input/);
    const b = staged(); put(b.dir, 'tests/fixtures/undeclared.bin');
    expect(() => verifyStagedSource(b.dir, b.manifest)).toThrow(/undeclared/);
    const c = staged(); chmodSync(join(c.dir, 'tests/fixtures/a.bin'), 0o755);
    expect(() => verifyStagedSource(c.dir, c.manifest)).toThrow(/changed staged input/);
    const d = staged(); rmSync(join(d.dir, 'tests/fixtures/a.bin')); symlinkSync('/etc/passwd', join(d.dir, 'tests/fixtures/a.bin'));
    expect(() => verifyStagedSource(d.dir, d.manifest)).toThrow(/unsafe symlink/);
  });
  it('rejects stale or unsafe source outputs before any check runs', () => {
    const dir = temp(), reportDir = 'tests/reports/native-capabilities/fresh';
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).not.toThrow();
    put(dir, `${reportDir}/source-task.log`, 'wrapper output');
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).not.toThrow();
    put(dir, `${reportDir}/source-reports.json`, 'old report');
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).toThrow(/already exists/);
    expect(() => runSource(dir, { NATIVE_RUN_ID: 'fresh', NATIVE_REPORT_DIR: reportDir, NATIVE_RELEASE_KIND: 'patch', AURA3D_SOURCE_MANIFEST: MANIFEST_NAME })).toThrow(/already exists/);
    rmSync(join(dir, reportDir), { recursive: true });
    put(dir, 'tests/reports/unit.json', 'old Vitest result');
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).toThrow(/unit\.json/);
    rmSync(join(dir, 'tests/reports/unit.json'));
    put(dir, 'tests/reports/native-consumers/fresh/source.json', 'old consumer result');
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).toThrow(/native-consumers/);
    rmSync(join(dir, 'tests/reports/native-consumers/fresh'), { recursive: true });
    symlinkSync(temp(), join(dir, 'tests/reports/native-consumers/fresh'));
    expect(() => assertFreshSourceOutputs(dir, 'fresh')).toThrow(/already exists/);
  });
  it('requires a separately retained build digest and rejects unexpected resume output', () => {
    const { dir } = staged();
    expect(() => verifySourcePhaseInputs(dir, { NATIVE_RUN_ID: 'fresh', NATIVE_RELEASE_KIND: 'patch', NATIVE_SOURCE_PHASE: 'resume' })).toThrow(/build report digest/);
    const base = 'tests/reports/native-capabilities/fresh';
    const refs = [{ path: `${base}/source-build.json`, sha256: hash('report') }, { path: `${base}/logs/pack.log`, sha256: hash('log') }];
    put(dir, refs[0]!.path, 'report'); put(dir, refs[1]!.path, 'log'); put(dir, `${base}/source-task-resume.log`, 'wrapper');
    expect(() => assertFreshResumeOutputs(dir, 'fresh', refs)).not.toThrow();
    put(dir, `${base}/logs/old.log`, 'old');
    expect(() => assertFreshResumeOutputs(dir, 'fresh', refs)).toThrow(/unexpected resume output/);
    rmSync(join(dir, base, 'logs/old.log'));
    rmSync(join(dir, refs[1]!.path)); symlinkSync('source-build.json', join(dir, refs[1]!.path));
    expect(() => assertFreshResumeOutputs(dir, 'fresh', refs)).toThrow(/unsafe resume output/);
  });
  it('refuses resume staging before any copy when archive admission is not configured', () => {
    const source = temp(), dest = temp();
    expect(() => stageResumeInputs(source, dest, 'fresh', 'patch', 'a'.repeat(64))).toThrow(/ARCHIVE_ADMISSION/);
    expect(existsSync(join(dest, 'tests/reports/native-capabilities/fresh'))).toBe(false);
    expect(existsSync(join(dest, 'tests/reports/native-source-inputs/fresh'))).toBe(false);
  });
  it('refuses prohibited lock dependencies before installation', () => {
    const { dir, manifest } = staged();
    expect(() => assertIndependentLock(dir, manifest.files)).not.toThrow();
    put(dir, 'pnpm-lock.yaml', "dependencies:\n  three: 0.185.0\n");
    expect(() => assertIndependentLock(dir, manifest.files)).toThrow(/prohibited/);
    put(dir, 'pnpm-lock.yaml', "dependencies:\n  alias: npm:three@0.185.0\n");
    expect(() => assertIndependentLock(dir, manifest.files)).toThrow(/prohibited/);
  });
  it('refuses both source image phases before a provider or workspace install when workspace admission is unavailable', () => {
    expect(() => assertWorkspaceDependencyAdmission()).toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE/);
    for (const phase of ['prepare', 'resume']) {
      expect(() => runSource(temp(), { NATIVE_RUN_ID: 'fresh', NATIVE_REPORT_DIR: 'tests/reports/native-capabilities/fresh',
        NATIVE_RELEASE_KIND: 'patch', NATIVE_SOURCE_PHASE: phase, AURA3D_SOURCE_MANIFEST: MANIFEST_NAME,
        AURA3D_SKIP_WORKSPACE_ADMISSION: '1', AURA3D_WORKSPACE_APPROVAL: 'caller-supplied',
        npm_config_ignore_scripts: 'true', npm_config_offline: 'true' }), phase)
        .toThrow(/WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE/);
    }
    const dir = temp(), sentinel = join(dir, 'provider'), touched = join(dir, 'provider-called');
    writeFileSync(sentinel, `#!/bin/sh\ntouch '${touched}'\nexit 0\n`, { mode: 0o755 });
    for (const phase of ['prepare', 'resume']) {
      const result = spawnSync('bash', [join(root, 'tools/remote-acr/run-source.sh')], { cwd: root, encoding: 'utf8', env: {
        ...process.env, AZ_WRAPPER: sentinel, RUN_ID: 'synthetic-workspace-admission', NATIVE_SOURCE_PHASE: phase,
        NATIVE_RELEASE_KIND: 'patch', NATIVE_BUILD_REPORT_SHA256: phase === 'resume' ? 'a'.repeat(64) : 'none',
        AURA3D_ARTIFACTS_BLOB_URL: 'https://synthetic.blob.core.windows.net/artifacts', AURA3D_ACR_IDENTITY_TASK: 'synthetic',
        AURA3D_SKIP_WORKSPACE_ADMISSION: '1', AURA3D_WORKSPACE_APPROVAL: 'caller-supplied'
      } });
      expect(result.status, phase).not.toBe(0);
      expect(result.stderr, phase).toContain('WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE');
      expect(existsSync(touched)).toBe(false);
    }
    const dockerfile = readFileSync(join(root, 'tools/remote-acr/Dockerfile.source'), 'utf8');
    const guard = dockerfile.indexOf('RUN node tools/remote-acr/source-checks.mjs workspace-admission');
    const explicitBlocker = dockerfile.indexOf('SOURCE_IMAGE_UNAVAILABLE');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(explicitBlocker).toBeGreaterThan(guard);
    expect(dockerfile).not.toMatch(/^\s*RUN\s+(?:corepack|pnpm\s+install|cargo\s+install|apt-get)\b/m);
  });
  it('rejects script drift and browser or arbitrary command argv', () => {
    expect(() => assertSourceScripts({ typecheck: 'tsc && pnpm exec playwright test' })).toThrow(/source script/);
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    expect(() => assertSourceScripts(scripts)).not.toThrow();
    expect(() => assertSourceScripts({ ...scripts, pretypecheck: 'node hidden-task.mjs' })).toThrow(/lifecycle hook/);
    expect(() => assertSourceScripts({ ...scripts, 'posttest:unit': 'node hidden-task.mjs' })).toThrow(/lifecycle hook/);
    expect(() => validateSourceArgv('unit', ['pnpm', 'test:unit', '--headed'])).toThrow();
    expect(() => validateSourceArgv('unit', ['pnpm', 'test:unit', '--browser'])).toThrow();
    expect(() => validateSourceArgv('runtime-audit-source', ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/native-runtime-audit/index.ts', '--phase', 'browser'])).toThrow();
    expect(() => validateSourceArgv('node-release', ['node', '--test', '--eval=code'])).toThrow();
    expect(() => assertNoAcceptanceProcess('pnpm', ['exec', 'playwright', 'test'])).toThrow(/browser/);
    expect(() => assertNoAcceptanceProcess('pnpm', ['exec', 'tsc', '-p', 'tsconfig.browser-tests.json'])).not.toThrow();
    expect(buildSteps('sample', 'tests/reports/native-capabilities/sample').map(s => s.id)).toContain('examples-source');
  });
  it('blocks browser subprocesses in nested Node execution', () => {
    if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
      expect(() => spawnSync('playwright', ['test'])).toThrow(/refuses browser/);
      return;
    }
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { spawnSync } from 'node:child_process'; try { spawnSync('playwright', ['test']); process.exit(9) } catch (e) { console.error(e.message); process.exit(0) }`], {
      cwd: root, encoding: 'utf8', env: { ...process.env, AURA3D_SOURCE_PROCESS_GUARD: '1', NODE_OPTIONS: `--import=${join(root, 'tools/remote-acr/source-checks.mjs')}` }
    });
    expect(child.status, child.stderr).toBe(0); expect(child.stderr).toContain('refuses browser');
  });
  it('refuses acceptance selectors while allowing source-only tools and helper imports', async () => {
    for (const command of [
      ['node', EXTERNAL_CODEC_LAUNCHER], ['node', HISTORICAL_LAUNCHER],
      ['bash', 'tools/remote-acr/task-run.sh'], ['bash', 'tools/remote-acr/run.sh'],
      ['pnpm', 'exec', 'vitest', 'run', EXTERNAL_CODEC_TEST],
      ['pnpm', 'exec', 'vitest', 'run', 'tests/acceptance'],
      ['pnpm', 'exec', 'vitest', '--config=tests/acceptance/external-codec.vitest.config.ts']
    ]) expect(() => assertNoAcceptanceProcess(command[0], command.slice(1))).toThrow(/acceptance process/);
    for (const command of [
      ['node', 'tools/remote-acr/source-task-run.sh'], ['node', EXTERNAL_CODEC_CONTRACT],
      ['node', PORTABLE_NPM_LOCK], ['node', EXTERNAL_CODEC_LAUNCHER_TEST], ['node', HISTORICAL_LAUNCHER_TEST]
    ]) expect(() => assertNoAcceptanceProcess(command[0], command.slice(1))).not.toThrow();
    const [contract, scanner] = await Promise.all([
      import('../../../tools/remote-acr/external-codec-contract.mjs'),
      import('../../../tools/release/portable-npm-lock.mjs')
    ]);
    expect(typeof contract.validateExternalCodecInputs).toBe('function');
    expect(typeof scanner.assertIndependentNpmGraph).toBe('function');
  });
  it('requires real discovered tests and forbids skipped or missing results', () => {
    const { manifest } = staged();
    const expected = expectedTestFiles(manifest);
    expect(expected.unit).toEqual(['tests/unit/a.test.ts', 'tests/unit/parity/a.test.ts', HISTORICAL_REPLAY_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER_TEST, HISTORICAL_LAUNCHER_TEST, HISTORICAL_SOURCE_TEST, PORTABLE_NPM_LOCK_TEST, 'tests/unit/tools/native-portable-source-inputs.test.ts', 'tests/unit/tools/native-source-resume.test.ts', ...ARCHIVE_ADMISSION_TESTS].sort());
    expect(expected['unit-dist']).toEqual([...BUILT_UNIT_TESTS]);
    expect(expected['unit-packed']).toEqual([...PACKED_UNIT_TESTS]);
    const report = { success: true, numTotalTests: expected.unit.length, testResults: expected.unit.map(file => ({ name: `/repo/${file}`, assertionResults: [{ status: 'passed', title: 'runs' }] })) };
    expect(parseVitestInventory(report, expected.unit, '/repo').testCount).toBe(expected.unit.length);
    expect(() => parseVitestInventory(report, ['tests/unit/missing.test.ts'], '/repo')).toThrow(/inventory/);
    expect(() => parseVitestInventory({ ...report, testResults: [{ ...report.testResults[0], assertionResults: [{ status: 'pending' }] }, ...report.testResults.slice(1)] }, expected.unit, '/repo')).toThrow(/skipped/);
    const oneEmpty = { ...report, testResults: [...report.testResults, { name: '/repo/tests/unit/empty.test.ts', assertionResults: [] }] };
    expect(() => parseVitestInventory(oneEmpty, [...expected.unit, 'tests/unit/empty.test.ts'], '/repo')).toThrow(/no executed tests/);
    expect(() => parseTap('TAP version 13\n')).toThrow(/missing/);
    expect(() => parseTap('# tests 1\n# pass 1\n# fail 0\n# skipped 1\n# todo 0\n# cancelled 0\n')).toThrow(/skipped/);
  });
  it('runs build and packed consumers only after their prerequisites with disjoint mandatory inventories', () => {
    const steps = buildSteps('fresh', 'tests/reports/native-capabilities/fresh');
    const ids = steps.map(step => step.id);
    expect(ids.indexOf('unit')).toBeLessThan(ids.indexOf('build'));
    expect(ids.indexOf('build')).toBeLessThan(ids.indexOf('unit-dist'));
    expect(ids.indexOf('unit-dist')).toBeLessThan(ids.indexOf('pack'));
    expect(ids.indexOf('pack')).toBeLessThan(ids.indexOf('resume-rebuild'));
    expect(ids.indexOf('resume-rebuild')).toBeLessThan(ids.indexOf('unit-packed'));
    expect(ids.indexOf('unit-packed')).toBeLessThan(ids.indexOf('integration'));
    const unit = steps.find(step => step.id === 'unit')!;
    const dist = steps.find(step => step.id === 'unit-dist')!;
    const packed = steps.find(step => step.id === 'unit-packed')!;
    expect(unit.argv).toEqual(['pnpm', 'test:unit', ...[...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS, ...HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_TEST].flatMap(path => ['--exclude', path])]);
    expect(dist.argv).toEqual(['pnpm', 'exec', 'vitest', 'run', ...BUILT_UNIT_TESTS, '--reporter=json', '--outputFile=tests/reports/native-capabilities/fresh/unit-dist.json']);
    expect(packed.argv).toEqual(['pnpm', 'exec', 'vitest', 'run', ...PACKED_UNIT_TESTS, '--reporter=json', '--outputFile=tests/reports/native-capabilities/fresh/unit-packed.json']);
    expect(() => validateSourceArgv('unit', ['pnpm', 'test:unit'])).toThrow();
    expect(() => validateSourceArgv('unit', ['pnpm', 'test:unit', '--exclude', 'tests/unit/other.test.ts'])).toThrow();
    expect(() => validateSourceArgv('unit-dist', [...dist.argv!, '--exclude', BUILT_UNIT_TESTS[0]!])).toThrow();
    expect(() => validateSourceArgv('unit-packed', [...packed.argv!, '--exclude', PACKED_UNIT_TESTS[0]!])).toThrow();
    for (const file of [...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS]) {
      const skipped = { success: true, numTotalTests: 1, testResults: [{ name: `/repo/${file}`, assertionResults: [{ status: 'pending', title: 'requires a fresh candidate' }] }] };
      expect(() => parseVitestInventory(skipped, [file], '/repo')).toThrow(/skipped/);
      expect(() => parseVitestInventory({ ...skipped, testResults: [] }, [file], '/repo')).toThrow(/inventory/);
    }
  });
  it('records every build file and directory and detects changed bytes, modes, extra paths and symlinks', () => {
    const dir = temp();
    put(dir, 'dist/engine/index.js', 'root output');
    put(dir, 'packages/engine/dist/index.js', 'workspace output');
    const first = collectBuildProducts(dir), firstDigest = buildProductsDigest(first);
    expect(first.map(item => item.path)).toEqual(['dist', 'dist/engine', 'dist/engine/index.js', 'packages/engine/dist', 'packages/engine/dist/index.js']);
    expect(first.find(item => item.path === 'dist')?.mode).toMatch(/^040[0-7]{3}$/);
    expect(first.find(item => item.path === 'dist/engine/index.js')?.mode).toMatch(/^100[0-7]{3}$/);
    put(dir, 'dist/engine/index.js', 'changed output');
    expect(buildProductsDigest(collectBuildProducts(dir))).not.toBe(firstDigest);
    put(dir, 'dist/engine/index.js', 'root output');
    chmodSync(join(dir, 'dist/engine/index.js'), 0o755);
    expect(buildProductsDigest(collectBuildProducts(dir))).not.toBe(firstDigest);
    chmodSync(join(dir, 'dist/engine/index.js'), 0o644);
    mkdirSync(join(dir, 'dist/empty'));
    expect(buildProductsDigest(collectBuildProducts(dir))).not.toBe(firstDigest);
    rmSync(join(dir, 'dist/empty'), { recursive: true });
    symlinkSync('index.js', join(dir, 'dist/engine/link.js'));
    expect(() => collectBuildProducts(dir)).toThrow(/symlink/);
  });
  it('requires offline shader validators in child checks even when caller environment disables them', () => {
    const env = createSourceChildEnvironment(root, {
      A3D_REQUIRE_GLSLANG: '0', A3D_REQUIRE_NAGA: '0', A3D_GLSL_REPORT_EXCLUDED: '0', AURA3D_SOURCE_PROCESS_GUARD: '0', AURA3D_RUN_NETWORK_ASSET_TESTS: '1',
      NODE_OPTIONS: '--require=unexpected-hook', DISPLAY: ':0'
    }, 'tests/reports/native-capabilities/fresh', MANIFEST_NAME);
    expect(env.A3D_REQUIRE_GLSLANG).toBe('1');
    expect(env.A3D_REQUIRE_NAGA).toBe('1');
    expect(env.A3D_GLSL_REPORT_EXCLUDED).toBe('1');
    expect(env.AURA3D_RUN_NETWORK_ASSET_TESTS).toBe('0');
    expect(env.AURA3D_SOURCE_PROCESS_GUARD).toBe('1');
    expect(env.NODE_OPTIONS).toMatch(/^--import=file:/);
    expect(env.NODE_OPTIONS).not.toContain('unexpected-hook');
    expect(env.DISPLAY).toBe('');
  });
  it('passes only source-tool configuration to children and excludes inherited provider credentials', () => {
    const denied = ['IDENTITY_ENDPOINT', 'IDENTITY_HEADER', 'MSI_ENDPOINT', 'MSI_SECRET', 'AURA3D_ARTIFACTS_SAS',
      'AURA3D_ARTIFACTS_BLOB_URL', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_FEDERATED_TOKEN_FILE',
      'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS',
      'GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'UNRECOGNIZED_TASK_SECRET',
      'AURA3D_CANDIDATE_REVIEWS_JSON', 'NATIVE_CONSUMER_BUNDLE_INPUT', 'NATIVE_EXAMPLE_LOCK_INPUT', 'NATIVE_MATRIX_BUNDLE_INPUT', 'A3D_RELEASE_PLAN'];
    const inherited = Object.fromEntries(denied.map(key => [key, 'synthetic-credential-never-to-be-forwarded']));
    const env = createSourceChildEnvironment(root, { ...inherited, PATH: '/usr/bin:/bin', HOME: '/tmp/synthetic-home',
      TMPDIR: '/tmp', LANG: 'C.UTF-8', SOURCE_DATE_EPOCH: '1700000000', NATIVE_RUN_ID: 'untrusted-run',
      NATIVE_REPORT_DIR: 'untrusted-report', NATIVE_RELEASE_KIND: 'minor', NATIVE_SOURCE_PHASE: 'resume',
      NODE_OPTIONS: '--require=untrusted-hook' }, 'tests/reports/native-capabilities/fresh', MANIFEST_NAME);
    for (const key of denied) expect(Object.hasOwn(env, key), key).toBe(false);
    expect(env).toMatchObject({ PATH: '/usr/bin:/bin', HOME: '/tmp/synthetic-home', TMPDIR: '/tmp', LANG: 'C.UTF-8',
      SOURCE_DATE_EPOCH: '1700000000', NATIVE_RUN_ID: 'fresh', NATIVE_REPORT_DIR: 'tests/reports/native-capabilities/fresh',
      NATIVE_RELEASE_KIND: 'minor', NATIVE_SOURCE_PHASE: 'resume', COREPACK_ENABLE_NETWORK: '0', AURA3D_SOURCE_PROCESS_GUARD: '1' });
    expect(env.NODE_OPTIONS).toMatch(/^--import=file:/);
    expect(env.NODE_OPTIONS).not.toContain('untrusted-hook');
  });
  it('binds exactly named historical acceptance tests and required synthetic source coverage to the staged manifest', () => {
    const { dir, manifest } = staged();
    const baseline = JSON.parse(readFileSync(join(dir, HISTORICAL_ACCEPTANCE_INVENTORY), 'utf8'));
    const rows = expectedHistoricalAcceptance(manifest, baseline);
    expect(rows.map(row => row.path)).toEqual([...HISTORICAL_ACCEPTANCE_TESTS]);
    expect(rows.map(row => row.assertionIds.length)).toEqual([7, 6, 7]);
    expect(rows.every(row => row.phase === 'acceptance' && row.status === 'not-run' && row.sourceTest.path === HISTORICAL_SOURCE_TEST)).toBe(true);
    expect(expectedTestFiles(manifest).unit).toContain(HISTORICAL_SOURCE_TEST);
    expect(expectedTestFiles(manifest).unit).toContain(HISTORICAL_LAUNCHER_TEST);
    for (const path of HISTORICAL_ACCEPTANCE_TESTS) expect(expectedTestFiles(manifest).unit).not.toContain(path);
    expect(() => expectedHistoricalAcceptance({ ...manifest, files: manifest.files.filter(file => file.path !== HISTORICAL_SOURCE_TEST) }, baseline)).toThrow(/source test/);
    expect(() => expectedHistoricalAcceptance(manifest, { ...baseline, assertions: baseline.assertions.slice(1) })).toThrow(/assertion inventory/);
    expect(() => expectedHistoricalAcceptance(manifest, { ...baseline, assertions: [...baseline.assertions, baseline.assertions[0]] })).toThrow(/assertion inventory/);
    expect(() => expectedHistoricalAcceptance(manifest, { ...baseline, assertions: baseline.assertions.map((id: string, i: number) => i === 0 ? `${id} changed` : id) })).toThrow(/assertion inventory/);
    const tampered = { ...manifest, deferredAcceptanceTests: rows.map((row, index) => index ? row : { ...row, status: 'passed' }) };
    expect(() => verifyStagedSource(dir, tampered)).toThrow(/historical acceptance inventory mismatch/);
  });
  it('binds the historical replay to its exact applicable names and immutable first-party fixtures', () => {
    const { dir, manifest } = staged();
    const replay = expectedHistoricalReplay(manifest);
    expect(replay).toMatchObject({ schema: 'aura3d.historical-replay-inventory/1', kind: 'first-party-historical-regression', path: HISTORICAL_REPLAY_TEST, phase: 'acceptance', status: 'not-run', currentCandidateBrowserReceipt: false });
    expect(replay.assertionIds).toEqual([...HISTORICAL_REPLAY_ASSERTIONS]);
    expect(replay.assertionIds).toHaveLength(9);
    expect(replay.inapplicableAssertionIds).toEqual([...HISTORICAL_REPLAY_INAPPLICABLE]);
    expect(replay.inapplicableAssertionIds).toHaveLength(2);
    expect(new Set([...replay.assertionIds, ...replay.inapplicableAssertionIds]).size).toBe(11);
    expect(replay.fixtures).toEqual([...HISTORICAL_REPLAY_FIXTURES]);
    expect(expectedTestFiles(manifest).unit).toContain(HISTORICAL_REPLAY_SOURCE_TEST);
    expect(expectedTestFiles(manifest).unit).not.toContain(HISTORICAL_REPLAY_TEST);
    expect(() => expectedHistoricalReplay({ ...manifest, files: manifest.files.filter(file => file.path !== HISTORICAL_REPLAY_SOURCE_TEST) })).toThrow(/source/);
    const victim = HISTORICAL_REPLAY_FIXTURES[0]!;
    const changed = { ...manifest, files: manifest.files.map(file => file.path === victim.path ? { ...file, sha256: 'a'.repeat(64) } : file) };
    expect(() => expectedHistoricalReplay(changed)).toThrow(/fixture identity/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredReplayTests: { ...replay, status: 'passed' } })).toThrow(/historical replay inventory mismatch/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredReplayTests: { ...replay, assertionIds: replay.assertionIds.slice(1) } })).toThrow(/historical replay inventory mismatch/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredReplayTests: { ...replay, assertionIds: replay.assertionIds.map((id: string, index: number) => index ? id : `${id} changed`) } })).toThrow(/historical replay inventory mismatch/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredReplayTests: { ...replay, currentCandidateBrowserReceipt: true } })).toThrow(/historical replay inventory mismatch/);
  });
  it('binds external codec fixture policy and required offline tests without inventing external asset hashes', () => {
    const { dir, manifest } = staged();
    const cell = expectedExternalCodecAcceptance(manifest);
    expect(cell).toMatchObject({ schema: 'aura3d.external-codec-fixture-inventory/1', kind: 'external-codec-fixtures', path: EXTERNAL_CODEC_TEST, phase: 'acceptance', status: 'not-run', currentCandidateBrowserReceipt: false });
    expect(cell.assertionIds).toEqual([...EXTERNAL_CODEC_ASSERTIONS]);
    expect(cell.assertionIds).toHaveLength(2);
    expect(cell.sourceTest.path).toBe(EXTERNAL_CODEC_SOURCE_TEST);
    expect(expectedTestFiles(manifest)['assets-qr']).toContain(EXTERNAL_CODEC_SOURCE_TEST);
    expect(expectedTestFiles(manifest).unit).toContain(EXTERNAL_CODEC_CONTRACT_TEST);
    expect(expectedTestFiles(manifest).unit).toContain(EXTERNAL_CODEC_LAUNCHER_TEST);
    expect(expectedTestFiles(manifest).unit).toContain(PORTABLE_NPM_LOCK_TEST);
    expect(cell).not.toHaveProperty('fixtures');
    for (const path of [EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST, PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST]) {
      expect(() => expectedExternalCodecAcceptance({ ...manifest, files: manifest.files.filter(file => file.path !== path) })).toThrow(/external codec input/);
    }
    expect(() => verifyStagedSource(dir, { ...manifest, deferredExternalCodecTests: { ...cell, status: 'passed' } })).toThrow(/external codec fixture inventory mismatch/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredExternalCodecTests: { ...cell, assertionIds: [cell.assertionIds[0], `${cell.assertionIds[1]} changed`] } })).toThrow(/external codec fixture inventory mismatch/);
    expect(() => verifyStagedSource(dir, { ...manifest, deferredExternalCodecTests: { ...cell, currentCandidateBrowserReceipt: true } })).toThrow(/external codec fixture inventory mismatch/);
  });
  it('rejects failing, stale or acceptance-phase producer reports before dependent checks', () => {
    const runId = 'fresh', path = `tests/reports/native-capabilities/${runId}/candidate-plan.json`;
    const candidate = { candidatePlan: { path, sha256: 'a'.repeat(64) } };
    const plan = { source: { commit: 'b'.repeat(40), fingerprint: 'c'.repeat(64), inputDigest: 'd'.repeat(64), lockfileSha256: 'e'.repeat(64) } };
    const base = { schema: 'aura3d.native-consumers/1', phase: 'source', runId };
    const source = { revision: plan.source.commit, stagedSourceSha256: plan.source.fingerprint, lockfileSha256: plan.source.lockfileSha256 };
    const consumer = { ...base, pass: true, candidate: candidate.candidatePlan, source, browser: [{ status: 'not-run' }] };
    const matrix = { ...base, status: 'pass', candidate: candidate.candidatePlan, source: { ...source, stagedSourceSha256: plan.source.inputDigest }, browser: [{ status: 'not-run' }] };
    const examples = { ...base, pass: true, candidatePlan: path, candidateSha256: candidate.candidatePlan.sha256, stagedSourceSha256: plan.source.inputDigest, lockfileSha256: plan.source.lockfileSha256, browser: 'not-run' };
    for (const [name, report] of [['sourceConsumerReport', consumer], ['matrixSourceReport', matrix], ['examplesSourceReport', examples]] as const) {
      expect(() => assertPassingPhaseReport(name, report, runId, candidate, plan)).not.toThrow();
      expect(() => assertPassingPhaseReport(name, { ...report, runId: 'old' }, runId, candidate, plan)).toThrow(/identity/);
      expect(() => assertPassingPhaseReport(name, { ...report, phase: 'browser' }, runId, candidate, plan)).toThrow(/identity/);
    }
    expect(() => assertPassingPhaseReport('sourceConsumerReport', { ...consumer, pass: false }, runId, candidate, plan)).toThrow(/failed or mismatched/);
    expect(() => assertPassingPhaseReport('matrixSourceReport', { ...matrix, status: 'fail' }, runId, candidate, plan)).toThrow(/failed or mismatched/);
    expect(() => assertPassingPhaseReport('examplesSourceReport', { ...examples, candidateSha256: 'f'.repeat(64) }, runId, candidate, plan)).toThrow(/failed or mismatched/);
    expect(() => assertPassingPhaseReport('examplesSourceReport', { ...examples, browser: 'passed' }, runId, candidate, plan)).toThrow(/failed or mismatched/);
  });
  it('never lets upload or infrastructure success hide failed or absent test status', () => {
    expect(evaluateRunResult('SOURCE_TEST_EXIT=1\nSOURCE_UPLOAD_EXIT=0\n', 0)).toMatchObject({ sourceTestExit: 1, artifactUploadExit: 0, ok: false });
    expect(evaluateRunResult('SOURCE_UPLOAD_EXIT=0\n', 0).ok).toBe(false);
    expect(evaluateRunResult('SOURCE_TEST_EXIT=0\nSOURCE_UPLOAD_EXIT=1\n', 0).ok).toBe(false);
    expect(evaluateRunResult('SOURCE_TEST_EXIT=0\nSOURCE_UPLOAD_EXIT=0\n', 1).ok).toBe(false);
    expect(evaluateRunResult('SOURCE_TEST_EXIT=0\nSOURCE_UPLOAD_EXIT=0\n', 0).ok).toBe(true);
  });
  it('restores only run-scoped, hash-verified evidence without overwriting', () => {
    const downloaded = temp(), destination = temp(), runId = 'sample';
    const f = materializationFixture(downloaded, runId), { report } = f;
    const log = report.checks.find((check: { id: string }) => check.id === 'unit').log;
    expect(materializeResults(destination, downloaded, runId)).toContain(`tests/reports/native-capabilities/${runId}`);
    expect(readFileSync(join(destination, log), 'utf8')).toBe('synthetic unit\n');
    expect(() => materializeResults(destination, downloaded, runId)).toThrow(/overwrite/);
    const other = temp(); f.write(log, 'tampered');
    expect(() => materializeResults(other, downloaded, runId)).toThrow(/hash mismatch/);
    f.write(log, 'synthetic unit\n');
    f.write(`${f.reportDir}/source-reports.json`, JSON.stringify({ ...report, checks: report.checks.slice(1) }));
    expect(() => materializeResults(temp(), downloaded, runId)).toThrow(/check inventory/);
    const failed = { ...report, checks: report.checks.map((check: any, index: number) => index === 0 ? { ...check, status: 'failed', exitCode: 1 } : check) };
    f.write(`${f.reportDir}/source-reports.json`, JSON.stringify(failed));
    const failedDestination = temp();
    expect(() => materializeResults(failedDestination, downloaded, runId)).toThrow(/checks failed/);
    expect(readFileSync(join(failedDestination, log), 'utf8')).toBe('synthetic unit\n');
  });
  it('merges a resumed run only when retained prefix and portable identities match', () => {
    const downloaded = temp(), destination = temp(), runId = 'sample', reportDir = `tests/reports/native-capabilities/${runId}`;
    const side = `tests/reports/native-source-inputs/${runId}`, f = materializationFixture(downloaded, runId, 'resume');
    const ref = f.write, manifest = f.sourceManifest;
    const candidatePlan = ref(`${reportDir}/candidate-plan.json`, 'plan');
    const buildHandoff = ref(`${reportDir}/source-build.json`, 'build');
    const inventory = ref(`${reportDir}/resume-build-products.json`, 'inventory');
    const inputs = ref(`${side}/inputs.json`, 'inputs'), consumerBundle = ref(`${side}/consumer.json`, 'consumer');
    const exampleBundle = ref(`${side}/examples.json`, 'examples'), matrixBundle = ref(`${side}/matrix/bundle.json`, 'matrix');
    const reviewBytes = '{"synthetic":true}', candidateReview = ref(`${side}/candidate-reviews/${hash(reviewBytes)}.json`, reviewBytes);
    const reviewEvidence = ref(`${side}/candidate-review-evidence/note.txt`, 'synthetic evidence');
    Object.assign(f.report, { candidatePlan, buildHandoff,
      resumeRebuild: { checkId: 'resume-rebuild', inventory, buildProductsSha256: hash('products') },
      portableInputs: { sourceManifest: manifest, candidatePlan, inputs, consumerBundle, exampleBundle, matrixBundle,
        admissionPolicy: { path: 'tools/release/archive-admission-policy.json', sha256: hash('policy') }, candidateReviews: [candidateReview], candidateReviewEvidence: [reviewEvidence] } });
    f.save();
    put(destination, manifest.path, f.manifestBytes); put(destination, candidatePlan.path, 'plan'); put(destination, buildHandoff.path, 'build');
    expect(materializeResults(destination, downloaded, runId, 'resume')).toContain(reportDir);
    expect(readFileSync(join(destination, inventory.path), 'utf8')).toBe('inventory');
    const conflict = temp(); put(conflict, manifest.path, 'different');
    expect(() => materializeResults(conflict, downloaded, runId, 'resume')).toThrow(/retained artifact changed/);
    expect(() => readFileSync(join(conflict, inventory.path))).toThrow();
    ref(reviewEvidence.path, 'altered evidence');
    expect(() => materializeResults(temp(), downloaded, runId, 'resume')).toThrow(/hash mismatch/);
  });
  it('rejects rehashed source inventory, manifest and execution coverage substitutions', () => {
    const downloaded = temp(), f = materializationFixture(downloaded, 'inventory-substitution');
    f.report.sourceInventory = f.write(f.report.sourceInventory.path, '{}'); f.save();
    expect(() => materializeResults(temp(), downloaded, 'inventory-substitution')).toThrow(/source inventory mismatch/);

    const other = temp(), g = materializationFixture(other, 'manifest-substitution');
    const manifest = JSON.parse(g.manifestBytes);
    manifest.files[0].sha256 = hash('substituted bytes');
    g.report.sourceManifestSha256 = g.write(g.sourceManifest.path, JSON.stringify(manifest)).sha256; g.save();
    expect(() => materializeResults(temp(), other, 'manifest-substitution')).toThrow(/manifest digest mismatch/);

    const third = temp(), h = materializationFixture(third, 'coverage-substitution');
    h.report.executedSourceTestFiles = []; h.save();
    expect(() => materializeResults(temp(), third, 'coverage-substitution')).toThrow(/source test coverage mismatch/);
  });
  it('rejects a rehashed skipped supplemental TAP result before materialization', () => {
    const downloaded = temp(), f = materializationFixture(downloaded, 'supplemental-substitution');
    const check = f.report.checks.find((item: { id: string }) => item.id === 'template-node');
    const subrun = check.subruns[0];
    const skipped = readFileSync(join(f.payload, subrun.result.path), 'utf8').replace('# skipped 0', '# skipped 1');
    subrun.result = f.write(subrun.result.path, skipped); f.save();
    expect(() => materializeResults(temp(), downloaded, 'supplemental-substitution')).toThrow(/skipped/);
  });
  it('retains an early failure log but rejects a missing source report', () => {
    const downloaded = temp(), destination = temp(), runId = 'sample';
    const taskLog = `tests/reports/native-capabilities/${runId}/source-task.log`;
    put(downloaded, `${runId}/${taskLog}`, 'early failure');
    expect(() => materializeResults(destination, downloaded, runId)).toThrow(/source report is missing/);
    expect(readFileSync(join(destination, taskLog), 'utf8')).toBe('early failure');
  });
  it('refuses native acceptance before starting a provider process', () => {
    if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
      expect(() => assertNoAcceptanceProcess('bash', ['tools/remote-acr/run.sh'])).toThrow(/acceptance process/);
      return;
    }
    const dir = temp(), sentinel = join(dir, 'az'), touched = join(dir, 'called');
    writeFileSync(sentinel, `#!/bin/sh\ntouch '${touched}'\nexit 0\n`, { mode: 0o755 });
    const checks = [
      [{ RUN_ID: 'native-probe', SPECS: 'tests/browser/native-geometry-query.spec.ts' }, /code-complete gate/],
      [{ RUN_ID: 'native-probe', AURA3D_NATIVE_ACCEPTANCE: '1', SPECS: 'tests/browser/example.spec.ts @headed-xvfb' }, /headed selectors/],
      [{ RUN_ID: 'native-probe', AURA3D_BROWSER_PROJECT: 'bad', SPECS: 'tests/browser/example.spec.ts' }, /unsupported native browser project/]
    ] as const;
    for (const [extra, message] of checks) {
      const child = spawnSync('bash', ['tools/remote-acr/run.sh'], { cwd: root, env: { ...process.env, AURA3D_CODE_COMPLETE_GATE: '', AZ_WRAPPER: sentinel, ...extra }, encoding: 'utf8' });
      expect(child.status).toBe(2); expect(child.stderr).toMatch(message);
    }
    expect(() => readFileSync(touched)).toThrow();
  });
});

describe('artifact egress', () => {
  it('rejects query credentials, unsafe names, symlinks and outside-root inputs', () => {
    expect(() => parseBlobUrl('https://example.blob.core.windows.net/container?sig=secret')).toThrow();
    expect(() => parseArgs(['--prefix', '../bad', 'x'])).toThrow();
    const dir = temp(); put(dir, 'inside/data.txt', 'ok'); symlinkSync('/etc/passwd', join(dir, 'inside/link'));
    expect(() => collectArtifacts(parseArgs(['--prefix', 'run1', '--preserve-root', dir, join(dir, 'inside')]))).toThrow(/symlink/);
    expect(() => collectArtifacts(parseArgs(['--prefix', 'run1', '--preserve-root', dir, '/etc/passwd']))).toThrow();
  });
  it('uses managed identity and preserves hashed report bytes; propagates upload failure', async () => {
    const dir = temp(); put(dir, 'reports/source.json', '{"status":"passed"}\n');
    const env = { AURA3D_ARTIFACTS_BLOB_URL: 'https://example.blob.core.windows.net/container', IDENTITY_ENDPOINT: 'http://127.0.0.1:1234/token', IDENTITY_HEADER: 'private-value' };
    const calls: Array<{ url: string, options: any }> = [];
    const request = async (url: URL, options: any) => { calls.push({ url: String(url), options }); return options.method === 'PUT' ? { ok: true, status: 201 } : { ok: true, json: async () => ({ access_token: 'token-value' }) }; };
    expect(await managedIdentityToken(env, request as any)).toBe('token-value');
    const args = parseArgs(['--prefix', 'run1', '--preserve-root', dir, join(dir, 'reports')]);
    expect(await run(args, env, request as any)).toEqual({ uploaded: 1 });
    const uploaded = calls.find(c => c.options.method === 'PUT')!;
    expect(uploaded.url).toContain('/run1/reports/source.json');
    expect(hash(uploaded.options.body)).toBe(hash(readFileSync(join(dir, 'reports/source.json'))));
    expect(uploaded.url).not.toContain('token-value');
    const failing = async (_url: URL, options: any) => options.method === 'PUT' ? { ok: false, status: 403 } : { ok: true, json: async () => ({ access_token: 'token-value' }) };
    await expect(run(args, env, failing as any)).rejects.toThrow(/transfer failed/);
    put(dir, 'reports/source.json', '{"access_token":"secret"}');
    await expect(run(args, env, request as any)).rejects.toThrow(/credentials/);
  });
});

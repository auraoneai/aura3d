import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
const {
  BUILT_UNIT_TESTS, EXTERNAL_CODEC_TEST, HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_TEST,
  PACKED_UNIT_TESTS, buildProductsDigest, buildSteps,
  computeInputDigest, materializeResults, nativeSourceInventoryForManifest, parseSourceShellResult, parseTap,
  parseVitestInventory, sourceHandoffApi, sourceTestFileCoverage, validateSupplementalCheck
} = await import(new URL('../../../tools/remote-acr/source-checks.mjs', import.meta.url).href) as Record<string, any>;
const { verifySourceBuildHandoff } = await import(new URL('../../../tools/remote-acr/source-resume.mjs', import.meta.url).href) as {
  verifySourceBuildHandoff: (input: any) => any;
};

const { verifySourceInventoryEvidence } = await import(new URL('../../../tools/native-capability-gate/index.mjs', import.meta.url).href) as {
  verifySourceInventoryEvidence: (input: any) => string[];
};

const dirs: string[] = [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const rootOfRepo = resolve(import.meta.dirname, '../../..');
const tap = (name: string, failed = false) => `TAP version 13\n# Subtest: ${name}\n${failed ? 'not ok' : 'ok'} 1 - ${name}\n# tests 1\n# pass ${failed ? 0 : 1}\n# fail ${failed ? 1 : 0}\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'a3d-inventory-binding-')); dirs.push(path); return path; };
function put(root: string, path: string, contents: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
  return { path, sha256: hash(contents) };
}
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function manifest(extra: string[] = []) {
  const paths = [
    'tools/native-source-inventory/index.mjs',
    'tests/unit/parity/numeric.test.ts', 'tests/unit/core.test.ts', ...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS,
    'tests/assets/asset.test.ts', 'tests/integration/consumer.test.ts',
    'packages/core/tests/core.test.ts', 'tools/release/archive.test.mjs',
    ...HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_TEST, EXTERNAL_CODEC_TEST,
    'apps/showcase-cross-hop/tests/lanes.test.ts', 'apps/showcase-cross-hop/vitest.config.ts',
    'tools/agent-templates/cli.test.mjs', 'tools/agent-templates/command.test.mjs',
    'tests/cli-configs/meshy-agent.test.sh', 'cli-configs/meshy-agent',
    'tests/cli-configs/setup-meshy.test.sh', 'cli-configs/setup-meshy.sh',
    ...extra
  ];
  const files = [...new Set(paths)].sort().map(path => ({ path, sha256: hash(path), mode: '100644', type: 'file' }));
  return {
    schema: 'aura3d.native-source-manifest/1', files, inputDigest: computeInputDigest(files),
    deferredAcceptanceTests: HISTORICAL_ACCEPTANCE_TESTS.map((path: string) => ({ path, phase: 'acceptance', status: 'not-run' })),
    deferredReplayTests: { path: HISTORICAL_REPLAY_TEST, phase: 'acceptance', status: 'not-run' },
    deferredExternalCodecTests: { path: EXTERNAL_CODEC_TEST, phase: 'acceptance', status: 'not-run' }
  };
}

function syntheticEvidence() {
  const root = temp(), runId = 'synthetic-inventory-unit', reportDir = `tests/reports/native-capabilities/${runId}`;
  const source = manifest(), sourcePlan = nativeSourceInventoryForManifest(source, runId);
  const sourceManifest = put(root, `${reportDir}/source-manifest.json`, JSON.stringify(source));
  const sourceInventory = put(root, `${reportDir}/source-inventory.json`, JSON.stringify(sourcePlan));
  const steps = buildSteps(runId, reportDir, 'patch', sourcePlan);
  const expected = sourceTestFileCoverage(sourcePlan, []).expectedTestFiles;
  const supplemental = new Map(sourcePlan.supplementalChecks.map((plan: any) => [plan.id, plan]));
  const checks: any[] = [], inventories: any[] = [];
  const vitestIds = ['parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr', 'integration'];
  const tapIds = ['packages', 'packages-dist', 'node-release'];
  for (const step of steps) {
    const log = put(root, `${reportDir}/logs/${step.id}.log`, `synthetic ${step.id}\n`);
    const plan: any = supplemental.get(step.id);
    const check: any = { id: step.id, argv: step.argv, ...(plan ? { runner: plan.runner, cwd: plan.cwd } : {}),
      subruns: [], started: true, status: 'passed', exitCode: 0, log: log.path, sha256: log.sha256 };
    if (vitestIds.includes(step.id) || plan?.runner === 'vitest') {
      const files = expected[step.id];
      const raw = { success: true, numTotalTests: files.length, testResults: files.map((path: string) => ({
        name: `/synthetic/repo/${path}`, assertionResults: [{ status: 'passed', fullName: `${path} assertion` }]
      })) };
      const result = put(root, `${reportDir}/${step.id}.json`, JSON.stringify(raw));
      const cwd = plan?.cwd || '.';
      inventories.push({ checkId: step.id, ...(plan ? { runner: plan.runner, cwd } : {}), result,
        sourceRoot: '/synthetic/repo', ...parseVitestInventory(raw, files, '/synthetic/repo', cwd) });
      if (plan) {
        const output = put(root, `${reportDir}/results/${step.id}/0.log`, 'synthetic Vitest output\n');
        check.subruns.push({ file: null, argv: plan.invocations[0].argv, cwd, exitCode: 0,
          signal: null, error: null, result: output, testResult: result });
      }
    } else if (tapIds.includes(step.id) || plan) {
      const files = expected[step.id], summary: any = { checkId: step.id,
        ...(plan ? { runner: plan.runner, cwd: plan.cwd } : {}),
        expectedFiles: files, discoveredFiles: [], testCount: 0, passedCount: 0,
        failedCount: 0, skippedCount: 0, testNames: [],
        ...(plan?.runner === 'shell' ? { countKind: 'file-invocations' } : {}) };
      for (const [index, file] of files.entries()) {
        const shell = plan?.runner === 'shell';
        const output = shell ? `${file.split('/').at(-1)}: 3 cases passed\n` : tap(file);
        const result = put(root, `${reportDir}/results/${step.id}/${index}.${shell ? 'log' : 'tap'}`, output);
        const argv = plan ? plan.invocations[index].argv
          : step.id === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file]
            : step.id === 'packages-dist' ? ['node', '--import', 'tsx', '--test', '--test-reporter=tap', file]
              : ['node', '--test', '--test-reporter=tap', file];
        const stats = shell ? parseSourceShellResult(output, file) : parseTap(output);
        check.subruns.push({ file, argv, exitCode: 0, result,
          ...(plan ? { cwd: plan.cwd, signal: null, error: null } : {}),
          ...(shell ? { reportedCases: stats.reportedCases } : {}) });
        summary.discoveredFiles.push(file);
        for (const key of ['testCount', 'passedCount', 'failedCount', 'skippedCount']) summary[key] += stats[key];
        summary.testNames.push(...stats.testNames);
      }
      inventories.push(summary);
    }
    checks.push(check);
  }
  const ids = steps.map((step: any) => step.id);
  const reports: any = { schema: 'aura3d.native-source-reports/1', runId, releaseKind: 'patch', acceptance: 'not-run',
    sourceManifestPath: sourceManifest.path, sourceManifestSha256: sourceManifest.sha256, sourceInventory,
    expectedCheckIds: ids, fullExpectedCheckIds: ids, executedCheckIds: ids, checks, testInventories: inventories,
    ...sourceTestFileCoverage(sourcePlan, inventories) };
  const verifyGate = () => verifySourceInventoryEvidence({ root, reports, manifestRef: sourceManifest, manifest: source });
  const packIndex = steps.findIndex((step: any) => step.id === 'pack');
  const prefixChecks = checks.slice(0, packIndex + 1);
  const prefixInventories = inventories.filter(inv => prefixChecks.some(check => check.id === inv.checkId));
  const archive = put(root, `${reportDir}/candidate-tarballs/engine.tgz`, 'synthetic archive');
  const plan = put(root, `${reportDir}/candidate-plan.json`, JSON.stringify({ packages: [{ tarball: archive.path }] }));
  const products = [
    { path: 'dist', mode: '040755', sha256: hash(''), size: 0 },
    { path: 'dist/index.js', mode: '100644', sha256: hash('build'), size: 5 },
    { path: 'packages/core/dist', mode: '040755', sha256: hash(''), size: 0 },
    { path: 'packages/core/dist/index.js', mode: '100644', sha256: hash('core'), size: 4 }
  ];
  const buildReport: any = { schema: 'aura3d.native-source-build/1', runId, releaseKind: 'patch', acceptance: 'not-run',
    sourceManifestPath: sourceManifest.path, sourceManifestSha256: sourceManifest.sha256, sourceInventory,
    expectedCheckIds: prefixChecks.map(check => check.id), fullExpectedCheckIds: ids,
    executedCheckIds: prefixChecks.map(check => check.id), checks: prefixChecks, testInventories: prefixInventories,
    ...sourceTestFileCoverage(sourcePlan, prefixInventories),
    candidatePlan: plan, archives: [archive], completedOutcomeIds: ['synthetic-outcome'],
    buildProducts: products, buildProductsSha256: buildProductsDigest(products) };
  let buildRef: { path: string; sha256: string };
  const saveBuild = () => { buildRef = put(root, `${reportDir}/source-build.json`, JSON.stringify(buildReport)); };
  saveBuild();
  const api = { ...sourceHandoffApi(), verifyCandidate: () => ({ candidatePlan: plan, archives: [archive] }) };
  const verifyBuild = () => verifySourceBuildHandoff({ root, runId, releaseKind: 'patch',
    manifestBytes: Buffer.from(JSON.stringify(source)), manifest: source, expectedReportSha256: buildRef.sha256, api });
  return { root, runId, reportDir, source, sourcePlan, sourceManifest, reports, checks, inventories, buildReport, saveBuild, verifyGate, verifyBuild };
}

describe('manifest-bound source inventory execution', () => {
  it('derives all supplemental checks from the manifest and restricts argv and cwd', () => {
    const source = manifest(), inventory = nativeSourceInventoryForManifest(source, 'fixture');
    const steps = buildSteps('fixture', 'tests/reports/native-capabilities/fixture', 'patch', inventory);
    expect(inventory.supplementalChecks.map((check: any) => check.id)).toEqual([
      'app-cross-hop-vitest', 'cli-config-shell', 'template-node'
    ]);
    expect(steps.findIndex((step: any) => step.id === 'template-node')).toBeLessThan(steps.findIndex((step: any) => step.id === 'build'));
    expect(steps.findIndex((step: any) => step.id === 'pack') + 1).toBe(steps.findIndex((step: any) => step.id === 'resume-rebuild'));
    const app = inventory.supplementalChecks[0];
    expect(app.cwd).toBe('apps/showcase-cross-hop');
    expect(() => validateSupplementalCheck(app, 'fixture')).not.toThrow();
    expect(() => validateSupplementalCheck({ ...app, cwd: '../../' }, 'fixture')).toThrow(/allowlisted/);
    expect(() => validateSupplementalCheck({ ...app, invocations: [{ argv: [...app.invocations[0].argv, '--headed'] }] }, 'fixture')).toThrow(/allowlist/);
    expect(() => validateSupplementalCheck({ ...app, expectedFiles: ['apps/showcase-cross-hop/tests/../../evil.test.ts'] }, 'fixture')).toThrow(/allowlist/);
    const traversal = structuredClone(app);
    traversal.expectedFiles = ['apps/showcase-cross-hop/tests/../../evil.test.ts'];
    traversal.invocations[0].argv[traversal.invocations[0].argv.length - 1] = '../../evil.test.ts';
    expect(() => validateSupplementalCheck(traversal, 'fixture')).toThrow(/file is not allowlisted/);
  });

  it('rejects unknown tests and unstaged required inputs instead of skipping them', () => {
    expect(() => nativeSourceInventoryForManifest(manifest(['tests/new-area/unreviewed.test.ts']), 'fixture')).toThrow(/unreviewed/);
    expect(() => nativeSourceInventoryForManifest(manifest([
      'tests/game-runtime/aura3d104-game-runtime-source.test.ts', 'vitest.config.ts', 'aura.exports.json'
    ]), 'fixture')).toThrow(/browser-evidence\.manifest\.json/);
    const source = manifest();
    source.files = source.files.filter(entry => entry.path !== 'tools/native-source-inventory/index.mjs');
    expect(() => nativeSourceInventoryForManifest(source, 'fixture')).toThrow(/not a staged source input/);
    const symlink = manifest();
    symlink.files.find(entry => entry.path === 'tools/agent-templates/cli.test.mjs')!.type = 'symlink';
    expect(() => nativeSourceInventoryForManifest(symlink, 'fixture')).toThrow(/staged regular file/);
  });

  it('keeps a plan not-run and derives executed files only from observed inventories', () => {
    const inventory = nativeSourceInventoryForManifest(manifest(), 'fixture');
    const empty = sourceTestFileCoverage(inventory, []);
    expect(empty.expectedSourceTestFiles.length).toBeGreaterThan(0);
    expect(empty.executedSourceTestFiles).toEqual([]);
    const app = inventory.supplementalChecks[0];
    const partial = sourceTestFileCoverage(inventory, [{ checkId: app.id, discoveredFiles: app.expectedFiles }]);
    expect(partial.executedSourceTestFiles).toEqual(app.expectedFiles);
    expect(app.status).toBe('not-run');
    expect(() => sourceTestFileCoverage(inventory, [
      { checkId: app.id, discoveredFiles: app.expectedFiles }, { checkId: app.id, discoveredFiles: app.expectedFiles }
    ])).toThrow(/observed test inventory/);
  });
});

describe('synthetic source-runner process observations', () => {
  it('attempts every fixed invocation after a failure and records each actual result and hash', () => {
    const root = temp(), runId = 'synthetic-process';
    const inventory = nativeSourceInventoryForManifest(manifest(), runId);
    const plan = inventory.supplementalChecks.find((item: any) => item.id === 'template-node');
    const implementation = readFileSync(join(rootOfRepo, 'tools/remote-acr/source-checks.mjs'), 'utf8');
    const slice = implementation.slice(implementation.indexOf('function supplementalCwd('), implementation.indexOf('\nexport function runSource('));
    const calls: any[] = [];
    const fakeSpawn = (command: string, args: string[], options: any) => {
      calls.push({ command, args, cwd: options.cwd });
      const fail = calls.length === 1;
      return { status: fail ? 3 : 0, signal: null, stdout: Buffer.from(tap(args.at(-1)!, fail)), stderr: Buffer.alloc(0) };
    };
    const context = { Buffer, realpathSync, join, lstatSync, mkdirSync, writeFileSync, readFileSync, existsSync, resolve,
      validateSupplementalCheck, spawnSync: fakeSpawn, parseTap, parseSourceShellResult,
      inRoot: (dir: string, path: string) => resolve(dir, path), sha256: hash,
      assert: (condition: unknown, message: string) => { if (!condition) throw new Error(message); } };
    const execute = runInNewContext(`${slice}\nrunSupplementalCheck`, context);
    const log = join(root, 'result.log');
    const result = execute(root, runId, plan, {}, log);
    expect(calls).toHaveLength(2);
    expect(result.subruns.map((run: any) => run.exitCode)).toEqual([3, 0]);
    expect(result.inventory.discoveredFiles).toEqual(plan.expectedFiles);
    expect(result.error).toMatch(/exited 3/);
    for (const run of result.subruns) expect(hash(readFileSync(join(root, run.result.path)))).toBe(run.result.sha256);
  });

  it('runs the app-specific Vitest invocation in its reviewed cwd and retains its result bytes', () => {
    const root = temp(), runId = 'synthetic-cwd';
    const inventory = nativeSourceInventoryForManifest(manifest(), runId);
    const plan = inventory.supplementalChecks.find((item: any) => item.id === 'app-cross-hop-vitest');
    mkdirSync(join(root, plan.cwd), { recursive: true });
    const implementation = readFileSync(join(rootOfRepo, 'tools/remote-acr/source-checks.mjs'), 'utf8');
    const slice = implementation.slice(implementation.indexOf('function supplementalCwd('), implementation.indexOf('\nexport function runSource('));
    let observedCwd = '';
    const fakeSpawn = (_command: string, _args: string[], options: any) => {
      observedCwd = options.cwd;
      const raw = { success: true, numTotalTests: 1, testResults: [{
        name: resolve(root, plan.expectedFiles[0]), assertionResults: [{ status: 'passed', fullName: 'synthetic assertion' }]
      }] };
      put(root, `tests/reports/native-capabilities/${runId}/${plan.id}.json`, JSON.stringify(raw));
      return { status: 0, signal: null, stdout: Buffer.from('synthetic runner output'), stderr: Buffer.alloc(0) };
    };
    const context = { Buffer, realpathSync, join, lstatSync, mkdirSync, writeFileSync, readFileSync, existsSync, resolve,
      validateSupplementalCheck, spawnSync: fakeSpawn, parseTap, parseSourceShellResult, parseVitestInventory,
      observeVitestInventory: parseVitestInventory, inRoot: (dir: string, path: string) => resolve(dir, path), sha256: hash,
      assert: (condition: unknown, message: string) => { if (!condition) throw new Error(message); } };
    const execute = runInNewContext(`${slice}\nrunSupplementalCheck`, context);
    const result = execute(root, runId, plan, {}, join(root, 'result.log'));
    expect(observedCwd).toBe(realpathSync(join(root, plan.cwd)));
    expect(result.error).toBe('');
    expect(result.subruns[0].exitCode).toBe(0);
    expect(result.inventory.discoveredFiles).toEqual(plan.expectedFiles);
    expect(hash(readFileSync(join(root, result.subruns[0].testResult.path)))).toBe(result.subruns[0].testResult.sha256);
  });
});

describe('synthetic retained handoff and freeze evidence', () => {
  it('binds the complete planned sets and all executed supplemental results through the handoff and gate', () => {
    const f = syntheticEvidence();
    expect(f.verifyBuild().sourceInventory).toEqual(f.reports.sourceInventory);
    expect(f.verifyGate()).toContain(f.reports.sourceInventory.path);
    expect(f.reports.expectedSourceTestFiles).toEqual(f.reports.executedSourceTestFiles);
  });

  it('rejects missing invocations, nonzero real exits and changed working directories', () => {
    const f = syntheticEvidence();
    const node = f.checks.find(check => check.id === 'template-node');
    node.subruns.pop();
    f.saveBuild();
    expect(() => f.verifyBuild()).toThrow(/invocation inventory/);
    expect(() => f.verifyGate()).toThrow(/invocation inventory/);
    const g = syntheticEvidence();
    const shell = g.checks.find(check => check.id === 'cli-config-shell');
    shell.subruns[0].exitCode = 5;
    g.saveBuild();
    expect(() => g.verifyBuild()).toThrow(/invocation did not pass/);
    const h = syntheticEvidence();
    h.checks.find(check => check.id === 'app-cross-hop-vitest').subruns[0].cwd = '.';
    expect(() => h.verifyGate()).toThrow(/invocation did not pass/);
  });

  it('rejects omitted checks, altered inventories and plans that have no observed runs', () => {
    const f = syntheticEvidence();
    f.reports.executedCheckIds = f.reports.executedCheckIds.filter((id: string) => id !== 'template-node');
    expect(() => f.verifyGate()).toThrow(/expected\/executed checks/);
    const g = syntheticEvidence();
    g.buildReport.executedSourceTestFiles = [];
    g.saveBuild();
    expect(() => g.verifyBuild()).toThrow(/coverage mismatch/);
    const h = syntheticEvidence();
    const planOnly = { ...h.reports, checks: [], executedCheckIds: [], testInventories: [] };
    expect(() => verifySourceInventoryEvidence({ root: h.root, reports: planOnly, manifestRef: h.sourceManifest, manifest: h.source })).toThrow();
  });

  it('rejects a skipped Vitest assertion even if the altered JSON is rehashed', () => {
    const f = syntheticEvidence();
    const inv = f.inventories.find(item => item.checkId === 'app-cross-hop-vitest');
    const raw = JSON.parse(readFileSync(join(f.root, inv.result.path), 'utf8'));
    raw.testResults[0].assertionResults[0].status = 'skipped';
    const changed = put(f.root, inv.result.path, JSON.stringify(raw));
    inv.result = changed;
    f.checks.find(check => check.id === inv.checkId).subruns[0].testResult = changed;
    expect(() => f.verifyGate()).toThrow(/skipped|failed|missing/);
  });

  it('materializes only synthetic reports with the complete recomputed inventory and retained result hashes', () => {
    const f = syntheticEvidence(), downloaded = temp(), destination = temp();
    put(f.root, `${f.reportDir}/source-reports.json`, JSON.stringify(f.reports));
    cpSync(f.root, join(downloaded, f.runId), { recursive: true });
    expect(materializeResults(destination, downloaded, f.runId)).toContain(f.reportDir);
    const output = f.checks.find(check => check.id === 'template-node').subruns[0].result.path;
    put(join(downloaded, f.runId), output, 'changed synthetic result');
    expect(() => materializeResults(temp(), downloaded, f.runId)).toThrow(/hash mismatch/);
  });
});

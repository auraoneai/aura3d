import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseScopeOutcomes, validateAcceptanceGate } from '../../../tools/native-capability-gate/index.mjs';
import { buildGateInputs, deriveCompletion, EXPECTED_CHECKS, rowIsDone, STAGE_COMMANDS, VERIFY_ONLY_ROWS } from '../../../tools/remote-acr/source5-gate-inputs.mjs';
import { stageConsumers, verifyDownloadedConsumers } from '../../../tools/remote-acr/source5-artifacts.mjs';
import { checkGateBinding } from '../../../tools/remote-acr/acceptance5.mjs';
import { jobPathPlacements, placeJobPaths } from '../../../tools/remote-acr/acceptance-staging.mjs';
import { validateGateMatchesSource } from '../../../tools/native-consumer-matrix/index.ts';

vi.setConfig({ testTimeout: 60_000 });

const REPO = resolve(__dirname, '../../..');
const GATE = join(REPO, 'tools/native-capability-gate/index.mjs');
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
// Same canonical JSON + SHA-256 as tools/release/source-identity.mjs sourceManifestInputDigest.
const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
const sha512 = (data: Buffer) => `sha512-${createHash('sha512').update(data).digest('base64')}`;
const SHARDS = 2;
const ALL_STAGES = ['static', 'suites', 'packed-a', 'packed-b', ...Array.from({ length: SHARDS }, (_, i) => `unit-${i + 1}-of-${SHARDS}`)];
const stageIds = (stage: string) => (stage.startsWith('unit-') ? [stage] : (STAGE_COMMANDS as Readonly<Record<string, readonly string[]>>)[stage]);

const scopeHeader = '| ID | Task | Label | Remaining work |\n| --- | --- | --- | --- |\n';
function scopeDoc(extraRows = '') {
  const verifyOnly = Object.keys(VERIFY_ONLY_ROWS).map(id => `| ${id} | Synthetic verify-only row | FINISH-5.0 | Verify-only: run existing suites in source pass. |`).join('\n');
  return `# Synthetic 5.0 scope\n\n## Partial rows\n\n### WP-01\n\n${scopeHeader}| S5-WP01-01 | Synthetic finished row | FINISH-5.0 | Do it. **DONE 2026-11-02:** done. |\n${verifyOnly}\n${extraRows}`
    + `| S5-WP01-02 | Synthetic experimental row | EXPERIMENTAL-5.0 | Opt-in path; fallback: refuses with a typed error. |\n| S5-WP01-03 | Synthetic custody row | SUPERSEDED-PROCESS | Replaced by the ACR source pass. |\n\n`
    + `## Named defects (always FINISH-5.0)\n\n${scopeHeader}| S5-DEF-01 | Teardown | FINISH-5.0 | **DONE 2026-11-02:** fixed. |\n| S5-DEF-07 | Migration guide | FINISH-5.0 | **DONE 2026-11-02:** written. |\n`;
}

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aura3d-source5-gate-'));
  const template = mkdtempSync(join(tmpdir(), 'aura3d-source5-git-template-'));
  roots.push(root, template);
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('AURA3D_') && !key.startsWith('NATIVE_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TEMPLATE_DIR: template, GIT_TERMINAL_PROMPT: '0' });
  const git = (args: string[], input?: string) => execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', ...args], { cwd: root, env, input, encoding: 'utf8' }).trim();
  const put = (path: string, data: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); return { path, sha256: hash(data) }; };
  const putJson = (path: string, value: unknown) => put(path, `${JSON.stringify(value, null, 2)}\n`);
  const evidence = ['tests/unit/tools/reads-browser-evidence.test.ts', 'tests/unit/tools/reads-visual-evidence.test.ts'];
  put('.gitignore', 'tests/reports/\nnode_modules/\n');
  put('.gitattributes', 'assets/*.bin filter=lfs diff=lfs merge=lfs -text\n');
  put('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put('src/engine.ts', 'export const engine = 5;\n');
  put('tools/remote-acr/acceptance-evidence-tests.txt', `# deferred: reads gitignored browser evidence\n${evidence.join('\n')}\n`);
  put('docs/scope.md', scopeDoc());
  put('docs/scope-unmapped.md', scopeDoc('| S5-WP09-09 | Unmapped unfinished row | FINISH-5.0 | Still owes code. |\n'));
  const lfsContent = Buffer.from('large binary asset bytes '.repeat(64));
  put('assets/big.bin', lfsContent);
  git(['init', '-q']);
  git(['add', '-A']);
  // Simulate a Git LFS file: the commit stores the pointer, the checkout holds the content.
  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${hash(lfsContent)}\nsize ${lfsContent.length}\n`;
  const pointerOid = git(['hash-object', '-w', '--no-filters', '--stdin'], pointer);
  git(['update-index', '--cacheinfo', `100644,${pointerOid},assets/big.bin`]);
  git(['commit', '-qm', 'freeze']);
  const commit = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']);
  // Every fixture file is a source input (no tests/reports, dist or node_modules paths are committed).
  const sourcePaths = git(['ls-files']).split('\n').filter(Boolean).sort((a, b) => (a < b ? -1 : 1));
  const files = sourcePaths.map(path => ({ path, type: 'file', mode: '100644', sha256: hash(readFileSync(join(root, path))) }));
  const lockfileSha256 = hash(readFileSync(join(root, 'pnpm-lock.yaml')));
  const manifestText = `${JSON.stringify({ schema: 'aura3d.native-source-manifest/1', origin: { commit, tree }, files, administrativeFiles: [], lockfileSha256, inputDigest: hash(canonical(files)) }, null, 2)}\n`;
  const tarballs = ['engine', 'react'].map(name => ({ name: `@aura3d/${name}`, file: `aura3d-${name}-5.0.0.tgz`, data: Buffer.from(`synthetic ${name} tarball`) }));
  const plan = {
    schema: 'aura3d-release-plan/1.0', source: { commit, tree, lockfileSha256 }, generatedAt: '2026-11-02T00:00:00.000Z', commit, lockfileSha256,
    version: '5.0.0', inventoryId: 'synthetic', dryRun: false, packOnly: true, expectedPackageCount: 2, packageCount: 2, targetVersionUnpublished: null,
    packages: tarballs.map(t => ({ name: t.name, version: '5.0.0', internalDependencies: [], tarball: `tests/reports/release-tarballs/${t.file}`, sha256: hash(t.data), integrity: sha512(t.data), unpublished: null }))
  };
  const planSha256 = hash(`${JSON.stringify(plan, null, 2)}\n`);

  type RunOptions = { stages?: string[]; failing?: string[]; commit?: string; fullPass?: boolean; artifacts?: boolean; consumers?: boolean; dropStageReport?: string[];
    consumerPlanSha256?: string; packedBPlan?: Record<string, unknown> };
  /** packed-b consumer reports (clean-install, matrix, packed examples) through the real stage (job) -> verify/extract (Mac) round trip. */
  const retainConsumers = (dir: string, runId: string, consumerPlanSha256 = planSha256) => {
    const job = mkdtempSync(join(tmpdir(), 'aura3d-source5-job-'));
    roots.push(job);
    const jobPut = (path: string, text: string) => { mkdirSync(dirname(join(job, path)), { recursive: true }); writeFileSync(join(job, path), text); };
    // Each report names the plan it ran against at its in-job path (packed-b's NATIVE_REPORT_DIR).
    const candidate = { path: `tests/reports/native-5/${runId}/candidate-plan.json`, sha256: consumerPlanSha256 };
    jobPut(`tests/reports/native-consumers/${runId}/source.json`, `${JSON.stringify({ schema: 'aura3d.native-consumers/1', phase: 'source', runId, status: 'pass', candidate })}\n`);
    jobPut(`tests/reports/native-consumers/${runId}/matrix-source.json`, `${JSON.stringify({ schema: 'aura3d.native-consumers/1', phase: 'source', runId, status: 'pass', matrix: true, candidate })}\n`);
    jobPut(`tests/reports/native-examples-catalog/${runId}/examples-source.json`, `${JSON.stringify({ schema: 'aura3d.native-consumers/1', phase: 'source', install: 'packed-v1', runId, pass: true, candidatePlan: candidate.path, candidateSha256: candidate.sha256 })}\n`);
    jobPut(`tests/reports/native-examples-catalog/${runId}/projects/starter-example-camera-path/package.json`, '{"name":"aura3d-example-install-wrapper"}\n');
    jobPut(`tests/reports/native-consumers/${runId}/projects/react-import/package.json`, '{"name":"react-import"}\n');
    jobPut(`tests/reports/native-consumer-matrix/${runId}/projects/npm-react19-peer-present/package.json`, '{"name":"cell"}\n');
    jobPut(`tests/reports/native-consumer-matrix/${runId}/logs/npm-react19-peer-present-install.log`, 'installed\n');
    const upload = join(job, 'upload/consumers');
    stageConsumers({ root: job, runId, outDir: upload, chunkBytes: 512 });
    const result = verifyDownloadedConsumers({ dir: upload, dest: join(root, dir, 'artifacts/consumers'), root, runId });
    expect(result.problems).toEqual([]);
    return result;
  };
  const makeRun = (runId: string, options: RunOptions = {}) => {
    const dir = `tests/reports/native-5/${runId}`, stages = options.stages ?? ALL_STAGES, failing = new Set(options.failing ?? []);
    const runCommit = options.commit ?? commit, full = options.fullPass ?? true;
    const commands: Array<Record<string, unknown>> = [];
    for (const stage of stages) {
      const rows = stageIds(stage).map(id => ({ id, exitCode: failing.has(`${stage}:${id}`) ? 1 : 0, seconds: 3,
        command: stage.startsWith('unit-') ? `pnpm exec vitest run tests/unit --maxWorkers=2 --shard=${stage.slice(5).replace('-of-', '/')}` : `synthetic ${id}` }));
      put(`${dir}/stage-${stage}.rc`, '0\n');
      put(`${dir}/acr-run-${stage}.log`, `log for ${stage}\n`);
      if (!options.dropStageReport?.includes(stage)) {
        putJson(`${dir}/stage-${stage}.json`, { schema: 'aura3d.source5-report/1', runId, releaseKind: 'major', finishedUtc: '2026-11-02T00:00:00.000Z',
          candidatePlan: stage === 'packed-b' && options.packedBPlan ? options.packedBPlan : stage.startsWith('packed-') ? plan : null, commands: rows, passed: rows.filter(r => r.exitCode === 0).map(r => r.id),
          failed: rows.filter(r => r.exitCode !== 0).map(r => r.id), stage, deferredToAcceptance: evidence, browserAcceptance: 'not-run', generatedApiReference: null });
      }
      commands.push(...rows.map(row => ({ stage, ...row })));
    }
    const manifestRef = full ? put(`${dir}/source-manifest.json`, manifestText) : null;
    let artifacts: unknown;
    if (stages.includes('packed-a') && options.artifacts !== false) {
      const planRef = putJson(`${dir}/artifacts/candidate-plan.json`, plan);
      // Shape written by verifyDownloadedArtifacts (tools/remote-acr/source5-artifacts.mjs).
      artifacts = { schema: 'aura3d.source5-artifacts/1', ok: true, dir: `${dir}/artifacts`, plan: { localPath: planRef.path, sha256: planRef.sha256 },
        archives: tarballs.map(t => ({ name: t.name, version: '5.0.0', planTarball: `tests/reports/release-tarballs/${t.file}`, localPath: `${dir}/artifacts/tarballs/${t.file}`,
          sha256: put(`${dir}/artifacts/tarballs/${t.file}`, t.data).sha256, size: t.data.length, verified: true })), reports: [], problems: [] };
    }
    const consumers = stages.includes('packed-b') && options.consumers !== false ? retainConsumers(dir, runId, options.consumerPlanSha256) : null;
    if (consumers) artifacts = { ...(artifacts as object ?? {}), consumers };
    putJson(`${dir}/source-report.json`, {
      schema: 'aura3d.source5-report/2',
      candidate: { commit: runCommit, sourceManifestSha256: manifestRef?.sha256 ?? 'reused-image', lockfileSha256: full ? lockfileSha256 : 'reused-image' },
      stages, commands, passed: commands.filter(c => c.exitCode === 0).map(c => c.id), failed: commands.filter(c => c.exitCode !== 0).map(c => c.id),
      problems: [], candidatePlan: stages.includes('packed-a') ? plan : null, browserAcceptance: 'not-run', ...(artifacts ? { artifacts } : {})
    });
    return dir;
  };
  const build = (runDirs: string[], scopePath = 'docs/scope.md', out?: string) => buildGateInputs({ root, runDirs, scopePath, out });
  const gate = (sourceReports: string, sourceManifest: string, out = 'tests/reports/native-capabilities/code-complete-go.json') => spawnSync(process.execPath, [GATE,
    '--phase', 'code-complete', '--source-manifest', sourceManifest, '--source-reports', sourceReports, '--scope', 'docs/scope.md',
    '--freeze-commit', commit, '--owner', 'synthetic-owner', '--out', out], { cwd: root, env, encoding: 'utf8' });
  return { root, commit, put, makeRun, build, gate, tarballs, plan, planSha256 };
}

describe('source5 gate inputs adapter + code-complete gate (synthetic committed fixture)', () => {
  it('all green: produces the gate inputs and the gate emits and revalidates CODE_COMPLETE_GO', () => {
    const f = fixture();
    const full = f.makeRun('full');
    const result = f.build([full]);
    const reports = result.reports;
    expect(reports.passingCheckIds).toEqual(EXPECTED_CHECKS.map(check => check.id));
    expect(reports.expectedCheckIds).toHaveLength(27);
    expect(EXPECTED_CHECKS.filter(check => check.section4)).toHaveLength(24);
    expect(reports.checks.find(check => check.id === 'unit')?.commands.map(c => c.id)).toEqual(['unit-1-of-2', 'unit-2-of-2', 'package-dist-unit']);
    expect(reports.archives.map(a => a.path)).toEqual(f.tarballs.map(t => `${full}/artifacts/tarballs/${t.file}`));
    expect(reports.deferredToAcceptance).toHaveLength(2);
    expect(reports.outcomeCompletion.filter(row => row.basis === 'verified-checks').map(row => row.id).sort()).toEqual(Object.keys(VERIFY_ONLY_ROWS).sort());

    const run = f.gate(result.sourceReports.path, result.sourceManifest.path);
    expect(run.stderr).toBe('');
    expect(run.stdout).toContain('CODE_COMPLETE_GO emitted');
    const record = JSON.parse(readFileSync(join(f.root, 'tests/reports/native-capabilities/code-complete-go.json'), 'utf8'));
    expect(record).toMatchObject({ status: 'CODE_COMPLETE_GO', sourceRunner: 'acr-source5', freezeCommit: f.commit, outcomeSource: 'aura3d-5.0-scope', acceptance: 'not-run' });
    expect([...record.completedOutcomeIds].sort()).toEqual([...record.requiredOutcomeIds].sort());
    expect(record.supersededOutcomes.map((row: { id: string }) => row.id)).toEqual(['S5-WP01-03']);
    expect(Object.keys(record.commitProof.lfsPointers)).toEqual(['assets/big.bin']);
    expect(record.inputs).toEqual(expect.arrayContaining([result.sourceManifest.path, `${full}/artifacts/tarballs/aura3d-engine-5.0.0.tgz`, `${full}/stage-packed-b.json`]));
    expect(validateAcceptanceGate({ root: f.root, gatePath: 'tests/reports/native-capabilities/code-complete-go.json' }).status).toBe('CODE_COMPLETE_GO');

    // packed-b's consumer reports: retained, re-hashed, bound in the record and consumed by acceptance gate-binding.
    const consumerBase = `${full}/artifacts/consumers/tests/reports`;
    expect(record.sourceConsumerReport).toEqual({ path: `${consumerBase}/native-consumers/full/source.json`, jobPath: 'tests/reports/native-consumers/full/source.json', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(record.matrixSourceReport.path).toBe(`${consumerBase}/native-consumers/full/matrix-source.json`);
    expect(record.examplesSourceReport).toEqual({ path: `${consumerBase}/native-examples-catalog/full/examples-source.json`, jobPath: 'tests/reports/native-examples-catalog/full/examples-source.json', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(record.consumerReports.files).toHaveLength(7);
    expect(record.consumerReports.files.every((file: { path: string; jobPath: string }) => file.path === `${full}/artifacts/consumers/${file.jobPath}`)).toBe(true);
    // In-job identities: the reports' plan path (bytes = the retained packed-a plan) and the plan's archive paths.
    expect(record.candidatePlan).toEqual({ path: `${full}/artifacts/candidate-plan.json`, sha256: f.planSha256, jobPath: 'tests/reports/native-5/full/candidate-plan.json' });
    expect(record.archives.map((a: { jobPath: string }) => a.jobPath)).toEqual(f.tarballs.map(t => `tests/reports/release-tarballs/${t.file}`));
    expect(record.inputs).toEqual(expect.arrayContaining([`${full}/artifacts/consumers/consumer-index.json`, record.sourceConsumerReport.path, record.examplesSourceReport.path,
      `${consumerBase}/native-consumer-matrix/full/logs/npm-react19-peer-present-install.log`]));
    for (const sourceReport of [record.matrixSourceReport.path, record.matrixSourceReport.jobPath, record.examplesSourceReport.jobPath]) {
      expect(validateAcceptanceGate({ root: f.root, gatePath: 'tests/reports/native-capabilities/code-complete-go.json', sourceReport }).status).toBe('CODE_COMPLETE_GO');
    }
    expect(() => validateAcceptanceGate({ root: f.root, gatePath: 'tests/reports/native-capabilities/code-complete-go.json', sourceReport: 'tests/reports/native-consumers/other/source.json' })).toThrow(/not bound/);
    const gateText = readFileSync(join(f.root, 'tests/reports/native-capabilities/code-complete-go.json'), 'utf8');
    expect(checkGateBinding({ gatePath: 'tests/reports/native-capabilities/code-complete-go.json', gateText, head: f.commit, trackedClean: true })).toEqual(expect.objectContaining({
      candidatePlan: 'tests/reports/native-5/full/candidate-plan.json', consumerSourceReport: 'tests/reports/native-consumers/full/source.json',
      matrixSourceReport: 'tests/reports/native-consumers/full/matrix-source.json', examplesSourceReport: 'tests/reports/native-examples-catalog/full/examples-source.json' }));
  });

  it('a later rerun on the same commit supersedes a failed stage', () => {
    const f = fixture();
    const full = f.makeRun('full', { failing: ['unit-2-of-2:unit-2-of-2', 'packed-b:consumer-matrix'] });
    expect(() => f.build([full])).toThrow(/check unit: FAILED unit-2-of-2:unit-2-of-2 exit 1[\s\S]*check consumer-matrix: FAILED/);
    const rerun = f.makeRun('rerun', { stages: ['unit-2-of-2', 'packed-b'], fullPass: false });
    const result = f.build([full, rerun]);
    expect(result.reports.stageSources['unit-2-of-2'].runId).toBe('rerun');
    expect(result.reports.stageSources['unit-1-of-2'].runId).toBe('full');
    expect(f.gate(result.sourceReports.path, result.sourceManifest.path).status).toBe(0);
  });

  it('refuses failed, missing, absent-report, mixed-commit and unretained runs', () => {
    const f = fixture();
    expect(() => f.build([f.makeRun('lint', { failing: ['static:lint'] })])).toThrow(/check lint: FAILED static:lint/);
    expect(() => f.build([f.makeRun('nopackb', { stages: ALL_STAGES.filter(s => s !== 'packed-b') })])).toThrow(/stage packed-b never ran[\s\S]*check clean-install: no result/);
    expect(() => f.build([f.makeRun('noreport', { dropStageReport: ['suites'] })])).toThrow(/stage suites: no stage report/);
    expect(() => f.build([f.makeRun('noartifacts', { artifacts: false })])).toThrow(/no retained artifacts/);
    expect(() => f.build([f.makeRun('noconsumers', { consumers: false })])).toThrow(/no retained consumer reports \(artifacts\.consumers\)/);
    const tampered = f.makeRun('tampered');
    f.put(`${tampered}/artifacts/consumers/tests/reports/native-consumers/tampered/source.json`, '{}\n');
    expect(() => f.build([tampered])).toThrow(/native-consumers\/tampered\/source\.json does not match the consumer index[\s\S]*retained sourceConsumerReport/);
    // A packed-b rerun with consumer reports supersedes a full pass whose packed-b retained none.
    const noConsumers = f.makeRun('full-noconsumers', { consumers: false });
    const packedB = f.makeRun('packedb-rerun', { stages: ['packed-b'], fullPass: false });
    const superseded = f.build([noConsumers, packedB]).reports;
    expect(superseded.consumerReports.runId).toBe('packedb-rerun');
    expect(superseded.candidatePlan.jobPath).toBe('tests/reports/native-5/packedb-rerun/candidate-plan.json');
    // Consumer reports produced against another plan, and packed stages whose plans are not byte-identical.
    expect(() => f.build([f.makeRun('otherplan', { consumerPlanSha256: 'b'.repeat(64) })])).toThrow(/consumer reports were produced against plan tests\/reports\/native-5\/otherplan\/candidate-plan\.json/);
    expect(() => f.build([f.makeRun('unpinned', { packedBPlan: { ...f.plan, generatedAt: '2026-11-02T00:00:01.000Z' } })])).toThrow(/candidate plans differ between packed-a and packed-b \(plan time not pinned/);
    const good = f.makeRun('good');
    const later = f.makeRun('later', { stages: ['static'], failing: ['static:typecheck'], fullPass: false });
    expect(() => f.build([good, later])).toThrow(/check typecheck: FAILED static:typecheck exit 1 \(run later\)/);
    const other = f.makeRun('other', { stages: ['static'], commit: 'f'.repeat(40), fullPass: false });
    expect(() => f.build([good, other])).toThrow(/runs mix candidate commits/);
    f.put(`${good}/artifacts/tarballs/aura3d-react-5.0.0.tgz`, 'tampered');
    expect(() => f.build([good])).toThrow(/aura3d-react-5.0.0.tgz does not match its recorded SHA-256/);
  });

  it('refuses unmapped required rows and verify-only rows whose mapped checks did not pass', () => {
    const f = fixture();
    expect(() => f.build([f.makeRun('unmapped')], 'docs/scope-unmapped.md')).toThrow(/S5-WP09-09 has no \*\*DONE\*\* marker and no reviewed verify-only check mapping/);
    expect(() => f.build([f.makeRun('budget', { failing: ['packed-a:bundle-size'] })])).toThrow(/S5-WP25-02 \(verify-only\): mapped checks not passing: bundle-size/);
  });

  it('the gate refuses hand-edited gate inputs and retained bytes changed after the adapter ran', () => {
    const f = fixture();
    const full = f.makeRun('full');
    const result = f.build([full]);
    const edited = { ...result.reports, completedOutcomeIds: result.reports.completedOutcomeIds.slice(1) };
    f.put('tests/reports/edited/source-reports.json', JSON.stringify(edited));
    const refused = f.gate('tests/reports/edited/source-reports.json', result.sourceManifest.path, 'tests/reports/edited/go.json');
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/completed outcome IDs differ/);
    expect(existsSync(join(f.root, 'tests/reports/edited/go.json'))).toBe(false);
    f.put(`${full}/acr-run-static.log`, 'rewritten log\n');
    const relogged = f.gate(result.sourceReports.path, result.sourceManifest.path);
    expect(relogged.status).not.toBe(0);
    expect(relogged.stderr).toMatch(/stageSources differs from the retained runs/);
    f.put(`${full}/artifacts/consumers/tests/reports/native-consumer-matrix/full/logs/npm-react19-peer-present-install.log`, 'rewritten\n');
    const consumerChanged = f.gate(result.sourceReports.path, result.sourceManifest.path);
    expect(consumerChanged.status).not.toBe(0);
    expect(consumerChanged.stderr).toMatch(/does not match the consumer index/);
    f.put(`${full}/stage-static.json`, '{}');
    const stale = f.gate(result.sourceReports.path, result.sourceManifest.path);
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toMatch(/retained runs do not pass[\s\S]*check typecheck: no result/);
  });
});

describe('source5 acceptance staging: retained files at their in-job paths (synthetic gate)', () => {
  it('places the plan, archives and consumer files at their recorded jobPaths, hash-verified, and the staged context still validates', () => {
    const f = fixture();
    const result = f.build([f.makeRun('full')]);
    expect(f.gate(result.sourceReports.path, result.sourceManifest.path).status).toBe(0);
    const gatePath = 'tests/reports/native-capabilities/code-complete-go.json';
    const record = JSON.parse(readFileSync(join(f.root, gatePath), 'utf8'));
    // The staged context = exactly the gate-enumerated inputs (run-acceptance5.sh rsync), no .git.
    const context = mkdtempSync(join(tmpdir(), 'aura3d-acceptance5-ctx-'));
    roots.push(context);
    for (const path of new Set([gatePath, ...record.inputs])) { mkdirSync(dirname(join(context, path)), { recursive: true }); writeFileSync(join(context, path), readFileSync(join(f.root, path))); }
    const placements = jobPathPlacements(record);
    expect(placements).toHaveLength(1 + record.archives.length + record.consumerReports.files.length);
    placeJobPaths(context, placements);
    for (const item of placements) expect(hash(readFileSync(join(context, item.jobPath)))).toBe(item.sha256);
    expect(readFileSync(join(context, 'tests/reports/native-5/full/candidate-plan.json'))).toEqual(readFileSync(join(f.root, record.candidatePlan.path)));
    expect(existsSync(join(context, 'tests/reports/release-tarballs/aura3d-engine-5.0.0.tgz'))).toBe(true);
    expect(existsSync(join(context, 'tests/reports/native-consumer-matrix/full/projects/npm-react19-peer-present/package.json'))).toBe(true);
    expect(existsSync(join(context, record.examplesSourceReport.jobPath))).toBe(true);
    // Idempotent on identical bytes; the job's gate validation and consumer identity checks pass at the in-job paths.
    placeJobPaths(context, placements);
    expect(validateAcceptanceGate({ root: context, gatePath, sourceReport: record.matrixSourceReport.jobPath }).status).toBe('CODE_COMPLETE_GO');
    const matrix = { source: { stagedSourceSha256: record.sourceInputDigest, lockfileSha256: record.lockfileSha256 },
      candidate: { path: 'tests/reports/native-5/full/candidate-plan.json', sha256: f.planSha256, packages: f.plan.packages } };
    expect(() => validateGateMatchesSource(record, matrix as never)).not.toThrow();
    expect(() => validateGateMatchesSource({ ...record, sourceRunner: undefined }, matrix as never)).toThrow(/candidate plans differ/);
  });

  it('refuses retained bytes that differ from the gate, a conflicting in-job file, and unsafe or missing in-job paths', () => {
    const f = fixture();
    const result = f.build([f.makeRun('full')]);
    expect(f.gate(result.sourceReports.path, result.sourceManifest.path).status).toBe(0);
    const record = JSON.parse(readFileSync(join(f.root, 'tests/reports/native-capabilities/code-complete-go.json'), 'utf8'));
    const stage = () => {
      const context = mkdtempSync(join(tmpdir(), 'aura3d-acceptance5-ctx-'));
      roots.push(context);
      for (const path of record.inputs) { mkdirSync(dirname(join(context, path)), { recursive: true }); writeFileSync(join(context, path), readFileSync(join(f.root, path))); }
      return context;
    };
    let context = stage();
    writeFileSync(join(context, record.archives[0].path), 'tampered');
    expect(() => placeJobPaths(context, jobPathPlacements(record))).toThrow(/does not match its gate SHA-256/);
    context = stage();
    mkdirSync(join(context, 'tests/reports/release-tarballs'), { recursive: true });
    writeFileSync(join(context, record.archives[1].jobPath), 'other bytes');
    expect(() => placeJobPaths(context, jobPathPlacements(record))).toThrow(/already holds different bytes/);
    expect(jobPathPlacements({ ...record, sourceRunner: undefined })).toEqual([]);
    expect(() => jobPathPlacements({ ...record, candidatePlan: { ...record.candidatePlan, jobPath: undefined } })).toThrow(/candidatePlan lacks/);
    expect(() => jobPathPlacements({ ...record, archives: [{ ...record.archives[0], jobPath: '../escape.tgz' }] })).toThrow(/archive lacks/);
    expect(() => jobPathPlacements({ ...record, archives: [{ ...record.archives[0], jobPath: 'src/engine.ts' }] })).toThrow(/under tests\/reports/);
    expect(() => jobPathPlacements({ ...record, archives: [record.archives[0], { ...record.archives[1], jobPath: record.archives[0].jobPath }] })).toThrow(/two different files/);
    expect(() => jobPathPlacements({ ...record, examplesSourceReport: null })).toThrow(/examplesSourceReport is not among/);
  });
});

describe('source5 gate inputs tables', () => {
  it('STAGE_COMMANDS matches the run order in tools/remote-acr/source5-run.sh', () => {
    const script = readFileSync(join(REPO, 'tools/remote-acr/source5-run.sh'), 'utf8');
    const ids = (body: string) => [...body.matchAll(/^\s*run ([a-z0-9-]+)\s/gm)].map(m => m[1]);
    const caseBody = (label: string) => new RegExp(`^  ${label}\\)\\n([\\s\\S]*?)^    ;;`, 'm').exec(script)?.[1] ?? '';
    const pack = ids(/pack_candidate\(\) \{\n([\s\S]*?)^\}/m.exec(script)?.[1] ?? '');
    expect(pack).toEqual(['build', 'pack']);
    for (const stage of ['static', 'suites', 'packed-a', 'packed-b'] as const) {
      const body = caseBody(stage);
      expect([...(body.includes('pack_candidate') ? pack : []), ...ids(body)], stage).toEqual(STAGE_COMMANDS[stage]);
    }
  });

  it('the reviewed verify-only table is exactly the required rows of the real scope list without a **DONE** marker', () => {
    const scope = parseScopeOutcomes(readFileSync(join(REPO, 'docs/prds/aura3d-5.0-scope.md'), 'utf8'));
    const open = scope.rows.filter(row => scope.required.includes(row.id) && !rowIsDone(row)).map(row => row.id);
    expect(Object.keys(VERIFY_ONLY_ROWS).filter(id => !scope.required.includes(id))).toEqual([]);
    expect(open.filter(id => !(id in VERIFY_ONLY_ROWS))).toEqual([]);
    const all = deriveCompletion(scope, EXPECTED_CHECKS.map(check => check.id));
    expect(all.problems).toEqual([]);
    expect([...all.completedOutcomeIds].sort()).toEqual([...scope.required].sort());
    expect(deriveCompletion(scope, []).completedOutcomeIds).toHaveLength(scope.required.length - open.length);
  });
});

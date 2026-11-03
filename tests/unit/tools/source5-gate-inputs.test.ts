import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseScopeOutcomes, validateAcceptanceGate } from '../../../tools/native-capability-gate/index.mjs';
import { buildGateInputs, deriveCompletion, EXPECTED_CHECKS, rowIsDone, STAGE_COMMANDS, VERIFY_ONLY_ROWS } from '../../../tools/remote-acr/source5-gate-inputs.mjs';

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
    packages: tarballs.map(t => ({ name: t.name, version: '5.0.0', internalDependencies: [], tarball: `.release-pack/${t.file}`, sha256: hash(t.data), integrity: sha512(t.data), unpublished: null }))
  };

  type RunOptions = { stages?: string[]; failing?: string[]; commit?: string; fullPass?: boolean; artifacts?: boolean; dropStageReport?: string[] };
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
          candidatePlan: stage.startsWith('packed-') ? plan : null, commands: rows, passed: rows.filter(r => r.exitCode === 0).map(r => r.id),
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
        archives: tarballs.map(t => ({ name: t.name, version: '5.0.0', planTarball: `.release-pack/${t.file}`, localPath: `${dir}/artifacts/tarballs/${t.file}`,
          sha256: put(`${dir}/artifacts/tarballs/${t.file}`, t.data).sha256, size: t.data.length, verified: true })), reports: [], problems: [] };
    }
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
  return { root, commit, put, makeRun, build, gate, tarballs };
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
    f.put(`${full}/stage-static.json`, '{}');
    const stale = f.gate(result.sourceReports.path, result.sourceManifest.path);
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toMatch(/retained runs do not pass[\s\S]*check typecheck: no result/);
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

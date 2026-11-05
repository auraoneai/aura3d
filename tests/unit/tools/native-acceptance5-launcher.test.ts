import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPlan, checkGateBinding, CODE_COMPLETE_RECORD, classifyPlaywrightTest, collectPlaywrightTests, estimateSpecTests, extractMarkedPayload,
  fetchReports, hardwareLabels, mergeAcceptance, parseInventory, parseTaskRunExits, planBatches, planShards,
  readHeadCommit, selectGroups, summarizeVitest, validateInventory
} from '../../../tools/remote-acr/acceptance5.mjs';

const INVENTORY = `
[group core]
project = chromium-automation
seconds-per-test = 100
reason = core specs
tests/browser/native-a.spec.ts
tests/browser/native-b.spec.ts tests=12
tests/browser/native-c.spec.ts tests=1 seconds-per-test=50

[group lane]
project = chromium-automation
config = tests/qr/prd04/playwright.config.ts
reason = lane spec
tests/qr/prd04/browser/x.spec.ts

[group ev]
kind = evidence
reason = deferred
include = list.txt

[group skip]
kind = excluded
reason = not run
tests/qr/prd14/browser/
`;
const parse = (text = INVENTORY) => parseInventory(text, { readInclude: () => '# c\ntests/unit/a.test.ts\n\ntests/unit/b.test.ts\n' });

describe('acceptance5 inventory', () => {
  it('parses groups, settings, overrides and includes', () => {
    const inv = parse();
    expect(inv.groups.map((g: { id: string; kind: string }) => [g.id, g.kind])).toEqual([['core', 'browser'], ['lane', 'browser'], ['ev', 'evidence'], ['skip', 'excluded']]);
    expect(inv.groups[0].entries[1]).toEqual({ path: 'tests/browser/native-b.spec.ts', tests: 12 });
    expect(inv.groups[0].entries[2]).toEqual({ path: 'tests/browser/native-c.spec.ts', tests: 1, secondsPerTest: 50 });
    expect(inv.groups[1].configDir).toBe('tests/qr/prd04');
    expect(inv.groups[2].entries.map((e: { path: string }) => e.path)).toEqual(['tests/unit/a.test.ts', 'tests/unit/b.test.ts']);
  });

  it('rejects unsupported projects/configs, missing reasons, wrong paths and duplicates', () => {
    const bad = (body: string) => () => parse(`[group g]\nreason = r\n${body}`);
    expect(bad('project = chromium-headed\ntests/browser/a.spec.ts')).toThrow(/unsupported project/);
    expect(bad('project = chromium-automation\nconfig = other.config.ts\ntests/browser/a.spec.ts')).toThrow(/unsupported config/);
    expect(bad('project = chromium-automation\ntests/unit/a.test.ts')).toThrow(/not a spec/);
    expect(bad('project = chromium-automation\ntests/browser/a.spec.ts\ntests/browser/a.spec.ts')).toThrow(/duplicate/);
    expect(bad('project = chromium-automation\ntests/browser/')).toThrow(/not a spec|directories/);
    expect(bad('project = chromium-automation\ntests/browser/../x.spec.ts')).toThrow(/unsafe/);
    expect(() => parse('[group g]\nproject = chromium-automation\ntests/browser/a.spec.ts')).toThrow(/no reason/);
  });

  it('requires every native spec on disk to be covered', () => {
    const inv = parse();
    expect(() => validateInventory(inv, { exists: () => true, nativeSpecs: ['tests/browser/native-a.spec.ts', 'tests/browser/native-z.spec.ts'] }))
      .toThrow(/native-z/);
    expect(() => validateInventory(inv, { exists: (p: string) => p !== 'tests/unit/b.test.ts', nativeSpecs: [] })).toThrow(/missing tests\/unit\/b/);
  });

  it('the committed inventory parses and covers every native spec in this checkout', () => {
    const root = new URL('../../../', import.meta.url).pathname;
    const inv = parseInventory(readFileSync(join(root, 'tools/remote-acr/acceptance5-inventory.txt'), 'utf8'),
      { readInclude: (p: string) => readFileSync(join(root, p), 'utf8') });
    const natives = readdirSync(join(root, 'tests/browser')).filter(n => /^native-.+\.spec\.ts$/.test(n)).map(n => `tests/browser/${n}`);
    expect(validateInventory(inv, { exists: (p: string) => existsSync(join(root, p)), nativeSpecs: natives })).toBe(true);
  });

  it('estimates tests statically, counting templated titles twice', () => {
    expect(estimateSpecTests('test.describe("x", () => {\n  test("a", f);\n  test.fixme(`b`, f);\n  for (const k of ks) {\n    test(`c ${k}`, f);\n  }\n});')).toBe(4);
    expect(estimateSpecTests('// nothing')).toBe(1);
  });
});

describe('acceptance5 shard and batch planning', () => {
  const estimate = () => 3;
  it('sizes shards by estimated seconds, capped at one shard per file', () => {
    const { shards, warnings } = planShards(parse(), { runId: 'r1', estimate, budgetSeconds: 900 });
    const core = shards.filter((s: { group: string }) => s.group === 'core');
    // (3 + 12) * 100 + 50 = 1550 s -> 2 shards
    expect(core.map((s: { shard: string | null }) => s.shard)).toEqual(['1/2', '2/2']);
    expect(core[0].runId).toBe('r1-core-1of2');
    expect(shards.find((s: { group: string }) => s.group === 'lane')).toMatchObject({ shard: null, config: 'tests/qr/prd04/playwright.config.ts', configDir: 'tests/qr/prd04' });
    expect(warnings.some((w: string) => w.includes('native-b'))).toBe(true);
    const tiny = planShards(parseInventory('[group g]\nproject = chromium-automation\nseconds-per-test = 1000\nreason = r\ntests/browser/a.spec.ts'),
      { runId: 'r1', estimate: () => 10 });
    expect(tiny.shards).toHaveLength(1);
    expect(tiny.shards[0].estimatedSeconds).toBe(1800);
  });

  it('refuses run IDs that would overflow shard IDs', () => {
    expect(() => planShards(parse(), { runId: 'x'.repeat(49), estimate })).toThrow(/48/);
    expect(() => planShards(parse(), { runId: 'bad id', estimate })).toThrow();
  });

  it('starts every run in a batch while the SAS still covers a full ACR run, evidence last', () => {
    const shards = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, estimatedSeconds: 1500 }));
    const batches = planBatches(shards, { hasEvidence: true, ttlSeconds: 7200 });
    // latest start = 7200 - 1800 - 120 = 5280 s; 2 lanes x 1500 s -> starts at 0,0,1500,1500,3000,3000,4500,4500
    expect(batches[0]).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(batches[1]).toEqual(['s8', 's9', 'evidence']);
    expect(() => planBatches(shards, { hasEvidence: false, ttlSeconds: 1800 })).toThrow(/shorter/);
  });

  it('builds a selectable batch plan with the Playwright global timeout under the ACR timeout', () => {
    const plan = buildPlan(parse(), { runId: 'r1', estimate, batch: null });
    expect(plan.limits).toEqual({ acrTimeoutSeconds: 1800, maxConcurrentRuns: 2, playwrightGlobalTimeoutMs: 1_200_000 });
    expect(plan.evidence).toEqual({ group: 'ev', runId: 'r1-evidence', files: ['tests/unit/a.test.ts', 'tests/unit/b.test.ts'] });
    expect(() => buildPlan(parse(), { runId: 'r1', estimate, batch: 9 })).toThrow(/batch must be/);
  });
});

describe('acceptance5 optional and test-split groups (visual-compare)', () => {
  const OPTIONAL = `${INVENTORY}
[group opt]
project = chromium-automation
optional = true
split = tests
seconds-per-test = 300
reason = optional visual comparison
tests/browser/visual-compare-5.0.spec.ts tests=16
`;
  const estimate = () => 3;

  it('parses optional and split, defaulting to a required one-shard-per-file group', () => {
    const inv = parse(OPTIONAL);
    expect(inv.groups.find((g: { id: string }) => g.id === 'opt')).toMatchObject({ optional: true, split: 'tests', secondsPerTest: 300 });
    expect(inv.groups[0]).toMatchObject({ optional: false, split: 'files' });
    expect(() => parse('[group g]\nproject = chromium-automation\nreason = r\noptional = maybe\ntests/browser/a.spec.ts')).toThrow(/optional must be/);
    expect(() => parse('[group g]\nproject = chromium-automation\nreason = r\nsplit = lines\ntests/browser/a.spec.ts')).toThrow(/split must be/);
  });

  it('leaves optional groups out of the default plan and its batches', () => {
    const plan = buildPlan(parse(OPTIONAL), { runId: 'r1', estimate, batch: null });
    expect(plan.shards.some((s: { group: string }) => s.group === 'opt')).toBe(false);
    expect(plan.batches.flat().some((id: string) => id.startsWith('opt'))).toBe(false);
    expect(plan.groupSelection).toBeNull();
    const without = buildPlan(parse(), { runId: 'r1', estimate, batch: null });
    expect(plan.shards.map((s: { id: string }) => s.id)).toEqual(without.shards.map((s: { id: string }) => s.id));
    expect(plan.batches).toEqual(without.batches);
  });

  it('plans only the named groups; split = tests may use several shards for one file', () => {
    const plan = buildPlan(parse(OPTIONAL), { runId: 'r1', estimate, batch: null, groups: ['opt'] });
    expect(plan.groupSelection).toEqual(['opt']);
    // 16 tests x 300 s = 4800 s over a 900 s budget -> 6 shards of one spec file, none of the other groups.
    expect(plan.shards.map((s: { id: string }) => s.id)).toEqual(Array.from({ length: 6 }, (_, i) => `opt-${i + 1}of6`));
    expect(plan.shards.every((s: { specs: string[]; shard: string }) => s.specs.length === 1 && /^[1-6]\/6$/.test(s.shard))).toBe(true);
    expect(plan.shards[0].runId).toBe('r1-opt-1of6');
    expect(plan.evidence).toBeNull();
    expect(plan.warnings.some((w: string) => w.includes('visual-compare-5.0'))).toBe(false);
    expect(() => selectGroups(parse(OPTIONAL), ['nope'])).toThrow(/unknown group nope/);
    // the same group without split = tests stays capped at one shard per file and warns
    const files = planShards(parse(OPTIONAL.replace('split = tests', 'split = files')), { runId: 'r1', estimate, budgetSeconds: 900 });
    expect(files.shards.filter((s: { group: string }) => s.group === 'opt')).toHaveLength(1);
    expect(files.warnings.some((w: string) => w.includes('visual-compare-5.0'))).toBe(true);
  });

  it('the committed inventory carries visual-compare as an optional, split group whose spec and plan exist', () => {
    const root = new URL('../../../', import.meta.url).pathname;
    const inv = parseInventory(readFileSync(join(root, 'tools/remote-acr/acceptance5-inventory.txt'), 'utf8'),
      { readInclude: (p: string) => readFileSync(join(root, p), 'utf8') });
    const group = inv.groups.find((g: { id: string }) => g.id === 'visual-compare');
    expect(group).toMatchObject({ kind: 'browser', optional: true, split: 'tests', project: 'chromium-automation' });
    expect(group.entries.map((e: { path: string }) => e.path)).toEqual(['tests/browser/visual-compare-5.0.spec.ts']);
    const planViews = JSON.parse(readFileSync(join(root, 'tools/release/visual-compare-5.0/plan.json'), 'utf8')).views.length;
    expect(group.entries[0].tests).toBe(planViews);
    const dflt = buildPlan(inv, { runId: 'r1', estimate, batch: null });
    expect(dflt.shards.some((s: { group: string }) => s.group === 'visual-compare')).toBe(false);
    const only = buildPlan(inv, { runId: 'r1', estimate, batch: null, groups: ['visual-compare'] });
    expect(only.shards.length).toBeGreaterThan(1);
    expect(only.shards.every((s: { estimatedSeconds: number }) => s.estimatedSeconds <= 1800)).toBe(true);
    expect(only.batchCount).toBe(1);
  });
});

describe('acceptance5 gate refusal', () => {
  const head = 'a'.repeat(40);
  const gate = (extra: Record<string, unknown> = {}) => JSON.stringify({
    schema: 'aura3d.native-code-complete/1', status: 'CODE_COMPLETE_GO', freezeCommit: head,
    candidatePlan: { path: 'tests/reports/native-5/x/candidate-plan.json' },
    sourceConsumerReport: { path: 'tests/reports/a.json' }, matrixSourceReport: { path: 'tests/reports/b.json' },
    examplesSourceReport: { path: 'tests/reports/c.json' }, ...extra });
  const check = (args: Partial<Parameters<typeof checkGateBinding>[0]>) =>
    checkGateBinding({ gatePath: 'tests/reports/native-capabilities/code-complete-go.json', gateText: gate(), head, trackedClean: true, ...args });

  it('binds a GO record for the clean HEAD', () => {
    expect(check({})).toMatchObject({ freezeCommit: head, candidatePlan: 'tests/reports/native-5/x/candidate-plan.json', matrixSourceReport: 'tests/reports/b.json' });
  });
  it('refuses missing, unsafe, non-GO, stale, dirty and unbound gates', () => {
    expect(() => check({ gatePath: '' })).toThrow(/required/);
    expect(() => check({ gatePath: '/abs/gate.json' })).toThrow(/repository-relative/);
    expect(() => check({ gateText: null })).toThrow(/missing/);
    expect(() => check({ gateText: '{' })).toThrow(/not JSON/);
    expect(() => check({ gateText: gate({ status: 'NOT_GO' }) })).toThrow(/CODE_COMPLETE_GO/);
    expect(() => check({ head: 'b'.repeat(40) })).toThrow(/stale gate/);
    expect(() => check({ trackedClean: false })).toThrow(/tracked changes/);
    expect(() => check({ gateText: gate({ matrixSourceReport: { path: '../x' } }) })).toThrow(/source consumer reports/);
  });

  it('source5 records bind all three reports (examples included) and hand the job their in-job paths', () => {
    const sha256 = 'a'.repeat(64), retained = 'tests/reports/native-5/r/artifacts';
    const ref = (job: string) => ({ path: `${retained}/consumers/${job}`, jobPath: job, sha256 });
    const source5 = { sourceRunner: 'acr-source5', candidatePlan: { path: `${retained}/candidate-plan.json`, jobPath: 'tests/reports/native-5/r/candidate-plan.json', sha256 },
      sourceConsumerReport: ref('tests/reports/native-consumers/r/source.json'), matrixSourceReport: ref('tests/reports/native-consumers/r/matrix-source.json'),
      examplesSourceReport: ref('tests/reports/native-examples-catalog/r/examples-source.json') };
    expect(check({ gateText: gate(source5) })).toMatchObject({ candidatePlan: 'tests/reports/native-5/r/candidate-plan.json',
      consumerSourceReport: 'tests/reports/native-consumers/r/source.json', matrixSourceReport: 'tests/reports/native-consumers/r/matrix-source.json',
      examplesSourceReport: 'tests/reports/native-examples-catalog/r/examples-source.json' });
    // No null exception any more: every source5 record binds an examples report with an in-job path.
    expect(() => check({ gateText: gate({ ...source5, examplesSourceReport: null }) })).toThrow(/source consumer reports/);
    expect(() => check({ gateText: gate({ ...source5, sourceConsumerReport: null }) })).toThrow(/source consumer reports/);
    expect(() => check({ gateText: gate({ ...source5, matrixSourceReport: { path: `${retained}/consumers/m.json`, sha256 } }) })).toThrow(/source consumer reports/);
    expect(() => check({ gateText: gate({ ...source5, candidatePlan: { path: `${retained}/candidate-plan.json`, sha256 } }) })).toThrow(/candidate plan/);
    expect(() => check({ gateText: gate({ examplesSourceReport: null }) })).toThrow(/source consumer reports/);
  });

  it('accepts HEAD == F or the record-only commit on F (stubbed git facts), and refuses everything else', () => {
    const freeze = 'f'.repeat(40), next = 'e'.repeat(40), text = gate({ freezeCommit: freeze });
    const facts = (extra: Record<string, unknown> = {}) => () => ({ head: next, parents: [freeze], changedPaths: [CODE_COMPLETE_RECORD], recordAtHead: text, ...extra });
    const bind = (inspectHead?: () => unknown) => checkGateBinding({ gatePath: CODE_COMPLETE_RECORD, gateText: text, head: next, trackedClean: true, inspectHead: inspectHead as never });
    expect(checkGateBinding({ gatePath: CODE_COMPLETE_RECORD, gateText: text, head: freeze, trackedClean: true })).toMatchObject({ freezeCommit: freeze, headRelation: 'freeze-commit' });
    expect(bind(facts())).toMatchObject({ freezeCommit: freeze, head: next, headRelation: 'record-commit' });
    expect(() => bind()).toThrow(/stale gate.*history is unavailable/);
    expect(() => bind(facts({ parents: ['d'.repeat(40)] }))).toThrow(/stale gate.*only parent must be the freeze commit/);
    expect(() => bind(facts({ parents: [freeze, 'd'.repeat(40)] }))).toThrow(/only parent/);
    expect(() => bind(facts({ changedPaths: ['src/engine.ts'] }))).toThrow(/must touch only .*code-complete-go\.json \(it touches: src\/engine\.ts\)/);
    expect(() => bind(facts({ changedPaths: [CODE_COMPLETE_RECORD, 'src/engine.ts'] }))).toThrow(/must touch only/);
    expect(() => bind(facts({ recordAtHead: `${text} ` }))).toThrow(/differs from the validated gate/);
    expect(() => bind(facts({ head: 'c'.repeat(40) }))).toThrow(/stale gate/);
    expect(() => bind(() => { throw new Error('git failed'); })).toThrow(/history is unavailable/);
    expect(() => checkGateBinding({ gatePath: CODE_COMPLETE_RECORD, gateText: text, head: next, trackedClean: false, inspectHead: facts() as never })).toThrow(/tracked changes/);
  });

  it('reads the real git history: accept F, accept F + record-only commit, refuse F + other change, refuse F + record + other change', () => {
    const root = mkdtempSync(join(tmpdir(), 'a5-freeze-')), template = mkdtempSync(join(tmpdir(), 'a5-freeze-tpl-'));
    const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TEMPLATE_DIR: template, GIT_TERMINAL_PROMPT: '0' });
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, env, encoding: 'utf8' }).trim();
    const put = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
    try {
      put('.gitignore', 'tests/reports/\n');
      put('src/engine.ts', 'export const engine = 5;\n');
      git('init', '-q');
      git('add', '-A');
      git('commit', '-qm', 'native 5.0: freeze');
      const freeze = git('rev-parse', 'HEAD'), text = gate({ freezeCommit: freeze });
      put(CODE_COMPLETE_RECORD, text);
      const bind = () => {
        const head = git('rev-parse', 'HEAD');
        return checkGateBinding({ gatePath: CODE_COMPLETE_RECORD, gateText: text, head, trackedClean: true, inspectHead: (f: string) => readHeadCommit(root, f) });
      };
      expect(bind()).toMatchObject({ headRelation: 'freeze-commit', freezeCommit: freeze });

      git('add', '-f', CODE_COMPLETE_RECORD);
      git('commit', '-qm', `native 5.0: CODE_COMPLETE_GO for ${freeze}`);
      const recordCommit = git('rev-parse', 'HEAD');
      expect(bind()).toMatchObject({ headRelation: 'record-commit', head: recordCommit, freezeCommit: freeze });

      // F + other change (no record).
      git('checkout', '-q', freeze);
      put('src/engine.ts', 'export const engine = 6;\n');
      git('commit', '-qam', 'product edit');
      expect(() => bind()).toThrow(/stale gate.*must touch only .*\(it touches: src\/engine\.ts\)/);

      // F + record + other change in one commit.
      git('checkout', '-q', freeze);
      put('src/engine.ts', 'export const engine = 7;\n');
      put(CODE_COMPLETE_RECORD, text); // checking out F removed the tracked record
      git('add', '-A'); git('add', '-f', CODE_COMPLETE_RECORD);
      git('commit', '-qm', 'record and product edit');
      expect(() => bind()).toThrow(/must touch only .*\(it touches: src\/engine\.ts, tests\/reports/);

      // Record-only commit, then another commit on top: HEAD's parent is no longer F.
      git('checkout', '-q', recordCommit);
      put('README.md', 'later\n');
      git('add', 'README.md'); git('commit', '-qm', 'later');
      expect(() => bind()).toThrow(/only parent must be the freeze commit/);

      // Record-only commit whose committed record is not the validated gate.
      git('checkout', '-q', freeze);
      put(CODE_COMPLETE_RECORD, `${text}\n`);
      git('add', '-f', CODE_COMPLETE_RECORD); git('commit', '-qm', 'other record');
      expect(() => bind()).toThrow(/differs from the validated gate/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(template, { recursive: true, force: true });
    }
  }, 60_000);

  it('the launcher refuses a stale gate before any Azure command', () => {
    const root = new URL('../../../', import.meta.url).pathname;
    if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
      expect(() => spawnSync('bash', ['tools/remote-acr/run-acceptance5.sh'], { cwd: root })).toThrow(/source phase refuses/);
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'a5-')), sentinel = join(dir, 'az'), touched = join(dir, 'called');
    writeFileSync(sentinel, `#!/bin/sh\ntouch '${touched}'\nexit 0\n`, { mode: 0o755 });
    const gateRel = `tests/reports/native-5/unit-gates/${process.pid}-${Date.now()}.json`;
    mkdirSync(join(root, 'tests/reports/native-5/unit-gates'), { recursive: true });
    writeFileSync(join(root, gateRel), gate({ freezeCommit: '0'.repeat(40) }));
    // The ACR source pass ships no .git: the launcher then refuses before gate binding (nothing to bind to),
    // so only the refusal and the no-Azure guarantee are observable there.
    const gitCheckout = existsSync(join(root, '.git'));
    try {
      for (const [gatePath, message] of [['tests/reports/native-5/unit-gates/absent.json', /gate record missing/], [gateRel, /stale gate/]] as const) {
        const runId = `a5-unit-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
        const child = spawnSync('bash', ['tools/remote-acr/run-acceptance5.sh'], { cwd: root, encoding: 'utf8',
          env: { ...process.env, AZ_WRAPPER: sentinel, RUN_ID: runId, BATCH: '1', AURA3D_CODE_COMPLETE_GATE: gatePath } });
        expect(child.status, child.stderr).toBe(2);
        expect(child.stderr).toMatch(gitCheckout ? message : /not a Git checkout/);
        expect(child.stderr).toMatch(/no Azure work was started/);
        expect(existsSync(join(root, 'tests/reports/native-5', runId))).toBe(false);
      }
      const guarded = spawnSync('bash', ['tools/remote-acr/run-acceptance5.sh'], { cwd: root, encoding: 'utf8',
        env: { ...process.env, AZ_WRAPPER: sentinel, AURA3D_SOURCE_PROCESS_GUARD: '1' } });
      expect(guarded.status).toBe(2);
      expect(existsSync(touched)).toBe(false);
    } finally {
      rmSync(join(root, gateRel), { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('acceptance5 result classification', () => {
  const att = (value: unknown) => ({ name: 'report', contentType: 'application/json', body: Buffer.from(JSON.stringify(value)).toString('base64') });
  const t = (status: string, result: Record<string, unknown> = { status: 'passed' }, annotations: unknown[] = []) =>
    ({ status, projectName: 'chromium-automation', annotations, results: [result] });

  it('classifies passed, failed, flaky, interrupted, unsupported, no-data and skipped', () => {
    expect(classifyPlaywrightTest(t('expected')).status).toBe('passed');
    expect(classifyPlaywrightTest(t('unexpected', { status: 'failed', errors: [{ message: '\u001b[31mboom' }] }))).toEqual({ status: 'failed', reason: 'boom' });
    expect(classifyPlaywrightTest(t('flaky')).status).toBe('failed');
    expect(classifyPlaywrightTest(t('unexpected', { status: 'interrupted' })).status).toBe('no-data');
    expect(classifyPlaywrightTest(t('unexpected', { status: 'failed', errors: [{ message: 'Error: WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter' }] })).status).toBe('no-data');
    expect(classifyPlaywrightTest(t('skipped', { status: 'skipped' }, [{ type: 'skip', description: 'WebGPU unsupported here' }])).status).toBe('unsupported');
    expect(classifyPlaywrightTest(t('skipped', { status: 'skipped' }, [{ type: 'skip', description: 'adapter unavailable' }])).status).toBe('no-data');
    expect(classifyPlaywrightTest(t('skipped', { status: 'skipped' })).status).toBe('skipped');
    expect(classifyPlaywrightTest({ status: 'expected', results: [] }).status).toBe('no-data');
  });

  it('never labels software rendering as physical and never infers physical', () => {
    expect(hardwareLabels(t('expected', { status: 'passed', attachments: [att({ adapter: 'Google SwiftShader' })] }), 'chromium-gpu-headless').hardware).toBe('software');
    expect(hardwareLabels(t('expected', { status: 'passed', attachments: [att({ evidence: { deviceClass: 'physical', adapter: 'SwiftShader' } })] }), 'chromium-gpu-headless').hardware).toBe('software');
    expect(hardwareLabels(t('expected', { status: 'passed', attachments: [att({ deviceClass: 'physical', adapter: 'NVIDIA L4' })] }), 'chromium-gpu-headless').hardware).toBe('physical');
    expect(hardwareLabels(t('expected', { status: 'passed' }, [{ type: 'adapter', description: '{"vendor":"nvidia"}' }]), 'chromium-gpu-headless'))
      .toMatchObject({ hardware: 'unverified', labels: [{ type: 'adapter', value: '{"vendor":"nvidia"}' }] });
    expect(hardwareLabels(t('expected'), 'chromium-software').hardware).toBe('software');
  });

  it('maps lane-config file paths back to repository paths', () => {
    const report = { suites: [{ specs: [{ file: 'browser/x.spec.ts', title: 'x', tests: [t('expected')] }] }] };
    expect(collectPlaywrightTests(report, { configDir: 'tests/qr/prd04' })[0].file).toBe('tests/qr/prd04/browser/x.spec.ts');
  });

  it('reads task-run exits and marked base64 payloads from ACR logs', () => {
    expect(parseTaskRunExits('[task-run] PLAYWRIGHT_EXIT=1\n[task-run] UPLOAD_EXIT=0\n[task-run] PLAYWRIGHT_EXIT=not-run')).toEqual({ playwright: null, upload: 0 });
    const b64 = Buffer.from(JSON.stringify({ ok: 1 })).toString('base64');
    const log = `x\n2026/11/02 10:00:00 ::: ACCEPTANCE5_EVIDENCE_BEGIN\n2026/11/02 10:00:00 ${b64.slice(0, 5)}\n2026/11/02 10:00:01 ${b64.slice(5)}\r\n::: ACCEPTANCE5_EVIDENCE_END\n`;
    expect(extractMarkedPayload(log, 'ACCEPTANCE5_EVIDENCE')).toEqual({ ok: 1 });
    expect(extractMarkedPayload('nothing', 'ACCEPTANCE5_EVIDENCE')).toBeNull();
  });

  it('treats a missing evidence file as no-data, not as a pass', () => {
    const files = summarizeVitest({ testResults: [{ name: '/repo/tests/unit/a.test.ts', assertionResults: [
      { fullName: 'reads', status: 'failed', failureMessages: ["ENOENT: no such file or directory, open 'tests/reports/x.json'"] },
      { fullName: 'asserts', status: 'failed', failureMessages: ['expected 1 to be 2'] },
      { fullName: 'ok', status: 'passed' }, { fullName: 'todo', status: 'pending' }] }] });
    expect(files[0].file).toBe('tests/unit/a.test.ts');
    expect(files[0].tests.map((x: { status: string }) => x.status)).toEqual(['no-data', 'failed', 'passed', 'skipped']);
  });
});

describe('acceptance5 report merge', () => {
  const plan = {
    runId: 'r1', batch: 1, groups: [{ id: 'x', kind: 'excluded', reason: 'not run', entries: ['tests/qr/prd14/browser/'] }],
    shards: [
      { id: 'g-1of2', runId: 'r1-g-1of2', group: 'g', project: 'chromium-gpu-headless', configDir: '', shard: '1/2', specs: ['tests/browser/native-a.spec.ts', 'tests/browser/native-b.spec.ts'] },
      { id: 'g-2of2', runId: 'r1-g-2of2', group: 'g', project: 'chromium-gpu-headless', configDir: '', shard: '2/2', specs: ['tests/browser/native-a.spec.ts', 'tests/browser/native-b.spec.ts'] },
      { id: 'h-1of1', runId: 'r1-h-1of1', group: 'h', project: 'chromium-automation', configDir: '', shard: null, specs: ['tests/browser/native-c.spec.ts'] },
    ],
    evidence: { group: 'ev', runId: 'r1-evidence', files: ['tests/unit/a.test.ts', 'tests/unit/b.test.ts'] },
  };
  const swiftshader = { name: 'r', contentType: 'application/json', body: Buffer.from(JSON.stringify({ adapter: 'SwiftShader' })).toString('base64') };
  const report = { suites: [{ specs: [
    { file: 'tests/browser/native-a.spec.ts', title: 'a1', tests: [{ status: 'expected', projectName: 'chromium-gpu-headless', results: [{ status: 'passed', attachments: [swiftshader] }] }] },
    { file: 'tests/browser/native-a.spec.ts', title: 'a2', tests: [{ status: 'unexpected', projectName: 'chromium-gpu-headless', results: [{ status: 'failed', errors: [{ message: 'no pixels' }] }] }] },
  ] }] };

  it('counts per spec, marks uncovered specs no-data with the missing shard, and keeps evidence and exclusions', () => {
    const merged = mergeAcceptance([{
      plan, binding: { freezeCommit: 'c' },
      shards: { 'g-1of2': { rc: 1, exits: { playwright: 1, upload: 0 }, report }, 'g-2of2': { rc: 1, exits: {}, report: null }, 'h-1of1': { notStarted: 'SAS window' } },
      evidence: { files: [{ file: 'tests/unit/a.test.ts', tests: [{ title: 't', status: 'passed', reason: null }] }], fetch: { conflicts: [] } },
    }], { generatedAt: 'now' });
    const a = merged.specs.find((s: { spec: string }) => s.spec === 'tests/browser/native-a.spec.ts')!;
    expect(a).toMatchObject({ status: 'failed', passed: 1, failed: 1, hardware: { software: 1, physical: 0, unverified: 1 } });
    const b = merged.specs.find((s: { spec: string }) => s.spec === 'tests/browser/native-b.spec.ts')!;
    expect(b).toMatchObject({ status: 'no-data', 'no-data': 1 });
    expect(b.tests[0].reason).toMatch(/g-2of2/);
    expect(merged.specs.find((s: { spec: string }) => s.spec === 'tests/browser/native-c.spec.ts')!.status).toBe('no-data');
    expect(merged.evidence.map((e: { file: string; status: string }) => [e.file, e.status])).toEqual([['tests/unit/a.test.ts', 'passed'], ['tests/unit/b.test.ts', 'no-data']]);
    expect(merged.status).toBe('failed');
    expect(merged.totals).toEqual({ passed: 2, failed: 1, skipped: 0, unsupported: 0, 'no-data': 3 });
    expect(merged.excluded).toEqual([{ group: 'x', reason: 'not run', entries: ['tests/qr/prd14/browser/'] }]);
    expect(merged.problems.join('\n')).toMatch(/h-1of1 not started/);
  });

  it('is passed only when every planned cell passed', () => {
    const one = { ...plan, shards: [plan.shards[2]], evidence: null };
    const ok = { suites: [{ specs: [{ file: 'tests/browser/native-c.spec.ts', title: 'c', tests: [{ status: 'expected', projectName: 'chromium-automation', results: [{ status: 'passed' }] }] }] }] };
    expect(mergeAcceptance([{ plan: one, binding: null, shards: { 'h-1of1': { rc: 0, exits: {}, report: ok } }, evidence: null }]).status).toBe('passed');
  });
});

describe('acceptance5 in-image evidence fetch', () => {
  it('lists the shard report prefix, writes new files and keeps candidate files', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'a5-fetch-'));
    writeFileSync(join(dest, 'kept.json'), 'candidate');
    const seen: string[] = [];
    const request = async (url: URL) => {
      seen.push(url.pathname + url.search.replace(/sig=[^&]+/, 'sig=x'));
      if (url.searchParams.get('comp') === 'list') {
        return new Response(`<EnumerationResults><Blobs><Blob><Name>r1-g-1of1/aura3d-browser-artifacts/reports/a/b.json</Name></Blob><Blob><Name>r1-g-1of1/aura3d-browser-artifacts/reports/kept.json</Name></Blob></Blobs><NextMarker/></EnumerationResults>`);
      }
      return new Response('{"x":1}');
    };
    try {
      const result = await fetchReports({ sasUrl: 'https://acct123.blob.core.windows.net/c?sv=1&sig=abc', prefixes: ['r1-g-1of1'], destRoot: dest, request: request as typeof fetch });
      expect(result).toEqual({ fetched: 1, bytes: 7, conflicts: ['kept.json'] });
      expect(readFileSync(join(dest, 'a/b.json'), 'utf8')).toBe('{"x":1}');
      expect(readFileSync(join(dest, 'kept.json'), 'utf8')).toBe('candidate');
      expect(seen[0]).toContain('prefix=r1-g-1of1%2Faura3d-browser-artifacts%2Freports%2F');
      await expect(fetchReports({ sasUrl: 'https://acct123.blob.core.windows.net/c', prefixes: [], destRoot: dest })).rejects.toThrow(/SAS/);
      await expect(fetchReports({ sasUrl: 'https://acct123.blob.core.windows.net/c?sig=1', prefixes: ['../x'], destRoot: dest, request: request as typeof fetch })).rejects.toThrow(/prefix/);
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });
});

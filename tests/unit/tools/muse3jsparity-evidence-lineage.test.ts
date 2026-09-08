import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { artifact, SOURCE_AUDIT_BASELINE, isSourceInput, MAX_COMPARISON_AGE_MS, resolveQuarantine, sourceIdentity, validateReceipt, writeImmutableJson } from '../../../tools/muse3jsparity-readiness/evidence-lineage';
import type { Artifact, ProducerReceipt, QuarantineEvent, SourceIdentity } from '../../../tools/muse3jsparity-readiness/evidence-lineage';
let root: string;
const now = Date.parse('2026-09-05T12:00:00Z');
const source: SourceIdentity = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), fingerprint: 'c'.repeat(64), lockfileSha256: 'd'.repeat(64) };
let receipt: ProducerReceipt;
let ref: Artifact;
function save(): Artifact { writeFileSync(join(root, 'receipt.json'), JSON.stringify(receipt)); return artifact(root, 'receipt.json'); }
function check(reference = ref) { return validateReceipt(root, reference, { gate: 'k1', source, now, maxAgeMs: MAX_COMPARISON_AGE_MS, tasks: ['K1.task.1'] }); }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'muse301-lineage-')); writeFileSync(join(root, 'pixels.png'), 'real fixture bytes');
  receipt = { schema: 'muse3jsparity-producer/v1', runId: 'test-run', gate: 'k1', tasks: ['K1.task.1'], command: ['pnpm', 'exec', 'playwright', 'test'], cwd: root, exitCode: 0,
    startedAt: new Date(now - 60_000).toISOString(), endedAt: new Date(now - 30_000).toISOString(), source, claimSurface: 'root safe API', environment: { browser: 'chromium', backend: 'webgl2', hardware: 'test fixture' }, artifacts: [artifact(root, 'pixels.png')], packages: [], tarballs: [] };
  ref = save();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('immutable producer lineage', () => {
  it('accepts current matching source and exact artifact bytes', () => expect(check().valid).toBe(true));
  it('rejects tampered receipt even if valid JSON remains', () => { writeFileSync(join(root, 'receipt.json'), `${readFileSync(join(root, 'receipt.json'), 'utf8')} `); expect(check().errors).toContain('receipt hash mismatch'); });
  it('rejects changed or missing pixel artifacts', () => { writeFileSync(join(root, 'pixels.png'), 'different'); expect(check().valid).toBe(false); rmSync(join(root, 'pixels.png')); expect(check().valid).toBe(false); });
  it.each(['commit', 'tree', 'fingerprint', 'lockfileSha256'] as const)('rejects changed %s', field => { receipt.source = { ...source, [field]: 'wrong' }; ref = save(); expect(check().errors).toContain('source mismatch'); });
  it('checks actual time rather than mtime or same-run status', () => { receipt.startedAt = new Date(now - MAX_COMPARISON_AGE_MS - 1).toISOString(); ref = save(); expect(check().errors).toContain('stale receipt'); });
  it.each(['future', 'inverted', 'malformed'])('rejects %s timestamps', kind => {
    if (kind === 'future') receipt.endedAt = new Date(now + 1).toISOString();
    if (kind === 'inverted') receipt.startedAt = receipt.endedAt.replace('11:59:30', '12:00:00');
    if (kind === 'malformed') receipt.startedAt = 'never';
    ref = save(); expect(check().valid).toBe(false);
  });
  it('requires a real successful command and matching task IDs', () => { receipt.exitCode = 1; ref = save(); expect(check().valid).toBe(false); receipt.exitCode = 0; receipt.tasks = []; ref = save(); expect(check().valid).toBe(false); });
  it('rejects malformed and missing reports', () => { writeFileSync(join(root, 'receipt.json'), '{}'); ref = artifact(root, 'receipt.json'); expect(check().valid).toBe(false); rmSync(join(root, 'receipt.json')); expect(check().valid).toBe(false); });
  it('validates package and tarball hashes as well as pixels', () => { writeFileSync(join(root, 'a.tgz'), 'package bytes'); receipt.tarballs = [artifact(root, 'a.tgz')]; ref = save(); expect(check().valid).toBe(true); writeFileSync(join(root, 'a.tgz'), 'changed package'); expect(check().valid).toBe(false); });
  it('prevents overwriting immutable run receipts', () => { const file = join(root, 'immutable.json'); writeImmutableJson(file, receipt); expect(() => writeImmutableJson(file, receipt)).toThrow(); });
  it('resolves historical quarantine only after source-valid successful rerun while preserving failure record', () => {
    const failure: QuarantineEvent = { gate: 'k1', failedAt: new Date(now - 120_000).toISOString(), source: { ...source, commit: 'old' }, failureReceipt: { path: 'failed.json', sha256: 'e'.repeat(64) } };
    const history = resolveQuarantine([failure], 'k1', ref, source, root, now);
    expect(history[0].failureReceipt).toEqual(failure.failureReceipt); expect(history[0].failedAt).toBe(failure.failedAt); expect(history[0].resolution?.receipt).toEqual(ref); expect(failure.resolution).toBeUndefined();
    receipt.source = { ...source, fingerprint: 'wrong' }; ref = save(); expect(resolveQuarantine([failure], 'k1', ref, source, root, now)[0].resolution).toBeUndefined();
  });
  it('cannot resolve a newer failure using an older success', () => { const failure: QuarantineEvent = { gate: 'k1', failedAt: new Date(now).toISOString(), source, failureReceipt: null }; expect(resolveQuarantine([failure], 'k1', ref, source, root, now)[0].resolution).toBeUndefined(); });
  it('binds each task to an allowed uniquely passed assertion in hashed producer output', () => {
    writeFileSync(join(root, 'assertions.json'), JSON.stringify({ testResults: [{ name: '/repo/tests/unit/rendering/proof.test.ts', assertionResults: [{ fullName: 'renders actual output', status: 'passed' }] }] }));
    receipt.artifacts.push(artifact(root, 'assertions.json'));
    const expected = { source, gate: 'k1', now, taskTests: { 'K1.task.1': ['tests/unit/rendering/proof.test.ts'] } };
    ref = save(); expect(validateReceipt(root, ref, expected).valid).toBe(false);
    receipt.proofs = [{ task: 'K1.task.1', report: 'assertions.json', testFile: 'tests/unit/rendering/proof.test.ts', testTitle: 'renders actual output' }];
    ref = save(); expect(validateReceipt(root, ref, expected).valid).toBe(true);
    expect(validateReceipt(root,ref,{...expected,taskAssertions:{'K1.task.1':[{file:'tests/unit/rendering/proof.test.ts',title:'different required assertion'}]}}).errors).toContain('wrong required assertion: K1.task.1');
    receipt.proofs[0].testTitle = 'invented passing assertion'; ref = save(); expect(validateReceipt(root, ref, expected).valid).toBe(false);
  });
  it('rejects source-only claims, failed or skipped assertions and unapproved tests', () => {
    writeFileSync(join(root, 'assertions.json'), JSON.stringify({ suites: [{ specs: [{ file: 'proof.spec.ts', title: 'native pixels', tests: [{ status: 'skipped', results: [{ status: 'skipped' }] }] }] }] }));
    receipt.artifacts.push(artifact(root, 'assertions.json'));
    receipt.proofs = [{ task: 'K1.task.1', report: 'assertions.json', testFile: 'tests/browser/proof.spec.ts', testTitle: 'native pixels' }];
    ref = save(); expect(validateReceipt(root, ref, { source, gate: 'k1', now, taskTests: { 'K1.task.1': ['tests/browser/proof.spec.ts'] } }).valid).toBe(false);
    expect(validateReceipt(root, ref, { source, gate: 'k1', now, taskTests: { 'K1.task.1': ['tests/browser/different.spec.ts'] } }).valid).toBe(false);
  });
  it('does not accept a passed particle assertion without its hashed quantitative artifact', () => {
    receipt.gate = 'p01';
    ref = save();
    const expected = { source, gate: 'p01', now };
    expect(validateReceipt(root, ref, expected).errors).toContain('missing hashed acceptance artifact');
    receipt.acceptance = 'particles.json';
    writeFileSync(join(root, 'particles.json'), JSON.stringify({ schema: 'muse301-particles/v1', samples: [] }));
    ref = save();
    expect(validateReceipt(root, ref, expected).errors).toContain('missing hashed acceptance artifact');
    receipt.artifacts.push(artifact(root, 'particles.json')); ref = save();
    expect(validateReceipt(root, ref, expected).errors).toContain('missing particle samples');
  });
  it('permits only explicitly authorized non-test release obligations through typed acceptance', () => {
    const task = '3.0.1:L01.check.3';
    receipt.gate = 'l01'; receipt.tasks = [task];
    const packages = Array.from({length:29},(_,i) => {
      const manifest = `package-${i}.json`, tarball = `package-${i}.tgz`;
      writeFileSync(join(root, manifest), JSON.stringify({name:`@aura3d/package-${i}`,version:'3.0.1'}));
      writeFileSync(join(root, tarball), `synthetic unit archive ${i}`);
      receipt.packages.push(artifact(root,manifest)); receipt.tarballs.push(artifact(root,tarball));
      return {name:`@aura3d/package-${i}`,manifest,tarball,sha256:artifact(root,tarball).sha256};
    });
    const acceptance = {schema:'muse301-packages/v1',version:'3.0.1',packages,
      scaffolds:Array.from({length:19},(_,i)=>({name:`template-${i}`,sourcePassed:true,installedPassed:true,tarballHashes:[packages[i].sha256]})),lifecycleAssertions:149,
      checks:Object.fromEntries(['compatibility','optionalPeers','imports','exports','smoke','provenance','bundleBudgets','leanIsolation'].map(k=>[k,true]))};
    // Synthetic unit producer only: exercise canonical replay transport and binding.
    mkdirSync(join(root,'tools/release'),{recursive:true});
    writeFileSync(join(root,'validation.json'),JSON.stringify({}));
    writeFileSync(join(root,'tools/release/package-acceptance.mjs'),`export function producePackageAcceptance(){return ${JSON.stringify({acceptance,source,artifacts:[]})};}`);
    const validationInput=artifact(root,'validation.json');receipt.artifacts.push(validationInput);
    writeFileSync(join(root,'acceptance.json'),JSON.stringify({...acceptance,validationInput}));
    receipt.acceptance='acceptance.json';receipt.artifacts.push(artifact(root,'acceptance.json'));
    receipt.acceptanceProofs=[{task,artifact:'acceptance.json',schema:'muse301-packages/v1'}];ref=save();
    const expected={gate:'l01',source,now,tasks:[task],taskTests:{[task]:[]},taskAcceptance:{[task]:{gate:'l01' as const,schema:'muse301-packages/v1'}}};
    expect(validateReceipt(root,ref,expected).errors).toEqual([]);
    writeFileSync(join(root,'tools/release/package-acceptance.mjs'),`export function producePackageAcceptance(){return ${JSON.stringify({acceptance:{...acceptance,lifecycleAssertions:150},source,artifacts:[]})};}`);
    expect(validateReceipt(root,ref,expected).errors).toContain('package acceptance differs from canonical validation');
    writeFileSync(join(root,'tools/release/package-acceptance.mjs'),`export function producePackageAcceptance(){return ${JSON.stringify({acceptance,source,artifacts:[]})};}`);
    expect(validateReceipt(root,ref,{...expected,taskAcceptance:undefined}).valid).toBe(false);
    expect(validateReceipt(root,ref,{...expected,taskTests:{[task]:['tests/unit/required.test.ts']}}).errors).toContain(`missing assertion linkage: ${task}`);
    receipt.acceptanceProofs.push({...receipt.acceptanceProofs[0]});ref=save();
    expect(validateReceipt(root,ref,expected).errors).toContain(`unmapped acceptance linkage: ${task}`);
  });
  it('requires exact source-bound command output for explicit docs obligations',()=>{
    const task='L3.task.4', commands=[['pnpm','check:agent-docs'],['pnpm','check:docs-site']];
    receipt.tasks=[task]; const refs=commands.map((command,i)=>{
      const log=`command-${i}.log`,path=`command-${i}.receipt.json`;writeFileSync(join(root,log),'synthetic unit process output');
      const child={...receipt,gate:`command-${i}`,command,tasks:[],artifacts:[artifact(root,log)]};
      writeFileSync(join(root,path),JSON.stringify(child));return artifact(root,path);
    });
    receipt.commandProofs=[{task,receipts:refs}];receipt.artifacts.push(...refs);ref=save();
    const expected={gate:'k1',source,now,taskTests:{[task]:[]},taskCommands:{[task]:{commands}}};
    expect(validateReceipt(root,ref,expected).errors).toEqual([]);
    expect(validateReceipt(root,ref,{...expected,taskCommands:undefined}).valid).toBe(false);
    receipt.commandProofs[0].receipts=[refs[0],refs[0]];ref=save();
    expect(validateReceipt(root,ref,expected).errors).toContain(`unexpected or duplicate required command: ${task}`);
    receipt.commandProofs[0].receipts=refs;writeFileSync(join(root,'command-0.log'),'tampered');ref=save();
    expect(validateReceipt(root,ref,expected).valid).toBe(false);
  });
  it('does not substitute blocked source audit for completed boundaries or rendered framing',()=>{
    const task='3.0.1:Q02.check.2';receipt.gate='q02';receipt.tasks=[task];
    writeFileSync(join(root,'audit.json'),JSON.stringify({schema:'muse3jsparity-docs-audit/v1',status:'blocked',source:{commit:source.commit,files:[]},findings:[],unresolved:[{id:'open'}],checks:[]}));
    receipt.artifacts.push(artifact(root,'audit.json'));receipt.sourceAuditProofs=[{task,artifact:'audit.json'}];ref=save();
    const expected={gate:'q02',source,now,taskTests:{[task]:[]},taskSourceAudits:{[task]:{schema:'muse3jsparity-docs-audit/v1' as const}}};
    expect(validateReceipt(root,ref,expected).errors).toContain(`incomplete source audit: ${task}`);
    expect(validateReceipt(root,ref,{...expected,taskSourceAudits:undefined}).errors).toContain(`unmapped source audit linkage: ${task}`);
  });
  it.each(['missing baseline','HEAD baseline','empty inventory'])('rejects source audit %s even with a declared pass',kind=>{
    const task='3.0.1:Q02.check.2';receipt.gate='q02';receipt.tasks=[task];
    const report={schema:'muse3jsparity-docs-audit/v1',status:'source-audit-passed',source:{baselineCommit:kind==='missing baseline'?undefined:kind==='HEAD baseline'?source.commit:SOURCE_AUDIT_BASELINE,commit:source.commit,files:[]},findings:[],unresolved:[],checks:['candidate-version','public-mirror','agent-doc-budget','candidate-label','notes-exist'].map(id=>({id,pass:true}))};
    writeFileSync(join(root,'audit.json'),JSON.stringify(report));receipt.artifacts.push(artifact(root,'audit.json'));receipt.sourceAuditProofs=[{task,artifact:'audit.json'}];ref=save();
    expect(validateReceipt(root,ref,{gate:'q02',source,now,taskTests:{[task]:[]},taskSourceAudits:{[task]:{schema:'muse3jsparity-docs-audit/v1'}}}).errors).toContain(`incomplete source audit: ${task}`);
  });
  it('fingerprints frozen opponent inputs and relevant untracked source but excludes explicit runtime outputs', () => {
    for (const file of ['benchmark/context/frozen-opponent.json', 'benchmark/context/reference/scene.ts', 'packages/new/src/new.ts', 'tests/browser/new-proof.spec.ts']) expect(isSourceInput(file)).toBe(true);
    for (const file of ['.goal/state.json', '.orchestrate/run.json', 'tests/reports/new.json', 'muse3jsparity-3.0.1-PRD.md', 'docs/project/release-artifacts.json', 'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json', 'benchmark/context/muse3jsparity-r185-matrix.json']) expect(isSourceInput(file)).toBe(false);
  });
  it('keeps administrative checklist edits outside runtime identity while code and lockfile edits invalidate it', () => {
    const repo = mkdtempSync(join(tmpdir(), 'muse301-source-identity-'));
    try {
      mkdirSync(join(repo, 'src'));
      writeFileSync(join(repo, 'muse3jsparity-3.0.1-PRD.md'), '- [ ] requirement\n');
      writeFileSync(join(repo, 'src/index.ts'), 'export const value = 1;\n');
      mkdirSync(join(repo, 'docs/project'), { recursive: true });
      writeFileSync(join(repo, 'docs/project/release-artifacts.json'), '{"version":"2.0.0"}\n');
      mkdirSync(join(repo, 'docs/project/reviews'), { recursive: true });
      writeFileSync(join(repo, 'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json'), '{"dispositions":[]}\n');
      writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      const git = (...args: string[]) => execFileSync('git', args, {cwd: repo, stdio: 'pipe'});
      git('init'); git('config', 'user.email', 'source-identity@example.invalid'); git('config', 'user.name', 'Source Identity Test');
      git('add', '.'); git('commit', '-m', 'fixture');
      const initial = sourceIdentity(repo);
      writeFileSync(join(repo, 'muse3jsparity-3.0.1-PRD.md'), '- [x] requirement\n');
      writeFileSync(join(repo, 'docs/project/release-artifacts.json'), '{"version":"3.0.1"}\n');
      writeFileSync(join(repo, 'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json'), '{"dispositions":[{"reviewed":true}]}\n');
      expect(sourceIdentity(repo)).toEqual(initial);
      writeFileSync(join(repo, 'src/index.ts'), 'export const value = 2;\n');
      const codeChanged = sourceIdentity(repo);
      expect(codeChanged.fingerprint).not.toBe(initial.fingerprint);
      writeFileSync(join(repo, 'src/index.ts'), 'export const value = 1;\n');
      mkdirSync(join(repo, 'docs/project'), { recursive: true });
      writeFileSync(join(repo, 'docs/project/release-artifacts.json'), '{"version":"2.0.0"}\n');
      writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\nchanged: true\n');
      const lockChanged = sourceIdentity(repo);
      expect(lockChanged.fingerprint).not.toBe(initial.fingerprint);
      expect(lockChanged.lockfileSha256).not.toBe(initial.lockfileSha256);
    } finally { rmSync(repo, {recursive: true, force: true}); }
  });

});

describe('specialized gate evidence is mandatory',()=>{
 it('rejects a generic successful R03 receipt without retained native pixel acceptance',()=>{
  receipt.gate='r03'; const checked=validateReceipt(root,save(),{gate:'r03',source,now});
  expect(checked.errors).toContain('missing native temporal acceptance artifact');
 });
 it('rejects absent or unauthorized final claims linkage',()=>{
  receipt.gate='q02'; receipt.tasks=['3.0.1:Q02.check.3'];
  expect(validateReceipt(root,save(),{gate:'q02',source,now,taskFinalClaims:{'3.0.1:Q02.check.3':{schema:'muse301-final-claims-validation/v1'}}}).errors).toContain('missing final claims linkage: 3.0.1:Q02.check.3');
  receipt.finalClaimsProofs=[{task:'3.0.1:Q02.check.3',artifact:'pixels.png'}];
  expect(validateReceipt(root,save(),{gate:'q02',source,now}).errors).toContain('unmapped final claims linkage: 3.0.1:Q02.check.3');
 });
 it('replays final release claims and rejects a non-report artifact instead of accepting generic release success',()=>{
  const task='3.0.1:FINAL.check.27';
  receipt.gate='l02';receipt.tasks=[task];
  receipt.finalClaimsProofs=[{task,artifact:'pixels.png'}];
  const checked=validateReceipt(root,save(),{gate:'l02',source,now,taskFinalClaims:{[task]:{schema:'muse301-final-claims-validation/v1'}}});
  expect(checked.errors).not.toContain(`unmapped final claims linkage: ${task}`);
  expect(checked.errors).toContain(`invalid final claims proof: ${task}`);
 });
});

it('requires V02 task4 raw governor acceptance independently of other V02 successes',()=>{
 receipt.gate='v02';receipt.tasks=['3.0.1:V02.task.4'];
 expect(validateReceipt(root,save(),{gate:'v02',source,now}).errors).toContain('missing or unmapped root governor acceptance');
 receipt.tasks=['3.0.1:V02.task.1'];receipt.governorAcceptance='pixels.png';
 expect(validateReceipt(root,save(),{gate:'v02',source,now}).errors).toContain('missing or unmapped root governor acceptance');
});

it('requires mapped Q02 route proof and rejects malformed or wrong-kind evidence',()=>{
 const task='3.0.1:Q02.task.1';receipt.gate='q02';receipt.tasks=[task];
 const expected={gate:'q02',source,now,taskRoutes:{[task]:{schema:'aura3d-301-route-acceptance/v1' as const,kind:'routes' as const}}};
 expect(validateReceipt(root,save(),expected).errors).toContain(`missing route proof: ${task}`);
 receipt.routeProofs=[{task,kind:'assets',artifact:receipt.artifacts[0]!}];
 expect(validateReceipt(root,save(),expected).errors).toContain(`unmapped route proof: ${task}`);
 receipt.routeProofs=[{task,kind:'routes',artifact:receipt.artifacts[0]!}];
 expect(validateReceipt(root,save(),expected).errors).toContain(`invalid route proof: ${task}`);
});

it('requires independently bound marketing replay rather than generic release success',()=>{
 const task='L6.task.3';receipt.gate='l02';receipt.tasks=[task];
 const expected={gate:'l02',source,now,taskMarketing:{[task]:{schema:'muse301-marketing-validation/v1' as const}}};
 expect(validateReceipt(root,save(),expected).errors).toContain(`missing marketing proof: ${task}`);
 receipt.marketingProofs=[{task,artifact:receipt.artifacts[0]!}];
 expect(validateReceipt(root,save(),expected).errors.join()).toContain(`marketing proof ${task}:`);
 receipt.gate='q02';
 expect(validateReceipt(root,save(),{...expected,gate:'q02'}).errors).toContain(`unmapped marketing proof: ${task}`);
});
it('rejects a marketing success report with an unbound validation input',()=>{
 const task='L6.check.3';receipt.gate='l02';receipt.tasks=[task];
 writeFileSync(join(root,'marketing.json'),JSON.stringify({schema:'muse301-marketing-validation/v1',status:'verified',errors:[],source,validationInput:{path:'not-bound.json',sha256:'a'.repeat(64)},artifacts:[]}));
 const proof=artifact(root,'marketing.json');receipt.artifacts.push(proof);receipt.marketingProofs=[{task,artifact:proof}];
 expect(validateReceipt(root,save(),{gate:'l02',source,now,taskMarketing:{[task]:{schema:'muse301-marketing-validation/v1'}}}).errors.join()).toContain('Unbound marketing validation input');
});
it('rejects registry consumer claims without exact retained registry input',()=>{
 const task='L5.task.3';receipt.gate='l02';receipt.tasks=[task];
 const expected={gate:'l02',source,now,taskRegistryConsumers:{[task]:{schema:'muse301-registry-consumer/v1' as const}}};
 expect(validateReceipt(root,save(),expected).errors).toContain(`missing registry consumer: ${task}`);
 receipt.registryConsumerProofs=[{task,artifact:receipt.artifacts[0]!}];
 expect(validateReceipt(root,save(),expected).errors.join()).toContain(`registry consumer ${task}:`);
});
it('does not replace clean-install35 and tree-shaking9 counts with generic package success',()=>{
 receipt.gate='l01';receipt.tasks=['L1.check.4'];
 expect(validateReceipt(root,save(),{gate:'l01',source,now}).errors.join()).toContain('L1.check.4 tests/reports/package-clean-install.json');
});
it('requires final-commit report regeneration evidence independently of generic release acceptance',()=>{
 const task='L2.task.3';receipt.gate='l02';receipt.tasks=[task];
 const expected={gate:'l02',source,now,taskReportRegeneration:{[task]:{schema:'muse301-report-regeneration/v1' as const}}};
 expect(validateReceipt(root,save(),expected).errors).toContain(`missing report regeneration: ${task}`);
 receipt.reportRegenerationProofs=[{task,artifact:receipt.artifacts[0]!}];
 expect(validateReceipt(root,save(),expected).errors.join()).toContain(`report regeneration ${task}:`);
});

it('does not resolve quarantine when a newly required route contract is missing',()=>{
 const task='3.0.1:Q02.task.1';receipt.gate='q02';receipt.tasks=[task];
 const failure:QuarantineEvent={gate:'q02',failedAt:new Date(now-120000).toISOString(),source,failureReceipt:null};
 const history=resolveQuarantine([failure],'q02',save(),source,root,now,undefined,undefined,undefined,undefined,undefined,{tasks:[task],taskRoutes:{[task]:{schema:'aura3d-301-route-acceptance/v1',kind:'routes'}}});
 expect(history[0]!.resolution).toBeUndefined();
});


describe('temporal receipt proof ownership', () => {
  function assertedTask(task: string, gate: string) {
    const testFile = 'tests/browser/temporal-fixture.spec.ts';
    const testTitle = 'renders actual temporal pixels';
    writeFileSync(join(root, 'temporal-assertions.json'), JSON.stringify({testResults: [{name: testFile, assertionResults: [{fullName: testTitle, status: 'passed'}]}]}));
    receipt.gate = gate;
    receipt.tasks = [task];
    receipt.artifacts.push(artifact(root, 'temporal-assertions.json'));
    receipt.proofs = [{task, report: 'temporal-assertions.json', testFile, testTitle}];
    return () => validateReceipt(root, save(), {source, gate, now, tasks: [task], taskTests: {[task]: [testFile]}});
  }

  it.each([
    ['3.0.1:R02.task.4', 'a', 'root temporal task requires r02 proof owner'],
    ['3.0.1:R02.check.3', 'a3', 'root temporal task requires r02 proof owner'],
    ['3.0.1:R03.task.2', 'j2', 'native temporal task requires r03 proof owner'],
    ['3.0.1:R03.check.2', 'a', 'native temporal task requires r03 proof owner'],
  ])('rejects %s under %s despite a retained passing assertion', (task, gate, error) => {
    const result = assertedTask(task, gate)();
    expect(result.errors).toEqual([error]);
    expect(result.valid).toBe(false);
  });

  it.each([
    ['A3.task.1', 'a3'], ['J2.task.2', 'j2'],
  ])('preserves the historical %s proof owner %s', (task, gate) => {
    expect(assertedTask(task, gate)().valid).toBe(true);
  });

  it.each([
    ['3.0.1:R02.check.3', 'r02', 'missing root temporal acceptance artifact'],
    ['3.0.1:R03.check.2', 'r03', 'missing native temporal acceptance artifact'],
  ])('requires canonical acceptance for %s even with a passing assertion', (task, gate, error) => {
    expect(assertedTask(task, gate)().errors).toContain(error);
  });

  it.each([
    ['3.0.1:R02.check.3', 'r02'], ['3.0.1:R03.check.2', 'r03'],
  ])('rejects generic success metadata as canonical pixel acceptance for %s', (task, gate) => {
    const checkTemporal = assertedTask(task, gate);
    writeFileSync(join(root, 'temporal-acceptance.json'), JSON.stringify({status: 'passed', source, backend: gate === 'r03' ? 'webgpu' : 'webgl2', qualityPassed: true}));
    receipt.acceptance = 'temporal-acceptance.json';
    receipt.artifacts.push(artifact(root, receipt.acceptance));
    const result = checkTemporal();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).not.toContain('missing assertion linkage: ' + task);
    expect(result.errors).not.toContain('missing root temporal acceptance artifact');
    expect(result.errors).not.toContain('missing native temporal acceptance artifact');
  });
});

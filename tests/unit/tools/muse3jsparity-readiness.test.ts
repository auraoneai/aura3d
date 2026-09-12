import { readFileSync } from 'node:fs';
import { validateAssertionInventory } from '../../../tools/muse3jsparity-readiness/contracts';
import { loadMuse301ExecutionRequirements } from '../../../tools/muse3jsparity-readiness/requirements';
import { describe, expect, it, vi } from 'vitest';
import { executeStages, reduceReadiness, removedAssertions, REQUIRED_PARTS, validateCaptureOrder, deriveReleaseVerification, ARCHIVE_REQUIREMENT } from '../../../tools/muse3jsparity-readiness/contracts';
import type { GateResult, Requirement } from '../../../tools/muse3jsparity-readiness/contracts';
const requirement = (part: string): Requirement => ({ id: `${part}1`, part, gates: [`${part}-proof`] });
const result = (part: string): GateResult => ({ gate: `${part}-proof`, parts: [part], tasks: [`${part}1`], verdict: 'pass', detail: '', receipt: `${part}.json`, receiptHash: 'a'.repeat(64), receiptValid: true });
const requirements = REQUIRED_PARTS.map(requirement);
const results = REQUIRED_PARTS.map(result);
describe('muse3jsparity fail-closed aggregation', () => {
  it('requires every original part including explicit L release obligations', () => {
    expect(reduceReadiness(requirements, results, { scope: 'full' }).overall).toBe('supersede');
    const missing = results.filter(r => !['E', 'H', 'I', 'U'].includes(r.parts[0]));
    const aggregate = reduceReadiness(requirements, missing, { scope: 'full' });
    expect(aggregate.overall).toBe('blocked');
    for (const p of ['E', 'H', 'I', 'U']) expect(aggregate.parts[p]).toBe('blocked');
    expect(reduceReadiness(requirements.filter(r => r.part !== 'L'), results.filter(r => r.parts[0] !== 'L'), { scope: 'full' }).overall).toBe('blocked');
  });
  it('does not turn broad declared part coverage into task coverage', () => {
    expect(reduceReadiness(requirements, [{ ...result('K'), parts: REQUIRED_PARTS }], { scope: 'full' }).overall).toBe('blocked');
  });
  it.each(['missing', 'hash', 'unverified', 'unknown-task', 'duplicate-task', 'missing-task', 'quarantined'])( '%s proof cannot release', kind => {
    const altered = { ...results[0], tasks: [...results[0].tasks] };
    if (kind === 'missing') altered.receipt = null;
    if (kind === 'hash') altered.receiptHash = 'bad';
    if (kind === 'unverified') altered.receiptValid = false;
    if (kind === 'unknown-task') altered.tasks.push('unknown');
    if (kind === 'duplicate-task') altered.tasks.push('A1');
    if (kind === 'missing-task') altered.tasks = [];
    if (kind === 'quarantined') altered.verdict = 'quarantined';
    expect(reduceReadiness(requirements, [altered, ...results.slice(1)], { scope: 'full' }).overall).toBe('blocked');
  });
  it('rejects duplicate requirement IDs and duplicate or unknown gate results', () => {
    expect(reduceReadiness([...requirements, requirements[0]], results, { scope: 'full' }).overall).toBe('blocked');
    expect(reduceReadiness(requirements, [...results, results[0]], { scope: 'full' }).overall).toBe('blocked');
    expect(reduceReadiness(requirements, [...results, { ...result('A'), gate: 'unknown' }], { scope: 'full' }).overall).toBe('blocked');
  });
  it('requires each gate within a task, not just one passing receipt', () => {
    expect(reduceReadiness([{ ...requirement('A'), gates: ['A-proof', 'A-pixels'] }], [result('A')], { scope: 'full', requiredParts: ['A'] }).overall).toBe('blocked');
  });
  it('quarantine blocks otherwise valid release', () => {
    expect(reduceReadiness(requirements, results, { scope: 'full', unresolvedQuarantine: ['A-proof'] }).overall).toBe('blocked');
  });
  it('scoped success is partial-pass and never supersede', () => {
    expect(reduceReadiness([requirement('A')], [result('A')], { scope: 'partial', requiredParts: ['A'] }).overall).toBe('partial-pass');
    expect(reduceReadiness([], [], { scope: 'partial', requiredParts: [] }).overall).toBe('partial-blocked');
  });
  it('immediately aborts remaining baseline and costly runners after a baseline failure', () => {
    const execute = vi.fn((part: string): GateResult => ({ ...result(part), verdict: part === 'unit' ? 'fail' : 'pass' }));
    const unexecuted = (part: string): GateResult => ({ ...result(part), verdict: 'blocked', receipt: null });
    const output = executeStages(['typecheck', 'unit', 'integration'], ['browser', 'templates'], execute, unexecuted);
    expect(execute.mock.calls.map(c => c[0])).toEqual(['typecheck', 'unit']);
    expect(output.slice(2).map(r => r.verdict)).toEqual(['blocked', 'blocked', 'blocked']);
  });
  it('detects deleted and duplicate baseline identities despite equal or greater totals', () => {
    expect(removedAssertions(['old-a', 'old-b'], ['old-a', 'new-a', 'new-b'])).toEqual(['old-b']);
    expect(removedAssertions(['a', 'a'], ['a'])).toEqual(['a']);
    expect(removedAssertions(['a'], ['a', 'b'])).toEqual([]);
    expect(removedAssertions(['old-a'], ['new-a'], { 'old-a': 'new-a' })).toEqual([]);
    expect(removedAssertions(['old-a', 'old-b'], ['new-a'], { 'old-a': 'new-a', 'old-b': 'new-a' })).toEqual(['old-b']);
    expect(removedAssertions(['old-a'], ['new-a'], { 'old-a': 'missing' })).toEqual(['old-a']);
  });
});

describe('proof ownership and scheduling dependencies', () => {
  it('keeps the combined L02 publication leaf owned solely by its release receipt', () => {
    const requirement = loadMuse301ExecutionRequirements().find(item => item.id === '3.0.1:L02.task.3');
    expect(requirement).toMatchObject({ gates: ['l02'], proofGates: ['l02'], dependsOn: [] });
  });

 const r: Requirement = {id:'A1',part:'A',gates:['owner','prerequisite'],proofGates:['owner'],dependsOn:['prerequisite']};
 const owner = {...result('A'),gate:'owner'};
 const prerequisite = {...result('A'),gate:'prerequisite',tasks:[]};
 const reduce = (rs:Requirement[], gs:GateResult[])=>reduceReadiness(rs,gs,{scope:'full',requiredParts:['A']});
 it('requires prerequisite receipt without inventing task assertions in that gate',()=>expect(reduce([r],[owner,prerequisite]).overall).toBe('supersede'));
 it('blocks absent or failed prerequisite',()=>{expect(reduce([r],[owner]).overall).toBe('blocked');expect(reduce([r],[owner,{...prerequisite,verdict:'fail'}]).overall).toBe('blocked');});
 it('blocks absent owner task even when prerequisite passes',()=>expect(reduce([r],[{...owner,tasks:[]},prerequisite]).overall).toBe('blocked'));
 it('preserves all genuine evidence owners',()=>{const multi={...r,proofGates:['owner','prerequisite'],dependsOn:[]};expect(reduce([multi],[owner,prerequisite]).overall).toBe('blocked');expect(reduce([multi],[owner,{...prerequisite,tasks:['A1']}]).overall).toBe('supersede');});
 it('rejects phantom owner and owner/dependency overlap',()=>{expect(reduce([{...r,proofGates:['unknown']}],[owner,prerequisite]).overall).toBe('blocked');expect(reduce([{...r,dependsOn:['owner']}],[owner,prerequisite]).overall).toBe('blocked');});
});

it('enforces explicit baseline-before-capture timestamps without inferring phase order',()=>{
 const start='2026-09-05T12:00:00Z';
 expect(validateCaptureOrder(start,[{gate:'baseline',endedAt:'2026-09-05T11:59:00Z'}])).toEqual([]);
 expect(validateCaptureOrder(start,[{gate:'baseline',endedAt:'2026-09-05T12:01:00Z'}])).toHaveLength(1);
 expect(validateCaptureOrder(start,[{gate:'baseline',endedAt:'invalid'}])).toHaveLength(1);
 expect(validateCaptureOrder('invalid',[])).toHaveLength(1);
});

describe('aggregate obligation conjunction',()=>{
 const leaf:Requirement={id:'leaf',part:'A',gates:['proof']};
 const parent:Requirement={id:'parent',part:'A',gates:['proof'],proofGates:[],allOf:['leaf']};
 const proof:GateResult={...result('A'),gate:'proof',tasks:['leaf']};
 const reduce=(r:Requirement[],p:GateResult[]= [proof])=>reduceReadiness(r,p,{scope:'full',requiredParts:['A']});
 it('derives a parent only from all proven children',()=>{expect(reduce([leaf,parent]).tasks.parent).toBe('pass');expect(reduce([leaf,parent],[{...proof,tasks:[]}]).tasks.parent).toBe('blocked');});
 it('rejects missing children, duplicates, self-references and cycles',()=>{
 for(const children of [['missing'],['leaf','leaf'],['parent'],[]])expect(reduce([leaf,{...parent,allOf:children}]).overall).toBe('blocked');
 expect(reduce([{...leaf,proofGates:[],allOf:['parent']},parent]).overall).toBe('blocked');
 });
 it('rejects a self-certified aggregate receipt',()=>expect(reduce([leaf,parent],[{...proof,tasks:['leaf','parent']}]).overall).toBe('blocked'));
});

describe('explicit release-verification and archival phases',()=>{
 const archive:Requirement={id:ARCHIVE_REQUIREMENT,part:'L',gates:['archive']};
 const meta:Requirement={id:'3.0.1:L02.check.5',part:'L',gates:['L-proof'],proofGates:[],derivation:'all-required-leaves'};
 const req=[...requirements,archive,meta];
 it('permits archival after all executable release leaves while finalcompletion awaitsarchive',()=>{
   expect(deriveReleaseVerification(req,results).readyToArchive).toBe(true);
   expect(reduceReadiness(req,results,{scope:'full'}).overall).toBe('blocked');
   const archived={...result('L'),gate:'archive',tasks:[ARCHIVE_REQUIREMENT]};
   expect(reduceReadiness(req,[...results,archived],{scope:'full'}).overall).toBe('supersede');
 });
 it('new unclassified obligations remain leaves and cannot bypass the phase',()=>{
   const expanded=[...req,{id:'new-required-task',part:'L',gates:['L-proof']}];
   expect(deriveReleaseVerification(expanded,results).readyToArchive).toBe(false);
 });
 it('rejects forged meta classification and incomplete childstructure',()=>{
   expect(deriveReleaseVerification([...req,{id:'new-task',part:'L',gates:['L-proof'],proofGates:[],derivation:'all-required-leaves'}],results).readyToArchive).toBe(false);
   expect(deriveReleaseVerification([...req,{id:'parent',part:'L',gates:['L-proof'],proofGates:[],allOf:['missing-task']}],results).readyToArchive).toBe(false);
 });
});

describe('baseline raw assertion accounting',()=>{
 const report=()=>({numTotalTests:2,numFailedTests:0,numPendingTests:0,testResults:[{assertionResults:[{status:'passed'},{status:'passed'}]}]});
 it('accepts the complete executed inventory',()=>expect(validateAssertionInventory(report(),2)).toEqual([]));
 it('rejects failed assertion hidden by green aggregate counters',()=>{const d=report();d.testResults[0].assertionResults[1].status='failed';expect(validateAssertionInventory(d,2)).not.toEqual([]);});
 it('rejects inflated totals and missing raw assertions',()=>{const d=report();d.testResults[0].assertionResults.pop();expect(validateAssertionInventory(d,2)).not.toEqual([]);});
});


it('does not overwrite exact L01 artifacts before replaying their receipt', () => {
  const source = readFileSync('tools/muse3jsparity-readiness/index.ts', 'utf8');
  for (const command of [
    "['pnpm', 'check:templates']",
    "['pnpm', 'check:templates:installed']",
    "['pnpm', 'check:bundle-size']",
    "['pnpm', 'check:clean-install']",
    "['pnpm', 'check:installed-tree-shaking']",
  ]) expect(source).not.toContain(command);
});

import { describe, expect, it } from 'vitest';
import {
  loadMuse301Ledger,
  loadMuse301Requirements,
  parseOriginalRequirements,
  parseMuse301ExecutionRequirements,
  loadMuse301ExecutionRequirements,
  nonTestAcceptanceForRequirement,
  validateMuse301Requirements,
} from '../../../tools/muse3jsparity-readiness/requirements';

const ledger = loadMuse301Ledger();
const validate = (copy: typeof ledger) => validateMuse301Requirements(copy);

describe('3.0.1 original obligation traceability', () => {
  it('allows only explicitly mapped non-test acceptance without granting unrelated release obligations', () => {
    expect(nonTestAcceptanceForRequirement('L1.task.5')).toEqual({ gate: 'l01', schema: 'muse301-packages/v1' });
    expect(nonTestAcceptanceForRequirement('3.0.1:L02.check.1')).toEqual({ gate: 'l02', schema: 'muse301-release/v1' });
    for (const id of ['L1.check.4', 'L2.task.1', '3.0.1:FINAL.check.30', '3.0.1:L02.check.5', 'toString']) {
      expect(nonTestAcceptanceForRequirement(id)).toBeUndefined();
    }
    const loaded = loadMuse301ExecutionRequirements();
    expect(loaded.find(item => item.id === 'L1.task.5')?.acceptance?.gate).toBe('l01');
    expect(loaded.find(item => item.id === '3.0.1:FINAL.check.30')?.acceptance).toBeUndefined();
  });
  it('accounts for the immutable original tasks and checklists, including master duplicates', () => {
    expect(validate(ledger)).toEqual([]);
    expect(ledger.requirements.filter((r) => r.kind === 'check')).toHaveLength(244);
    expect(ledger.requirements.some((r) => r.id === 'S.task.4')).toBe(true);
    expect(ledger.requirements.some((r) => r.id === 'MASTER.check.1')).toBe(true);
    expect(loadMuse301Requirements().every((r) => r.gates.length > 0)).toBe(true);
  });

  it('detects a missing numbered task independently of checked boxes', () => {
    const copy = structuredClone(ledger);
    copy.requirements = copy.requirements.filter((r) => r.id !== 'A1.task.1');
    expect(validate(copy)).toContain('Original source fingerprint mismatch');
  });

  it('rejects duplicate IDs even when all expected IDs remain present', () => {
    const copy = structuredClone(ledger);
    copy.requirements.push(structuredClone(copy.requirements[0]!));
    expect(validate(copy)).toContain(`Duplicate requirement: ${copy.requirements[0]!.id}`);
  });

  it('does not accept a historical checked box as completion', () => {
    const copy = structuredClone(ledger);
    const item = copy.requirements.find((r) => r.sourceText.startsWith('- [x]'))!;
    item.state = 'verified'; item.disposition = 'preserved-completion';
    expect(validate(copy)).toContain(`Unsupported completion: ${item.id}`);
  });

  it('rejects stale text, anchors and source fingerprints', () => {
    const copy = structuredClone(ledger);
    copy.source.sha256 = '0'.repeat(64);
    copy.requirements[0]!.sourceLine += 1;
    copy.requirements[0]!.sourceText += ' rewritten';
    const errors = validate(copy);
    expect(errors).toContain('Original source fingerprint mismatch');
  });

  it('rejects removed work orders and invalid dependencies', () => {
    const copy = structuredClone(ledger);
    const item = copy.requirements.find((r) => r.kind === 'task')!;
    item.workOrders = ['Z99']; item.dependencies = ['Z98'];
    expect(validate(copy)).toContain(`Unknown work order/dependency: ${item.id} -> Z99`);
    expect(validate(copy)).toContain(`Unknown work order/dependency: ${item.id} -> Z98`);
  });

  it('cannot turn an unimplemented original requirement into a non-goal', () => {
    const copy = structuredClone(ledger);
    const item = copy.requirements.find((r) => r.id === 'A3.task.1')!;
    item.disposition = 'original-non-goal'; item.state = 'excluded'; item.gates = [];
    expect(validate(copy)).toContain(`Unsupported exclusion: ${item.id}`);
  });

  it('retains malformed historical checkmarks verbatim without assigning completion', () => {
    const parsed = parseOriginalRequirements('## PART L — Release\n### L7. Verify\n1. Complete\n- [x]] Historical\n## MASTER CHECKLIST\n- [ ] Verify again');
    expect(parsed.map((r) => r.id)).toEqual(['L7', 'L7.task.1', 'L7.check.1', 'MASTER.check.1']);
    expect(parsed[2]!.sourceText).toBe('- [x]] Historical');
  });

  it('preserves repeated original numbering as distinct accountable obligations', () => {
    const parsed = parseOriginalRequirements('## PART K\n### K1. Compare\n1. First obligation\n1. Separate obligation');
    expect(parsed.map((r) => r.id)).toEqual(['K1', 'K1.task.1', 'K1.task.1.occurrence.2']);
    expect(parsed[2]!.sourceText).toBe('1. Separate obligation');
  });

  it('adds every new work-order task and checklist without conflating the original IDs', () => {
    const added = ledger.executionRequirements;
    expect(added.filter((r) => /^3\.0\.1:[A-Z]\d{2}$/.test(r.id))).toHaveLength(23);
    expect(added.some((r) => r.id === '3.0.1:R02.task.1')).toBe(true);
    expect(added.some((r) => r.id === '3.0.1:Q01.check.1')).toBe(true);
    const combined = loadMuse301ExecutionRequirements();
    expect(new Set(combined.map((r) => r.id)).size).toBe(combined.length);
    expect(combined).toHaveLength(loadMuse301Requirements().length + added.length + 1);
  });

  it('stops task numbering at work-order boundaries and retains dependency gates', () => {
    const parsed = parseMuse301ExecutionRequirements('### R02. Temporal effects\n**Dependencies:** R01\n1. Implement\n- [ ] Verify\n## 5. Execution order\n1. Do not relabel this orchestration line as R02');
    expect(parsed.map((r) => r.id)).toEqual(['3.0.1:R02', '3.0.1:R02.task.1', '3.0.1:R02.check.1', '3.0.1:GLOBAL.5.task.1']);
    expect(parsed.slice(0, 3).every((r) => r.gates.includes('r02') && r.gates.includes('r01'))).toBe(true);
  });

  it('links new tasks to their work-order tests including future NEW files', () => {
    const parsed = parseMuse301ExecutionRequirements('### R02. Temporal effects\n| NEW | `tests/browser/future-temporal.spec.ts` | Pixel assertions |\n1. Implement\n- [ ] Verify\n### R03. GPU path\n| EDIT | `tests/unit/rendering/gpu-path.test.ts` | GPU assertions |\n1. Verify GPU');
    expect(parsed.filter((r) => r.id.startsWith('3.0.1:R02')).every((r) => r.tests.join() === 'tests/browser/future-temporal.spec.ts')).toBe(true);
    expect(parsed.filter((r) => r.id.startsWith('3.0.1:R03')).every((r) => r.tests.join() === 'tests/unit/rendering/gpu-path.test.ts')).toBe(true);
    const combined = loadMuse301ExecutionRequirements();
    const originalItem = ledger.requirements.find((r) => r.tests.length > 0 && r.disposition !== 'original-non-goal')!;
    expect(combined.find((r) => r.id === originalItem.id)!.tests).toEqual(expect.arrayContaining(originalItem.tests));
    const mapped = ledger.requirements.find((r) => r.id === 'K2.task.1')!;
    const expected = [...new Set([...mapped.tests, ...mapped.workOrders.flatMap((order) =>
      combined.find((r) => r.id === `3.0.1:${order}`)!.tests)])].sort();
    expect(combined.find((r) => r.id === mapped.id)!.tests).toEqual(expected);
    expect(loadMuse301Ledger().requirements.find((r) => r.id === mapped.id)!.tests).toEqual(mapped.tests);
  });
});

it('migrates release evidence owners while preserving original IDs and historical text',()=>{
 const items=loadMuse301ExecutionRequirements();
 for(const item of items.filter(r=>/^L[1-6](?:\.|$)/.test(r.id))) {
   expect((item.proofGates?.length ?? 0) + (item.allOf?.length ?? 0)).toBeGreaterThan(0);
   expect(item.gates.some(g=>/^l[1-6]$/.test(g))).toBe(false);
   expect(item.releaseMigration?.targetVersion).toBe('3.0.1');
   expect(item.sourceText).toBe(ledger.requirements.find(r=>r.id===item.id)?.sourceText);
 }
 expect(items.find(r=>r.id==='L5')?.gates).toEqual(['l01','l02']);
 expect(items.find(r=>r.id==='L5')?.allOf).toContain('L5.task.4');
 expect(items.find(r=>r.id==='L3.task.4')?.proofGates).toEqual(['q02']);
 expect(items.find(r=>r.id==='L1.task.5')?.dependsOn).toEqual([]);
});

it('section and final work-order completion require every child obligation',()=>{
 const items=loadMuse301ExecutionRequirements();
 const section=items.find(r=>r.id==='3.0.1:L01')!;
 expect(section.proofGates).toEqual([]);
 expect(section.allOf).toEqual(items.filter(r=>/^3\.0\.1:L01\.(task|check)\./.test(r.id)).map(r=>r.id));
 expect(items.find(r=>r.id==='3.0.1:FINAL.check.22')?.allOf).toEqual(['3.0.1:L01']);
 expect(items.find(r=>r.id==='3.0.1:L02.check.5')?.derivation).toBe('all-required-leaves');
 expect(items.find(r=>r.id==='3.0.1:L02.task.5')?.allOf).toContain('3.0.1:FINAL.archive');
});

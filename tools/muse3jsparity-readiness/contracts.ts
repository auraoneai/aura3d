/** Pure release contracts. A gate's declared parts are descriptive, never coverage. */
export type Verdict = 'pass' | 'fail' | 'blocked' | 'quarantined' | 'skipped';
export interface Requirement { readonly id: string; readonly part: string; readonly gates: readonly string[]; readonly derivation?: 'all-required-leaves'; readonly allOf?: readonly string[]; readonly proofGates?: readonly string[]; readonly dependsOn?: readonly string[] }
export interface GateResult {
  readonly gate: string;
  readonly parts: readonly string[];
  readonly tasks: readonly string[];
  readonly verdict: Verdict;
  readonly detail: string;
  readonly receipt: string | null;
  readonly receiptHash?: string;
  readonly receiptValid?: boolean;
}
export const ARCHIVE_REQUIREMENT = '3.0.1:FINAL.archive';
export const FINAL_DERIVATIONS = new Set(['3.0.1:L02.check.5','3.0.1:FINAL.check.25','3.0.1:FINAL.check.26']);
export const REQUIRED_PARTS = 'A B C D E F G H I J K L M N O P Q R S T U V'.split(' ');
export const BASELINE_UNIT_TOTAL = 4417;
export const BASELINE_RENDERING_TOTAL = 983;
export const BASELINE_UNIT_FAILED_CEILING = 0;

export function reduceReadiness(requirements: readonly Requirement[], results: readonly GateResult[], options: {
  scope: 'full' | 'partial'; requiredParts?: readonly string[]; unresolvedQuarantine?: readonly string[];
}) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const requiredGates = new Set(requirements.flatMap(r => [...r.gates]));
  for (const r of requirements) {
    if (!r.id || ids.has(r.id)) errors.push(`duplicate or empty requirement: ${r.id}`);
    ids.add(r.id);
    if (r.derivation && (!FINAL_DERIVATIONS.has(r.id) || r.derivation !== 'all-required-leaves' || r.allOf)) errors.push(`invalid derived obligation: ${r.id}`);
    if (r.proofGates && (!r.proofGates.length && !r.allOf?.length && !r.derivation || r.proofGates.some(g => !r.gates.includes(g)))) errors.push(`invalid proof owners: ${r.id}`);
    if (r.dependsOn?.some(g => !r.gates.includes(g) || r.proofGates?.includes(g))) errors.push(`invalid dependencies: ${r.id}`);
    if (!r.gates.length || new Set(r.gates).size !== r.gates.length) errors.push(`missing or duplicate gates: ${r.id}`);
  }
  for (const r of requirements) if (r.allOf && (!r.allOf.length || new Set(r.allOf).size !== r.allOf.length || r.allOf.some(id => !ids.has(id) || id === r.id))) errors.push(`invalid aggregate children: ${r.id}`);
  const seenGates = new Set<string>();
  for (const result of results) {
    if (seenGates.has(result.gate)) errors.push(`duplicate gate: ${result.gate}`);
    seenGates.add(result.gate);
    if (!requiredGates.has(result.gate)) errors.push(`unknown gate: ${result.gate}`);
    const seenTasks = new Set<string>();
    for (const task of result.tasks) {
      if (!ids.has(task)) errors.push(`unknown task: ${task}`);
      if (seenTasks.has(task)) errors.push(`duplicate task: ${task}`);
      seenTasks.add(task);
      if (!requirements.some(r => r.id === task && (r.proofGates ?? r.gates).includes(result.gate))) errors.push(`unmapped task/gate: ${task}/${result.gate}`);
    }
  }
  const tasks: Record<string, 'pass' | 'blocked'> = {};
  const visiting = new Set<string>();
  const evaluate = (id: string): 'pass' | 'blocked' => {
    if (tasks[id]) return tasks[id];
    if (visiting.has(id)) { errors.push(`aggregate cycle: ${id}`); return 'blocked'; }
    const r = requirements.find(requirement => requirement.id === id);
    if (!r) return 'blocked';
    visiting.add(id);
    const gatesPass = r.gates.length > 0 && r.gates.every(gate => {
      const matches = results.filter(result => result.gate === gate);
      return matches.length === 1 && (!(r.proofGates ?? r.gates).includes(gate) || matches[0].tasks.includes(r.id)) && matches[0].verdict === 'pass'
        && matches[0].receiptValid === true && !!matches[0].receipt && /^[a-f0-9]{64}$/.test(matches[0].receiptHash ?? '');
    });
    const derivedLeaves = requirements.filter(item => !item.allOf && !item.derivation);
    const derivationPass = !r.derivation || (derivedLeaves.length > 0 && derivedLeaves.every(leaf => evaluate(leaf.id) === 'pass'));
    const childrenPass = !r.allOf || (r.allOf.length > 0 && r.allOf.every(child => evaluate(child) === 'pass'));
    visiting.delete(id);
    return tasks[id] = gatesPass && childrenPass && derivationPass ? 'pass' : 'blocked';
  };
  for (const r of requirements) evaluate(r.id);
  const parts: Record<string, 'pass' | 'blocked'> = {};
  for (const part of options.requiredParts ?? REQUIRED_PARTS) {
    const members = requirements.filter(r => r.part === part);
    parts[part] = members.length > 0 && members.every(r => tasks[r.id] === 'pass') ? 'pass' : 'blocked';
  }
  for (const gate of options.unresolvedQuarantine ?? []) errors.push(`unresolved quarantine: ${gate}`);
  const successful = errors.length === 0 && requirements.length > 0 && Object.values(tasks).every(v => v === 'pass')
    && Object.values(parts).every(v => v === 'pass') && results.every(r => r.verdict === 'pass');
  return { parts, tasks, errors, overall: options.scope === 'partial' ? (successful ? 'partial-pass' : 'partial-blocked') : (successful ? 'supersede' : 'blocked') } as const;
}

/** Baseline failure stops at the failing command; later work gets explicit unexecuted results. */
export function executeStages<T>(baseline: readonly T[], downstream: readonly T[], execute: (stage: T) => GateResult,
  unexecuted: (stage: T) => GateResult): GateResult[] {
  const results: GateResult[] = [];
  let blocked = false;
  for (const stage of baseline) {
    const result = blocked ? unexecuted(stage) : execute(stage);
    results.push(result);
    if (result.verdict !== 'pass') blocked = true;
  }
  for (const stage of downstream) results.push(blocked ? unexecuted(stage) : execute(stage));
  return results;
}

export function removedAssertions(
  baseline: readonly string[],
  current: readonly string[],
  replacements: Readonly<Record<string, string>> = {}
): string[] {
  const remaining = new Map<string, number>();
  for (const id of current) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  return baseline.filter(id => {
    const exact = remaining.get(id) ?? 0;
    if (exact > 0) { remaining.set(id, exact - 1); return false; }
    const successor = replacements[id];
    if (!successor || successor === id) return true;
    const successorCount = remaining.get(successor) ?? 0;
    if (successorCount <= 0) return true;
    remaining.set(successor, successorCount - 1);
    return false;
  });
}

/** Explicit capture prerequisites only; work-order dependencies may describe phases. */
export function validateCaptureOrder(captureStartedAt: string, prerequisites: readonly { gate: string; endedAt: string }[]): string[] {
  const capture = Date.parse(captureStartedAt);
  if (!Number.isFinite(capture)) return ['invalid capture start'];
  return prerequisites.flatMap(p => {
    const end = Date.parse(p.endedAt);
    return !Number.isFinite(end) || end > capture ? [`prerequisite not completed before capture: ${p.gate}`] : [];
  });
}

/** Before archiving, every executable release leaf must already be proven. */
export function deriveReleaseVerification(requirements: readonly Requirement[], results: readonly GateResult[]) {
 const structure=reduceReadiness(requirements,results,{scope:'full'});
 const leaves=requirements.filter(r=>!r.allOf&&!r.derivation&&r.id!==ARCHIVE_REQUIREMENT);
 const gates=new Set(leaves.flatMap(r=>r.gates));
 const leafIds=new Set(leaves.map(r=>r.id));
 const evidence=results.filter(r=>gates.has(r.gate)).map(r=>({...r,tasks:r.tasks.filter(task=>leafIds.has(task))}));
 const release=reduceReadiness(leaves,evidence,{scope:'full'});
 return {schema:'muse301-release-verification-phase/v1',stage:'release-verification',readyToArchive:structure.errors.length===0&&release.overall==='supersede',requiredLeafIds:leaves.map(r=>r.id),excludedFinalization:[ARCHIVE_REQUIREMENT],tasks:release.tasks,errors:[...structure.errors,...release.errors]};
}

/** Aggregate counters cannot hide a failed, skipped, or omitted assertion. */
export function validateAssertionInventory(report: unknown, minimum: number): string[] {
 const data=report as any;
 if(!data||!Array.isArray(data.testResults)||!data.testResults.length||!Number.isInteger(data.numTotalTests)||data.numTotalTests<minimum)return ['Missing or deficient assertion inventory'];
 const assertions=data.testResults.flatMap((suite:any)=>Array.isArray(suite?.assertionResults)?suite.assertionResults:[]);
 if(assertions.length!==data.numTotalTests||assertions.some((test:any)=>!test||test.status!=='passed'))return ['Assertion inventory differs from successful aggregate counters'];
 if(data.numFailedTests!==0||data.numPendingTests!==0||(data.numTodoTests??0)!==0)return ['Failed, pending, or todo assertions'];
 return [];
}

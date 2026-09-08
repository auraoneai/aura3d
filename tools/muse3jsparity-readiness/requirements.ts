import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MUSE301_LEDGER_PATH = 'docs/project/plans/muse3jsparity-301-requirements.json';
export const ORIGINAL_PRD_PATH = 'release-artifacts/muse3jsparity-PRD-3.0.0.md';
export interface OriginalRequirement {
  id: string;
  part: string;
  section: string;
  kind: 'section' | 'task' | 'check' | 'non-goal';
  sourceLine: number;
  sourceText: string;
}
export interface RequirementReceipt {
  path: string;
  sha256: string;
  producer: string;
  acceptance: string;
}
export interface Muse301Requirement extends OriginalRequirement {
  gates: string[];
  disposition: 'work-order' | 'preserved-completion' | 'original-non-goal';
  workOrders: string[];
  dependencies: string[];
  state: 'unverified' | 'verified' | 'excluded';
  sourceFiles: string[];
  publicSurface: string;
  tests: string[];
  producers: string[];
  evidenceCandidates: { path: string; sha256: string | null }[];
  proofObligations: string[];
  closureEvidence: RequirementReceipt[];
  rationale: string;
}
export interface Muse301Ledger {
  schemaVersion: 1;
  targetVersion: '3.0.1';
  source: { path: string; sha256: string };
  requirements: Muse301Requirement[];
}

export function sha256(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Historical checkmarks are source text, never executable completion evidence. */
export function parseOriginalRequirements(text: string): OriginalRequirement[] {
  const result: OriginalRequirement[] = [];
  let section = 'PREAMBLE';
  let part = 'Q';
  let checks = 0;
  const occurrences = new Map<string, number>();
  const add = (kind: OriginalRequirement['kind'], id: string, sourceText: string, sourceLine: number) => {
    const occurrence = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, occurrence);
    result.push({ id: occurrence === 1 ? id : `${id}.occurrence.${occurrence}`, part, section, kind, sourceLine, sourceText });
  };
  text.split(/\r?\n/).forEach((line, index) => {
    const heading = /^### ([A-Z]\d+)\./.exec(line);
    const partHeading = /^## PART ([A-Z])\b/.exec(line);
    if (partHeading) {
      part = partHeading[1]!;
      section = part;
      checks = 0;
    }
    if (/^## MASTER CHECKLIST\b/.test(line)) {
      section = 'MASTER'; part = 'Q'; checks = 0;
    }
    if (heading) {
      section = heading[1]!; part = section[0]!; checks = 0;
      add('section', section, line, index + 1);
    } else if (/^Non-goals for this PRD:/.test(line)) {
      add('non-goal', 'PREAMBLE.non-goal', line, index + 1);
    } else {
      const task = /^(\d+)\.\s/.exec(line);
      if (task) add('task', `${section}.task.${task[1]}`, line, index + 1);
      // Accept the historical malformed [x]] syntax while preserving it verbatim.
      if (/^\s*[-*]\s+\[[ xX]\]/.test(line)) add('check', `${section}.check.${++checks}`, line, index + 1);
    }
  });
  return result;
}

export function validateMuse301Requirements(
  ledger: Muse301Ledger,
  originalText: string,
  remediationText: string,
): string[] {
  const errors: string[] = [];
  if (ledger.schemaVersion !== 1 || ledger.targetVersion !== '3.0.1') errors.push('Unsupported requirements schema/version');
  if (ledger.source.path !== ORIGINAL_PRD_PATH || ledger.source.sha256 !== sha256(originalText)) errors.push('Original source fingerprint mismatch');
  const expected = new Map(parseOriginalRequirements(originalText).map((r) => [r.id, r]));
  const orders = new Set([...remediationText.matchAll(/^### ([A-Z]\d{2})\./gm)].map((m) => m[1]!));
  const seen = new Set<string>();
  for (const requirement of ledger.requirements) {
    const { id } = requirement;
    if (seen.has(id)) errors.push(`Duplicate requirement: ${id}`);
    seen.add(id);
    const original = expected.get(id);
    if (!original) errors.push(`Unknown original requirement: ${id}`);
    else for (const key of ['part', 'section', 'kind', 'sourceLine', 'sourceText'] as const) {
      if (original[key] !== requirement[key]) errors.push(`Stale original mapping: ${id}.${key}`);
    }
    if (!requirement.rationale?.trim() || !requirement.proofObligations?.length) errors.push(`Missing accountable proof obligation: ${id}`);
    if (!['work-order', 'preserved-completion', 'original-non-goal'].includes(requirement.disposition)) errors.push(`Invalid disposition: ${id}`);
    if (!['unverified', 'verified', 'excluded'].includes(requirement.state)) errors.push(`Invalid state: ${id}`);
    if (requirement.disposition === 'original-non-goal') {
      if (original?.kind !== 'non-goal' || requirement.state !== 'excluded') errors.push(`Unsupported exclusion: ${id}`);
    } else {
      if (requirement.state === 'excluded') errors.push(`Required obligation excluded: ${id}`);
      if (!requirement.gates?.length) errors.push(`Missing regression gate: ${id}`);
      if (!requirement.workOrders?.length) errors.push(`Unmapped obligation: ${id}`);
    }
    for (const order of [...requirement.workOrders, ...requirement.dependencies]) {
      if (!orders.has(order)) errors.push(`Unknown work order/dependency: ${id} -> ${order}`);
    }
    if (requirement.state === 'verified' || requirement.disposition === 'preserved-completion') {
      if (!requirement.closureEvidence?.length) errors.push(`Unsupported completion: ${id}`);
      for (const receipt of requirement.closureEvidence ?? []) {
        if (!receipt.path || !/^[a-f0-9]{64}$/.test(receipt.sha256) || !receipt.producer?.trim() || !receipt.acceptance?.trim()) errors.push(`Invalid closure receipt: ${id}`);
      }
    }
  }
  for (const id of expected.keys()) if (!seen.has(id)) errors.push(`Missing original requirement: ${id}`);
  return errors;
}

/** Return all obligations, including open ones. Exclusions have no rendering claim. */
export function loadMuse301Ledger(rootDir = process.cwd()): Muse301Ledger {
  const ledger = JSON.parse(readFileSync(resolve(rootDir, MUSE301_LEDGER_PATH), 'utf8')) as Muse301Ledger;
  const errors = validateMuse301Requirements(ledger,
    readFileSync(resolve(rootDir, ORIGINAL_PRD_PATH), 'utf8'),
    readFileSync(resolve(rootDir, 'muse3jsparity-3.0.1-PRD.md'), 'utf8'));
  for (const requirement of ledger.requirements) {
    for (const receipt of requirement.closureEvidence) {
      try {
        if (sha256(readFileSync(resolve(rootDir, receipt.path))) !== receipt.sha256) errors.push(`Closure receipt hash mismatch: ${requirement.id}: ${receipt.path}`);
      } catch { errors.push(`Missing closure receipt: ${requirement.id}: ${receipt.path}`); }
    }
  }
  if (errors.length) throw new Error(`Invalid Muse3js 3.0.1 traceability ledger:\n${errors.join('\n')}`);
  return ledger;
}

export function loadMuse301Requirements(rootDir = process.cwd()): Muse301Requirement[] {
  return loadMuse301Ledger(rootDir).requirements.filter((r) => r.disposition !== 'original-non-goal');
}

export interface Muse301ExecutionRequirement {
  id: string;
  part: string;
  gates: string[];
  tests: string[];
  sourceLine: number;
  sourceText: string;
  releaseMigration?: { historicalVersion: '3.0.0'; targetVersion: '3.0.1'; rationale: string };
  finalClaimsAcceptance?: { schema: 'muse301-final-claims-validation/v1' };
  marketingAcceptance?: { schema:'muse301-marketing-validation/v1';mode?:'published' };
  reportRegenerationAcceptance?:{schema:'muse301-report-regeneration/v1'};
  registryConsumerAcceptance?:{schema:'muse301-registry-consumer/v1'};
  routeAcceptance?: { schema: 'aura3d-301-route-acceptance/v1'; kind: 'routes' | 'assets' };
  sourceAuditAcceptance?: { schema: 'muse3jsparity-docs-audit/v1' };
  commandAcceptance?: { commands: string[][] };
  releaseSequenceAcceptance?: { schema: 'muse301-release-sequence/v1'; mode: 'preflight' | 'release' };
  cleanupAcceptance?: { schema: 'muse301-cleanup/v1' };
  assertions?: {file:string;title:string}[];
  derivation?: 'all-required-leaves';
  allOf?: string[];
  proofGates?: string[];
  dependsOn?: string[];
  acceptance?: { gate: 'l01' | 'l02'; schema: string };
}

// Only obligations whose acceptance is fully represented by the quantitative
// package/release contracts may use a non-test proof. Missing tests never imply
// eligibility. Documentation, cleanup and final aggregate obligations stay open
// until their own command/review evidence is supported.
const NON_TEST_ACCEPTANCE: Readonly<Record<string, 'l01' | 'l02'>> = {
  'L1.task.1': 'l01',
  'L1.task.2': 'l01',
  'L1.task.3': 'l01',
  'L1.task.4': 'l01',
  'L1.check.1': 'l01',
  'L1.check.2': 'l01',
  '3.0.1:L01.task.1': 'l01',
  '3.0.1:L01.task.2': 'l01',
  '3.0.1:L01.task.3': 'l01',
  '3.0.1:L01.task.4': 'l01',
  '3.0.1:L01.check.2': 'l01',
  '3.0.1:L01.check.5': 'l01',
  '3.0.1:L01.check.1': 'l01',
  'L1.task.5': 'l01',
  'L1.check.3': 'l01',
  'L4.task.2': 'l02',
  'L4.check.3': 'l02',
  'L4.check.2': 'l02',
  'L6.task.4': 'l02',
  'L6.check.4': 'l02',
  'L5.check.2': 'l02',
  '3.0.1:L01.check.3': 'l01',
  '3.0.1:L01.check.4': 'l01',
  '3.0.1:L02.check.1': 'l02',
  '3.0.1:L02.task.1': 'l02',
  '3.0.1:L02.check.2': 'l02',
  '3.0.1:L02.check.3': 'l02',
  '3.0.1:L02.check.4': 'l02',
  '3.0.1:FINAL.check.28': 'l02',
};

export function nonTestAcceptanceForRequirement(id: string): Muse301ExecutionRequirement['acceptance'] {
  const gate = Object.hasOwn(NON_TEST_ACCEPTANCE, id) ? NON_TEST_ACCEPTANCE[id] : undefined;
  return gate ? { gate, schema: gate === 'l01' ? 'muse301-packages/v1' : 'muse301-release/v1' } : undefined;
}

/** New release obligations are additional acceptance requirements, not replacements. */
export function parseMuse301ExecutionRequirements(text: string): Muse301ExecutionRequirement[] {
  const requirements: Muse301ExecutionRequirement[] = [];
  const testsByOrder = new Map<string, Set<string>>();
  let testOrder: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^## /.test(line)) testOrder = null;
    const heading = /^### ([A-Z]\d{2})\./.exec(line);
    if (heading) testOrder = heading[1]!;
    if (!testOrder) continue;
    const tests = testsByOrder.get(testOrder) ?? new Set<string>();
    // Planned NEW test filenames are acceptance targets, not claims of existence.
    for (const match of line.matchAll(/\btests\/[A-Za-z0-9_./{}*+-]+\.(?:test|spec)\.[cm]?[jt]sx?/g)) tests.add(match[0]);
    testsByOrder.set(testOrder, tests);
  }
  const orderParts: Record<string, string> = {
    G01: 'K', G02: 'K', G03: 'K', R01: 'A', R02: 'A', R03: 'J', R04: 'C',
    R05: 'B', R06: 'T', P01: 'A', P02: 'B', E01: 'E', I01: 'F', I02: 'N',
    I03: 'O', I04: 'F', D01: 'S', V01: 'K', V02: 'K', Q01: 'Q', Q02: 'L', L01: 'L', L02: 'L',
  };
  let section: string | null = null;
  let globalSection = '0';
  let check = 0;
  let finalChecklist = false;
  const dependencies = new Map<string, string[]>();
  const occurrences = new Map<string, number>();
  const add = (id: string, order: string, sourceText: string, sourceLine: number) => {
    const occurrence = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, occurrence);
    requirements.push({ id: `3.0.1:${id}${occurrence > 1 ? `.occurrence.${occurrence}` : ''}`,
      part: orderParts[order] ?? order[0]!, gates: [order.toLowerCase()], proofGates: [order.toLowerCase()],
      tests: [...(testsByOrder.get(order) ?? [])].sort(), sourceText, sourceLine });
  };
  text.split(/\r?\n/).forEach((line, index) => {
    const heading = /^### ([A-Z]\d{2})\./.exec(line);
    if (/^## /.test(line)) {
      section = null;
      globalSection = /^## (\d+)\./.exec(line)?.[1] ?? 'appendix';
      finalChecklist = /^## 8\. Final 3\.0\.1 checklist/.test(line);
      if (finalChecklist) check = 0;
    }
    if (heading) {
      section = heading[1]!; check = 0;
      add(section, section, line, index + 1);
    } else if (section) {
      if (/^\*\*Dependencies:\*\*/.test(line)) {
        dependencies.set(section, [...line.matchAll(/\b[A-Z]\d{2}\b/g)].map((m) => m[0].toLowerCase()));
      }
      const task = /^(\d+)\.\s/.exec(line);
      if (task) add(`${section}.task.${task[1]}`, section, line, index + 1);
      if (/^\s*[-*]\s+\[[ xX]\]/.test(line)) add(`${section}.check.${++check}`, section, line, index + 1);
    } else if (finalChecklist && /^\s*[-*]\s+\[[ xX]\]/.test(line)) {
      const order = /\b[A-Z]\d{2}\b/.exec(line)?.[0] ?? 'L02';
      add(`FINAL.check.${++check}`, order, line, index + 1);
    } else if (!section) {
      const task = /^(\d+)\.\s/.exec(line);
      if (task) {
        const order = /\b[A-Z]\d{2}\b/.exec(line)?.[0] ?? 'L02';
        add(`GLOBAL.${globalSection}.task.${task[1]}`, order, line, index + 1);
      }
    }
  });
  for (const requirement of requirements) {
    const order = requirement.gates[0]!.toUpperCase();
    requirement.dependsOn = [...new Set(dependencies.get(order) ?? [])].filter(gate => !requirement.proofGates?.includes(gate));
    requirement.gates = [...new Set([...requirement.gates, ...requirement.dependsOn])];
  }
  return requirements;
}

export function loadMuse301ExecutionRequirements(rootDir = process.cwd()): Muse301ExecutionRequirement[] {
  const added = parseMuse301ExecutionRequirements(
    readFileSync(resolve(rootDir, 'muse3jsparity-3.0.1-PRD.md'), 'utf8'));
  const testsByOrder = new Map(added.filter((r) => /^3\.0\.1:[A-Z]\d{2}$/.test(r.id))
    .map((r) => [r.id.slice('3.0.1:'.length), r.tests]));
  const original = loadMuse301Requirements(rootDir).map((r) => ({ ...r,
    tests: [...new Set([...r.tests, ...r.workOrders.flatMap((order) => testsByOrder.get(order) ?? [])])].sort(),
  }));
  const mapped: Muse301ExecutionRequirement[] = [...original, ...added].map(item => {
    if(item.id==='3.0.1:V02.task.4')return {...item,tests:['tests/browser/muse3jsparity-301-root-governor.spec.ts'],assertions:[{file:'tests/browser/muse3jsparity-301-root-governor.spec.ts',title:'resolution particles LOD and shadows change native resources after measured overload'}]};
    if(item.id==='3.0.1:FINAL.check.24')return {...item,gates:[...new Set([...item.gates,'q01'])],proofGates:['q01'],dependsOn:item.gates.filter(g=>'q01'!==g),tests:['tests/unit/tools/muse3jsparity-requirements.test.ts'],assertions:[{file:'tests/unit/tools/muse3jsparity-requirements.test.ts',title:'3.0.1 original obligation traceability accounts for the immutable original tasks and checklists, including master duplicates'}]};
    if (item.id === '3.0.1:FINAL.check.30') return {...item,cleanupAcceptance:{schema:'muse301-cleanup/v1' as const}};
    const migration = legacyReleaseProofOwners(item.id);
    const requirement = migration ? { ...item, gates: migration, proofGates: migration, dependsOn: [] as string[], releaseMigration: { historicalVersion: '3.0.0' as const, targetVersion: '3.0.1' as const, rationale: 'Preserve this original obligation and source text; execute its release behavior for the explicitly required 3.0.1 release.' } } : item;
    if(requirement.id==='L2.task.3')return {...requirement,reportRegenerationAcceptance:{schema:'muse301-report-regeneration/v1' as const},gates:['q02','l02'],proofGates:['l02']};
    if(requirement.id==='3.0.1:L02.task.3')return {...requirement,finalClaimsAcceptance:{schema:'muse301-final-claims-validation/v1' as const},marketingAcceptance:{schema:'muse301-marketing-validation/v1' as const,mode:'published' as const},releaseSequenceAcceptance:{schema:'muse301-release-sequence/v1' as const,mode:'release' as const},registryConsumerAcceptance:{schema:'muse301-registry-consumer/v1' as const},gates:['l02'],proofGates:['l02'],dependsOn:[]};
    if (['3.0.1:Q02.task.4','3.0.1:Q02.check.3','3.0.1:FINAL.check.27','L2.task.1','L2.check.1','L2.check.2','L2.check.3','L2.check.4','L3.task.1','L3.task.2','L3.task.3','L3.check.1','L3.check.2'].includes(requirement.id)) return {...requirement, finalClaimsAcceptance:{schema:'muse301-final-claims-validation/v1' as const}};
    if (['3.0.1:Q02.task.2', '3.0.1:Q02.check.2'].includes(requirement.id)) return { ...requirement, sourceAuditAcceptance: { schema: 'muse3jsparity-docs-audit/v1' as const } };
    if (['3.0.1:Q02.task.1','3.0.1:Q02.check.1','3.0.1:Q02.task.3'].includes(requirement.id)) return {...requirement,routeAcceptance:{schema:'aura3d-301-route-acceptance/v1' as const,kind:requirement.id==='3.0.1:Q02.task.3'?'assets' as const:'routes' as const}};
    const releaseSequenceAcceptance = releaseSequenceAcceptanceForRequirement(requirement.id);
    if (releaseSequenceAcceptance) return {...requirement,releaseSequenceAcceptance,proofGates:[releaseSequenceAcceptance.mode==='preflight'?'l01':'l02'],gates:[...new Set([...requirement.gates,releaseSequenceAcceptance.mode==='preflight'?'l01':'l02'])]};
    if(['L6.task.1','L6.task.2','L6.check.1','L6.check.2'].includes(requirement.id))return {...requirement,finalClaimsAcceptance:{schema:'muse301-final-claims-validation/v1' as const},marketingAcceptance:{schema:'muse301-marketing-validation/v1' as const,mode:'published' as const},proofGates:['l02'],gates:[...new Set([...requirement.gates,'l02'])]};
    if(['L6.task.3','L6.check.3'].includes(requirement.id))return {...requirement,marketingAcceptance:{schema:'muse301-marketing-validation/v1' as const},proofGates:['l02'],gates:[...new Set([...requirement.gates,'l02'])]};
    if(['L5.task.3','L5.check.3','3.0.1:L02.task.4'].includes(requirement.id))return {...requirement,registryConsumerAcceptance:{schema:'muse301-registry-consumer/v1' as const},acceptance:{gate:'l02' as const,schema:'muse301-release/v1'},proofGates:['l02']};
    if(requirement.id==='L1.check.4')return {...requirement,acceptance:{gate:'l01' as const,schema:'muse301-packages/v1'},commandAcceptance:{commands:[['pnpm','check:agent-docs']]},proofGates:['l01']};
    const commandAcceptance = commandAcceptanceForRequirement(requirement.id);
    if (commandAcceptance) return { ...requirement, commandAcceptance };
    const acceptance = nonTestAcceptanceForRequirement(requirement.id);
    return acceptance ? { ...requirement, acceptance, proofGates: [acceptance.gate], dependsOn: requirement.gates.filter(gate => gate !== acceptance.gate) } : requirement;
  });
  mapped.push({id:'3.0.1:FINAL.archive',part:'L',gates:['archive'],proofGates:['archive'],tests:[],sourceLine:mapped.find(r=>r.id==='3.0.1:L02.task.5')?.sourceLine??0,sourceText:'Archive the exact completed PRD and deterministic release-verification snapshot after all executable release obligations pass.'});
  return bindAggregateObligations(mapped);
}

/** Named command obligations only; prose/visual quality cannot use an exit code. */
export function commandAcceptanceForRequirement(id: string): Muse301ExecutionRequirement['commandAcceptance'] {
  if (id === 'L2.task.2') return { commands: [['pnpm', 'verify:api-docs', '--', '--write']] };
  if (id === 'L3.task.4' || id === 'L3.check.3') return { commands: ['check:agent-docs', 'check:docs-site', 'check:docs-codeblocks', 'verify:docs-version'].map(script => ['pnpm', script]) };
  return undefined;
}

/** Audited release owner aliases, not a completion or exclusion of old obligations. */
export function legacyReleaseProofOwners(id: string): string[] | undefined {
  const section = /^(L[1-6])(?:\.|$)/.exec(id)?.[1];
  if (!section) return undefined;
  if (section === 'L1') return ['l01'];
  if (section === 'L2') {
    if (id === 'L2.task.2' || id === 'L2.check.1' || id === 'L2.check.3') return ['q02'];
    return ['q02', 'l02'];
  }
  if (section === 'L3') return ['q02'];
  if (section === 'L4') return ['l02'];
  if (section === 'L5') {
    if (id === 'L5.task.1' || id === 'L5.check.1') return ['l01'];
    if (id === 'L5.task.2' || id === 'L5.task.3' || id === 'L5.task.4' || id === 'L5.check.2' || id === 'L5.check.3') return ['l02'];
    return ['l01', 'l02'];
  }
  if (section === 'L6') {
    if (['L6.task.1','L6.task.2','L6.check.1','L6.check.2'].includes(id)) return ['q02', 'l02'];
    return ['l02'];
  }
  return undefined;
}

/** Section completion means every numbered task and checklist child, not a new self-receipt. */
export function bindAggregateObligations(items: Muse301ExecutionRequirement[]): Muse301ExecutionRequirement[] {
 return items.map(item => {
   if (['3.0.1:L02.check.5','3.0.1:FINAL.check.25','3.0.1:FINAL.check.26'].includes(item.id)) return {...item,derivation:'all-required-leaves' as const,proofGates:[]};
   if(item.id==='3.0.1:L02.task.5')return {...item,allOf:['3.0.1:L02.check.4','3.0.1:FINAL.archive','3.0.1:L02.check.5'],proofGates:[]};
   if(item.id==='L4.task.3')return {...item,allOf:['3.0.1:L01.check.5','3.0.1:L02.check.1','3.0.1:L02.check.2','3.0.1:L02.check.3'],proofGates:[]};
   let children: string[] = [];
   if (/^(?:[A-Z]\d+|3\.0\.1:[A-Z]\d{2})$/.test(item.id)) children = items.filter(child => child.id.startsWith(`${item.id}.task.`) || child.id.startsWith(`${item.id}.check.`)).map(child => child.id);
   else if (/^3\.0\.1:FINAL\.check\.\d+$/.test(item.id)) {
     const order = /\*\*([A-Z]\d{2})\*\*.*all section tasks\/checks/.exec(item.sourceText)?.[1];
     if (order && items.some(child => child.id === `3.0.1:${order}`)) children = [`3.0.1:${order}`];
   }
   return children.length ? {...item,allOf:children,proofGates:[]} : item;
 });
}

/** Sequencing contracts supplement canonical package/gallery/registry validators. */
export function releaseSequenceAcceptanceForRequirement(id:string):Muse301ExecutionRequirement['releaseSequenceAcceptance'] {
 if(['L5.task.1','L5.check.1'].includes(id))return {schema:'muse301-release-sequence/v1',mode:'preflight'};
 if(['L4.task.1','L4.task.4','L4.check.1','L5.task.2','L5.task.4','3.0.1:L01.task.5','3.0.1:L02.task.2','3.0.1:GLOBAL.5.task.5','3.0.1:GLOBAL.5.task.6','3.0.1:FINAL.check.29'].includes(id))return {schema:'muse301-release-sequence/v1',mode:'release'};
 return undefined;
}

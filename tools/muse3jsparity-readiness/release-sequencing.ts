/** Release ordering is evidence, not an operator's declaration that steps passed.
 * The caller must replay each referenced producer through its canonical validator.
 * This module intentionally never executes a publication or changes npm metadata.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export interface ReleaseRef { path: string; sha256: string }
export interface ReleaseSource { commit: string; tree: string; lockfileSha256: string; fingerprint: string }
export type ReleasePhase = 'baseline' | 'source-audit' | 'packages' | 'capture' | 'gallery' | 'review' | 'preflight' | 'publish' | 'registry' | 'origin' | 'github';
export interface ReleaseSequence {
  schema: 'muse301-release-sequence/v1'; source: ReleaseSource;
  releasePlan: ReleaseRef; phases: Record<ReleasePhase, ReleaseRef[]>;
  registryBefore: ReleaseRef; registryAfter: ReleaseRef;
}
export interface ReplayedReleasePhase {
  source: ReleaseSource; startedAt: string; endedAt: string;
  command: string[]; errors: string[];
  /** Derived from canonical artifacts, not copied from the sequence document. */
  facts?: { tagCommit?: string; publishedPackages?: string[]; artifactHashes?: string[];
    reviewerIdentity?: string; independent?: boolean; decision?: string; benchmarkRound?: string };
}
export interface ReleaseReplayContext {
  now: number;
  read: (ref: ReleaseRef) => Uint8Array;
  replay: (phase: ReleasePhase, ref: ReleaseRef) => ReplayedReleasePhase;
  /** Canonical exact-release-plan replay, including all tarball integrity checks. */
  replayPlan: (ref: ReleaseRef) => { source: ReleaseSource; version: string; packages: string[]; errors: string[] };
  /** Authenticate raw registry HTTP observations and their collection command. */
  replayRegistry: (ref: ReleaseRef) => string[];
  /** Replay the complete required pre-review gate inventory, excluding only
   * review/publication descendants to avoid a circular release dependency. */
  replayMachineReadiness: (source: ReleaseSource, before: number) => string[];
}
const sourceEqual = (a: ReleaseSource, b: ReleaseSource) => !!a && !!b &&
  (['commit','tree','lockfileSha256','fingerprint'] as const).every(key => a[key] === b[key]);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const phases: ReleasePhase[] = ['baseline','source-audit','packages','capture','gallery','review','preflight','publish','registry','origin','github'];
const commands: Partial<Record<ReleasePhase, string[][]>> = {
  baseline: [['pnpm','typecheck'],['pnpm','test:unit'],['pnpm','test:integration'],['pnpm','test:browser'],['pnpm','build']],
  registry: [['pnpm','verify:package-install-smoke:fresh'],['pnpm','verify:package-provenance'],['pnpm','exec','vitest','run','tests/unit/package-dist']],
};
const exact = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
export function validateReleaseSequence(value: ReleaseSequence, expected: ReleaseSource, context: ReleaseReplayContext): string[] {
  const errors: string[] = [];
  const read = (ref: ReleaseRef) => {
    if (!ref || !ref.path || ref.path.startsWith('/') || ref.path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error('invalid release reference');
    const bytes = context.read(ref); if (hash(bytes) !== ref.sha256) throw Error(`release artifact hash mismatch: ${ref.path}`); return bytes;
  };
  try {
    if (value.schema !== 'muse301-release-sequence/v1' || !sourceEqual(value.source,expected)) errors.push('release sequence source/schema mismatch');
    read(value.releasePlan);
    const plan = context.replayPlan(value.releasePlan);
    if (plan.errors.length || !sourceEqual(plan.source,expected) || plan.version !== '3.0.1' || plan.packages.length !== 29 || new Set(plan.packages).size !== 29) errors.push('invalid canonical frozen release plan');
    const observations = new Map<ReleasePhase, ReplayedReleasePhase[]>();
    const seen = new Set<string>();
    for (const phase of phases) {
      const refs = value.phases?.[phase];
      if (!Array.isArray(refs) || !refs.length) { errors.push(`missing release phase: ${phase}`); continue; }
      const rows: ReplayedReleasePhase[] = [];
      for (const ref of refs) {
        read(ref);
        if (seen.has(ref.path)) errors.push(`reused release receipt: ${ref.path}`); seen.add(ref.path);
        const row = context.replay(phase,ref); rows.push(row);
        if (row.errors.length || !sourceEqual(row.source,expected)) errors.push(`canonical ${phase} replay/source failed: ${ref.path}`);
        const start = Date.parse(row.startedAt), end = Date.parse(row.endedAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end > context.now) errors.push(`invalid ${phase} timestamps`);
        if (!Array.isArray(row.command) || !row.command.length) errors.push(`missing ${phase} observed command`);
      }
      observations.set(phase,rows);
      for (const command of commands[phase] ?? []) if (!rows.some(row => exact(row.command,command))) errors.push(`missing exact ${phase} command: ${command.join(' ')}`);
    }
    const before = (earlier: ReleasePhase, later: ReleasePhase) => {
      const left = observations.get(earlier) ?? [], right = observations.get(later) ?? [];
      if (left.length && right.length && Math.max(...left.map(row => Date.parse(row.endedAt))) > Math.min(...right.map(row => Date.parse(row.startedAt)))) errors.push(`${earlier} must finish before ${later}`);
    };
    for (const phase of ['baseline','source-audit','packages'] as const) before(phase,'capture');
    for (const [a,b] of [['capture','gallery'],['gallery','review'],['review','publish'],['preflight','publish'],['packages','preflight'],['publish','registry'],['registry','origin'],['origin','github']] as [ReleasePhase,ReleasePhase][]) before(a,b);
    const captureStart = Math.min(...(observations.get('capture') ?? []).map(row => Date.parse(row.startedAt)));
    if (!Number.isFinite(captureStart) || context.replayMachineReadiness(expected,captureStart).length) errors.push('full machine readiness not established before final capture');
    const captureHashes = new Set((observations.get('capture') ?? []).flatMap(row => row.facts?.artifactHashes ?? []));
    if (!captureHashes.size) errors.push('missing exact captured artifact hashes');
    for (const phase of ['gallery','review'] as const) {
      const bound = new Set((observations.get(phase) ?? []).flatMap(row => row.facts?.artifactHashes ?? []));
      if (bound.size !== captureHashes.size || [...captureHashes].some(h => !bound.has(h))) errors.push(`${phase} does not bind exact final captures`);
    }
    for (const row of observations.get('review') ?? []) if (!row.facts?.reviewerIdentity?.trim() || row.facts.independent !== true || row.facts.decision !== 'approved') errors.push('missing actual independent approved review');
    const publisher = ['node','tools/release/publish-all.mjs','--from-plan',value.releasePlan.path];
    if (!(observations.get('preflight') ?? []).some(row => exact(row.command,[...publisher,'--dry-run']))) errors.push('missing exact frozen-plan dry-run command');
    if (!(observations.get('publish') ?? []).some(row => exact(row.command,publisher))) errors.push('missing exact frozen-plan publication command');
    for (const phase of ['publish','registry'] as const) {
      const names = (observations.get(phase) ?? []).flatMap(row => row.facts?.publishedPackages ?? []);
      if (new Set(names).size !== 29 || plan.packages.some(name => !names.includes(name))) errors.push(`${phase} does not verify all 29 planned packages`);
    }
    for (const row of observations.get('github') ?? []) {
      if (row.facts?.tagCommit !== expected.commit) errors.push('release tag differs from validated commit');
      if (!row.facts?.benchmarkRound?.trim()) errors.push('release lacks canonical passing benchmark round');
    }
    const decode = (ref: ReleaseRef) => JSON.parse(Buffer.from(read(ref)).toString('utf8'));
    const prior = decode(value.registryBefore), subsequent = decode(value.registryAfter);
    if (context.replayRegistry(value.registryBefore).length || context.replayRegistry(value.registryAfter).length) errors.push('canonical registry observation replay failed');
    errors.push(...validateRegistryPreservation(prior,subsequent,plan.packages));
    const preflightStart = Math.min(...(observations.get('preflight') ?? []).map(row => Date.parse(row.startedAt)));
    const publicationEnd = Math.max(...(observations.get('publish') ?? []).map(row => Date.parse(row.endedAt)));
    if (Date.parse(prior.observedAt) > preflightStart || Date.parse(subsequent.observedAt) < publicationEnd || Date.parse(subsequent.observedAt) > context.now) errors.push('registry observations do not bracket publication');
  } catch (error) { errors.push(`release sequence replay failed: ${String(error)}`); }
  return errors;
}

export interface RegistrySnapshot {
  observedAt: string;
  packages: Record<string, { versions: Record<string, { deprecated?: string; dist: unknown }>; distTags: Record<string,string> }>;
}
/** Compare retained registry observations: old version metadata and non-latest tags
 * must remain byte-equivalent as JSON values. Do not invoke legacy deprecation code. */
export function validateRegistryPreservation(before: RegistrySnapshot, after: RegistrySnapshot, packageNames: string[]): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(Date.parse(before?.observedAt)) || !Number.isFinite(Date.parse(after?.observedAt)) || Date.parse(before.observedAt) >= Date.parse(after.observedAt)) errors.push('invalid registry observation order');
  if (Object.keys(before?.packages ?? {}).length !== 29 || Object.keys(after?.packages ?? {}).length !== 29 || packageNames.length !== 29) errors.push('registry observations must cover all 29 packages');
  for (const name of packageNames) {
    const previous = before?.packages?.[name], current = after?.packages?.[name];
    if (!previous || !current) { errors.push(`missing registry observations: ${name}`); continue; }
    if (previous.versions['3.0.1']) errors.push(`preflight target already published: ${name}`);
    if (!current.versions['3.0.1'] || current.versions['3.0.1'].deprecated || current.distTags.latest !== '3.0.1') errors.push(`invalid published target: ${name}`);
    for (const [version,metadata] of Object.entries(previous.versions)) if (!isDeepStrictEqual(current.versions[version],metadata)) errors.push(`historical version mutated: ${name}@${version}`);
    for (const version of Object.keys(current.versions)) if (version !== '3.0.1' && !previous.versions[version]) errors.push(`unexpected version published: ${name}@${version}`);
    for (const tag of new Set([...Object.keys(previous.distTags),...Object.keys(current.distTags)])) if (tag !== 'latest' && previous.distTags[tag] !== current.distTags[tag]) errors.push(`historical dist-tag mutated: ${name}:${tag}`);
  }
  return errors;
}

/** Pre-publication L01 contract, independent of later review/registry evidence.
 * Keeping this separate prevents requiring publication to prove permission to ship. */
export function validateReleasePreflight(value: Pick<ReleaseSequence,'schema'|'source'|'releasePlan'> & {
  packages: ReleaseRef; preflight: ReleaseRef;
}, expected: ReleaseSource, context: Pick<ReleaseReplayContext,'read'|'replayPlan'|'replay'|'now'>): string[] {
  const errors: string[] = [];
  try {
    for (const ref of [value.releasePlan,value.packages,value.preflight]) {
      if (!ref?.path || ref.path.startsWith('/') || ref.path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(ref.sha256) || hash(context.read(ref)) !== ref.sha256) errors.push('invalid preflight artifact binding');
    }
    if (value.schema !== 'muse301-release-sequence/v1' || !sourceEqual(value.source,expected)) errors.push('preflight source/schema mismatch');
    const plan = context.replayPlan(value.releasePlan);
    if (plan.errors.length || !sourceEqual(plan.source,expected) || plan.version !== '3.0.1' || plan.packages.length !== 29 || new Set(plan.packages).size !== 29) errors.push('invalid canonical preflight plan');
    const packages = context.replay('packages',value.packages), preflight = context.replay('preflight',value.preflight);
    for (const row of [packages,preflight]) {
      if (row.errors.length || !sourceEqual(row.source,expected)) errors.push('preflight dependency canonical replay failed');
      if (!Number.isFinite(Date.parse(row.startedAt)) || !Number.isFinite(Date.parse(row.endedAt)) || Date.parse(row.startedAt) > Date.parse(row.endedAt) || Date.parse(row.endedAt) > context.now) errors.push('invalid preflight dependency timestamps');
    }
    if (Date.parse(packages.endedAt) > Date.parse(preflight.startedAt)) errors.push('package validation must precede preflight');
    if (!exact(preflight.command,['node','tools/release/publish-all.mjs','--from-plan',value.releasePlan.path,'--dry-run'])) errors.push('missing exact frozen-plan dry-run command');
  } catch (error) { errors.push(`preflight replay failed: ${String(error)}`); }
  return errors;
}

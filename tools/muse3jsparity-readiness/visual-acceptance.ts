/** Numerical comparisons do not substitute for independent review of exact captures. */
export const VISUAL_FAMILIES = ['bloom', 'night-lighting', 'water-reflections', 'decals', 'sdf-text', 'particles', 'camera-game-feel'] as const;
export type VisualFamily = typeof VISUAL_FAMILIES[number];
/** Required feature-specific quality dimensions; visibility alone is not quality. */
export const REQUIRED_VISUAL_QUALITY_METRIC: Readonly<Record<VisualFamily, string>> = { bloom: 'clipping', 'night-lighting': 'shadowEdgeInstability', 'water-reflections': 'reflectionProjectionError', decals: 'footprintError', 'sdf-text': 'glyphEdgeError', particles: 'trajectoryProjectionError', 'camera-game-feel': 'temporalJerk' };
export type ComparisonVerdict = 'win' | 'tie' | 'loss' | 'inconclusive';
export interface VisualMetricContract {
  readonly id: string;
  readonly direction: 'higher' | 'lower';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly tieTolerance: number;
}
export interface VisualObservation {
  readonly family: VisualFamily;
  readonly workloadFingerprint: string;
  readonly opponentWorkloadFingerprint: string;
  readonly aura: Readonly<Record<string, number>>;
  readonly three: Readonly<Record<string, number>>;
  readonly controls: { readonly auraEnabledVsDisabled: number; readonly threeEnabledVsDisabled: number; readonly brokenRejected: boolean };
}
export interface VisualContract {
  readonly family: VisualFamily;
  readonly workloadFingerprint: string;
  readonly minimumEffectDelta: number;
  readonly metrics: readonly VisualMetricContract[];
}
export interface VisualOutcome { readonly family: VisualFamily; readonly verdict: ComparisonVerdict; readonly reasons: readonly string[] }

export function evaluateVisualWorkload(contract: VisualContract, observation: VisualObservation): VisualOutcome {
  const reasons: string[] = [];
  const invalid = (reason: string): VisualOutcome => ({ family: contract.family, verdict: 'inconclusive', reasons: [reason] });
  if (!(VISUAL_FAMILIES as readonly string[]).includes(contract.family)) return invalid('Unknown visual family');
  if (observation.family !== contract.family || !contract.workloadFingerprint || observation.workloadFingerprint !== contract.workloadFingerprint || observation.opponentWorkloadFingerprint !== contract.workloadFingerprint) return invalid('Workload definitions differ or fingerprint is absent');
  if (!Number.isFinite(contract.minimumEffectDelta) || contract.minimumEffectDelta <= 0 || !observation.controls.brokenRejected || ![observation.controls.auraEnabledVsDisabled, observation.controls.threeEnabledVsDisabled].every(v => Number.isFinite(v) && v >= contract.minimumEffectDelta)) return invalid('Disabled/broken effect controls failed');
  if (!contract.metrics.some(metric => metric.id === REQUIRED_VISUAL_QUALITY_METRIC[contract.family])) return invalid('Missing feature-specific quality metric');
  if (contract.metrics.length === 0 || new Set(contract.metrics.map(m => m.id)).size !== contract.metrics.length) return invalid('Missing or duplicate metric contracts');
  let wins = 0;
  let losses = 0;
  for (const metric of contract.metrics) {
    const aura = observation.aura[metric.id];
    const three = observation.three[metric.id];
    if (!metric.id || (metric.minimum === undefined && metric.maximum === undefined)) return invalid('Metric requires a named predeclared quality target');
    if (!['higher', 'lower'].includes(metric.direction)) return invalid(`Invalid metric direction ${metric.id}`);
    if (aura === undefined || three === undefined || !Number.isFinite(aura) || !Number.isFinite(three) || !Number.isFinite(metric.tieTolerance) || metric.tieTolerance < 0 || (metric.minimum !== undefined && !Number.isFinite(metric.minimum)) || (metric.maximum !== undefined && !Number.isFinite(metric.maximum)) || (metric.minimum !== undefined && metric.maximum !== undefined && metric.minimum > metric.maximum)) return invalid(`Invalid/missing metric ${metric.id}`);
    if ((metric.minimum !== undefined && aura < metric.minimum) || (metric.maximum !== undefined && aura > metric.maximum)) { losses++; reasons.push(`${metric.id}: Aura misses predeclared quality target`); continue; }
    const advantage = (aura - three) * (metric.direction === 'higher' ? 1 : -1);
    if (advantage > metric.tieTolerance) { wins++; reasons.push(`${metric.id}: win`); }
    else if (advantage < -metric.tieTolerance) { losses++; reasons.push(`${metric.id}: loss`); }
    else reasons.push(`${metric.id}: tie`);
  }
  // A win in one dimension must never conceal a loss in another.
  return { family: contract.family, verdict: losses > 0 ? 'loss' : wins > 0 ? 'win' : 'tie', reasons };
}

export function evaluateVisualMatrix(contracts: readonly VisualContract[], observations: readonly VisualObservation[]): { readonly complete: boolean; readonly outcomes: readonly VisualOutcome[]; readonly errors: readonly string[] } {
  const errors: string[] = [];
  for (const family of VISUAL_FAMILIES) {
    if (contracts.filter(c => c.family === family).length !== 1) errors.push(`${family}: expected exactly one frozen contract`);
    if (observations.filter(o => o.family === family).length !== 1) errors.push(`${family}: expected exactly one paired observation`);
  }
  if (contracts.length !== VISUAL_FAMILIES.length || observations.length !== VISUAL_FAMILIES.length) errors.push('Unexpected matrix cardinality');
  const outcomes = contracts.flatMap(c => { const matches = observations.filter(o => o.family === c.family); return matches.length === 1 ? [evaluateVisualWorkload(c, matches[0]!)] : []; });
  return { complete: errors.length === 0 && outcomes.every(o => o.verdict !== 'inconclusive'), outcomes, errors };
}

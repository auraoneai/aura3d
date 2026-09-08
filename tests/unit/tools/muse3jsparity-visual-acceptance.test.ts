import { describe, expect, it } from 'vitest';
import { evaluateVisualMatrix, evaluateVisualWorkload, VISUAL_FAMILIES, REQUIRED_VISUAL_QUALITY_METRIC, type VisualContract, type VisualObservation } from '../../../tools/muse3jsparity-readiness/visual-acceptance';
const contract: VisualContract = { family: 'bloom', workloadFingerprint: 'frozen', minimumEffectDelta: 1, metrics: [{ id: 'clipping', direction: 'lower', maximum: 0.1, tieTolerance: 0.001 }] };
const observation: VisualObservation = { family: 'bloom', workloadFingerprint: 'frozen', opponentWorkloadFingerprint: 'frozen', aura: { clipping: 0.02 }, three: { clipping: 0.05 }, controls: { auraEnabledVsDisabled: 2, threeEnabledVsDisabled: 2, brokenRejected: true } };
describe('3.0.1 actual paired visual acceptance', () => {
  it('reports numerical wins without manufacturing independent review', () => expect(evaluateVisualWorkload(contract, observation).verdict).toBe('win'));
  it('discloses quality losses even when the opponent is worse', () => expect(evaluateVisualWorkload(contract, { ...observation, aura: { clipping: 0.2 }, three: { clipping: 0.3 } }).verdict).toBe('loss'));
  it('rejects mismatched workloads', () => expect(evaluateVisualWorkload(contract, { ...observation, opponentWorkloadFingerprint: 'cheaper' }).verdict).toBe('inconclusive'));
  it('rejects disabled effects and ineffective negative controls', () => {
    expect(evaluateVisualWorkload(contract, { ...observation, controls: { ...observation.controls, auraEnabledVsDisabled: 0 } }).verdict).toBe('inconclusive');
    expect(evaluateVisualWorkload(contract, { ...observation, controls: { ...observation.controls, brokenRejected: false } }).verdict).toBe('inconclusive');
  });
  it('rejects missing/nonfinite observations and invalid thresholds', () => {
    expect(evaluateVisualWorkload(contract, { ...observation, aura: {} }).verdict).toBe('inconclusive');
    expect(evaluateVisualWorkload(contract, { ...observation, aura: { clipping: NaN } }).verdict).toBe('inconclusive');
    expect(evaluateVisualWorkload({ ...contract, metrics: [{ ...contract.metrics[0]!, tieTolerance: -1 }] }, observation).verdict).toBe('inconclusive');
  });
  it('rejects malformed JSON contracts rather than assigning a default direction', () => {
    expect(evaluateVisualWorkload({ ...contract, family: 'invented' } as unknown as VisualContract, { ...observation, family: 'invented' } as unknown as VisualObservation).verdict).toBe('inconclusive');
    expect(evaluateVisualWorkload({ ...contract, metrics: [{ ...contract.metrics[0]!, direction: 'unknown' }] } as unknown as VisualContract, observation).verdict).toBe('inconclusive');
  });
  it('rejects missing absolute quality targets', () => {
    expect(evaluateVisualWorkload({ ...contract, metrics: [{ id: 'clipping', direction: 'lower', tieTolerance: 0.01 }] }, observation).verdict).toBe('inconclusive');
  });
  it('never turns a partial matrix into full coverage', () => expect(evaluateVisualMatrix([contract], [observation]).complete).toBe(false));
  it('rejects duplicates and preserves losses in complete datasets', () => {
    const contracts = VISUAL_FAMILIES.map(family => ({ ...contract, family, metrics: [{ ...contract.metrics[0]!, id: REQUIRED_VISUAL_QUALITY_METRIC[family] }] }));
    const observations = VISUAL_FAMILIES.map(family => ({ ...observation, family, aura: { [REQUIRED_VISUAL_QUALITY_METRIC[family]]: 0.02 }, three: { [REQUIRED_VISUAL_QUALITY_METRIC[family]]: 0.05 } }));
    expect(evaluateVisualMatrix(contracts, observations).complete).toBe(true);
    expect(evaluateVisualMatrix(contracts, [...observations, observation]).complete).toBe(false);
    observations[0] = { ...observation, aura: { clipping: 0.2 } };
    expect(evaluateVisualMatrix(contracts, observations).outcomes[0]!.verdict).toBe('loss');
  });
});

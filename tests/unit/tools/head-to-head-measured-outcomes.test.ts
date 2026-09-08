import { expect, it } from 'vitest';
import { measuredDeployOutcome } from '../../../tools/head-to-head-current-aggregate/measured-outcomes';
it('derives current byte savings instead of retaining historical constants', () => {
  const result = measuredDeployOutcome({ aura: { javascriptBytes: 80, totalDeployBytes: 180 }, three: { javascriptBytes: 100, totalDeployBytes: 200 } });
  expect(result.verdict).toBe('win');
  expect(result.magnitude).toEqual({ javascriptBytesSmaller: 20, javascriptPercentSmaller: 20, totalBytesSmaller: 20, totalPercentSmaller: 10 });
});
it('discloses regression in either measured dimension', () => expect(measuredDeployOutcome({ aura: { javascriptBytes: 80, totalDeployBytes: 220 }, three: { javascriptBytes: 100, totalDeployBytes: 200 } }).verdict).toBe('loss'));
it('does not manufacture a win for identical artifacts', () => expect(measuredDeployOutcome({ aura: { javascriptBytes: 100, totalDeployBytes: 200 }, three: { javascriptBytes: 100, totalDeployBytes: 200 } }).verdict).toBe('parity'));
it('rejects absent or invalid measurements', () => {
  expect(() => measuredDeployOutcome(undefined)).toThrow();
  expect(() => measuredDeployOutcome({ aura: { javascriptBytes: NaN, totalDeployBytes: 200 }, three: { javascriptBytes: 100, totalDeployBytes: 200 } })).toThrow();
});

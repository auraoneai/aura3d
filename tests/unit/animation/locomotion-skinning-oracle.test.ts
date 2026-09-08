import { describe, expect, it } from 'vitest';
import { runSkinningOracle, validateSkinningOracleInput, type SkinningOracleInput } from '../../browser/locomotion-skinning-oracle.js';

const input = (): SkinningOracleInput => ({
  position: [1, 2, 3], joints: [0, 0, 0, 0], weights: [1, 0, 0, 0],
  matrices: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  modelMatrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], expectedWorldPosition: [1,2,3],
});
describe('native skinning oracle input contract (GPU execution requires browser)', () => {
  it('accepts four and eight lanes without renormalizing their submitted values', () => {
    expect(() => validateSkinningOracleInput(input())).not.toThrow();
    expect(() => validateSkinningOracleInput({ ...input(), joints: Array(8).fill(0), weights: [0.1,0.2,0.3,0.4,0,0,0,0] })).not.toThrow();
  });
  it.each([
    { weights: [0.5,0,0,0] }, { weights: [2,-1,0,0] }, { joints: [1,0,0,0] },
    { joints: [0.5,0,0,0] }, { matrices: [1,2,3] }, { position: [NaN,0,0] },
    { morphPosition: [1,2] }, { expectedWorldPosition: [Infinity,0,0] },
  ])('rejects invalid evidence before issuing GPU calls: %j', patch => {
    expect(() => runSkinningOracle({} as WebGL2RenderingContext, { ...input(), ...patch })).toThrow();
  });
  it('accepts a full 130-joint palette, including highest indexed influence', () => {
    expect(() => validateSkinningOracleInput({ ...input(), matrices: Array.from({ length: 130 }, () => input().matrices).flat(), joints: [129,0,0,0] })).not.toThrow();
  });
});

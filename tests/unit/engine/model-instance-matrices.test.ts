import { describe, expect, it } from 'vitest';
import { composeModelInstanceMatrices } from '../../../packages/engine/src/agent-api/ModelInstanceMatrices';
import { composeMat4, multiplyMat4, transformPoint, type Mat4 } from '@aura3d/scene/math';

describe('native GLB placement matches individual copies', () => {
  it('normalizes once and applies world translation before rotated, offset mesh transforms', () => {
    const mesh = composeMat4([3, 1, -2], [0, Math.SQRT1_2, 0, Math.SQRT1_2], [2, 1, .5]);
    const roots = [composeMat4([-4, .04, 3], [0, Math.SQRT1_2, 0, Math.SQRT1_2], [.054, .054, .054]), composeMat4([5, .5, -3], [0, 0, 0, 1], [.2, .3, .4])];
    const actual = composeModelInstanceMatrices(new Float32Array(roots.flat()), mesh);
    roots.forEach((root, index) => {
      const matrix = Array.from(actual.subarray(index * 16, index * 16 + 16)) as Mat4;
      const expected = multiplyMat4(root, mesh);
      for (const vertex of [[0, 0, 0], [1, 2, 3], [-2, .5, 4]] as [number, number, number][]) {
        transformPoint(matrix, vertex).forEach((component, axis) => expect(component).toBeCloseTo(transformPoint(expected, vertex)[axis]!, 5));
      }
      const broken = multiplyMat4(multiplyMat4(root, mesh), root);
      expect(transformPoint(matrix, [0, 0, 0])).not.toEqual(transformPoint(broken, [0, 0, 0]));
    });
  });
  it('preserves distinct authored mesh transforms in one multi-mesh GLB', () => {
    const roots = new Float32Array(composeMat4([4, 0, 0], [0, 0, 0, 1], [.1, .1, .1]));
    const body = composeModelInstanceMatrices(roots, composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]));
    const roof = composeModelInstanceMatrices(roots, composeMat4([0, 5, 0], [0, 0, 0, 1], [1, 1, 1]));
    expect(body[12]).toBe(4); expect(roof[12]).toBe(4); expect(roof[13]! - body[13]!).toBeCloseTo(.5);
    expect(() => composeModelInstanceMatrices(new Float32Array(17), Array(16).fill(0))).toThrow('4x4');
  });
});

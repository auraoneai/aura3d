export interface RowMajorHeightfield {
  readonly rows: number;
  readonly columns: number;
  readonly heights: readonly number[];
}

/**
 * Aura stores terrain samples row-major (`z * columns + x`). Rapier builds its
 * nalgebra height matrix from column-major bytes, so pass the transposed flat
 * layout or asymmetric terrain contacts will disagree with the authored grid.
 */
export function toRapierHeightfieldHeights(shape: RowMajorHeightfield): Float32Array {
  const expected = shape.rows * shape.columns;
  if (shape.rows < 2 || shape.columns < 2 || shape.heights.length !== expected) {
    throw new RangeError(`heightfield requires rows*columns samples (${expected}), received ${shape.heights.length}`);
  }
  const heights = new Float32Array(expected);
  for (let row = 0; row < shape.rows; row += 1) {
    for (let column = 0; column < shape.columns; column += 1) {
      heights[column * shape.rows + row] = shape.heights[row * shape.columns + column]!;
    }
  }
  return heights;
}

/** Column-major projection inverse; reject singular camera input before dispatch. */
export function invertSsrProjection(matrix: Float32Array): Float32Array {
  if (matrix.length !== 16 || matrix.some(value => !Number.isFinite(value))) throw new Error("SSR projection must contain 16 finite numbers.");
  const rows = Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => c < 4 ? matrix[c * 4 + r]! : Number(c - 4 === r)));
  for (let c = 0; c < 4; ++c) {
    let pivot = c;
    for (let r = c + 1; r < 4; ++r) if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r;
    [rows[c], rows[pivot]] = [rows[pivot]!, rows[c]!];
    const value = rows[c]![c]!;
    if (Math.abs(value) < 1e-12) throw new Error("SSR projection is singular.");
    for (let k = 0; k < 8; ++k) rows[c]![k] = rows[c]![k]! / value;
    for (let r = 0; r < 4; ++r) if (r !== c) {
      const factor = rows[r]![c]!;
      for (let k = 0; k < 8; ++k) rows[r]![k] = rows[r]![k]! - factor * rows[c]![k]!;
    }
  }
  return Float32Array.from({ length: 16 }, (_, i) => rows[i % 4]![Math.floor(i / 4) + 4]!);
}

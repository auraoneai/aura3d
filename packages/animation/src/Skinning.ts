import type { Skeleton } from "./Skeleton.js";

export type SkinningPalette = {
  readonly jointCount: number;
  readonly matrices: Float32Array;
};

export function buildSkinningPalette(skeleton: Skeleton, maxJoints = 256): SkinningPalette {
  const palette = skeleton.matrixPalette();
  if (palette.length > maxJoints) {
    throw new Error(`Skeleton has ${palette.length} joints, exceeding max ${maxJoints}.`);
  }
  const matrices = new Float32Array(palette.length * 16);
  for (let index = 0; index < palette.length; index += 1) {
    matrices.set(palette[index]!, index * 16);
  }
  return { jointCount: palette.length, matrices };
}

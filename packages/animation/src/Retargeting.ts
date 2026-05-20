import { Matrix4 } from "@galileo3d/math";

export interface RetargetBoneMap {
  readonly source: string;
  readonly target: string;
  readonly scale?: number;
}

export interface RetargetPoseInput {
  readonly sourcePose: ReadonlyMap<string, Matrix4>;
  readonly boneMap: readonly RetargetBoneMap[];
}

export function retargetPose(input: RetargetPoseInput): Map<string, Matrix4> {
  const output = new Map<string, Matrix4>();
  for (const mapping of input.boneMap) {
    const source = input.sourcePose.get(mapping.source);
    if (!source) continue;
    const elements = [...source.elements];
    const scale = mapping.scale ?? 1;
    if (scale !== 1) {
      elements[12] *= scale;
      elements[13] *= scale;
      elements[14] *= scale;
    }
    output.set(mapping.target, new Matrix4(elements as unknown as Matrix4["elements"]));
  }
  return output;
}

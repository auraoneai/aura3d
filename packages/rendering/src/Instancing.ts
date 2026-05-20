import type { InstanceVertexAttribute, RenderBuffer } from "./RenderDevice";

export interface InstanceAttributePlan {
  readonly attributes: readonly InstanceVertexAttribute[];
  readonly instanceCount: number;
}

export function createMatrixInstanceAttribute(buffer: RenderBuffer, instanceCount: number, shaderPrefix = "a_instanceMatrix"): InstanceAttributePlan {
  if (!Number.isInteger(instanceCount) || instanceCount <= 0) throw new Error("instanceCount must be a positive integer.");
  const attributes: InstanceVertexAttribute[] = [0, 1, 2, 3].map((column) => ({
    buffer,
    shaderName: `${shaderPrefix}${column}`,
    components: 4,
    stride: 64,
    offset: column * 16,
    divisor: 1
  }));
  return { attributes, instanceCount };
}

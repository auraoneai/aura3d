import type { ImportStage } from "./ImportPipeline";

export type MeshAttributeValue = number | readonly number[];

export interface MeshOptimizationInput {
  readonly vertexCount: number;
  readonly indices: readonly number[];
  readonly attributes?: Readonly<Record<string, readonly MeshAttributeValue[]>>;
}

export interface MeshOptimizationResult {
  readonly vertexCount: number;
  readonly indices: readonly number[];
  readonly attributes: Readonly<Record<string, readonly MeshAttributeValue[]>>;
  readonly remap: readonly number[];
  readonly removedVertices: number;
}

export interface MeshOptimizationStageOptions {
  readonly name?: string;
}

export function optimizeIndexedMesh(input: MeshOptimizationInput): MeshOptimizationResult {
  validateMeshOptimizationInput(input);

  const remap = new Array<number>(input.vertexCount).fill(-1);
  const usedVertices: number[] = [];
  const optimizedIndices = input.indices.map((index) => {
    let nextIndex = remap[index];
    if (nextIndex === -1) {
      nextIndex = usedVertices.length;
      remap[index] = nextIndex;
      usedVertices.push(index);
    }
    return nextIndex;
  });

  const attributes: Record<string, readonly MeshAttributeValue[]> = {};
  for (const [semantic, values] of Object.entries(input.attributes ?? {})) {
    attributes[semantic] = usedVertices.map((sourceIndex) => cloneAttributeValue(values[sourceIndex]!));
  }

  return {
    vertexCount: usedVertices.length,
    indices: optimizedIndices,
    attributes,
    remap,
    removedVertices: input.vertexCount - usedVertices.length
  };
}

export function createMeshOptimizationStage(options: MeshOptimizationStageOptions = {}): ImportStage<MeshOptimizationInput, MeshOptimizationResult> {
  return {
    name: options.name ?? "mesh-optimization",
    run: (input) => optimizeIndexedMesh(input)
  };
}

function validateMeshOptimizationInput(input: MeshOptimizationInput): void {
  if (!Number.isInteger(input.vertexCount) || input.vertexCount < 0) {
    throw new Error("Mesh optimization vertexCount must be a non-negative integer");
  }
  if (!Array.isArray(input.indices) || input.indices.length === 0) {
    throw new Error("Mesh optimization requires one or more indices");
  }
  input.indices.forEach((index, offset) => {
    if (!Number.isInteger(index) || index < 0 || index >= input.vertexCount) {
      throw new Error(`Mesh optimization index ${offset} references invalid vertex ${index}`);
    }
  });
  for (const [semantic, values] of Object.entries(input.attributes ?? {})) {
    if (!Array.isArray(values) || values.length !== input.vertexCount) {
      throw new Error(`Mesh optimization attribute ${semantic} must contain exactly ${input.vertexCount} values`);
    }
    values.forEach((value, index) => validateAttributeValue(value, semantic, index));
  }
}

function validateAttributeValue(value: MeshAttributeValue, semantic: string, index: number): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Mesh optimization attribute ${semantic}[${index}] must be finite`);
    }
    return;
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`Mesh optimization attribute ${semantic}[${index}] must be a finite scalar or numeric tuple`);
  }
}

function cloneAttributeValue(value: MeshAttributeValue): MeshAttributeValue {
  return Array.isArray(value) ? [...value] : value;
}

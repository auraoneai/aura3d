import { ValidationError } from "@galileo3d/core";

export interface RenderableDescriptor {
  geometry: string;
  material: string;
  layerMask?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  morphWeights?: readonly number[];
  instanceTransforms?: Float32Array | readonly number[];
}

export class Renderable {
  readonly geometry: string;
  readonly material: string;
  layerMask: number;
  castShadow: boolean;
  receiveShadow: boolean;
  morphWeights: number[];
  instanceTransforms?: Float32Array;

  constructor(descriptor: RenderableDescriptor) {
    if (!descriptor.geometry) throw new ValidationError("RENDERABLE_GEOMETRY", "Renderable geometry handle is required.");
    if (!descriptor.material) throw new ValidationError("RENDERABLE_MATERIAL", "Renderable material handle is required.");
    this.geometry = descriptor.geometry;
    this.material = descriptor.material;
    this.layerMask = descriptor.layerMask ?? 1;
    this.castShadow = descriptor.castShadow ?? true;
    this.receiveShadow = descriptor.receiveShadow ?? true;
    this.morphWeights = [...(descriptor.morphWeights ?? [])];
    if (descriptor.instanceTransforms !== undefined) {
      const values = Array.from(descriptor.instanceTransforms);
      if (values.length === 0 || values.length % 16 !== 0 || !values.every(Number.isFinite)) {
        throw new ValidationError("RENDERABLE_INSTANCES", "Renderable instanceTransforms must contain one or more finite mat4 values.");
      }
      this.instanceTransforms = new Float32Array(values);
    }
  }
}

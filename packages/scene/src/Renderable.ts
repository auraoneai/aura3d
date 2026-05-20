import { ValidationError } from "@galileo3d/core";

export interface RenderableDescriptor {
  geometry: string;
  material: string;
  layerMask?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  skinning?: {
    readonly jointCount: number;
    readonly matrices: Float32Array;
  };
  morphWeights?: readonly number[];
  instanceTransforms?: Float32Array | readonly number[];
  instanceColors?: Float32Array | readonly number[];
}

export class Renderable {
  readonly geometry: string;
  readonly material: string;
  layerMask: number;
  castShadow: boolean;
  receiveShadow: boolean;
  skinning?: {
    readonly jointCount: number;
    readonly matrices: Float32Array;
  };
  morphWeights: number[];
  instanceTransforms?: Float32Array;
  instanceColors?: Float32Array;

  constructor(descriptor: RenderableDescriptor) {
    if (!descriptor.geometry) throw new ValidationError("RENDERABLE_GEOMETRY", "Renderable geometry handle is required.");
    if (!descriptor.material) throw new ValidationError("RENDERABLE_MATERIAL", "Renderable material handle is required.");
    this.geometry = descriptor.geometry;
    this.material = descriptor.material;
    this.layerMask = descriptor.layerMask ?? 1;
    this.castShadow = descriptor.castShadow ?? true;
    this.receiveShadow = descriptor.receiveShadow ?? true;
    if (descriptor.skinning !== undefined) {
      if (!Number.isInteger(descriptor.skinning.jointCount) || descriptor.skinning.jointCount <= 0 || descriptor.skinning.jointCount > 64) {
        throw new ValidationError("RENDERABLE_SKINNING", "Renderable skinning jointCount must be an integer in [1, 64].");
      }
      if (descriptor.skinning.matrices.length !== descriptor.skinning.jointCount * 16 || !Array.from(descriptor.skinning.matrices).every(Number.isFinite)) {
        throw new ValidationError("RENDERABLE_SKINNING", "Renderable skinning matrices must contain one finite mat4 per joint.");
      }
      this.skinning = {
        jointCount: descriptor.skinning.jointCount,
        matrices: new Float32Array(descriptor.skinning.matrices)
      };
    }
    this.morphWeights = [...(descriptor.morphWeights ?? [])];
    if (descriptor.instanceTransforms !== undefined) {
      const values = Array.from(descriptor.instanceTransforms);
      if (values.length === 0 || values.length % 16 !== 0 || !values.every(Number.isFinite)) {
        throw new ValidationError("RENDERABLE_INSTANCES", "Renderable instanceTransforms must contain one or more finite mat4 values.");
      }
      this.instanceTransforms = new Float32Array(values);
    }
    if (descriptor.instanceColors !== undefined) {
      const values = Array.from(descriptor.instanceColors);
      if (values.length === 0 || values.length % 4 !== 0 || !values.every(Number.isFinite)) {
        throw new ValidationError("RENDERABLE_INSTANCE_COLORS", "Renderable instanceColors must contain one or more finite vec4 values.");
      }
      if (this.instanceTransforms && values.length / 4 !== this.instanceTransforms.length / 16) {
        throw new ValidationError("RENDERABLE_INSTANCE_COLORS", "Renderable instanceColors count must match instanceTransforms count.");
      }
      this.instanceColors = new Float32Array(values);
    }
  }
}

import { SceneNode, type SceneNodeOptions } from "./SceneNode.js";
import { Renderable, type RenderableDescriptor } from "./Renderable.js";
import type { Mat4, Quat, Vec3 } from "./MathTypes.js";

export interface Object3DOptions extends SceneNodeOptions {
  readonly visible?: boolean;
  readonly layerMask?: number;
  readonly renderOrder?: number;
  readonly userData?: Record<string, unknown>;
}

export class Object3D extends SceneNode {
  readonly isObject3D = true;

  constructor(options: Object3DOptions = {}) {
    super(options);
    applyObject3DOptions(this, options);
  }

  get position(): Vec3 {
    return this.transform.position;
  }

  get quaternion(): Quat {
    return this.transform.rotation;
  }

  get scale(): Vec3 {
    return this.transform.scale;
  }

  get matrix(): Mat4 {
    return this.transform.localMatrix;
  }

  get matrixWorld(): Mat4 {
    return this.transform.worldMatrix;
  }

  get matrixAutoUpdate(): boolean {
    return this.transform.matrixAutoUpdate;
  }

  set matrixAutoUpdate(enabled: boolean) {
    this.transform.setMatrixAutoUpdate(enabled);
  }

  setLocalMatrix(matrix: Mat4, options: { readonly decompose?: boolean; readonly matrixAutoUpdate?: boolean } = {}): this {
    this.transform.setLocalMatrix(matrix, options);
    return this;
  }
}

export class Group extends Object3D {
  readonly isGroup = true;
}

export interface MeshOptions extends Object3DOptions {
  readonly renderable?: Renderable | RenderableDescriptor;
}

export class Mesh extends Object3D {
  readonly isMesh = true;

  constructor(options: MeshOptions = {}) {
    super(options);
    if (options.renderable) this.renderable = toRenderable(options.renderable);
  }

  setRenderable(renderable: Renderable | RenderableDescriptor): this {
    this.renderable = toRenderable(renderable);
    return this;
  }
}

export class SkinnedMesh extends Mesh {
  readonly isSkinnedMesh = true;

  get skinning(): Renderable["skinning"] | undefined {
    return this.renderable?.skinning;
  }

  setSkinning(skinning: NonNullable<Renderable["skinning"]>): this {
    if (!this.renderable) throw new Error("SkinnedMesh requires a renderable before skinning can be assigned.");
    this.renderable.skinning = {
      jointCount: skinning.jointCount,
      matrices: new Float32Array(skinning.matrices)
    };
    return this;
  }
}

export class InstancedMesh extends Mesh {
  readonly isInstancedMesh = true;

  get instanceTransforms(): Float32Array | undefined {
    return this.renderable?.instanceTransforms;
  }

  get instanceColors(): Float32Array | undefined {
    return this.renderable?.instanceColors;
  }

  setInstanceTransforms(transforms: Float32Array | readonly number[]): this {
    if (!this.renderable) throw new Error("InstancedMesh requires a renderable before instance transforms can be assigned.");
    this.renderable.instanceTransforms = new Renderable({
      geometry: this.renderable.geometry,
      material: this.renderable.material,
      layerMask: this.renderable.layerMask,
      castShadow: this.renderable.castShadow,
      receiveShadow: this.renderable.receiveShadow,
      skinning: this.renderable.skinning,
      morphWeights: this.renderable.morphWeights,
      instanceTransforms: transforms,
      instanceColors: this.renderable.instanceColors
    }).instanceTransforms;
    return this;
  }

  setInstanceColors(colors: Float32Array | readonly number[]): this {
    if (!this.renderable) throw new Error("InstancedMesh requires a renderable before instance colors can be assigned.");
    this.renderable.instanceColors = new Renderable({
      geometry: this.renderable.geometry,
      material: this.renderable.material,
      layerMask: this.renderable.layerMask,
      castShadow: this.renderable.castShadow,
      receiveShadow: this.renderable.receiveShadow,
      skinning: this.renderable.skinning,
      morphWeights: this.renderable.morphWeights,
      instanceTransforms: this.renderable.instanceTransforms,
      instanceColors: colors
    }).instanceColors;
    return this;
  }
}

function applyObject3DOptions(node: SceneNode, options: Object3DOptions): void {
  if (options.visible !== undefined) node.visible = options.visible;
  if (options.layerMask !== undefined) node.layerMask = options.layerMask;
  if (options.renderOrder !== undefined) {
    if (!Number.isFinite(options.renderOrder)) throw new Error("Object3D renderOrder must be finite.");
    node.renderOrder = options.renderOrder;
  }
  if (options.userData) node.userData = { ...options.userData };
}

function toRenderable(renderable: Renderable | RenderableDescriptor): Renderable {
  return renderable instanceof Renderable ? renderable : new Renderable(renderable);
}

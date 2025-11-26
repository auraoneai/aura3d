/**
 * Skeletal animation system with bone hierarchy and skinning matrices.
 * Supports GPU skinning with bone transforms and inverse bind matrices.
 * @module animation/Skeleton
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Matrix4 } from '../math/Matrix4';

/**
 * Single bone in skeletal hierarchy.
 *
 * @example
 * ```typescript
 * const bone: Bone = {
 *   name: 'spine',
 *   parentIndex: 0,
 *   position: new Vector3(0, 1, 0),
 *   rotation: Quaternion.identity(),
 *   scale: Vector3.one()
 * };
 * ```
 */
export interface Bone {
  /** Bone name for identification */
  name: string;
  /** Parent bone index (-1 for root) */
  parentIndex: number;
  /** Local position relative to parent */
  position: Vector3;
  /** Local rotation relative to parent */
  rotation: Quaternion;
  /** Local scale relative to parent */
  scale: Vector3;
}

/**
 * Skeleton configuration for creation.
 */
export interface SkeletonConfig {
  /** Skeleton name */
  name?: string;
  /** Array of bones in hierarchy order */
  bones: Bone[];
  /** Inverse bind matrices for skinning (optional, computed if not provided) */
  inverseBindMatrices?: Matrix4[];
}

/**
 * Skeletal animation system with bone hierarchy.
 * Manages bone transforms and generates skinning matrices for GPU skinning.
 *
 * @example
 * ```typescript
 * // Create skeleton
 * const skeleton = new Skeleton({
 *   name: 'Character',
 *   bones: [
 *     { name: 'root', parentIndex: -1, position: Vector3.zero(), rotation: Quaternion.identity(), scale: Vector3.one() },
 *     { name: 'spine', parentIndex: 0, position: new Vector3(0, 1, 0), rotation: Quaternion.identity(), scale: Vector3.one() },
 *     { name: 'head', parentIndex: 1, position: new Vector3(0, 0.5, 0), rotation: Quaternion.identity(), scale: Vector3.one() }
 *   ]
 * });
 *
 * // Apply animation pose
 * skeleton.setBoneRotation('spine', Quaternion.fromAxisAngle(Vector3.forward(), Math.PI / 8));
 *
 * // Update transforms
 * skeleton.update();
 *
 * // Get skinning matrices for GPU
 * const matrices = skeleton.getSkinningMatrices();
 * gl.uniformMatrix4fv(boneMatricesUniform, false, matrices);
 * ```
 */
export class Skeleton {
  /**
   * Skeleton name for identification.
   */
  readonly name: string;

  /**
   * Bones in hierarchy order.
   */
  private bones: Bone[];

  /**
   * Bind pose (initial bone transforms).
   */
  private bindPose: Bone[];

  /**
   * Inverse bind matrices for skinning.
   */
  private inverseBindMatrices: Matrix4[];

  /**
   * Local transform matrices for each bone.
   */
  private localMatrices: Matrix4[];

  /**
   * World transform matrices for each bone.
   */
  private worldMatrices: Matrix4[];

  /**
   * Final skinning matrices (worldMatrix * inverseBindMatrix).
   */
  private skinningMatrices: Matrix4[];

  /**
   * Flat array of skinning matrix elements for GPU upload.
   */
  private skinningMatrixArray: Float32Array;

  /**
   * Bone name to index map for fast lookup.
   */
  private boneMap: Map<string, number>;

  /**
   * Whether transforms need updating.
   */
  private dirty: boolean;

  /**
   * Creates a new skeleton.
   *
   * @param config - Skeleton configuration
   *
   * @example
   * ```typescript
   * const skeleton = new Skeleton({
   *   name: 'Character',
   *   bones: boneArray
   * });
   * ```
   */
  constructor(config: SkeletonConfig) {
    this.name = config.name ?? 'Skeleton';
    this.bones = config.bones;
    this.bindPose = this.cloneBones(config.bones);

    const boneCount = this.bones.length;

    // Initialize matrices
    this.localMatrices = new Array(boneCount);
    this.worldMatrices = new Array(boneCount);
    this.skinningMatrices = new Array(boneCount);

    for (let i = 0; i < boneCount; i++) {
      this.localMatrices[i] = new Matrix4();
      this.worldMatrices[i] = new Matrix4();
      this.skinningMatrices[i] = new Matrix4();
    }

    // Compute or use provided inverse bind matrices
    if (config.inverseBindMatrices) {
      this.inverseBindMatrices = config.inverseBindMatrices;
    } else {
      this.inverseBindMatrices = new Array(boneCount);
      this.computeInverseBindMatrices();
    }

    // Create flat array for GPU upload (16 floats per matrix)
    this.skinningMatrixArray = new Float32Array(boneCount * 16);

    // Build bone name map
    this.boneMap = new Map();
    for (let i = 0; i < boneCount; i++) {
      this.boneMap.set(this.bones[i].name, i);
    }

    this.dirty = true;
  }

  /**
   * Gets a bone by name.
   *
   * @param name - Bone name
   * @returns Bone or undefined if not found
   *
   * @example
   * ```typescript
   * const spine = skeleton.getBone('spine');
   * if (spine) {
   *   console.log(`Spine position: ${spine.position}`);
   * }
   * ```
   */
  getBone(name: string): Bone | undefined {
    const index = this.boneMap.get(name);
    return index !== undefined ? this.bones[index] : undefined;
  }

  /**
   * Gets a bone by index.
   *
   * @param index - Bone index
   * @returns Bone or undefined if index out of bounds
   *
   * @example
   * ```typescript
   * const root = skeleton.getBoneByIndex(0);
   * ```
   */
  getBoneByIndex(index: number): Bone | undefined {
    return this.bones[index];
  }

  /**
   * Gets bone index by name.
   *
   * @param name - Bone name
   * @returns Bone index or -1 if not found
   *
   * @example
   * ```typescript
   * const spineIndex = skeleton.getBoneIndex('spine');
   * ```
   */
  getBoneIndex(name: string): number {
    return this.boneMap.get(name) ?? -1;
  }

  /**
   * Gets the number of bones in this skeleton.
   *
   * @returns Bone count
   *
   * @example
   * ```typescript
   * console.log(`Skeleton has ${skeleton.boneCount} bones`);
   * ```
   */
  get boneCount(): number {
    return this.bones.length;
  }

  /**
   * Gets all bones (read-only).
   *
   * @returns Array of bones
   *
   * @example
   * ```typescript
   * for (const bone of skeleton.getBones()) {
   *   console.log(`Bone: ${bone.name}`);
   * }
   * ```
   */
  getBones(): ReadonlyArray<Bone> {
    return this.bones;
  }

  /**
   * Sets bone position in local space.
   *
   * @param name - Bone name
   * @param position - Local position
   * @returns True if bone was found
   *
   * @example
   * ```typescript
   * skeleton.setBonePosition('hand_R', new Vector3(1, 0, 0));
   * ```
   */
  setBonePosition(name: string, position: Vector3): boolean {
    const index = this.boneMap.get(name);
    if (index === undefined) return false;

    this.bones[index].position.copy(position);
    this.dirty = true;
    return true;
  }

  /**
   * Sets bone rotation in local space.
   *
   * @param name - Bone name
   * @param rotation - Local rotation
   * @returns True if bone was found
   *
   * @example
   * ```typescript
   * skeleton.setBoneRotation('spine', Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4));
   * ```
   */
  setBoneRotation(name: string, rotation: Quaternion): boolean {
    const index = this.boneMap.get(name);
    if (index === undefined) return false;

    this.bones[index].rotation.copy(rotation);
    this.dirty = true;
    return true;
  }

  /**
   * Sets bone scale in local space.
   *
   * @param name - Bone name
   * @param scale - Local scale
   * @returns True if bone was found
   *
   * @example
   * ```typescript
   * skeleton.setBoneScale('head', new Vector3(1.2, 1.2, 1.2));
   * ```
   */
  setBoneScale(name: string, scale: Vector3): boolean {
    const index = this.boneMap.get(name);
    if (index === undefined) return false;

    this.bones[index].scale.copy(scale);
    this.dirty = true;
    return true;
  }

  /**
   * Resets skeleton to bind pose.
   *
   * @example
   * ```typescript
   * skeleton.resetToBindPose();
   * ```
   */
  resetToBindPose(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      const bindBone = this.bindPose[i];

      bone.position.copy(bindBone.position);
      bone.rotation.copy(bindBone.rotation);
      bone.scale.copy(bindBone.scale);
    }

    this.dirty = true;
  }

  /**
   * Updates all bone transforms.
   * Call this after modifying bone transforms and before rendering.
   *
   * @param force - Force update even if not dirty (default: false)
   *
   * @example
   * ```typescript
   * // Apply animation
   * skeleton.setBoneRotation('arm_L', newRotation);
   *
   * // Update transforms
   * skeleton.update();
   *
   * // Use skinning matrices
   * const matrices = skeleton.getSkinningMatrices();
   * ```
   */
  update(force: boolean = false): void {
    if (!this.dirty && !force) {
      return;
    }

    // Update local matrices
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      this.localMatrices[i].compose(bone.position, bone.rotation, bone.scale);
    }

    // Update world matrices (breadth-first traversal)
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];

      if (bone.parentIndex === -1) {
        // Root bone
        this.worldMatrices[i].copy(this.localMatrices[i]);
      } else {
        // Child bone: worldMatrix = parentWorldMatrix * localMatrix
        this.worldMatrices[i]
          .copy(this.worldMatrices[bone.parentIndex])
          .multiplyInPlace(this.localMatrices[i]);
      }
    }

    // Update skinning matrices: skinningMatrix = worldMatrix * inverseBindMatrix
    for (let i = 0; i < this.bones.length; i++) {
      this.skinningMatrices[i]
        .copy(this.worldMatrices[i])
        .multiplyInPlace(this.inverseBindMatrices[i]);
    }

    // Update flat array for GPU upload
    for (let i = 0; i < this.bones.length; i++) {
      const matrix = this.skinningMatrices[i];
      const offset = i * 16;
      for (let j = 0; j < 16; j++) {
        this.skinningMatrixArray[offset + j] = matrix.elements[j];
      }
    }

    this.dirty = false;
  }

  /**
   * Gets skinning matrices as flat Float32Array for GPU upload.
   *
   * @returns Flat array of matrix elements
   *
   * @example
   * ```typescript
   * const matrices = skeleton.getSkinningMatrices();
   * gl.uniformMatrix4fv(boneMatricesLocation, false, matrices);
   * ```
   */
  getSkinningMatrices(): Float32Array {
    if (this.dirty) {
      this.update();
    }
    return this.skinningMatrixArray;
  }

  /**
   * Gets world matrix for a bone by name.
   *
   * @param name - Bone name
   * @returns World matrix or undefined if bone not found
   *
   * @example
   * ```typescript
   * const spineWorld = skeleton.getWorldMatrix('spine');
   * if (spineWorld) {
   *   const worldPos = spineWorld.getPosition();
   * }
   * ```
   */
  getWorldMatrix(name: string): Matrix4 | undefined {
    const index = this.boneMap.get(name);
    if (index === undefined) return undefined;

    if (this.dirty) {
      this.update();
    }

    return this.worldMatrices[index];
  }

  /**
   * Gets world matrix for a bone by index.
   *
   * @param index - Bone index
   * @returns World matrix or undefined if index out of bounds
   *
   * @example
   * ```typescript
   * const spineWorld = skeleton.getWorldMatrixByIndex(1);
   * if (spineWorld) {
   *   const worldPos = spineWorld.getPosition();
   * }
   * ```
   */
  getWorldMatrixByIndex(index: number): Matrix4 | undefined {
    if (index < 0 || index >= this.worldMatrices.length) return undefined;

    if (this.dirty) {
      this.update();
    }

    return this.worldMatrices[index];
  }

  /**
   * Gets local matrix for a bone by name.
   *
   * @param name - Bone name
   * @returns Local matrix or undefined if bone not found
   *
   * @example
   * ```typescript
   * const armLocal = skeleton.getLocalMatrix('arm_R');
   * ```
   */
  getLocalMatrix(name: string): Matrix4 | undefined {
    const index = this.boneMap.get(name);
    if (index === undefined) return undefined;

    if (this.dirty) {
      this.update();
    }

    return this.localMatrices[index];
  }

  /**
   * Gets bone children indices.
   *
   * @param boneIndex - Parent bone index
   * @returns Array of child bone indices
   *
   * @example
   * ```typescript
   * const spineIndex = skeleton.getBoneIndex('spine');
   * const children = skeleton.getBoneChildren(spineIndex);
   * console.log(`Spine has ${children.length} children`);
   * ```
   */
  getBoneChildren(boneIndex: number): number[] {
    const children: number[] = [];

    for (let i = 0; i < this.bones.length; i++) {
      if (this.bones[i].parentIndex === boneIndex) {
        children.push(i);
      }
    }

    return children;
  }

  /**
   * Clones this skeleton (deep copy).
   *
   * @returns Cloned skeleton
   *
   * @example
   * ```typescript
   * const skeletonCopy = skeleton.clone();
   * ```
   */
  clone(): Skeleton {
    return new Skeleton({
      name: this.name,
      bones: this.cloneBones(this.bones),
      inverseBindMatrices: this.inverseBindMatrices.map(m => m.clone())
    });
  }

  /**
   * Computes inverse bind matrices from bind pose.
   * @private
   */
  private computeInverseBindMatrices(): void {
    // First, compute world matrices for bind pose
    const bindWorldMatrices: Matrix4[] = new Array(this.bones.length);

    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bindPose[i];
      const localMatrix = new Matrix4().compose(bone.position, bone.rotation, bone.scale);

      if (bone.parentIndex === -1) {
        bindWorldMatrices[i] = localMatrix;
      } else {
        bindWorldMatrices[i] = bindWorldMatrices[bone.parentIndex]
          .multiply(localMatrix);
      }
    }

    // Compute inverse bind matrices
    for (let i = 0; i < this.bones.length; i++) {
      const inverted = bindWorldMatrices[i].invert();
      this.inverseBindMatrices[i] = inverted ?? Matrix4.identity();
    }
  }

  /**
   * Clones bone array.
   * @private
   */
  private cloneBones(bones: Bone[]): Bone[] {
    return bones.map(bone => ({
      name: bone.name,
      parentIndex: bone.parentIndex,
      position: bone.position.clone(),
      rotation: bone.rotation.clone(),
      scale: bone.scale.clone()
    }));
  }

  /**
   * Serializes skeleton to JSON.
   *
   * @returns JSON representation
   *
   * @example
   * ```typescript
   * const json = skeleton.toJSON();
   * const jsonStr = JSON.stringify(json, null, 2);
   * ```
   */
  toJSON(): any {
    const bones = this.bones.map(bone => ({
      name: bone.name,
      parentIndex: bone.parentIndex,
      position: bone.position.toArray(),
      rotation: bone.rotation.toArray(),
      scale: bone.scale.toArray()
    }));

    const inverseBindMatrices = this.inverseBindMatrices.map(m => m.toArray());

    return {
      name: this.name,
      bones,
      inverseBindMatrices
    };
  }

  /**
   * Deserializes skeleton from JSON.
   *
   * @param json - JSON representation
   * @returns Deserialized skeleton
   *
   * @example
   * ```typescript
   * const skeleton = Skeleton.fromJSON(jsonData);
   * ```
   */
  static fromJSON(json: any): Skeleton {
    const bones: Bone[] = json.bones.map((boneData: any) => ({
      name: boneData.name,
      parentIndex: boneData.parentIndex,
      position: new Vector3().fromArray(boneData.position),
      rotation: new Quaternion().fromArray(boneData.rotation),
      scale: new Vector3().fromArray(boneData.scale)
    }));

    const inverseBindMatrices = json.inverseBindMatrices.map(
      (matrixData: number[]) => new Matrix4().fromArray(matrixData)
    );

    return new Skeleton({
      name: json.name,
      bones,
      inverseBindMatrices
    });
  }
}

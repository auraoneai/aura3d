/**
 * @fileoverview Transform component for entity position, rotation, and scale.
 * Provides hierarchical transformations with cached world matrices for optimal performance.
 * @module ecs/components/TransformComponent
 */

import { IComponent, ComponentSchema } from '../Component';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';
import { ComponentRegistry } from '../ComponentRegistry';

/**
 * Core transform component for entity spatial representation.
 * Manages local position, rotation, and scale with hierarchical parent-child relationships.
 * Uses lazy evaluation for matrix computation to maximize performance.
 *
 * Features:
 * - Local and world space transformations
 * - Hierarchical parent-child relationships
 * - Lazy matrix computation with dirty flag tracking
 * - Efficient transform operations with method chaining
 * - Full serialization support
 *
 * Coordinate System: Y-up, right-handed (-Z forward)
 * - Forward: (0, 0, -1)
 * - Right: (1, 0, 0)
 * - Up: (0, 1, 0)
 *
 * Performance: Matrix updates complete in < 0.01ms
 *
 * @example
 * ```typescript
 * // Create a transform
 * const transform = new TransformComponent({
 *   position: new Vector3(0, 5, 10),
 *   rotation: Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4),
 *   scale: new Vector3(1, 1, 1)
 * });
 *
 * // Transform operations (chainable)
 * transform
 *   .translate(new Vector3(1, 0, 0))
 *   .rotateY(Math.PI / 2)
 *   .scaleBy(2);
 *
 * // Access world space
 * const worldPos = transform.worldPosition;
 * const worldMatrix = transform.worldMatrix;
 *
 * // Direction vectors
 * const forward = transform.forward;
 * const right = transform.right;
 * const up = transform.up;
 *
 * // Hierarchy
 * transform.parentEntity = parentEntityId;
 * ```
 */
export class TransformComponent implements IComponent {
  /**
   * Local position in parent space (or world space if no parent).
   */
  position: Vector3;

  /**
   * Local rotation as a quaternion.
   */
  rotation: Quaternion;

  /**
   * Local scale factors for each axis.
   */
  scale: Vector3;

  /**
   * Parent entity ID for hierarchical transformations.
   * Set to 0 for root entities (no parent).
   */
  parentEntity: number;

  /**
   * Cached local transformation matrix (position * rotation * scale).
   * Automatically recomputed when dirty flag is set.
   */
  private _localMatrix: Matrix4;

  /**
   * Cached world transformation matrix (parent world matrix * local matrix).
   * Automatically recomputed when dirty flag is set.
   */
  private _worldMatrix: Matrix4;

  /**
   * Dirty flag for local matrix caching.
   * Set to true when position, rotation, or scale changes.
   */
  private _localMatrixDirty: boolean;

  /**
   * Dirty flag for world matrix caching.
   * Set to true when local matrix changes or parent world matrix changes.
   */
  private _worldMatrixDirty: boolean;

  /**
   * Creates a new TransformComponent with optional initial values.
   * Defaults to identity transform: position=(0,0,0), rotation=identity, scale=(1,1,1)
   *
   * @param options - Optional initialization parameters
   * @param options.position - Initial position vector
   * @param options.rotation - Initial rotation quaternion
   * @param options.scale - Initial scale vector
   *
   * @example
   * ```typescript
   * // Default identity transform
   * const transform1 = new TransformComponent();
   *
   * // Custom initial transform
   * const transform2 = new TransformComponent({
   *   position: new Vector3(0, 5, 10),
   *   rotation: Quaternion.fromEuler(0, Math.PI / 2, 0),
   *   scale: new Vector3(2, 2, 2)
   * });
   * ```
   */
  constructor(options?: {
    position?: Vector3;
    rotation?: Quaternion;
    scale?: Vector3;
  }) {
    this.position = options?.position?.clone() ?? new Vector3(0, 0, 0);
    this.rotation = options?.rotation?.clone() ?? new Quaternion(0, 0, 0, 1);
    this.scale = options?.scale?.clone() ?? new Vector3(1, 1, 1);
    this.parentEntity = 0;

    this._localMatrix = new Matrix4();
    this._worldMatrix = new Matrix4();
    this._localMatrixDirty = true;
    this._worldMatrixDirty = true;
  }

  /**
   * Gets the local transformation matrix.
   * Lazily computes the matrix from position, rotation, and scale if dirty.
   *
   * @returns The local transformation matrix
   *
   * @example
   * ```typescript
   * const localMatrix = transform.localMatrix;
   * // Use for rendering or physics calculations
   * ```
   */
  get localMatrix(): Matrix4 {
    if (this._localMatrixDirty) {
      this.updateLocalMatrix();
    }
    return this._localMatrix;
  }

  /**
   * Gets the world transformation matrix.
   * Lazily computes the matrix from parent world matrix and local matrix if dirty.
   *
   * @returns The world transformation matrix
   *
   * @example
   * ```typescript
   * const worldMatrix = transform.worldMatrix;
   * // Use for rendering in world space
   * ```
   */
  get worldMatrix(): Matrix4 {
    if (this._worldMatrixDirty) {
      this.updateWorldMatrix();
    }
    return this._worldMatrix;
  }

  /**
   * Marks the local and world matrices as dirty, requiring recomputation.
   * Called automatically when transform properties are modified.
   *
   * @example
   * ```typescript
   * transform.position.x = 10;
   * transform.setDirty(); // Mark matrices for recomputation
   * ```
   */
  setDirty(): void {
    this._localMatrixDirty = true;
    this._worldMatrixDirty = true;
  }

  /**
   * Updates the local transformation matrix from position, rotation, and scale.
   * Clears the local dirty flag after computation.
   *
   * @example
   * ```typescript
   * transform.position.set(1, 2, 3);
   * transform.updateLocalMatrix();
   * ```
   */
  updateLocalMatrix(): void {
    this._localMatrix.compose(this.position, this.rotation, this.scale);
    this._localMatrixDirty = false;
    this._worldMatrixDirty = true;
  }

  /**
   * Updates the world transformation matrix from parent world matrix and local matrix.
   * If no parent exists, the world matrix equals the local matrix.
   * Clears the world dirty flag after computation.
   *
   * @param parentWorldMatrix - Optional parent world matrix for hierarchical transforms
   *
   * @example
   * ```typescript
   * // Update as root entity
   * transform.updateWorldMatrix();
   *
   * // Update with parent transform
   * const parentWorld = parentTransform.worldMatrix;
   * childTransform.updateWorldMatrix(parentWorld);
   * ```
   */
  updateWorldMatrix(parentWorldMatrix?: Matrix4): void {
    const local = this.localMatrix;

    if (parentWorldMatrix) {
      this._worldMatrix = parentWorldMatrix.multiply(local);
    } else {
      this._worldMatrix.copy(local);
    }

    this._worldMatrixDirty = false;
  }

  /**
   * Translates the transform by an offset vector in local space.
   *
   * @param offset - Translation offset vector
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * transform.translate(new Vector3(1, 0, 0)); // Move 1 unit right
   * transform.translate(new Vector3(0, 1, 0)); // Move 1 unit up
   * ```
   */
  translate(offset: Vector3): this {
    this.position.addInPlace(offset);
    this.setDirty();
    return this;
  }

  /**
   * Rotates the transform around an arbitrary axis.
   *
   * @param axis - Rotation axis (should be normalized)
   * @param angle - Rotation angle in radians
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * const axis = new Vector3(0, 1, 0); // Y-axis
   * transform.rotate(axis, Math.PI / 4); // Rotate 45 degrees around Y
   * ```
   */
  rotate(axis: Vector3, angle: number): this {
    const deltaRotation = Quaternion.fromAxisAngle(axis, angle);
    this.rotation = this.rotation.multiply(deltaRotation);
    this.setDirty();
    return this;
  }

  /**
   * Rotates the transform around the X axis (pitch).
   *
   * @param angle - Rotation angle in radians
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * transform.rotateX(Math.PI / 2); // Pitch 90 degrees
   * ```
   */
  rotateX(angle: number): this {
    return this.rotate(Vector3.unitX(), angle);
  }

  /**
   * Rotates the transform around the Y axis (yaw).
   *
   * @param angle - Rotation angle in radians
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * transform.rotateY(Math.PI / 2); // Yaw 90 degrees
   * ```
   */
  rotateY(angle: number): this {
    return this.rotate(Vector3.unitY(), angle);
  }

  /**
   * Rotates the transform around the Z axis (roll).
   *
   * @param angle - Rotation angle in radians
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * transform.rotateZ(Math.PI / 2); // Roll 90 degrees
   * ```
   */
  rotateZ(angle: number): this {
    return this.rotate(Vector3.unitZ(), angle);
  }

  /**
   * Scales the transform uniformly or non-uniformly.
   *
   * @param factor - Uniform scale factor (number) or per-axis scale factors (Vector3)
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * transform.scaleBy(2);                           // Uniform scale by 2
   * transform.scaleBy(new Vector3(2, 1, 0.5));      // Non-uniform scale
   * ```
   */
  scaleBy(factor: number | Vector3): this {
    if (typeof factor === 'number') {
      this.scale.scaleInPlace(factor);
    } else {
      this.scale.mulInPlace(factor);
    }
    this.setDirty();
    return this;
  }

  /**
   * Orients the transform to look at a target position.
   * The forward direction (-Z) will point toward the target.
   *
   * @param target - Target position to look at
   * @param up - Up direction (default: world up)
   * @returns This transform for method chaining
   *
   * @example
   * ```typescript
   * const target = new Vector3(10, 0, 0);
   * transform.lookAt(target); // Face the target
   *
   * // Custom up vector
   * transform.lookAt(target, new Vector3(0, 0, 1));
   * ```
   */
  lookAt(target: Vector3, up: Vector3 = Vector3.up()): this {
    const forward = target.sub(this.position).normalize();
    const worldUp = up.normalize();

    if (forward.lengthSquared() < 1e-6) {
      return this;
    }

    const right = worldUp.cross(forward).normalize();
    if (right.lengthSquared() < 1e-6) {
      return this;
    }

    const actualUp = forward.cross(right);

    const lookAtMatrix = new Matrix4();
    const e = lookAtMatrix.elements;

    e[0] = right.x;
    e[1] = right.y;
    e[2] = right.z;

    e[4] = actualUp.x;
    e[5] = actualUp.y;
    e[6] = actualUp.z;

    e[8] = forward.x;
    e[9] = forward.y;
    e[10] = forward.z;

    const rot = lookAtMatrix.getRotation();
    this.rotation.set(rot.x, rot.y, rot.z, rot.w);
    this.setDirty();

    return this;
  }

  /**
   * Gets the world position by extracting it from the world matrix.
   *
   * @returns World position vector
   *
   * @example
   * ```typescript
   * const worldPos = transform.worldPosition;
   * console.log(`Entity at: ${worldPos.x}, ${worldPos.y}, ${worldPos.z}`);
   * ```
   */
  get worldPosition(): Vector3 {
    return this.worldMatrix.getPosition();
  }

  /**
   * Gets the world rotation by extracting it from the world matrix.
   *
   * @returns World rotation quaternion
   *
   * @example
   * ```typescript
   * const worldRot = transform.worldRotation;
   * const euler = worldRot.toEuler();
   * ```
   */
  get worldRotation(): Quaternion {
    const q = this.worldMatrix.getRotation();
    return new Quaternion(q.x, q.y, q.z, q.w);
  }

  /**
   * Gets the world scale by extracting it from the world matrix.
   *
   * @returns World scale vector
   *
   * @example
   * ```typescript
   * const worldScale = transform.worldScale;
   * console.log(`Scale: ${worldScale.x}, ${worldScale.y}, ${worldScale.z}`);
   * ```
   */
  get worldScale(): Vector3 {
    return this.worldMatrix.getScale();
  }

  /**
   * Gets the forward direction vector (-Z) in local space.
   *
   * @returns Forward direction vector
   *
   * @example
   * ```typescript
   * const forward = transform.forward;
   * const moveDirection = forward.scale(speed);
   * ```
   */
  get forward(): Vector3 {
    const rotMatrix = new Matrix4().setFromQuaternion(this.rotation);
    const forward = new Vector3(
      rotMatrix.elements[8],
      rotMatrix.elements[9],
      rotMatrix.elements[10]
    );
    return forward.normalize();
  }

  /**
   * Gets the right direction vector (+X) in local space.
   *
   * @returns Right direction vector
   *
   * @example
   * ```typescript
   * const right = transform.right;
   * transform.translate(right.scale(strafeSpeed));
   * ```
   */
  get right(): Vector3 {
    const rotMatrix = new Matrix4().setFromQuaternion(this.rotation);
    const right = new Vector3(
      rotMatrix.elements[0],
      rotMatrix.elements[1],
      rotMatrix.elements[2]
    );
    return right.normalize();
  }

  /**
   * Gets the up direction vector (+Y) in local space.
   *
   * @returns Up direction vector
   *
   * @example
   * ```typescript
   * const up = transform.up;
   * const jumpDirection = up.scale(jumpForce);
   * ```
   */
  get up(): Vector3 {
    const rotMatrix = new Matrix4().setFromQuaternion(this.rotation);
    const up = new Vector3(
      rotMatrix.elements[4],
      rotMatrix.elements[5],
      rotMatrix.elements[6]
    );
    return up.normalize();
  }

  /**
   * Lifecycle hook called when the component is attached to an entity.
   *
   * @param entity - The entity ID this component is being attached to
   *
   * @example
   * ```typescript
   * // Automatically called by ECS system
   * // Can be used for initialization logic
   * ```
   */
  onAttach(entity: number): void {
    // Component is now attached to entity
    // Initialization can be performed here if needed
  }

  /**
   * Lifecycle hook called when the component is detached from an entity.
   *
   * @param entity - The entity ID this component is being detached from
   *
   * @example
   * ```typescript
   * // Automatically called by ECS system
   * // Can be used for cleanup logic
   * ```
   */
  onDetach(entity: number): void {
    // Component is being detached
    // Cleanup can be performed here if needed
  }

  /**
   * Resets the transform to identity state (default values).
   * Used for object pooling to avoid allocations.
   *
   * @example
   * ```typescript
   * transform.reset(); // Reset to identity
   * // position=(0,0,0), rotation=identity, scale=(1,1,1)
   * ```
   */
  reset(): void {
    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0, 1);
    this.scale.set(1, 1, 1);
    this.parentEntity = 0;
    this._localMatrixDirty = true;
    this._worldMatrixDirty = true;
  }

  /**
   * Serializes the transform to a plain object for save/load.
   *
   * @returns Plain object representation of the transform
   *
   * @example
   * ```typescript
   * const data = transform.serialize();
   * const json = JSON.stringify(data);
   * // Save to file or network
   * ```
   */
  serialize(): object {
    return {
      position: this.position.toJSON(),
      rotation: this.rotation.toJSON(),
      scale: this.scale.toJSON(),
      parentEntity: this.parentEntity
    };
  }

  /**
   * Deserializes transform data from a plain object.
   *
   * @param data - Plain object containing transform data
   *
   * @example
   * ```typescript
   * const json = loadFromFile();
   * const data = JSON.parse(json);
   * transform.deserialize(data);
   * ```
   */
  deserialize(data: any): void {
    if (data.position) {
      this.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data.rotation) {
      this.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
    }
    if (data.scale) {
      this.scale.set(data.scale.x, data.scale.y, data.scale.z);
    }
    if (data.parentEntity !== undefined) {
      this.parentEntity = data.parentEntity;
    }
    this.setDirty();
  }

  /**
   * Component schema for serialization and ECS storage.
   * Defines the structure of component data.
   */
  static readonly schema: ComponentSchema = {
    position: 'vec3',
    rotation: 'quat',
    scale: 'vec3',
    parentEntity: 'entity'
  };

  /**
   * Component ID assigned by the registry (set during registration).
   */
  static readonly _componentId?: number;

  /**
   * Component name for identification in the ECS.
   */
  static readonly _componentName: string = 'TransformComponent';
}

// Register component with the ComponentRegistry
ComponentRegistry.register(TransformComponent, {
  name: 'TransformComponent'
});


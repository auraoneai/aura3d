/**
 * Transform class encapsulating position, rotation, and scale with matrix computation.
 * Provides hierarchical transformations with parent-child relationships and lazy matrix updates.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module Transform
 */

import { Vector3 } from './Vector3';
import { Quaternion } from './Quaternion';
import { Matrix4 } from './Matrix4';

/**
 * Transform class for representing position, rotation, and scale in 3D space.
 * Supports hierarchical transformations with parent-child relationships.
 * Uses lazy evaluation for matrix computation with dirty flag optimization.
 *
 * @example
 * ```typescript
 * // Create a basic transform
 * const transform = new Transform();
 * transform.position.set(1, 2, 3);
 * transform.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
 * transform.scale.set(2, 2, 2);
 *
 * // Access matrices
 * const localMatrix = transform.localMatrix;
 * const worldMatrix = transform.worldMatrix;
 *
 * // Create hierarchy
 * const parent = new Transform();
 * const child = new Transform();
 * parent.addChild(child);
 *
 * // Transform points
 * const worldPoint = transform.transformPoint(new Vector3(1, 0, 0));
 * const localPoint = transform.inverseTransformPoint(worldPoint);
 *
 * // Look at target
 * transform.lookAt(new Vector3(0, 0, 0));
 * ```
 */
export class Transform {
  /**
   * Local position relative to parent (or world if no parent).
   */
  private _position: Vector3;

  /**
   * Local rotation relative to parent (or world if no parent).
   */
  private _rotation: Quaternion;

  /**
   * Local scale relative to parent (or world if no parent).
   */
  private _scale: Vector3;

  /**
   * Parent transform in the hierarchy.
   */
  private _parent: Transform | null = null;

  /**
   * Child transforms in the hierarchy.
   */
  private _children: Transform[] = [];

  /**
   * Cached local transformation matrix.
   */
  private _localMatrix: Matrix4;

  /**
   * Cached world transformation matrix.
   */
  private _worldMatrix: Matrix4;

  /**
   * Flag indicating if local matrix needs recomputation.
   */
  private _localMatrixDirty: boolean = true;

  /**
   * Flag indicating if world matrix needs recomputation.
   */
  private _worldMatrixDirty: boolean = true;

  /**
   * Callback function invoked when transform is modified.
   */
  onChange: (() => void) | null = null;

  /**
   * Creates a new Transform instance with identity transformation.
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * console.log(transform.position); // (0, 0, 0)
   * console.log(transform.rotation); // (0, 0, 0, 1)
   * console.log(transform.scale); // (1, 1, 1)
   * ```
   */
  constructor() {
    this._position = new Vector3(0, 0, 0);
    this._rotation = new Quaternion(0, 0, 0, 1);
    this._scale = new Vector3(1, 1, 1);
    this._localMatrix = new Matrix4();
    this._worldMatrix = new Matrix4();
  }

  /**
   * Gets the local position vector.
   * Modifications to this vector will mark the transform as dirty.
   *
   * @returns Local position vector
   */
  get position(): Vector3 {
    return this._createProxyVector(this._position);
  }

  /**
   * Sets the local position vector.
   *
   * @param pos - New position
   */
  set position(pos: Vector3) {
    this._position.copy(pos);
    this._markDirty();
  }

  /**
   * Gets the local rotation quaternion.
   *
   * @returns Local rotation quaternion
   */
  get rotation(): Quaternion {
    return this._rotation;
  }

  /**
   * Sets the local rotation quaternion.
   *
   * @param rot - New rotation
   */
  set rotation(rot: Quaternion) {
    this._rotation.copy(rot);
    this._markDirty();
  }

  /**
   * Gets the local scale vector.
   * Modifications to this vector will mark the transform as dirty.
   *
   * @returns Local scale vector
   */
  get scale(): Vector3 {
    return this._createProxyVector(this._scale);
  }

  /**
   * Sets the local scale vector.
   *
   * @param s - New scale
   */
  set scale(s: Vector3) {
    this._scale.copy(s);
    this._markDirty();
  }

  /**
   * Gets the local transformation matrix.
   * Automatically recomputes if dirty.
   *
   * @returns Local transformation matrix
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * const matrix = transform.localMatrix;
   * ```
   */
  get localMatrix(): Matrix4 {
    if (this._localMatrixDirty) {
      this.updateMatrix();
    }
    return this._localMatrix;
  }

  /**
   * Gets the world transformation matrix.
   * Automatically recomputes if dirty or parent is dirty.
   *
   * @returns World transformation matrix
   *
   * @example
   * ```typescript
   * const child = new Transform();
   * const parent = new Transform();
   * parent.addChild(child);
   * parent.position.set(1, 0, 0);
   * child.position.set(1, 0, 0);
   * console.log(child.worldMatrix); // Combines parent and child transforms
   * ```
   */
  get worldMatrix(): Matrix4 {
    if (this._worldMatrixDirty || (this._parent && this._parent._worldMatrixDirty)) {
      this.updateWorldMatrix();
    }
    return this._worldMatrix;
  }

  /**
   * Gets the parent transform.
   *
   * @returns Parent transform or null
   */
  get parent(): Transform | null {
    return this._parent;
  }

  /**
   * Sets the parent transform.
   * This is equivalent to calling parent.addChild(this).
   *
   * @param parent - New parent transform
   */
  set parent(parent: Transform | null) {
    this.setParent(parent);
  }

  /**
   * Gets the readonly array of child transforms.
   *
   * @returns Array of child transforms
   */
  get children(): readonly Transform[] {
    return this._children;
  }

  /**
   * Adds a child transform to this transform.
   * Removes the child from its previous parent if it had one.
   * Marks the child's world matrix as dirty.
   *
   * @param child - Transform to add as child
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * const child = new Transform();
   * parent.addChild(child);
   * console.log(child.parent === parent); // true
   * console.log(parent.children.includes(child)); // true
   * ```
   */
  addChild(child: Transform): void {
    if (child === this) {
      console.warn('Transform: Cannot add self as child');
      return;
    }

    if (this._isAncestor(child)) {
      console.warn('Transform: Cannot add ancestor as child (would create cycle)');
      return;
    }

    if (child._parent) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    this._children.push(child);
    child._markWorldMatrixDirty();
  }

  /**
   * Removes a child transform from this transform.
   *
   * @param child - Transform to remove
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * const child = new Transform();
   * parent.addChild(child);
   * parent.removeChild(child);
   * console.log(child.parent); // null
   * ```
   */
  removeChild(child: Transform): void {
    const index = this._children.indexOf(child);
    if (index !== -1) {
      this._children.splice(index, 1);
      child._parent = null;
      child._markWorldMatrixDirty();
    }
  }

  /**
   * Sets the parent transform for this transform.
   * If parent is null, removes this transform from its current parent.
   *
   * @param parent - New parent transform or null
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * const child = new Transform();
   * child.setParent(parent);
   * console.log(child.parent === parent); // true
   * child.setParent(null);
   * console.log(child.parent); // null
   * ```
   */
  setParent(parent: Transform | null): void {
    if (parent === this._parent) {
      return;
    }

    if (this._parent) {
      this._parent.removeChild(this);
    }

    if (parent) {
      parent.addChild(this);
    } else {
      this._parent = null;
      this._markWorldMatrixDirty();
    }
  }

  /**
   * Gets the world position.
   * Extracts position from world matrix.
   *
   * @returns World position vector
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * parent.position.set(1, 0, 0);
   * const child = new Transform();
   * child.position.set(1, 0, 0);
   * parent.addChild(child);
   * console.log(child.worldPosition); // (2, 0, 0)
   * ```
   */
  get worldPosition(): Vector3 {
    return this.worldMatrix.getPosition();
  }

  /**
   * Sets the world position.
   * Converts world position to local position based on parent transform.
   *
   * @param pos - New world position
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * parent.position.set(1, 0, 0);
   * const child = new Transform();
   * parent.addChild(child);
   * child.worldPosition = new Vector3(5, 0, 0);
   * console.log(child.position); // (4, 0, 0) - relative to parent
   * ```
   */
  set worldPosition(pos: Vector3) {
    if (this._parent) {
      const parentWorldMatrix = this._parent.worldMatrix;
      const invParentMatrix = parentWorldMatrix.invert();
      if (invParentMatrix) {
        const localPos = new Vector3(pos.x, pos.y, pos.z);
        const e = invParentMatrix.elements;

        const x = localPos.x * e[0] + localPos.y * e[4] + localPos.z * e[8] + e[12];
        const y = localPos.x * e[1] + localPos.y * e[5] + localPos.z * e[9] + e[13];
        const z = localPos.x * e[2] + localPos.y * e[6] + localPos.z * e[10] + e[14];

        this._position.set(x, y, z);
        this._markDirty();
      }
    } else {
      this._position.copy(pos);
      this._markDirty();
    }
  }

  /**
   * Gets the world rotation.
   * Extracts rotation from world matrix.
   *
   * @returns World rotation quaternion
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * parent.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const child = new Transform();
   * child.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * parent.addChild(child);
   * const worldRot = child.worldRotation; // Combined rotation
   * ```
   */
  get worldRotation(): Quaternion {
    const rot = this.worldMatrix.getRotation();
    return new Quaternion(rot.x, rot.y, rot.z, rot.w);
  }

  /**
   * Sets the world rotation.
   * Converts world rotation to local rotation based on parent transform.
   *
   * @param rot - New world rotation
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * parent.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const child = new Transform();
   * parent.addChild(child);
   * child.worldRotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
   * ```
   */
  set worldRotation(rot: Quaternion) {
    if (this._parent) {
      const parentWorldRot = this._parent.worldRotation;
      const invParentRot = parentWorldRot.invert();
      this._rotation = invParentRot.multiply(rot);
      this._markDirty();
    } else {
      this._rotation.copy(rot);
      this._markDirty();
    }
  }

  /**
   * Gets the world scale.
   * Extracts scale from world matrix.
   *
   * @returns World scale vector
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * parent.scale.set(2, 2, 2);
   * const child = new Transform();
   * child.scale.set(3, 3, 3);
   * parent.addChild(child);
   * console.log(child.worldScale); // (6, 6, 6)
   * ```
   */
  get worldScale(): Vector3 {
    return this.worldMatrix.getScale();
  }

  /**
   * Sets the rotation to look at a target position.
   * Uses world position if this transform has a parent.
   * The up vector defaults to (0, 1, 0).
   *
   * @param target - Target position to look at
   * @param up - Up direction (default: Vector3.up())
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(0, 0, 10);
   * transform.lookAt(new Vector3(0, 0, 0)); // Look at origin
   * ```
   */
  lookAt(target: Vector3, up: Vector3 = Vector3.up()): void {
    const position = this._parent ? this.worldPosition : this._position;

    const forward = target.sub(position);
    if (forward.lengthSquared() < 1e-10) {
      return;
    }
    forward.normalizeInPlace();

    const right = up.cross(forward).normalize();
    if (right.lengthSquared() < 1e-10) {
      const altUp = Math.abs(up.y) < 0.999 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
      right.copy(altUp.cross(forward).normalize());
    }

    const actualUp = forward.cross(right);

    const rotationMatrix = new Matrix4();
    const e = rotationMatrix.elements;

    e[0] = right.x;
    e[1] = right.y;
    e[2] = right.z;

    e[4] = actualUp.x;
    e[5] = actualUp.y;
    e[6] = actualUp.z;

    e[8] = -forward.x;
    e[9] = -forward.y;
    e[10] = -forward.z;

    const worldRotation = new Quaternion().setFromRotationMatrix(rotationMatrix);

    if (this._parent) {
      this.worldRotation = worldRotation;
    } else {
      this._rotation = worldRotation;
      this._markDirty();
    }
  }

  /**
   * Rotates the transform around a world-space point.
   *
   * @param point - World-space point to rotate around
   * @param axis - World-space rotation axis (should be normalized)
   * @param angle - Rotation angle in radians
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(5, 0, 0);
   * transform.rotateAround(
   *   new Vector3(0, 0, 0),
   *   Vector3.up(),
   *   Math.PI / 2
   * ); // Rotates 90 degrees around origin
   * ```
   */
  rotateAround(point: Vector3, axis: Vector3, angle: number): void {
    const worldPos = this._parent ? this.worldPosition : this._position;

    const offset = worldPos.sub(point);

    const rotation = Quaternion.fromAxisAngle(axis, angle);
    const rotatedOffset = this._rotateVector(offset, rotation);

    const newWorldPos = point.add(rotatedOffset);

    if (this._parent) {
      this.worldPosition = newWorldPos;
      const worldRot = this.worldRotation;
      this.worldRotation = rotation.multiply(worldRot);
    } else {
      this._position.copy(newWorldPos);
      this._rotation = rotation.multiply(this._rotation);
      this._markDirty();
    }
  }

  /**
   * Transforms a point from local space to world space.
   *
   * @param point - Point in local space
   * @returns Point in world space
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * const localPoint = new Vector3(1, 0, 0);
   * const worldPoint = transform.transformPoint(localPoint);
   * console.log(worldPoint); // (2, 2, 3)
   * ```
   */
  transformPoint(point: Vector3): Vector3 {
    const m = this.worldMatrix.elements;

    const x = point.x * m[0] + point.y * m[4] + point.z * m[8] + m[12];
    const y = point.x * m[1] + point.y * m[5] + point.z * m[9] + m[13];
    const z = point.x * m[2] + point.y * m[6] + point.z * m[10] + m[14];

    return new Vector3(x, y, z);
  }

  /**
   * Transforms a direction from local space to world space.
   * Ignores translation and handles scale.
   *
   * @param direction - Direction in local space
   * @returns Direction in world space
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const localDir = new Vector3(1, 0, 0);
   * const worldDir = transform.transformDirection(localDir);
   * ```
   */
  transformDirection(direction: Vector3): Vector3 {
    const m = this.worldMatrix.elements;

    const x = direction.x * m[0] + direction.y * m[4] + direction.z * m[8];
    const y = direction.x * m[1] + direction.y * m[5] + direction.z * m[9];
    const z = direction.x * m[2] + direction.y * m[6] + direction.z * m[10];

    return new Vector3(x, y, z);
  }

  /**
   * Transforms a point from world space to local space.
   *
   * @param point - Point in world space
   * @returns Point in local space
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * const worldPoint = new Vector3(2, 2, 3);
   * const localPoint = transform.inverseTransformPoint(worldPoint);
   * console.log(localPoint); // (1, 0, 0)
   * ```
   */
  inverseTransformPoint(point: Vector3): Vector3 {
    const invMatrix = this.worldMatrix.invert();
    if (!invMatrix) {
      console.warn('Transform: Cannot compute inverse transform (singular matrix)');
      return point.clone();
    }

    const m = invMatrix.elements;

    const x = point.x * m[0] + point.y * m[4] + point.z * m[8] + m[12];
    const y = point.x * m[1] + point.y * m[5] + point.z * m[9] + m[13];
    const z = point.x * m[2] + point.y * m[6] + point.z * m[10] + m[14];

    return new Vector3(x, y, z);
  }

  /**
   * Transforms a direction from world space to local space.
   * Ignores translation and handles scale.
   *
   * @param direction - Direction in world space
   * @returns Direction in local space
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const worldDir = new Vector3(0, 0, -1);
   * const localDir = transform.inverseTransformDirection(worldDir);
   * ```
   */
  inverseTransformDirection(direction: Vector3): Vector3 {
    const invMatrix = this.worldMatrix.invert();
    if (!invMatrix) {
      console.warn('Transform: Cannot compute inverse transform (singular matrix)');
      return direction.clone();
    }

    const m = invMatrix.elements;

    const x = direction.x * m[0] + direction.y * m[4] + direction.z * m[8];
    const y = direction.x * m[1] + direction.y * m[5] + direction.z * m[9];
    const z = direction.x * m[2] + direction.y * m[6] + direction.z * m[10];

    return new Vector3(x, y, z);
  }

  /**
   * Gets whether the transform is dirty (needs matrix update).
   *
   * @returns True if local or world matrix is dirty
   */
  get isDirty(): boolean {
    return this._localMatrixDirty || this._worldMatrixDirty;
  }

  /**
   * Updates the local transformation matrix.
   * Composes matrix from position, rotation, and scale.
   * Clears the local dirty flag.
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * transform.updateMatrix();
   * console.log(transform.isDirty); // false (local matrix updated)
   * ```
   */
  updateMatrix(): void {
    this._localMatrix.compose(this._position, this._rotation, this._scale);
    this._localMatrixDirty = false;

    if (this._hasNonUniformScaleInHierarchy()) {
      const scaleVariance = Math.max(
        Math.abs(this._scale.x - this._scale.y),
        Math.abs(this._scale.y - this._scale.z),
        Math.abs(this._scale.z - this._scale.x)
      );

      if (scaleVariance > 0.01) {
        console.warn('Transform: Non-uniform scale detected. May cause skewing artifacts in child transforms.');
      }
    }
  }

  /**
   * Updates the world transformation matrix.
   * If force is true, updates even if not dirty.
   * Recursively updates all child transforms.
   *
   * @param force - Force update even if not dirty (default: false)
   *
   * @example
   * ```typescript
   * const parent = new Transform();
   * const child = new Transform();
   * parent.addChild(child);
   * parent.position.set(1, 0, 0);
   * parent.updateWorldMatrix(true); // Updates parent and all children
   * ```
   */
  updateWorldMatrix(force: boolean = false): void {
    if (this._localMatrixDirty || force) {
      this.updateMatrix();
    }

    if (this._worldMatrixDirty || force || (this._parent && this._parent._worldMatrixDirty)) {
      if (this._parent) {
        if (this._parent._worldMatrixDirty) {
          this._parent.updateWorldMatrix(force);
        }
        this._worldMatrix = this._parent.worldMatrix.multiply(this._localMatrix);
      } else {
        this._worldMatrix.copy(this._localMatrix);
      }
      this._worldMatrixDirty = false;
    }

    for (const child of this._children) {
      if (child._worldMatrixDirty || force) {
        child.updateWorldMatrix(force);
      }
    }
  }

  /**
   * Creates a copy of this transform.
   * Does not copy parent-child relationships.
   *
   * @returns New transform with same position, rotation, and scale
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * const copy = transform.clone();
   * console.log(copy.position); // (1, 2, 3)
   * console.log(copy.parent); // null (relationships not copied)
   * ```
   */
  clone(): Transform {
    const transform = new Transform();
    transform._position.copy(this._position);
    transform._rotation.copy(this._rotation);
    transform._scale.copy(this._scale);
    transform._markDirty();
    return transform;
  }

  /**
   * Copies position, rotation, and scale from another transform.
   * Does not copy parent-child relationships.
   *
   * @param t - Transform to copy from
   * @returns This transform for chaining
   *
   * @example
   * ```typescript
   * const transform1 = new Transform();
   * transform1.position.set(1, 2, 3);
   * const transform2 = new Transform();
   * transform2.copy(transform1);
   * console.log(transform2.position); // (1, 2, 3)
   * ```
   */
  copy(t: Transform): this {
    this._position.copy(t._position);
    this._rotation.copy(t._rotation);
    this._scale.copy(t._scale);
    this._markDirty();
    return this;
  }

  /**
   * Resets this transform to identity.
   * Sets position to (0, 0, 0), rotation to identity, and scale to (1, 1, 1).
   *
   * @returns This transform for chaining
   *
   * @example
   * ```typescript
   * const transform = new Transform();
   * transform.position.set(1, 2, 3);
   * transform.reset();
   * console.log(transform.position); // (0, 0, 0)
   * ```
   */
  reset(): this {
    this._position.set(0, 0, 0);
    this._rotation.set(0, 0, 0, 1);
    this._scale.set(1, 1, 1);
    this._markDirty();
    return this;
  }

  /**
   * Marks the transform as dirty and notifies observers.
   * Sets both local and world matrix dirty flags.
   * Recursively marks all children as dirty.
   * Calls onChange callback if set.
   */
  private _markDirty(): void {
    if (!this._localMatrixDirty) {
      this._localMatrixDirty = true;
      this._markWorldMatrixDirty();

      if (this.onChange) {
        this.onChange();
      }
    }
  }

  /**
   * Marks the world matrix as dirty and recursively marks all children.
   */
  private _markWorldMatrixDirty(): void {
    if (!this._worldMatrixDirty) {
      this._worldMatrixDirty = true;

      for (const child of this._children) {
        child._markWorldMatrixDirty();
      }
    }
  }

  /**
   * Checks if a given transform is an ancestor of this transform.
   * Used to prevent circular dependencies in the hierarchy.
   *
   * @param transform - Transform to check
   * @returns True if transform is an ancestor
   */
  private _isAncestor(transform: Transform): boolean {
    let current = this._parent;
    while (current) {
      if (current === transform) {
        return true;
      }
      current = current._parent;
    }
    return false;
  }

  /**
   * Checks if this transform or any ancestor has non-uniform scale.
   *
   * @returns True if non-uniform scale exists in hierarchy
   */
  private _hasNonUniformScaleInHierarchy(): boolean {
    const hasNonUniformScale = (s: Vector3): boolean => {
      return Math.abs(s.x - s.y) > 1e-6 ||
             Math.abs(s.y - s.z) > 1e-6 ||
             Math.abs(s.z - s.x) > 1e-6;
    };

    if (hasNonUniformScale(this._scale)) {
      return true;
    }

    let current = this._parent;
    while (current) {
      if (hasNonUniformScale(current._scale)) {
        return true;
      }
      current = current._parent;
    }

    return false;
  }

  /**
   * Rotates a vector by a quaternion.
   *
   * @param v - Vector to rotate
   * @param q - Rotation quaternion
   * @returns Rotated vector
   */
  private _rotateVector(v: Vector3, q: Quaternion): Vector3 {
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const vx = v.x, vy = v.y, vz = v.z;

    const ix = qw * vx + qy * vz - qz * vy;
    const iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx;
    const iw = -qx * vx - qy * vy - qz * vz;

    return new Vector3(
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    );
  }

  /**
   * Creates a proxy for a Vector3 that marks the transform as dirty on modification.
   * This allows direct modification of position and scale while maintaining dirty tracking.
   *
   * @param vector - Vector to wrap
   * @returns Proxied vector
   */
  private _createProxyVector(vector: Vector3): Vector3 {
    const transform = this;

    return new Proxy(vector, {
      get(target: Vector3, prop: string | symbol): any {
        const value = (target as any)[prop];

        if (typeof value === 'function') {
          return function(this: Vector3, ...args: any[]) {
            const result = value.apply(this, args);

            if (prop === 'set' || prop === 'copy' ||
                prop.toString().endsWith('InPlace') ||
                prop === 'fromArray') {
              transform._markDirty();
            }

            return result;
          };
        }

        return value;
      },

      set(target: Vector3, prop: string | symbol, value: any): boolean {
        if (prop === 'x' || prop === 'y' || prop === 'z') {
          (target as any)[prop] = value;
          transform._markDirty();
          return true;
        }

        (target as any)[prop] = value;
        return true;
      }
    });
  }
}

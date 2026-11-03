import {
  cloneMat4,
  composeMat4,
  decomposeMat4,
  identityMat4,
  invertMat4,
  multiplyMat4,
  normalizeQuat,
  type Mat4,
  type Quat,
  type Vec3
} from "./MathTypes.js";
import { installTransformNodeAccess, type StagedLocalUpdate, type StagedWorldUpdate } from "./TransformNodeInternals.js";

export class TransformNode {
  static {
    installTransformNodeAccess({
      stageWorldUpdate: (node, parentWorld, force) => node.stageWorldUpdate(parentWorld, force),
      commitWorldUpdate: (node, staged) => node.commitWorldUpdate(staged),
      stageLocalUpdate: (node, matrix) => node.stageLocalUpdate(matrix),
      commitLocalUpdate: (node, staged) => node.commitLocalUpdate(staged),
      stageDirtyNotification: (node) => node.stageDirtyNotification()
    });
  }

  private dirty = true;
  private readonly dirtyListeners = new Set<() => void>();
  // A world-preserving reparent can produce shear even when both nodes use
  // TRS. Retain the non-TRS linear remainder so later animation stays live.
  private linearResidual?: Mat4;
  private inverseWorldCache?: Mat4 = identityMat4();
  private inverseWorldCacheSource?: Mat4 = identityMat4();
  private assignedInverseWorld?: Mat4;
  private assignedInverseWorldSource?: Mat4;
  matrixAutoUpdate = true;
  readonly position: Vec3 = [0, 0, 0];
  readonly rotation: Quat = [0, 0, 0, 1];
  readonly scale: Vec3 = [1, 1, 1];
  /** Local-space point about which rotation and scale are applied. */
  readonly pivot: Vec3 = [0, 0, 0];
  localMatrix: Mat4 = identityMat4();
  worldMatrix: Mat4 = identityMat4();

  /**
   * Invert the published world matrix on demand. A singular transform is a
   * valid world transform, but has no inverse; requesting it throws instead
   * of exposing a stale inverse from an earlier update.
   *
   * The property remains writable for callers that supply their own inverse.
   * Such an assignment applies only to the current, invertible world matrix.
   */
  get inverseWorldMatrix(): Mat4 {
    if (!sameMatrix(this.inverseWorldCacheSource, this.worldMatrix)) {
      this.inverseWorldCache = undefined;
    }
    if (!this.inverseWorldCache) {
      this.inverseWorldCache = invertMat4(this.worldMatrix);
      this.inverseWorldCacheSource = cloneMat4(this.worldMatrix);
    }
    if (this.assignedInverseWorld && sameMatrix(this.assignedInverseWorldSource, this.worldMatrix)) {
      return this.assignedInverseWorld;
    }
    this.assignedInverseWorld = undefined;
    this.assignedInverseWorldSource = undefined;
    return this.inverseWorldCache;
  }

  set inverseWorldMatrix(value: Mat4) {
    this.assignedInverseWorld = value;
    this.assignedInverseWorldSource = cloneMat4(this.worldMatrix);
  }

  setPosition(x: number, y: number, z: number): this {
    this.position[0] = x;
    this.position[1] = y;
    this.position[2] = z;
    return this.markDirty();
  }

  setRotation(x: number, y: number, z: number, w: number): this {
    const normalized = normalizeQuat([x, y, z, w]);
    this.rotation[0] = normalized[0];
    this.rotation[1] = normalized[1];
    this.rotation[2] = normalized[2];
    this.rotation[3] = normalized[3];
    return this.markDirty();
  }

  setScale(x: number, y: number, z: number): this {
    this.scale[0] = x;
    this.scale[1] = y;
    this.scale[2] = z;
    return this.markDirty();
  }

  /**
   * Set the local pivot. With automatic matrices the transform is
   * T(position) · T(pivot) · R · S · H · T(-pivot), where H is the identity
   * unless an affine remainder was retained during matrix decomposition. A
   * manually supplied local matrix remains authoritative until auto update.
   */
  setPivot(x: number, y: number, z: number): this {
    if (![x, y, z].every(Number.isFinite)) throw new Error("Transform pivot must contain finite values.");
    this.pivot[0] = x;
    this.pivot[1] = y;
    this.pivot[2] = z;
    return this.markDirty();
  }

  setFromLocalMatrix(matrix: Mat4): this {
    // Reparenting can produce shear. Keep that linear remainder separately so
    // automatic recomposition and subsequent animation preserve the matrix.
    this.commitLocalUpdate(this.stageLocalUpdate(matrix));
    return this.markDirty();
  }

  setLocalMatrix(matrix: Mat4, options: { readonly decompose?: boolean; readonly matrixAutoUpdate?: boolean } = {}): this {
    if (!matrix.every(Number.isFinite)) throw new Error("Transform local matrix must contain finite values.");
    const autoUpdate = options.matrixAutoUpdate ?? false;
    const decomposed = (options.decompose ?? true) ? decomposePivotMatrix(matrix, this.pivot) : undefined;
    const residual = decomposed ? calculateLinearResidual(matrix, decomposed) : undefined;
    this.localMatrix = cloneMat4(matrix);
    this.matrixAutoUpdate = autoUpdate;
    if (decomposed) {
      this.applyDecomposition(decomposed);
      this.linearResidual = residual;
    }
    return this.markDirty();
  }

  setMatrixAutoUpdate(enabled: boolean): this {
    this.matrixAutoUpdate = enabled;
    return this.markDirty();
  }

  /** Clone of the retained linear remainder; omitted for ordinary TRS. */
  getLinearResidual(): Mat4 | undefined {
    return this.linearResidual ? cloneMat4(this.linearResidual) : undefined;
  }

  /** Restore a linear remainder previously obtained from getLinearResidual(). */
  setLinearResidual(matrix?: Mat4): this {
    if (matrix && (!matrix.every(Number.isFinite) || matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 ||
        matrix[12] !== 0 || matrix[13] !== 0 || matrix[14] !== 0 || matrix[15] !== 1)) {
      throw new Error("Transform linear residual must be a finite affine linear matrix.");
    }
    this.linearResidual = matrix ? cloneMat4(matrix) : undefined;
    return this.markDirty();
  }

  markDirty(): this {
    if (!this.dirty) {
      this.dirty = true;
      for (const listener of [...this.dirtyListeners]) listener();
    }
    return this;
  }

  onDirty(listener: () => void): () => void {
    this.dirtyListeners.add(listener);
    return () => this.dirtyListeners.delete(listener);
  }

  isDirty(): boolean {
    return this.dirty;
  }

  updateWorld(parentWorld?: Mat4, force = false): boolean {
    const staged = this.stageWorldUpdate(parentWorld, force);
    if (!staged) return false;
    this.commitWorldUpdate(staged);
    return true;
  }

  /** Compute a world update without changing published transform state. */
  private stageWorldUpdate(parentWorld?: Mat4, force = false): StagedWorldUpdate | undefined {
    if (!force && !this.dirty) return undefined;
    let localMatrix: Mat4 | undefined;
    if (this.matrixAutoUpdate) {
      localMatrix = composeMat4(this.position, this.rotation, this.scale);
      if (this.linearResidual) localMatrix = multiplyMat4(localMatrix, this.linearResidual);
      const [x, y, z] = this.pivot;
      // The complete linear part is R·S·H; the pivot changes only translation.
      localMatrix[12] += x - (localMatrix[0] * x + localMatrix[4] * y + localMatrix[8] * z);
      localMatrix[13] += y - (localMatrix[1] * x + localMatrix[5] * y + localMatrix[9] * z);
      localMatrix[14] += z - (localMatrix[2] * x + localMatrix[6] * y + localMatrix[10] * z);
    }
    const local = localMatrix ?? this.localMatrix;
    const worldMatrix = parentWorld ? multiplyMat4(parentWorld, local) : cloneMat4(local);
    if (!worldMatrix.every(Number.isFinite)) throw new RangeError("Transform world matrix must contain finite values.");
    return { localMatrix, worldMatrix };
  }

  /** Publish a previously computed world update without notifying listeners. */
  private commitWorldUpdate(staged: StagedWorldUpdate): void {
    if (staged.localMatrix) this.localMatrix = staged.localMatrix;
    this.worldMatrix = staged.worldMatrix;
    this.inverseWorldCache = undefined;
    this.inverseWorldCacheSource = undefined;
    this.assignedInverseWorld = undefined;
    this.assignedInverseWorldSource = undefined;
    this.dirty = false;
  }

  /** Compute a replacement local transform without changing this node. */
  private stageLocalUpdate(matrix: Mat4): StagedLocalUpdate {
    const decomposed = decomposePivotMatrix(matrix, this.pivot);
    return {
      ...decomposed,
      linearResidual: calculateLinearResidual(matrix, decomposed),
      localMatrix: cloneMat4(matrix)
    };
  }

  /** Publish a staged local transform without dirtying or notifying. */
  private commitLocalUpdate(staged: StagedLocalUpdate): void {
    this.applyDecomposition(staged);
    this.linearResidual = staged.linearResidual;
    this.localMatrix = staged.localMatrix;
  }

  /** Set the dirty flag and capture its transition listeners for later delivery. */
  private stageDirtyNotification(): Array<() => void> | undefined {
    if (this.dirty) return undefined;
    this.dirty = true;
    return [...this.dirtyListeners];
  }

  private applyDecomposition(value: { position: Vec3; rotation: Quat; scale: Vec3 }): void {
    this.position.splice(0, 3, ...value.position);
    this.rotation.splice(0, 4, ...value.rotation);
    this.scale.splice(0, 3, ...value.scale);
  }
}

function sameMatrix(left: Readonly<Mat4> | undefined, right: Readonly<Mat4>): boolean {
  return left !== undefined && left.every((entry, index) => Object.is(entry, right[index]));
}

/** Recover authored position from m.translation = position + pivot - (R·S)pivot. */
function decomposePivotMatrix(matrix: Mat4, pivot: Readonly<Vec3>): { position: Vec3; rotation: Quat; scale: Vec3 } {
  if (!matrix.every(Number.isFinite)) throw new Error("Transform local matrix must contain finite values.");
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
    throw new Error("Transform local matrix must be affine.");
  }
  const determinant = matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9])
    - matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9])
    + matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
  const positiveBasis = cloneMat4(matrix);
  if (determinant < 0) {
    positiveBasis[0] *= -1;
    positiveBasis[1] *= -1;
    positiveBasis[2] *= -1;
  }
  const columnLengths = [0, 4, 8].map((column) =>
    Math.hypot(matrix[column]!, matrix[column + 1]!, matrix[column + 2]!)
  );
  // Zero columns and dependent nonzero columns have no unique rotation/scale
  // decomposition. A relative determinant also keeps nearly dependent bases
  // in the residual, avoiding a numerically unstable quaternion decomposition.
  const hasSmallOrNonfiniteColumn = columnLengths.some((length) => length <= 1e-8 || !Number.isFinite(length));
  let relativeDeterminant = 0;
  if (!hasSmallOrNonfiniteColumn) {
    const [sx, sy, sz] = columnLengths as [number, number, number];
    relativeDeterminant = (matrix[0] / sx) * ((matrix[5] / sy) * (matrix[10] / sz) - (matrix[6] / sy) * (matrix[9] / sz))
      - (matrix[4] / sy) * ((matrix[1] / sx) * (matrix[10] / sz) - (matrix[2] / sx) * (matrix[9] / sz))
      + (matrix[8] / sz) * ((matrix[1] / sx) * (matrix[6] / sy) - (matrix[2] / sx) * (matrix[5] / sy));
  }
  const useResidualBasis = hasSmallOrNonfiniteColumn || !Number.isFinite(determinant) || Math.abs(relativeDeterminant) <= 1e-12;
  const value = useResidualBasis
    ? { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as Quat, scale: [1, 1, 1] as Vec3 }
    : decomposeMat4(positiveBasis);
  if (determinant < 0 && !useResidualBasis) value.scale[0] *= -1;
  const [x, y, z] = pivot;
  value.position = [
    matrix[12] - x + matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[13] - y + matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[14] - z + matrix[2] * x + matrix[6] * y + matrix[10] * z
  ];
  return value;
}

function calculateLinearResidual(matrix: Mat4, value: { rotation: Quat; scale: Vec3 }): Mat4 | undefined {
  const basis = composeMat4([0, 0, 0], value.rotation, value.scale);
  const desired = cloneMat4(matrix);
  desired[12] = desired[13] = desired[14] = 0;
  if (desired.every((entry, index) => Math.abs(entry - basis[index]!) <= 1e-10 * Math.max(1, Math.abs(entry)))) return undefined;
  return multiplyMat4(invertMat4(basis), desired);
}

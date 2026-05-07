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

export class TransformNode {
  private dirty = true;
  private readonly dirtyListeners = new Set<() => void>();
  readonly position: Vec3 = [0, 0, 0];
  readonly rotation: Quat = [0, 0, 0, 1];
  readonly scale: Vec3 = [1, 1, 1];
  localMatrix: Mat4 = identityMat4();
  worldMatrix: Mat4 = identityMat4();
  inverseWorldMatrix: Mat4 = identityMat4();

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

  setFromLocalMatrix(matrix: Mat4): this {
    const decomposed = decomposeMat4(matrix);
    this.position[0] = decomposed.position[0];
    this.position[1] = decomposed.position[1];
    this.position[2] = decomposed.position[2];
    this.rotation[0] = decomposed.rotation[0];
    this.rotation[1] = decomposed.rotation[1];
    this.rotation[2] = decomposed.rotation[2];
    this.rotation[3] = decomposed.rotation[3];
    this.scale[0] = decomposed.scale[0];
    this.scale[1] = decomposed.scale[1];
    this.scale[2] = decomposed.scale[2];
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
    const shouldUpdate = force || this.dirty;
    if (!shouldUpdate) return false;
    this.localMatrix = composeMat4(this.position, this.rotation, this.scale);
    this.worldMatrix = parentWorld ? multiplyMat4(parentWorld, this.localMatrix) : cloneMat4(this.localMatrix);
    this.inverseWorldMatrix = invertMat4(this.worldMatrix);
    this.dirty = false;
    return true;
  }
}

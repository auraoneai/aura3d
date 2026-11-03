import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { Quat } from "./RigidBody.js";
import type { Vec3 } from "./Shape.js";

type MutableQuat = [number, number, number, number];
type MutableVec3 = [number, number, number];
type Basis3 = [MutableVec3, MutableVec3, MutableVec3];
type AffinePose = { readonly origin: MutableVec3; readonly basis: Basis3 };
type QuaternionObject = {
  x: number;
  y: number;
  z: number;
  w: number;
  set?: (x: number, y: number, z: number, w: number) => void;
  toArray?: () => readonly number[];
};

export type ScenePhysicsNode = {
  /** Local transform; parent transforms are composed when world accessors are absent. */
  position?: [number, number, number];
  scale?: Vec3;
  parent?: ScenePhysicsNode | null;
  rotation?: MutableQuat;
  quaternion?: MutableQuat | QuaternionObject;
  getWorldPosition?: () => Vec3;
  getWorldQuaternion?: () => Quat;
  getWorldScale?: () => Vec3;
  getQuaternion?: () => Quat;
  setWorldPosition?: (position: Vec3) => void;
  setWorldQuaternion?: (rotation: Quat) => void;
  setPosition?: (position: Vec3) => void;
  setRotation?: (rotation: Quat) => void;
  setQuaternion?: (rotation: Quat) => void;
};

export type ScenePhysicsBinding = {
  readonly bodyId: number;
  readonly node: ScenePhysicsNode;
  readonly mode?: "dynamic" | "kinematic";
};

type BridgeBody = NonNullable<ReturnType<PhysicsWorld["getBody"]>>;
type KinematicUpdate = { body: BridgeBody; position?: Vec3; rotation?: Quat };
type DynamicUpdate = { node: ScenePhysicsNode; worldPosition: Vec3; localPosition: Vec3; worldRotation: Quat; localRotation: Quat };

// A render node must have a single physics authority, even if two bridges are
// accidentally pointed at different worlds whose numeric body IDs happen to match.
const nodeOwners = new WeakMap<ScenePhysicsNode, ScenePhysicsBridge>();

export class ScenePhysicsBridge {
  private readonly bindings: ScenePhysicsBinding[] = [];
  private owner?: Pick<PhysicsWorld, "getBody">;
  private disposed = false;

  bind(binding: ScenePhysicsBinding): void {
    this.assertActive();
    if (!Number.isInteger(binding.bodyId) || binding.bodyId <= 0) {
      throw new Error("Scene physics binding bodyId must be a positive integer.");
    }
    if (binding.mode !== undefined && binding.mode !== "dynamic" && binding.mode !== "kinematic") {
      throw new Error(`Unsupported scene physics binding mode '${String(binding.mode)}'.`);
    }
    if (this.bindings.some((existing) => existing.bodyId === binding.bodyId)) {
      throw new Error(`Body ${binding.bodyId} is already bound to a scene node.`);
    }
    if (nodeOwners.has(binding.node)) {
      throw new Error("Scene node is already bound to a physics body.");
    }
    nodeOwners.set(binding.node, this);
    this.bindings.push(binding);
  }

  unbind(bodyId: number): void {
    this.assertActive();
    const index = this.bindings.findIndex((binding) => binding.bodyId === bodyId);
    if (index >= 0) {
      nodeOwners.delete(this.bindings[index]!.node);
      this.bindings.splice(index, 1);
    }
  }

  pushKinematic(world: Pick<PhysicsWorld, "getBody">): void {
    this.claimWorld(world);
    this.applyKinematic(this.stageKinematic(world));
  }

  private stageKinematic(world: Pick<PhysicsWorld, "getBody">): KinematicUpdate[] {
    // Stage the whole batch before touching any body. In particular, an
    // unsupported affine in a later binding must not leave earlier bodies at
    // only their new position or rotation.
    const pending: KinematicUpdate[] = [];
    for (const binding of this.bindings) {
      if (binding.mode !== "kinematic") continue;
      const body = this.requireBody(world, binding.bodyId);
      const position = readNodePosition(binding.node);
      const pose = worldAffine(binding.node, new Map());
      const worldRotation = rigidRotation(pose.basis);
      const rotation = binding.node.parent || binding.node.getWorldQuaternion || readLocalRotation(binding.node)
        ? worldRotation : undefined;
      pending.push({ body, position: position ? [...position] as MutableVec3 : undefined, rotation });
    }
    return pending;
  }

  private applyKinematic(pending: readonly KinematicUpdate[]): void {
    for (const { body, position, rotation } of pending) {
      if (position) body.setPosition(position);
      if (rotation) body.setRotation(rotation);
    }
  }

  pullDynamic(world: Pick<PhysicsWorld, "getBody">, alpha = 1): void {
    this.claimWorld(world);
    this.applyDynamic(this.stageDynamic(world, alpha));
  }

  private stageDynamic(world: Pick<PhysicsWorld, "getBody">, alpha: number): DynamicUpdate[] {
    const interpolationAlpha = clamp01(alpha);
    // A child must be converted against its parent's new world transform, even
    // when bindings were registered in the opposite order.
    const dynamicBindings = this.bindings
      .filter((binding) => binding.mode !== "kinematic")
      .map((binding) => ({ binding, depth: hierarchyDepth(binding.node) }))
      .sort((a, b) => a.depth - b.depth);
    const staged = new Map<ScenePhysicsNode, AffinePose>();
    const pending: DynamicUpdate[] = [];
    for (const { binding } of dynamicBindings) {
      const body = this.requireBody(world, binding.bodyId);
      const node = binding.node;
      const worldPosition = finitePosition(interpolatePosition(body.previousPosition, body.position, interpolationAlpha));
      const worldRotation = interpolateRotation(body.previousRotation, body.rotation, interpolationAlpha);
      const parent = node.parent ? worldAffine(node.parent, staged, new Set([node])) : identityAffine();
      const scale = validScale(node.scale ?? [1, 1, 1]);
      const localPosition = inverseAffinePoint(parent, worldPosition);
      const localRotation = localRotationForWorld(parent.basis, worldRotation, scale);
      const pose = composeAffine(parent, localPosition, localRotation, scale);
      // Recheck after finite arithmetic: transforms that round to shear or
      // reflection cannot be represented by a rigid body orientation.
      rigidRotation(pose.basis);
      staged.set(node, pose);
      pending.push({ node, worldPosition, localPosition, worldRotation, localRotation });
    }
    return pending;
  }

  private applyDynamic(pending: readonly DynamicUpdate[]): void {
    for (const entry of pending) {
      writeNodePosition(entry.node, entry.worldPosition, entry.localPosition);
      writeNodeRotation(entry.node, entry.worldRotation, entry.localRotation);
    }
  }

  update(world: Pick<PhysicsWorld, "getBody">, alpha = 1): void {
    this.claimWorld(world);
    const kinematic = this.stageKinematic(world);
    const dynamic = this.stageDynamic(world, alpha);
    this.applyKinematic(kinematic);
    this.applyDynamic(dynamic);
  }

  /** Release node ownership. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    for (const binding of this.bindings) nodeOwners.delete(binding.node);
    this.bindings.length = 0;
    this.owner = undefined;
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Scene physics bridge has been disposed.");
  }

  private claimWorld(world: Pick<PhysicsWorld, "getBody">): void {
    this.assertActive();
    if (this.owner && this.owner !== world) {
      throw new Error("Scene physics bridge is already owned by a different world.");
    }
    this.owner = world;
  }

  private requireBody(world: Pick<PhysicsWorld, "getBody">, id: number) {
    const body = world.getBody(id);
    if (!body) throw new Error(`Scene physics binding references missing body ${id}.`);
    return body;
  }
}

export function interpolatePosition(previous: Vec3, current: Vec3, alpha: number): [number, number, number] {
  const t = clamp01(alpha);
  return [
    previous[0] + (current[0] - previous[0]) * t,
    previous[1] + (current[1] - previous[1]) * t,
    previous[2] + (current[2] - previous[2]) * t
  ];
}

export function interpolateRotation(previous: Quat, current: Quat, alpha: number): MutableQuat {
  const t = clamp01(alpha);
  const currentSign = dotQuat(previous, current) < 0 ? -1 : 1;
  const x = previous[0] + (current[0] * currentSign - previous[0]) * t;
  const y = previous[1] + (current[1] * currentSign - previous[1]) * t;
  const z = previous[2] + (current[2] * currentSign - previous[2]) * t;
  const w = previous[3] + (current[3] * currentSign - previous[3]) * t;
  return normalizeRotation([x, y, z, w]);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Physics interpolation alpha must be finite.");
  }
  return Math.min(1, Math.max(0, value));
}

function dotQuat(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function readNodePosition(node: ScenePhysicsNode, visited = new Set<ScenePhysicsNode>()): Vec3 | undefined {
  visitNode(node, visited);
  if (node.getWorldPosition) return finitePosition(node.getWorldPosition());
  if (!node.position) return undefined;
  const local = finitePosition(node.position);
  return node.parent ? localToWorldPoint(node.parent, local, visited) : local;
}

// Compose each ancestor in order instead of multiplying world scales: rotation and
// non-uniform scale do not commute, so collapsing them would lose the hierarchy.
function localToWorldPoint(node: ScenePhysicsNode, point: Vec3, visited: Set<ScenePhysicsNode>): Vec3 {
  visitNode(node, visited);
  // When local data exists, traverse the hierarchy: a world quaternion and
  // scale cannot represent the shear produced by rotated non-uniform scales.
  if (node.getWorldPosition && node.getWorldQuaternion && (!node.parent || !node.position)) {
    const position = finitePosition(node.getWorldPosition());
    const rotation = normalizeRotation(node.getWorldQuaternion());
    const scale = node.getWorldScale ? validScale(node.getWorldScale()) : validScale(node.scale ?? [1, 1, 1]);
    const offset = rotateVector(multiplyVector(point, scale), rotation);
    return [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
  }
  const position = finitePosition(node.position ?? [0, 0, 0]);
  const rotation = readLocalRotation(node) ?? [0, 0, 0, 1];
  const offset = rotateVector(multiplyVector(point, validScale(node.scale ?? [1, 1, 1])), rotation);
  const local: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
  return node.parent ? localToWorldPoint(node.parent, local, visited) : local;
}

function readLocalRotation(node: ScenePhysicsNode): MutableQuat | undefined {
  if (node.getQuaternion) return normalizeRotation(node.getQuaternion());
  if (Array.isArray(node.rotation)) return normalizeRotation(node.rotation);
  if (Array.isArray(node.quaternion)) return normalizeRotation(node.quaternion);
  if (node.quaternion?.toArray) return normalizeRotation(node.quaternion.toArray());
  if (node.quaternion) return normalizeRotation([node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w]);
  return undefined;
}

function writeNodePosition(node: ScenePhysicsNode, position: Vec3, local: Vec3): void {
  if (node.setWorldPosition) {
    node.setWorldPosition(position);
    return;
  }
  if (node.setPosition) node.setPosition(local);
  else if (node.position) {
    node.position[0] = local[0]; node.position[1] = local[1]; node.position[2] = local[2];
  } else node.position = [local[0], local[1], local[2]];
}

function writeNodeRotation(node: ScenePhysicsNode, rotation: Quat, localRotation: Quat): void {
  let normalized = normalizeRotation(rotation);
  if (node.setWorldQuaternion) {
    node.setWorldQuaternion(normalized);
    return;
  }
  normalized = normalizeRotation(localRotation);
  if (node.setQuaternion) node.setQuaternion(normalized);
  else if (node.setRotation) node.setRotation(normalized);
  else if (Array.isArray(node.rotation)) {
    node.rotation[0] = normalized[0]; node.rotation[1] = normalized[1]; node.rotation[2] = normalized[2]; node.rotation[3] = normalized[3];
  } else if (Array.isArray(node.quaternion)) {
    node.quaternion[0] = normalized[0]; node.quaternion[1] = normalized[1]; node.quaternion[2] = normalized[2]; node.quaternion[3] = normalized[3];
  } else if (node.quaternion?.set) node.quaternion.set(normalized[0], normalized[1], normalized[2], normalized[3]);
  else if (node.quaternion) {
    node.quaternion.x = normalized[0]; node.quaternion.y = normalized[1]; node.quaternion.z = normalized[2]; node.quaternion.w = normalized[3];
  } else node.rotation = [normalized[0], normalized[1], normalized[2], normalized[3]];
}

function visitNode(node: ScenePhysicsNode, visited: Set<ScenePhysicsNode>): void {
  if (visited.has(node)) throw new Error("Scene physics node parent hierarchy contains a cycle.");
  visited.add(node);
}

function hierarchyDepth(node: ScenePhysicsNode): number {
  const visited = new Set<ScenePhysicsNode>();
  let depth = 0;
  let current: ScenePhysicsNode | null | undefined = node;
  while (current) {
    visitNode(current, visited);
    current = current.parent;
    if (current) depth += 1;
  }
  return depth;
}

/** A representable world pose may be scaled, but its axes must stay orthogonal. */
const AFFINE_ORTHOGONAL_TOLERANCE = 1e-8;

function identityAffine(): AffinePose {
  return { origin: [0, 0, 0], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
}

function affineVector(basis: Basis3, value: Vec3): MutableVec3 {
  const out: MutableVec3 = [
    basis[0][0] * value[0] + basis[1][0] * value[1] + basis[2][0] * value[2],
    basis[0][1] * value[0] + basis[1][1] * value[1] + basis[2][1] * value[2],
    basis[0][2] * value[0] + basis[1][2] * value[1] + basis[2][2] * value[2]
  ];
  finitePosition(out);
  return out;
}

function rotationBasis(rotation: Quat, scale: Vec3 = [1, 1, 1]): Basis3 {
  const q = normalizeRotation(rotation);
  return [
    rotateVector([scale[0], 0, 0], q),
    rotateVector([0, scale[1], 0], q),
    rotateVector([0, 0, scale[2]], q)
  ];
}

function composeAffine(parent: AffinePose, position: Vec3, rotation: Quat, scale: Vec3): AffinePose {
  const offset = affineVector(parent.basis, finitePosition(position));
  const origin: MutableVec3 = [parent.origin[0] + offset[0], parent.origin[1] + offset[1], parent.origin[2] + offset[2]];
  finitePosition(origin);
  const local = rotationBasis(rotation, validScale(scale));
  return { origin, basis: [affineVector(parent.basis, local[0]), affineVector(parent.basis, local[1]), affineVector(parent.basis, local[2])] };
}

/**
 * Build the actual affine, rather than multiplying ancestor quaternions. The
 * latter loses shear and can be wrong even when axis permutations make the
 * resulting transform representable. Staged parents are used during pulls so
 * every child is checked against the parent pose that will be published.
 */
function worldAffine(node: ScenePhysicsNode, staged: ReadonlyMap<ScenePhysicsNode, AffinePose>, visited = new Set<ScenePhysicsNode>()): AffinePose {
  visitNode(node, visited);
  const stagedPose = staged.get(node);
  if (stagedPose) return stagedPose;
  const localRotation = readLocalRotation(node);
  const localScale = validScale(node.scale ?? [1, 1, 1]);
  if (!node.parent) {
    const position = node.getWorldPosition ? finitePosition(node.getWorldPosition()) : finitePosition(node.position ?? [0, 0, 0]);
    const rotation = node.getWorldQuaternion ? normalizeRotation(node.getWorldQuaternion()) : localRotation ?? [0, 0, 0, 1];
    const scale = node.getWorldScale ? validScale(node.getWorldScale()) : localScale;
    return composeAffine(identityAffine(), position, rotation, scale);
  }
  const parent = worldAffine(node.parent, staged, visited);
  if (node.getWorldPosition && node.getWorldQuaternion && !node.position) {
    // An opaque world quaternion/scale cannot expose a sheared matrix. It is
    // safe to use it only when the known parent applies a uniform proper scale.
    const parentRotation = rigidRotation(parent.basis);
    void parentRotation;
    const parentLengths = basisLengths(parent.basis);
    const max = Math.max(...parentLengths), min = Math.min(...parentLengths);
    if (max - min > AFFINE_ORTHOGONAL_TOLERANCE * max) {
      throw new Error("Scene physics node world transform is ambiguous under a nonuniform parent; provide local transform data.");
    }
    const scale = node.getWorldScale ? validScale(node.getWorldScale()) : multiplyVector(localScale, [parentLengths[0], parentLengths[0], parentLengths[0]]);
    return composeAffine(identityAffine(), finitePosition(node.getWorldPosition()), normalizeRotation(node.getWorldQuaternion()), scale);
  }
  const rotation = localRotation ?? (node.getWorldQuaternion
    ? localRotationForWorld(parent.basis, normalizeRotation(node.getWorldQuaternion()), localScale)
    : [0, 0, 0, 1]);
  const result = composeAffine(parent, finitePosition(node.position ?? [0, 0, 0]), rotation, localScale);
  // A direct world-position accessor remains authoritative for callers that
  // do not expose a local position. It does not change the computed basis.
  if (!node.position && node.getWorldPosition) return { origin: [...finitePosition(node.getWorldPosition())] as MutableVec3, basis: result.basis };
  return result;
}

function basisLengths(basis: Basis3): MutableVec3 {
  const lengths: MutableVec3 = [Math.hypot(...basis[0]), Math.hypot(...basis[1]), Math.hypot(...basis[2])];
  if (lengths.some((length) => !Number.isFinite(length) || length === 0)) {
    throw new Error("Scene physics transform is singular or non-finite.");
  }
  return lengths;
}

function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a: Vec3, b: Vec3): MutableVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unitBasis(basis: Basis3): { axes: Basis3; lengths: MutableVec3; determinant: number } {
  const lengths = basisLengths(basis);
  const axes = basis.map((axis, i) => [axis[0] / lengths[i]!, axis[1] / lengths[i]!, axis[2] / lengths[i]!] as MutableVec3) as Basis3;
  const determinant = dot3(axes[0], cross3(axes[1], axes[2]));
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) {
    throw new Error("Scene physics transform is singular or numerically ambiguous.");
  }
  return { axes, lengths, determinant };
}

function rigidRotation(basis: Basis3): MutableQuat {
  const { axes, determinant } = unitBasis(basis);
  if (determinant < 0) throw new Error("Scene physics transform has an unsupported reflection.");
  if (Math.abs(dot3(axes[0], axes[1])) > AFFINE_ORTHOGONAL_TOLERANCE ||
      Math.abs(dot3(axes[0], axes[2])) > AFFINE_ORTHOGONAL_TOLERANCE ||
      Math.abs(dot3(axes[1], axes[2])) > AFFINE_ORTHOGONAL_TOLERANCE) {
    throw new Error("Scene physics transform has unsupported shear.");
  }
  const [a, b, c] = axes;
  const trace = a[0] + b[1] + c[2];
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (b[2] - c[1]) / s; y = (c[0] - a[2]) / s; z = (a[1] - b[0]) / s;
  } else if (a[0] > b[1] && a[0] > c[2]) {
    const s = Math.sqrt(1 + a[0] - b[1] - c[2]) * 2;
    w = (b[2] - c[1]) / s; x = s / 4; y = (b[0] + a[1]) / s; z = (c[0] + a[2]) / s;
  } else if (b[1] > c[2]) {
    const s = Math.sqrt(1 + b[1] - a[0] - c[2]) * 2;
    w = (c[0] - a[2]) / s; x = (b[0] + a[1]) / s; y = s / 4; z = (c[1] + b[2]) / s;
  } else {
    const s = Math.sqrt(1 + c[2] - a[0] - b[1]) * 2;
    w = (a[1] - b[0]) / s; x = (c[0] + a[2]) / s; y = (c[1] + b[2]) / s; z = s / 4;
  }
  return normalizeRotation([x, y, z, w]);
}

/** Invert a general nonsingular parent basis, including representable shears. */
function inverseBasisVector(basis: Basis3, value: Vec3): MutableVec3 {
  const { axes, lengths, determinant } = unitBasis(basis);
  const out: MutableVec3 = [
    dot3(cross3(axes[1], axes[2]), value) / determinant / lengths[0],
    dot3(cross3(axes[2], axes[0]), value) / determinant / lengths[1],
    dot3(cross3(axes[0], axes[1]), value) / determinant / lengths[2]
  ];
  finitePosition(out);
  return out;
}

function inverseAffinePoint(parent: AffinePose, point: Vec3): MutableVec3 {
  return inverseBasisVector(parent.basis, [point[0] - parent.origin[0], point[1] - parent.origin[1], point[2] - parent.origin[2]]);
}

/** Solve A * Rlocal * Slocal = Rworld * Sworld for a positive world scale. */
function localRotationForWorld(parent: Basis3, rotation: Quat, scale: Vec3): MutableQuat {
  const desired = rotationBasis(rotation);
  const candidates = desired.map((axis, i) => {
    const local = inverseBasisVector(parent, axis);
    const length = Math.hypot(...local);
    if (!Number.isFinite(length) || length === 0) throw new Error("Scene physics transform is singular or non-finite.");
    const sign = Math.sign(scale[i]!);
    return [local[0] * sign / length, local[1] * sign / length, local[2] * sign / length] as MutableVec3;
  }) as Basis3;
  try { return rigidRotation(candidates); }
  catch (error) {
    throw new Error("Scene physics world rotation cannot be represented without shear or reflection under this parent.", { cause: error });
  }
}

function finitePosition(value: Vec3): Vec3 {
  if (value.length !== 3 || !value.every(Number.isFinite)) throw new Error("Scene physics node position must be a finite 3D vector.");
  return value;
}

function validScale(value: Vec3): Vec3 {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component) || Math.abs(component) < 1e-9)) {
    throw new Error("Scene physics parent scale must have finite nonzero components.");
  }
  return value;
}

function multiplyVector(a: Vec3, b: Vec3): Vec3 { return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; }
function rotateVector(v: Vec3, q: Quat): MutableVec3 {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
  const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
  const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [v[0] + q[3] * tx + q[1] * tz - q[2] * ty,
    v[1] + q[3] * ty + q[2] * tx - q[0] * tz,
    v[2] + q[3] * tz + q[0] * ty - q[1] * tx];
}

function normalizeRotation(rotation: readonly number[]): MutableQuat {
  if (
    rotation.length !== 4 ||
    !Number.isFinite(rotation[0]) ||
    !Number.isFinite(rotation[1]) ||
    !Number.isFinite(rotation[2]) ||
    !Number.isFinite(rotation[3])
  ) {
    throw new Error("Scene physics node rotation must be a finite quaternion.");
  }
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (length <= 1e-9) {
    throw new Error("Scene physics node rotation quaternion cannot be zero.");
  }
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}

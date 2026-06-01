import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { Quat } from "./RigidBody.js";
import type { Vec3 } from "./Shape.js";

type MutableQuat = [number, number, number, number];
type QuaternionObject = {
  x: number;
  y: number;
  z: number;
  w: number;
  set?: (x: number, y: number, z: number, w: number) => void;
  toArray?: () => readonly number[];
};

export type ScenePhysicsNode = {
  position?: [number, number, number];
  rotation?: MutableQuat;
  quaternion?: MutableQuat | QuaternionObject;
  getWorldPosition?: () => Vec3;
  getWorldQuaternion?: () => Quat;
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

export class ScenePhysicsBridge {
  private readonly bindings: ScenePhysicsBinding[] = [];

  bind(binding: ScenePhysicsBinding): void {
    if (this.bindings.some((existing) => existing.bodyId === binding.bodyId)) {
      throw new Error(`Body ${binding.bodyId} is already bound to a scene node.`);
    }
    this.bindings.push(binding);
  }

  unbind(bodyId: number): void {
    const index = this.bindings.findIndex((binding) => binding.bodyId === bodyId);
    if (index >= 0) {
      this.bindings.splice(index, 1);
    }
  }

  pushKinematic(world: Pick<PhysicsWorld, "getBody">): void {
    for (const binding of this.bindings) {
      if (binding.mode !== "kinematic") {
        continue;
      }
      const body = world.getBody(binding.bodyId);
      const position = readNodePosition(binding.node);
      if (body && position) {
        body.setPosition(position);
      }
      const rotation = readNodeRotation(binding.node);
      if (body && rotation) {
        body.setRotation(rotation);
      }
    }
  }

  pullDynamic(world: Pick<PhysicsWorld, "getBody">, alpha = 1): void {
    const interpolationAlpha = clamp01(alpha);
    for (const binding of this.bindings) {
      if (binding.mode === "kinematic") {
        continue;
      }
      const body = world.getBody(binding.bodyId);
      if (body) {
        writeNodePosition(binding.node, interpolatePosition(body.previousPosition, body.position, interpolationAlpha));
        writeNodeRotation(binding.node, interpolateRotation(body.previousRotation, body.rotation, interpolationAlpha));
      }
    }
  }

  update(world: Pick<PhysicsWorld, "getBody">, alpha = 1): void {
    this.pushKinematic(world);
    this.pullDynamic(world, alpha);
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

function readNodePosition(node: ScenePhysicsNode): Vec3 | undefined {
  if (node.getWorldPosition) {
    return node.getWorldPosition();
  }
  return node.position;
}

function readNodeRotation(node: ScenePhysicsNode): Quat | undefined {
  if (node.getWorldQuaternion) {
    return normalizeRotation(node.getWorldQuaternion());
  }
  if (node.getQuaternion) {
    return normalizeRotation(node.getQuaternion());
  }
  if (Array.isArray(node.rotation)) {
    return normalizeRotation(node.rotation);
  }
  if (Array.isArray(node.quaternion)) {
    return normalizeRotation(node.quaternion);
  }
  if (node.quaternion?.toArray) {
    return normalizeRotation(node.quaternion.toArray());
  }
  if (node.quaternion) {
    return normalizeRotation([node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w]);
  }
  return undefined;
}

function writeNodePosition(node: ScenePhysicsNode, position: Vec3): void {
  if (node.setWorldPosition) {
    node.setWorldPosition(position);
  } else if (node.setPosition) {
    node.setPosition(position);
  } else if (node.position) {
    node.position[0] = position[0];
    node.position[1] = position[1];
    node.position[2] = position[2];
  } else {
    node.position = [position[0], position[1], position[2]];
  }
}

function writeNodeRotation(node: ScenePhysicsNode, rotation: Quat): void {
  const normalized = normalizeRotation(rotation);
  if (node.setWorldQuaternion) {
    node.setWorldQuaternion(normalized);
  } else if (node.setQuaternion) {
    node.setQuaternion(normalized);
  } else if (node.setRotation) {
    node.setRotation(normalized);
  } else if (Array.isArray(node.rotation)) {
    node.rotation[0] = normalized[0];
    node.rotation[1] = normalized[1];
    node.rotation[2] = normalized[2];
    node.rotation[3] = normalized[3];
  } else if (Array.isArray(node.quaternion)) {
    node.quaternion[0] = normalized[0];
    node.quaternion[1] = normalized[1];
    node.quaternion[2] = normalized[2];
    node.quaternion[3] = normalized[3];
  } else if (node.quaternion?.set) {
    node.quaternion.set(normalized[0], normalized[1], normalized[2], normalized[3]);
  } else if (node.quaternion) {
    node.quaternion.x = normalized[0];
    node.quaternion.y = normalized[1];
    node.quaternion.z = normalized[2];
    node.quaternion.w = normalized[3];
  } else {
    node.rotation = [normalized[0], normalized[1], normalized[2], normalized[3]];
  }
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

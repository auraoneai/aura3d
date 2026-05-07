import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { Vec3 } from "./Shape.js";

export type ScenePhysicsNode = {
  position?: [number, number, number];
  getWorldPosition?: () => Vec3;
  setWorldPosition?: (position: Vec3) => void;
  setPosition?: (position: Vec3) => void;
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Physics interpolation alpha must be finite.");
  }
  return Math.min(1, Math.max(0, value));
}

function readNodePosition(node: ScenePhysicsNode): Vec3 | undefined {
  if (node.getWorldPosition) {
    return node.getWorldPosition();
  }
  return node.position;
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

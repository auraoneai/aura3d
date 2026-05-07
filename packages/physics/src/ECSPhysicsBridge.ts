import type { PhysicsWorld } from "./PhysicsWorld.js";
import { interpolatePosition } from "./ScenePhysicsBridge.js";
import type { Vec3 } from "./Shape.js";

export type ECSTransformLike = {
  position: [number, number, number];
};

export type ECSPhysicsBinding = {
  readonly bodyId: number;
  readonly transform: ECSTransformLike;
  readonly mode?: "dynamic" | "kinematic";
};

export class ECSPhysicsBridge {
  private readonly bindings = new Map<number, ECSPhysicsBinding>();

  bind(binding: ECSPhysicsBinding): void {
    if (this.bindings.has(binding.bodyId)) {
      throw new Error(`Body ${binding.bodyId} is already bound to an ECS transform.`);
    }
    this.bindings.set(binding.bodyId, binding);
  }

  unbind(bodyId: number): void {
    this.bindings.delete(bodyId);
  }

  pushKinematic(world: Pick<PhysicsWorld, "getBody">): void {
    for (const binding of this.bindings.values()) {
      if (binding.mode !== "kinematic") {
        continue;
      }
      world.getBody(binding.bodyId)?.setPosition(binding.transform.position);
    }
  }

  pullDynamic(world: Pick<PhysicsWorld, "getBody">, alpha = 1): void {
    for (const binding of this.bindings.values()) {
      if (binding.mode === "kinematic") {
        continue;
      }
      const body = world.getBody(binding.bodyId);
      if (!body) {
        continue;
      }
      const interpolated = interpolatePosition(body.previousPosition, body.position, alpha);
      binding.transform.position[0] = interpolated[0];
      binding.transform.position[1] = interpolated[1];
      binding.transform.position[2] = interpolated[2];
    }
  }
}

import type { Collider } from "./Collider.js";
import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { Vec3 } from "./Shape.js";

export type DebugLine = {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly color: Vec3;
};

export class PhysicsDebugDraw {
  buildLines(world: Pick<PhysicsWorld, "colliders" | "getBody">): readonly DebugLine[] {
    const lines: DebugLine[] = [];
    for (const collider of world.colliders()) {
      const body = world.getBody(collider.bodyId);
      if (!body) {
        continue;
      }
      appendColliderLines(lines, collider, body.position);
    }
    return lines;
  }
}

function appendColliderLines(lines: DebugLine[], collider: Collider, position: Vec3): void {
  const color: Vec3 = collider.sensor ? [1, 0.75, 0] : [0.1, 0.8, 1];
  if (collider.shape.kind === "box") {
    const h = collider.shape.halfExtents;
    const corners = [
      [position[0] - h[0], position[1] - h[1], position[2] - h[2]],
      [position[0] + h[0], position[1] - h[1], position[2] - h[2]],
      [position[0] + h[0], position[1] + h[1], position[2] - h[2]],
      [position[0] - h[0], position[1] + h[1], position[2] - h[2]],
      [position[0] - h[0], position[1] - h[1], position[2] + h[2]],
      [position[0] + h[0], position[1] - h[1], position[2] + h[2]],
      [position[0] + h[0], position[1] + h[1], position[2] + h[2]],
      [position[0] - h[0], position[1] + h[1], position[2] + h[2]]
    ] as Vec3[];
    const pairs: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of pairs) {
      lines.push({ from: corners[a]!, to: corners[b]!, color });
    }
  } else if (collider.shape.kind === "sphere") {
    const r = collider.shape.radius;
    lines.push({ from: [position[0] - r, position[1], position[2]], to: [position[0] + r, position[1], position[2]], color });
    lines.push({ from: [position[0], position[1] - r, position[2]], to: [position[0], position[1] + r, position[2]], color });
    lines.push({ from: [position[0], position[1], position[2] - r], to: [position[0], position[1], position[2] + r], color });
  } else if (collider.shape.kind === "plane") {
    lines.push({ from: [-10, position[1], 0], to: [10, position[1], 0], color });
    lines.push({ from: [0, position[1], -10], to: [0, position[1], 10], color });
  } else if (collider.shape.kind === "capsule") {
    const r = collider.shape.radius;
    const h = collider.shape.halfHeight;
    lines.push({ from: [position[0], position[1] - h - r, position[2]], to: [position[0], position[1] + h + r, position[2]], color });
    lines.push({ from: [position[0] - r, position[1], position[2]], to: [position[0] + r, position[1], position[2]], color });
  } else {
    const { vertices, indices } = collider.shape;
    for (let index = 0; index < indices.length; index += 3) {
      const a = translate(vertices[indices[index]!]!, position);
      const b = translate(vertices[indices[index + 1]!]!, position);
      const c = translate(vertices[indices[index + 2]!]!, position);
      lines.push({ from: a, to: b, color });
      lines.push({ from: b, to: c, color });
      lines.push({ from: c, to: a, color });
    }
  }
}

function translate(value: Vec3, position: Vec3): Vec3 {
  return [value[0] + position[0], value[1] + position[1], value[2] + position[2]];
}

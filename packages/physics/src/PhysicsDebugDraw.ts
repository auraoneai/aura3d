import type { Collider } from "./Collider.js";
import type { PhysicsWorld } from "./PhysicsWorld.js";
import type { Vec3 } from "./Shape.js";

export type DebugLine = {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly color: Vec3;
  /**
   * What this line represents, so a consumer can filter or legend it.
   *
   * Without a category every line is an anonymous coloured segment, and a debug overlay that
   * cannot say "these are contacts and those are joints" is decoration rather than a tool.
   */
  readonly category?: DebugLineCategory;
};

export type DebugLineCategory =
  | "collider"
  | "sensor"
  | "contact"
  | "normal"
  | "joint"
  | "sleeping"
  | "raycast";

/** A raycast to draw, so a developer can see the query they cannot otherwise observe. */
export type DebugRaycast = {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly distance: number;
  /** True when the ray hit something; drawn in a different colour. */
  readonly hit?: boolean;
};

export type PhysicsDebugDrawOptions = {
  /** Draw contact points and their normals. */
  readonly contacts?: boolean;
  /** Draw joint anchors and the segment between them. */
  readonly joints?: boolean;
  /** Tint sleeping bodies differently from awake ones. */
  readonly sleeping?: boolean;
  /** Extra rays to visualise, which the world cannot know about. */
  readonly raycasts?: readonly DebugRaycast[];
  /** Length of a drawn contact normal, in world units. */
  readonly normalLength?: number;
};

type DebugWorld = Pick<PhysicsWorld, "colliders" | "getBody"> &
  Partial<Pick<PhysicsWorld, "snapshot" | "constraints">>;

export class PhysicsDebugDraw {
  /**
   * Build debug geometry for a world.
   *
   * WS-1.7 asks for colliders, contacts, normals, joints, sleeping state and raycasts. Only
   * colliders existed, which is why the capability sat at "unproven with 0 consumers" — there was
   * not enough here for a route to consume.
   *
   * Options default to off so the existing single-argument call keeps its previous output exactly.
   */
  buildLines(world: DebugWorld, options: PhysicsDebugDrawOptions = {}): readonly DebugLine[] {
    const lines: DebugLine[] = [];
    const snapshot = options.contacts || options.sleeping ? world.snapshot?.() : undefined;
    const sleepingIds = new Set<number>();
    if (options.sleeping && snapshot) {
      for (const body of snapshot.bodies) {
        if (body.sleeping) sleepingIds.add(body.id);
      }
    }

    for (const collider of world.colliders()) {
      const body = world.getBody(collider.bodyId);
      if (!body) {
        continue;
      }
      appendColliderLines(lines, collider, body.position, sleepingIds.has(body.id));
    }

    if (options.contacts && snapshot) {
      const normalLength = options.normalLength ?? 0.25;
      for (const contact of snapshot.contacts) {
        const point = contact.point;
        if (!point) continue;
        // A short cross at the contact point, then the normal as a ray out of it. Penetration is
        // the number that matters for "is this body inside that one", so it tints the cross.
        const penetrating = contact.penetration > 1e-4;
        const crossColor: Vec3 = penetrating ? [1, 0.2, 0.2] : [0.2, 1, 0.4];
        const size = normalLength * 0.25;
        lines.push({ from: [point[0] - size, point[1], point[2]], to: [point[0] + size, point[1], point[2]], color: crossColor, category: "contact" });
        lines.push({ from: [point[0], point[1] - size, point[2]], to: [point[0], point[1] + size, point[2]], color: crossColor, category: "contact" });
        lines.push({
          from: point,
          to: [
            point[0] + contact.normal[0] * normalLength,
            point[1] + contact.normal[1] * normalLength,
            point[2] + contact.normal[2] * normalLength
          ],
          color: [1, 1, 0.3],
          category: "normal"
        });
      }
    }

    if (options.joints && world.constraints) {
      for (const constraint of world.constraints()) {
        const a = world.getBody(constraint.bodyA.id);
        const b = world.getBody(constraint.bodyB.id);
        if (!a || !b) continue;
        // The segment between the two bodies a joint connects. A joint that has come apart is
        // visible as a segment that keeps growing, which is exactly the failure mode that made
        // the silent no-op on the cannon backend so hard to spot.
        lines.push({ from: a.position, to: b.position, color: [0.9, 0.4, 1], category: "joint" });
      }
    }

    for (const ray of options.raycasts ?? []) {
      const length = Number.isFinite(ray.distance) ? ray.distance : 1;
      lines.push({
        from: ray.origin,
        to: [
          ray.origin[0] + ray.direction[0] * length,
          ray.origin[1] + ray.direction[1] * length,
          ray.origin[2] + ray.direction[2] * length
        ],
        color: ray.hit ? [1, 0.35, 0.35] : [0.5, 0.5, 0.55],
        category: "raycast"
      });
    }

    return lines;
  }
}

function appendColliderLines(lines: DebugLine[], collider: Collider, position: Vec3, sleeping = false): void {
  // Sleeping bodies are drawn dim: a body that has gone to sleep and should not have is otherwise
  // indistinguishable from one that is simply not moving.
  const color: Vec3 = sleeping ? [0.4, 0.42, 0.5] : collider.sensor ? [1, 0.75, 0] : [0.1, 0.8, 1];
  const category: DebugLineCategory = sleeping ? "sleeping" : collider.sensor ? "sensor" : "collider";
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
      lines.push({ from: corners[a]!, to: corners[b]!, color, category });
    }
  } else if (collider.shape.kind === "sphere") {
    const r = collider.shape.radius;
    lines.push({ from: [position[0] - r, position[1], position[2]], to: [position[0] + r, position[1], position[2]], color, category });
    lines.push({ from: [position[0], position[1] - r, position[2]], to: [position[0], position[1] + r, position[2]], color, category });
    lines.push({ from: [position[0], position[1], position[2] - r], to: [position[0], position[1], position[2] + r], color, category });
  } else if (collider.shape.kind === "plane") {
    lines.push({ from: [-10, position[1], 0], to: [10, position[1], 0], color, category });
    lines.push({ from: [0, position[1], -10], to: [0, position[1], 10], color, category });
  } else if (collider.shape.kind === "capsule") {
    const r = collider.shape.radius;
    const h = collider.shape.halfHeight;
    lines.push({ from: [position[0], position[1] - h - r, position[2]], to: [position[0], position[1] + h + r, position[2]], color, category });
    lines.push({ from: [position[0] - r, position[1], position[2]], to: [position[0] + r, position[1], position[2]], color, category });
  } else if (collider.shape.kind === "mesh" || collider.shape.kind === "convex-hull") {
    const { vertices, indices } = collider.shape;
    for (let index = 0; index < indices.length; index += 3) {
      const a = translate(vertices[indices[index]!]!, position);
      const b = translate(vertices[indices[index + 1]!]!, position);
      const c = translate(vertices[indices[index + 2]!]!, position);
      lines.push({ from: a, to: b, color, category });
      lines.push({ from: b, to: c, color, category });
      lines.push({ from: c, to: a, color, category });
    }
  } else {
    const shape = collider.shape;
    const halfWidth = (shape.columns - 1) * shape.cellSize * 0.5;
    const halfDepth = (shape.rows - 1) * shape.cellSize * 0.5;
    const sample = (row: number, column: number): Vec3 => [
      position[0] + column * shape.cellSize - halfWidth,
      position[1] + shape.heights[row * shape.columns + column]!,
      position[2] + row * shape.cellSize - halfDepth
    ];
    for (let row = 0; row < shape.rows; row += 1) {
      for (let column = 0; column < shape.columns; column += 1) {
        if (column + 1 < shape.columns) lines.push({ from: sample(row, column), to: sample(row, column + 1), color, category });
        if (row + 1 < shape.rows) lines.push({ from: sample(row, column), to: sample(row + 1, column), color, category });
      }
    }
  }
}

function translate(value: Vec3, position: Vec3): Vec3 {
  return [value[0] + position[0], value[1] + position[1], value[2] + position[2]];
}

import { PhysicsDebugDraw, type DebugLine, type PhysicsWorld } from "@galileo3d/physics";

export type PhysicsDebugSnapshot = {
  readonly bodyCount: number;
  readonly colliderCount: number;
  readonly contactCount: number;
  readonly lines: readonly DebugLine[];
};

export type PhysicsStackEvidence = {
  readonly bodyCount: number;
  readonly dynamicBodyCount: number;
  readonly contactCount: number;
  readonly lineCount: number;
  readonly minY: number;
  readonly maxY: number;
  readonly settledCount: number;
  readonly bodyPositions: readonly {
    readonly id: number;
    readonly type: string;
    readonly position: readonly [number, number, number];
  }[];
  readonly stableHash: string;
};

export class PhysicsDebugAdapter {
  private readonly draw = new PhysicsDebugDraw();

  buildLines(world: Pick<PhysicsWorld, "colliders" | "getBody">): readonly DebugLine[] {
    return this.draw.buildLines(world);
  }

  snapshot(world: Pick<PhysicsWorld, "colliders" | "bodies" | "getBody" | "snapshot">): PhysicsDebugSnapshot {
    return {
      bodyCount: world.bodies().length,
      colliderCount: world.colliders().length,
      contactCount: world.snapshot().contacts.length,
      lines: this.buildLines(world)
    };
  }

  stackEvidence(world: Pick<PhysicsWorld, "colliders" | "bodies" | "getBody" | "snapshot">, velocityEpsilon = 0.05): PhysicsStackEvidence {
    const snapshot = world.snapshot();
    const lines = this.buildLines(world);
    const bodyPositions = snapshot.bodies.map((body) => ({
      id: body.id,
      type: body.type,
      position: roundVec3(body.position)
    }));
    const dynamicBodies = snapshot.bodies.filter((body) => body.type === "dynamic");
    const settledCount = dynamicBodies.filter((body) => Math.hypot(body.velocity[0], body.velocity[1], body.velocity[2]) <= velocityEpsilon).length;
    const ys = snapshot.bodies.map((body) => body.position[1]);
    const evidenceWithoutHash = {
      bodyCount: snapshot.stats.bodies,
      dynamicBodyCount: dynamicBodies.length,
      contactCount: snapshot.contacts.length,
      lineCount: lines.length,
      minY: roundNumber(ys.length > 0 ? Math.min(...ys) : 0),
      maxY: roundNumber(ys.length > 0 ? Math.max(...ys) : 0),
      settledCount,
      bodyPositions
    };
    return {
      ...evidenceWithoutHash,
      stableHash: stableHash(evidenceWithoutHash)
    };
  }
}

function roundNumber(value: number, places = 6): number {
  return Number(value.toFixed(places));
}

function roundVec3(value: readonly [number, number, number]): [number, number, number] {
  return [roundNumber(value[0]), roundNumber(value[1]), roundNumber(value[2])];
}

function stableHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

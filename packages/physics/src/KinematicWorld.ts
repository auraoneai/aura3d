import { aabbPenetration, overlapsVolume, type ResolvedCollisionVolume } from "./CollisionVolumes.js";
import {
  KinematicBody,
  type KinematicBodyDescriptor,
  type KinematicBodyEvent,
  type KinematicBodyId,
  type KinematicBodySnapshot,
  type KinematicBounds,
  type KinematicStepOptions
} from "./KinematicBody.js";
import { cloneVec3, type Vec3 } from "./Shape.js";

export type KinematicWorldDescriptor = {
  readonly fixedDelta?: number;
  readonly gravity?: number;
  readonly groundY?: number;
  readonly groundSnapDistance?: number;
  readonly bounds?: KinematicBounds;
  readonly lockDepth?: boolean;
  readonly laneZ?: number;
  readonly laneHalfWidth?: number;
  readonly pushboxSeparation?: boolean;
  readonly solverIterations?: number;
};

export type KinematicPushEvent = {
  readonly type: "pushbox-collision";
  readonly bodyA: KinematicBodyId;
  readonly bodyB: KinematicBodyId;
  readonly normal: Vec3;
  readonly penetration: number;
  readonly correctionA: Vec3;
  readonly correctionB: Vec3;
};

export type KinematicWorldEvent = KinematicBodyEvent | KinematicPushEvent;

export type KinematicWorldSnapshot = {
  readonly frame: number;
  readonly fixedDelta: number;
  readonly bodies: readonly KinematicBodySnapshot[];
  readonly events: readonly KinematicWorldEvent[];
};

export class KinematicWorld {
  readonly fixedDelta: number;
  readonly gravity: number;
  readonly groundY: number;
  readonly groundSnapDistance: number;
  readonly bounds: KinematicBounds | undefined;
  readonly lockDepth: boolean;
  readonly laneZ: number;
  readonly laneHalfWidth: number | undefined;
  readonly pushboxSeparation: boolean;
  readonly solverIterations: number;
  private readonly bodiesById = new Map<KinematicBodyId, KinematicBody>();
  private nextBodyId = 1;
  private frame = 0;
  private lastEvents: readonly KinematicWorldEvent[] = [];

  constructor(descriptor: KinematicWorldDescriptor = {}) {
    this.fixedDelta = positiveFinite(descriptor.fixedDelta ?? 1 / 60, "kinematic fixedDelta");
    this.gravity = nonNegativeFinite(Math.abs(descriptor.gravity ?? 24), "kinematic world gravity");
    this.groundY = finite(descriptor.groundY ?? 0, "kinematic world groundY");
    this.groundSnapDistance = nonNegativeFinite(descriptor.groundSnapDistance ?? 0.08, "kinematic world groundSnapDistance");
    this.bounds = descriptor.bounds;
    this.lockDepth = descriptor.lockDepth ?? true;
    this.laneZ = finite(descriptor.laneZ ?? 0, "kinematic world laneZ");
    this.laneHalfWidth = descriptor.laneHalfWidth === undefined ? undefined : nonNegativeFinite(descriptor.laneHalfWidth, "kinematic world laneHalfWidth");
    this.pushboxSeparation = descriptor.pushboxSeparation ?? true;
    this.solverIterations = positiveInteger(descriptor.solverIterations ?? 2, "kinematic world solverIterations");
  }

  createBody(descriptor: KinematicBodyDescriptor = {}): KinematicBody {
    const id = descriptor.id ?? this.nextBodyId;
    if (typeof id === "number" && id >= this.nextBodyId) {
      this.nextBodyId = Math.floor(id) + 1;
    } else {
      this.nextBodyId += 1;
    }
    if (this.bodiesById.has(id)) {
      throw new Error(`Kinematic body ${String(id)} already exists.`);
    }
    const body = new KinematicBody(id, {
      groundY: this.groundY,
      groundSnapDistance: this.groundSnapDistance,
      bounds: this.bounds,
      lockDepth: this.lockDepth,
      laneZ: this.laneZ,
      laneHalfWidth: this.laneHalfWidth,
      gravity: this.gravity,
      ...descriptor
    });
    this.bodiesById.set(body.id, body);
    return body;
  }

  addBody(body: KinematicBody): void {
    if (this.bodiesById.has(body.id)) {
      throw new Error(`Kinematic body ${String(body.id)} already exists.`);
    }
    this.bodiesById.set(body.id, body);
  }

  removeBody(id: KinematicBodyId): void {
    this.bodiesById.delete(id);
  }

  getBody(id: KinematicBodyId): KinematicBody | undefined {
    return this.bodiesById.get(id);
  }

  requireBody(id: KinematicBodyId): KinematicBody {
    const body = this.getBody(id);
    if (!body) {
      throw new Error(`Kinematic body ${String(id)} does not exist.`);
    }
    return body;
  }

  bodies(): readonly KinematicBody[] {
    return Array.from(this.bodiesById.values()).sort(compareBodies);
  }

  step(dt = this.fixedDelta): readonly KinematicWorldEvent[] {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("KinematicWorld.step dt must be finite and positive.");
    }
    const events: KinematicWorldEvent[] = [];
    const options = this.stepOptions();
    for (const body of this.bodies()) {
      events.push(...body.step(dt, options));
    }
    if (this.pushboxSeparation) {
      events.push(...this.resolvePushboxes());
    }
    this.frame += 1;
    this.lastEvents = events;
    return events;
  }

  resolvePushboxes(): readonly KinematicPushEvent[] {
    const events: KinematicPushEvent[] = [];
    const options = this.stepOptions();
    for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
      const bodies = this.bodies();
      for (let aIndex = 0; aIndex < bodies.length; aIndex += 1) {
        for (let bIndex = aIndex + 1; bIndex < bodies.length; bIndex += 1) {
          const bodyA = bodies[aIndex]!;
          const bodyB = bodies[bIndex]!;
          const pushA = bodyA.resolvedPushbox();
          const pushB = bodyB.resolvedPushbox();
          const event = resolvePushPair(bodyA, bodyB, pushA, pushB, this.lockDepth);
          if (event) {
            bodyA.constrain(options);
            bodyB.constrain(options);
            events.push(event);
          }
        }
      }
    }
    return events;
  }

  snapshot(): KinematicWorldSnapshot {
    return {
      frame: this.frame,
      fixedDelta: this.fixedDelta,
      bodies: this.bodies().map((body) => body.snapshot()),
      events: this.lastEvents.map(cloneWorldEvent)
    };
  }

  private stepOptions(): KinematicStepOptions {
    return {
      gravity: this.gravity,
      groundY: this.groundY,
      groundSnapDistance: this.groundSnapDistance,
      bounds: this.bounds,
      lockDepth: this.lockDepth,
      laneZ: this.laneZ,
      laneHalfWidth: this.laneHalfWidth
    };
  }
}

function resolvePushPair(
  bodyA: KinematicBody,
  bodyB: KinematicBody,
  pushA: ResolvedCollisionVolume,
  pushB: ResolvedCollisionVolume,
  lockDepth: boolean
): KinematicPushEvent | null {
  if (!overlapsVolume(pushA, pushB)) {
    return null;
  }
  const penetration = aabbPenetration(pushA.bounds, pushB.bounds);
  if (!penetration) {
    return null;
  }
  const overlapX = penetration.overlap[0];
  const overlapZ = penetration.overlap[2];
  const useZ = !lockDepth && overlapZ < overlapX;
  const axisIndex = useZ ? 2 : 0;
  const axis = useZ ? "z" : "x";
  const centerA = pushA.center[axisIndex];
  const centerB = pushB.center[axisIndex];
  const tieBreak = compareIds(bodyA.id, bodyB.id) <= 0 ? -1 : 1;
  const direction = centerA === centerB ? tieBreak : centerA < centerB ? -1 : 1;
  const depth = useZ ? overlapZ : overlapX;
  if (depth <= 0) {
    return null;
  }
  const correctionA: [number, number, number] = [0, 0, 0];
  const correctionB: [number, number, number] = [0, 0, 0];
  correctionA[axisIndex] = direction * depth * 0.5;
  correctionB[axisIndex] = -direction * depth * 0.5;
  bodyA.translate(correctionA);
  bodyB.translate(correctionB);
  if (bodyA.velocity[axisIndex] * direction < 0) {
    bodyA.stopAxis(axis);
  }
  if (bodyB.velocity[axisIndex] * -direction < 0) {
    bodyB.stopAxis(axis);
  }
  const normal: [number, number, number] = [0, 0, 0];
  normal[axisIndex] = direction;
  return {
    type: "pushbox-collision",
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal,
    penetration: depth,
    correctionA,
    correctionB
  };
}

function cloneWorldEvent(event: KinematicWorldEvent): KinematicWorldEvent {
  switch (event.type) {
    case "jump":
    case "land":
    case "bounds":
    case "ground-snap":
      return {
        ...event,
        position: cloneVec3(event.position)
      };
    case "dash":
      return {
        ...event,
        position: cloneVec3(event.position),
        velocity: cloneVec3(event.velocity)
      };
    case "knockback":
      return {
        ...event,
        impulse: cloneVec3(event.impulse),
        velocity: cloneVec3(event.velocity)
      };
    case "pushbox-collision":
      return {
        ...event,
        normal: cloneVec3(event.normal),
        correctionA: cloneVec3(event.correctionA),
        correctionB: cloneVec3(event.correctionB)
      };
  }
}

function compareBodies(a: KinematicBody, b: KinematicBody): number {
  return compareIds(a.id, b.id);
}

function compareIds(a: KinematicBodyId, b: KinematicBodyId): number {
  const left = String(a);
  const right = String(b);
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
  return value;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative.`);
  }
  return value;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

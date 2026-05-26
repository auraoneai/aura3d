import {
  PhysicsStepper,
  PhysicsWorld,
  Shape,
  type PhysicsStepStats,
  type RigidBody,
  type Vec3
} from "@galileo3d/physics";

export type PhysicsVisualKind = "cube" | "sphere" | "capsule";
export type PhysicsVisualMaterial = "wood" | "rubber";

export interface PhysicsBodyVisual {
  readonly kind: PhysicsVisualKind;
  readonly material: PhysicsVisualMaterial;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
  readonly velocity: Vec3;
}

export interface PhysicsVectorVisual {
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
  readonly material: "transparentAmber" | "wire";
}

export interface PhysicsPusherVisual {
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
  readonly enabled: boolean;
}

export interface PhysicsPlaygroundFrame {
  readonly bodies: readonly PhysicsBodyVisual[];
  readonly velocityVectors: readonly PhysicsVectorVisual[];
  readonly contactMarkers: readonly PhysicsVectorVisual[];
  readonly pusher: PhysicsPusherVisual;
  readonly stats: PhysicsStepStats;
  readonly stepper: {
    readonly steps: number;
    readonly alpha: number;
    readonly droppedTime: number;
  };
  readonly activeBodies: number;
  readonly scoredBodies: number;
  readonly binLoads: readonly [number, number, number];
  readonly contactEvidence: {
    readonly contacts: number;
    readonly pusherContacts: number;
    readonly highEnergyContacts: number;
  };
  readonly resetEvidence: {
    readonly seed: number;
    readonly fingerprint: string;
    readonly bodyCount: number;
  };
}

export interface PhysicsPlaygroundInput {
  readonly time: number;
  readonly gravityScale: number;
  readonly conveyorSpeed: number;
  readonly pusherEnabled: boolean;
  readonly spawnToken?: number;
}

interface BodyRecord {
  readonly body: RigidBody;
  readonly kind: PhysicsVisualKind;
  readonly material: PhysicsVisualMaterial;
  readonly scale: Vec3;
}

export class PhysicsPlaygroundSimulation {
  private world = createWorld();
  private stepper = new PhysicsStepper(1 / 60, 8);
  private records: BodyRecord[] = [];
  private conveyorBodies: RigidBody[] = [];
  private pusherBody: RigidBody | undefined;
  private recycleCounts: number[] = [];
  private previousPusherPosition: Vec3 = [2.6, -0.34, 1.1];
  private startedAt: number | undefined;
  private lastTime: number | undefined;
  private lastSpawnToken = 0;
  private scenario = 0;
  private resetFingerprint = "00000000";

  advance(input: PhysicsPlaygroundInput): PhysicsPlaygroundFrame {
    const spawnToken = finiteOrZero(input.spawnToken);
    if (this.startedAt === undefined || this.lastTime === undefined || input.time < this.lastTime - 1e-6 || spawnToken !== this.lastSpawnToken) {
      this.reset(input.time, spawnToken);
    }

    const gravityScale = clamp(input.gravityScale, 0, 2);
    const conveyorSpeed = clamp(input.conveyorSpeed, -2, 3);
    this.world.gravity[1] = -9.81 * gravityScale;
    const delta = Math.min(0.12, Math.max(0, input.time - (this.lastTime ?? input.time)));
    this.lastTime = input.time;
    this.updateKinematicBodies(input.time, delta, conveyorSpeed, input.pusherEnabled);
    const stepper = this.stepper.advance(delta, this.world);
    this.recycleEscapedBodies(input.time, conveyorSpeed);

    const snapshot = this.world.snapshot();
    const bodies = this.records.map((record) => bodyVisual(record));
    const binLoads = countBinLoads(this.records);
    const pusherId = this.pusherBody?.id ?? -1;
    return {
      bodies,
      velocityVectors: selectVelocityVectors(bodies),
      contactMarkers: contactVisuals(snapshot.contacts, this.records),
      pusher: {
        position: this.pusherBody?.position ?? this.previousPusherPosition,
        scale: [0.42, 0.28, 0.92],
        rotation: [0, 0, 0],
        enabled: input.pusherEnabled
      },
      stats: snapshot.stats,
      stepper,
      activeBodies: this.records.filter((record) => !record.body.sleeping).length,
      scoredBodies: binLoads[0] + binLoads[1] + binLoads[2],
      binLoads,
      contactEvidence: {
        contacts: snapshot.stats.contacts,
        pusherContacts: snapshot.contacts.filter((contact) => contact.bodyA === pusherId || contact.bodyB === pusherId).length,
        highEnergyContacts: snapshot.contacts.filter((contact) => contact.penetration > 0.018).length
      },
      resetEvidence: {
        seed: this.scenario,
        fingerprint: this.resetFingerprint,
        bodyCount: this.records.length
      }
    };
  }

  reset(time: number, spawnToken = 0): void {
    this.world = createWorld();
    this.stepper = new PhysicsStepper(1 / 60, 8);
    this.records = [];
    this.recycleCounts = [];
    this.conveyorBodies = [];
    this.startedAt = time;
    this.lastTime = time;
    this.lastSpawnToken = spawnToken;
    this.scenario = Math.abs(Math.trunc(spawnToken)) % 997;
    this.previousPusherPosition = [2.48, -0.32, 1.45];

    const floor = this.world.createRigidBody({ type: "static", friction: 0.82 });
    this.world.createCollider(floor, { shape: Shape.plane([0, 1, 0], 0.62), material: { friction: 0.9, restitution: 0.02 } });

    for (const z of [-1.35, 0, 1.35]) {
      const conveyor = this.world.createRigidBody({ type: "static", position: [1.2, -0.42, z], friction: 1.25 });
      this.world.createCollider(conveyor, { shape: Shape.box(3.55, 0.045, 0.25), material: { friction: 1.35, restitution: 0 } });
      this.conveyorBodies.push(conveyor);
    }

    const rampProxy = this.world.createRigidBody({ type: "static", position: [-2.8, -0.47, -0.62], friction: 0.72 });
    this.world.createCollider(rampProxy, { shape: Shape.box(1.42, 0.14, 0.54), material: { friction: 0.75, restitution: 0.03 } });

    for (let bin = 0; bin < 3; bin += 1) {
      const z = -1.42 + bin * 1.38;
      const floor = this.world.createRigidBody({ type: "static", position: [3.65, -0.58, z], friction: 0.98 });
      const left = this.world.createRigidBody({ type: "static", position: [3.25, -0.22, z], friction: 0.85 });
      const right = this.world.createRigidBody({ type: "static", position: [4.05, -0.22, z], friction: 0.85 });
      const back = this.world.createRigidBody({ type: "static", position: [3.65, -0.22, z + 0.58], friction: 0.85 });
      this.world.createCollider(floor, { shape: Shape.box(0.43, 0.045, 0.58), material: { friction: 1.0, restitution: 0.03 } });
      this.world.createCollider(left, { shape: Shape.box(0.08, 0.72, 0.58), material: { friction: 0.9, restitution: 0.08 } });
      this.world.createCollider(right, { shape: Shape.box(0.08, 0.72, 0.58), material: { friction: 0.9, restitution: 0.08 } });
      this.world.createCollider(back, { shape: Shape.box(0.42, 0.72, 0.08), material: { friction: 0.9, restitution: 0.08 } });
    }

    const pusher = this.world.createRigidBody({ type: "kinematic", position: this.previousPusherPosition, velocity: [0, 0, 0], friction: 1.1 });
    this.world.createCollider(pusher, { shape: Shape.box(0.21, 0.18, 0.46), material: { friction: 1.05, restitution: 0.02 } });
    this.pusherBody = pusher;

    const bodyCount = 56;
    this.recycleCounts = new Array(bodyCount).fill(0);
    for (let index = 0; index < bodyCount; index += 1) {
      this.records.push(this.createDynamicBody(index));
    }
    this.resetFingerprint = resetSignature(this.records, this.scenario);
  }

  private createDynamicBody(index: number): BodyRecord {
    const jitter = seeded(index + this.scenario * 17);
    const kind: PhysicsVisualKind = index % 6 === 0 ? "sphere" : index % 5 === 0 ? "capsule" : "cube";
    const material: PhysicsVisualMaterial = index % 3 === 0 ? "rubber" : "wood";
    const radius = kind === "sphere" ? 0.105 : kind === "capsule" ? 0.082 : 0.095;
    const halfHeight = 0.15;
    const scenarioOffset = ((this.scenario % 7) - 3) * 0.032;
    const placement = initialBodyPlacement(index, radius, jitter, scenarioOffset, this.scenario);
    const body = this.world.createRigidBody({
      type: "dynamic",
      position: placement.position,
      velocity: placement.velocity,
      angularVelocity: [(seeded(index * 19) - 0.5) * 7, seeded(index * 23) * 8, (seeded(index * 29) - 0.5) * 6],
      mass: material === "rubber" ? 0.75 : 1.15,
      friction: material === "rubber" ? 0.9 : 0.62,
      restitution: material === "rubber" ? 0.34 : 0.12,
      linearDamping: 0.08,
      angularDamping: 0.18
    });
    this.world.createCollider(body, {
      shape: kind === "sphere"
        ? Shape.sphere(radius)
        : kind === "capsule"
          ? Shape.capsule(radius, halfHeight)
          : Shape.box(radius, radius, radius),
      material: { friction: material === "rubber" ? 0.9 : 0.62, restitution: material === "rubber" ? 0.34 : 0.12 }
    });
    return {
      body,
      kind,
      material,
      scale: kind === "sphere"
        ? [radius * 2, radius * 2, radius * 2]
        : kind === "capsule"
          ? [radius * 2.35, radius * 2 + halfHeight * 2, radius * 2.35]
          : [radius * 2.05, radius * 2.05, radius * 2.05]
    };
  }

  private updateKinematicBodies(time: number, delta: number, conveyorSpeed: number, pusherEnabled: boolean): void {
    for (const conveyor of this.conveyorBodies) {
      conveyor.setVelocity([conveyorSpeed * 1.8, 0, 0]);
    }
    if (!this.pusherBody) return;
    const localTime = time - (this.startedAt ?? time);
    const sweep = Math.sin(localTime * (1.32 + Math.abs(conveyorSpeed) * 0.14));
    const position: Vec3 = pusherEnabled
      ? [2.48 + sweep * 0.96, -0.32, 1.35 + Math.cos(localTime * 0.72) * 0.1]
      : [5.4, -0.32, 2.4];
    const velocity = delta > 1e-6
      ? [
          (position[0] - this.previousPusherPosition[0]) / delta,
          (position[1] - this.previousPusherPosition[1]) / delta,
          (position[2] - this.previousPusherPosition[2]) / delta
        ] as Vec3
      : [0, 0, 0] as Vec3;
    this.pusherBody.setPosition(position);
    this.pusherBody.setVelocity(velocity);
    this.previousPusherPosition = position;
  }

  private recycleEscapedBodies(time: number, conveyorSpeed: number): void {
    for (const [index, record] of this.records.entries()) {
      const body = record.body;
      if (body.position[0] <= 4.65 && body.position[1] >= -1.8) continue;
      const recycleCount = (this.recycleCounts[index] ?? 0) + 1;
      this.recycleCounts[index] = recycleCount;
      const lane = index % 3;
      const wave = seeded(index * 37 + recycleCount * 101 + this.scenario);
      body.setPosition([-3.9 + wave * 0.32, 0.44 + (index % 5) * 0.1, -1.35 + lane * 1.35 + (wave - 0.5) * 0.16]);
      body.setVelocity([0.9 + Math.max(0, conveyorSpeed) * 0.32 + wave * 0.38, 0.08, (wave - 0.5) * 0.36]);
      body.setAngularVelocity([(wave - 0.5) * 7, wave * 8, (0.5 - wave) * 6]);
    }
  }
}

export function createPhysicsPlaygroundSimulation(): PhysicsPlaygroundSimulation {
  return new PhysicsPlaygroundSimulation();
}

export const physicsPlaygroundSimulation = createPhysicsPlaygroundSimulation();

export function getPhysicsPlaygroundFrame(input: PhysicsPlaygroundInput): PhysicsPlaygroundFrame {
  return physicsPlaygroundSimulation.advance(input);
}

function createWorld(): PhysicsWorld {
  return new PhysicsWorld({
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 60,
    solverIterations: 5,
    enableSleeping: true,
    sleepVelocityThreshold: 0.018,
    sleepDelay: 0.55
  });
}

function initialBodyPlacement(
  index: number,
  radius: number,
  jitter: number,
  scenarioOffset: number,
  scenario: number
): { readonly position: Vec3; readonly velocity: Vec3 } {
  if (index < 15) {
    const bin = index % 3;
    const slot = Math.floor(index / 3);
    const x = 3.42 + (slot % 3) * 0.18 + (jitter - 0.5) * 0.045;
    const y = -0.46 + Math.floor(slot / 3) * 0.18 + radius * 0.15;
    const z = -1.42 + bin * 1.38 - 0.22 + Math.floor(slot / 3) * 0.22 + scenarioOffset * 0.35;
    return {
      position: [x, y, z],
      velocity: [(jitter - 0.5) * 0.06, 0, (seeded(index * 41 + scenario) - 0.5) * 0.05]
    };
  }

  if (index < 33) {
    const local = index - 15;
    const lane = local % 3;
    const row = Math.floor(local / 3);
    const x = 1.48 + (row % 6) * 0.28 + (jitter - 0.5) * 0.08;
    const y = -0.15 + Math.floor(row / 4) * 0.2 + radius * 0.2;
    const z = -1.35 + lane * 1.35 + (seeded(index * 7 + scenario) - 0.5) * 0.24 - scenarioOffset * 0.25;
    return {
      position: [x, y, z],
      velocity: [0.36 + seeded(index * 3 + 4) * 0.42, 0.04, (seeded(index * 13) - 0.5) * 0.34]
    };
  }

  const feed = index - 33;
  const row = Math.floor(feed / 9);
  const col = feed % 9;
  const lane = feed % 3;
  const x = -3.82 + col * 0.25 + (jitter - 0.5) * 0.08 + scenarioOffset;
  const y = 0.04 + row * 0.2 + seeded(index * 11 + scenario) * 0.06;
  const z = -1.35 + lane * 1.35 + (seeded(index * 7) - 0.5) * 0.14 - scenarioOffset;
  return {
    position: [x, y, z],
    velocity: [0.72 + seeded(index * 3 + 4) * 0.54, 0.12 + seeded(index * 5) * 0.22, (seeded(index * 13) - 0.5) * 0.48]
  };
}

function bodyVisual(record: BodyRecord): PhysicsBodyVisual {
  return {
    kind: record.kind,
    material: record.material,
    position: [...record.body.position] as Vec3,
    scale: record.scale,
    rotation: quatToEuler(record.body.rotation),
    velocity: [...record.body.velocity] as Vec3
  };
}

function velocityVisual(body: PhysicsBodyVisual): PhysicsVectorVisual {
  const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2]);
  const length = clamp(horizontalSpeed * 0.18, 0.08, 0.48);
  return {
    position: [body.position[0], body.position[1] + body.scale[1] * 0.82, body.position[2]],
    scale: [length, 1, 1],
    rotation: [0, -Math.atan2(body.velocity[2], body.velocity[0]), 0],
    material: horizontalSpeed > 1.2 ? "transparentAmber" : "wire"
  };
}

function selectVelocityVectors(bodies: readonly PhysicsBodyVisual[]): readonly PhysicsVectorVisual[] {
  return bodies
    .filter((body) => Math.hypot(body.velocity[0], body.velocity[2]) > 0.18)
    .sort((a, b) => Math.hypot(b.velocity[0], b.velocity[2]) - Math.hypot(a.velocity[0], a.velocity[2]))
    .slice(0, 24)
    .map(velocityVisual);
}

function contactVisuals(
  contacts: readonly { readonly bodyA: number; readonly bodyB: number; readonly normal: Vec3; readonly penetration: number }[],
  records: readonly BodyRecord[]
): readonly PhysicsVectorVisual[] {
  const byBodyId = new Map(records.map((record) => [record.body.id, record]));
  const visuals: PhysicsVectorVisual[] = [];
  for (const contact of contacts) {
    const record = byBodyId.get(contact.bodyA) ?? byBodyId.get(contact.bodyB);
    if (!record) continue;
    const length = clamp(contact.penetration * 2.6 + 0.1, 0.1, 0.52);
    visuals.push({
      position: [
        record.body.position[0],
        Math.max(-0.58, record.body.position[1] - record.scale[1] * 0.72),
        record.body.position[2]
      ],
      scale: [length, 1, 1],
      rotation: [0, -Math.atan2(contact.normal[2], contact.normal[0]), 0],
      material: contact.penetration > 0.018 ? "transparentAmber" : "wire"
    });
    if (visuals.length >= 18) break;
  }
  return visuals;
}

function countBinLoads(records: readonly BodyRecord[]): [number, number, number] {
  const loads: [number, number, number] = [0, 0, 0];
  for (const record of records) {
    const [x, y, z] = record.body.position;
    if (x < 3.15 || x > 4.18 || y > 0.36) continue;
    const bin = z < -0.75 ? 0 : z < 0.62 ? 1 : 2;
    loads[bin] += 1;
  }
  return loads;
}

function resetSignature(records: readonly BodyRecord[], scenario: number): string {
  let hash = (2166136261 ^ scenario) >>> 0;
  for (const record of records.slice(0, 10)) {
    for (const component of record.body.position) {
      hash ^= Math.round((component + 8) * 1000);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function quatToEuler(quat: readonly [number, number, number, number]): Vec3 {
  const [x, y, z, w] = quat;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll, pitch, yaw];
}

function seeded(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? value! : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

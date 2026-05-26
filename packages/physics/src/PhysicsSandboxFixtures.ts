import { PhysicsWorld } from "./PhysicsWorld.js";
import type { RigidBody } from "./RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "./Shape.js";

export type PhysicsSandboxSpawnerPreset =
  | "box"
  | "sphere"
  | "capsule"
  | "cylinder-proxy"
  | "tower"
  | "pyramid"
  | "wall"
  | "chain"
  | "newtons-cradle"
  | "dominoes"
  | "wrecking-ball"
  | "vehicle"
  | "ragdoll";

export type PhysicsSandboxTool = "grab" | "push" | "freeze" | "delete" | "explode" | "slice";

export interface PhysicsSandboxFixtureOptions {
  readonly seed?: number;
  readonly steps?: number;
}

export interface PhysicsSandboxSpawnSummary {
  readonly preset: PhysicsSandboxSpawnerPreset;
  readonly bodies: number;
  readonly dynamicBodies: number;
  readonly staticBodies: number;
  readonly colliders: number;
  readonly constraints: number;
  readonly visualKinds: readonly string[];
  readonly colliderKinds: readonly string[];
}

export interface PhysicsSandboxToolSummary {
  readonly tool: PhysicsSandboxTool;
  readonly supported: boolean;
  readonly affectedBodies: number;
  readonly selectedBodyId?: number;
  readonly impulseMagnitude?: number;
  readonly deletedBodies?: number;
  readonly frozenBodies?: number;
  readonly blocker?: string;
}

export interface PhysicsSandboxFixture {
  readonly id: "external-parity-old-branch-physics-sandbox-fixture";
  readonly source: "origin-master-physics-sandbox-tools-spawners-adapted";
  readonly spawners: readonly PhysicsSandboxSpawnSummary[];
  readonly tools: readonly PhysicsSandboxToolSummary[];
  readonly metrics: {
    readonly bodyCountBeforeTools: number;
    readonly bodyCountAfterTools: number;
    readonly colliderCountAfterTools: number;
    readonly constraintCountAfterTools: number;
    readonly dynamicBodiesAfterTools: number;
    readonly sleepingBodiesAfterTools: number;
    readonly contactsAfterSteps: number;
    readonly broadphasePairsAfterSteps: number;
    readonly kineticEnergyAfterSteps: number;
    readonly maxContactPenetrationAfterSteps: number;
    readonly totalSpawnedBodies: number;
    readonly totalSpawnerConstraints: number;
    readonly supportedToolCount: number;
    readonly blockedToolCount: number;
  };
  readonly unsupportedAdvancedSimulations: readonly ["cloth", "soft-body", "fluid", "fracture"];
  readonly hash: string;
  readonly claimBoundary: string;
}

type SpawnRecord = {
  readonly preset: PhysicsSandboxSpawnerPreset;
  readonly body: RigidBody;
  readonly visualKind: string;
  readonly colliderKind: PhysicsShape["kind"] | "cylinder-proxy";
};

type ConstraintRecord = {
  readonly preset: PhysicsSandboxSpawnerPreset;
};

export function samplePhysicsSandboxFixture(options: PhysicsSandboxFixtureOptions = {}): PhysicsSandboxFixture {
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const steps = integer(options.steps ?? 24, "steps");
  if (steps < 0 || steps > 240) throw new RangeError("Physics sandbox fixture steps must be in the [0, 240] range.");

  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 6 });
  const records: SpawnRecord[] = [];
  const constraints: ConstraintRecord[] = [];
  const ground = world.createRigidBody({ type: "static", position: [0, -0.15, 0] });
  world.createCollider(ground, { shape: Shape.box(8, 0.15, 2), material: { friction: 0.9, restitution: 0 } });

  spawnBasic(world, records, "box", [-4.2, 1.2, 0], Shape.box(0.32, 0.32, 0.32), "box", 1);
  spawnBasic(world, records, "sphere", [-3.45, 1.25, 0], Shape.sphere(0.32), "sphere", 1);
  spawnBasic(world, records, "capsule", [-2.7, 1.35, 0], Shape.capsule(0.22, 0.38), "capsule", 1);
  spawnBasic(world, records, "cylinder-proxy", [-1.95, 1.3, 0], Shape.capsule(0.28, 0.26), "cylinder", 1);
  spawnTower(world, records, [-4.5, 0.25, 0], 5);
  spawnPyramid(world, records, [-2.7, 0.25, 0], 4);
  spawnWall(world, records, [-0.6, 0.25, 0], 5, 3);
  spawnChain(world, records, constraints, [1.5, 3.1, 0], [3.0, 2.2, 0], 6);
  spawnNewtonsCradle(world, records, constraints, [0.9, 4.2, 0], 4);
  spawnDominoes(world, records, [2.1, 0.45, 0], 8);
  spawnWreckingBall(world, records, constraints, [4.0, 3.5, 0], 2.4);
  spawnVehicle(world, records, constraints, [-0.2, 2.0, 0]);
  spawnRagdoll(world, records, constraints, [3.7, 1.6, 0]);

  const bodyCountBeforeTools = world.snapshot().stats.bodies;
  const tools = applyToolSequence(world, seed);
  for (let step = 0; step < steps; step += 1) world.step(1 / 60);
  const snapshot = world.snapshot();
  const spawners = summarizeSpawners(records, constraints, world);
  const supportedToolCount = tools.filter((tool) => tool.supported).length;
  const blockedToolCount = tools.length - supportedToolCount;
  const metrics = {
    bodyCountBeforeTools,
    bodyCountAfterTools: snapshot.stats.bodies,
    colliderCountAfterTools: snapshot.stats.colliders,
    constraintCountAfterTools: snapshot.stats.constraints,
    dynamicBodiesAfterTools: snapshot.bodies.filter((body) => body.type === "dynamic").length,
    sleepingBodiesAfterTools: snapshot.stats.sleepingBodies,
    contactsAfterSteps: snapshot.stats.contacts,
    broadphasePairsAfterSteps: snapshot.stats.broadphasePairs,
    kineticEnergyAfterSteps: Number(snapshot.stats.kineticEnergy.toFixed(4)),
    maxContactPenetrationAfterSteps: Number(snapshot.stats.maxContactPenetration.toFixed(5)),
    totalSpawnedBodies: records.length,
    totalSpawnerConstraints: constraints.length,
    supportedToolCount,
    blockedToolCount
  };
  return {
    id: "external-parity-old-branch-physics-sandbox-fixture",
    source: "origin-master-physics-sandbox-tools-spawners-adapted",
    spawners,
    tools,
    metrics,
    unsupportedAdvancedSimulations: ["cloth", "soft-body", "fluid", "fracture"],
    hash: hashFixture(spawners, tools, metrics),
    claimBoundary: "Deterministic current-engine fixture adapted from old physics sandbox spawners and tools. It proves bounded rigid-body spawn presets, hinge/spring constraints, and supported tool telemetry; it does not claim soft body, cloth, fluid, fracture, full interactive editor tools, or Unity/Unreal physics-sandbox parity."
  };
}

function spawnBasic(
  world: PhysicsWorld,
  records: SpawnRecord[],
  preset: PhysicsSandboxSpawnerPreset,
  position: Vec3,
  shape: PhysicsShape,
  visualKind: string,
  mass: number
): RigidBody {
  const body = world.createRigidBody({ position, mass, linearDamping: 0.02, angularDamping: 0.02 });
  world.createCollider(body, { shape, material: { friction: 0.72, restitution: 0.05 } });
  records.push({ preset, body, visualKind, colliderKind: preset === "cylinder-proxy" ? "cylinder-proxy" : shape.kind });
  return body;
}

function spawnTower(world: PhysicsWorld, records: SpawnRecord[], origin: Vec3, height: number): void {
  for (let index = 0; index < height; index += 1) {
    spawnBasic(world, records, "tower", [origin[0], origin[1] + index * 0.46, origin[2]], Shape.box(0.36, 0.22, 0.32), "box", 1);
  }
}

function spawnPyramid(world: PhysicsWorld, records: SpawnRecord[], origin: Vec3, levels: number): void {
  for (let level = 0; level < levels; level += 1) {
    const width = levels - level;
    for (let x = 0; x < width; x += 1) {
      spawnBasic(world, records, "pyramid", [
        origin[0] + (x - (width - 1) / 2) * 0.44,
        origin[1] + level * 0.46,
        origin[2]
      ], Shape.box(0.2, 0.22, 0.25), "box", 1);
    }
  }
}

function spawnWall(world: PhysicsWorld, records: SpawnRecord[], origin: Vec3, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    const boxesInRow = width - (y % 2);
    for (let x = 0; x < boxesInRow; x += 1) {
      spawnBasic(world, records, "wall", [
        origin[0] + (x - (boxesInRow - 1) / 2) * 0.42 + (y % 2) * 0.21,
        origin[1] + y * 0.42,
        origin[2]
      ], Shape.box(0.2, 0.2, 0.2), "brick", 1);
    }
  }
}

function spawnChain(world: PhysicsWorld, records: SpawnRecord[], constraints: ConstraintRecord[], start: Vec3, end: Vec3, segments: number): void {
  let previous: RigidBody | undefined;
  for (let index = 0; index < segments; index += 1) {
    const t = (index + 0.5) / segments;
    const body = spawnBasic(world, records, "chain", lerpVec3(start, end, t), Shape.box(0.12, 0.12, 0.32), "chain-link", 0.5);
    if (previous) {
      world.createConstraint({ type: "hinge", bodyA: previous, bodyB: body, stiffness: 0.85 });
      constraints.push({ preset: "chain" });
    }
    previous = body;
  }
}

function spawnNewtonsCradle(world: PhysicsWorld, records: SpawnRecord[], constraints: ConstraintRecord[], origin: Vec3, balls: number): void {
  for (let index = 0; index < balls; index += 1) {
    const x = origin[0] + (index - (balls - 1) / 2) * 0.42;
    const anchor = world.createRigidBody({ type: "static", position: [x, origin[1], origin[2]] });
    world.createCollider(anchor, { shape: Shape.box(0.06, 0.06, 0.06) });
    records.push({ preset: "newtons-cradle", body: anchor, visualKind: "anchor", colliderKind: "box" });
    const ball = spawnBasic(world, records, "newtons-cradle", [x, origin[1] - 1.1, origin[2]], Shape.sphere(0.18), "sphere", 1);
    world.createConstraint({ type: "hinge", bodyA: anchor, bodyB: ball, stiffness: 0.9 });
    constraints.push({ preset: "newtons-cradle" });
  }
}

function spawnDominoes(world: PhysicsWorld, records: SpawnRecord[], start: Vec3, count: number): void {
  for (let index = 0; index < count; index += 1) {
    spawnBasic(world, records, "dominoes", [start[0] + index * 0.22, start[1], start[2]], Shape.box(0.05, 0.34, 0.18), "domino", 0.5);
  }
}

function spawnWreckingBall(world: PhysicsWorld, records: SpawnRecord[], constraints: ConstraintRecord[], position: Vec3, chainLength: number): void {
  const anchor = world.createRigidBody({ type: "static", position });
  world.createCollider(anchor, { shape: Shape.box(0.08, 0.08, 0.08) });
  records.push({ preset: "wrecking-ball", body: anchor, visualKind: "anchor", colliderKind: "box" });
  const ball = spawnBasic(world, records, "wrecking-ball", [position[0] + 0.55, position[1] - chainLength, position[2]], Shape.sphere(0.34), "sphere", 8);
  world.createConstraint({ type: "spring", bodyA: anchor, bodyB: ball, restLength: chainLength, stiffness: 0.55 });
  constraints.push({ preset: "wrecking-ball" });
}

function spawnVehicle(world: PhysicsWorld, records: SpawnRecord[], constraints: ConstraintRecord[], position: Vec3): void {
  const chassis = spawnBasic(world, records, "vehicle", position, Shape.box(0.56, 0.16, 0.32), "chassis", 5);
  for (const offset of [[-0.38, -0.24, -0.32], [-0.38, -0.24, 0.32], [0.38, -0.24, -0.32], [0.38, -0.24, 0.32]] as const) {
    const wheel = spawnBasic(world, records, "vehicle", [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]], Shape.sphere(0.15), "wheel", 0.5);
    world.createConstraint({ type: "hinge", bodyA: chassis, bodyB: wheel, stiffness: 0.75 });
    constraints.push({ preset: "vehicle" });
  }
}

function spawnRagdoll(world: PhysicsWorld, records: SpawnRecord[], constraints: ConstraintRecord[], position: Vec3): void {
  const torso = spawnBasic(world, records, "ragdoll", position, Shape.box(0.22, 0.36, 0.16), "torso", 5);
  const parts: readonly [string, Vec3, PhysicsShape, number][] = [
    ["head", [0, 0.58, 0], Shape.sphere(0.18), 1],
    ["left-arm", [-0.36, 0.14, 0], Shape.capsule(0.08, 0.28), 1],
    ["right-arm", [0.36, 0.14, 0], Shape.capsule(0.08, 0.28), 1],
    ["left-leg", [-0.16, -0.56, 0], Shape.capsule(0.09, 0.34), 1],
    ["right-leg", [0.16, -0.56, 0], Shape.capsule(0.09, 0.34), 1]
  ];
  for (const [visualKind, offset, shape, mass] of parts) {
    const body = spawnBasic(world, records, "ragdoll", [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]], shape, visualKind, mass);
    world.createConstraint({ type: "hinge", bodyA: torso, bodyB: body, stiffness: 0.72 });
    constraints.push({ preset: "ragdoll" });
  }
}

function applyToolSequence(world: PhysicsWorld, seed: number): readonly PhysicsSandboxToolSummary[] {
  const tools: PhysicsSandboxToolSummary[] = [];
  const dynamicBodies = () => world.bodies().filter((body) => body.type === "dynamic");
  const grabTarget: Vec3 = [0.25 + hash01(seed, 1) * 0.25, 2.15, 0];
  const grabbed = nearestBody(dynamicBodies(), [0, 2, 0]);
  if (grabbed) {
    grabbed.setVelocity([
      (grabTarget[0] - grabbed.position[0]) * 3.5,
      (grabTarget[1] - grabbed.position[1]) * 3.5,
      0
    ]);
  }
  tools.push({
    tool: "grab",
    supported: grabbed !== undefined,
    affectedBodies: grabbed ? 1 : 0,
    selectedBodyId: grabbed?.id,
    blocker: "Current RigidBody type is immutable, so this fixture proves velocity-targeted grab telemetry rather than old kinematic type switching."
  });

  const pushPoint: Vec3 = [0, 1.2, 0];
  let pushed = 0;
  let impulseMagnitude = 0;
  for (const body of dynamicBodies()) {
    const distance = distanceVec3(body.position, pushPoint);
    if (distance <= 2.5 && distance > 1e-6) {
      const direction = scaleVec3(subVec3(body.position, pushPoint), 1 / distance);
      const impulse = scaleVec3(direction, Number(((2.5 - distance) * 0.38).toFixed(4)));
      body.applyImpulse(impulse);
      impulseMagnitude += Math.hypot(...impulse);
      pushed += 1;
    }
  }
  tools.push({ tool: "push", supported: true, affectedBodies: pushed, impulseMagnitude: Number(impulseMagnitude.toFixed(4)) });

  const freezeCandidates = dynamicBodies().slice(0, 3);
  for (const body of freezeCandidates) {
    body.setVelocity([0, 0, 0]);
    body.setAngularVelocity([0, 0, 0]);
    body.sleeping = true;
  }
  tools.push({ tool: "freeze", supported: true, affectedBodies: freezeCandidates.length, frozenBodies: freezeCandidates.length });

  const deleteTarget = dynamicBodies().at(-1);
  if (deleteTarget) world.removeRigidBody(deleteTarget.id);
  tools.push({ tool: "delete", supported: deleteTarget !== undefined, affectedBodies: deleteTarget ? 1 : 0, selectedBodyId: deleteTarget?.id, deletedBodies: deleteTarget ? 1 : 0 });

  const explodePoint: Vec3 = [1.2, 1.2, 0];
  let exploded = 0;
  let explosionImpulse = 0;
  for (const body of dynamicBodies()) {
    const distance = distanceVec3(body.position, explodePoint);
    if (distance <= 3.25 && distance > 1e-6) {
      const direction = scaleVec3(subVec3(body.position, explodePoint), 1 / distance);
      const impulse = scaleVec3(direction, Number(((3.25 - distance) * 0.52).toFixed(4)));
      body.applyImpulse(impulse);
      explosionImpulse += Math.hypot(...impulse);
      exploded += 1;
    }
  }
  tools.push({ tool: "explode", supported: true, affectedBodies: exploded, impulseMagnitude: Number(explosionImpulse.toFixed(4)) });
  tools.push({
    tool: "slice",
    supported: false,
    affectedBodies: 0,
    blocker: "Old slice tool only drew/specified a cut gesture; current physics has no convex decomposition or fracture pipeline."
  });
  return tools;
}

function summarizeSpawners(records: readonly SpawnRecord[], constraints: readonly ConstraintRecord[], world: PhysicsWorld): readonly PhysicsSandboxSpawnSummary[] {
  const summaries: PhysicsSandboxSpawnSummary[] = [];
  const liveBodyIds = new Set(world.bodies().map((body) => body.id));
  for (const preset of unique(records.map((record) => record.preset))) {
    const presetRecords = records.filter((record) => record.preset === preset && liveBodyIds.has(record.body.id));
    summaries.push({
      preset,
      bodies: presetRecords.length,
      dynamicBodies: presetRecords.filter((record) => record.body.type === "dynamic").length,
      staticBodies: presetRecords.filter((record) => record.body.type === "static").length,
      colliders: presetRecords.length,
      constraints: constraints.filter((constraint) => constraint.preset === preset).length,
      visualKinds: unique(presetRecords.map((record) => record.visualKind)).sort(),
      colliderKinds: unique(presetRecords.map((record) => record.colliderKind)).sort()
    });
  }
  return summaries;
}

function nearestBody(bodies: readonly RigidBody[], target: Vec3): RigidBody | undefined {
  return [...bodies].sort((left, right) => distanceVec3(left.position, target) - distanceVec3(right.position, target) || left.id - right.id)[0];
}

function lerpVec3(start: Vec3, end: Vec3, t: number): Vec3 {
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
    start[2] + (end[2] - start[2]) * t
  ];
}

function distanceVec3(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function subVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scaleVec3(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function hashFixture(...parts: readonly unknown[]): string {
  const text = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function hash01(seed: number, salt: number): number {
  let value = Math.imul(seed + salt * 1013904223, 1664525) + 1013904223;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Physics sandbox fixture ${label} must be an integer.`);
  return value;
}

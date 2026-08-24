/**
 * Vault Breakers table definition + simulation (PRD VB-04/05/06/07).
 *
 * Everything runs through the public root-safe physics surface: `physics.world`
 * constructs the Rapier-backed controller, `createBody`/`createCollider` declare
 * bodies (including sensors), and `createConstraint` declares the motorised
 * flipper hinges. The same builder drives the browser route and the headless
 * unit tests.
 *
 * Authored (non-simulated) elements, labeled as such everywhere claims appear:
 * - playfield slope is a gravity +Z component, not a tilted table;
 * - bumper/slingshot kicks are impulses added along the contact normal;
 * - nudge is a small impulse; tilt is a rule, not physics.
 *
 * Flipper joints use the same-sign axis-mirror workaround proven by the VB-01
 * spike (see ../SPIKE-FLIPPER.md): the right flipper's joint axis is [0,-1,0]
 * with negated limits so BOTH motors raise with the same positive speed.
 */
import { physics } from "@aura3d/engine";

export type SimBody = ReturnType<ReturnType<typeof physics.world>["createBody"]>;
export type SimWorld = ReturnType<typeof physics.world>;
export type SimJoint = ReturnType<SimWorld["createConstraint"]>;

export const BALL_RADIUS = 0.14;
export const BALL_MASS = 0.28;
/** Authored playfield slope: gravity's +Z component pulls toward the drain. */
export const SLOPE_ACCELERATION = 2.35;
/**
 * Flipper pivots at |x| = 0.85: the resting tips leave a 0.32 m surface gap
 * (a 0.28 m ball falls through to the drain), while the raised tips close to
 * a 0.23 m gap (a ball cannot pass). The VB-01 spike used tighter pivots for
 * its sealed-wall proof; the route widens them so the drain lane is honest.
 */
export const FLIPPER_PIVOT_X = 0.85;
export const FLIPPER_REST_YAW = -0.62;
export const FLIPPER_UP_YAW = 0.5;
export const RIGHT_REST_YAW = Math.PI - FLIPPER_REST_YAW;
export const RIGHT_UP_YAW = Math.PI - FLIPPER_UP_YAW;
export const FLIPPER_RAISE_SPEED = 60;
export const FLIPPER_RETURN_SPEED = -10;
export const FLIPPER_MOTOR_TORQUE = 240;
export const FLIPPER_BAT_MASS = 0.18;
export const RIGHT_JOINT_LIMITS: readonly [number, number] = [-RIGHT_REST_YAW, -RIGHT_UP_YAW];

export const BUMPER_KICK = 2.6;
export const SLING_KICK = 2.2;
export const PLUNGER_MIN_SPEED = 5.4;
export const PLUNGER_MAX_SPEED = 11.4;

export const BANK_IDS = ["bank-left-top", "bank-left-mid", "bank-center", "bank-right-mid", "bank-right-top"] as const;
export type BankId = (typeof BANK_IDS)[number];
export const TARGETS_PER_BANK = 3;

export interface Euler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PropVisual {
  readonly name: string;
  readonly source: "model" | "primitive";
  readonly typedAsset?: "vaultBreakersTable" | "vaultBreakersFlipper" | "vaultBreakersBall" | "vaultBreakersVaultDoor";
  readonly targetMaxDimension?: number;
  readonly primitive?: {
    readonly shape: "box" | "sphere" | "cylinder" | "torus";
    readonly size: readonly [number, number, number];
    readonly color: string;
    readonly emissive?: string;
    readonly opacity?: number;
  };
  readonly position: readonly [number, number, number];
  readonly rotation: Euler;
  readonly dynamic: boolean;
}

export interface ImpactEvent {
  readonly a: string;
  readonly b: string;
  readonly speed: number;
  readonly normal: readonly [number, number, number];
}

export type TableSensorKind = "bumper" | "sling" | "target" | "drain" | "orbit" | "vault";
export interface SensorEvent {
  readonly kind: TableSensorKind;
  readonly id: string;
  readonly ballIndex: number;
  readonly stepIndex: number;
}

export interface TrackedPose {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export interface FlipperRig {
  readonly side: "left" | "right";
  readonly joint: SimJoint;
  readonly bat: SimBody;
  raise(): void;
  release(): void;
  yaw(): number;
}

export function eulerToQuat(e: Euler): readonly [number, number, number, number] {
  const cx = Math.cos(e.x / 2);
  const sx = Math.sin(e.x / 2);
  const cy = Math.cos(e.y / 2);
  const sy = Math.sin(e.y / 2);
  const cz = Math.cos(e.z / 2);
  const sz = Math.sin(e.z / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

export function quatToEuler(q: readonly number[]): Euler {
  const [x, y, z, w] = q;
  const sinp = 2 * (w * x - y * z);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  return {
    x: pitch,
    y: Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)),
    z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z))
  };
}

/** FNV-1a over a string, as stable hex (same algorithm as the sibling routes). */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

interface BallEntry {
  readonly index: number;
  readonly body: SimBody;
  state: "lane" | "play" | "drained";
}

const BANK_TARGET_POSITIONS: Record<BankId, readonly (readonly [number, number])[]> = {
  "bank-left-top": [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
  "bank-left-mid": [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
  "bank-center": [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
  "bank-right-mid": [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
  "bank-right-top": [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
};

export interface TableSimulation {
  readonly world: SimWorld;
  readonly visuals: readonly PropVisual[];
  readonly dynamicVisualNames: readonly string[];
  readonly flippers: { readonly left: FlipperRig; readonly right: FlipperRig };
  readonly vaultDoor: SimBody;
  readonly bodyCount: number;
  readonly jointCount: number;
  readonly backend: string;
  readonly fixedDelta: number;
  readonly targetIds: readonly string[];
  openVaultDoor(): void;
  serveBall(charge: number): boolean;
  releaseMultiball(): number;
  activeBallCount(): number;
  ballInPlay(): boolean;
  ballStates(): readonly { index: number; state: string }[];
  nudge(dirX: number): void;
  stepFixed(steps?: number): void;
  poses(): readonly TrackedPose[];
  poseHash(): string;
  activity(): { movingBodies: number; settled: boolean };
  consumeImpacts(): readonly ImpactEvent[];
  consumeSensorEvents(): readonly SensorEvent[];
  parkAll(): void;
  /** Test hook: raw body for a live ball, for deterministic sensor/kick probes. */
  debugBallBody(index: number): SimBody | undefined;
}

export function createTableSimulation(): TableSimulation {
  const world = physics.world({
    gravity: [0, -9.81, SLOPE_ACCELERATION],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: true,
    sleepVelocityThreshold: 0.06,
    sleepDelay: 0.45,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.35 }
  });

  const visuals: PropVisual[] = [];
  const dynamicVisualNames: string[] = [];
  const colliderNameById = new Map<number, string>();
  const sensorColliderIds = new Set<number>();
  const kickColliderIds = new Map<number, { kind: "bumper" | "sling"; id: string }>();
  let pendingImpacts: ImpactEvent[] = [];
  let pendingSensors: SensorEvent[] = [];
  let stepIndex = 0;
  const armedPairs = new Set<string>();
  const kickCooldown = new Map<string, number>();
  const downedTargets = new Set<string>();
  let jointCount = 0;

  const balls: BallEntry[] = [];
  let nextBallIndex = 0;
  const laneRestFrames = new Map<number, number>();

  const registerCollider = (colliderId: number, name: string, sensor: boolean): void => {
    colliderNameById.set(colliderId, name);
    if (sensor) sensorColliderIds.add(colliderId);
  };

  const trackVisual = (visual: PropVisual, dynamic = false): void => {
    visuals.push(visual);
    if (dynamic) dynamicVisualNames.push(visual.name);
  };

  const addStaticBox = (
    name: string,
    halfExtents: readonly [number, number, number],
    position: readonly [number, number, number],
    options: {
      rotationZ?: number;
      rotationY?: number;
      friction?: number;
      restitution?: number;
      color?: string;
      emissive?: string;
      visible?: boolean;
      sensor?: boolean;
      sensorKind?: TableSensorKind;
      kick?: { kind: "bumper" | "sling" };
    } = {}
  ): SimBody => {
    const euler: Euler = { x: 0, y: options.rotationY ?? 0, z: options.rotationZ ?? 0 };
    const rotated = (options.rotationY ?? 0) !== 0 || (options.rotationZ ?? 0) !== 0;
    const body = world.createBody({
      type: "static",
      position: [...position] as [number, number, number],
      ...(rotated ? { rotation: eulerToQuat(euler) } : {}),
      friction: options.friction ?? 0.5,
      restitution: options.restitution ?? 0.3
    });
    const collider = world.createCollider(body, {
      shape: physics.box(halfExtents[0], halfExtents[1], halfExtents[2]),
      ...(options.sensor ? { sensor: true } : {}),
      material: { friction: options.friction ?? 0.5, restitution: options.restitution ?? 0.3 }
    });
    registerCollider(collider.id, name, options.sensor === true);
    if (options.kick) kickColliderIds.set(collider.id, { kind: options.kick.kind, id: name });
    if (options.visible !== false) {
      trackVisual({
        name,
        source: "primitive",
        primitive: {
          shape: "box",
          size: [halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2],
          color: options.color ?? "#1a2130",
          ...(options.emissive ? { emissive: options.emissive } : {})
        },
        position,
        rotation: euler,
        dynamic: false
      });
    }
    return body;
  };

  // ---- playfield -------------------------------------------------------------
  addStaticBox("felt", [2.85, 0.1, 4.15], [0, -0.1, 0], { friction: 0.1, restitution: 0.18, color: "#0c0818", emissive: "#0e0620" });
  // Perimeter walls (invisible: the typed cabinet GLB carries the look).
  addStaticBox("wall-top", [2.85, 0.4, 0.1], [0, 0.4, -4.0], { visible: false, restitution: 0.42 });
  addStaticBox("wall-left", [0.1, 0.4, 4.15], [-2.7, 0.4, 0], { visible: false, restitution: 0.42 });
  addStaticBox("wall-right", [0.1, 0.4, 4.15], [2.7, 0.4, 0], { visible: false, restitution: 0.42 });
  // Bottom wall with the center drain gap (x in [-0.7, 0.7]).
  addStaticBox("wall-bottom-left", [2.0, 0.4, 0.1], [-2.7 + 0.8, 0.4, 4.0], { visible: false, restitution: 0.3 });
  addStaticBox("wall-bottom-right", [2.0, 0.4, 0.1], [2.7 - 0.8, 0.4, 4.0], { visible: false, restitution: 0.3 });
  // Corner deflectors steering wide balls toward the drain gap (XZ-plane walls:
  // yaw, not roll).
  addStaticBox("deflector-left", [0.82, 0.3, 0.07], [-1.65, 0.3, 3.75], { rotationY: -0.245, visible: false, restitution: 0.3 });
  addStaticBox("deflector-right", [0.82, 0.3, 0.07], [1.65, 0.3, 3.75], { rotationY: 0.245, visible: false, restitution: 0.3 });
  // Invisible shells above the walls keep bouncing balls inside the cabinet.
  addStaticBox("shell-left", [0.1, 1.6, 4.15], [-2.7, 1.6, 0], { visible: false });
  addStaticBox("shell-right", [0.1, 1.6, 4.15], [2.7, 1.6, 0], { visible: false });
  addStaticBox("shell-top", [2.85, 1.6, 0.1], [0, 1.6, -4.0], { visible: false });
  addStaticBox("ceiling-guard", [2.85, 0.1, 4.15], [0, 3.4, 0], { visible: false });

  // ---- plunger lane ----------------------------------------------------------
  // Lane between x = 2.29 (inner-wall face) and x = 2.60 (outer-wall face):
  // 0.31 m of clearance for the 0.28 m ball. Opening at the top (z < -2.6).
  addStaticBox("lane-inner-wall", [0.09, 0.32, 3.3], [2.2, 0.32, 0.7], { visible: false, restitution: 0.42 });
  // Habitrail deflector INSIDE the lane top: a ball arriving at full speed hits
  // this diagonal and is guided left into the playfield instead of rebounding
  // off the top wall back down the lane. Long enough to embed both ends deep
  // into the side walls so no gap lets the ball squeeze past.
  addStaticBox("lane-guide", [0.45, 0.14, 0.08], [2.44, 0.3, -3.05], { rotationY: 2.11, visible: false, restitution: 0.6 });
  trackVisual({
    name: "lane-arrow",
    source: "primitive",
    primitive: { shape: "box", size: [0.3, 0.02, 0.1], color: "#00d4ff", emissive: "#00aacc", opacity: 0.9 },
    position: [2.44, 0.03, 3.3],
    rotation: { x: 0, y: 0, z: 0 },
    dynamic: false
  });

  // ---- bumpers (pop bumpers: restitution + authored kick impulse) ------------
  const bumpers: { readonly id: string; readonly x: number; readonly z: number }[] = [
    { id: "bumper-left", x: -0.9, z: -1.7 },
    { id: "bumper-right", x: 0.9, z: -1.7 },
    { id: "bumper-center", x: 0, z: -0.7 }
  ];
  for (const bumper of bumpers) {
    addStaticBox(bumper.id, [0.24, 0.14, 0.24], [bumper.x, 0.16, bumper.z], {
      restitution: 0.95,
      kick: { kind: "bumper" },
      color: "#1a0e00",
      emissive: "#ff6a00"
    });
    trackVisual({
      name: bumper.id + "-cap",
      source: "primitive",
      primitive: { shape: "cylinder", size: [0.3, 0.16, 0.3], color: "#ff8800", emissive: "#ff6a00" },
      position: [bumper.x, 0.36, bumper.z],
      rotation: { x: 0, y: 0, z: 0 },
      dynamic: false
    });
  }

  // ---- slingshots ------------------------------------------------------------
  const slings: { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number }[] = [
    { id: "sling-left", x: -1.2, z: 2.1, yaw: -0.67 },
    { id: "sling-right", x: 1.2, z: 2.1, yaw: 0.67 }
  ];
  for (const sling of slings) {
    addStaticBox(sling.id, [0.64, 0.16, 0.07], [sling.x, 0.2, sling.z], {
      rotationY: sling.yaw,
      restitution: 0.9,
      kick: { kind: "sling" },
      color: "#1a0800",
      emissive: "#ff4500"
    });
  }

  // ---- orbit channel + sensor --------------------------------------------------
  // Only a LEFT orbit guide exists: on real tables the shooter lane IS the
  // right orbit entrance, so the deflected serve carries straight across the
  // top through the orbit sensor and down the left channel. The left guide's
  // upper end leaves a deliberate 0.35 m entrance at the left wall.
  addStaticBox("orbit-guide-left", [0.895, 0.2, 0.07], [-1.85, 0.2, -2.8], { rotationY: -2.03, visible: false, restitution: 0.45 });
  {
    const body = world.createBody({ type: "static", position: [0, 0.16, -3.05] });
    const collider = world.createCollider(body, { shape: physics.box(0.55, 0.16, 0.2), sensor: true });
    registerCollider(collider.id, "orbit:pass", true);
  }
  trackVisual({
    name: "orbit-marker",
    source: "primitive",
    primitive: { shape: "torus", size: [0.5, 0.5, 0.04], color: "#00e5ff", emissive: "#00b8d4", opacity: 0.85 },
    position: [0, 0.03, -3.05],
    rotation: { x: Math.PI / 2, y: 0, z: 0 },
    dynamic: false
  });

  // ---- vault chamber ----------------------------------------------------------
  // Chamber behind z = -3.3, x in [-0.85, 0.85]; the door seals the opening.
  addStaticBox("vault-wall-left", [0.08, 0.3, 0.35], [-0.85, 0.3, -3.65], { visible: false });
  addStaticBox("vault-wall-right", [0.08, 0.3, 0.35], [0.85, 0.3, -3.65], { visible: false });
  addStaticBox("vault-throat-left", [0.5, 0.3, 0.08], [-0.35, 0.3, -3.32], { visible: false });
  addStaticBox("vault-throat-right", [0.5, 0.3, 0.08], [0.35, 0.3, -3.32], { visible: false });
  const vaultDoor = addStaticBox("vault-door", [0.3, 0.26, 0.06], [0, 0.24, -3.32], {
    visible: false,
    restitution: 0.5
  });
  trackVisual({
    name: "vault-door-visual",
    source: "model",
    typedAsset: "vaultBreakersVaultDoor",
    targetMaxDimension: 0.52,
    position: [0, 0.24, -3.3],
    rotation: { x: 0, y: 0, z: 0 },
    dynamic: false
  });
  {
    const body = world.createBody({ type: "static", position: [0, 0.16, -3.72] });
    const collider = world.createCollider(body, { shape: physics.box(0.55, 0.16, 0.24), sensor: true });
    registerCollider(collider.id, "vault:mouth", true);
  }

  // ---- target banks -----------------------------------------------------------
  const targetIds: string[] = [];
  for (const bankId of BANK_IDS) {
    const positions = BANK_TARGET_POSITIONS[bankId];
    for (let t = 0; t < positions.length; t += 1) {
      const [x, z] = positions[t]!;
      const id = `${bankId}:t${t}`;
      targetIds.push(id);
      const body = world.createBody({ type: "static", position: [x, 0.16, z] });
      const collider = world.createCollider(body, { shape: physics.box(0.12, 0.16, 0.06), sensor: true });
      registerCollider(collider.id, `target:${id}`, true);
      trackVisual({
        name: `target:${id}`,
        source: "primitive",
        primitive: { shape: "box", size: [0.28, 0.42, 0.08], color: "#ffb830", emissive: "#ff6a00", opacity: 1 },
        position: [x, 0.2, z],
        rotation: { x: 0, y: 0, z: 0 },
        dynamic: false
      });
    }
  }

  // ---- drain sensor -----------------------------------------------------------
  {
    const body = world.createBody({ type: "static", position: [0, 0.05, 3.92] });
    const collider = world.createCollider(body, { shape: physics.box(0.68, 0.2, 0.2), sensor: true });
    registerCollider(collider.id, "drain:lane", true);
  }
  trackVisual({
    name: "drain-visual",
    source: "primitive",
    primitive: { shape: "box", size: [1.36, 0.02, 0.4], color: "#050510", emissive: "#0a0a20", opacity: 0.9 },
    position: [0, 0.012, 3.92],
    rotation: { x: 0, y: 0, z: 0 },
    dynamic: false
  });

  // ---- flippers (VB-01 spike parameters, same-sign axis mirror) ---------------
  const makeFlipper = (side: "left" | "right"): FlipperRig => {
    const pivotX = side === "left" ? -FLIPPER_PIVOT_X : FLIPPER_PIVOT_X;
    const restYaw = side === "left" ? FLIPPER_REST_YAW : RIGHT_REST_YAW;
    const upYaw = side === "left" ? FLIPPER_UP_YAW : RIGHT_UP_YAW;
    const axis: readonly [number, number, number] = side === "left" ? [0, 1, 0] : [0, -1, 0];
    const limits: readonly [number, number] = side === "left"
      ? [FLIPPER_REST_YAW, FLIPPER_UP_YAW]
      : RIGHT_JOINT_LIMITS;
    const pivot: readonly [number, number, number] = [pivotX, BALL_RADIUS + 0.02, 3.15];
    const batCenter: readonly [number, number, number] = [
      pivot[0] + Math.cos(restYaw) * 0.4,
      pivot[1],
      pivot[2] - Math.sin(restYaw) * 0.4
    ];
    const restQuat = [0, Math.sin(restYaw / 2), 0, Math.cos(restYaw / 2)] as const;
    const anchor = world.createBody({ type: "static", position: [...pivot] as [number, number, number] });
    const bat = world.createBody({
      type: "dynamic",
      position: [...batCenter] as [number, number, number],
      rotation: [...restQuat] as [number, number, number, number],
      mass: FLIPPER_BAT_MASS,
      friction: 0.55,
      restitution: 0.65,
      linearDamping: 0.4,
      angularDamping: 0.3
    });
    const collider = world.createCollider(bat, {
      shape: physics.box(0.4, 0.055, 0.065),
      material: { friction: 0.55, restitution: 0.65 }
    });
    registerCollider(collider.id, `flipper-${side}`, false);
    const joint = world.createConstraint({
      type: "motorised-hinge",
      bodyA: anchor,
      bodyB: bat,
      localAnchorA: [0, 0, 0],
      localAnchorB: [-0.4, 0, 0],
      axis,
      limits,
      motorSpeed: 0,
      maxMotorTorque: FLIPPER_MOTOR_TORQUE
    });
    jointCount += 1;
    trackVisual({
      name: `flipper-${side}`,
      source: "model",
      typedAsset: "vaultBreakersFlipper",
      targetMaxDimension: 0.95,
      position: [...batCenter] as [number, number, number],
      rotation: { x: 0, y: restYaw, z: 0 },
      dynamic: true
    }, true);
    return {
      side,
      joint,
      bat,
      raise() {
        bat.wake();
        joint.setMotorSpeed(FLIPPER_RAISE_SPEED);
      },
      release() {
        bat.wake();
        joint.setMotorSpeed(FLIPPER_RETURN_SPEED);
      },
      yaw() {
        return Math.atan2(bat.rotation[1], bat.rotation[3]) * 2;
      }
    };
  };
  const left = makeFlipper("left");
  const right = makeFlipper("right");

  // Ball visuals are pre-registered (parked below the cabinet) so the mount-
  // time scene graph contains a node for every possible live ball; a live ball
  // is posed onto its node each frame, a parked one never renders in view.
  for (let index = 0; index < 8; index += 1) {
    trackVisual({
      name: `ball-${index}`,
      source: "model",
      typedAsset: "vaultBreakersBall",
      targetMaxDimension: BALL_RADIUS * 2,
      position: [0, -5 - index * 0.4, 0],
      rotation: { x: 0, y: 0, z: 0 },
      dynamic: true
    }, true);
  }

  // ---- balls ------------------------------------------------------------------
  const makeBall = (index: number, position: readonly [number, number, number]): BallEntry => {
    const body = world.createBody({
      type: "dynamic",
      position: [...position] as [number, number, number],
      mass: BALL_MASS,
      friction: 0.16,
      restitution: 0.5,
      linearDamping: 0.05,
      angularDamping: 0.2
    });
    const collider = world.createCollider(body, { shape: physics.sphere(BALL_RADIUS) });
    registerCollider(collider.id, `ball-${index}`, false);
    void trackVisual; // visuals were pre-registered at mount; nothing to add here
    return { index, body, state: "lane" };
  };

  const parkBall = (entry: BallEntry): void => {
    entry.body.setPosition([0, -5 - entry.index * 0.5, 0]);
    entry.body.setVelocity([0, 0, 0]);
    entry.body.setAngularVelocity([0, 0, 0]);
    entry.body.sleep();
  };

  const ballIndexFor = (name: string): number => {
    const match = /^ball-(\d+)$/.exec(name);
    return match ? Number(match[1]) : -1;
  };

  const applyKick = (ballName: string, kind: "bumper" | "sling", id: string, normal: readonly [number, number, number]): void => {
    const entry = balls.find((candidate) => `ball-${candidate.index}` === ballName);
    if (!entry || entry.state === "drained") return;
    const key = `${id}:${entry.index}`;
    const last = kickCooldown.get(key) ?? -999;
    if (stepIndex - last < 18) return;
    const v = entry.body.velocity;
    // Kick only a real approach: micro-bounces of a resting ball must not
    // re-kick forever (an endless kick loop never lets the table settle).
    const approach = -(normal[0] * v[0] + normal[1] * v[1] + normal[2] * v[2]);
    if (approach < 0.4) return;
    kickCooldown.set(key, stepIndex);
    const strength = kind === "bumper" ? BUMPER_KICK : SLING_KICK;
    entry.body.wake();
    entry.body.setVelocity([v[0] + normal[0] * strength, v[1] + normal[1] * strength * 0.2, v[2] + normal[2] * strength]);
  };

  const serveBall = (charge: number): boolean => {
    // A full reset parks prior bodies as drained. Reuse that bounded pool before
    // allocating so repeated three-ball sessions can never exhaust the eight
    // pre-mounted visual/body slots.
    const existing = balls.find((candidate) => candidate.state === "lane")
      ?? balls.find((candidate) => candidate.state === "drained");
    let entry = existing;
    if (!entry) {
      if (nextBallIndex >= 8) return false;
      entry = makeBall(nextBallIndex, [2.44, BALL_RADIUS + 0.02, 3.3]);
      nextBallIndex += 1;
      balls.push(entry);
    }
    const speed = PLUNGER_MIN_SPEED + Math.max(0, Math.min(1, charge)) * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED);
    entry.body.wake();
    entry.body.setPosition([2.44, BALL_RADIUS + 0.02, 3.3]);
    entry.body.setVelocity([0, 0, -speed]);
    entry.body.setAngularVelocity([0, 0, 0]);
    entry.state = "lane";
    return true;
  };

  const releaseMultiball = (): number => {
    let released = 0;
    for (const offset of [-0.25, 0.25]) {
      let entry = balls.find((candidate) => candidate.state === "drained");
      if (!entry) {
        if (nextBallIndex >= 8) break;
        entry = makeBall(nextBallIndex, [offset, BALL_RADIUS + 0.02, -3.5]);
        nextBallIndex += 1;
        balls.push(entry);
      }
      entry.body.wake();
      entry.body.setPosition([offset, BALL_RADIUS + 0.02, -3.5]);
      entry.body.setVelocity([offset * -1.2, 0, 2.4]);
      entry.state = "play";
      released += 1;
    }
    return released;
  };

  const nudge = (dirX: number): void => {
    for (const entry of balls) {
      if (entry.state === "drained") continue;
      entry.body.wake();
      const v = entry.body.velocity;
      entry.body.setVelocity([v[0] + dirX * 0.9, v[1], v[2] - 0.6]);
    }
  };

  const openVaultDoor = (): void => {
    // Authored door open: park the seal body aside; the visual door swings via
    // the route's runtime node (physics never simulates the swing).
    vaultDoor.setPosition([1.6, 0.24, -3.6]);
    vaultDoor.setRotation([0, 0, 0, 1]);
  };

  const stepFixed = (steps = 1): void => {
    for (let index = 0; index < steps; index += 1) {
      stepIndex += 1;
      const events = world.step(1 / 60);
      for (const event of events) {
        const contact = event.contact;
        const aName = colliderNameById.get(contact.colliderA);
        const bName = colliderNameById.get(contact.colliderB);
        if (!aName || !bName) continue;
        const ballName = aName.startsWith("ball-") ? aName : bName.startsWith("ball-") ? bName : undefined;
        const otherName = ballName === aName ? bName : aName;
        if (!ballName) continue;
        const ballIndex = ballIndexFor(ballName);
        if (contact.sensor) {
          const pairKey = [aName, bName].sort().join("::");
          if (event.type === "begin" && !armedPairs.has(pairKey)) {
            armedPairs.add(pairKey);
            pendingSensors.push({ kind: sensorKindFor(otherName), id: otherName, ballIndex, stepIndex });
          } else if (event.type === "end") {
            armedPairs.delete(pairKey);
          }
          continue;
        }
        const kick = kickColliderIds.get(contact.colliderA) ?? kickColliderIds.get(contact.colliderB);
        if (event.type === "begin" && kick && ballIndex >= 0) {
          applyKick(ballName, kick.kind, kick.id, [contact.normal[0], contact.normal[1], contact.normal[2]]);
        }
        const entry = balls[ballIndex];
        const v = entry?.body.velocity ?? [0, 0, 0];
        const speed = Math.abs(contact.normal[0] * v[0] + contact.normal[1] * v[1] + contact.normal[2] * v[2]);
        if (speed > 0.35) {
          pendingImpacts.push({ a: aName, b: bName, speed, normal: [contact.normal[0], contact.normal[1], contact.normal[2]] });
        }
      }
      // Ball state transitions by geometry (authoritative, not sensors).
      for (const entry of balls) {
        if (entry.state === "drained") continue;
        const p = entry.body.position;
        if (entry.state === "lane" && p[2] < -2.55 && p[0] < 2.3) entry.state = "play";
        // Authored auto-plunge: any ball dwelling at the shooter-lane bottom —
        // a weak serve that rolled back, or a play ball that bounced into the
        // lane mouth — is reclassified and re-launched after a dwell window
        // (documented authored behavior; real tables auto-plunge the same way).
        // Dwell, not rest: slope creep keeps a trapped ball above any speed
        // threshold, so the region itself triggers recovery.
        if (p[0] > 2.3 && p[2] > 2.6) {
          const dwell = laneRestFrames.get(entry.index) ?? 0;
          if (dwell >= 60) {
            laneRestFrames.set(entry.index, 0);
            entry.state = "lane";
            entry.body.wake();
            entry.body.setVelocity([0, 0, -(PLUNGER_MIN_SPEED + 1.5)]);
          } else {
            laneRestFrames.set(entry.index, dwell + 1);
          }
        } else {
          laneRestFrames.set(entry.index, 0);
        }
        // The drain lane: between the flipper tips the ball settles into the
        // bottom gap (the physical gap is narrower than the ball, so the catch
        // zone mirrors the drain sensor region — a ball through the flippers
        // has drained).
        if (p[2] > 3.72 && Math.abs(p[0]) < 0.68) {
          entry.state = "drained";
          parkBall(entry);
        }
        // Safety: a play ball below the felt or outside the cabinet is a drain.
        if (entry.state !== "drained" && (p[1] < -1.5 || Math.abs(p[0]) > 3.4 || Math.abs(p[2]) > 4.6)) {
          entry.state = "drained";
          parkBall(entry);
        }
      }
    }
  };

  const poses = (): readonly TrackedPose[] => {
    const out: TrackedPose[] = [];
    out.push({
      name: "flipper-left",
      position: [...left.bat.position] as [number, number, number],
      rotation: [...left.bat.rotation] as [number, number, number, number]
    });
    out.push({
      name: "flipper-right",
      position: [...right.bat.position] as [number, number, number],
      rotation: [...right.bat.rotation] as [number, number, number, number]
    });
    for (const entry of balls) {
      if (entry.state === "drained") continue;
      out.push({
        name: `ball-${entry.index}`,
        position: [...entry.body.position] as [number, number, number],
        rotation: [0, 0, 0, 1]
      });
    }
    return out;
  };

  const poseHash = (): string => {
    const q = (value: number): string => String(Math.round(value * 1000));
    const parts: string[] = [];
    for (const pose of poses()) {
      parts.push(pose.name, q(pose.position[0]), q(pose.position[1]), q(pose.position[2]));
    }
    parts.push("door", q(vaultDoor.position[0]));
    return hashString(parts.join("|"));
  };

  const activity = (): { movingBodies: number; settled: boolean } => {
    let movingBodies = 0;
    for (const entry of balls) {
      if (entry.state === "drained") continue;
      const v = entry.body.velocity;
      if (Math.hypot(v[0], v[1], v[2]) > 0.14) movingBodies += 1;
    }
    for (const rig of [left, right]) {
      const w = rig.bat.angularVelocity;
      if (Math.hypot(w[0], w[1], w[2]) > 0.4) movingBodies += 1;
    }
    return { movingBodies, settled: movingBodies === 0 };
  };

  const trackedPoseNames = (): string[] => {
    const names = ["flipper-left", "flipper-right"];
    for (const entry of balls) {
      if (entry.state !== "drained") names.push(`ball-${entry.index}`);
    }
    return names;
  };

  return {
    world,
    visuals,
    get dynamicVisualNames() {
      return dynamicVisualNames;
    },
    flippers: { left, right },
    vaultDoor,
    get bodyCount(): number {
      // Static table bodies + flippers + live balls.
      return 30 + trackedPoseNames().length;
    },
    jointCount,
    get backend(): string {
      return world.snapshot().backend.active;
    },
    fixedDelta: 1 / 60,
    targetIds,
    openVaultDoor,
    serveBall,
    releaseMultiball,
    activeBallCount(): number {
      return balls.filter((entry) => entry.state !== "drained").length;
    },
    ballInPlay(): boolean {
      return balls.some((entry) => entry.state === "play" || entry.state === "lane");
    },
    ballStates(): readonly { index: number; state: string }[] {
      return balls.map((entry) => ({ index: entry.index, state: entry.state }));
    },
    nudge,
    stepFixed,
    poses,
    poseHash,
    activity,
    consumeImpacts(): readonly ImpactEvent[] {
      const out = pendingImpacts;
      pendingImpacts = [];
      return out;
    },
    consumeSensorEvents(): readonly SensorEvent[] {
      const out = pendingSensors;
      pendingSensors = [];
      return out;
    },
    parkAll(): void {
      for (const entry of balls) {
        entry.state = "drained";
        parkBall(entry);
      }
    },
    debugBallBody(index: number): SimBody | undefined {
      return balls.find((entry) => entry.index === index)?.body;
    }
  };
}

function sensorKindFor(name: string): TableSensorKind {
  if (name.startsWith("target:")) return "target";
  if (name.startsWith("drain:")) return "drain";
  if (name.startsWith("orbit:")) return "orbit";
  if (name.startsWith("vault:")) return "vault";
  return "bumper";
}

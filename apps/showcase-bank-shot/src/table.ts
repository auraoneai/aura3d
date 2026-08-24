/**
 * Bank Shot table definition + simulation (PRD BS-04/05/06).
 *
 * Everything runs through the public root-safe physics surface: `physics.world`
 * constructs the Rapier-backed controller (gravity [0,-9.81,0], fixed 1/60 step,
 * 12 solver iterations, sleeping, adaptive-substep CCD because strikes are fast),
 * `createBody`/`createCollider` declare bodies (including pocket sensors), and
 * the world's `sphereCast` drives the aim sweep preview. The same builder drives
 * the browser route and the headless unit tests.
 *
 * Authored (non-simulated) elements, labeled as such everywhere claims appear:
 * - cue-ball "spin" is a bounded velocity nudge applied on the cue ball's next
 *   contact after the strike (no angular simulation is claimed);
 * - pocket resolution is a capture-radius rule around each pocket mouth plus
 *   out-of-bounds recovery (the table has no physical pocket wells);
 * - potted balls park below the table and sleep.
 */
import { physics } from "@aura3d/engine";

export type SimBody = ReturnType<ReturnType<typeof physics.world>["createBody"]>;
export type SimWorld = ReturnType<typeof physics.world>;

export const BALL_RADIUS = 0.035;
export const BALL_MASS = 0.17;
export const BALL_FRICTION = 0.2;
/** Rapier combines materials; ~0.9 on both colliders gives ~0.9 ball-ball play. */
export const BALL_RESTITUTION = 0.9;
export const CUSHION_RESTITUTION = 0.85;
export const LINEAR_DAMPING = 0.28;
export const ANGULAR_DAMPING = 0.4;

/** Inside cushion faces: the 2.6 x 1.4 playfield (x is the long axis). */
export const PLAY_HALF_X = 1.3;
export const PLAY_HALF_Z = 0.7;
export const POCKET_RADIUS = 0.065;

/** Cue ball head spot and the rack apex (x grows toward the rack end). */
export const CUE_SPOT: readonly [number, number] = [-0.7, 0];
export const RACK_APEX: readonly [number, number] = [0.55, 0];
export const RACK_SPACING = 0.0735;

export const STRIKE_MIN_POWER = 0.12;
export const STRIKE_MIN_SPEED = 1.2;
export const STRIKE_MAX_SPEED = 5.2;
/** Authored spin nudge ceiling (m/s) applied on the cue's next contact. */
export const SPIN_NUDGE = 0.55;

export const POCKET_IDS = [
  "corner-north-west",
  "corner-north-east",
  "corner-south-west",
  "corner-south-east",
  "side-north",
  "side-south"
] as const;
export type PocketId = (typeof POCKET_IDS)[number];

export const POCKET_CENTERS: readonly { readonly id: PocketId; readonly x: number; readonly z: number }[] = [
  { id: "corner-north-west", x: -PLAY_HALF_X, z: -PLAY_HALF_Z },
  { id: "corner-north-east", x: PLAY_HALF_X, z: -PLAY_HALF_Z },
  { id: "corner-south-west", x: -PLAY_HALF_X, z: PLAY_HALF_Z },
  { id: "corner-south-east", x: PLAY_HALF_X, z: PLAY_HALF_Z },
  { id: "side-north", x: 0, z: -PLAY_HALF_Z },
  { id: "side-south", x: 0, z: PLAY_HALF_Z }
];

/**
 * Rack order: 15 object balls in 5 rows behind the apex. The 8 sits in the
 * middle of the third row; the back corners mix a solid and a stripe.
 */
export const RACK_ROWS: readonly (readonly number[])[] = [
  [1],
  [11, 5],
  [2, 8, 10],
  [9, 3, 14, 6],
  [7, 13, 4, 15, 12]
];

export interface Euler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PropVisual {
  readonly name: string;
  readonly source: "model" | "primitive";
  readonly typedAsset?: string;
  readonly targetMaxDimension?: number;
  readonly primitive?: {
    readonly shape: "box" | "sphere";
    readonly size: readonly [number, number, number];
    readonly color: string;
    readonly emissive?: string;
    readonly opacity?: number;
  };
  readonly position: readonly [number, number, number];
  readonly rotation: Euler;
  readonly dynamic: boolean;
}

export interface TrackedPose {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export interface PocketSensorEvent {
  readonly pocket: PocketId;
  readonly ball: number;
  readonly stepIndex: number;
}

export type ImpactKind = "ball-ball" | "ball-cushion" | "ball-felt";

export interface ImpactEvent {
  readonly kind: ImpactKind;
  readonly ball: number;
  readonly otherBall: number | null;
  readonly surface: string | null;
  readonly speed: number;
  readonly stepIndex: number;
}

export interface PotEvent {
  readonly ball: number;
  readonly pocket: PocketId;
  readonly stepIndex: number;
}

/**
 * Deterministic analytic shot facts. The vendored Rapier adapter synthesizes
 * collision events by polling contacts AFTER each step, so a fast cue-to-rack
 * contact (begun and resolved inside one step) never appears in the event list.
 * The rules engine therefore consumes these swept/geometric facts instead:
 * - "cue-first-contact": the cue ball's swept segment touched an object ball;
 * - "cushion-touch": a live ball entered the cushion band (a rail touch).
 */
export interface ShotFactEvent {
  readonly type: "cue-first-contact" | "cushion-touch";
  readonly ball: number;
  readonly stepIndex: number;
}

export interface ShotFacts {
  readonly firstContact: number | null;
  readonly cushionAfterContact: boolean;
}

export interface BallInfo {
  readonly number: number;
  readonly live: boolean;
  readonly x: number;
  readonly z: number;
  readonly speed: number;
}

export interface SweepHit {
  readonly kind: "ball" | "cushion" | "none";
  readonly ballNumber: number | null;
  readonly surface: string | null;
  readonly ghostX: number;
  readonly ghostZ: number;
  readonly normalX: number;
  readonly normalZ: number;
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

/** Ball-number start spots: cue at the head spot, objects in the triangle. */
export function rackSpotFor(number: number): readonly [number, number] {
  if (number === 0) return CUE_SPOT;
  let seen = 0;
  for (let row = 0; row < RACK_ROWS.length; row += 1) {
    const balls = RACK_ROWS[row]!;
    for (let slot = 0; slot < balls.length; slot += 1) {
      if (balls[slot] === number) {
        const x = RACK_APEX[0] + row * RACK_SPACING * Math.cos(Math.PI / 6);
        const z = (slot - row / 2) * RACK_SPACING;
        return [x, z];
      }
      seen += 1;
    }
  }
  void seen;
  return RACK_APEX;
}

export interface TableSimulation {
  readonly world: SimWorld;
  readonly visuals: readonly PropVisual[];
  readonly dynamicVisualNames: readonly string[];
  readonly backend: string;
  readonly fixedDelta: number;
  readonly pocketIds: readonly PocketId[];
  /** Strike from the cue ball: power 0.12..1, angle radians, spin -1..1. */
  strike(power: number, angle: number, spin: number): boolean;
  stepFixed(steps?: number): void;
  poses(): readonly TrackedPose[];
  poseHash(): string;
  ballInfos(): readonly BallInfo[];
  liveBallCount(): number;
  pottedList(): readonly number[];
  cueAtRest(): boolean;
  allAtRest(threshold?: number): boolean;
  /** Ball-in-hand placement checks + cue restoration after a scratch. */
  canPlaceCue(x: number, z: number): boolean;
  restoreCueAt(x: number, z: number): boolean;
  placeCue(x: number, z: number): boolean;
  /** Physics sweep (sphereCast) from the cue ball along an angle. */
  sweepFromCue(angle: number): SweepHit;
  /** Analytic per-shot facts for the rules engine (swept first contact, rail). */
  shotFacts(): ShotFacts;
  consumeShotFactEvents(): readonly ShotFactEvent[];
  resetRack(): void;
  consumeSensorEvents(): readonly PocketSensorEvent[];
  consumeImpacts(): readonly ImpactEvent[];
  consumePotEvents(): readonly PotEvent[];
  debugBallBody(number: number): SimBody | undefined;
}

interface BallEntry {
  readonly number: number;
  readonly body: SimBody;
  state: "live" | "potted";
}

export function createTableSimulation(): TableSimulation {
  const world = physics.world({
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 60,
    solverIterations: 12,
    enableSleeping: true,
    sleepVelocityThreshold: 0.05,
    sleepDelay: 0.5,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.35 }
  });

  const visuals: PropVisual[] = [];
  const dynamicVisualNames: string[] = [];
  const colliderNameById = new Map<number, string>();
  const armedPairs = new Set<string>();
  let pendingSensors: PocketSensorEvent[] = [];
  let pendingImpacts: ImpactEvent[] = [];
  let pendingPots: PotEvent[] = [];
  let pendingShotFacts: ShotFactEvent[] = [];
  let stepIndex = 0;

  // Authored spin armed by strike(), consumed on the cue's first contact.
  let armedSpin = 0;
  let armedSpinDir: readonly [number, number] = [1, 0];
  let spinArmed = false;

  // Analytic per-shot facts (see ShotFactEvent): the polled collision events
  // miss contacts that begin and end inside a single solver step, so the rules
  // engine consumes these swept/geometric truths instead.
  let shotFirstContactValue: number | null = null;
  let shotCushionAfterValue = false;
  const railTouchState = new Map<number, boolean>();

  /** A live ball whose center is this close to a rail line is touching it. */
  const RAIL_BAND_X = PLAY_HALF_X - BALL_RADIUS - 0.004;
  const RAIL_BAND_Z = PLAY_HALF_Z - BALL_RADIUS - 0.004;

  const registerCollider = (colliderId: number, name: string): void => {
    colliderNameById.set(colliderId, name);
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
      friction?: number;
      restitution?: number;
      sensor?: boolean;
      visible?: boolean;
    } = {}
  ): { body: SimBody; colliderId: number } => {
    const body = world.createBody({
      type: "static",
      position: [...position] as [number, number, number],
      friction: options.friction ?? 0.5,
      restitution: options.restitution ?? 0.3
    });
    const collider = world.createCollider(body, {
      shape: physics.box(halfExtents[0], halfExtents[1], halfExtents[2]),
      ...(options.sensor ? { sensor: true } : {}),
      material: { friction: options.friction ?? 0.5, restitution: options.restitution ?? 0.3 }
    });
    registerCollider(collider.id, name);
    return { body, colliderId: collider.id };
  };

  // ---- felt ---------------------------------------------------------------------
  // Top face at y = 0, extending under the pocket mouths so a ball through a gap
  // keeps rolling until the capture rule pots it.
  addStaticBox("felt", [1.48, 0.06, 0.88], [0, -0.06, 0], { friction: 0.35, restitution: 0.3 });

  // ---- cushions -----------------------------------------------------------------
  // Inner faces at |x| = 1.3 / |z| = 0.7 with pocket gaps: 4 corners + 2 side
  // middles (midpoint of the long rails). CORNER_GAP/SIDE_GAP leave the mouths.
  const CORNER_GAP = 0.1;
  const SIDE_GAP = 0.095;
  const longRailSegments = (side: "north" | "south"): void => {
    const zLine = side === "north" ? -PLAY_HALF_Z : PLAY_HALF_Z;
    const zCenter = side === "north" ? zLine - 0.05 : zLine + 0.05;
    const inner = PLAY_HALF_X - CORNER_GAP;
    for (const sign of [-1, 1] as const) {
      const centerX = sign * (SIDE_GAP + inner) / 2;
      const halfX = (inner - SIDE_GAP) / 2;
      addStaticBox(`cushion-long-${side}-${sign < 0 ? "west" : "east"}`, [halfX, 0.05, 0.05], [centerX, 0.05, zCenter], {
        restitution: CUSHION_RESTITUTION,
        friction: 0.2
      });
    }
  };
  longRailSegments("north");
  longRailSegments("south");
  for (const sign of [-1, 1] as const) {
    const halfZ = PLAY_HALF_Z - CORNER_GAP;
    addStaticBox(`cushion-short-${sign < 0 ? "west" : "east"}`, [0.05, 0.05, halfZ], [sign * (PLAY_HALF_X + 0.05), 0.05, 0], {
      restitution: CUSHION_RESTITUTION,
      friction: 0.2
    });
  }

  // ---- pocket sensors (once-per-entry arming in stepFixed) ------------------------
  const pocketSensorColliders: number[] = [];
  for (const pocket of POCKET_CENTERS) {
    const { colliderId } = addStaticBox(`pocket:${pocket.id}`, [0.075, 0.08, 0.075], [pocket.x, 0.035, pocket.z], {
      sensor: true
    });
    pocketSensorColliders.push(colliderId);
  }

  // ---- invisible shells: nothing ever leaves the table ---------------------------
  addStaticBox("shell-west", [0.05, 0.4, 1.0], [-1.5, 0.4, 0], { restitution: 0.4 });
  addStaticBox("shell-east", [0.05, 0.4, 1.0], [1.5, 0.4, 0], { restitution: 0.4 });
  addStaticBox("shell-north", [1.6, 0.4, 0.05], [0, 0.4, -0.9], { restitution: 0.4 });
  addStaticBox("shell-south", [1.6, 0.4, 0.05], [0, 0.4, 0.9], { restitution: 0.4 });
  addStaticBox("ceiling-guard", [1.6, 0.05, 1.0], [0, 1.2, 0], {});

  // ---- balls ----------------------------------------------------------------------
  const balls: BallEntry[] = [];
  const ballByNumber = (number: number): BallEntry | undefined => balls.find((entry) => entry.number === number);
  let cueColliderId = -1;

  const makeBall = (number: number): BallEntry => {
    const [spotX, spotZ] = rackSpotFor(number);
    const body = world.createBody({
      type: "dynamic",
      position: [spotX, BALL_RADIUS, spotZ] as [number, number, number],
      mass: BALL_MASS,
      friction: BALL_FRICTION,
      restitution: BALL_RESTITUTION,
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING
    });
    const collider = world.createCollider(body, {
      shape: physics.sphere(BALL_RADIUS),
      material: { friction: BALL_FRICTION, restitution: BALL_RESTITUTION }
    });
    registerCollider(collider.id, `ball-${number}`);
    if (number === 0) cueColliderId = collider.id;
    const entry: BallEntry = { number, body, state: "live" };
    balls.push(entry);
    trackVisual(
      {
        name: `ball-${String(number).padStart(2, "0")}`,
        source: "model",
        typedAsset: `bankShotBall${String(number).padStart(2, "0")}`,
        targetMaxDimension: BALL_RADIUS * 2,
        position: [spotX, BALL_RADIUS, spotZ],
        rotation: { x: 0, y: 0, z: 0 },
        dynamic: true
      },
      true
    );
    return entry;
  };
  for (let number = 0; number <= 15; number += 1) makeBall(number);

  const parkBall = (entry: BallEntry): void => {
    entry.body.wake();
    entry.body.setPosition([0, -5 - entry.number * 0.5, 0]);
    entry.body.setVelocity([0, 0, 0]);
    entry.body.setAngularVelocity([0, 0, 0]);
    entry.body.sleep();
    entry.state = "potted";
    railTouchState.set(entry.number, false);
  };

  const ballNumberFor = (name: string): number => {
    const match = /^ball-(\d+)$/.exec(name);
    return match ? Number(match[1]) : -1;
  };

  const strike = (power: number, angle: number, spin: number): boolean => {
    const cue = ballByNumber(0);
    if (!cue || cue.state !== "live") return false;
    const clamped = Math.min(1, Math.max(STRIKE_MIN_POWER, power));
    const speed = STRIKE_MIN_SPEED + ((clamped - STRIKE_MIN_POWER) / (1 - STRIKE_MIN_POWER)) * (STRIKE_MAX_SPEED - STRIKE_MIN_SPEED);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    // Arm the authored spin nudge for the cue's NEXT contact.
    armedSpin = Math.min(1, Math.max(-1, spin));
    armedSpinDir = [dirX, dirZ];
    spinArmed = true;
    shotFirstContactValue = null;
    shotCushionAfterValue = false;
    cue.body.wake();
    cue.body.setVelocity([dirX * speed, 0, dirZ * speed]);
    cue.body.setAngularVelocity([0, 0, 0]);
    return true;
  };

  const nearestPocket = (x: number, z: number): PocketId => {
    let best = POCKET_CENTERS[0]!;
    let bestDistance = Infinity;
    for (const pocket of POCKET_CENTERS) {
      const distance = Math.hypot(pocket.x - x, pocket.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pocket;
      }
    }
    return best.id;
  };

  const potBall = (entry: BallEntry, pocket: PocketId): void => {
    pendingPots.push({ ball: entry.number, pocket, stepIndex });
    parkBall(entry);
  };

  /**
   * Earliest object ball intersecting the cue's swept segment this step.
   * Object balls are tested at their PRE-step positions: the cue contact
   * necessarily happens at the ball's last known place (it is stationary
   * until struck), and post-step positions have already flown away.
   */
  const cueSegmentContact = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    prePositions: Map<number, readonly [number, number]>
  ): number | null => {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    // 5 mm over the 2r contact distance: Rapier's speculative contacts can
    // transfer momentum just before spheres geometrically touch.
    const rr = (2 * BALL_RADIUS + 0.005) * (2 * BALL_RADIUS + 0.005);
    let best: number | null = null;
    let bestT = Infinity;
    for (const entry of balls) {
      if (entry.number === 0 || entry.state !== "live") continue;
      const before = prePositions.get(entry.number);
      if (!before) continue;
      const ox = before[0] - ax;
      const oz = before[1] - az;
      const t = len2 < 1e-12 ? 0 : Math.min(1, Math.max(0, (ox * dx + oz * dz) / len2));
      const cx = ox - dx * t;
      const cz = oz - dz * t;
      if (cx * cx + cz * cz <= rr && t < bestT) {
        bestT = t;
        best = entry.number;
      }
    }
    return best;
  };

  /** Authored spin nudge: bounded velocity adjustment along the strike line. */
  const applySpinNudge = (): void => {
    spinArmed = false;
    if (armedSpin === 0) return;
    const cue = ballByNumber(0);
    if (!cue || cue.state !== "live") return;
    const nudge = armedSpin * SPIN_NUDGE;
    const current = cue.body.velocity;
    cue.body.wake();
    cue.body.setVelocity([current[0] + armedSpinDir[0] * nudge, current[1], current[2] + armedSpinDir[1] * nudge]);
  };

  const stepFixed = (steps = 1): void => {
    for (let index = 0; index < steps; index += 1) {
      stepIndex += 1;
      const cue = ballByNumber(0);
      const prePositions = new Map<number, readonly [number, number]>();
      for (const entry of balls) {
        if (entry.state !== "live") continue;
        prePositions.set(entry.number, [entry.body.position[0], entry.body.position[2]]);
      }
      const events = world.step(1 / 60);
      for (const event of events) {
        const contact = event.contact;
        const aName = colliderNameById.get(contact.colliderA);
        const bName = colliderNameById.get(contact.colliderB);
        if (!aName || !bName) continue;
        if (contact.sensor) {
          // Once-per-entry arming for every sensor pair.
          const pairKey = [aName, bName].sort().join("::");
          if (event.type === "begin" && !armedPairs.has(pairKey)) {
            armedPairs.add(pairKey);
            const pocketName = aName.startsWith("pocket:") ? aName : bName.startsWith("pocket:") ? bName : null;
            const ballName = aName.startsWith("ball-") ? aName : bName.startsWith("ball-") ? bName : null;
            if (pocketName && ballName) {
              pendingSensors.push({
                pocket: pocketName.replace("pocket:", "") as PocketId,
                ball: ballNumberFor(ballName),
                stepIndex
              });
            }
          } else if (event.type === "end") {
            armedPairs.delete(pairKey);
          }
          continue;
        }
        const ballName = aName.startsWith("ball-") ? aName : bName.startsWith("ball-") ? bName : undefined;
        if (!ballName) continue;
        const otherName = ballName === aName ? bName : aName;
        const ballNumber = ballNumberFor(ballName);
        const entry = balls[ballNumber];
        const otherEntry = otherName.startsWith("ball-") ? balls[ballNumberFor(otherName)] : undefined;

        if (event.type !== "begin") continue;
        // Impact severity, measured AFTER the solver ran (the event fires with
        // post-step velocities): the strongest body moving along the contact
        // normal for ball-ball pairs, or the striking ball's full speed against
        // statics (a graze is still a rail for the no-rail rule).
        const vA = entry?.body.velocity ?? [0, 0, 0];
        const vB = otherEntry?.body.velocity ?? [0, 0, 0];
        const severity = otherEntry
          ? Math.max(
              Math.abs(contact.normal[0] * vA[0] + contact.normal[1] * vA[1] + contact.normal[2] * vA[2]),
              Math.abs(contact.normal[0] * vB[0] + contact.normal[1] * vB[1] + contact.normal[2] * vB[2])
            )
          : Math.hypot(vA[0], vA[1], vA[2]);
        const kind: ImpactKind = otherEntry ? "ball-ball" : otherName.startsWith("cushion-") ? "ball-cushion" : "ball-felt";
        pendingImpacts.push({
          kind,
          ball: ballNumber,
          otherBall: kind === "ball-ball" ? ballNumberFor(otherName) : null,
          surface: kind === "ball-ball" ? null : otherName,
          speed: severity,
          stepIndex
        });
      }

      // ---- analytic shot facts (deterministic; see ShotFactEvent) ----------
      // Fast cue contacts begin and end inside one solver step, so the polled
      // events above miss them. Sweep the cue's actual movement this step.
      if (cue && cue.state === "live" && shotFirstContactValue === null) {
        const cueBefore = prePositions.get(0);
        if (cueBefore) {
          const contact = cueSegmentContact(
            cueBefore[0],
            cueBefore[1],
            cue.body.position[0],
            cue.body.position[2],
            prePositions
          );
          if (contact !== null) {
            shotFirstContactValue = contact;
            pendingShotFacts.push({ type: "cue-first-contact", ball: contact, stepIndex });
            applySpinNudge();
          }
        }
      }
      // Cushion band: a live ball at the rail line is touching a cushion.
      // Edge-triggered per ball, so a rail contact from BEFORE the shot never
      // satisfies the rail-after-contact requirement.
      for (const entry of balls) {
        if (entry.state !== "live") continue;
        const p = entry.body.position;
        const touching = Math.abs(p[0]) >= RAIL_BAND_X || Math.abs(p[2]) >= RAIL_BAND_Z;
        const was = railTouchState.get(entry.number) ?? false;
        railTouchState.set(entry.number, touching);
        if (touching === was) continue;
        if (!touching) continue;
        pendingShotFacts.push({ type: "cushion-touch", ball: entry.number, stepIndex });
        if (entry.number === 0 && spinArmed && shotFirstContactValue === null) applySpinNudge();
        if (shotFirstContactValue !== null) shotCushionAfterValue = true;
      }

      // Pocket resolution by geometry (authoritative): capture radius around
      // each pocket mouth, plus out-of-bounds recovery so no ball can ever rest
      // outside the playfield or below the felt.
      for (const entry of balls) {
        if (entry.state !== "live") continue;
        const p = entry.body.position;
        for (const pocket of POCKET_CENTERS) {
          const dx = p[0] - pocket.x;
          const dz = p[2] - pocket.z;
          if (dx * dx + dz * dz < POCKET_RADIUS * POCKET_RADIUS) {
            potBall(entry, pocket.id);
            break;
          }
        }
        if (entry.state !== "live") continue;
        if (p[1] < -0.4 || Math.abs(p[0]) > PLAY_HALF_X + 0.08 || Math.abs(p[2]) > PLAY_HALF_Z + 0.08) {
          potBall(entry, nearestPocket(p[0], p[2]));
        }
      }
    }
  };

  const poses = (): readonly TrackedPose[] => {
    const out: TrackedPose[] = [];
    for (const entry of balls) {
      out.push({
        name: `ball-${String(entry.number).padStart(2, "0")}`,
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
    return hashString(parts.join("|"));
  };

  const ballInfos = (): readonly BallInfo[] => {
    return balls.map((entry) => {
      const p = entry.body.position;
      const v = entry.body.velocity;
      return {
        number: entry.number,
        live: entry.state === "live",
        x: p[0],
        z: p[2],
        speed: Math.hypot(v[0], v[1], v[2])
      };
    });
  };

  const cuePlacementFree = (x: number, z: number): boolean => {
    const margin = BALL_RADIUS + 0.01;
    if (Math.abs(x) > PLAY_HALF_X - margin || Math.abs(z) > PLAY_HALF_Z - margin) return false;
    for (const entry of balls) {
      if (entry.number === 0 || entry.state !== "live") continue;
      const p = entry.body.position;
      if (Math.hypot(p[0] - x, p[2] - z) < 2 * BALL_RADIUS + 0.002) return false;
    }
    return true;
  };

  const placeCue = (x: number, z: number): boolean => {
    const cue = ballByNumber(0);
    if (!cue || cue.state !== "live") return false;
    if (!cuePlacementFree(x, z)) return false;
    cue.body.wake();
    cue.body.setPosition([x, BALL_RADIUS, z]);
    cue.body.setVelocity([0, 0, 0]);
    cue.body.setAngularVelocity([0, 0, 0]);
    cue.body.sleep();
    return true;
  };

  const sweepFromCue = (angle: number): SweepHit => {
    const cue = ballByNumber(0);
    if (!cue || cue.state !== "live") {
      return { kind: "none", ballNumber: null, surface: null, ghostX: 0, ghostZ: 0, normalX: 0, normalZ: 0 };
    }
    const origin = cue.body.position;
    // Cast slightly above the felt so the tangent felt plane can never win.
    const castOrigin: readonly [number, number, number] = [origin[0], BALL_RADIUS + 0.006, origin[2]];
    const direction: readonly [number, number, number] = [Math.cos(angle), 0, Math.sin(angle)];
    const hit = world.sphereCast(castOrigin, BALL_RADIUS, direction, {
      ignoreColliders: [cueColliderId],
      maxDistance: 4
    });
    if (!hit) {
      return {
        kind: "none", ballNumber: null, surface: null,
        ghostX: origin[0] + direction[0] * 1.5, ghostZ: origin[2] + direction[2] * 1.5,
        normalX: 0, normalZ: 0
      };
    }
    const name = colliderNameById.get(hit.colliderId) ?? "";
    const isBall = name.startsWith("ball-");
    return {
      kind: isBall ? "ball" : "cushion",
      ballNumber: isBall ? ballNumberFor(name) : null,
      surface: isBall ? null : name,
      ghostX: hit.castCenter[0],
      ghostZ: hit.castCenter[2],
      normalX: hit.normal[0],
      normalZ: hit.normal[2]
    };
  };

  const resetRack = (): void => {
    armedSpin = 0;
    spinArmed = false;
    armedPairs.clear();
    shotFirstContactValue = null;
    shotCushionAfterValue = false;
    railTouchState.clear();
    for (const entry of balls) {
      const [spotX, spotZ] = rackSpotFor(entry.number);
      entry.body.wake();
      entry.body.setPosition([spotX, BALL_RADIUS, spotZ]);
      entry.body.setVelocity([0, 0, 0]);
      entry.body.setAngularVelocity([0, 0, 0]);
      entry.body.sleep();
      entry.state = "live";
    }
  };

  return {
    world,
    visuals,
    get dynamicVisualNames() {
      return dynamicVisualNames;
    },
    get backend(): string {
      return world.snapshot().backend.active;
    },
    fixedDelta: 1 / 60,
    pocketIds: POCKET_IDS,
    strike,
    stepFixed,
    poses,
    poseHash,
    ballInfos,
    liveBallCount(): number {
      return balls.filter((entry) => entry.state === "live").length;
    },
    pottedList(): readonly number[] {
      return balls.filter((entry) => entry.state === "potted").map((entry) => entry.number);
    },
    cueAtRest(): boolean {
      const cue = ballByNumber(0);
      if (!cue || cue.state !== "live") return false;
      const v = cue.body.velocity;
      return Math.hypot(v[0], v[1], v[2]) < 0.05;
    },
    allAtRest(threshold = 0.05): boolean {
      for (const entry of balls) {
        if (entry.state !== "live") continue;
        const v = entry.body.velocity;
        if (Math.hypot(v[0], v[1], v[2]) >= threshold) return false;
      }
      return true;
    },
    placeCue,
    canPlaceCue: cuePlacementFree,
    shotFacts(): ShotFacts {
      return { firstContact: shotFirstContactValue, cushionAfterContact: shotCushionAfterValue };
    },
    consumeShotFactEvents(): readonly ShotFactEvent[] {
      const out = pendingShotFacts;
      pendingShotFacts = [];
      return out;
    },
    /** Bring the potted cue ball back or reposition live cue ball for ball-in-hand. */
    restoreCueAt(x: number, z: number): boolean {
      const cue = ballByNumber(0);
      if (!cue) return false;
      if (!cuePlacementFree(x, z)) return false;
      cue.state = "live";
      return placeCue(x, z);
    },
    sweepFromCue,
    resetRack,
    consumeSensorEvents(): readonly PocketSensorEvent[] {
      const out = pendingSensors;
      pendingSensors = [];
      return out;
    },
    consumeImpacts(): readonly ImpactEvent[] {
      const out = pendingImpacts;
      pendingImpacts = [];
      return out;
    },
    consumePotEvents(): readonly PotEvent[] {
      const out = pendingPots;
      pendingPots = [];
      return out;
    },
    debugBallBody(number: number): SimBody | undefined {
      return ballByNumber(number)?.body;
    }
  };
}

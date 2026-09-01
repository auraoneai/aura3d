/**
 * Gallery Shift floor definitions + physics construction (PRD GS-03/04/07/08).
 *
 * Everything runs through the public root-safe physics surface exactly like the
 * sibling vault-breakers route: `physics.world` constructs the Rapier-backed
 * controller, `createBody`/`createCollider` declare the hall (walls, pedestals,
 * display cases) plus the sensor volumes (service exit, floor-2 lasers), and the
 * thief is a dynamic sphere collider (zero gravity) positioned per frame so
 * sensors fire through engine sensor events.
 *
 * Authored (non-simulated) elements, labeled as such everywhere claims appear:
 * - guard/thief locomotion is authored movement on runtime nodes (Turbo
 *   opponent-AI precedent); only sensor overlap and LOS occlusion are physics;
 * - hearing is an authored radius test (the physics facade exposes no
 *   overlap-sphere query), deterministic and unit-tested;
 * - wall collision for the thief is authored circle-vs-AABB pushout against the
 *   same rects that build the physics colliders.
 */
import { physics } from "@aura3d/engine";

export type SimWorld = ReturnType<typeof physics.world>;
export type SimBody = ReturnType<SimWorld["createBody"]>;

// ---------------------------------------------------------------- constants --
/** Thief collider radius (m). Authored movement slides on the same rects. */
export const THIEF_RADIUS = 0.3;
/** Guard vision: 90-degree FOV cone, 12 m range (PRD GS-05). */
export const GUARD_FOV_DEGREES = 90;
export const GUARD_RANGE = 12;
/** Camera vision: narrower 60-degree cone, 10 m range, authored sweep (GS-08). */
export const CAMERA_FOV_DEGREES = 60;
export const CAMERA_RANGE = 10;
/** Hold-to-lift duration and ranges (PRD GS-04). */
export const LIFT_HOLD_SECONDS = 1.2;
export const LIFT_INTERACT_RANGE = 1.35;
/** Laser trip raises a floor-wide alert burst of this length (GS-08). */
export const LASER_ALERT_SECONDS = 4;
/** Noise radii per gait: walk 3 m, sneak 0 m, sprint 6 m (PRD GS-04). */
export const NOISE_RADIUS = { walk: 3, sneak: 0, sprint: 6 } as const;
export const LIFT_NOISE_RADIUS = 5;
/** Gait speeds (m/s): walk 3.2, sneak 1.4, sprint 5.6 (binding build spec). */
export const GAIT_SPEED = { walk: 3.2, sneak: 1.4, sprint: 5.6 } as const;
/** Movement multiplier while lifting an exhibit. */
export const LIFT_MOVE_SCALE = 0.35;

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface WallSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
  /** Visible marble look; perimeter walls live inside the typed interior GLB. */
  readonly visible: boolean;
}

export interface PedestalSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly value: number;
  readonly exhibit: "exhibitA" | "exhibitB" | "exhibitC";
}

export interface CaseSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/** A named walkable room in the same plan that owns collision and LOS. */
export interface RoomSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly tone: "foyer" | "rotunda" | "archive" | "treasury" | "vault";
}

/** A deliberate opening between wall segments; never a decorative fake door. */
export interface DoorSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
}

export interface LaserSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
}

export interface CameraSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  /** Yaw the sweep oscillates around; 0 faces +Z (south), math in vision.ts. */
  readonly centerYaw: number;
  readonly amplitudeRad: number;
  readonly periodSeconds: number;
  readonly phase: number;
}

export interface LightPoolSpec {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** 0 (dark aisle) .. 1 (rotunda skylight). Scales detection fill. */
  readonly brightness: number;
}

export interface GuardSpawnSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly route: readonly Vec2[];
  readonly baseSpeed: number;
}

export interface FloorLayout {
  readonly id: 1 | 2;
  readonly name: string;
  readonly walls: readonly WallSpec[];
  readonly rooms: readonly RoomSpec[];
  readonly doors: readonly DoorSpec[];
  readonly pedestals: readonly PedestalSpec[];
  readonly cases: readonly CaseSpec[];
  readonly lasers: readonly LaserSpec[];
  readonly cameras: readonly CameraSpec[];
  readonly exit: Vec2;
  readonly lightPools: readonly LightPoolSpec[];
  readonly guards: readonly GuardSpawnSpec[];
  readonly thiefSpawn: Vec2;
  /** Inner walkable bounds (min/max on each axis) for the authored clamp. */
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
}

// ------------------------------------------------------------------ layouts --
/**
 * Floor 1 "Marble Hall": an entry foyer and rotunda connect to offset archive
 * and treasury suites. Every doorway below is a real gap between wall collider
 * segments. The side-room cross walls and typed cases are therefore honest
 * tactical occluders, not a floor-paint suggestion of rooms.
 */
const FLOOR_1: FloorLayout = {
  id: 1,
  name: "Marble Hall",
  walls: [
    // Perimeter (visuals come from the typed museum-interior GLB; colliders only).
    { id: "wall-north", x: 0, z: -7.2, halfX: 10.4, halfZ: 0.2, height: 3.6, visible: false },
    { id: "wall-south", x: 0, z: 7.2, halfX: 10.4, halfZ: 0.2, height: 3.6, visible: false },
    { id: "wall-west", x: -10.2, z: 0, halfX: 0.2, halfZ: 7.4, height: 3.6, visible: false },
    { id: "wall-east", x: 10.2, z: 0, halfX: 0.2, halfZ: 7.4, height: 3.6, visible: false },
    // Alcove throat beside the service exit (shared look with floor 2).
    { id: "wall-alcove-west", x: -1.8, z: -5.2, halfX: 1.0, halfZ: 0.2, height: 3.6, visible: true },
    { id: "wall-alcove-east", x: 1.8, z: -5.2, halfX: 1.0, halfZ: 0.2, height: 3.6, visible: true },
    // Offset rotunda-to-wing doorways. Splitting the old uninterrupted walls
    // creates two different entry decisions rather than one symmetrical hall.
    { id: "wall-archive-entry-north", x: -5, z: -3.45, halfX: 0.2, halfZ: 1.55, height: 3.6, visible: true },
    { id: "wall-archive-entry-south", x: -5, z: 1.25, halfX: 0.2, halfZ: 1.95, height: 3.6, visible: true },
    { id: "wall-treasury-entry-north", x: 5, z: -2.45, halfX: 0.2, halfZ: 2.55, height: 3.6, visible: true },
    { id: "wall-treasury-entry-south", x: 5, z: 2.35, halfX: 0.2, halfZ: 0.85, height: 3.6, visible: true },
    // Each wing is itself two rooms, with its connecting doorway offset from
    // the rotunda entrance so the player must choose a guarded turn or cover.
    { id: "wall-archive-cross-west", x: -9.05, z: 1.4, halfX: 0.95, halfZ: 0.2, height: 3.6, visible: true },
    { id: "wall-archive-cross-east", x: -5.95, z: 1.4, halfX: 0.95, halfZ: 0.2, height: 3.6, visible: true },
    { id: "wall-treasury-cross-west", x: 5.95, z: -1.3, halfX: 0.95, halfZ: 0.2, height: 3.6, visible: true },
    { id: "wall-treasury-cross-east", x: 9.05, z: -1.3, halfX: 0.95, halfZ: 0.2, height: 3.6, visible: true }
  ],
  rooms: [
    { id: "south-foyer", x: 0, z: 4.65, halfX: 4.75, halfZ: 1.65, tone: "foyer" },
    { id: "central-rotunda", x: 0, z: 0.1, halfX: 4.7, halfZ: 2.95, tone: "rotunda" },
    { id: "north-vault", x: 0, z: -5.45, halfX: 3.0, halfZ: 1.15, tone: "vault" },
    { id: "archive-gallery", x: -7.5, z: -2.85, halfX: 2.3, halfZ: 1.95, tone: "archive" },
    { id: "archive-conservation", x: -7.5, z: 4.05, halfX: 2.3, halfZ: 2.45, tone: "archive" },
    { id: "treasury-vault", x: 7.5, z: -4.15, halfX: 2.3, halfZ: 1.55, tone: "treasury" },
    { id: "treasury-exhibition", x: 7.5, z: 2.75, halfX: 2.3, halfZ: 3.85, tone: "treasury" }
  ],
  doors: [
    { id: "rotunda-archive", x: -5, z: -1.3, halfX: 0.12, halfZ: 0.6 },
    { id: "archive-rooms", x: -7.5, z: 1.4, halfX: 0.6, halfZ: 0.12 },
    { id: "rotunda-treasury", x: 5, z: 0.8, halfX: 0.12, halfZ: 0.6 },
    { id: "treasury-rooms", x: 7.5, z: -1.3, halfX: 0.6, halfZ: 0.12 }
  ],
  pedestals: [
    { id: "p1", x: -6.5, z: -4.2, value: 400, exhibit: "exhibitA" },
    { id: "p2", x: 6.5, z: -4.2, value: 600, exhibit: "exhibitB" }
  ],
  // Four typed display cases turn the two objective wings into real cover
  // rooms. They are part of the same layout authority used by authored thief
  // collision and physics LOS raycasts, so the visible cover is never merely
  // decorative scenery. Their central/southern positions leave both north
  // pedestal approaches and the guard perimeter routes open.
  cases: [
    { id: "archive-center", x: -7.2, z: 0.15 },
    { id: "archive-south", x: -7.2, z: 3.65 },
    { id: "treasury-center", x: 7.2, z: -2.55 },
    { id: "treasury-south", x: 7.2, z: 2.85 }
  ],
  lasers: [],
  cameras: [],
  exit: { x: 0, z: -6.3 },
  lightPools: [
    { x: 0, z: 0, radius: 3.2, brightness: 0.95 },
    { x: -6.5, z: -4.2, radius: 2.2, brightness: 0.75 },
    { x: 6.5, z: -4.2, radius: 2.2, brightness: 0.75 },
    { x: -6.5, z: 4.2, radius: 2.2, brightness: 0.75 },
    { x: 6.5, z: 4.2, radius: 2.2, brightness: 0.75 },
    { x: 0, z: 4.5, radius: 2.0, brightness: 0.35 },
    { x: -8.6, z: 0, radius: 2.4, brightness: 0.5 },
    { x: 8.6, z: 0, radius: 2.4, brightness: 0.5 }
  ],
  guards: [
    {
      id: "guard-1",
      x: -7.5,
      z: -5.5,
      route: [
        { x: -7.5, z: -5.5 },
        { x: -7.5, z: 5.5 },
        { x: -9.0, z: 5.5 },
        { x: -9.0, z: -5.5 }
      ],
      baseSpeed: 1.5
    },
    {
      id: "guard-2",
      x: 7.5,
      z: -5.5,
      route: [
        { x: 7.5, z: -5.5 },
        { x: 7.5, z: 5.5 },
        { x: 9.0, z: 5.5 },
        { x: 9.0, z: -5.5 }
      ],
      baseSpeed: 1.5
    }
  ],
  // Start in the open foyer lane rather than directly behind the south
  // cutaway wall. The player remains inside the same walkable foyer and all
  // collision/LOS bounds are unchanged, but the typed infiltrator is visible
  // as a complete grounded subject in the default and review compositions.
  thiefSpawn: { x: 0, z: 4.55 },
  bounds: { minX: -9.8, maxX: 9.8, minZ: -6.8, maxZ: 6.8 }
};

/**
 * Floor 2 "Skyline Wing": a central display-case room behind two cross walls,
 * two sweeping cameras, and four laser sensor volumes. Guards stay on the outer
 * loop; the case row occludes camera cones.
 */
const FLOOR_2: FloorLayout = {
  id: 2,
  name: "Skyline Wing",
  walls: [
    { id: "wall-north", x: 0, z: -7.2, halfX: 10.4, halfZ: 0.2, height: 3.6, visible: false },
    { id: "wall-south", x: 0, z: 7.2, halfX: 10.4, halfZ: 0.2, height: 3.6, visible: false },
    { id: "wall-west", x: -10.2, z: 0, halfX: 0.2, halfZ: 7.4, height: 3.6, visible: false },
    { id: "wall-east", x: 10.2, z: 0, halfX: 0.2, halfZ: 7.4, height: 3.6, visible: false },
    { id: "wall-alcove-west", x: -1.8, z: -5.2, halfX: 1.0, halfZ: 0.2, height: 3.6, visible: true },
    { id: "wall-alcove-east", x: 1.8, z: -5.2, halfX: 1.0, halfZ: 0.2, height: 3.6, visible: true },
    // Central case room: entered from the north and south gaps only.
    { id: "wall-room-west", x: -3.2, z: 0, halfX: 0.2, halfZ: 2.2, height: 3.6, visible: true },
    { id: "wall-room-east", x: 3.2, z: 0, halfX: 0.2, halfZ: 2.2, height: 3.6, visible: true }
  ],
  rooms: [
    { id: "skyline-south", x: 0, z: 4.6, halfX: 9.6, halfZ: 2.2, tone: "foyer" },
    { id: "skyline-secure-core", x: 0, z: 0, halfX: 3.0, halfZ: 2.0, tone: "vault" },
    { id: "skyline-north", x: 0, z: -4.6, halfX: 9.6, halfZ: 2.2, tone: "treasury" }
  ],
  doors: [
    { id: "skyline-core-north", x: 0, z: -2.2, halfX: 0.75, halfZ: 0.12 },
    { id: "skyline-core-south", x: 0, z: 2.2, halfX: 0.75, halfZ: 0.12 }
  ],
  pedestals: [
    { id: "p3", x: -7, z: 4.8, value: 1100, exhibit: "exhibitC" }
  ],
  cases: [
    { id: "case-1", x: -1.8, z: 0 },
    { id: "case-2", x: 0, z: 0 },
    { id: "case-3", x: 1.8, z: 0 }
  ],
  lasers: [
    { id: "laser-north", x: 0, z: 2.0, halfX: 1.6, halfZ: 0.06 },
    { id: "laser-south", x: 0, z: -2.0, halfX: 1.6, halfZ: 0.06 },
    { id: "laser-west", x: -4.2, z: 0, halfX: 0.06, halfZ: 2.0 },
    { id: "laser-east", x: 4.2, z: 0, halfX: 0.06, halfZ: 2.0 }
  ],
  cameras: [
    {
      id: "camera-1",
      x: -4.6,
      z: -2.6,
      height: 2.6,
      centerYaw: Math.PI * 0.25, // facing +x/+z into the hall
      amplitudeRad: (50 * Math.PI) / 180,
      periodSeconds: 5.5,
      phase: 0
    },
    {
      id: "camera-2",
      x: 4.6,
      z: 2.6,
      height: 2.6,
      centerYaw: Math.PI * 1.25, // facing -x/-z into the hall
      amplitudeRad: (50 * Math.PI) / 180,
      periodSeconds: 5.5,
      phase: Math.PI
    }
  ],
  exit: { x: 0, z: -6.3 },
  lightPools: [
    { x: 0, z: 0, radius: 2.6, brightness: 1.0 },
    { x: -7, z: -4.5, radius: 2.2, brightness: 0.7 },
    { x: 7, z: -4.5, radius: 2.2, brightness: 0.7 },
    { x: -7, z: 4.8, radius: 2.2, brightness: 0.7 },
    { x: 7, z: 4.8, radius: 2.2, brightness: 0.7 },
    { x: 0, z: 5.0, radius: 2.2, brightness: 0.35 },
    { x: -8.6, z: 0, radius: 2.4, brightness: 0.45 },
    { x: 8.6, z: 0, radius: 2.4, brightness: 0.45 }
  ],
  guards: [
    {
      id: "guard-1",
      x: -8.5,
      z: 5.5,
      route: [
        { x: -8.5, z: 5.5 },
        { x: -8.5, z: -5.5 },
        { x: -5.5, z: -5.5 },
        { x: -5.5, z: 5.5 }
      ],
      baseSpeed: 1.6
    },
    {
      id: "guard-2",
      x: 8.5,
      z: -5.5,
      route: [
        { x: 8.5, z: -5.5 },
        { x: 8.5, z: 5.5 },
        { x: 5.5, z: 5.5 },
        { x: 5.5, z: -5.5 }
      ],
      baseSpeed: 1.6
    }
  ],
  thiefSpawn: { x: 0, z: 6.0 },
  bounds: { minX: -9.8, maxX: 9.8, minZ: -6.8, maxZ: 6.8 }
};

export const FLOOR_LAYOUTS: readonly FloorLayout[] = [FLOOR_1, FLOOR_2];

// ------------------------------------------------------- escalation tables --
/**
 * Route-local escalation (PRD GS-07): each lifted exhibit appends two waypoints
 * covering that pedestal's quarter to BOTH guards' routes (in lift order) and
 * bumps guard speed by a cumulative +10% per lift. Deterministic: the same lift
 * order always produces the same route and speed.
 */
export const ESCALATION_SPEED_PER_LIFT = 1.1;

export const ESCALATION_WAYPOINTS: Readonly<Record<string, readonly Vec2[]>> = {
  // Floor 1 quarters.
  p1: [
    { x: -6.5, z: -2.0 },
    { x: -6.5, z: -6.0 }
  ],
  p2: [
    { x: 6.5, z: -2.0 },
    { x: 6.5, z: -6.0 }
  ],
  p3: [
    { x: -7, z: 2.5 },
    { x: -7, z: 6.0 }
  ]
};

/** Waypoints appended for the given lift order (deterministic, both guards). */
export function escalationWaypoints(liftedPedestalIds: readonly string[]): readonly Vec2[] {
  const out: Vec2[] = [];
  for (const id of liftedPedestalIds) {
    const extra = ESCALATION_WAYPOINTS[id];
    if (extra) out.push(...extra);
  }
  return out;
}

/** Guard speed after `lifts` exhibits: +10% cumulative per lift. */
export function guardSpeedAfterLifts(baseSpeed: number, lifts: number): number {
  return baseSpeed * Math.pow(ESCALATION_SPEED_PER_LIFT, lifts);
}

/** Total patrol loop length in meters (evidence: route grows after each lift). */
export function routeLength(route: readonly Vec2[]): number {
  if (route.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < route.length; index += 1) {
    const a = route[index]!;
    const b = route[(index + 1) % route.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

// ------------------------------------------------------------ world builder --
export interface FloorSensorEvent {
  readonly kind: "exit" | "laser";
  readonly id: string;
  readonly stepIndex: number;
}

export interface FloorWorld {
  readonly world: SimWorld;
  readonly layout: FloorLayout;
  readonly thiefBody: SimBody;
  readonly thiefBodyId: number;
  readonly colliderNames: ReadonlyMap<number, string>;
  readonly exitSensorName: string;
  readonly pedestalNames: readonly string[];
  stepFixed(steps?: number): readonly FloorSensorEvent[];
  consumeSensorEvents(): readonly FloorSensorEvent[];
  backend(): string;
}

/**
 * Builds the hall: solid static colliders for walls/cases/pedestals (they are
 * the LOS occluders), sensor colliders for the exit and lasers, and the
 * kinematic thief sphere positioned per frame by thief.ts.
 */
export function createFloorWorld(layout: FloorLayout): FloorWorld {
  const world = physics.world({
    // Top-down heist: nothing is simulated under gravity. The thief's motion
    // is authored (thief.ts); zero gravity keeps the dynamic sensor body from
    // drifting between authored setPosition calls.
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    // The thief body must keep producing sensor overlaps every step; the
    // solver broadphase skips pairs without a dynamic body, and a sleeping
    // dynamic body stops reporting entries - sleeping stays off.
    enableSleeping: false
  });

  const colliderNames = new Map<number, string>();
  let stepIndex = 0;
  const pendingSensors: FloorSensorEvent[] = [];
  const armedPairs = new Set<string>();

  const nameCollider = (collider: { readonly id: number }, name: string): void => {
    colliderNames.set(collider.id, name);
  };

  for (const wall of layout.walls) {
    const body = world.createBody({ type: "static", position: [wall.x, wall.height / 2, wall.z] });
    nameCollider(world.createCollider(body, { shape: physics.box(wall.halfX, wall.height / 2, wall.halfZ) }), wall.id);
  }

  for (const pedestal of layout.pedestals) {
    const body = world.createBody({ type: "static", position: [pedestal.x, 0.5, pedestal.z] });
    nameCollider(world.createCollider(body, { shape: physics.box(0.35, 0.5, 0.35) }), `pedestal:${pedestal.id}`);
  }

  for (const displayCase of layout.cases) {
    const body = world.createBody({ type: "static", position: [displayCase.x, 0.55, displayCase.z] });
    nameCollider(world.createCollider(body, { shape: physics.box(0.55, 0.55, 0.55) }), displayCase.id);
  }

  {
    const body = world.createBody({ type: "static", position: [layout.exit.x, 0.6, layout.exit.z] });
    nameCollider(world.createCollider(body, { shape: physics.box(0.8, 0.8, 0.5), sensor: true }), "sensor:exit");
  }

  for (const laser of layout.lasers) {
    const body = world.createBody({ type: "static", position: [laser.x, 0.9, laser.z] });
    nameCollider(
      world.createCollider(body, { shape: physics.box(laser.halfX, 0.9, laser.halfZ), sensor: true }),
      `laser:${laser.id}`
    );
  }

  const thiefBody = world.createBody({
    // Dynamic (not kinematic): the solver broadphase only pairs sensors with
    // dynamic bodies, so the exit/laser sensors report overlaps through real
    // engine sensor events. Motion stays authored - zero gravity, position
    // set every fixed step by thief.ts.
    type: "dynamic",
    position: [layout.thiefSpawn.x, THIEF_RADIUS, layout.thiefSpawn.z],
    mass: 70
  });
  nameCollider(world.createCollider(thiefBody, { shape: physics.sphere(THIEF_RADIUS) }), "thief");

  const stepFixed = (steps = 1): readonly FloorSensorEvent[] => {
    for (let index = 0; index < steps; index += 1) {
      stepIndex += 1;
      const events = world.step(1 / 60);
      for (const event of events) {
        const contact = event.contact;
        if (!contact.sensor) continue;
        const aName = colliderNames.get(contact.colliderA);
        const bName = colliderNames.get(contact.colliderB);
        if (!aName || !bName) continue;
        const sensorName = (aName ?? "").startsWith("sensor:") || (aName ?? "").startsWith("laser:") ? aName : bName;
        const otherName = sensorName === aName ? bName : aName;
        if (otherName !== "thief") continue;
        const pairKey = [aName, bName].sort().join("::");
        if (event.type === "begin" && !armedPairs.has(pairKey)) {
          armedPairs.add(pairKey);
          pendingSensors.push({
            kind: sensorName.startsWith("laser:") ? "laser" : "exit",
            id: sensorName.replace(/^(?:sensor|laser):/, ""),
            stepIndex
          });
        } else if (event.type === "end") {
          armedPairs.delete(pairKey);
        }
      }
    }
    return drainSensors();
  };

  const drainSensors = (): readonly FloorSensorEvent[] => {
    const out = pendingSensors.slice();
    pendingSensors.length = 0;
    return out;
  };

  return {
    world,
    layout,
    thiefBody,
    thiefBodyId: thiefBody.id,
    colliderNames,
    exitSensorName: "sensor:exit",
    pedestalNames: layout.pedestals.map((pedestal) => `pedestal:${pedestal.id}`),
    stepFixed,
    consumeSensorEvents: drainSensors,
    backend(): string {
      return world.snapshot().backend.active;
    }
  };
}

// --------------------------------------------------- authored collision math --
/**
 * Authored circle-vs-rect pushout in XZ (the thief's authored movement never
 * relies on the solver). Deterministic and unit-tested; the same rects build
 * the physics occluders.
 */
export interface SolidRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface SolidCircle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export function layoutRects(layout: FloorLayout): readonly SolidRect[] {
  const rects: SolidRect[] = [];
  for (const wall of layout.walls) {
    rects.push({ minX: wall.x - wall.halfX, maxX: wall.x + wall.halfX, minZ: wall.z - wall.halfZ, maxZ: wall.z + wall.halfZ });
  }
  for (const displayCase of layout.cases) {
    rects.push({ minX: displayCase.x - 0.55, maxX: displayCase.x + 0.55, minZ: displayCase.z - 0.55, maxZ: displayCase.z + 0.55 });
  }
  return rects;
}

export function layoutCircles(layout: FloorLayout): readonly SolidCircle[] {
  return layout.pedestals.map((pedestal) => ({ x: pedestal.x, z: pedestal.z, radius: 0.45 }));
}

/** Resolve a circle position out of one rect along the shallowest axis. */
export function pushOutOfRect(px: number, pz: number, radius: number, rect: SolidRect): Vec2 {
  const closestX = Math.max(rect.minX, Math.min(px, rect.maxX));
  const closestZ = Math.max(rect.minZ, Math.min(pz, rect.maxZ));
  const dx = px - closestX;
  const dz = pz - closestZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared >= radius * radius) return { x: px, z: pz };
  if (distanceSquared > 1e-9) {
    const distance = Math.sqrt(distanceSquared);
    return { x: closestX + (dx / distance) * radius, z: closestZ + (dz / distance) * radius };
  }
  // Center inside the rect: push out along the shallowest penetration axis.
  const toMinX = px - rect.minX;
  const toMaxX = rect.maxX - px;
  const toMinZ = pz - rect.minZ;
  const toMaxZ = rect.maxZ - pz;
  const shallow = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
  if (shallow === toMinX) return { x: rect.minX - radius, z: pz };
  if (shallow === toMaxX) return { x: rect.maxX + radius, z: pz };
  if (shallow === toMinZ) return { x: px, z: rect.minZ - radius };
  return { x: px, z: rect.maxZ + radius };
}

export function pushOutOfCircle(px: number, pz: number, radius: number, circle: SolidCircle): Vec2 {
  const dx = px - circle.x;
  const dz = pz - circle.z;
  const min = radius + circle.radius;
  const distance = Math.hypot(dx, dz);
  if (distance >= min || distance < 1e-9) return { x: px, z: pz };
  return { x: circle.x + (dx / distance) * min, z: circle.z + (dz / distance) * min };
}

/** Clamp inside walkable bounds, then resolve against every solid. */
export function resolveThiefPosition(
  px: number,
  pz: number,
  layout: FloorLayout,
  rects: readonly SolidRect[],
  circles: readonly SolidCircle[]
): Vec2 {
  let x = Math.max(layout.bounds.minX, Math.min(layout.bounds.maxX, px));
  let z = Math.max(layout.bounds.minZ, Math.min(layout.bounds.maxZ, pz));
  for (const rect of rects) {
    const next = pushOutOfRect(x, z, THIEF_RADIUS, rect);
    x = next.x;
    z = next.z;
  }
  for (const circle of circles) {
    const next = pushOutOfCircle(x, z, THIEF_RADIUS, circle);
    x = next.x;
    z = next.z;
  }
  x = Math.max(layout.bounds.minX, Math.min(layout.bounds.maxX, x));
  z = Math.max(layout.bounds.minZ, Math.min(layout.bounds.maxZ, z));
  return { x, z };
}

/**
 * Siege Golf structure builders + hole simulation (PRD SG-04/SG-05/SG-06).
 *
 * Everything here runs through the public root-safe physics surface:
 * `physics.world(...)` constructs the Rapier-backed controller, `createBody` /
 * `createCollider` declare bodies (including sensors), and `createConstraint`
 * declares hinge and spring joints. The same builder drives the browser route
 * and the headless determinism unit tests.
 *
 * Design note: physics bodies stay axis-aligned wherever possible (posts,
 * panels, pins are unrotated boxes) so joint anchors are trivially correct;
 * visual nodes may rotate freely because they are synced from body poses every
 * frame. The pendulum is the one intentionally-moving pre-shot body and is
 * flagged ambient: it is excluded from settle gating and scoring.
 */
import { physics } from "@aura3d/engine";
import type { HoleDefinition, StructureSpec } from "./course";

export type SimBody = ReturnType<ReturnType<typeof physics.world>["createBody"]>;
export type SimWorld = ReturnType<typeof physics.world>;

/** Quat format used by the public body descriptor. */
export type SimQuat = readonly [number, number, number, number];

export interface Euler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PropVisual {
  readonly name: string;
  /** Typed catalog model (rendered through model(assets.x)) or a primitive. */
  readonly source: "model" | "primitive";
  readonly typedAsset?: "siegeGolfBall" | "siegeWoodenCrate" | "siegeWoodenBarrel" | "siegePlankSet";
  readonly targetMaxDimension?: number;
  readonly primitive?: {
    readonly shape: "box" | "sphere" | "torus";
    readonly size: readonly [number, number, number];
    readonly color: string;
    readonly emissive?: string;
    readonly opacity?: number;
  };
  readonly position: readonly [number, number, number];
  readonly rotation: Euler;
  /** Dynamic visuals are re-posed from their body every frame. */
  readonly dynamic: boolean;
}

export interface ImpactEvent {
  readonly a: string;
  readonly b: string;
  readonly speed: number;
}

export interface SensorFlash {
  readonly cupId: string;
  readonly otherName: string;
  readonly stepIndex: number;
}

const BALL_RADIUS = 0.16;
/**
 * Shared "pin is down" geometry: center below this height AND displaced from
 * its authored spot. One predicate owns both the pin-down event (hole-flow)
 * and the cup-sunk check here, so a pin can never count as sunk without also
 * having been declared down (or vice versa).
 */
export const PIN_DOWN_MAX_CENTER_HEIGHT = 0.45;
export const PIN_DOWN_MIN_DISPLACEMENT = 0.2;
/**
 * Weighted trainer ball. A regulation 45 g ball cannot topple even featherweight
 * props at these speeds (smoke-proven: every drive died on the first crate),
 * so the route plays a 500 g range ball. Launch speed still follows the public
 * mini-golf contract; mass only affects collision momentum.
 */
const BALL_MASS = 0.5;
/**
 * Launch-speed law mirrored from the public mini-golf kit (see shot.ts):
 * impulse magnitude = power * 0.32 on a 0.045 kg ball -> velocity =
 * power * 0.32 / 0.045 ~= power * 7.111 m/s. Unit tests prove the mapping
 * against a live games.createMiniGolfState().
 */
export const MINI_GOLF_IMPUSE_SCALE = 0.32;
export const MINI_GOLF_BALL_MASS = 0.045;

export function eulerToQuat(e: Euler): SimQuat {
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

/** FNV-1a over a string, as stable hex. Same algorithm the HUD checksum uses. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

interface TrackedEntry {
  readonly name: string;
  readonly body: SimBody;
  /** Ambient bodies move before the shot (pendulum) and never gate settling. */
  readonly ambient: boolean;
  readonly kind: "ball" | "prop" | "pin";
}

export interface TrackedPose {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export interface HoleSimulation {
  readonly world: SimWorld;
  readonly visuals: readonly PropVisual[];
  readonly dynamicVisualNames: readonly string[];
  /** Live pose of every tracked body, for visual sync. */
  poses(): readonly TrackedPose[];
  readonly ball: SimBody;
  readonly pinBodies: ReadonlyMap<string, SimBody>;
  readonly bodyCount: number;
  readonly backend: string;
  readonly fixedDelta: number;
  strike(direction: readonly [number, number, number], power: number): void;
  respawnBall(): void;
  stepFixed(steps?: number): void;
  poseHash(): string;
  activity(): { movingBodies: number; settled: boolean };
  consumeImpacts(): readonly ImpactEvent[];
  consumeSensorFlashes(): readonly SensorFlash[];
  sunkPinIds(): readonly string[];
  cupCenter(cupId: string): readonly [number, number];
}

export function createHoleSimulation(hole: HoleDefinition): HoleSimulation {
  const world = physics.world({
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: true,
    sleepVelocityThreshold: 0.06,
    sleepDelay: 0.45,
    // Full-power drives move ~0.24 m per fixed step: without bounded CCD the
    // ball tunnels straight through thin static walls. The wrapper splits any
    // step whose travel exceeds the threshold, so every impact is resolved.
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.35 }
  });
  const visuals: PropVisual[] = [];
  const tracked: TrackedEntry[] = [];
  const dynamicVisualNames: string[] = [];
  const sensorColliderIds = new Set<number>();
  const colliderNameById = new Map<number, string>();
  const pinBodies = new Map<string, SimBody>();
  const sunkPins = new Set<string>();
  let pendingImpacts: ImpactEvent[] = [];
  let pendingFlashes: SensorFlash[] = [];
  let stepIndex = 0;
  // Once-per-overlap arming: entry fires once, exit re-arms the pair.
  const armedPairs = new Set<string>();

  const registerCollider = (body: SimBody, colliderId: number, name: string, sensor: boolean): void => {
    colliderNameById.set(colliderId, name);
    if (sensor) sensorColliderIds.add(colliderId);
    void body;
  };

  const track = (name: string, body: SimBody, kind: TrackedEntry["kind"], ambient = false): void => {
    tracked.push({ name, body, kind, ambient });
    dynamicVisualNames.push(name);
  };

  /** Flag an already-tracked body as ambient pre-shot motion. */
  const markAmbient = (name: string): void => {
    const entry = tracked.find((candidate) => candidate.name === name);
    if (entry) tracked[tracked.indexOf(entry)] = { ...entry, ambient: true };
  };

  const addStaticBox = (
    name: string,
    halfExtents: readonly [number, number, number],
    position: readonly [number, number, number],
    options: {
      rotation?: Euler;
      friction?: number;
      restitution?: number;
      color?: string;
      emissive?: string;
      opacity?: number;
      visible?: boolean;
      sensor?: boolean;
    } = {}
  ): SimBody => {
    const body = world.createBody({
      type: "static",
      position: [...position] as [number, number, number],
      ...(options.rotation ? { rotation: eulerToQuat(options.rotation) } : {}),
      friction: options.friction ?? 0.8,
      restitution: options.restitution ?? 0.2
    });
    const collider = world.createCollider(body, {
      shape: physics.box(halfExtents[0], halfExtents[1], halfExtents[2]),
      ...(options.sensor ? { sensor: true } : {}),
      material: { friction: options.friction ?? 0.8, restitution: options.restitution ?? 0.2 }
    });
    registerCollider(body, collider.id, name, options.sensor === true);
    if (options.visible !== false) {
      visuals.push({
        name,
        source: "primitive",
        primitive: {
          shape: "box",
          size: [halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2],
          color: options.color ?? "#1d4a30",
          ...(options.emissive ? { emissive: options.emissive } : {}),
          ...(options.opacity === undefined ? {} : { opacity: options.opacity })
        },
        position,
        rotation: options.rotation ?? { x: 0, y: 0, z: 0 },
        dynamic: false
      });
    }
    return body;
  };

  // ---- felt, walls, ceiling -------------------------------------------------
  const wallHeight = 0.55;
  const wallThick = 0.35;
  // The back rail must sit BEHIND the deepest tee (z up to 3.6) or the opening
  // drive rebounds off the wrong face - the bug the smoke probe caught.
  const backZ = 5;
  const farZ = -(hole.halfLength + 0.6);
  const midX = 0;
  const midZ = (backZ + farZ) / 2;
  const laneLength = backZ - farZ;

  addStaticBox("felt", [hole.halfWidth + 1.2, 0.1, laneLength / 2 + 1.2], [midX, -0.1, midZ], {
    friction: 0.94,
    restitution: 0.08,
    // A darker blue-green felt gives the cream/coral shot furniture and lime
    // rough patches enough value contrast to read as one authored course.
    // Physics remains unchanged; this is renderer-facing material only.
    color: "#006f68"
  });
  addStaticBox("wall-left", [wallThick, wallHeight, laneLength / 2], [-(hole.halfWidth + 0.5), wallHeight, midZ], {
    restitution: 0.42,
    color: "#65bb88"
  });
  addStaticBox("wall-right", [wallThick, wallHeight, laneLength / 2], [hole.halfWidth + 0.5, wallHeight, midZ], {
    restitution: 0.42,
    color: "#65bb88"
  });
  addStaticBox("wall-tee", [hole.halfWidth + 0.65, wallHeight, wallThick], [midX, wallHeight, backZ], {
    restitution: 0.42,
    visible: false
  });
  addStaticBox("wall-far", [hole.halfWidth + 0.65, wallHeight, wallThick], [midX, wallHeight, farZ], {
    restitution: 0.42,
    color: "#65bb88"
  });
  // Invisible tall shells above the visible rails: a bouncing ball must never
    // leave the playable volume, while the rendered course keeps its low-rail
    // night-range look.
  const shellH = 3;
  const shellMidY = wallHeight * 2 + shellH / 2;
  addStaticBox("shell-left", [wallThick, shellH, laneLength / 2], [-(hole.halfWidth + 0.5), shellMidY, midZ], { visible: false });
  addStaticBox("shell-right", [wallThick, shellH, laneLength / 2], [hole.halfWidth + 0.5, shellMidY, midZ], { visible: false });
  addStaticBox("shell-tee", [hole.halfWidth + 0.65, shellH, wallThick], [midX, shellMidY, backZ], { visible: false });
  addStaticBox("shell-far", [hole.halfWidth + 0.65, shellH, wallThick], [midX, shellMidY, farZ], { visible: false });
  addStaticBox("ceiling-guard", [hole.halfWidth + 1, 0.1, laneLength / 2], [midX, 6.5, midZ], {
    visible: false,
    color: "#000000"
  });

  // ---- prop helpers ---------------------------------------------------------
  const addDynamicBox = (
    name: string,
    halfExtents: readonly [number, number, number],
    position: readonly [number, number, number],
    options: {
      mass: number;
      friction?: number;
      restitution?: number;
      linearDamping?: number;
      angularDamping?: number;
      typedAsset?: PropVisual["typedAsset"];
      color?: string;
      emissive?: string;
    }
  ): SimBody => {
    const body = world.createBody({
      type: "dynamic",
      position: [...position] as [number, number, number],
      mass: options.mass,
      friction: options.friction ?? 0.62,
      restitution: options.restitution ?? 0.12,
      linearDamping: options.linearDamping ?? 0.05,
      angularDamping: options.angularDamping ?? 0.12
    });
    const collider = world.createCollider(body, {
      shape: physics.box(halfExtents[0], halfExtents[1], halfExtents[2]),
      material: { friction: options.friction ?? 0.62, restitution: options.restitution ?? 0.12 }
    });
    registerCollider(body, collider.id, name, false);
    track(name, body, "prop");
    visuals.push({
      name,
      source: options.typedAsset ? "model" : "primitive",
      ...(options.typedAsset ? { typedAsset: options.typedAsset, targetMaxDimension: Math.max(...halfExtents) * 2 } : {}),
      ...(options.typedAsset ? {} : {
        primitive: {
          shape: "box" as const,
          size: [halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2] as const,
          color: options.color ?? "#a0703c",
          ...(options.emissive ? { emissive: options.emissive } : {})
        }
      }),
      position,
      rotation: { x: 0, y: 0, z: 0 },
      dynamic: true
    });
    return body;
  };

  const PLANK_RAW = { w: 1.786, h: 1.444, l: 10.374 };

  /** A timber plank whose longest side spans `length` along X. */
  const addPlankAlongX = (
    name: string,
    length: number,
    thickness: number,
    depth: number,
    position: readonly [number, number, number]
  ): SimBody => {
    const scale = length / PLANK_RAW.l;
    const hx = length / 2;
    const hy = thickness / 2;
    const hz = depth / 2;
    void scale;
    return addDynamicBox(name, [hx, hy, hz], position, {
      mass: 1.1,
      typedAsset: "siegePlankSet"
    });
  };

  const addBarrel = (spec: Extract<StructureSpec, { kind: "barrel" }>): void => {
    const h = spec.height;
    const radius = h * 0.418;
    addDynamicBox(spec.id, [radius * 0.86, h / 2, radius * 0.86], [spec.x, h / 2, spec.z], {
      mass: 0.6,
      friction: 0.5,
      restitution: 0.28,
      typedAsset: "siegeWoodenBarrel",
      color: "#7a4f2a"
    });
  };

  const addCrate = (name: string, size: number, x: number, y: number, z: number): void => {
    addDynamicBox(name, [size / 2, size / 2, size / 2], [x, y, z], {
      mass: 0.5,
      friction: 0.66,
      restitution: 0.14,
      typedAsset: "siegeWoodenCrate",
      color: "#b98a4e"
    });
  };

  /** Tiny immovable hinge anchor, invisible in the scene. */
  const addHingeAnchor = (name: string, position: readonly [number, number, number]): SimBody => {
    return addStaticBox(name, [0.03, 0.03, 0.03], position, { visible: false });
  };

  const buildStructure = (spec: StructureSpec): void => {
    switch (spec.kind) {
      case "crateStack": {
        for (let index = 0; index < spec.count; index += 1) {
          addCrate(`${spec.id}-crate-${index}`, spec.size, spec.x, spec.size / 2 + index * spec.size, spec.z);
        }
        break;
      }
      case "crate": {
        addCrate(spec.id, spec.size, spec.x, spec.y, spec.z);
        break;
      }
      case "barrel": {
        addBarrel(spec);
        break;
      }
      case "gate": {
        // Two posts + lintel, tied with fixed joints so the whole gate can rack.
        const half = spec.span / 2;
        const postHx = 0.075;
        const post = spec.postHeight;
        const leftPost = addDynamicBox(`${spec.id}-post-l`, [postHx, post / 2, postHx], [spec.x - half, post / 2, spec.z], {
          mass: 0.55,
          typedAsset: undefined,
          color: "#8a5a33"
        });
        const rightPost = addDynamicBox(`${spec.id}-post-r`, [postHx, post / 2, postHx], [spec.x + half, post / 2, spec.z], {
          mass: 0.55,
          color: "#8a5a33"
        });
        const lintel = addDynamicBox(
          `${spec.id}-lintel`,
          [half + postHx, 0.055, 0.09],
          [spec.x, post + 0.055, spec.z],
          { mass: 0.45, color: "#c99a5f" }
        );
        world.createConstraint({
          type: "fixed",
          bodyA: leftPost,
          bodyB: lintel,
          localAnchorA: [0, post / 2, 0],
          // Both local anchors resolve to the same world-space point at the
          // post centreline / lintel underside. Offset anchors made Rapier
          // solve a permanently separated fixed joint; after a hard strike
          // that error accumulated until the whole gate exploded.
          localAnchorB: [-half, -0.055, 0]
        });
        world.createConstraint({
          type: "fixed",
          bodyA: rightPost,
          bodyB: lintel,
          localAnchorA: [0, post / 2, 0],
          localAnchorB: [half, -0.055, 0]
        });
        break;
      }
      case "hingedPanel": {
        // Upright panel hinged at its bottom edge; a strike tips it over flat.
        const panelH = 1.02;
        const panelT = 0.075;
        const panel = addDynamicBox(
          `${spec.id}-panel`,
          [spec.span / 2, panelH / 2, panelT],
          [spec.x, panelH / 2 + 0.02, spec.z],
          { mass: 0.7, friction: 0.66, color: "#caa268" }
        );
        const hinge = addHingeAnchor(`${spec.id}-hinge`, [spec.x, 0.02, spec.z]);
        world.createConstraint({
          type: "hinge",
          bodyA: hinge,
          bodyB: panel,
          localAnchorA: [0, 0, 0],
          localAnchorB: [0, -(panelH / 2 + 0.02) + 0.01, 0],
          axis: [1, 0, 0],
          limits: spec.limits
        });
        break;
      }
      case "pendulum": {
        // Gallows post (static) + swinging plank on a hinge; ambient motion.
        const axleY = spec.drop + 0.32;
        addStaticBox(
          `${spec.id}-gallows`,
          [0.06, axleY / 2, 0.06],
          [spec.x, axleY / 2, spec.z],
          { color: "#5c4632" }
        );
        addStaticBox(
          `${spec.id}-axle`,
          [0.85, 0.045, 0.045],
          [spec.x, axleY, spec.z],
          { color: "#8a5a33" }
        );
        const swing = addDynamicBox(
          `${spec.id}-swing`,
          [0.78, 0.05, 0.16],
          [spec.x, axleY - 0.42, spec.z],
          { mass: 0.9, color: "#d7ab70" }
        );
        swing.setAngularVelocity([1.25, 0, 0]);
        // The swing plank is ambient: tracked once by addDynamicBox, then
        // flagged so settle gating and pre-shot stillness checks ignore it.
        markAmbient(`${spec.id}-swing`);
        const anchor = addHingeAnchor(`${spec.id}-hinge`, [spec.x, axleY, spec.z]);
        world.createConstraint({
          type: "hinge",
          bodyA: anchor,
          bodyB: swing,
          localAnchorA: [0, 0, 0],
          localAnchorB: [0, 0.42, 0],
          axis: [1, 0, 0]
        });
        break;
      }
      case "springPad": {
        const baseH = spec.padHeight * 0.5;
        const topH = spec.padHeight * 0.28;
        addStaticBox(
          `${spec.id}-base`,
          [0.52, baseH / 2, 0.52],
          [spec.x, baseH / 2, spec.z],
          { color: "#233043", emissive: "#3967ad" }
        );
        const top = addDynamicBox(
          `${spec.id}-top`,
          [0.48, topH / 2, 0.48],
          [spec.x, baseH + topH / 2 + 0.05, spec.z],
          { mass: 0.3, restitution: 0.4, linearDamping: 0.45, angularDamping: 0.6, color: "#ffd9a0", emissive: "#ff9d3c" }
        );
        track(`${spec.id}-top`, top, "prop");
        const springAnchor = ensureStaticAnchor(`${spec.id}-anchor`, [spec.x, baseH / 2, spec.z]);
        world.createConstraint({
          type: "spring",
          bodyA: springAnchor,
          bodyB: top,
          localAnchorA: [0, baseH / 2, 0],
          localAnchorB: [0, -topH / 2, 0],
          stiffness: spec.stiffness,
          damping: 0.6,
          restLength: 0.14
        });
        break;
      }
      case "ramp": {
        const angle = Math.atan2(spec.rise, spec.length);
        const hy = 0.06;
        addStaticBox(
          spec.id,
          [spec.width / 2, hy, spec.length / 2],
          [spec.x, spec.rise / 2, spec.z],
          {
            // The ramp's long axis is local Z, so its rise belongs on X.
            // Rotating around Z only banked it sideways and could never launch
            // a forward (-Z) shot toward an elevated tower crown.
            rotation: { x: angle, y: 0, z: 0 },
            friction: 0.32,
            restitution: 0.05,
            color: "#3c5a74"
          }
        );
        break;
      }
    }
  };

  // Spring pads need a static anchor body for the spring constraint; declared
  // here so the anchor exists before buildStructure runs (see pad branch).
  const staticAnchors = new Map<string, SimBody>();
  const ensureStaticAnchor = (name: string, position: readonly [number, number, number]): SimBody => {
    const existing = staticAnchors.get(name);
    if (existing) return existing;
    const body = addStaticBox(name, [0.03, 0.03, 0.03], position, { visible: false });
    staticAnchors.set(name, body);
    return body;
  };

  void ensureStaticAnchor;

  for (const spec of hole.structures) {
    buildStructure(spec);
  }
  // ---- pins (knock-down targets) --------------------------------------------
  for (const pin of hole.pins) {
    const heading = pin.heading ?? Math.PI / 2;
    const centerY = pin.elevation ?? 0.73;
    // Ground pins use a visible static pedestal. Elevated pins physically rest
    // on the authored crate tower instead of a hidden/floating support.
    if (pin.elevation === undefined) {
      addStaticBox(
        `${pin.id}-pedestal`,
        [0.2, 0.09, 0.2],
        [pin.x, 0.09, pin.z],
        { color: "#31465c", emissive: "#4d7ba6" }
      );
    }
    const body = world.createBody({
      type: "dynamic",
      position: [pin.x, centerY, pin.z] as [number, number, number],
      mass: 0.32,
      friction: 0.6,
      restitution: 0.14,
      linearDamping: 0.04,
      angularDamping: 0.1
    });
    const collider = world.createCollider(body, {
      shape: physics.box(0.24, 0.55, 0.05),
      material: { friction: 0.6, restitution: 0.14 }
    });
    registerCollider(body, collider.id, `${pin.id}-body`, false);
    track(`${pin.id}-body`, body, "pin");
    pinBodies.set(pin.id, body);
    visuals.push({
      name: `${pin.id}-body`,
      source: "model",
      typedAsset: "siegePlankSet",
      targetMaxDimension: 1.12,
      position: [pin.x, centerY, pin.z],
      rotation: { x: -Math.PI / 2, y: heading, z: 0 },
      dynamic: true
    });
    // Lamp disc above each pin feeds the controlled bloom pass.
    visuals.push({
      name: `${pin.id}-lamp`,
      source: "primitive",
      primitive: {
        shape: "sphere",
        size: [0.12, 0.12, 0.12],
        color: "#ffd9a0",
        emissive: "#ffb14d"
      },
      position: [pin.x, centerY + 0.77, pin.z],
      rotation: { x: 0, y: 0, z: 0 },
      dynamic: false
    });
  }

  // ---- cups (sensor zones) ---------------------------------------------------
  const cupZones: { readonly id: string; readonly x: number; readonly z: number; readonly radius: number }[] = [];
  for (const cup of hole.cups) {
    const body = world.createBody({
      type: "static",
      position: [cup.x, 0.16, cup.z] as [number, number, number]
    });
    const collider = world.createCollider(body, {
      shape: physics.box(cup.radius * 0.82, 0.16, cup.radius * 0.82),
      sensor: true,
      material: { friction: 0.9, restitution: 0 }
    });
    registerCollider(body, collider.id, `cup:${cup.id}`, true);
    cupZones.push({ id: cup.id, x: cup.x, z: cup.z, radius: cup.radius });
    visuals.push({
      name: `cup:${cup.id}:ring`,
      source: "primitive",
      primitive: {
        shape: "torus",
        size: [cup.radius * 1.7, cup.radius * 1.7, 0.06],
        color: "#ffd9a0",
        emissive: "#ff9d3c",
        opacity: 0.85
      },
      position: [cup.x, 0.03, cup.z],
      rotation: { x: Math.PI / 2, y: 0, z: 0 },
      dynamic: false
    });
  }

  // ---- ball ------------------------------------------------------------------
  const ballStart = hole.tee;
  const ball = world.createBody({
    type: "dynamic",
    position: [ballStart[0], BALL_RADIUS + 0.02, ballStart[1]] as [number, number, number],
    mass: BALL_MASS,
    friction: 0.22,
    restitution: 0.5,
    linearDamping: 0.12,
    angularDamping: 0.2
  });
  const ballCollider = world.createCollider(ball, {
    shape: physics.sphere(BALL_RADIUS),
    material: { friction: 0.22, restitution: 0.5 }
  });
  registerCollider(ball, ballCollider.id, "golf-ball", false);
  track("golf-ball", ball, "ball");
  visuals.push({
    name: "golf-ball",
    source: "model",
    typedAsset: "siegeGolfBall",
    targetMaxDimension: BALL_RADIUS * 2,
    position: [ballStart[0], BALL_RADIUS + 0.02, ballStart[1]],
    rotation: { x: 0, y: 0, z: 0 },
    dynamic: true
  });

  // ---- driving ----------------------------------------------------------------
  const strike = (direction: readonly [number, number, number], power: number): void => {
    const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    const nx = direction[0] / length;
    const ny = direction[1] / length;
    const nz = direction[2] / length;
    const speed = power * MINI_GOLF_IMPUSE_SCALE / MINI_GOLF_BALL_MASS;
    ball.wake();
    ball.setVelocity([nx * speed, ny * speed, nz * speed]);
  };

  const respawnBall = (): void => {
    ball.setPosition([ballStart[0], BALL_RADIUS + 0.02, ballStart[1]] as [number, number, number]);
    ball.setVelocity([0, 0, 0]);
    ball.setAngularVelocity([0, 0, 0]);
    ball.sleep();
  };

  // ---- stepping, events, hashing ---------------------------------------------
  const nameForCollider = (colliderId: number): string | undefined => colliderNameById.get(colliderId);

  const evaluateSunkPins = (): void => {
    for (const [pinId, pinBody] of pinBodies) {
      if (sunkPins.has(pinId)) continue;
      // Down is geometric, not orientation-based: a face-flat plank keeps its
      // local Y aligned with world up either way, so height plus displacement
      // from the authored spot is the honest topple test.
      const horizontal = pinBody.position[1] < PIN_DOWN_MAX_CENTER_HEIGHT;
      if (!horizontal) continue;
      for (const cup of cupZones) {
        const dx = pinBody.position[0] - cup.x;
        const dz = pinBody.position[2] - cup.z;
        if (dx * dx + dz * dz <= cup.radius * cup.radius) {
          sunkPins.add(pinId);
          break;
        }
      }
    }
  };

  const stepFixed = (steps = 1): void => {
    for (let index = 0; index < steps; index += 1) {
      stepIndex += 1;
      const events = world.step(1 / 60);
      for (const event of events) {
        const contact = event.contact;
        const aName = nameForCollider(contact.colliderA);
        const bName = nameForCollider(contact.colliderB);
        if (!aName || !bName) continue;
        if (contact.sensor) {
          const pairKey = [aName, bName].sort().join("::");
          if (event.type === "begin" && !armedPairs.has(pairKey)) {
            armedPairs.add(pairKey);
            pendingFlashes.push({
              cupId: aName.startsWith("cup:") ? aName : bName,
              otherName: aName.startsWith("cup:") ? bName : aName,
              stepIndex
            });
          } else if (event.type === "end") {
            armedPairs.delete(pairKey);
          }
          continue;
        }
        if (aName === "golf-ball" || bName === "golf-ball") {
          const speed = Math.abs(
            contact.normal[0] * ball.velocity[0]
            + contact.normal[1] * ball.velocity[1]
            + contact.normal[2] * ball.velocity[2]
          );
          if (speed > 0.35) pendingImpacts.push({ a: aName, b: bName, speed });
        }
      }
      evaluateSunkPins();
    }
  };

  const quantize = (value: number): string => String(Math.round(value * 1000));

  const poseHash = (): string => {
    const parts: string[] = [];
    for (const entry of tracked) {
      const p = entry.body.position;
      const quat = entry.body.rotation;
      parts.push(entry.name);
      parts.push(quantize(p[0]), quantize(p[1]), quantize(p[2]));
      parts.push(quantize(quat[0]), quantize(quat[1]), quantize(quat[2]), quantize(quat[3]));
    }
    return hashString(parts.join("|"));
  };

  const activity = (): { movingBodies: number; settled: boolean } => {
    let movingBodies = 0;
    for (const entry of tracked) {
      // Ambient pre-shot motion (the pendulum) never gates settling.
      if (entry.ambient) continue;
      const v = entry.body.velocity;
      const w = entry.body.angularVelocity;
      const speed = Math.hypot(v[0], v[1], v[2]);
      const spin = Math.hypot(w[0], w[1], w[2]);
      const sleeping = entry.body.snapshot().sleeping;
      // Sleeping OR effectively still: micro-jitter below these bands must
      // not stall hole resolution on frame-starved clients.
      if (!sleeping && (speed > 0.14 || spin > 0.6)) movingBodies += 1;
    }
    return { movingBodies, settled: movingBodies === 0 };
  };

  return {
    world,
    visuals,
    dynamicVisualNames,
    poses(): readonly TrackedPose[] {
      return tracked.map((entry) => ({
        name: entry.name,
        position: [...entry.body.position] as [number, number, number],
        rotation: [...entry.body.rotation] as [number, number, number, number]
      }));
    },
    ball,
    pinBodies,
    get bodyCount(): number {
      return tracked.length;
    },
    get backend(): string {
      return world.snapshot().backend.active;
    },
    fixedDelta: 1 / 60,
    strike,
    respawnBall,
    stepFixed,
    poseHash,
    activity,
    consumeImpacts(): readonly ImpactEvent[] {
      const out = pendingImpacts;
      pendingImpacts = [];
      return out;
    },
    consumeSensorFlashes(): readonly SensorFlash[] {
      const out = pendingFlashes;
      pendingFlashes = [];
      return out;
    },
    sunkPinIds(): readonly string[] {
      return [...sunkPins];
    },
    cupCenter(cupId: string): readonly [number, number] {
      const cup = cupZones.find((candidate) => candidate.id === cupId);
      if (!cup) throw new Error(`Unknown cup "${cupId}".`);
      return [cup.x, cup.z];
    }
  };
}

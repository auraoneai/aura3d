/**
 * Game camera rigs (muse3jsparity-PRD F2).
 *
 * Game cameras three.js does not ship: shoulder cam, collision-aware orbit
 * (wall slide via caller-supplied ray/sphere probes, never teleports/clips),
 * procedural trauma shake with decay, hit punch-in, and a per-frame
 * `cameraEvidence` aggregator. Pure scene-math: no renderer, no DOM, no
 * `three` imports. The caller owns frame presentation; every rig returns
 * plain position/target/fov snapshots plus evidence the route can publish.
 *
 * Follow-rig unification (PRD N2.2): `createFollowRig` below is the
 * root-adjacent canonical follow camera. It implements the same
 * offset-plus-exponential-damping algorithm as
 * `ThirdPersonFollowControls` in `@aura3d/input`; that class remains the
 * direct-camera-mutation adapter, while this module owns the algorithm
 * contract (`FOLLOW_DAMPING_CONTRACT`). `asInputOptions()` converts one
 * options object into the input adapter's shape so the two can never
 * diverge. P1 pairs with N2 via this interface (reported, ledger untouched).
 */

import type { GameVec3 } from "./GameRuntime.js";

export type GameCameraRigVec3 = GameVec3;

export interface GameCameraRigTarget {
  readonly position: GameCameraRigVec3;
  /** Yaw radians. 0 faces -Z; forward = [sin(yaw), 0, -cos(yaw)]. */
  readonly facing?: number;
}

export interface GameCameraRigSnapshot {
  readonly kind: string;
  readonly position: GameCameraRigVec3;
  readonly target: GameCameraRigVec3;
  readonly fov: number;
}

export interface GameCameraEvidence {
  readonly kind: "aura-game-camera-evidence";
  readonly position: GameCameraRigVec3;
  readonly target: GameCameraRigVec3;
  readonly fov: number;
  readonly shakeEnergy: number;
  readonly trauma: number;
  readonly punchActive: boolean;
  readonly clipped: boolean;
  readonly clearance: number;
}

function assertFinite(value: number, api: string, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${api} ${field} must be finite (received ${String(value)}).`);
  }
}

function assertVec3(value: GameCameraRigVec3, api: string, field: string): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${api} ${field} must be a finite [x, y, z] tuple.`);
  }
}

function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

function lerpTuple(a: GameCameraRigVec3, b: GameCameraRigVec3, alpha: number): GameCameraRigVec3 {
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha
  ];
}

// ---------------------------------------------------------------------------
// Shoulder camera
// ---------------------------------------------------------------------------

export interface ShoulderCameraOptions {
  readonly side?: "right" | "left";
  readonly sideOffset?: number;
  readonly heightOffset?: number;
  readonly distance?: number;
  readonly lookAhead?: number;
  readonly smoothing?: number;
  readonly fov?: number;
}

export interface ShoulderCamera {
  update(dt: number, target: GameCameraRigTarget): GameCameraRigSnapshot;
  snapshot(): GameCameraRigSnapshot;
  reset(eye: GameCameraRigVec3): void;
}

export function createShoulderCamera(options: ShoulderCameraOptions = {}): ShoulderCamera {
  const api = "camera.shoulder";
  const sideSign = options.side === "left" ? -1 : 1;
  const sideOffset = options.sideOffset ?? 0.85;
  const heightOffset = options.heightOffset ?? 1.55;
  const distance = options.distance ?? 2.6;
  const lookAhead = options.lookAhead ?? 2.2;
  const smoothing = options.smoothing ?? 10;
  const fov = options.fov ?? 55;
  for (const [field, value] of [["sideOffset", sideOffset], ["heightOffset", heightOffset], ["distance", distance], ["lookAhead", lookAhead], ["smoothing", smoothing], ["fov", fov]] as const) {
    assertFinite(value, api, field);
  }
  if (distance < 0) throw new RangeError(`${api} distance must be >= 0.`);
  if (smoothing < 0) throw new RangeError(`${api} smoothing must be >= 0.`);

  let eye: GameCameraRigVec3 = [sideSign * sideOffset, heightOffset, distance];
  let look: GameCameraRigVec3 = [0, 1, -lookAhead];
  let currentFov = fov;

  const solve = (target: GameCameraRigTarget): { eye: GameCameraRigVec3; look: GameCameraRigVec3 } => {
    assertVec3(target.position, api, "target.position");
    const yaw = target.facing ?? 0;
    assertFinite(yaw, api, "target.facing");
    const forward: GameCameraRigVec3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const right: GameCameraRigVec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const [px, py, pz] = target.position;
    return {
      eye: [
        px - forward[0] * distance + right[0] * sideSign * sideOffset,
        py + heightOffset,
        pz - forward[2] * distance + right[2] * sideSign * sideOffset
      ],
      look: [px + forward[0] * lookAhead, py + heightOffset * 0.55, pz + forward[2] * lookAhead]
    };
  };

  const snap = (): GameCameraRigSnapshot => ({
    kind: "aura-game-shoulder-camera",
    position: eye,
    target: look,
    fov: currentFov
  });

  return {
    update(dt: number, target: GameCameraRigTarget): GameCameraRigSnapshot {
      assertFinite(dt, api, "dt");
      const solved = solve(target);
      const alpha = dampFactor(smoothing, dt);
      eye = lerpTuple(eye, solved.eye, alpha);
      look = lerpTuple(look, solved.look, alpha);
      currentFov = fov;
      return snap();
    },
    snapshot: snap,
    reset(nextEye: GameCameraRigVec3): void {
      assertVec3(nextEye, api, "eye");
      eye = [...nextEye] as GameCameraRigVec3;
    }
  };
}

// ---------------------------------------------------------------------------
// Collision-aware orbit (wall slide)
// ---------------------------------------------------------------------------

export interface CollisionOrbitProbeHit {
  readonly distance: number;
}

export type CollisionOrbitProbe = (
  origin: GameCameraRigVec3,
  direction: GameCameraRigVec3,
  maxDistance: number
) => CollisionOrbitProbeHit | undefined;

export interface CollisionAwareOrbitOptions {
  readonly target?: GameCameraRigVec3;
  readonly distance?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly probeRadius?: number;
  readonly azimuth?: number;
  readonly polar?: number;
  readonly smoothing?: number;
  readonly pullInRate?: number;
  readonly fov?: number;
}

export interface CollisionAwareOrbit {
  rotate(deltaAzimuth: number, deltaPolar: number): void;
  dolly(factor: number): void;
  setTarget(target: GameCameraRigVec3): void;
  update(dt: number, probe?: CollisionOrbitProbe): GameCameraRigSnapshot & { clipped: boolean; clearance: number };
  snapshot(): GameCameraRigSnapshot & { clipped: boolean; clearance: number };
}

export function createCollisionAwareOrbit(options: CollisionAwareOrbitOptions = {}): CollisionAwareOrbit {
  const api = "camera.collisionAwareOrbit";
  const minDistance = options.minDistance ?? 0.6;
  const maxDistance = options.maxDistance ?? 14;
  const probeRadius = options.probeRadius ?? 0.3;
  const smoothing = options.smoothing ?? 6;
  const pullInRate = options.pullInRate ?? 30;
  const fov = options.fov ?? 50;
  for (const [field, value] of [["minDistance", minDistance], ["maxDistance", maxDistance], ["probeRadius", probeRadius], ["smoothing", smoothing], ["pullInRate", pullInRate], ["fov", fov]] as const) {
    assertFinite(value, api, field);
  }
  if (minDistance < 0) throw new RangeError(`${api} minDistance must be >= 0.`);
  if (maxDistance < minDistance) throw new RangeError(`${api} maxDistance must be >= minDistance.`);
  if (probeRadius < 0) throw new RangeError(`${api} probeRadius must be >= 0.`);

  let target: GameCameraRigVec3 = options.target ? [...options.target] as GameCameraRigVec3 : [0, 1, 0];
  assertVec3(target, api, "target");
  let azimuth = options.azimuth ?? 0.6;
  let polar = options.polar ?? 1.05;
  let wanted = Math.min(maxDistance, Math.max(minDistance, options.distance ?? 5));
  let current = wanted;
  let clipped = false;
  let clearance = wanted;

  const offsetFor = (length: number): GameCameraRigVec3 => {
    const sinPolar = Math.sin(polar);
    return [
      length * sinPolar * Math.sin(azimuth),
      length * Math.cos(polar),
      length * sinPolar * Math.cos(azimuth)
    ];
  };

  const solve = (): GameCameraRigSnapshot & { clipped: boolean; clearance: number } => {
    const offset = offsetFor(current);
    return {
      kind: "aura-game-collision-orbit",
      position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
      target,
      fov,
      clipped,
      clearance
    };
  };

  return {
    rotate(deltaAzimuth: number, deltaPolar: number): void {
      assertFinite(deltaAzimuth, api, "deltaAzimuth");
      assertFinite(deltaPolar, api, "deltaPolar");
      azimuth += deltaAzimuth;
      polar = Math.min(Math.PI - 0.02, Math.max(0.02, polar + deltaPolar));
    },
    dolly(factor: number): void {
      assertFinite(factor, api, "factor");
      if (factor <= 0) throw new RangeError(`${api} dolly factor must be > 0.`);
      wanted = Math.min(maxDistance, Math.max(minDistance, wanted * factor));
    },
    setTarget(next: GameCameraRigVec3): void {
      assertVec3(next, api, "target");
      target = [...next] as GameCameraRigVec3;
    },
    update(dt: number, probe?: CollisionOrbitProbe): GameCameraRigSnapshot & { clipped: boolean; clearance: number } {
      assertFinite(dt, api, "dt");
      const seconds = Math.max(0, dt);
      let allowed = wanted;
      if (probe) {
        const offset = offsetFor(wanted);
        const length = Math.hypot(offset[0], offset[1], offset[2]);
        if (length > 1e-9) {
          const direction: GameCameraRigVec3 = [offset[0] / length, offset[1] / length, offset[2] / length];
          const hit = probe(target, direction, length);
          if (hit) {
            assertFinite(hit.distance, api, "probe hit distance");
            // Slide: pull in along the same ray to the wall minus the probe
            // radius. Never teleports: approach below is rate-limited.
            allowed = Math.min(wanted, Math.max(minDistance, hit.distance - probeRadius));
          }
        }
      }
      clipped = allowed < wanted - 1e-6;
      clearance = allowed;
      // Fast pull-in so the lens never enters the wall; slow release so it
      // slides back out instead of popping.
      const rate = allowed < current ? pullInRate : smoothing;
      current += (allowed - current) * dampFactor(rate, seconds);
      return solve();
    },
    snapshot: solve
  };
}

// ---------------------------------------------------------------------------
// Trauma shake
// ---------------------------------------------------------------------------

export interface TraumaShakeOptions {
  readonly decay?: number;
  readonly maxOffset?: number;
  readonly maxRoll?: number;
  readonly seed?: number;
}

export interface TraumaShakeSnapshot {
  readonly kind: "aura-game-trauma-shake";
  readonly offset: GameCameraRigVec3;
  readonly roll: number;
  readonly trauma: number;
  readonly energy: number;
}

export interface TraumaShake {
  addTrauma(amount: number): void;
  update(dt: number): TraumaShakeSnapshot;
  snapshot(): TraumaShakeSnapshot;
}

export function createTraumaShake(options: TraumaShakeOptions = {}): TraumaShake {
  const api = "camera.shake";
  const decay = options.decay ?? 1.4;
  const maxOffset = options.maxOffset ?? 0.22;
  const maxRoll = options.maxRoll ?? 0.035;
  const seed = options.seed ?? 1.7;
  for (const [field, value] of [["decay", decay], ["maxOffset", maxOffset], ["maxRoll", maxRoll], ["seed", seed]] as const) {
    assertFinite(value, api, field);
  }
  if (decay < 0) throw new RangeError(`${api} decay must be >= 0.`);
  if (maxOffset < 0) throw new RangeError(`${api} maxOffset must be >= 0.`);

  let trauma = 0;
  let time = 0;

  // Deterministic layered-sine noise: identical dt streams produce
  // identical offsets, so shake decay is unit-testable without randomness.
  const noise = (phase: number): number =>
    0.55 * Math.sin(time * 39.7 + seed + phase) +
    0.3 * Math.sin(time * 71.3 + seed * 1.7 + phase * 2.1) +
    0.15 * Math.sin(time * 127.9 + seed * 2.3 + phase * 0.7);

  const snap = (): TraumaShakeSnapshot => {
    const energy = trauma * trauma;
    // `+ 0` normalizes -0 (negative noise × zero energy) to 0 so snapshots
    // stay Object.is-clean for evidence comparisons.
    return {
      kind: "aura-game-trauma-shake",
      offset: [
        noise(0) * maxOffset * energy + 0,
        noise(2.4) * maxOffset * 0.7 * energy + 0,
        noise(4.8) * maxOffset * 0.4 * energy + 0
      ],
      roll: noise(7.1) * maxRoll * energy + 0,
      trauma,
      energy
    };
  };

  return {
    addTrauma(amount: number): void {
      assertFinite(amount, api, "amount");
      if (amount < 0) throw new RangeError(`${api} trauma amount must be >= 0.`);
      trauma = Math.min(1, trauma + amount);
    },
    update(dt: number): TraumaShakeSnapshot {
      assertFinite(dt, api, "dt");
      time += Math.max(0, dt);
      trauma = Math.max(0, trauma - decay * Math.max(0, dt));
      return snap();
    },
    snapshot: snap
  };
}

// ---------------------------------------------------------------------------
// Punch-in
// ---------------------------------------------------------------------------

export interface PunchInOptions {
  readonly fovKick?: number;
  readonly distanceKick?: number;
  readonly duration?: number;
}

export interface PunchInSnapshot {
  readonly kind: "aura-game-punch-in";
  readonly fovOffset: number;
  readonly distanceOffset: number;
  readonly active: boolean;
  readonly progress: number;
}

export interface PunchIn {
  punch(strength?: number): void;
  update(dt: number): PunchInSnapshot;
  snapshot(): PunchInSnapshot;
}

export function createPunchIn(options: PunchInOptions = {}): PunchIn {
  const api = "camera.punchIn";
  const fovKick = options.fovKick ?? 7;
  const distanceKick = options.distanceKick ?? 0.55;
  const duration = options.duration ?? 0.32;
  for (const [field, value] of [["fovKick", fovKick], ["distanceKick", distanceKick], ["duration", duration]] as const) {
    assertFinite(value, api, field);
  }
  if (duration <= 0) throw new RangeError(`${api} duration must be > 0.`);

  let elapsed = duration;
  let strength = 0;

  const snap = (): PunchInSnapshot => {
    const progress = Math.min(1, elapsed / duration);
    const active = elapsed < duration;
    // Fast attack, smooth release: full kick at progress 0, gone at 1.
    const envelope = active ? Math.sin(Math.min(1, progress) * Math.PI) ** 0.75 : 0;
    return {
      kind: "aura-game-punch-in",
      fovOffset: -fovKick * strength * envelope + 0,
      distanceOffset: -distanceKick * strength * envelope + 0,
      active,
      progress
    };
  };

  return {
    punch(nextStrength = 1): void {
      assertFinite(nextStrength, api, "strength");
      if (nextStrength < 0 || nextStrength > 1) {
        throw new RangeError(`${api} strength must be in [0, 1].`);
      }
      strength = nextStrength;
      elapsed = 0;
    },
    update(dt: number): PunchInSnapshot {
      assertFinite(dt, api, "dt");
      elapsed = Math.min(duration, elapsed + Math.max(0, dt));
      return snap();
    },
    snapshot: snap
  };
}

// ---------------------------------------------------------------------------
// Follow rig (N2.2 canonical follow; see module docblock)
// ---------------------------------------------------------------------------

/**
 * The single follow-camera damping contract shared with
 * `ThirdPersonFollowControls` (`@aura3d/input`): the eye eases toward
 * `target.position + offset` with exponential damping
 * `alpha = 1 - exp(-damping * dt)`, then looks at the target.
 */
export const FOLLOW_DAMPING_CONTRACT = "offset-plus-exponential-damping-v1" as const;

export interface FollowRigOptions {
  readonly offset?: GameCameraRigVec3;
  readonly damping?: number;
  readonly fov?: number;
}

export interface FollowRig {
  update(dt: number, target: GameCameraRigTarget): GameCameraRigSnapshot;
  snapshot(): GameCameraRigSnapshot;
  asInputOptions(): { readonly offset: { x: number; y: number; z: number }; readonly damping: number };
}

export function createFollowRig(options: FollowRigOptions = {}): FollowRig {
  const api = "camera.followRig";
  const offset: GameCameraRigVec3 = options.offset ? [...options.offset] as GameCameraRigVec3 : [0, 2, 6];
  assertVec3(offset, api, "offset");
  const damping = options.damping ?? 12;
  const fov = options.fov ?? 50;
  assertFinite(damping, api, "damping");
  assertFinite(fov, api, "fov");
  if (damping < 0) throw new RangeError(`${api} damping must be >= 0.`);

  let eye: GameCameraRigVec3 = [offset[0], offset[1], offset[2]];
  let look: GameCameraRigVec3 = [0, 0, 0];

  const snap = (): GameCameraRigSnapshot => ({
    kind: "aura-game-follow-rig",
    position: eye,
    target: look,
    fov
  });

  return {
    update(dt: number, target: GameCameraRigTarget): GameCameraRigSnapshot {
      assertFinite(dt, api, "dt");
      assertVec3(target.position, api, "target.position");
      const desired: GameCameraRigVec3 = [
        target.position[0] + offset[0],
        target.position[1] + offset[1],
        target.position[2] + offset[2]
      ];
      const alpha = dampFactor(damping, dt);
      eye = lerpTuple(eye, desired, alpha);
      look = [...target.position] as GameCameraRigVec3;
      return snap();
    },
    snapshot: snap,
    asInputOptions(): { readonly offset: { x: number; y: number; z: number }; readonly damping: number } {
      return { offset: { x: offset[0], y: offset[1], z: offset[2] }, damping };
    }
  };
}

// ---------------------------------------------------------------------------
// Aggregator: base rig + trauma + punch-in + per-frame evidence
// ---------------------------------------------------------------------------

export interface GameCameraRigOptions {
  readonly base?: "shoulder" | "collision-orbit" | "follow";
  readonly shoulder?: ShoulderCameraOptions;
  readonly orbit?: CollisionAwareOrbitOptions;
  readonly follow?: FollowRigOptions;
  readonly trauma?: TraumaShakeOptions;
  readonly punch?: PunchInOptions;
  readonly fov?: number;
}

export interface GameCameraRig {
  readonly trauma: TraumaShake;
  readonly punchIn: PunchIn;
  update(
    dt: number,
    target: GameCameraRigTarget,
    probe?: CollisionOrbitProbe
  ): { readonly snapshot: GameCameraRigSnapshot; readonly evidence: GameCameraEvidence };
  snapshot(): { readonly snapshot: GameCameraRigSnapshot; readonly evidence: GameCameraEvidence };
}

export function createGameCameraRig(options: GameCameraRigOptions = {}): GameCameraRig {
  const api = "camera.gameRig";
  const base = options.base ?? "shoulder";
  const shoulder = createShoulderCamera(options.shoulder);
  const orbit = createCollisionAwareOrbit(options.orbit);
  const follow = createFollowRig(options.follow);
  const trauma = createTraumaShake(options.trauma);
  const punchIn = createPunchIn(options.punch);
  const fovOverride = options.fov;
  if (fovOverride !== undefined) assertFinite(fovOverride, api, "fov");

  let last: { readonly snapshot: GameCameraRigSnapshot; readonly evidence: GameCameraEvidence } = {
    snapshot: { kind: "aura-game-camera-rig", position: [0, 1.6, 4], target: [0, 1, 0], fov: fovOverride ?? 50 },
    evidence: {
      kind: "aura-game-camera-evidence",
      position: [0, 1.6, 4],
      target: [0, 1, 0],
      fov: fovOverride ?? 50,
      shakeEnergy: 0,
      trauma: 0,
      punchActive: false,
      clipped: false,
      clearance: Number.POSITIVE_INFINITY
    }
  };

  return {
    trauma,
    punchIn,
    update(dt: number, target: GameCameraRigTarget, probe?: CollisionOrbitProbe): typeof last {
      assertFinite(dt, api, "dt");
      const shake = trauma.update(dt);
      const punch = punchIn.update(dt);
      let baseSnap: GameCameraRigSnapshot;
      let clipped = false;
      let clearance = Number.POSITIVE_INFINITY;
      if (base === "collision-orbit") {
        const solved = orbit.update(dt, probe);
        baseSnap = solved;
        clipped = solved.clipped;
        clearance = solved.clearance;
      } else if (base === "follow") {
        baseSnap = follow.update(dt, target);
      } else {
        baseSnap = shoulder.update(dt, target);
      }
      const position: GameCameraRigVec3 = [
        baseSnap.position[0] + shake.offset[0],
        baseSnap.position[1] + shake.offset[1],
        baseSnap.position[2] + shake.offset[2]
      ];
      const fov = (fovOverride ?? baseSnap.fov) + punch.fovOffset;
      last = {
        snapshot: { kind: "aura-game-camera-rig", position, target: baseSnap.target, fov },
        evidence: {
          kind: "aura-game-camera-evidence",
          position,
          target: baseSnap.target,
          fov,
          shakeEnergy: shake.energy,
          trauma: shake.trauma,
          punchActive: punch.active,
          clipped,
          clearance
        }
      };
      return last;
    },
    snapshot: (): typeof last => last
  };
}

/**
 * Root-bridge namespace (wiring lives in `agent-api/index.ts`, owned by the
 * bridge sibling — this object is the exact surface to spread onto `camera`).
 */
export const gameCameraRigs = {
  shoulder: createShoulderCamera,
  collisionAwareOrbit: createCollisionAwareOrbit,
  shake: createTraumaShake,
  punchIn: createPunchIn,
  followRig: createFollowRig,
  gameRig: createGameCameraRig
} as const;

/**
 * Turbo Drift Circuit dynamic track-side props (PRD TDC-A2 / C1).
 *
 * Tire stacks and cones become the route's first rigid-body set dressing: light Rapier
 * bodies flanked *off* the racing line that scatter cosmetically when a car leans on them.
 *
 * Placement law (checked, not assumed):
 * - every prop rests strictly outside the passing-lane corridor — its full collision
 *   disc clears the visual-asphalt half-width plus a lane margin;
 * - every prop stays inside a trackside band so nothing lands in the in-field or on
 *   the modelled scenery;
 * - impact scatter is cosmetic: prop mass is two orders of magnitude below a Formula
 *   car's, so contact cannot change grip or lap time, and both the predictor below and
 *   the runtime clamp project scattered bodies back out of the racing corridor.
 *
 * The pure placement + scatter functions here are deterministic under a fixed seed so
 * the unit suite can prove clearance and settle behaviour without a browser.
 */

export type TurboTrackPropKind = "cone" | "tire-stack";

export interface TurboTrackPropPlacement {
  readonly id: string;
  readonly kind: TurboTrackPropKind;
  /** Lap-progress anchor used for placement. */
  readonly progress: number;
  /** Signed lateral offset from the racing line, game units (positive = left of travel). */
  readonly signedOffsetGame: number;
  /** Game-plane centre of the prop disc. */
  readonly point: { readonly x: number; readonly y: number };
  /** Collision disc radius, game units. */
  readonly radiusGame: number;
  readonly massKg: number;
}

export interface TurboTrackPropsPlan {
  readonly placements: readonly TurboTrackPropPlacement[];
  /** Corridor every prop disc must stay outside: asphalt half-width + lane margin. */
  readonly corridorHalfWidthGame: number;
}

export interface TurboPropClearanceViolation {
  readonly id: string;
  readonly measuredEdgeGame: number;
  readonly requiredClearanceGame: number;
}

export interface TurboPropClearanceReport {
  readonly clear: boolean;
  readonly minMeasuredEdgeGame: number;
  readonly violations: readonly TurboPropClearanceViolation[];
}

/** Deterministic mulberry32 PRNG so layout and jitter are reproducible from a seed. */
export function createTurboPropRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Left-of-travel unit vector for a kit heading, matching the kit's signed-offset side. */
export function turboLeftVector(heading: number): { readonly x: number; readonly z: number } {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

export interface PlanTurboTrackPropsInput {
  /** Lap-progress sampler of the certified centreline (game plane). */
  readonly sampleAt: (progress: number) => { readonly x: number; readonly y: number; readonly heading: number };
  /** Visual grey-asphalt half width in game units. */
  readonly visualAsphaltHalfWidthGame: number;
  /** Extra clearance between the asphalt edge and any prop disc, game units. */
  readonly laneMarginGame?: number;
  /** Maximum |offset| from the line; keeps props on the visible verge band. */
  readonly maxOffsetGame: number;
  /** Collision radii per kind, game units. */
  readonly radiusGameByKind: Readonly<Record<TurboTrackPropKind, number>>;
  readonly massKgByKind: Readonly<Record<TurboTrackPropKind, number>>;
  readonly coneCount: number;
  readonly tireStackCount: number;
  readonly seed: number;
/**
 * Optional engine signed-offset probe. When provided, every candidate is
 * re-measured against the real centreline before acceptance - anchor arithmetic
 * alone cannot see adjacent road branches on folded circuits like Tsukuba.
 */
  readonly signedOffsetAt?: (point: { readonly x: number; readonly y: number }) => number;
}

/**
 * Plans prop positions along the circuit.
 *
 * Props alternate sides at spread-out progress anchors with seeded jitter in both
 * progress and lateral offset, always beyond `asphaltHalf + margin + radius`. Any
 * candidate whose own disc would touch the corridor is pushed further out before it is
 * accepted, so the plan cannot contain a violating prop by construction.
 */
export function planTurboTrackProps(input: PlanTurboTrackPropsInput): TurboTrackPropsPlan {
  const laneMarginGame = input.laneMarginGame ?? 0.008;
  const rng = createTurboPropRng(input.seed);
  const kinds: { kind: TurboTrackPropKind; count: number }[] = [
    { kind: "cone", count: input.coneCount },
    { kind: "tire-stack", count: input.tireStackCount }
  ];
  const total = kinds.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) throw new Error("Turbo track props require at least one prop.");
  const placements: TurboTrackPropPlacement[] = [];
  let slot = 0;
  for (const { kind, count } of kinds) {
    const radius = input.radiusGameByKind[kind];
    for (let index = 0; index < count; index += 1) {
      // Spread anchors across the whole lap, interleaving kinds via the global slot.
      const baseProgress = ((slot * 7 + index * 3 + rng() * 5) % total) / total;
      const progress = (baseProgress + 1) % 1;
      const side = slot % 2 === 0 ? 1 : -1;
      const sample = input.sampleAt(progress);
      const minOffset = input.visualAsphaltHalfWidthGame + laneMarginGame + radius;
      const span = Math.max(0, input.maxOffsetGame - minOffset);
      let offset = side * (minOffset + rng() * span);
      // Defensive push: if this candidate still touches the corridor, move it out.
      if (Math.abs(offset) - radius < input.visualAsphaltHalfWidthGame + laneMarginGame) {
        offset = side * (input.visualAsphaltHalfWidthGame + laneMarginGame + radius + 1e-3);
      }
      const left = turboLeftVector(sample.heading);
      // Probe-verified acceptance: walk the candidate outward until the ENGINE
      // measured edge clears the corridor; drop it if the verge band is exhausted.
      let point = {
        x: sample.x + left.x * offset,
        y: sample.y + left.z * offset
      };
      if (input.signedOffsetAt) {
        let measuredEdge = Math.abs(input.signedOffsetAt(point)) - radius;
        let guard = 0;
        while (measuredEdge < input.visualAsphaltHalfWidthGame + laneMarginGame && guard < 40) {
          offset += side * 0.012;
          point = { x: sample.x + left.x * offset, y: sample.y + left.z * offset };
          measuredEdge = Math.abs(input.signedOffsetAt(point)) - radius;
          guard += 1;
        }
        if (measuredEdge < input.visualAsphaltHalfWidthGame + laneMarginGame || Math.abs(offset) > input.maxOffsetGame + radius) {
          continue;
        }
      }
      placements.push({
        id: `turbo-prop-${kind}-${index}`,
        kind,
        progress,
        signedOffsetGame: offset,
        point,
        radiusGame: radius,
        massKg: input.massKgByKind[kind]
      });
    }
    slot += 1;
  }
  return {
    placements,
    corridorHalfWidthGame: input.visualAsphaltHalfWidthGame + laneMarginGame
  };
}

export interface AuditTurboPropClearanceInput {
  readonly placements: readonly TurboTrackPropPlacement[];
  /** Signed-offset probe for a game-plane point (the engine's own surface query). */
  readonly signedOffsetAt: (point: { readonly x: number; readonly y: number }) => number;
  /** Asphalt half-width plus lane margin: the corridor every prop disc must stay outside. */
  readonly corridorHalfWidthGame: number;
}

/**
 * Re-measures every placed prop against the live centreline.
 *
 * This is the proof consumed by the unit suite: it uses the engine's own signed-offset
 * query rather than trusting the planner's arithmetic, so a topology regeneration that
 * moves the road fails loudly here instead of silently leaving cones on the racing line.
 */
export function auditTurboPropCorridorClearance(input: AuditTurboPropClearanceInput): TurboPropClearanceReport {
  let minMeasuredEdgeGame = Number.POSITIVE_INFINITY;
  const violations: TurboPropClearanceViolation[] = [];
  for (const prop of input.placements) {
    const measured = Math.abs(input.signedOffsetAt(prop.point));
    const edge = measured - prop.radiusGame;
    minMeasuredEdgeGame = Math.min(minMeasuredEdgeGame, edge);
    if (edge < input.corridorHalfWidthGame - 1e-9) {
      violations.push({
        id: prop.id,
        measuredEdgeGame: Number(edge.toFixed(6)),
        requiredClearanceGame: Number((input.corridorHalfWidthGame + prop.radiusGame).toFixed(6))
      });
    }
  }
  return {
    clear: violations.length === 0,
    minMeasuredEdgeGame: Number.isFinite(minMeasuredEdgeGame)
      ? Number(minMeasuredEdgeGame.toFixed(6))
      : 0,
    violations
  };
}

export interface TurboScatterImpact {
  readonly id: string;
  /** Impulse direction in the game plane (normalised internally). */
  readonly dx: number;
  readonly dz: number;
  readonly strength: number;
}

export interface TurboScatterResultPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Integration frames until this prop's speed dropped under the rest threshold. */
  readonly settledFrame: number;
  /** True when the corridor projection had to move this prop during settle. */
  readonly projectedBackToVerge: boolean;
}

export interface TurboScatterResult {
  readonly points: readonly TurboScatterResultPoint[];
  readonly seed: number;
  readonly steps: number;
  readonly allRestingOutsideCorridor: boolean;
}

export interface SimulateTurboPropScatterInput {
  readonly placements: readonly TurboTrackPropPlacement[];
  readonly impacts: readonly TurboScatterImpact[];
  readonly seed: number;
  /** Centreline sampler at a lap progress; enables true corridor projection. */
  readonly sampleAt?: (progress: number) => { readonly x: number; readonly y: number; readonly heading: number };
  /** Fixed integration step, seconds. Defaults to 1/60. */
  readonly stepSeconds?: number;
  readonly maxSteps?: number;
  readonly visualAsphaltHalfWidthGame: number;
  readonly laneMarginGame?: number;
}

const SCATTER_QUANT = 6;

/**
 * Deterministic cosmetic-scatter predictor.
 *
 * Semi-implicit Euler with constant friction deceleration plus a seeded angular wobble:
 * the same seed, placements and impacts always settle to the same rest points (the unit
 * suite asserts exactly that). Rest points are projected back out of the racing corridor
 * along the anchor's left vector — mirroring the runtime clamp — so scatter never parks
 * a prop on the passing lane.
 */
export function simulateTurboPropScatter(input: SimulateTurboPropScatterInput): TurboScatterResult {
  const stepSeconds = input.stepSeconds ?? 1 / 60;
  const maxSteps = input.maxSteps ?? 240;
  const laneMarginGame = input.laneMarginGame ?? 0.008;
  const rng = createTurboPropRng((input.seed ^ 0x5f3759df) >>> 0);
  const byId = new Map(input.placements.map((prop) => [prop.id, prop]));
  const velocity = new Map<string, { vx: number; vz: number }>();
  const position = new Map<string, { x: number; y: number }>();
  for (const prop of input.placements) {
    position.set(prop.id, { x: prop.point.x, y: prop.point.y });
    velocity.set(prop.id, { vx: 0, vz: 0 });
  }
  for (const impact of input.impacts) {
    const prop = byId.get(impact.id);
    if (!prop || !velocity.has(impact.id)) continue;
    const length = Math.hypot(impact.dx, impact.dz) || 1;
    // Cosmetic kick: impulse scaled to be visible on a light body regardless of mass.
    const kick = (impact.strength * 40) / Math.max(1, prop.massKg) + 0.35;
    const current = velocity.get(impact.id)!;
    velocity.set(impact.id, {
      vx: current.vx + (impact.dx / length) * kick,
      vz: current.vz + (impact.dz / length) * kick
    });
  }
  const FRICTION_DECEL = 2.6;
  const REST_SPEED = 0.02;
  const restFrames = new Map<string, number>();
  const projected = new Set<string>();
  let frame = 0;
  let stillMoving = true;
  while (stillMoving && frame < maxSteps) {
    frame += 1;
    stillMoving = false;
    for (const prop of input.placements) {
      if (restFrames.has(prop.id)) continue;
      const vel = velocity.get(prop.id)!;
      const pos = position.get(prop.id)!;
      const speed = Math.hypot(vel.vx, vel.vz);
      if (speed <= REST_SPEED) {
        restFrames.set(prop.id, frame);
        continue;
      }
      stillMoving = true;
      const decel = Math.min(speed, FRICTION_DECEL * stepSeconds);
      const nx = vel.vx / speed;
      const nz = vel.vz / speed;
      const nextSpeed = speed - decel;
      // Seeded wobble: tiny heading noise keeps different seeds distinguishable.
      const wobble = (rng() - 0.5) * 0.04;
      const wx = nx * Math.cos(wobble) - nz * Math.sin(wobble);
      const wz = nx * Math.sin(wobble) + nz * Math.cos(wobble);
      velocity.set(prop.id, { vx: wx * nextSpeed, vz: wz * nextSpeed });
      position.set(prop.id, {
        x: pos.x + wx * nextSpeed * stepSeconds,
        y: pos.y + wz * nextSpeed * stepSeconds
      });
    }
  }
  const points: TurboScatterResultPoint[] = input.placements.map((prop) => {
    const raw = position.get(prop.id)!;
    let x = raw.x;
    let y = raw.y;
    let wasProjected = false;
    // Effective lateral offset after drift, measured along the anchor's left
    // vector - the same geometry the runtime clamp uses against the live query.
    let effectiveAbsOffset: number;
    if (input.sampleAt) {
      const anchorSample = input.sampleAt(prop.progress);
      const leftX = Math.sin(anchorSample.heading);
      const leftZ = -Math.cos(anchorSample.heading);
      effectiveAbsOffset = Math.abs((x - anchorSample.x) * leftX + (y - anchorSample.y) * leftZ);
    } else {
      effectiveAbsOffset = Math.abs(prop.signedOffsetGame) - Math.hypot(x - prop.point.x, y - prop.point.y);
    }
    const minAbsOffset = input.visualAsphaltHalfWidthGame + laneMarginGame + prop.radiusGame;
    if (effectiveAbsOffset < minAbsOffset) {
      // Project straight back out along the outward side direction.
      const inward = Math.sign(prop.signedOffsetGame) || 1;
      if (input.sampleAt) {
        const anchorSample = input.sampleAt(prop.progress);
        const leftX = Math.sin(anchorSample.heading);
        const leftZ = -Math.cos(anchorSample.heading);
        const correction = minAbsOffset - effectiveAbsOffset;
        x += inward * leftX * correction;
        y += inward * leftZ * correction;
      } else {
        x += inward * (minAbsOffset - effectiveAbsOffset);
      }
      wasProjected = true;
    }
    return {
      id: prop.id,
      x: Number(x.toFixed(SCATTER_QUANT)),
      y: Number(y.toFixed(SCATTER_QUANT)),
      settledFrame: restFrames.get(prop.id) ?? maxSteps,
      projectedBackToVerge: wasProjected
    };
  });
  return {
    points,
    seed: input.seed,
    steps: frame,
    allRestingOutsideCorridor: points.every((point) => {
      const prop = byId.get(point.id)!;
      let effectiveAbsOffset: number;
      if (input.sampleAt) {
        const anchorSample = input.sampleAt(prop.progress);
        const leftX = Math.sin(anchorSample.heading);
        const leftZ = -Math.cos(anchorSample.heading);
        effectiveAbsOffset = Math.abs((point.x - anchorSample.x) * leftX + (point.y - anchorSample.y) * leftZ) - prop.radiusGame;
      } else {
        const drift = Math.hypot(point.x - prop.point.x, point.y - prop.point.y);
        effectiveAbsOffset = Math.abs(prop.signedOffsetGame) - drift;
      }
      return effectiveAbsOffset >= input.visualAsphaltHalfWidthGame + laneMarginGame - 1e-9;
    })
  };
}

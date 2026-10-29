// Pip's Big Leap — per-world motion tuning.
//
// `solvePlatformerMotion` derives gravity/jump/move-speed from a level's own
// platform geometry (apex sized to the tallest step, reach to the widest gap)
// and `validatePlatformerMotion` reports whether the resulting tuning is
// consistent with the course. Each world projects its 3D course onto the
// traversal axis to feed the solver, so its jump feel is *derived* — and the
// report lands in the evidence global per world.

import { solvePlatformerMotion, validatePlatformerMotion } from "@aura3d/engine";

// Motion types aren't named on the public surface — derive structurally.
export type PlatformerPlatformLike = Parameters<typeof solvePlatformerMotion>[0][number];
export type PlatformerMotionReport = ReturnType<typeof validatePlatformerMotion>;
import type { PlatSpec, WorldSpec, WorldTuning } from "./types";

export interface WorldMotion {
  readonly tuning: WorldTuning;
  readonly report: PlatformerMotionReport;
  /** Rises bridged by a spring launch, judged against the spring apex. */
  readonly springEdges: readonly SpringEdge[];
  readonly facts: {
    readonly platformCount: number;
    readonly maxRise: number;
    readonly maxGap: number;
  };
}

/** Horizontal edge-to-edge gap between two platforms (XZ AABB distance). */
function xzGap(a: PlatSpec, b: PlatSpec): number {
  const dx = Math.max(0, Math.abs(b.x - a.x) - (a.w + b.w) / 2);
  const dz = Math.max(0, Math.abs(b.z - a.z) - (a.d + b.d) / 2);
  return Math.hypot(dx, dz);
}

/**
 * Project a 3D course onto the solver's 1D traversal axis (solver input).
 *
 * Kept exactly as shipped: the solver output is clamped per world below, and
 * the clamped values are the tuned feel every course was built and played
 * against. Changing this projection would retune all seven worlds.
 */
function traversalFacts(world: WorldSpec): PlatformerPlatformLike[] {
  const walkable = world.platforms.filter((p) => !p.ghost);
  if (walkable.length === 0) return [];
  const facts: PlatformerPlatformLike[] = [];
  let cursor = 0;
  for (let i = 0; i < walkable.length; i += 1) {
    const p = walkable[i];
    if (i > 0) {
      const prev = walkable[i - 1];
      const gap = xzGap(prev, p);
      const extentPrev = Math.abs(p.z - prev.z) >= Math.abs(p.x - prev.x) ? prev.d : prev.w;
      const extentCur = Math.abs(p.z - prev.z) >= Math.abs(p.x - prev.x) ? p.d : p.w;
      cursor += extentPrev / 2 + Math.max(0.15, gap) + extentCur / 2;
    }
    facts.push({ id: p.id, x: cursor, y: p.y, width: Math.min(p.w, p.d) });
  }
  return facts;
}

/** True when a spring sits on platform `p` (its launch, not a jump, bridges the next rise). */
function hasSpring(world: WorldSpec, p: PlatSpec): boolean {
  return world.springs.some((s) => Math.abs(s.x - p.x) <= p.w / 2 && Math.abs(s.z - p.z) <= p.d / 2 && Math.abs(s.y - p.y) < 0.5);
}

/** Horizontal movers close the gap by their amplitude at their nearest point. */
function moverReach(p: PlatSpec): number {
  return p.mover && p.mover.axis !== "y" ? p.mover.amplitude : 0;
}

/** A swim pocket under the straight line between two platforms bridges that gap by swimming. */
function swimBridged(world: WorldSpec, a: PlatSpec, b: PlatSpec): boolean {
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  return world.waters.some((w) => Math.abs(mx - w.x) <= w.w / 2 + 0.5 && Math.abs(mz - w.z) <= w.d / 2 + 0.5);
}

export interface SpringEdge {
  readonly from: string;
  readonly to: string;
  readonly rise: number;
  readonly springApex: number;
  readonly passes: boolean;
}

/**
 * Validation input. `measurePlatformerGeometry` reads `x` as a platform's
 * left edge and `width` as its length along the course, so each platform is
 * laid out edge to edge with the real XZ gap between them (the solver
 * projection above stores centres and the narrow side, which inflated every
 * gap by up to half a platform). Gaps to and from a horizontal mover use its
 * nearest reach, and a rise that a spring launches Pip over is taken out of
 * the jump check (it is checked against the spring apex instead). A gap
 * over a swim pocket is swum, not jumped.
 */
export function validationFacts(world: WorldSpec, springVelocity: number, gravity: number): { readonly facts: PlatformerPlatformLike[]; readonly springEdges: SpringEdge[] } {
  const walkable = world.platforms.filter((p) => !p.ghost);
  const facts: PlatformerPlatformLike[] = [];
  const springEdges: SpringEdge[] = [];
  let left = 0;
  let yOffset = 0;
  for (let i = 0; i < walkable.length; i += 1) {
    const p = walkable[i];
    let extentCur = p.d;
    if (i > 0) {
      const prev = walkable[i - 1];
      const alongZ = Math.abs(p.z - prev.z) >= Math.abs(p.x - prev.x);
      extentCur = alongZ ? p.d : p.w;
      const gap = swimBridged(world, prev, p) ? 0.15 : Math.max(0, xzGap(prev, p) - moverReach(prev) - moverReach(p));
      const rise = p.y - prev.y;
      if (rise > 0 && hasSpring(world, prev)) {
        const power = world.springs.find((s) => Math.abs(s.x - prev.x) <= prev.w / 2 && Math.abs(s.z - prev.z) <= prev.d / 2)?.power ?? springVelocity;
        const springApex = (power * power) / (2 * Math.abs(gravity));
        springEdges.push({ from: prev.id, to: p.id, rise: Number(rise.toFixed(3)), springApex: Number(springApex.toFixed(3)), passes: springApex >= rise * 1.15 });
        yOffset -= rise;
      }
      const prevFact = facts[facts.length - 1];
      left = prevFact.x + prevFact.width + gap;
    }
    facts.push({ id: p.id, x: left, y: p.y + yOffset, width: extentCur });
  }
  return { facts, springEdges };
}

/** Second jump launches at 0.92x the first (player.ts), so its apex adds 0.92^2 of the first. */
const DOUBLE_JUMP_APEX_GAIN = 1 + 0.92 * 0.92;
/** Engine defaults in `validatePlatformerMotion`. */
const MIN_APEX_TO_RISE = 1.15;

/**
 * Where this game's validation limits differ from the engine defaults, and why.
 * The engine validator models one jump; these say what else the course allows.
 *
 * - From World 2 on Pip owns the double jump (granted in World 2 and carried
 *   forward), so a step only has to clear 1.15x against the double-jump apex.
 * - Starfall (w6) floats on purpose: its gravity is clamped to -18 for the
 *   "float farther, land softer" world, so the apex is 5x the hero. The
 *   floaty ceiling is raised for that world only.
 * - Academy and World 1 keep the shipped 13.4 m/s jump cap (apex 2.8 m, about
 *   3x the 0.95 m hero): the opening worlds are tuned to be forgiving, and the
 *   cap was not retuned without a real-GPU play pass. Their floaty ceiling is
 *   raised to 3.0x, just above the measured 2.95x.
 */
export function motionAllowances(world: WorldSpec): { minApexToRiseRatio?: number; maxApexToRiseRatio?: number } {
  const out: { minApexToRiseRatio?: number; maxApexToRiseRatio?: number } = {};
  if (world.order >= 2) out.minApexToRiseRatio = Number((MIN_APEX_TO_RISE / DOUBLE_JUMP_APEX_GAIN).toFixed(3));
  if (world.id === "w6") out.maxApexToRiseRatio = 5.5;
  if (world.id === "academy" || world.id === "w1") out.maxApexToRiseRatio = 3.0;
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function deriveWorldMotion(world: WorldSpec): WorldMotion {
  const facts = traversalFacts(world);
  const gravityScale = world.gravityScale ?? 1;
  const heroHeight = 0.95;

  // Derived intent: apex ≈ 1.55 character heights (Starfall floats higher).
  const jumpHeight = (world.id === "w6" ? 2.05 : 1.5) * heroHeight;
  const solution = solvePlatformerMotion(facts, {
    feel: "responsive",
    characterHeight: heroHeight,
    jumpHeight,
    strict: false,
    runSpeedPerHeight: world.id === "w6" ? 4.4 : 5.4
  });

  const gravity = clamp(solution.gravity * gravityScale, world.id === "w6" ? -18 : -32, -14);
  const jumpVelocity = clamp(solution.jumpVelocity * (world.id === "w6" ? 1.04 : 1), 9.6, 13.4);
  const moveSpeed = clamp(world.moveSpeed ?? solution.moveSpeed, 4.4, 6.2);
  const springVelocityFor = Math.max(9.5, jumpVelocity * 1.32);
  const validation = validationFacts(world, springVelocityFor, gravity);
  const report = validatePlatformerMotion(
    validation.facts,
    { gravity, jumpVelocity, moveSpeed },
    {
      characterHeight: heroHeight,
      maxAirtimeSeconds: world.id === "w6" ? 1.7 : 1.1,
      ...motionAllowances(world)
    }
  );

  const tuning: WorldTuning = {
    gravity,
    jumpVelocity,
    moveSpeed,
    airControl: world.airControl ?? 0.72,
    coyoteMs: clamp(solution.coyoteMs, 95, 150),
    jumpBufferMs: clamp(solution.jumpBufferMs, 115, 165),
    terminalVelocity: Math.min(Math.abs(solution.terminalVelocity), world.id === "w6" ? 11 : 16),
    fallGravityMultiplier: solution.fallGravityMultiplier,
    apexHangGravityScale: clamp(solution.apexGravityMultiplier, 0.4, 0.75),
    apexHangThreshold: solution.apexHangThreshold,
    releaseVelocityScale: solution.releaseVelocityScale,
    // Moveset constants tuned around the derived jump arc.
    diveSpeed: moveSpeed * 1.55,
    diveVy: -2.2,
    poundSpeed: 17,
    glideFallSpeed: Math.max(1.05, jumpVelocity * 0.115),
    springVelocity: Math.max(9.5, jumpVelocity * 1.32),
    swimGravity: gravity * 0.16,
    swimTerminal: 1.5,
    swimStrokeVelocity: jumpVelocity * 0.42,
    swimMoveSpeed: moveSpeed * 0.42,
    // Hurt hop: the horizontal shove scales with run speed, and the upward
    // pop scales with gravity so the hop lasts the same ~0.28 s in every
    // world (World 1 keeps its shipped 5.4 / 4.4; Starfall no longer floats).
    knockback: { h: moveSpeed * 1.02, v: Math.abs(gravity) * 0.1375 },
    stepUpHeight: 0.46
  };

  return {
    tuning,
    report,
    springEdges: validation.springEdges,
    facts: {
      platformCount: facts.length,
      maxRise: report.geometry.maxRise,
      maxGap: report.geometry.maxGap
    }
  };
}

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

/** Project a 3D course onto the solver's 1D traversal axis. */
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

  const gravity = solution.gravity * gravityScale;
  const jumpVelocity = solution.jumpVelocity * (world.id === "w6" ? 1.04 : 1);
  const moveSpeed = clamp(world.moveSpeed ?? solution.moveSpeed, 4.4, 6.2);
  const report = validatePlatformerMotion(
    facts,
    { gravity, jumpVelocity, moveSpeed },
    { characterHeight: heroHeight, maxAirtimeSeconds: world.id === "w6" ? 1.7 : 1.1 }
  );

  const tuning: WorldTuning = {
    gravity,
    jumpVelocity,
    moveSpeed,
    airControl: world.airControl ?? 0.72,
    coyoteMs: clamp(solution.coyoteMs, 95, 150),
    jumpBufferMs: clamp(solution.jumpBufferMs, 115, 165),
    terminalVelocity: Math.min(solution.terminalVelocity, world.id === "w6" ? 11 : 16),
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
    knockback: { h: moveSpeed * 0.85, v: jumpVelocity * 0.62 },
    stepUpHeight: 0.46
  };

  return {
    tuning,
    report,
    facts: {
      platformCount: facts.length,
      maxRise: report.geometry.maxRise,
      maxGap: report.geometry.maxGap
    }
  };
}

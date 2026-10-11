/**
 * PRD-08 §16 acceptance checks shared by the browser specs (Playwright
 * `expect`) and the headless unit mirror (vitest `expect`): one definition of
 * every S-row threshold, applied to the JSON a harness scenario returns.
 * Thresholds are the PRD's; nothing here is loosened per runner.
 */
import type { chaseFraming, driftScript, orbitWall, railLap } from "./harness/scenarios-motion";
import type { feelAccounting, hitStopGlobal, hitStopScoped, shakeImpulse } from "./harness/scenarios-feel";

interface Matchers {
  toBe(v: unknown): void;
  toBeGreaterThan(v: number): void;
  toBeGreaterThanOrEqual(v: number): void;
  toBeLessThan(v: number): void;
  toBeLessThanOrEqual(v: number): void;
}
export type Expect = (actual: unknown, message?: string) => Matchers;

const DT = 1 / 60;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** S5 global: sim frozen for the stop ± 1 fixed step while frames present. */
export function checkHitStopGlobal(expect: Expect, r: ReturnType<typeof hitStopGlobal>, seconds: number) {
  expect(r.frames).toBe(30); // presentation never stopped
  const t0 = r.simTime[0]!;
  const frozen = r.simTime.filter((t) => Math.abs(t - t0) < 1e-9).length;
  const stopFrames = Math.ceil(seconds / DT);
  expect(frozen, "frozen frames").toBeGreaterThanOrEqual(stopFrames - 1);
  expect(frozen, "frozen frames").toBeLessThanOrEqual(stopFrames + 1);
  expect(r.simTime.at(-1)! - t0, "sim resumed").toBeGreaterThan(0.2);
}

/**
 * S5 scoped [a, b]: a and b frozen 0.07 s ± 1 step while the bystander
 * moves and camera shake carries energy on every frozen frame; both resume.
 */
export function checkHitStopScoped(expect: Expect, r: ReturnType<typeof hitStopScoped>, seconds: number) {
  const ia = r.nodeIds.indexOf("fighter-a");
  const ib = r.nodeIds.indexOf("fighter-b");
  const ic = r.nodeIds.indexOf("bystander");
  expect(Math.min(ia, ib, ic), "fixture ids").toBeGreaterThanOrEqual(0);
  let frozenFrames = 0;
  while (
    frozenFrames < r.displacement.length &&
    r.displacement[frozenFrames]![ia]! < 1e-9 &&
    r.displacement[frozenFrames]![ib]! < 1e-9
  ) {
    frozenFrames += 1;
  }
  const stopFrames = Math.ceil(seconds / DT);
  expect(frozenFrames, "a/b frozen frames").toBeGreaterThanOrEqual(stopFrames - 1);
  expect(frozenFrames, "a/b frozen frames").toBeLessThanOrEqual(stopFrames + 1);
  for (let k = 1; k < frozenFrames; k += 1) {
    expect(r.stepFromPrevious[k]![ic]!, `bystander moves on frozen frame ${k}`).toBeGreaterThan(1e-5);
  }
  for (let k = 0; k < frozenFrames; k += 1) {
    expect(r.layerEnergy[k]!, `shake energy on frozen frame ${k}`).toBeGreaterThan(0);
  }
  // Sim time itself kept running (scoped, not global).
  expect(r.simTime.at(-1)! - r.preSimTime, "sim time advanced").toBeGreaterThan(0.1);
  const last = r.stepFromPrevious.at(-1)!;
  expect(last[ia]!, "a resumed").toBeGreaterThan(1e-3);
  expect(last[ib]!, "b resumed").toBeGreaterThan(1e-3);
  expect(r.executed.hitStop ?? 0, "hitStop executed").toBeGreaterThanOrEqual(1);
  expect(r.executed.shake ?? 0, "shake executed").toBeGreaterThanOrEqual(1);
}

/** S5 control: without a hit-stop the actors keep moving every frame. */
export function checkNoHitStopMoves(expect: Expect, r: ReturnType<typeof hitStopScoped>) {
  for (let k = 1; k < r.stepFromPrevious.length; k += 1) {
    expect(r.stepFromPrevious[k]![0]!, `a moves on frame ${k}`).toBeGreaterThan(1e-3);
  }
}

/** S6: eye distance within 2 % of distance(v) after 1 s; NDC y within 3 % of frame height. */
export function checkChase(expect: Expect, r: ReturnType<typeof chaseFraming>) {
  const after = r.t.map((t, i) => [t, i] as const).filter(([t]) => t >= 1).map(([, i]) => i);
  expect(after.length, "frames after 1 s").toBeGreaterThan(10);
  for (const i of after) {
    expect(Math.abs(r.distance[i]! - r.expectedDistance) / r.expectedDistance, `distance err @${i}`).toBeLessThan(0.02);
  }
  const ys = after.map((i) => r.subjectNdcY[i]!);
  // NDC spans 2 units of frame height: 3 % of height = 0.06 NDC.
  expect(Math.max(...ys) - Math.min(...ys), "subject NDC y drift").toBeLessThan(0.06);
}

/** S6 control: legacy `smoothing 0.045` follow misses the distance assertion. */
export function checkChaseLegacyMisses(expect: Expect, r: ReturnType<typeof chaseFraming>) {
  const i = r.distance.length - 1;
  expect(Math.abs(r.distance[i]! - r.expectedDistance) / r.expectedDistance).toBeGreaterThan(0.02);
}

/** S7: presented VP yaw/pitch offset == trauma output within 1e-6 rad; peak; roll. */
export function checkShake(expect: Expect, r: ReturnType<typeof shakeImpulse>) {
  for (const f of r.frames) {
    expect(Math.abs(f.vpYaw - f.layerYaw), `yaw @${f.t}`).toBeLessThan(1e-6);
    expect(Math.abs(f.vpPitch - f.layerPitch), `pitch @${f.t}`).toBeLessThan(1e-6);
    expect(Math.abs(f.presentedRoll - f.layerRoll), `roll @${f.t}`).toBeLessThan(1e-9);
  }
  const early = r.frames.filter((f) => f.t <= 0.25);
  expect(Math.max(...early.map((f) => Math.abs(f.layerYaw))), "peak |yaw| in 0.25 s").toBeGreaterThanOrEqual(0.35 * r.maxYawRad);
  expect(Math.max(...r.frames.map((f) => Math.abs(f.presentedRoll))), "roll in pose.roll").toBeGreaterThan(0);
}

/** S8: eye never inside the wall with collision; control (off) enters it. */
export function checkOrbitWall(expect: Expect, on: ReturnType<typeof orbitWall>, off: ReturnType<typeof orbitWall>) {
  expect(on.insideFrames, "collision on: frames with eye inside wall").toBe(0);
  expect(off.insideFrames, "collision off control enters the wall").toBeGreaterThan(0);
  for (let i = 1; i < on.samples.length; i += 1) {
    const a = on.samples[i - 1]!;
    const b = on.samples[i]!;
    expect(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!), "orbit keeps sweeping").toBeGreaterThan(1e-3);
  }
}

/** S10: executed counts only channels with a real provider. */
export function checkFeelAccounting(expect: Expect, r: ReturnType<typeof feelAccounting>) {
  expect(r.emitted).toBe(1);
  expect(r.executed.shake ?? 0, "shake").toBeGreaterThan(0);
  expect(r.executed.punch ?? 0, "punch").toBeGreaterThan(0);
  expect(r.executed.hitStop ?? 0, "hitStop").toBeGreaterThan(0);
  expect(r.executed.haptics ?? 0, "haptics").toBe(r.hasVibrate ? 1 : 0);
  expect(r.executed.audio ?? 0, "audio (no sound bound)").toBe(0);
  expect(r.executed.screen ?? 0, "screen (no DOM fallback, no consumer)").toBe(0);
}

/** S11: speed variation ≤ 5 %; lap end within 1 % of rail length of lap start. */
export function checkRail(expect: Expect, r: ReturnType<typeof railLap>) {
  const m = mean(r.speeds);
  expect(m).toBeGreaterThan(0);
  expect(Math.max(...r.speeds.map((s) => Math.abs(s - m) / m)), "speed variation").toBeLessThanOrEqual(0.05);
  expect(r.lapGap, "seam gap").toBeLessThanOrEqual(0.01 * r.railLength);
}

/** S12 (bicycle): sustained drift ≥ 0.6 s, counter-steer settles < 0.05 rad in ≤ 1.5 s. */
export function checkDrift(expect: Expect, r: ReturnType<typeof driftScript>) {
  expect(r.topSpeed, "reached 15 u/s").toBeGreaterThanOrEqual(15);
  expect(r.sustainedFrames, "drift frames").toBeGreaterThanOrEqual(Math.round(0.6 / DT));
  expect(r.settledIn, "counter-steer settled").toBeGreaterThanOrEqual(0);
  expect(r.settledIn, "counter-steer settle time").toBeLessThanOrEqual(1.5);
  expect(r.maxMotionSlip, "presented motion shows the slip").toBeGreaterThan(0.2);
}

/** S12 control: `model: "unicycle"` never exceeds 0.01 rad of slip. */
export function checkDriftUnicycle(expect: Expect, r: ReturnType<typeof driftScript>) {
  expect(r.maxAbsSlip, "unicycle telemetry slip").toBeLessThanOrEqual(0.01);
  expect(r.maxMotionSlip, "unicycle motion slip").toBeLessThanOrEqual(0.01);
}

/* ------------------------------------------------------------------------ */
/* S19 / §17 per-tier lane budgets (tier-budgets.spec.ts + unit mirror).     */
/* ------------------------------------------------------------------------ */

export type Prd08Tier = "low" | "medium" | "high" | "ultra";
export const PRD08_TIERS: readonly Prd08Tier[] = ["low", "medium", "high", "ultra"];

export interface Prd08TierBudget {
  /** Lane GPU ms per presented frame (fade + screen-feel on minus off). */
  readonly gpuMs: number;
  /** Lane main-thread CPU ms per presented frame (median and p95 gated). */
  readonly cpuMs: number;
  readonly sphereCasts: number;
  /** Ultra's dedicated occluder query on top of the casts. */
  readonly occluderQueries: number;
  /** Low: fade feature off; screen-feel flash + vignette only. */
  readonly fade: boolean;
  readonly handles: number;
  readonly memoryBytes: number;
}

/** PRD-08 §17 table, verbatim. */
export const PRD08_TIER_BUDGETS: Readonly<Record<Prd08Tier, Prd08TierBudget>> = {
  low: { gpuMs: 0.1, cpuMs: 0.35, sphereCasts: 1, occluderQueries: 0, fade: false, handles: 300, memoryBytes: 64 * 1024 },
  medium: { gpuMs: 0.15, cpuMs: 0.45, sphereCasts: 2, occluderQueries: 0, fade: true, handles: 600, memoryBytes: 96 * 1024 },
  high: { gpuMs: 0.2, cpuMs: 0.55, sphereCasts: 3, occluderQueries: 0, fade: true, handles: 1000, memoryBytes: 128 * 1024 },
  ultra: { gpuMs: 0.25, cpuMs: 0.7, sphereCasts: 3, occluderQueries: 1, fade: true, handles: 2000, memoryBytes: 192 * 1024 }
};

/** Frames per CPU sample run and per GPU phase (on / off). */
export const PRD08_TIER_CPU_FRAMES = 600;
export const PRD08_TIER_GPU_FRAMES = 240;

/** Shape returned by the `tier-cpu` harness scenario (scenarios-tier.ts). */
export interface TierCpuResult {
  readonly tier: string;
  readonly qualityTier: string;
  readonly handles: number;
  readonly storeSize: number;
  readonly frames: number;
  readonly cpuMs: readonly number[];
  /** Per-frame probe stats read after the frame's full cast demand. */
  readonly casts: readonly { sphereCasts: number; occluderQueries: number; deniedCasts: number; deniedOccluderQueries: number }[];
  /** Attempts per frame: the tier cap + 1 sphere casts, + 1 occluder query. */
  readonly castDemand: number;
  readonly fadeTracked: number;
  /** Max |chroma| / |radialBlur| published by the tiered screen-feel uniforms. */
  readonly maxChroma: number;
  readonly maxRadialBlur: number;
  readonly maxFlash: number;
  /** Fade contributor pass-through on this tier (input array returned as-is). */
  readonly contributorPassThrough: boolean;
  readonly listenerCalls: number;
}

export const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export const percentile = (xs: readonly number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
};

/**
 * S19 headless-checkable part: tier forced, handle count populated, cast cap
 * held under over-demand, fade + screen-feel gated per tier, listener glue
 * ran once per frame.
 */
export function checkTierGating(expect: Expect, tier: Prd08Tier, r: TierCpuResult) {
  const b = PRD08_TIER_BUDGETS[tier];
  expect(r.qualityTier, "app.quality.set forced the tier").toBe(tier);
  expect(r.handles, "handles populated to the tier cap").toBe(b.handles);
  expect(r.storeSize, "interpolation store tracks every handle").toBe(b.handles);
  expect(r.casts.length, "cast stats per frame").toBe(r.frames);
  expect(r.castDemand, "demand exceeds the cap").toBeGreaterThan(b.sphereCasts);
  for (let i = 0; i < r.casts.length; i += 1) {
    const c = r.casts[i]!;
    expect(c.sphereCasts, `sphere casts @${i}`).toBe(b.sphereCasts);
    expect(c.occluderQueries, `occluder queries @${i}`).toBe(b.occluderQueries);
    expect(c.deniedCasts, `over-cap casts refused @${i}`).toBeGreaterThanOrEqual(1);
  }
  expect(r.listenerCalls, "listener glue once per frame").toBe(r.frames);
  expect(r.maxFlash, "flash published").toBeGreaterThan(0);
  if (b.fade) {
    expect(r.contributorPassThrough, "fade contributor active").toBe(false);
    expect(r.maxChroma, "chroma published above Low").toBeGreaterThan(0);
  } else {
    expect(r.fadeTracked, "Low: fade feature off").toBe(0);
    expect(r.contributorPassThrough, "Low: fade contributor passes through").toBe(true);
    expect(r.maxChroma, "Low: chroma gated").toBe(0);
    expect(r.maxRadialBlur, "Low: radial blur gated").toBe(0);
    for (const c of r.casts) expect(c.deniedOccluderQueries, "Low: occluder query denied").toBeGreaterThanOrEqual(1);
  }
}

/** S19 CPU: lane main-thread ms per presented frame, median and p95. */
export function checkTierCpu(expect: Expect, tier: Prd08Tier, r: TierCpuResult) {
  const b = PRD08_TIER_BUDGETS[tier];
  expect(r.cpuMs.length, "CPU samples").toBe(PRD08_TIER_CPU_FRAMES);
  expect(median(r.cpuMs), `${tier} CPU median ms`).toBeLessThanOrEqual(b.cpuMs);
  expect(percentile(r.cpuMs, 0.95), `${tier} CPU p95 ms`).toBeLessThanOrEqual(b.cpuMs);
}

/** S19 memory: lane retained-heap delta after forced GC. */
export function checkTierMemory(expect: Expect, tier: Prd08Tier, retainedBytes: number) {
  expect(Number.isFinite(retainedBytes), "retained heap measured").toBe(true);
  expect(retainedBytes, `${tier} lane retained heap bytes`).toBeLessThanOrEqual(PRD08_TIER_BUDGETS[tier].memoryBytes);
}

/** Shape returned by the `tier-gpu` harness scenario. */
export interface TierGpuResult {
  readonly tier: string;
  readonly frames: number;
  /** GPU ms per presented frame (TIME_ELAPSED over the whole tick). */
  readonly gpuMs: readonly number[];
  readonly disjoint: number;
  readonly fadedItems: number;
}

/** S19 GPU: lane delta (fade + screen-feel on minus off) within the tier budget. */
export function checkTierGpu(expect: Expect, tier: Prd08Tier, on: TierGpuResult, off: TierGpuResult) {
  const b = PRD08_TIER_BUDGETS[tier];
  expect(on.gpuMs.length, "GPU samples (on)").toBe(PRD08_TIER_GPU_FRAMES);
  expect(off.gpuMs.length, "GPU samples (off)").toBe(PRD08_TIER_GPU_FRAMES);
  expect(on.disjoint + off.disjoint, "no disjoint GPU timer frames").toBe(0);
  if (b.fade) expect(on.fadedItems, "fade stamped draws (feature on)").toBeGreaterThan(0);
  else expect(on.fadedItems, "Low: no faded draws").toBe(0);
  expect(median(on.gpuMs) - median(off.gpuMs), `${tier} lane GPU ms delta`).toBeLessThanOrEqual(b.gpuMs);
}

/** §17 net-frame: with maxSubSteps ≥ 2, per-presented-frame GPU drops vs one submission per substep. */
export function checkNetFrameGpu(expect: Expect, oneSubmission: TierGpuResult, perSubstep: TierGpuResult) {
  expect(oneSubmission.disjoint + perSubstep.disjoint, "no disjoint GPU timer frames").toBe(0);
  expect(median(oneSubmission.gpuMs), "net-frame GPU per presented frame").toBeLessThan(median(perSubstep.gpuMs));
}

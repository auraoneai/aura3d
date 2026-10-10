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

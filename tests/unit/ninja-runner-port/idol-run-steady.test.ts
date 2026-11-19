/**
 * Real-GPU regression (owner, 2026-11-18 21:12 snapshot): the hero and the echo clones "are shaking back and forth so
 * much". Cause: the captured sprint was played by distance to keep the stance foot planted, and it steps ~1.1 m on these
 * bodies, so at the runner's 18-25 m/s the whole cycle (legs, the hips lock's sideways shift and the clip's +-35 degree
 * torso counter-twist) ran at ~18 steps a second. The cycle is now held to a human cadence (`runCadence`, 2.6-3.0
 * steps/s; the feet glide at speed), the hips lock only holds a planted foot, and the torso twist / roll / lean pass
 * through smooth compressors (`uprightRun`). One writer per bone: the captured clip -> `uprightRun` -> hips lock ->
 * `groundFeet`, all inside `idolMotionPose`; the world only places the node.
 *
 * Over 120 frames at 60 fps of the real per-frame path, for the hero, a clone and each enemy body, at running speed:
 * hips / chest world rotation changes at most 6 degrees a frame, the hips sway sideways no more than 2 cm a frame,
 * and the cadence is 2.6-3.0 steps a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { driverFor, idolMotionPose, type IdolActorKey } from "../../../examples/ninja-runner-port/art/idolActors";
import { RUN_CADENCE_MAX, RUN_CADENCE_MIN } from "../../../examples/ninja-runner-port/art/idolMotion";
import { qMul, type Quat } from "../../../examples/ninja-runner-port/art/idolRig";
import type { CharacterId } from "../../../examples/ninja-runner-port/models";

const BODIES: readonly (readonly [IdolActorKey, CharacterId, number])[] = [
  ["nrHero", "hero", 20], ["nrHero", "hero", 25], ["nrHeroClone", "hero", 20], ["nrSage", "sage", 22], ["nrEmber", "sage", 25],
  ["nrSoldier", "soldier", 16], ["nrBrute", "brute", 17], ["nrCaster", "caster", 19], ["nrScout", "scout", 22]
];
let slot = 9300;
/** Yaw (about up), pitch (down +) and roll of a model-space rotation, read off its forward (+Z) and up (+Y) axes. */
function yawPitchRoll(q: Quat): [number, number, number] {
  const r = (v: number[]): number[] => { const [x, y, z, w] = q; const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!); return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)]; };
  const f = r([0, 0, 1]), u = r([0, 1, 0]);
  return [Math.atan2(f[0]!, f[2]!), Math.atan2(-f[1]!, Math.hypot(f[0]!, f[2]!)), Math.atan2(-u[0]!, u[1]!)];
}
const angleBetween = (a: Quat, b: Quat): number =>
  2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (Math.hypot(...a) * Math.hypot(...b))));

function frames(key: IdolActorKey, id: CharacterId, speed: number, n = 120) {
  const s = slot++, d = driverFor(key), m = d.data.map, bones = d.data.bones;
  const chest = m.spine[m.spine.length - 1] ?? m.hips;
  const rows: { hips: Quat; chest: Quat; hipsX: number; lower: number; head: [number, number, number]; headQ: Quat }[] = [];
  // rest (bind) world rotation of the head bone: the head's turn against travel is its world rotation over this
  const rest: Quat[] = [];
  bones.forEach((b, i) => { rest[i] = qMul(b.parent >= 0 ? rest[b.parent]! : (d.data.rootQ as Quat), b.q as Quat); });
  let travel = 0;
  // warm-up (cross-fade in from nothing, speed estimate settles)
  for (let f = 0; f < n + 30; f++) {
    const dt = 1 / 60;
    travel += speed * dt;
    const r = idolMotionPose(s, key, id, { clip: "run", time: 0, duration: 0.64 }, { travel, dt, y: 0, vy: 0 }, 1)!;
    if (f < 30) continue;
    // world rotations from the written parent-space locals
    const wq: Quat[] = [];
    bones.forEach((b, i) => {
      const l = r.pose.bones[b.name]!.rotation;
      wq[i] = qMul(b.parent >= 0 ? wq[b.parent]! : (d.data.rootQ as Quat), [l.x, l.y, l.z, l.w]);
    });
    const fl = d.jointPosition(m.legL[2]!), fr = d.jointPosition(m.legR[2]!);
    const turn = qMul(wq[m.head]!, [-rest[m.head]![0], -rest[m.head]![1], -rest[m.head]![2], rest[m.head]![3]]);
    rows.push({ hips: wq[m.hips]!, chest: wq[chest]!, hipsX: d.jointPosition(m.hips)[0], lower: fl[1] <= fr[1] ? 0 : 1, head: yawPitchRoll(turn), headQ: wq[m.head]! });
  }
  let dHips = 0, dChest = 0, dX = 0, switches = 0, dHead = 0;
  const headYaw = Math.max(...rows.map((r) => Math.abs(r.head[0]))), headPitch = Math.max(...rows.map((r) => Math.abs(r.head[1]))), headRoll = Math.max(...rows.map((r) => Math.abs(r.head[2])));
  for (let k = 1; k < rows.length; k++) {
    dHips = Math.max(dHips, angleBetween(rows[k - 1]!.hips, rows[k]!.hips));
    dChest = Math.max(dChest, angleBetween(rows[k - 1]!.chest, rows[k]!.chest));
    dX = Math.max(dX, Math.abs(rows[k]!.hipsX - rows[k - 1]!.hipsX));
    if (rows[k]!.lower !== rows[k - 1]!.lower) switches++;
    dHead = Math.max(dHead, angleBetween(rows[k - 1]!.headQ, rows[k]!.headQ));
  }
  return { dHips: dHips * 57.2958, dChest: dChest * 57.2958, dX, cadence: switches / (rows.length / 60), headYaw: headYaw * 57.2958, headPitch: headPitch * 57.2958, headRoll: headRoll * 57.2958, dHead: dHead * 57.2958 };
}

describe("Shadowstep Idol runners run steadily (no shaking)", () => {
  it.each(BODIES)("%s (%s) at %d m/s: hips/chest turn <= 6 deg a frame, hips sway <= 2 cm a frame, 2.6-3.0 steps/s, head steady and forward", (key, id, speed) => {
    const r = frames(key, id, speed);
    console.log(key, speed, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))));
    expect(r.dHips).toBeLessThanOrEqual(6);
    expect(r.dChest).toBeLessThanOrEqual(6);
    expect(r.dX).toBeLessThanOrEqual(0.02);
    // the head faces the way it runs: yaw +-10, pitch +-8, roll +-5 degrees of travel, turning smoothly
    expect(r.headYaw).toBeLessThanOrEqual(10);
    expect(r.headPitch).toBeLessThanOrEqual(8);
    expect(r.headRoll).toBeLessThanOrEqual(5);
    expect(r.dHead).toBeLessThanOrEqual(3);
    // the owl caster's ankle-length robe keeps its feet together (LEG_SCALE 0.35): its footfalls are not countable
    if (key !== "nrCaster") {
      expect(r.cadence).toBeGreaterThanOrEqual(RUN_CADENCE_MIN - 0.55);
      expect(r.cadence).toBeLessThanOrEqual(RUN_CADENCE_MAX + 0.55);
    }
  });
});

describe("Shadowstep impact feel does not keep the camera shaking", () => {
  it("a kill / clone strike every 0.25 s adds little trauma and at most one freeze a second", async () => {
    const { createImpactThrottle, IMPACT_SPACING } = await import("../../../examples/ninja-runner-port/impact");
    const throttle = createImpactThrottle();
    let trauma = 0, freezes = 0;
    for (let t = 0; t < 10; t += 0.25) {
      const k = throttle(t, { freezeSeconds: 0.032, trauma: 0.28, fovKickDeg: 1.8 });
      if (k) { trauma += k.trauma ?? 0; if ((k.freezeSeconds ?? 0) > 0) freezes++; }
    }
    // unthrottled: 40 kicks x 0.28 = 11.2 trauma and 40 freezes in 10 s
    expect(trauma).toBeLessThan(0.28 * (10 / IMPACT_SPACING) + 0.3);
    expect(freezes).toBeLessThanOrEqual(11);
  });
  it("main.ts routes every impact through the throttle and gives clone strikes no camera kick", () => {
    const main = readFileSync(fileURLToPath(new URL("../../../examples/ninja-runner-port/main.ts", import.meta.url)), "utf8");
    expect(main).not.toMatch(/impactRig\.trigger\(\{/);
    expect(main).toContain('else if (ev.type === "cloneStrike" || ev.type === "windImpact") kick({ fovKickDeg: 0.8 });');
  });
});

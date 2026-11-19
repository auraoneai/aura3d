/**
 * Idol mocap pass: Shadowstep's Idol actors play fal text-to-motion clips (motion.generated.ts) mapped from the sim's
 * game clip. Locomotion follows the distance covered (planted feet), the jump follows the sim's ballistic arc, scrubbed
 * attacks keep the sim's progress, every frame moves at real frame time, and the pose reaches the engine at a frozen clock.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTION_CLIPS } from "../../../apps/showcase-ninja-runner-port/src/motion.generated";
import { driverFor, idolMotionPose, type IdolActorKey } from "../../../examples/ninja-runner-port/art/idolActors";
import { motionClipFor } from "../../../examples/ninja-runner-port/art/idolMotion";
import type { CharacterId } from "../../../examples/ninja-runner-port/models";

let slotSeq = 900;
function walk(key: IdolActorKey, id: CharacterId, speed: number, clip = "run", dash = false) {
  const slot = slotSeq++, sc = 0.96, d = driverFor(key), m = d.data.map;
  let travel = 0;
  const used = new Set<string>();
  const feet: number[][][] = [[], []];
  for (let f = 0; f < 420; f++) {
    const dt = 1 / 60;
    travel += speed * dt;
    const r = idolMotionPose(slot, key, id, { clip, time: 0, duration: 1 }, { travel, dt, dash }, sc)!;
    used.add(r.clip);
    if (f < 60) continue;
    [m.legL[2]!, m.legR[2]!].forEach((b, k) => { const p = d.jointPosition(b); feet[k]!.push([p[0] * sc, p[1] * sc, p[2] * sc + travel]); });
  }
  // foot skate: while a foot is on the ground (within 4 cm of its lowest), how far it drifts across the ground
  let worst = 0, steps = 0, wx = 0, wz = 0;
  for (const track of feet) {
    const floor = Math.min(...track.map((p) => p[1]!));
    let start: number[] | null = null;
    for (const p of track) {
      if (p[1]! < floor + 0.04) { if (!start) { start = p; steps++; } else { worst = Math.max(worst, Math.hypot(p[0]! - start[0]!, p[2]! - start[2]!)); wx = Math.max(wx, Math.abs(p[0]! - start[0]!)); wz = Math.max(wz, Math.abs(p[2]! - start[2]!)); } }
      else start = null;
    }
  }
  return { worst, steps, used: [...used], wx, wz };
}

describe("Shadowstep Idol captured motion", () => {
  it("ships the captured clips the coordinator listed", () => {
    for (const k of ["Run", "Dash", "Jump", "Slide", "Slash", "Throw", "Jab", "Smash", "Cast", "Hit", "Death", "Idle", "Guard"]) expect(MOTION_CLIPS[k as keyof typeof MOTION_CLIPS], k).toBeTruthy();
    expect(motionClipFor("brute", "punch")).toBe("Smash");
    expect(motionClipFor("hero", "punch")).toBe("Slash");
    expect(motionClipFor("caster", "cast")).toBe("Cast");
    expect(motionClipFor("hero", "run", true)).toBe("Run");
  });

  // Under the run cadence cap (2.6-3.0 steps/s x the body's ~0.85 m step, about 2.2 m/s) the stance foot stays planted.
  // Faster, the cycle is held to that cadence and the feet glide (idol-run-steady.test.ts): planting a 0.85 m step at the
  // hero's 20-25 m/s meant ~18 steps a second, the owner's "shaking".
  it.each([["nrHero", "hero", 1.8], ["nrSoldier", "soldier", 1.8], ["nrBrute", "brute", 1.8]] as const)("%s running at %d m/s keeps its planted foot", (key, id, speed) => {
    const r = walk(key, id, speed);
    console.log(key, speed, r);
    expect(r.steps).toBeGreaterThan(3);
    expect(r.worst).toBeLessThan(0.05);
  });

  it("every frame moves at real frame time, and the jump follows the sim arc", () => {
    const slot = slotSeq++, d = driverFor("nrHero"), m = d.data.map;
    const seen = new Set<string>();
    for (let f = 0; f < 20; f++) seen.add(JSON.stringify(idolMotionPose(slot, "nrHero", "hero", { clip: "idle", time: 0, duration: 1.6 }, { travel: 0, dt: 1 / 60 }, 1)!.pose.bones));
    expect(seen.size).toBeGreaterThan(15);
    // jump: knees come up toward the apex (vy -> 0) relative to take-off
    const jslot = slotSeq++;
    const kneeLift = (y: number, vy: number) => {
      for (let k = 0; k < 20; k++) idolMotionPose(jslot, "nrHero", "hero", { clip: "jump", time: 0, duration: 0.9 }, { travel: 0, dt: 1 / 60, y, vy }, 1);
      return d.jointPosition(m.legL[1]!)[1] - d.jointPosition(m.hips)[1];
    };
    const early = kneeLift(0.2, 9.9), apex = kneeLift(2.16, 0);
    expect(apex).toBeGreaterThan(early);
  });

  it("world.ts hands each actor its distance, frame time, height and dash state", () => {
    const src = readFileSync("examples/ninja-runner-port/world.ts", "utf8");
    expect(src).toContain("{ travel: entity.s, dt, y: entity.y, vy: anim.vy, dash: anim.dash }");
  });
});

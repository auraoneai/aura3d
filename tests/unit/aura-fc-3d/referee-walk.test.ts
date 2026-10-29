import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFcScene, REFEREE_TARGET_HEIGHT } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { CLIP_SECONDS, STANCE_SPEED_MODEL, refereePatrol } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { assets } from "../../../apps/showcase-aura-fc-3d/src/aura-assets-v2";

/**
 * Wave-2 handoff from e4: model() never read an `animation` option, so the athletes' `animation: { clip: "Ready" }`
 * and the referee's `animation: { clip: "Walk" }` did nothing (the referee slid along the touchline in its bind pose).
 * The keys are gone; the referee declares Walk_Loop with .animate() and tickWorld phase-locks it to the patrol.
 */
function flat() {
  const j = JSON.parse(JSON.stringify(buildFcScene("munich")));
  const out: any[] = [];
  const walk = (n: any) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  (j.nodes as any[]).forEach(walk);
  return out;
}

const scale = REFEREE_TARGET_HEIGHT / assets.fcSoccerStrikerMeshy.bounds[1];

describe("aura-fc-3d model() options carry no ignored animation key", () => {
  it("rig.ts and scene.ts pass no `animation:` inside model(...) options", () => {
    for (const file of ["apps/showcase-aura-fc-3d/src/game/rig.ts", "apps/showcase-aura-fc-3d/src/game/scene.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/^\s*animation:\s*\{/m);
    }
  });

  it("the referee node carries a looping Walk_Loop animation spec", () => {
    const ref = flat().find((n) => n.name === "fc-referee");
    expect(ref?.kind).toBe("model");
    expect(ref?.animation).toMatchObject({ clip: "Walk_Loop", loop: true });
  });
});

describe("referee patrol walks at walking pace with planted feet", () => {
  it("peak ground speed is within 5% of Walk_Loop at playback rate 1", () => {
    const walk = STANCE_SPEED_MODEL.Walk_Loop! * scale;
    let peak = 0;
    for (let t = 0; t < 60; t += 0.01) peak = Math.max(peak, Math.abs(refereePatrol(t + 0.01, scale).x - refereePatrol(t, scale).x) / 0.01);
    expect(Math.abs(peak / walk - 1)).toBeLessThan(0.05);
  });

  it("clip phase advances exactly with distance walked (no foot slide), through both turnarounds", () => {
    const d = CLIP_SECONDS.Walk_Loop!;
    const stance = STANCE_SPEED_MODEL.Walk_Loop! * scale;
    const dt = 0.02;
    for (let t = 0; t < 40; t += dt) {
      const a = refereePatrol(t, scale), b = refereePatrol(t + dt, scale);
      const moved = Math.abs(b.x - a.x);
      let dPhase = b.phase - a.phase;
      if (dPhase < -d / 2) dPhase += d;
      expect(dPhase * stance).toBeCloseTo(moved, 4);
      expect(b.phase).toBeGreaterThanOrEqual(0);
      expect(b.phase).toBeLessThan(d);
    }
  });

  it("faces the direction of travel", () => {
    for (const t of [1, 5, 9, 20, 30]) {
      const a = refereePatrol(t, scale), b = refereePatrol(t + 0.05, scale);
      expect(Math.sign(b.x - a.x)).toBe(Math.sign(Math.sin(a.yaw)));
    }
  });
});

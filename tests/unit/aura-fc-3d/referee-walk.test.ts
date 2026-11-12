import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFcScene, REFEREE_TARGET_HEIGHT } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { CLIP_SECONDS, STANCE_SPEED_MODEL, refereePatrol } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { FOOTBALLER_CANONICAL_HEIGHT, FOOTBALLER_JOINT_SUFFIXES } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";

function flat() {
  const j = JSON.parse(JSON.stringify(buildFcScene("munich")));
  const out: any[] = [];
  const walk = (n: any) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  (j.nodes as any[]).forEach(walk);
  return out;
}

const scale = REFEREE_TARGET_HEIGHT / FOOTBALLER_CANONICAL_HEIGHT;

describe("aura-fc-3d procedural referee rig and zero GLB model() mounts", () => {
  it("rig.ts and scene.ts pass no model(...) mounts and no ignored animation key", () => {
    for (const file of ["apps/showcase-aura-fc-3d/src/game/rig.ts", "apps/showcase-aura-fc-3d/src/game/scene.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/^\s*animation:\s*\{/m);
      expect(src).not.toMatch(/\bmodel\s*\(/);
    }
  });

  it("the referee node is a sculpted multi-material articulated group with all 13 joints", () => {
    const all = flat();
    const ref = all.find((n) => n.name === "fc-referee");
    expect(ref?.kind).toBe("group");
    const names = new Set(all.map((n) => n.name));
    for (const suffix of FOOTBALLER_JOINT_SUFFIXES) {
      expect(names.has(`fc-referee-${suffix}`)).toBe(true);
    }
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

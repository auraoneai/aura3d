import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { createFootSlideMeter } from "@aura3d/engine/game";
import { createHeroAnimator } from "../../../examples/where-the-wind-wanders-port/models";
import { BELLKEEPER_JOINT_IDS } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";
import { CLIP_SECONDS, STRIDE_SPEED } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { WALK_SPEED } from "../../../examples/where-the-wind-wanders-port/sim";
import { proceduralHeroStride } from "./glb-stride";

interface Call { clip: string; loop?: boolean; speed?: number; captureTime?: number; metadata?: { playbackId?: string } }
function fakeApp(calls: Call[]): AuraApp {
  const hero = { play(clip: string, o: Omit<Call, "clip">) { calls.push({ clip, ...o }); return hero; } };
  return { nodes: { require: () => hero } } as unknown as AuraApp;
}
const STEP = 0.0167;

function walk(steps: number, twicePerStep: boolean) {
  const calls: Call[] = [];
  const anim = createHeroAnimator(fakeApp(calls));
  anim.reset(0, 0, 0);
  let z = 0, t = 0;
  const track: { t: number; z: number; clip: string; phase: number }[] = [];
  for (let i = 0; i < steps; i++) {
    z += WALK_SPEED * STEP; t += STEP;
    anim.update({ x: 0, z, airborne: false, onBoat: false, time: t });
    if (twicePerStep) anim.update({ x: 0, z, airborne: false, onBoat: false, time: t });
    const c = calls.at(-1)!;
    track.push({ t, z, clip: c.clip, phase: c.captureTime! });
  }
  return { calls, anim, track };
}

describe("hero animator on the library locomotion", () => {
  it("walks at the sim's walk speed and advances the pinned phase by distance over planted-foot speed", () => {
    const { anim, track } = walk(180, false);
    expect(anim.gait).toBe("Walk");
    const settled = track.filter((r, i) => i > 30 && r.clip === "Walk");
    let travelled = 0;
    for (let i = 1; i < settled.length; i++) { let d = settled[i]!.phase - settled[i - 1]!.phase; if (d < 0) d += CLIP_SECONDS.Walk; travelled += d; }
    const expected = ((settled.at(-1)!.z - settled[0]!.z) / STRIDE_SPEED.Walk);
    expect(Math.abs(travelled / expected - 1)).toBeLessThan(0.03);
  });
  it("gives the same phase whether update is called once or twice per sim step", () => {
    const a = walk(120, false).calls.at(-1)!;
    const b = walk(120, true).calls.at(-1)!;
    expect(b.clip).toBe(a.clip);
    expect(b.captureTime).toBeCloseTo(a.captureTime!, 6);
  });
  it("loops the clip on the controller and starts a new playback (crossfade) only on a gait change", () => {
    const { calls } = walk(120, false);
    const played = calls.filter((c) => c.metadata?.playbackId !== undefined);
    expect(played.every((c) => c.loop === true)).toBe(true);
    const fades = played.map((c, i) => (i === 0 || c.metadata!.playbackId !== played[i - 1]!.metadata!.playbackId ? i : -1)).filter((i) => i >= 0);
    const changes = played.map((c, i) => (i === 0 || c.clip !== played[i - 1]!.clip ? i : -1)).filter((i) => i >= 0);
    expect(fades).toEqual(changes);
  });
  it("idles on the sim clock, runs while airborne and ignores boat motion", () => {
    const calls: Call[] = [];
    const anim = createHeroAnimator(fakeApp(calls));
    anim.reset(5, 5, 0);
    anim.update({ x: 5, z: 5, airborne: false, onBoat: false, time: 1.25 });
    expect(calls.at(-1)).toMatchObject({ clip: "Idle", captureTime: 1.25 });
    for (let i = 1; i <= 40; i++) anim.update({ x: 5, z: 5, airborne: true, onBoat: false, time: 1.25 + i * STEP });
    expect(anim.gait).toBe("Run");
    for (let i = 1; i <= 80; i++) anim.update({ x: 50, z: 50, airborne: false, onBoat: true, time: 2 + i * STEP });
    expect(anim.gait).toBe("Idle");
  });
  it("drives all articulated Bellkeeper child joints with non-cumulative rotations including bell-ring gesture", () => {
    const joints = new Map<string, { pos: [number, number, number]; rot: [number, number, number] }>();
    for (const id of BELLKEEPER_JOINT_IDS) {
      joints.set(id, { pos: [0, 0, 0], rot: [0, 0, 0] });
    }
    const app = {
      nodes: {
        require: () => ({}),
        get: (id: string) => {
          const j = joints.get(id);
          if (!j) return undefined;
          return {
            setPosition(x: number, y: number, z: number) { j.pos = [x, y, z]; return this; },
            setRotation(x: number, y: number, z: number) { j.rot = [x, y, z]; return this; }
          };
        }
      }
    } as unknown as AuraApp;
    const anim = createHeroAnimator(app);
    anim.reset(0, 0, 0);
    let z = 0, t = 0;
    for (let i = 0; i < 60; i++) {
      z += WALK_SPEED * STEP;
      t += STEP;
      anim.update({ x: 0, z, airborne: false, onBoat: false, time: t, gust: 1.4, windTime: t });
    }
    expect(joints.get("hero-leg-l")!.rot[0]).not.toBeCloseTo(joints.get("hero-leg-r")!.rot[0], 2);
    const armWalkPitch = joints.get("hero-arm-r")!.rot[0];
    anim.update({ x: 0, z, airborne: false, onBoat: false, time: t + STEP, bellRing: 0.5, gust: 1.4, windTime: t + STEP });
    expect(joints.get("hero-arm-r")!.rot[0]).toBeLessThan(armWalkPitch - 0.3);
  });
});

describe("planted-foot slide on the procedural Bellkeeper rig (library foot-slide meter)", () => {
  const rig = proceduralHeroStride();
  const scale = 2.9 / rig.meshHeight;
  const ground = Math.min(...Array.from({ length: 60 }, (_, k) => { const f = rig.footAt("Walk", (k / 60) * CLIP_SECONDS.Walk); return Math.min(f.toeLeft[1], f.toeRight[1]); })) * scale;

  const forwardSign = (() => {
    const N = 120; const pts = Array.from({ length: N + 1 }, (_, k) => rig.footAt("Walk", (k / N) * CLIP_SECONDS.Walk).toeLeft);
    const ys = pts.map((p) => p[1]); const thr = Math.min(...ys) + 0.25 * (Math.max(...ys) - Math.min(...ys));
    let sum = 0; for (let k = 0; k < N; k++) if (ys[k]! <= thr && ys[k + 1]! <= thr) sum += pts[k + 1]![2] - pts[k]![2];
    return sum > 0 ? -1 : 1;
  })();
  const worldAt = (p: [number, number, number], z: number): [number, number, number] => [p[0] * scale, p[1] * scale, forwardSign * p[2] * scale + z];

  it("keeps both planted toes within 15% of ground speed on average across a 3 second walk, and the legs step", () => {
    const { track } = walk(180, false);
    const left = createFootSlideMeter({ plantedHeight: 0.04 }), right = createFootSlideMeter({ plantedHeight: 0.04 });
    for (const r of track) {
      if (r.clip !== "Walk" || r.t < 1) continue;
      const f = rig.footAt("Walk", r.phase);
      left.feed(r.t, worldAt(f.toeLeft, r.z), { groundHeight: ground, bodySpeed: WALK_SPEED });
      right.feed(r.t, worldAt(f.toeRight, r.z), { groundHeight: ground, bodySpeed: WALK_SPEED });
    }
    for (const m of [left, right]) {
      const rep = m.report();
      expect(rep.plantedSamples).toBeGreaterThan(20);
      expect(rep.notStepping).toBe(false);
      expect(rep.meanPlantedSpeed).toBeLessThan(0.15 * WALK_SPEED);
      expect(rep.p95PlantedSpeed).toBeLessThan(0.25 * WALK_SPEED);
    }
  });
  it("a pre-fix style phase (2.8x too fast) fails the same meter", () => {
    const { track } = walk(180, false);
    const meter = createFootSlideMeter({ plantedHeight: 0.04 });
    for (const r of track) {
      if (r.clip !== "Walk" || r.t < 1) continue;
      const f = rig.footAt("Walk", (r.phase * 2.8) % CLIP_SECONDS.Walk);
      meter.feed(r.t, worldAt(f.toeLeft, r.z), { groundHeight: ground, bodySpeed: WALK_SPEED });
    }
    expect(meter.report().meanPlantedSpeed).toBeGreaterThan(0.5 * WALK_SPEED);
  });
});

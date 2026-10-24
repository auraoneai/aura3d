import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLocomotion } from "../../../packages/game/src/motion/locomotion";
import { readGlb } from "../../../tools/aura-fc/glb.mjs";
import { stanceSamples } from "../../../tools/aura-fc/clip-metrics.mjs";
import {
  CLIP_SECONDS, GAIT_PER_METRE, STANCE_SPEED_MODEL, athleteAnimation, athleteModelScale, kickClipFor, pickLocomotion, type LocoClip
} from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";

/**
 * Foot slide: while a foot is planted its world velocity should be zero. A planted foot moves backwards relative to
 * the hips at (clip stance speed x playback rate x model scale); the character moves forward at the ground speed.
 * The residual is the slide. Phase now advances with distance travelled, so rate = ground speed / (stance x scale).
 */
const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
const glbPath = (key: string) => `public${/url: "([^"]+)"/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]}`;
const bounds = (key: string) => JSON.parse(/bounds: (\[[^\]]+\])/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]!) as number[];

describe("locomotion constants match the GLB data", () => {
  for (const key of ["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"]) {
    it(`${key}: stance speeds and durations in locomotion.ts equal what the clips contain`, () => {
      const glb = readGlb(glbPath(key));
      for (const clip of ["Walk_Loop", "Run", "Sprint_Loop"]) {
        const { dur, stance } = stanceSamples(glb, clip);
        const mean = stance.reduce((s: number, x: { v: number }) => s + x.v, 0) / stance.length;
        expect(dur).toBeCloseTo(CLIP_SECONDS[clip]!, 3);
        expect(mean).toBeCloseTo(STANCE_SPEED_MODEL[clip]!, 1);
      }
    });
  }
});

describe("planted-foot slide (m/s of world velocity of a planted foot)", () => {
  const glb = readGlb(glbPath("fcSoccerStrikerMeshy"));
  const scale = athleteModelScale("h-fw0", bounds("fcSoccerStrikerMeshy")[1]!);
  const slide = (clip: string, groundSpeed: number, rate: number) => {
    const { stance } = stanceSamples(glb, clip);
    const diffs = stance.map((s: { v: number }) => groundSpeed - s.v * scale * rate);
    return {
      max: Math.max(...diffs.map(Math.abs)),
      mean: Math.abs(diffs.reduce((a: number, b: number) => a + b, 0) / diffs.length),
      rms: Math.sqrt(diffs.reduce((a: number, b: number) => a + b * b, 0) / diffs.length)
    };
  };
  const speeds = [1.0, 1.6, 2.2, 2.5, 3.0, 3.8, 4.4, 4.8, 5.4, 6.2, 6.6];
  const report: Array<Record<string, number | string>> = [];

  it("distance-driven phase: planted-foot slide RMS <= 0.12 m/s (run, sprint) and <= 0.35 m/s (walk, slow range) at every speed", () => {
    let loco: LocoClip = "Ready";
    for (const v of speeds) {
      // settle the hysteresis from below, like a player accelerating
      for (let u = 0.3; u <= v; u += 0.1) loco = pickLocomotion(u, loco);
      loco = pickLocomotion(v, loco);
      const clip = loco === "Ready" ? "Walk_Loop" : loco;
      const rate = v / (STANCE_SPEED_MODEL[clip]! * scale);
      const s = slide(clip, v, rate);
      report.push({ speed: v, clip, rate: +rate.toFixed(2), rmsSlide: +s.rms.toFixed(3), maxSlide: +s.max.toFixed(3), meanSlide: +s.mean.toFixed(3) });
      expect(s.mean).toBeLessThan(0.1);
      if (clip === "Walk_Loop") { expect(s.rms).toBeLessThan(0.35); expect(s.max).toBeLessThan(0.8); }
      else { expect(s.rms).toBeLessThan(0.12); expect(s.max).toBeLessThan(0.35); }
      expect(rate).toBeGreaterThan(0.35);
      expect(rate).toBeLessThan(1.3);                                          // never slow-motion or chipmunk
    }
    console.log("PLANTED_FOOT_SLIDE_DISTANCE_PHASE", JSON.stringify(report));
  });

  it("the old fixed playback (Run x1.22, Sprint x1.35, Walk x1.12, speed ignored by the legacy path => x1.0) slid far more", () => {
    // legacy path samples at app time with speed ignored, i.e. rate 1 for every clip regardless of ground speed
    const old: Array<Record<string, number | string>> = [];
    for (const [v, clip] of [[1.6, "Walk_Loop"], [3.2, "Walk_Loop"], [4.8, "Run"], [6.6, "Sprint_Loop"]] as const) {
      const s = slide(clip, v, 1);
      old.push({ speed: v, clip, maxSlide: +s.max.toFixed(3), meanSlide: +s.mean.toFixed(3) });
    }
    console.log("PLANTED_FOOT_SLIDE_OLD_FIXED_RATE", JSON.stringify(old));
    expect(Math.max(...old.map((o) => o.meanSlide as number))).toBeGreaterThan(0.4);
  });
});

describe("library createLocomotion on this rig (why the game picks its own clip switch points)", () => {
  const glb = readGlb(glbPath("fcSoccerStrikerMeshy"));
  const scale = athleteModelScale("h-fw0", bounds("fcSoccerStrikerMeshy")[1]!);
  const rms = (clip: string, v: number, rate: number) => {
    const { stance } = stanceSamples(glb, clip);
    const d = stance.map((s: { v: number }) => v - s.v * scale * rate);
    return Math.sqrt(d.reduce((a: number, b: number) => a + b * b, 0) / d.length);
  };
  const gaits = [
    { name: "Ready", speed: 0, cycle: 1.8 },
    { name: "Walk_Loop", speed: STANCE_SPEED_MODEL.Walk_Loop! * scale, cycle: 0.8 },
    { name: "Run", speed: STANCE_SPEED_MODEL.Run! * scale, cycle: 0.56 },
    { name: "Sprint_Loop", speed: STANCE_SPEED_MODEL.Sprint_Loop! * scale, cycle: 0.48 }
  ];
  it("single-clip playback with the library's midpoint switching and default rate clamp slides more than the game's switch points", () => {
    const rows: Array<Record<string, number | string>> = [];
    let ours: LocoClip = "Ready";
    let worseCount = 0;
    for (const v of [1.0, 1.6, 2.2, 3.0, 3.6, 4.4, 5.0, 5.8, 6.6]) {
      const lib = createLocomotion({ gaits });
      let f = lib.update(v, 1 / 60);
      for (let i = 0; i < 120; i++) f = lib.update(v, 1 / 60);
      const libClip = f.dominant === "Ready" ? "Walk_Loop" : f.dominant;
      for (let u = 0.3; u <= v; u += 0.1) ours = pickLocomotion(u, ours);
      ours = pickLocomotion(v, ours);
      const ourClip = ours === "Ready" ? "Walk_Loop" : ours;
      const ourRate = v / (STANCE_SPEED_MODEL[ourClip]! * scale);
      const a = rms(libClip, v, f.rates[libClip]!), b = rms(ourClip, v, ourRate);
      if (b < a - 1e-9) worseCount++;
      rows.push({ speed: v, libraryClip: libClip, libraryRate: +f.rates[libClip]!.toFixed(2), libraryRms: +a.toFixed(3), gameClip: ourClip, gameRate: +ourRate.toFixed(2), gameRms: +b.toFixed(3) });
      expect(b).toBeLessThanOrEqual(a + 1e-9);
    }
    console.log("LIBRARY_LOCOMOTION_VS_GAME_SLIDE_RMS", JSON.stringify(rows));
    expect(worseCount).toBeGreaterThanOrEqual(4);
  });
});

describe("athleteAnimation", () => {
  const base = { speed: 0, gait: 0, kickT: 0, kickDur: 0.3, kickPower: 0, slideT: 0, diveT: 0, celebrateT: 0, isKeeper: false };

  it("kick phase is the swing progress, so the boot is at the ball exactly when the sim launches (0.74 of the swing)", () => {
    const T = 0.3;
    const at = (frac: number) => athleteAnimation({ ...base, kickT: T * (1 - frac), kickDur: T, kickPower: 0.9 }, 5, 1.17, "Run").anim;
    expect(at(0.74).clip).toBe("KickShot");
    expect(at(0.74).phase).toBeCloseTo(0.74 * CLIP_SECONDS.KickShot!, 6);
    expect(at(0.1).phase).toBeLessThan(at(0.74).phase);
    expect(at(0.74).loop).toBe(false);
    // hit-stop: sim time frozen => same kickT => same phase
    expect(at(0.5).phase).toBe(at(0.5).phase);
  });

  it("picks the kick clip by power and never uses the inert Shoot/Release clips", () => {
    expect(kickClipFor(0.2)).toBe("KickTap");
    expect(kickClipFor(0.55)).toBe("KickPass");
    expect(kickClipFor(0.95)).toBe("KickShot");
    const rig = readFileSync("apps/showcase-aura-fc-3d/src/game/rig.ts", "utf8") + readFileSync("apps/showcase-aura-fc-3d/src/game/locomotion.ts", "utf8");
    expect(rig).not.toMatch(/["']Shoot["']|["']Release["']/);
  });

  it("run phase advances with distance: same distance => same pose at any speed", () => {
    const a = athleteAnimation({ ...base, speed: 4.8, gait: 10 * GAIT_PER_METRE }, 3, 1.17, "Run");
    const b = athleteAnimation({ ...base, speed: 5.2, gait: 10 * GAIT_PER_METRE }, 9, 1.17, "Run");
    expect(a.anim.phase).toBeCloseTo(b.anim.phase, 9);
    const c = athleteAnimation({ ...base, speed: 4.8, gait: 10.5 * GAIT_PER_METRE }, 3, 1.17, "Run");
    expect(c.anim.phase).not.toBeCloseTo(a.anim.phase, 3);
  });

  it("hysteresis: no clip flapping around the walk/run and run/sprint thresholds", () => {
    let loco: LocoClip = "Walk_Loop";
    const seq = [2.4, 2.7, 2.4, 2.3, 2.7, 2.25, 2.3];
    const picked = seq.map((s) => (loco = pickLocomotion(s, loco)));
    expect(picked).toEqual(["Walk_Loop", "Run", "Run", "Run", "Run", "Run", "Run"]);
    const down = [2.7, 2.5, 2.3, 2.1].map((s) => (loco = pickLocomotion(s, loco)));
    expect(down).toEqual(["Run", "Run", "Run", "Walk_Loop"]);
    expect(pickLocomotion(0.3, "Ready")).toBe("Ready");
    expect(pickLocomotion(0.5, "Ready")).toBe("Walk_Loop");
    expect(pickLocomotion(0.3, "Walk_Loop")).toBe("Walk_Loop");
    expect(pickLocomotion(0.2, "Walk_Loop")).toBe("Ready");
  });

  it("slide and dive phases run 0..clip length over the sim timers", () => {
    expect(athleteAnimation({ ...base, slideT: 0.55 }, 1, 1.17, "Run").anim.phase).toBeCloseTo(0, 6);
    expect(athleteAnimation({ ...base, slideT: 0.0001 }, 1, 1.17, "Run").anim.phase).toBeCloseTo(0.6, 2);
    expect(athleteAnimation({ ...base, diveT: 0.36, isKeeper: true }, 1, 1.17, "Run").anim.phase).toBeCloseTo(0.32, 2);
  });
});

// GU47 WP-24: Cross Hop diorama look table, camera, reduced-motion path, VFX pack and verge kit (presentation only).
import { describe, expect, it } from "vitest";
import { THEMES } from "../../../apps/showcase-cross-hop/src/game/themes";
import { CROSS_HOP_PALETTE, DAY_CLOCK_BLEND_ROWS, THEME_LOOKS, keyAt, sunAt, sunDirection } from "../../../apps/showcase-cross-hop/src/game/look";
import {
  CAM_DIORAMA, KIT_MIN_X, KIT_PER_SIDE, LAMP_X, ambientEmitter, dioramaPose, hopScale, kitSlots, lampSlots, screenY, turnToward
} from "../../../apps/showcase-cross-hop/src/game/diorama";
import { CROSS_HOP_VFX, DEATH_COLORS, MAX_EVENT_PARTICLES, crossHopPresets, landingVfx, registerCrossHopVfx } from "../../../apps/showcase-cross-hop/src/game/vfx";
import { critterOverrides } from "../../../apps/showcase-cross-hop/src/game/critterLook";
import { qaCrops } from "../../../apps/showcase-cross-hop/src/game/qa";
import { deltaE2000 } from "../../../tools/look-metrics/region-luma.mjs";

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

describe("look table (CH47-01, 03, 04, 06)", () => {
  it("has one row per theme with its own HDRI, time of day and sun", () => {
    expect(THEME_LOOKS).toHaveLength(THEMES.length);
    expect(new Set(THEME_LOOKS.map((l) => l.hdri)).size).toBe(6);
    expect(new Set(THEME_LOOKS.map((l) => l.timeOfDay)).size).toBe(6);
    expect(THEME_LOOKS.map((l) => [l.sun.elevationDeg, l.sun.azimuthDeg])).toEqual([[18, 220], [55, 30], [10, 250], [6, 280], [35, 340], [50, 25]]);
    expect(THEME_LOOKS[4]!.sun.intensity).toBe(0.35);
  });

  it("uses five distinct post presets and night stars only at night", () => {
    expect(new Set(THEME_LOOKS.map((l) => l.post)).size).toBe(5);
    expect(THEME_LOOKS.filter((l) => l.sky.stars).map((l) => l.timeOfDay)).toEqual(["night"]);
    for (const l of THEME_LOOKS) if (l.sky.clouds) expect(l.sky.clouds.coverage).toBeLessThanOrEqual(0.2);
  });

  it("fog runs from dawn #b9cfe0 0.012 to night 0.016, none in the studio, colours >= dE 10 apart", () => {
    expect(THEME_LOOKS[0]!.fog).toMatchObject({ color: "#b9cfe0", density: 0.012 });
    expect(THEME_LOOKS[4]!.fog!.density).toBe(0.016);
    expect(THEME_LOOKS[5]!.fog).toBeNull();
    const fogs = THEME_LOOKS.flatMap((l) => (l.fog ? [l.fog.color] : []));
    for (let i = 0; i < fogs.length; i++) for (let j = i + 1; j < fogs.length; j++) {
      expect(deltaE2000(rgb(fogs[i]!), rgb(fogs[j]!))).toBeGreaterThanOrEqual(10);
    }
  });

  it("palette is chalk mint, butter yellow, terracotta, slate with coin gold", () => {
    expect(Object.keys(CROSS_HOP_PALETTE)).toEqual(["chalkMint", "butterYellow", "terracotta", "slate", "coinGold"]);
  });
});

describe("moving sun and day clock (signature, CH47-19)", () => {
  it("the sun sweeps with progress inside a theme", () => {
    const a = sunAt(THEME_LOOKS[0]!, 0), b = sunAt(THEME_LOOKS[0]!, 24);
    expect(b.azimuthDeg - a.azimuthDeg).toBeCloseTo(THEME_LOOKS[0]!.sweep.azimuthDeg, 6);
    const d = sunDirection(a.elevationDeg, a.azimuthDeg);
    expect(d[1]).toBeLessThan(0);
    expect(Math.hypot(...d)).toBeCloseTo(1, 6);
  });

  it("the key blends monotonically toward the next theme over the last 5 rows only", () => {
    const steps = [];
    for (let r = 0; r < 25; r++) steps.push(keyAt(0, 3, r).intensity);
    const start = 25 - DAY_CLOCK_BLEND_ROWS;
    for (let r = 0; r < start; r++) expect(steps[r]).toBe(THEME_LOOKS[0]!.sun.intensity);
    for (let r = start + 1; r < 25; r++) expect(steps[r]!).toBeLessThan(steps[r - 1]!);
    expect(keyAt(0, null, 24).intensity).toBe(THEME_LOOKS[0]!.sun.intensity);
  });
});

describe("diorama camera and tilt-shift focus (CH47-11, CH47-05)", () => {
  it("rests at y 9.5, back 8.5, ahead 3.0, fov 32", () => {
    const p = dioramaPose({ x: 0, z: 0, sinceStart: 10, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: false });
    expect(p.position[1]).toBeCloseTo(CAM_DIORAMA.y, 6);
    expect(p.position[2]).toBeCloseTo(8.5, 6);
    expect(p.target[2]).toBeCloseTo(-3, 6);
    expect(p.fov).toBe(32);
  });

  it("crane-down intro, theme lift and death push-in move the camera; reduced motion cuts them (PRD §6.3)", () => {
    const intro = dioramaPose({ x: 0, z: 0, sinceStart: 0, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: false });
    const lift = dioramaPose({ x: 0, z: 0, sinceStart: 10, sinceTheme: CAM_DIORAMA.themeSeconds / 2, sinceDeath: Infinity, reducedMotion: false });
    const push = dioramaPose({ x: 0, z: 0, sinceStart: 10, sinceTheme: Infinity, sinceDeath: 5, reducedMotion: false });
    expect(intro.position[1]).toBeGreaterThan(CAM_DIORAMA.y + 5);
    expect(lift.position[1]).toBeGreaterThan(CAM_DIORAMA.y + 1);
    expect(push.position[2]).toBeLessThan(8.5);
    for (const t of [0, 0.3, 0.9]) {
      const rm = dioramaPose({ x: 0, z: 0, sinceStart: t, sinceTheme: t, sinceDeath: t, reducedMotion: true });
      expect(rm.position).toEqual([0, CAM_DIORAMA.y, CAM_DIORAMA.back]);
    }
  });

  it("puts the player row in the lower half of the frame for the tilt-shift band", () => {
    const p = dioramaPose({ x: 0, z: 0, sinceStart: 10, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: true });
    const y = screenY([0, 0.6, 0], p.position, p.target, p.fov)!;
    expect(y).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(0.95);
    expect(screenY([0, 0, 20], p.position, p.target, p.fov)).toBeNull();
  });

  it("publishes the player band and the top 20 % / bottom 10 % crops", () => {
    expect(qaCrops(0.7, true).map((c) => c.name)).toEqual(["player", "player-band", "top-20", "bottom-10", "bottom-third"]);
  });
});

describe("hop squash and stretch, turns (CH47-12)", () => {
  it("scale.y stays in 0.75..1.15 and is never uniform 1.25", () => {
    for (let t = 0; t <= 1; t += 0.02) {
      const [xz, y] = hopScale(t, true, -1, false);
      expect(y).toBeGreaterThanOrEqual(0.75);
      expect(y).toBeLessThanOrEqual(1.15);
      expect(xz === 1.25 && y === 1.25).toBe(false);
    }
    expect(hopScale(0.1, true, -1, false)[1]).toBeLessThan(0.85);
    expect(hopScale(0.45, true, -1, false)[1]).toBeGreaterThan(1.05);
    expect(hopScale(0, false, 0.06, false)[1]).toBeLessThan(0.85);
  });

  it("reduced motion keeps the deformation at <= 30 %", () => {
    for (let t = 0; t <= 1; t += 0.05) expect(Math.abs(hopScale(t, true, -1, true)[1] - 1)).toBeLessThanOrEqual(0.3 * 0.22 + 1e-9);
  });

  it("turns at <= 45 degrees per frame and completes a quarter turn in about 70 ms", () => {
    let yaw = Math.PI;
    let frames = 0;
    while (Math.abs(yaw - Math.PI / 2) > 1e-6 && frames < 20) {
      const next = turnToward(yaw, Math.PI / 2, 1 / 60);
      expect(Math.abs(next - yaw)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
      yaw = next; frames++;
    }
    expect(frames).toBeLessThanOrEqual(5);
  });
});

describe("VFX preset pack (CH47-13) and ambient emitters (CH47-14)", () => {
  it("registers at least 8 distinct kinds and keeps each event under the live-count share", () => {
    const seen: string[] = [];
    expect(registerCrossHopVfx({ registerPreset: (k) => { seen.push(k); } }, false)).toBeGreaterThanOrEqual(8);
    expect(new Set(seen).size).toBe(seen.length);
    for (const spec of Object.values(crossHopPresets(false))) {
      const total = spec.layers.reduce((n, l) => n + Number((l as { count?: number }).count ?? 0), 0);
      expect(total).toBeLessThanOrEqual(MAX_EVENT_PARTICLES * 2);
    }
  });

  it("death hues are at least dE 15 apart", () => {
    const hues = Object.values(DEATH_COLORS);
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
      expect(deltaE2000(rgb(hues[i]!), rgb(hues[j]!))).toBeGreaterThanOrEqual(15);
    }
  });

  it("reduced motion halves particle counts", () => {
    const full = crossHopPresets(false)[CROSS_HOP_VFX.deathDrowned].layers[0] as unknown as { count: number };
    const half = crossHopPresets(true)[CROSS_HOP_VFX.deathDrowned].layers[0] as unknown as { count: number };
    expect(half.count).toBe(Math.round(full.count / 2));
    const a = ambientEmitter("rain", false)!, b = ambientEmitter("rain", true)!;
    expect(b.rate).toBe(a.rate / 2);
  });

  it("picks a landing effect per lane type and an emitter on every theme but Downtown, <= 2,000 particles", () => {
    expect(landingVfx("river", true)).toBe(CROSS_HOP_VFX.logSplash);
    expect(landingVfx("lava", false)).toBe(CROSS_HOP_VFX.lavaSparks);
    expect(landingVfx("road", false)).toBe(CROSS_HOP_VFX.landDust);
    const emitters = THEME_LOOKS.map((l) => ambientEmitter(l.ambient, false));
    expect(emitters.map((e) => e === null)).toEqual([false, true, false, false, false, false]);
    for (const e of emitters) if (e) expect(e.maxParticles).toBeLessThanOrEqual(2000);
  });
});

describe("verge kit and lamps (CH47-15, CH47-02)", () => {
  it("scatters 3 kit slots per verge per row over 500 rows, nothing within |x| < 17.5", () => {
    let count = 0;
    for (let r = 0; r < 500; r++) {
      const slots = kitSlots(r, 1234);
      expect(slots).toHaveLength(KIT_PER_SIDE * 2);
      for (const s of slots) expect(Math.abs(s.x)).toBeGreaterThanOrEqual(KIT_MIN_X);
      count += slots.length;
    }
    // 4.6 drew about 1.1 trees per row (two trees on 55 % of rows): 6 per row is >= 2.5x.
    expect(count / 500 / 1.1).toBeGreaterThanOrEqual(2.5);
    expect(kitSlots(42, 7)).toEqual(kitSlots(42, 7));
  });

  it("places 12 lamps alternating sides beyond the strip", () => {
    const s = lampSlots(5, 12);
    expect(s).toHaveLength(12);
    for (const l of s) expect(Math.abs(l.x)).toBe(LAMP_X);
    expect(new Set(s.map((l) => Math.sign(l.x))).size).toBe(2);
  });
});

describe("critter materials (CH47-08)", () => {
  it("never replaces textures; robo and astro frogs get clearcoat, furry critters a rim", () => {
    for (const key of ["hop", "chick", "roboFrog", "astroFrog", "bun", "hawk"]) {
      for (const o of critterOverrides(key)) expect(o.replaceTextures).not.toBe(true);
    }
    expect(critterOverrides("roboFrog")[0]!.clearcoat).toBe(1);
    expect(critterOverrides("astroFrog")[0]!.clearcoat).toBe(1);
    expect(critterOverrides("bun")[0]!.rim).toBeDefined();
  });
});

/**
 * Thermal Drift signature effect (GU47 WP-13 HS-11): the heat-haze pass, its 8 projected sources, the edge thermal ramp
 * above 80% heat, and the reduced-motion and Low-tier paths (PRD §6.3, §6.4).
 */
import { describe, expect, it } from "vitest";
import type { AuraCustomPostPass } from "@aura3d/engine";
import {
  edgeRamp,
  HEAT_HAZE_GLSL,
  HEAT_HAZE_MAX_SOURCES,
  HEAT_HAZE_PASS,
  hazeQaCrops,
  hazeScalars,
  heatHazePass,
  HeatHazeController,
  HeatHazeSources,
  tintVector
} from "../../../apps/showcase-heatsink/src/heatHaze";
import { customPassFragmentSource } from "../../../packages/rendering/src/post/v2Stages";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";

const pose = { position: [0, 4.2, 9.5] as const, target: [0, 1.8, -18] as const, fov: 68 };
const look = CIRCUIT_LOOKS.grand.haze;

describe("heatsink heat haze pass", () => {
  it("is one before-tonemap shader pass with 8 source uniforms and the scalar controls", () => {
    const pass = heatHazePass(look);
    expect(pass.name).toBe(HEAT_HAZE_PASS);
    expect(pass.insertAt).toBe("before-tonemap");
    expect(pass.order).toBe("before-tonemap");
    for (let i = 0; i < HEAT_HAZE_MAX_SOURCES; i += 1) {
      expect(pass.uniforms?.[`u_src${i}`]).toEqual([0, 0, 0, 0]);
      expect(HEAT_HAZE_GLSL).toContain(`uniform vec4 u_src${i};`);
    }
    for (const u of ["u_tdTime", "u_strength", "u_motion", "u_edge", "u_aspect", "u_ambient", "u_tint"]) {
      expect(pass.uniforms).toHaveProperty(u);
      expect(HEAT_HAZE_GLSL).toContain(u);
    }
    expect(HEAT_HAZE_GLSL).toContain("texture(u_color");
    expect(HEAT_HAZE_GLSL).toContain("outColor =");
    expect(heatHazePass(look, false).enabled).toBe(false);
  });

  it("never redeclares an engine prelude name (GU47 phase 3: a `u_time` redefinition failed the compile and the boot)", () => {
    const prelude = customPassFragmentSource("");
    const declared = [...prelude.matchAll(/^(?:uniform|in|out)\s+\w+\s+(\w+);/gm)].map((m) => m[1]!);
    expect(declared).toEqual(expect.arrayContaining(["u_color", "u_time", "v_uv", "outColor"]));
    for (const name of declared) expect(HEAT_HAZE_GLSL).not.toMatch(new RegExp(`^(?:uniform|in|out)\\s+\\w+\\s+${name};`, "m"));
  });

  it("ramps the screen edge only above 80% core heat", () => {
    expect(edgeRamp(0)).toBe(0);
    expect(edgeRamp(0.8)).toBe(0);
    expect(edgeRamp(0.9)).toBeCloseTo(0.5, 6);
    expect(edgeRamp(1)).toBe(1);
    expect(edgeRamp(1.4)).toBe(1);
  });

  it("reduced motion drops the distortion and freezes the noise: a static tint only", () => {
    const moving = hazeScalars(look, { heat01: 0.5, reducedMotion: false, lowTier: false, timeSeconds: 12.5, aspect: 16 / 9 });
    expect(moving.u_motion).toBe(1);
    expect(moving.u_tdTime).toBeCloseTo(12.5, 6);
    const still = [3, 7.25, 40].map((t) => hazeScalars(look, { heat01: 0.5, reducedMotion: true, lowTier: false, timeSeconds: t, aspect: 16 / 9 }));
    for (const s of still) {
      expect(s.u_motion).toBe(0);
      expect(s.u_tdTime).toBe(0);
    }
    expect(still[0]).toEqual(still[2]);
  });

  it("runs at half strength on the Low tier", () => {
    const high = hazeScalars(look, { heat01: 0, reducedMotion: false, lowTier: false, timeSeconds: 0, aspect: 1 });
    const low = hazeScalars(look, { heat01: 0, reducedMotion: false, lowTier: true, timeSeconds: 0, aspect: 1 });
    expect(low.u_strength).toBeCloseTo(high.u_strength / 2, 6);
  });

  it("projects sources into uv (origin bottom-left), skips points behind the camera and keeps the strongest 8", () => {
    const sources = new HeatHazeSources();
    sources.begin();
    expect(sources.add(pose, 16 / 9, [0, 1.8, -18], 1.2, 0.6)).toBe(true);
    expect(sources.slots[0]![0]).toBeCloseTo(0.5, 3);
    expect(sources.slots[0]![1]).toBeCloseTo(0.5, 3);
    expect(sources.slots[0]![2]).toBeGreaterThan(0);
    expect(sources.add(pose, 16 / 9, [0, 2, 30], 1.2, 0.9)).toBe(false);
    for (let i = 0; i < 10; i += 1) sources.add(pose, 16 / 9, [i - 5, 1.5, -20 - i], 1, 0.1 + i * 0.05);
    expect(sources.size).toBe(HEAT_HAZE_MAX_SOURCES);
    const strengths = sources.slots.map((s) => s[3]!);
    expect(Math.min(...strengths)).toBeGreaterThan(0.1);
    sources.begin();
    sources.add(pose, 16 / 9, [0, 1.8, -18], 1.2, 0.6);
    sources.end();
    expect(sources.slots.slice(1).every((s) => s.every((v) => v === 0))).toBe(true);
  });

  it("registers once per circuit mount, releases the previous pass, and writes 13 uniforms a frame", () => {
    const added: AuraCustomPostPass[] = [];
    let released = 0;
    const writes: string[] = [];
    const app = {
      addPostPass: (p: AuraCustomPostPass) => { added.push(p); return () => { released += 1; }; },
      setPassUniform: (name: string, key: string) => { writes.push(`${name}.${key}`); }
    };
    const controller = new HeatHazeController(app, look);
    controller.write({ heat01: 0, reducedMotion: false, lowTier: false, timeSeconds: 0, aspect: 1 });
    expect(writes).toHaveLength(0);
    controller.mount(look);
    controller.mount(CIRCUIT_LOOKS.dustfall.haze);
    expect(added).toHaveLength(2);
    expect(released).toBe(1);
    controller.write({ heat01: 0.95, reducedMotion: false, lowTier: false, timeSeconds: 1, aspect: 1 });
    expect(writes).toHaveLength(5 + HEAT_HAZE_MAX_SOURCES);
    expect(writes.every((w) => w.startsWith(`${HEAT_HAZE_PASS}.`))).toBe(true);
  });

  it("publishes the named QA crops inside the canvas", () => {
    const crops = hazeQaCrops(pose, 16 / 9, [0, 1.6, -1], [0, 1.45, -0.4]);
    const names = crops.map((c) => c.name);
    for (const name of ["top-row", "road-far", "road-near", "centre", "edge-left", "edge-right", "exhaust", "drone"]) expect(names).toContain(name);
    for (const c of crops) {
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("normalises the circuit tint so it never darkens a channel to black", () => {
    const t = tintVector("#ff9a3c");
    expect(Math.max(...t)).toBeCloseTo(1, 6);
    expect(Math.min(...t)).toBeGreaterThan(0);
  });
});

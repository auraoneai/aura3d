// PRD-07 P3-T3 — C-21 SkyBackgroundPass implementation test (CPU side).
// horizonRadiance returns 24 floats; the noon-sun CPU frame keeps the sky
// luma varied (mirrors the >6-std GPU check); horizon out-luminates zenith;
// the sun disc spikes above 10 luminance in linear radiance.

import { describe, expect, it } from "vitest";
import { skyPassFor, skyDrawPassFor } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { skyFrame, evaluateSky, skyProgramDefines, skyProgramKey, moonFrame } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { sunDirection } from "../../../../packages/rendering/src/atmosphere/PreethamSky";

const NOON = { model: "preetham" as const, sun: { elevationDeg: 65, azimuthDeg: 180 }, turbidity: 4 };

describe("P3-T3 C-21 SkyBackgroundPass", () => {
  it("skyPassFor exposes the C-21 surface incl. horizonRadiance(8)", () => {
    const device = new MockRenderDevice();
    const pass = skyPassFor(device);
    expect(typeof pass.setSpec).toBe("function");
    expect(typeof pass.renderToCubeFace).toBe("function");
    pass.setSpec(NOON, 0);
    const radiance = pass.horizonRadiance(8);
    expect(radiance.length).toBe(24);
    for (let i = 0; i < radiance.length; i += 1) expect(Number.isFinite(radiance[i])).toBe(true);
    expect(skyPassFor(device)).toBe(pass); // device-keyed cache
    expect(skyDrawPassFor(device)).toBeDefined();
  });

  it("noon frame: radiance varies across the dome and horizon beats zenith", () => {
    const frame = skyFrame(NOON);
    const zenith = evaluateSky(frame, [0, 1, 0]);
    const horizon = evaluateSky(frame, [1, 0.02, 0]);
    const away = evaluateSky(frame, [-0.8, 0.4, -0.3]);
    const l = (v: readonly number[]) => v[0] + v[1] + v[2];
    expect(l(horizon)).toBeGreaterThan(l(zenith));
    // Sky has structure: luminance spreads meaningfully across samples.
    const samples = [
      l(evaluateSky(frame, [1, 0.05, 0])), l(evaluateSky(frame, [0, 0.2, -1])),
      l(evaluateSky(frame, [-0.7, 0.5, 0.7])), l(evaluateSky(frame, [0.3, 0.8, 0.5])),
      l(evaluateSky(frame, [0, 1, 0]))
    ];
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    expect(std).toBeGreaterThan(0.001);
    expect(l(away)).toBeGreaterThan(0);
  });

  it("sun disc luminance exceeds 10 in linear radiance toward the sun", () => {
    const frame = skyFrame(NOON);
    const dir = sunDirection(NOON.sun);
    const radiance = evaluateSky(frame, dir);
    const lum = 0.2126 * radiance[0] + 0.7152 * radiance[1] + 0.0722 * radiance[2];
    expect(lum).toBeGreaterThan(10);
  });

  it("program keys cover the (model, stars, clouds, moon) product", () => {
    const keys = new Set([
      skyProgramKey(skyProgramDefines(skyFrame(NOON))),
      skyProgramKey(skyProgramDefines(skyFrame({ ...NOON, stars: { density: 0.5 } }))),
      skyProgramKey(skyProgramDefines(skyFrame({ ...NOON, clouds: { coverage: 0.4 } }))),
      skyProgramKey(skyProgramDefines(skyFrame({ ...NOON, moon: { elevationDeg: 10, azimuthDeg: 0, phase: 0.5 } }))),
      skyProgramKey(skyProgramDefines(skyFrame({ model: "gradient", zenith: [0, 0, 0.3], horizon: [0.5, 0.5, 0.6] }))),
      skyProgramKey(skyProgramDefines(skyFrame({ model: "color", color: [0.1, 0.1, 0.1] })))
    ]);
    // preetham always shows stars, so the stars-density variant shares the
    // base PREETHAM.stars.disc key → 5 distinct keys over 6 specs.
    expect(keys.size).toBe(5);
    expect([...keys].some((k) => k.includes(".clouds"))).toBe(true);
    expect([...keys].some((k) => k.includes(".moon"))).toBe(true);
    expect(moonFrame(null)).toBeNull();
    expect(moonFrame({ elevationDeg: 20, azimuthDeg: 90, phase: 0.5 })?.phase).toBe(0.5);
  });
});

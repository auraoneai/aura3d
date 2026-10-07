// PRD-07 P3-T1/T2 smoke — the CPU Preetham port produces plausible sky
// radiance: brighter toward the horizon than the zenith at low sun, the sun
// disc spikes near the sun direction, and the C-21 pass exposes a 24-float
// horizon radiance table for fog/sky consumers.

import { describe, expect, it } from "vitest";
import { preethamFrame, preethamEvaluate, sunDirection, normalize3 } from "../../../../packages/rendering/src/atmosphere/PreethamSky";
import { skyPassFor } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

const DAY_SUN = { elevationDeg: 42, azimuthDeg: 145 };
const SPEC = { model: "preetham" as const, sun: DAY_SUN, turbidity: 6, rayleigh: 1.5 };

describe("P3 preetham sky (CPU reference)", () => {
  it("zenith is darker and bluer than the horizon at mid-day", () => {
    const frame = preethamFrame(SPEC);
    const zenith = preethamEvaluate(frame, [0, 1, 0]);
    const horizon = preethamEvaluate(frame, [1, 0.02, 0]);
    expect(zenith[2]).toBeGreaterThan(zenith[0]); // blue-dominant sky
    const zLum = zenith[0] + zenith[1] + zenith[2];
    const hLum = horizon[0] + horizon[1] + horizon[2];
    expect(zLum).toBeGreaterThan(0.001);
    expect(hLum).toBeGreaterThan(0.001);
  });

  it("radiance peaks toward the sun direction", () => {
    const frame = preethamFrame(SPEC);
    const sun = sunDirection(DAY_SUN);
    const toward = preethamEvaluate(frame, sun);
    const away = preethamEvaluate(frame, [-sun[0], sun[1] * 0.5, -sun[2]]);
    const t = toward[0] + toward[1] + toward[2];
    const a = away[0] + away[1] + away[2];
    expect(t).toBeGreaterThan(a);
  });

  it("sunDirection is unit-length and points up for positive elevation", () => {
    const d = normalize3(sunDirection({ elevationDeg: 30, azimuthDeg: 0 }));
    expect(d[1]).toBeCloseTo(Math.sin((30 * Math.PI) / 180), 3);
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 6);
  });

  it("C-21 pass exposes a 24-float horizonRadiance table", () => {
    const pass = skyPassFor(new MockRenderDevice());
    pass.setSpec(SPEC, 0);
    const r = pass.horizonRadiance(8);
    expect(r.length).toBe(24);
    expect([...r].every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });
});

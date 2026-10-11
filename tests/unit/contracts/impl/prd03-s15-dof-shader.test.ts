import { describe, expect, it } from "vitest";
import { DOF_GATHER_GLSL, DOF_PREFILTER_GLSL } from "../../../../packages/rendering/src/post/shaders/dof.glsl";
import { DOF_GATHER_WGSL, DOF_PREFILTER_WGSL } from "../../../../packages/rendering/src/post/shaders/dof.wgsl";

/**
 * 03-S15: the S6 DoF units the browser bokeh metric depends on.
 *
 *  - The prefilter renders at half res but reads the FULL-res HDR target. It
 *    used to `texelFetch(u_color, pixel)` with the half-res index, so the
 *    blurred layer was the lower-left quadrant stretched ×2. It now
 *    box-averages the 2×2 full-res block at `pixel * 2`.
 *  - `.a` carries the thin-lens CoC *diameter* in full-res px (the §8.7
 *    anchor: f=50 mm, N=2.8, zf=3 m, z=30 m, 1080 px → 12.3 px). In half-res
 *    texels the disc radius is diameter / 4; the gather used / 2, which drew
 *    a bokeh twice the thin-lens size.
 */

function cocDiameterPx(focusM: number, zM: number, fMm: number, fStop: number, sensorMm: number, heightPx: number): number {
  const aperture = fMm / fStop;
  const zMm = zM * 1000, zfMm = focusM * 1000;
  return Math.abs((aperture * fMm * (zMm - zfMm)) / (zMm * (zfMm - fMm))) * (heightPx / sensorMm);
}

describe("03-S15 S6 DoF shader units", () => {
  it("the §8.7 anchor is a 12.3 px CoC diameter on a 1080 px frame", () => {
    expect(cocDiameterPx(3, 30, 50, 2.8, 24, 1080)).toBeCloseTo(12.26, 1);
  });

  it("GLSL prefilter box-averages the full-res 2×2 block", () => {
    expect(DOF_PREFILTER_GLSL).toContain("ivec2 base = pixel * 2;");
    expect(DOF_PREFILTER_GLSL).toContain("base + ivec2(1, 1)");
    expect(DOF_PREFILTER_GLSL).not.toMatch(/texelFetch\(u_color, pixel, 0\)/);
  });

  it("WGSL prefilter matches (parity)", () => {
    expect(DOF_PREFILTER_WGSL).toContain("let base = pixel * 2;");
    expect(DOF_PREFILTER_WGSL).toContain("base + vec2<i32>(1, 1)");
    expect(DOF_PREFILTER_WGSL).not.toMatch(/textureLoad\(u_color_tex, pixel, 0\)/);
  });

  it("gather radius and tap reach use diameter / 4 in half-res texels", () => {
    expect(DOF_GATHER_GLSL).toContain("const float DOF_HALF_RES_RADIUS = 0.25;");
    expect(DOF_GATHER_GLSL).toContain("max(abs(centerCoc), centerNear) * DOF_HALF_RES_RADIUS");
    expect(DOF_GATHER_GLSL).toContain("max(abs(t.a), tapNear) * DOF_HALF_RES_RADIUS");
    expect(DOF_GATHER_WGSL).toContain("const DOF_HALF_RES_RADIUS: f32 = 0.25;");
    expect(DOF_GATHER_WGSL).toContain("max(abs(center_coc), center_near) * DOF_HALF_RES_RADIUS");
    expect(DOF_GATHER_WGSL).toContain("max(abs(t.a), tap_near) * DOF_HALF_RES_RADIUS");
  });
});

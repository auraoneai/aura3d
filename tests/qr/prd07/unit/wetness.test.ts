// PRD-07 P5-T5 — §6.8 wetness CPU mirror: albedo darkens ×mix(1,0.55,wet·porosity),
// roughness collapses to 0.06 inside puddles, snow cover pushes albedo to white
// and roughness to 0.9. Mirror of a3d_prd07_wetness.

import { describe, expect, it } from "vitest";
import {
  PRD07_WETNESS_CHUNK_GLSL,
  applyWetnessMaterialCpu,
  noteWetnessPending,
  prd07WetnessState,
  resetWetnessPending,
  setPrd07WetnessState
} from "../../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";

describe("P5-T5 wetness chunk + CPU mirror", () => {
  it("chunk contains the §6.8 entry points and is gated on A3D_WETNESS", () => {
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("A3D_WETNESS");
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("a3dWetnessAlbedo");
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("a3dWetnessRoughness");
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("a3dWetnessPuddle");
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("u_rainRipples");
    expect(PRD07_WETNESS_CHUNK_GLSL).toContain("u_snowCover");
  });

  it("dry path is identity at wetness 0", () => {
    const { albedo, roughness } = applyWetnessMaterialCpu([0.4, 0.5, 0.6], 0.8, 0, 1, 0, 0);
    expect(albedo[0]).toBeCloseTo(0.4, 6);
    expect(albedo[1]).toBeCloseTo(0.5, 6);
    expect(albedo[2]).toBeCloseTo(0.6, 6);
    expect(roughness).toBeCloseTo(0.8, 6);
  });

  it("wet path darkens albedo and flattens puddle roughness", () => {
    const half = applyWetnessMaterialCpu([1, 1, 1], 0.8, 0.5, 1, 0, 0);
    expect(half.albedo[0]).toBeCloseTo(1 - 0.45 * 0.5, 5);
    const full = applyWetnessMaterialCpu([1, 1, 1], 0.8, 1, 1, 1, 0);
    expect(full.albedo[0]).toBeCloseTo(0.55, 5);
    expect(full.roughness).toBeCloseTo(0.06, 5);
  });

  it("porosity scales the darkening", () => {
    const porous = applyWetnessMaterialCpu([1, 1, 1], 0.8, 1, 1, 0, 0);
    const sealed = applyWetnessMaterialCpu([1, 1, 1], 0.8, 1, 0, 0, 0);
    expect(sealed.albedo[0]).toBeCloseTo(1, 5); // non-porous surface unchanged
    expect(porous.albedo[0]).toBeLessThan(sealed.albedo[0]);
  });

  it("snow cover whitens albedo and sets roughness 0.9", () => {
    const { albedo, roughness } = applyWetnessMaterialCpu([0.2, 0.3, 0.4], 0.4, 0, 1, 0, 1);
    expect(albedo[0]).toBeGreaterThan(0.94);
    expect(roughness).toBeCloseTo(0.9, 5);
  });

  it("uniform state + WETNESS_PENDING once-note", () => {
    resetWetnessPending();
    setPrd07WetnessState({ wetness: 0.7, puddleThreshold: 0.4, snowCover: 0 });
    const s = prd07WetnessState();
    expect(s.wetness).toBeCloseTo(0.7);
    expect(s.puddleThreshold).toBeCloseTo(0.4);
    expect(noteWetnessPending()).toBe("WETNESS_PENDING");
    expect(noteWetnessPending()).toBeNull();
    resetWetnessPending();
    expect(noteWetnessPending()).toBe("WETNESS_PENDING");
    setPrd07WetnessState({ wetness: 0, puddleThreshold: 0.62, snowCover: 0 });
    resetWetnessPending();
  });
});

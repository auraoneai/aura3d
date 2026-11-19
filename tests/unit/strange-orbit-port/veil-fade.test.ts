import { describe, expect, it } from "vitest";
import { VEIL_FADE_FAR, VEIL_FADE_NEAR, veilCameraFade } from "../../../examples/strange-orbit-port/world";
import { veilSpec } from "../../../examples/strange-orbit-port/materials";
import { VEIL_FRAGMENT } from "../../../examples/strange-orbit-port/shaders";
import { VEIL_FRAGMENT_WGSL } from "../../../examples/strange-orbit-port/shaders-wgsl";

/**
 * Owner full-run QA (Nov 18): the chase eye crosses each checkpoint curtain a beat after the rider; from ~1 m its
 * streams and arched rim filled the frame as giant grey bars (camera-in-geometry). The curtain fades out near the eye.
 */
describe("Craterline checkpoint curtain camera fade", () => {
  it("is invisible while the eye is within 2.5 m of the curtain plane, either side", () => {
    for (const d of [0, 0.5, -1, 2, -2.5, VEIL_FADE_NEAR]) expect(veilCameraFade(d)).toBe(0);
  });

  it("is fully shown from 12 m out and rises monotonically in between", () => {
    expect(veilCameraFade(VEIL_FADE_FAR)).toBe(1);
    expect(veilCameraFade(-40)).toBe(1);
    let prev = 0;
    for (let d = VEIL_FADE_NEAR; d <= VEIL_FADE_FAR; d += 0.25) {
      const f = veilCameraFade(d);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(veilCameraFade(-d)).toBeCloseTo(f, 12);
      prev = f;
    }
  });

  it("multiplies the curtain alpha by the veilFade uniform in both shader twins (default 1)", () => {
    expect(veilSpec().uniforms?.veilFade).toEqual({ type: "f32", value: 1 });
    expect(VEIL_FRAGMENT).toMatch(/\* veilFade\)/);
    expect(VEIL_FRAGMENT_WGSL).toMatch(/\* aura\.u_veilFade\)/);
  });
});

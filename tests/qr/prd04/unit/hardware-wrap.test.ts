/**
 * hardware-wrap.test.ts — PRD-04 P2-8 (Q-01-2).
 *
 * `TexturedPBRMaterial` option `hardwareWrap?: boolean` emits wrap code `3.0` for
 * non-atlas texture slots — but only when the registered legacy textured shader source
 * carries the `mode > 2.5` passthrough; otherwise the option is ignored and
 * `hardwareWrapPending` reports `hardware-wrap-pending` for `inspectMaterials()`.
 *
 * The probe seam (`setTexturedPbrHardwareWrapProbeForTest`) substitutes a stub shader
 * source with and without the passthrough line.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Sampler } from "../../../../packages/rendering/src/Sampler";
import {
  TexturedPBRMaterial,
  setTexturedPbrHardwareWrapProbeForTest
} from "../../../../packages/rendering/src/TexturedPBRMaterial";

const WITH_PASSTHROUGH = `
vec2 applySamplerWrap(vec2 uv, vec2 mode) {
  if (mode.x > 1.5 && mode.x < 2.5) return clamp(uv, 0.0, 1.0);
  if (mode.x > 2.5) return uv; // mode > 2.5 passthrough
  return fract(uv);
}`;
const WITHOUT_PASSTHROUGH = `
vec2 applySamplerWrap(vec2 uv, vec2 mode) {
  if (mode.x > 1.5) return clamp(uv, 0.0, 1.0);
  return fract(uv);
}`;

afterEach(() => setTexturedPbrHardwareWrapProbeForTest(null));

const make = (hardwareWrap?: boolean) =>
  new TexturedPBRMaterial({
    baseColorSampler: Sampler.trilinear({ wrap: "repeat" }),
    ...(hardwareWrap !== undefined ? { hardwareWrap } : {})
  });

describe("Q-01-2 hardware wrap gating", () => {
  it("stub shader WITH `mode > 2.5`: hardwareWrap emits wrap code 3.0", () => {
    setTexturedPbrHardwareWrapProbeForTest(() => WITH_PASSTHROUGH);
    const material = make(true);
    expect(material.hardwareWrapPending).toBe(false);
    expect(material.getParameter("u_baseColorTextureWrap")).toEqual([3, 3]);
  });

  it("stub shader WITHOUT the passthrough: hardwareWrap is ignored and reports pending", () => {
    setTexturedPbrHardwareWrapProbeForTest(() => WITHOUT_PASSTHROUGH);
    const material = make(true);
    expect(material.hardwareWrapPending).toBe(true);
    // Wrap code stays the legacy enum — repeat sampler → [1, 1].
    expect(material.getParameter("u_baseColorTextureWrap")).toEqual([1, 1]);
  });

  it("stub shader without the passthrough + no option: no pending flag", () => {
    setTexturedPbrHardwareWrapProbeForTest(() => WITHOUT_PASSTHROUGH);
    const material = make();
    expect(material.hardwareWrapPending).toBe(false);
    expect(material.getParameter("u_baseColorTextureWrap")).toEqual([1, 1]);
  });

  it("real registered legacy shader currently lacks the passthrough — inert today", () => {
    setTexturedPbrHardwareWrapProbeForTest(null);
    const material = make(true);
    // Fails open until PRD 01 lands the Q-01-2 patch; flip these two lines then.
    expect(material.hardwareWrapPending).toBe(true);
    expect(material.getParameter("u_baseColorTextureWrap")).toEqual([1, 1]);
  });
});

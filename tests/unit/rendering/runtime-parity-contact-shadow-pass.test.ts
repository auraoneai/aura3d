import { describe, expect, it } from "vitest";
import { createContactShadowPass } from "../../../packages/rendering/src/production-runtime";

describe("V7 contact shadow pass", () => {
  it("creates reusable layered contact-shadow proxy render items with honest parity diagnostics", () => {
    const pass = createContactShadowPass({
      bounds: { min: [-1, -0.5, -0.4], max: [1, 0.7, 0.6] },
      floorY: -0.55,
      labelPrefix: "unit-contact",
      lightDirection: [-0.4, -0.8, -0.3],
      softness: 0.8
    });

    expect(pass.renderItems).toHaveLength(7);
    expect(pass.renderItems.map((item) => item.label)).toEqual([
      "unit-contact-ambient-penumbra",
      "unit-contact-directional-penumbra",
      "unit-contact-cast-falloff",
      "unit-contact-cast-core",
      "unit-contact-near-contact",
      "unit-contact-core-contact",
      "unit-contact-asset-anchor"
    ]);
    expect(pass.diagnostics).toMatchObject({
      mode: "directional-multi-lobe-receiver-contact",
      parity: "not-full-contact-shadow",
      quality: "bounded-receiver-contact",
      layerCount: 7,
      floorY: -0.55
    });
    expect(pass.diagnostics.receiverGap).toBeCloseTo(0.05, 6);
    expect(pass.diagnostics.gapFade).toBeGreaterThan(0);
    expect(pass.diagnostics.gapFade).toBeLessThan(1);
    expect(pass.diagnostics.gapSpread).toBeGreaterThan(1);
    expect(pass.diagnostics.radiusX).toBeGreaterThan(pass.diagnostics.radiusZ);
    expect(pass.diagnostics.softness).toBe(0.8);
    expect(Math.abs(pass.diagnostics.directionalOffset[0])).toBeGreaterThan(0);
    expect(pass.diagnostics.lightAngleFade).toBeGreaterThan(0.88);
    expect(pass.diagnostics.projectionStretch).toBeGreaterThan(1);
    expect(Math.abs(pass.diagnostics.projectionYawRadians)).toBeGreaterThan(0.1);
    pass.dispose();
    expect(() => pass.renderItems[0]?.geometry.vertexBuffer.getAttribute(0, "position")).toThrow(/disposed/i);
  });

  it("fades and spreads bounded contact shadows as the receiver gap increases", () => {
    const grounded = createContactShadowPass({
      bounds: { min: [-0.6, -0.54, -0.6], max: [0.6, 0.54, 0.6] },
      floorY: -0.58,
      labelPrefix: "grounded-contact",
      lightDirection: [-0.4, -0.8, -0.3],
      opacity: 1
    });
    const floating = createContactShadowPass({
      bounds: { min: [-0.6, -0.14, -0.6], max: [0.6, 0.94, 0.6] },
      floorY: -0.58,
      labelPrefix: "floating-contact",
      lightDirection: [-0.4, -0.8, -0.3],
      opacity: 1
    });

    const groundedCore = grounded.renderItems.find((item) => item.label?.endsWith("-core-contact"));
    const floatingCore = floating.renderItems.find((item) => item.label?.endsWith("-core-contact"));
    if (!groundedCore || !floatingCore) throw new Error("Missing contact core layer.");
    if (!groundedCore.material || !floatingCore.material) throw new Error("Missing contact core material.");
    const groundedAlpha = groundedCore.material.getParameter("u_baseColor") as readonly [number, number, number, number];
    const floatingAlpha = floatingCore.material.getParameter("u_baseColor") as readonly [number, number, number, number];

    expect(grounded.diagnostics.receiverGap).toBeCloseTo(0.04, 6);
    expect(floating.diagnostics.receiverGap).toBeCloseTo(0.44, 6);
    expect(floating.diagnostics.gapFade).toBeLessThan(grounded.diagnostics.gapFade);
    expect(floating.diagnostics.gapSpread).toBeGreaterThan(grounded.diagnostics.gapSpread);
    expect(floating.diagnostics.radiusX).toBeGreaterThan(grounded.diagnostics.radiusX);
    expect(floating.diagnostics.projectionStretch).toBeCloseTo(grounded.diagnostics.projectionStretch, 6);
    expect(floatingAlpha[3]).toBeLessThan(groundedAlpha[3]);

    grounded.dispose();
    floating.dispose();
  });

  it("adds bounded footprint contact lobes from projected caster points", () => {
    const pass = createContactShadowPass({
      bounds: { min: [-1, -0.5, -1], max: [1, 1, 1] },
      floorY: -0.55,
      labelPrefix: "footprint-contact",
      footprintPoints: [
        [-0.35, -0.5, -0.25],
        [0.35, -0.48, 0.25],
        [8, -0.45, 8]
      ]
    });

    expect(pass.diagnostics.footprintPointCount).toBe(3);
    expect(pass.diagnostics.footprintLayerCount).toBe(3);
    expect(pass.renderItems.filter((item) => item.label?.includes("-footprint-"))).toHaveLength(3);
    expect(pass.renderItems).toHaveLength(10);

    pass.dispose();
  });
});

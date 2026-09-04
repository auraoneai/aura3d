import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import {
  consolidateBatchedMeshes,
  instancingPathMatrix,
  resetInstancingFallbackWarnings,
  warnOnInstancingFallback,
} from "../../../packages/rendering/src/InstancingDiagnostics";
import {
  computeObliqueClipProjection,
  computePlanarMirrorCamera,
  createSsrPassDescriptor,
  resolveGlassRefractionParams,
  resolveWaterReflectionRefraction,
} from "../../../packages/rendering/src/PlanarReflection";
import {
  createContactTelemetryFrame,
  resolveContactDarkening,
  resolveDepthAwareContactRadius,
} from "../../../packages/rendering/src/shadows/ContactShadows";

/**
 * B2 contact system + B4 reflection math + D1 instancing diagnostics
 * (muse3jsparity-PRD). Wording stays bounded: no "SSR"/"ray-traced" claims
 * outside the package-level descriptor; browser pixel proof is blocked
 * (no Playwright browsers in this environment).
 */

describe("B2 depth-aware contact radius", () => {
  it("hardens (shrinks) with caster distance and clamps at the falloff", () => {
    expect(resolveDepthAwareContactRadius(1, 0, 2)).toBe(1);
    const near = resolveDepthAwareContactRadius(1, 0.5, 2);
    const far = resolveDepthAwareContactRadius(1, 1.5, 2);
    expect(far).toBeLessThan(near);
    expect(resolveDepthAwareContactRadius(1, 2, 2)).toBeCloseTo(0.35, 5);
    expect(resolveDepthAwareContactRadius(1, 100, 2)).toBeCloseTo(0.35, 5);
    expect(() => resolveDepthAwareContactRadius(-1, 0, 2)).toThrow(RangeError);
  });
});

describe("B2 capsule/plane occluders + bent normal", () => {
  const receiver = {
    objectId: "hero-boot",
    receiverPosition: [0, 0.05, 0] as const,
    receiverNormal: [0, 1, 0] as const,
  };

  it("darkens a receiver standing on a capsule occluder", () => {
    const sample = resolveContactDarkening(receiver, [
      { id: "leg", kind: "capsule", segmentA: [0, 0, 0], segmentB: [0, 1, 0], radius: 0.25 },
    ]);
    expect(sample.objectId).toBe("hero-boot");
    expect(sample.contactDarkening).toBeGreaterThan(0);
    expect(sample.contactDarkening).toBeLessThanOrEqual(0.55);
    const length = Math.hypot(...sample.bentNormal);
    expect(length).toBeCloseTo(1, 5);
  });

  it("darkens a receiver resting on a ground plane", () => {
    const sample = resolveContactDarkening(receiver, [
      { id: "ground", kind: "plane", planeNormal: [0, 1, 0], planeOffset: 0 },
    ]);
    expect(sample.contactDarkening).toBeGreaterThan(0);
    // Bent normal tilts toward the plane normal contribution.
    expect(sample.bentNormal[1]).toBeGreaterThan(0.9);
  });

  it("leaves distant receivers untouched with a wide hardened radius", () => {
    const sample = resolveContactDarkening(
      { ...receiver, receiverPosition: [5, 5, 5] },
      [{ id: "leg", kind: "capsule", segmentA: [0, 0, 0], segmentB: [0, 1, 0], radius: 0.25 }]
    );
    expect(sample.contactDarkening).toBe(0);
    expect(sample.radius).toBeLessThanOrEqual(0.5);
  });

  it("rejects malformed occluders", () => {
    expect(() => resolveContactDarkening(receiver, [{ id: "x", kind: "capsule" }])).toThrow(/segmentA/);
    expect(() =>
      resolveContactDarkening(receiver, [{ id: "x", kind: "plane", planeNormal: [0, 0, 0] }])
    ).toThrow(RangeError);
  });
});

describe("B2 per-object frame-stable telemetry", () => {
  it("reports zero delta for identical frames and tracks drift", () => {
    const samples = [
      { objectId: "a", contactDarkening: 0.4, bentNormal: [0, 1, 0] as const, radius: 0.5 },
      { objectId: "b", contactDarkening: 0.1, bentNormal: [0, 1, 0] as const, radius: 0.5 },
    ];
    const first = createContactTelemetryFrame(0, samples, null);
    expect(first.maxFrameDelta).toBe(0);
    const same = createContactTelemetryFrame(1, samples, first);
    expect(same.maxFrameDelta).toBe(0);
    const drifted = createContactTelemetryFrame(
      2,
      [{ ...samples[0]!, contactDarkening: 0.45 }, samples[1]!],
      same
    );
    expect(drifted.maxFrameDelta).toBeCloseTo(0.05, 6);
  });
});

describe("B4 planar mirror + oblique clip", () => {
  it("mirrors eye/target across the plane and flips the Y basis", () => {
    const mirror = computePlanarMirrorCamera([0, 2, 4], [0, 0, 0], [0, 1, 0], 0);
    expect(mirror.eye).toEqual([0, -2, 4]);
    expect(mirror.target).toEqual([0, 0, 0]);
    expect(mirror.reflectionMatrix[5]).toBe(-1);
    expect(mirror.clipPlane).toEqual([0, -1, 0, 0.001]);
    expect(() => computePlanarMirrorCamera([0, 2, 4], [0, 0, 0], [0, 1, 0], Number.NaN)).toThrow(RangeError);
  });

  it("splices the clip plane into the projection (Reflector convention)", () => {
    const perspective = [
      1.81, 0, 0, 0,
      0, 2.41, 0, 0,
      0, 0, -1.002, -1,
      0, 0, -0.2, 0,
    ];
    const result = computeObliqueClipProjection(perspective, [0, -1, 0, 0.5]);
    // Elements [2]/[6]/[10]/[14] carry the scaled plane; the rest is untouched.
    expect(result.projectionMatrix[0]).toBe(perspective[0]);
    expect(result.projectionMatrix[5]).toBe(perspective[5]);
    expect(result.projectionMatrix[8]).toBe(perspective[8]);
    // Plane [0,-1,0,0.5] has no x-component, so element 2 stays 0; the
    // y/z/w rows carry the scaled plane.
    expect(result.projectionMatrix[2]).toBe(0);
    expect(result.projectionMatrix[6]).not.toBe(perspective[6]);
    expect(result.projectionMatrix[10]).not.toBe(perspective[10]);
    expect(result.projectionMatrix[14]).not.toBe(perspective[14]);
    // The plane equation holds for a point on the clip plane in camera space.
    const [a, b, c, d] = result.clipPlane;
    expect(a).toBe(0);
    expect(b).toBe(-1);
    expect(c).toBe(0);
    expect(d).toBe(0.5);
    expect(() => computeObliqueClipProjection([1, 2, 3], [0, 0, 0, 0])).toThrow(RangeError);
  });
});

describe("B4 glass + water + SSR descriptor", () => {
  it("tints glass transmittance by thickness and blurs by roughness", () => {
    const thin = resolveGlassRefractionParams({ thickness: 0.1, roughness: 0 });
    const thick = resolveGlassRefractionParams({ thickness: 3, roughness: 0.8 });
    expect(thin.transmittance).toBeGreaterThan(thick.transmittance);
    expect(thin.blurRadiusTexels).toBe(0);
    expect(thick.blurRadiusTexels).toBeGreaterThan(0);
    expect(thin.offsetScale).toBeLessThan(thick.offsetScale);
  });

  it("shifts water from refraction to reflection with depth", () => {
    const shallow = resolveWaterReflectionRefraction({ depth: 0.2 });
    const deep = resolveWaterReflectionRefraction({ depth: 8 });
    expect(shallow.refractionStrength).toBeGreaterThan(deep.refractionStrength);
    expect(deep.reflectionStrength).toBeGreaterThan(shallow.reflectionStrength);
    expect(deep.depthTint[2]).toBeLessThan(shallow.depthTint[2]);
    expect(() => resolveWaterReflectionRefraction({ depth: -1 })).toThrow(RangeError);
  });

  it("keeps the SSR descriptor package-level with explicit caps", () => {
    const ssr = createSsrPassDescriptor({ width: 1280, height: 720 });
    expect(ssr.enabled).toBe(true);
    expect(ssr.packageLevel).toBe(true);
    expect(ssr.resolutionScale).toBe(0.5);
    expect(ssr.maxSteps).toBe(32);
    expect(() => createSsrPassDescriptor({ width: 1280, height: 720, maxSteps: 128 })).toThrow(RangeError);
    expect(() => createSsrPassDescriptor({ width: 0, height: 720 })).toThrow(RangeError);
  });
});

describe("D1 instancing fallback diagnostics", () => {
  it("warns once per material+reason and reports the expansion", () => {
    resetInstancingFallbackWarnings();
    const messages: string[] = [];
    const first = warnOnInstancingFallback({
      material: "city-glass",
      requestedInstances: 9000,
      drawnBatches: 3,
      reason: "instance-count-exceeds-device-limit",
      onWarning: (message) => messages.push(message),
    });
    expect(first.warned).toBe(true);
    expect(first.diagnostic).toContain("city-glass");
    expect(first.diagnostic).toContain("9000");
    const second = warnOnInstancingFallback({
      material: "city-glass",
      requestedInstances: 9000,
      drawnBatches: 3,
      reason: "instance-count-exceeds-device-limit",
      onWarning: (message) => messages.push(message),
    });
    expect(second.warned).toBe(false);
    expect(messages).toHaveLength(1);
    resetInstancingFallbackWarnings();
  });

  it("documents the skinned path as explicitly unsupported", () => {
    const matrix = instancingPathMatrix();
    expect(matrix.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(["skinned", "normal-mapped", "emissive", "unlit", "textured-pbr"])
    );
    expect(matrix.find((entry) => entry.path === "skinned")!.support).toBe("unsupported");
    expect(matrix.find((entry) => entry.path === "normal-mapped")!.support).toBe("supported");
  });

  it("consolidates static meshes with draw + memory telemetry", () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const material = new UnlitMaterial({ name: "batch-test" });
    const items = Array.from({ length: 6 }, (_, i) => ({
      geometry: Geometry.triangle(),
      material,
      modelMatrix: identity,
      batchKey: "city-block",
      label: `block-${i}`,
    }));
    const result = consolidateBatchedMeshes(items);
    expect(result.draws).toBe(1);
    expect(result.telemetry.inputMeshes).toBe(6);
    expect(result.telemetry.drawsSaved).toBe(5);
    expect(result.telemetry.indexBytes).toBe(6 * 3 * 4);
    expect(result.telemetry.vertexBytes).toBeGreaterThan(0);
  });
});

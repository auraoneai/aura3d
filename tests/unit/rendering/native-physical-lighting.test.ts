import { describe, expect, it, vi } from "vitest";
import { IESLoader, parseIES, sampleIESProfile } from "../../../packages/assets/src/IESLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { createPhysicalMaterialSpec } from "../../../packages/engine/src/material-physical/PhysicalMaterialSpec";
import { analyzeMaterialExtensionCombination } from "../../../packages/rendering/src/materials/MaterialExtensions";
import { createLightingRig, evaluateLightingRigLightAt, type LightingRigLightDescriptor } from "../../../packages/rendering/src/LightingRig";

// Independently authored numerical fixture: candela rows at horizontal 0° and 90°.
const twoDimensional = `IESNA:LM-63-2002
[TEST] Aura synthetic measurements
TILT=NONE
2 1000 2 3 2 1 2 0 0 0
0.5 1 40
0 90 180
0 90
100 40 0
100 80 0`;

const rotational = `IESNA91
TILT=INCLUDE
1 2
0 90
1 0.5
1 -1 2 3 1 1 1 0 0 0
1 0.5 25
0 90 180
0
100 50 0`;

const texture = { kind: "aura-asset-ref", type: "texture", id: "gobo", url: "/gobo.png" } as const;
const light: LightingRigLightDescriptor = {
  id: "test-spot", kind: "spot", role: "key", color: [1, 1, 1], intensity: 50,
  position: [0, 0, 0], direction: [0, 0, -1], range: 8,
  spotAngle: Math.PI / 4, penumbra: 0, width: 0, height: 0, castsShadow: true, claimBoundary: "reference"
};

describe("bounded LM-63 photometry", () => {
  it("interpolates two dimensions and reflects quadrant symmetry without multiplying by the lamp count", () => {
    const profile = parseIES(twoDimensional);
    expect(profile).toMatchObject({ lampCount: 2, units: "meters", symmetry: "quadrant", lumensPerLamp: 1000 });
    expect(sampleIESProfile(profile, 45, 45)).toBeCloseTo(80);
    expect(sampleIESProfile(profile, 45, 135)).toBeCloseTo(80);
    expect(sampleIESProfile(profile, 45, 225)).toBeCloseTo(80);
    expect(sampleIESProfile(profile, 45, -45)).toBeCloseTo(80);
    expect(sampleIESProfile(parseIES(twoDimensional, { lampMultiplier: 4 }), 45, 45)).toBeCloseTo(320);
  });

  it("uses the embedded tilt and historical lamp factors linearly, with rotational symmetry", () => {
    const profile = parseIES(rotational, { tiltDegrees: 45, lampMultiplier: 2 });
    expect(profile.lumensPerLamp).toBeNull();
    expect(profile.tiltMultiplier).toBeCloseTo(0.75);
    expect(sampleIESProfile(profile, 90, 0)).toBeCloseTo(75);
    expect(sampleIESProfile(profile, 90, 210)).toBeCloseTo(75);
    // The reserved field in 1995+ must never extinguish the lamp.
    expect(sampleIESProfile(parseIES(twoDimensional.replace("0.5 1 40", "0.5 0 40")), 90, 0)).toBe(40);
    const ies2019 = parseIES(twoDimensional.replace("IESNA:LM-63-2002", "IES:LM-63-2019").replace("0.5 1 40", "0.5 1.10000 40"));
    expect(ies2019.generationType).toBe(1.1);
    expect(sampleIESProfile(ies2019, 90, 0)).toBe(40);
  });

  it("handles bilateral and full-circle tables, including wrapping", () => {
    const half = parseIES(twoDimensional.replace("0 90\n100 40 0", "0 180\n100 40 0"));
    expect(sampleIESProfile(half, 90, 90)).toBe(60);
    expect(sampleIESProfile(half, 90, 270)).toBe(60);
    const full = parseIES(twoDimensional.replace("0 90\n100 40 0", "0 360\n100 40 0"));
    expect(sampleIESProfile(full, 90, 180)).toBe(60);
    expect(sampleIESProfile(full, 90, -180)).toBe(60);
  });

  it("rejects malformed, excessively large, unsupported, negative, nonfinite and inconsistent inputs", () => {
    expect(() => parseIES(twoDimensional.replace("TILT=NONE", "TILT=lamp.tlt"))).toThrow(/external TILT/i);
    expect(() => parseIES(twoDimensional.replace("3 2 1 2", "3 2 2 2"))).toThrow(/Type-C/);
    expect(() => parseIES(twoDimensional.replace("0 90 180", "0 90 90"))).toThrow(/strictly increasing/);
    expect(() => parseIES(twoDimensional.replace("100 80 0", "100 -1 0"))).toThrow(/candela value/);
    expect(() => parseIES(twoDimensional.replace("100 80 0", "100 80"))).toThrow(/candela value/);
    expect(() => parseIES(twoDimensional + " 5")).toThrow(/unexpected data/);
    expect(() => parseIES(twoDimensional, { maxSamples: 5 })).toThrow(/sample count/);
    expect(() => parseIES(twoDimensional, { lampMultiplier: Number.NaN })).toThrow(/lampMultiplier/);
    expect(() => sampleIESProfile(parseIES(twoDimensional), 181, 0)).toThrow(/verticalDegrees/);
  });

  it("supports admitted .ies assets and propagates cancellation and progress", async () => {
    const loader = new IESLoader();
    expect(loader.canLoad({ url: "/test.IES?v=2" })).toBe(true);
    expect(loader.canLoad({ url: "/test.txt" })).toBe(false);
    const progress = vi.fn();
    const old = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async () => new Response(twoDimensional)) as typeof fetch;
      const profile = await loader.load({ url: "/test.ies", onProgress: progress, credentials: "include", headers: { "x-fixture": "yes" } }, new LoadContext());
      expect(sampleIESProfile(profile, 45, 45)).toBe(80);
      expect(globalThis.fetch).toHaveBeenCalledWith("/test.ies", expect.objectContaining({ credentials: "include", headers: { "x-fixture": "yes" } }));
      expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "complete", url: "/test.ies" });
      await expect(loader.load({ url: "/test.ies", integrity: { version: 1, digest: "0".repeat(64) } }, new LoadContext())).rejects.toThrow(/integrity/i);
      const controller = new AbortController();
      controller.abort();
      await expect(loader.load({ url: "/test.ies" }, new LoadContext({ signal: controller.signal }))).rejects.toThrow(/aborted/i);
    } finally { globalThis.fetch = old; }
  });
});

describe("photometric light contracts", () => {
  it("retains typed profiles and projection in builders and rejects invalid options", () => {
    const profile = { profile: parseIES(twoDimensional), scale: 2, rotation: Math.PI / 2 };
    const projectedImage = { texture: texture as never, scale: [1, 1] as const };
    const spot = lights.spot({ target: [1, 0, 0], shadow: true, photometricProfile: profile, projectedImage }).toJSON();
    expect(spot).toMatchObject({ photometricProfile: profile, projectedImage, shadow: true });
    expect(lights.point({ target: [0, -1, 0], photometricProfile: profile }).toJSON()).toMatchObject({ target: [0, -1, 0], photometricProfile: profile });
    expect(() => lights.spot({ photometricProfile: { ...profile, scale: -1 } })).toThrow(/scale/);
    expect(() => lights.spot({ photometricProfile: { ...profile, profile: { ...profile.profile, candela: [1] } } })).toThrow(/table dimensions/);
    expect(() => lights.spot({ projectedImage: { ...projectedImage, scale: [1, 0] } })).toThrow(/scale/);
    expect(() => lights.spot({ projectedImage: { texture: { ...texture, type: "model" } as never } })).toThrow(/texture/);
  });

  it("evaluates projection orientation and shadow visibility in light space", () => {
    const candidate = { ...light, photometricProfile: { profile: parseIES(twoDimensional), scale: 2 }, projectedImage: { texture, rotation: Math.PI / 2 } };
    const result = evaluateLightingRigLightAt(candidate, [1, 0, -2], { shadowVisibility: 0.5, sampleProjection: (u, v) => [u, v, 0.5] });
    expect(result.uv?.[0]).toBeCloseTo(0.5);
    expect(result.uv?.[1]).toBeCloseTo(0.75);
    expect(result.candela).toBeCloseTo(200 - (Math.atan(0.5) * 180 / Math.PI) * 120 / 90);
    expect(result.rgb[0]).toBeCloseTo(result.candela * 0.25);
    expect(result.rgb[1]).toBeCloseTo(result.candela * 0.375);
    const radial = { ...light, photometricProfile: { profile: parseIES(twoDimensional) } };
    const zero = evaluateLightingRigLightAt(radial, [1, 0, -1]);
    const quarterTurn = evaluateLightingRigLightAt({ ...radial, photometricProfile: { ...radial.photometricProfile, rotation: -Math.PI / 2 } }, [1, 0, -1]);
    expect(zero.candela).toBeCloseTo(70);
    expect(quarterTurn.candela).toBeCloseTo(90);
    expect(evaluateLightingRigLightAt(candidate, [1, 0, -2], { shadowVisibility: 0, sampleProjection: () => [1, 1, 1] }).rgb).toEqual([0, 0, 0]);
    expect(evaluateLightingRigLightAt(candidate, [0, 0, 1], { sampleProjection: () => [1, 1, 1] }).rgb).toEqual([0, 0, 0]);
    expect(() => evaluateLightingRigLightAt(candidate, [0, 0, -2])).toThrow(/sampler/);
  });

  it("reports an explicit fallback and refuses silent renderer substitution", () => {
    const photometricProfiles = { "industrial-key": { profile: parseIES(twoDimensional) } };
    expect(() => createLightingRig({ preset: "industrial", photometricProfiles })).toThrow(/unsupportedFallback/);
    const rig = createLightingRig({ preset: "industrial", photometricProfiles, unsupportedFallback: "unmodified", includeUnsupportedDiagnostics: false });
    expect(rig.lights[0]?.photometricProfile).toEqual(photometricProfiles["industrial-key"]);
    expect(rig.diagnostics.unsupportedFeatures).toContain("ies-photometric-profile");
  });
});

describe("physical material bounds", () => {
  it("preserves old iridescence ranges and supports independent endpoint overrides", () => {
    const defaults = createPhysicalMaterialSpec().spec;
    expect(defaults).toMatchObject({ diffuseRoughness: 0, retroreflection: 0, iridescenceThicknessRange: [100, 400] });
    expect(createPhysicalMaterialSpec({ iridescenceThicknessRange: [125, 325] }).spec.iridescenceThicknessRange).toEqual([125, 325]);
    expect(createPhysicalMaterialSpec({ diffuseRoughness: 1, retroreflection: 0.5, iridescenceThicknessRange: [125, 325], iridescenceThicknessMinimum: 80, iridescenceThicknessMaximum: 450 }).spec).toMatchObject({ diffuseRoughness: 1, retroreflection: 0.5, iridescenceThicknessRange: [80, 450], iridescenceThicknessMinimum: 80, iridescenceThicknessMaximum: 450 });
  });

  it("preserves reversed film endpoints and rejects invalid controls", () => {
    expect(() => createPhysicalMaterialSpec({ diffuseRoughness: -0.01 })).toThrow();
    expect(() => createPhysicalMaterialSpec({ retroreflection: 1.01 })).toThrow();
    expect(() => createPhysicalMaterialSpec({ diffuseRoughness: NaN })).toThrow();
    expect(createPhysicalMaterialSpec({ iridescenceIOR: 4, iridescenceThicknessMinimum: 401 }).spec).toMatchObject({
      iridescenceIOR: 4, iridescenceThicknessRange: [401, 400]
    });
    expect(() => createPhysicalMaterialSpec({ iridescenceThicknessMaximum: Infinity })).toThrow();
    expect(createPhysicalMaterialSpec({ iridescenceThicknessRange: [400, 100] }).spec.iridescenceThicknessRange).toEqual([400, 100]);
    expect(() => createPhysicalMaterialSpec({ iridescenceIOR: 0.9 })).toThrow();
    expect(() => createPhysicalMaterialSpec({ iridescenceIOR: Infinity })).toThrow();
  });

  it("reports backend-specific missing UV and transmission resources", () => {
    const webgl = analyzeMaterialExtensionCombination({ backend: "webgl2", extensions: ["transmission"], requiredUvSets: 2, availableUvSets: 1, transmissionBackdropAvailable: false });
    const webgpu = analyzeMaterialExtensionCombination({ backend: "webgpu", extensions: ["transmission"], requiredUvSets: 2, availableUvSets: 1, transmissionBackdropAvailable: false });
    expect(webgl.backend).toBe("webgl2");
    expect(webgpu.backend).toBe("webgpu");
    expect(webgl.support).toBe("unsupported");
    expect(webgpu.support).toBe("unsupported");
    expect(webgl.limitations).toEqual(expect.arrayContaining([expect.stringMatching(/requires 2 UV channels/), expect.stringMatching(/backdrop is unavailable/)]));
    expect(webgpu.limitations).toContainEqual(expect.stringMatching(/WebGPU physical material support is experimental/));
    const missing = analyzeMaterialExtensionCombination({ backend: "webgl2", extensions: ["texture-transform"], requiredUvSets: 1, requiredTextureBindings: 2 });
    expect(missing.support).toBe("bounded");
    expect(missing.limitations).toEqual(expect.arrayContaining([expect.stringMatching(/UV-channel availability was not supplied/), expect.stringMatching(/texture-binding limit was not supplied/)]));
    const insufficient = analyzeMaterialExtensionCombination({ backend: "webgl2", extensions: ["texture-transform"], requiredTextureBindings: 3, maxTextureBindings: 2 });
    expect(insufficient.support).toBe("unsupported");
    expect(insufficient.limitations).toContainEqual(expect.stringMatching(/exceeding the webgl2 limit of 2/));
    expect(() => analyzeMaterialExtensionCombination({ backend: "invalid" as never, extensions: [] })).toThrow(/backend/);
    expect(() => analyzeMaterialExtensionCombination({ backend: "webgl2", extensions: [], availableUvSets: -1 })).toThrow(/availableUvSets/);
    expect(() => analyzeMaterialExtensionCombination({ backend: "webgpu", extensions: [], maxTextureBindings: NaN })).toThrow(/maxTextureBindings/);
  });
});

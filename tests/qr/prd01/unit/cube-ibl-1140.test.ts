/**
 * #1140 follow-up: generated programs sample the prefiltered cube/PMREM
 * environment the flag-off shader uses (prd04 / production-runtime HDR envs
 * carry `environmentCubeMapTexture`), instead of dropping IBL entirely.
 */

import { describe, expect, it } from "vitest";
import { Sampler, Texture, TextureBinding } from "@aura3d/rendering";
import { applyGeneratedEnvironmentMapUniforms, forwardPassFeatureAxes } from "../../../../packages/rendering/src/ForwardPass";

const cubeTexture = () => new Texture({ width: 2, height: 2, format: "rgba16f", colorSpace: "linear", cubeFaces: (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({ face, mipLevels: [{ width: 2, height: 2, data: new Uint16Array(16) }] })) });
const flatTexture = () => new Texture({ width: 2, height: 1, colorSpace: "linear", data: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]) });
const cube = () => new TextureBinding({ name: "u_environmentCubeMapTexture", texture: cubeTexture(), sampler: new Sampler({ minFilter: "linear-mipmap-linear" }), expectedColorSpace: "linear", expectedDimension: "cube" });
const flat = () => new TextureBinding({ name: "u_environmentMapTexture", texture: flatTexture(), expectedColorSpace: "linear" });
const shaderWith = (...names: string[]) => ({ reflection: { uniforms: new Map(names.map((n) => [n, {}])) } }) as never;

describe("forwardPassFeatureAxes environment axis", () => {
  it("prefers the prefiltered cube when present (flag-off mixes to the cube whenever it is enabled)", () => {
    expect(forwardPassFeatureAxes({ environmentLighting: { color: [1, 1, 1], intensity: 1, environmentCubeMapTexture: cube(), environmentMapTexture: flat() } as never }, false).environment).toBe("pmrem-cube");
    expect(forwardPassFeatureAxes({ environmentLighting: { color: [1, 1, 1], intensity: 1, environmentCubeMapTexture: cube() } as never }, false).environment).toBe("pmrem-cube");
  });
  it("falls back to equirect for a 2D-only map and to none for procedural-only", () => {
    expect(forwardPassFeatureAxes({ environmentLighting: { color: [1, 1, 1], intensity: 1, environmentMapTexture: flat() } as never }, false).environment).toBe("equirect");
    expect(forwardPassFeatureAxes({ environmentLighting: { color: [1, 1, 1], intensity: 1, proceduralMap: {} } as never }, false).environment).toBe("none");
    // A texture-less cube binding (placeholder) never selects a sampler.
    expect(forwardPassFeatureAxes({ environmentLighting: { color: [1, 1, 1], intensity: 1, environmentCubeMapTexture: new TextureBinding({ name: "u_environmentCubeMapTexture", required: false }) } as never }, false).environment).toBe("none");
  });
});

describe("applyGeneratedEnvironmentMapUniforms (cube)", () => {
  const env = (extra: Record<string, unknown> = {}) => ({
    color: [1, 1, 1], intensity: 0.1,
    environmentCubeMapTexture: cube(), environmentMapTexture: flat(),
    environmentMapIntensity: 0.8, environmentMapRotation: 0.25, environmentMapMipCount: 9, environmentMapEncoding: "linear",
    ...extra
  }) as never;

  it("binds u_environmentCubeMap + intensity/rotation/maxLod/encoding for a cube program", () => {
    const e = env();
    const uniforms = new Map<string, unknown>();
    applyGeneratedEnvironmentMapUniforms(e, { label: "t" } as never, shaderWith("u_environmentCubeMap"), uniforms as never);
    const bound = uniforms.get("u_environmentCubeMap") as TextureBinding;
    expect(bound.name).toBe("u_environmentCubeMap");
    expect(bound.texture).toBe((e as { environmentCubeMapTexture: TextureBinding }).environmentCubeMapTexture.texture);
    expect(bound.texture?.dimension).toBe("cube");
    expect(uniforms.has("u_environmentMap")).toBe(false);
    expect(uniforms.get("u_environmentMapIntensity")).toBe(0.8);
    expect(uniforms.get("u_environmentMapRotation")).toBe(0.25);
    expect(uniforms.get("u_environmentMapMaxLod")).toBe(8);
    expect(uniforms.get("u_environmentMapEncoding")).toBe(2);
  });

  it("uses the per-item probe cube and its mip count (PRD-02 S12)", () => {
    const probe = cube();
    const uniforms = new Map<string, unknown>();
    applyGeneratedEnvironmentMapUniforms(env(), { label: "t", environmentCube: probe, environmentCubeMip: 5 } as never, shaderWith("u_environmentCubeMap"), uniforms as never);
    expect((uniforms.get("u_environmentCubeMap") as TextureBinding).texture).toBe(probe.texture);
    expect(uniforms.get("u_environmentMapMaxLod")).toBe(4);
  });

  it("still binds the 2D map for an equirect program", () => {
    const e = env();
    const uniforms = new Map<string, unknown>();
    applyGeneratedEnvironmentMapUniforms(e, { label: "t" } as never, shaderWith("u_environmentMap"), uniforms as never);
    expect((uniforms.get("u_environmentMap") as TextureBinding).texture).toBe((e as { environmentMapTexture: TextureBinding }).environmentMapTexture.texture);
    expect(uniforms.has("u_environmentCubeMap")).toBe(false);
  });

  it("zeroes the contribution when the cube program has no cube to sample", () => {
    const uniforms = new Map<string, unknown>();
    applyGeneratedEnvironmentMapUniforms(env({ environmentCubeMapTexture: undefined }), { label: "t" } as never, shaderWith("u_environmentCubeMap"), uniforms as never);
    expect(uniforms.get("u_environmentMapIntensity")).toBe(0);
    expect(uniforms.has("u_environmentCubeMap")).toBe(false);
  });
});

describe("#1140: OutputPass dithering default", () => {
  it("is off by default (three.js parity); app.setOutput({ dither: true }) opts in", async () => {
    const { DEFAULT_OUTPUT_DITHERING } = await import("../../../../packages/rendering/src/Renderer");
    expect(DEFAULT_OUTPUT_DITHERING).toBe(false);
  });
});

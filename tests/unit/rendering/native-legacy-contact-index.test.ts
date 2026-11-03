import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PointLight } from "@aura3d/scene";
import { CLUSTER_TILE_SIZE, createClusteredForwardLighting } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { createDefaultShaderLibrary, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_PBR_SHADER_NAME, DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME, DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibrary";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection";

const keys = [DEFAULT_PBR_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME, DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_NAME];
const validator = process.env.A3D_GLSL_VALIDATOR ?? "glslangValidator";
const glslangAvailable = spawnSync(validator, ["--version"], { stdio: "ignore" }).status === 0;

describe("legacy contact mask light selection", () => {
  it.each(keys)("gates the selected light in %s for packed and clustered lists", name => {
    const source = createDefaultShaderLibrary().compileSource(name);
    expect(reflectShaderSources(source).uniforms.has("u_contactShadowLightIndex")).toBe(true);
    expect(source.fragment).toContain("lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0");
    expect(source.fragment).toContain("int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices");
    expect(source.fragment).toContain(`floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(${CLUSTER_TILE_SIZE}.0))`);
    // The selected source is light 2. A packed list and a permuted cluster
    // must both mask only its radiance, independent of its loop position.
    const light = [4, 7, 10], mask = 0.25, selected = 2;
    const shade = (indices: readonly number[]) => indices.reduce((sum, index) => sum + light[index]! * (index === selected ? mask : 1), 0);
    expect(shade([0, 1, 2])).toBe(13.5);
    expect(shade([2, 0, 1])).toBe(13.5);
    expect(shade([0, 1])).toBe(11);
  });

  it("uses the same tile as the producer at a non-divisible viewport edge", () => {
    const matrix = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const light = { kind: "point" as const, color: [1, 1, 1] as const, intensity: 1,
      position: [0.1, 0, 0] as const, direction: [0, 0, -1] as const, range: 0.02,
      spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: new PointLight("edge") };
    const clustered = createClusteredForwardLighting([light], 100, 70, matrix);
    try {
      expect(clustered.diagnostics.requestedPerCluster).toEqual([1, 0, 0, 0]);
      expect(Math.floor(55 / CLUSTER_TILE_SIZE)).toBe(0);
      expect(Math.floor(55 / (100 / clustered.diagnostics.gridWidth))).toBe(1);
    } finally { clustered.dispose(); }
  });

  it.runIf(glslangAvailable)("links each base program and every textured extension variant offline", () => {
    const library = createDefaultShaderLibrary();
    const sources = keys.map(name => library.compileSource(name));
    for (const variant of library.get(DEFAULT_TEXTURED_PBR_SHADER_NAME).variants ?? []) {
      sources.push(library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, variant.name));
    }
    const directory = mkdtempSync(join(tmpdir(), "a3d-contact-index-"));
    try {
      for (const [index, source] of sources.entries()) {
        const vertex = join(directory, `${index}.vert`), fragment = join(directory, `${index}.frag`);
        writeFileSync(vertex, source.vertex);
        writeFileSync(fragment, source.fragment);
        const result = spawnSync(validator, ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(`${result.stdout}${result.stderr}`, source.label).not.toMatch(/ERROR/);
        expect(result.status, source.label).toBe(0);
        // The runtime binder requires a linked viewport uniform before it
        // uploads *any* clustered data. Textured extension variants explicitly
        // disable clustering and therefore need not reflect it.
        if (index < keys.length) expect(result.stdout, source.label).toMatch(/^u_clusterViewportSize:/m);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

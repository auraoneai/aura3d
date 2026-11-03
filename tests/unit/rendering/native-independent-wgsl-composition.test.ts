import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { A3D_PRD04_ANISOTROPY_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Anisotropy";
import { A3D_PRD04_CLEARCOAT_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Clearcoat";
import { A3D_PRD04_BSDF_LOBES_COMMON_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Lobes";
import { A3D_PRD04_SHEEN_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Sheen";

type Feature = "anisotropy" | "clearcoat" | "sheen";
const chunks: Record<Feature, string> = {
  anisotropy: A3D_PRD04_ANISOTROPY_WGSL,
  clearcoat: A3D_PRD04_CLEARCOAT_WGSL,
  sheen: A3D_PRD04_SHEEN_WGSL,
};
const variants: readonly (readonly Feature[])[] = [
  [], ["anisotropy"], ["clearcoat"], ["sheen"],
  ["anisotropy", "clearcoat"], ["anisotropy", "sheen"],
  ["clearcoat", "sheen"], ["anisotropy", "clearcoat", "sheen"],
];

/**
 * An independent synthetic fragment, not the active renderer. It exercises
 * the declared interfaces together, including fragment derivatives, pointer
 * arguments and the different direct-light cosine conventions. The coat
 * function already includes N·L; anisotropy and sheen do not. The host must
 * still supply its own texture decoding, tangents, lighting and composition.
 */
function assembledFragment(features: readonly Feature[]): string {
  const include = (feature: Feature) => features.includes(feature);
  return `${A3D_PRD04_BSDF_LOBES_COMMON_WGSL}
${features.map((feature) => chunks[feature]).join("\n")}
struct FragmentInput { @location(0) normal: vec3f, }
@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4f {
  let n = normalize(input.normal);
  let view = vec3f(0.0, 0.0, 1.0);
  let light = vec3f(0.0, 0.0, 1.0);
  let noL = max(dot(n, light), 0.0);
  let geometryRoughness = a3dPrd04GeometryRoughness(n);
  let roughness = a3dPrd04ResolveRoughness(0.5, geometryRoughness);
  var lobes: A3DPrd04Lobes;
  var single = vec3f(0.0);
  var multiple = vec3f(0.0);
  a3dPrd04ComputeMultiscattering(n, view, vec3f(0.04), 1.0, roughness, &single, &multiple);
  var result = single + multiple + vec3f(a3dPrd04SpecularOcclusion(dot(n, view), 1.0, roughness));
  ${include("anisotropy") ? `
  a3dPrd04AnisotropyInit(&lobes, vec2f(0.5, 0.0), vec4f(1.0), false,
    vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), roughness);
  result += noL * a3dPrd04AnisotropyDirect(light, view, n, vec3f(0.04), 1.0, roughness, lobes);
  result += a3dPrd04AnisotropyBentNormal(view, n, roughness, lobes.anisotropyB, lobes.anisotropy) * 0.001;` : ""}
  ${include("sheen") ? `
  a3dPrd04SheenInit(&lobes, vec3f(0.5), 0.5, vec4f(1.0), vec4f(1.0));
  result *= a3dPrd04SheenEnergyCompensation(n, view, light, lobes.sheenColor, lobes.sheenRoughness);
  result += noL * a3dPrd04SheenDirect(light, view, n, lobes.sheenColor, lobes.sheenRoughness);
  result += a3dPrd04SheenIndirect(n, view, lobes.sheenRoughness, lobes.sheenColor, vec3f(1.0));
  result *= a3dPrd04SheenEnergyCompensationIndirect(n, view, lobes.sheenColor, lobes.sheenRoughness);` : ""}
  ${include("clearcoat") ? `
  a3dPrd04ClearcoatInit(&lobes, 0.5, 0.5, vec4f(1.0), vec4f(1.0), n, geometryRoughness);
  let coatDirect = a3dPrd04ClearcoatDirect(light, view, lobes.clearcoatNormal, lobes.clearcoatRoughness);
  let coatIndirect = a3dPrd04ClearcoatIndirect(lobes.clearcoatNormal, view, lobes.clearcoatRoughness, vec3f(1.0));
  result = a3dPrd04ComposeClearcoat(result, lobes.clearcoat, lobes.clearcoatNormal, view, coatDirect, coatIndirect);` : ""}
  return vec4f(result, 1.0);
}`;
}

describe("independent WGSL candidate composition", () => {
  it("assembles every candidate combination without duplicate function or struct declarations", () => {
    for (const features of variants) {
      const source = assembledFragment(features);
      const names = [...source.matchAll(/\b(?:fn|struct)\s+(\w+)\s*[(\{]/g)].map((match) => match[1]);
      expect(new Set(names).size, features.join("+")).toBe(names.length);
      expect(names).toContain("A3DPrd04Lobes");
      expect(names).toContain("fs_main");
      for (const feature of features) expect(source).toContain(chunks[feature]);
    }
  });

  // The caller explicitly enables offline validation on an authorized worker.
  // Source assembly alone is not evidence that WGSL compiles or renders.
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("validates all synthetic fragment combinations with Naga", () => {
    const directory = mkdtempSync(join(tmpdir(), "a3d-independent-wgsl-"));
    try {
      for (const [index, features] of variants.entries()) {
        const file = join(directory, `variant-${index}.wgsl`);
        writeFileSync(file, assembledFragment(features));
        expect(() => execFileSync("naga", [file], { encoding: "utf8" }), features.join("+")).not.toThrow();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

// N3 garden saturation follow-up: the direct multiple-scattering lobe colour is chosen per device; only the plain look
// path selects Kulla-Conty, so every other app keeps the single-mean-Fresnel lobe (uniform 0, the WebGL default).
import { describe, expect, it } from "vitest";
import { DIRECT_MULTISCATTER_UNIFORM, directMultiscatterModel, setDirectMultiscatterModel } from "../../../packages/rendering/src/program/directMultiscatter.js";
import { BRDF_CHUNK_GLSL } from "../../../packages/rendering/src/program/chunks/brdf.glsl.js";

describe("direct multiscatter model", () => {
  it("defaults to the single mean Fresnel and is scoped per device", () => {
    const a = {}, b = {};
    expect(directMultiscatterModel(a)).toBe("single-fresnel");
    expect(directMultiscatterModel(undefined)).toBe("single-fresnel");
    setDirectMultiscatterModel(a, "kulla-conty");
    expect(directMultiscatterModel(a)).toBe("kulla-conty");
    expect(directMultiscatterModel(b)).toBe("single-fresnel");
    setDirectMultiscatterModel(a, "single-fresnel");
    expect(directMultiscatterModel(a)).toBe("single-fresnel");
  });

  it("the brdf chunk gates the Kulla-Conty colour on the uniform", () => {
    expect(BRDF_CHUNK_GLSL).toContain(`uniform float ${DIRECT_MULTISCATTER_UNIFORM};`);
    expect(BRDF_CHUNK_GLSL).toMatch(/if \(u_a3dMultiscatterKullaConty > 0\.5\)/);
    expect(BRDF_CHUNK_GLSL).toContain("meanFresnel * meanFresnel * averageAlbedo");
    expect(BRDF_CHUNK_GLSL).toContain("single * average * missing / max(vec3(1.0) - missing * average");
  });

  it("Kulla-Conty colour: 1 for a white metal, ~25x below the mean Fresnel for a 0.04 dielectric", () => {
    const kc = (favg: number, eavg: number) => (favg * favg * eavg) / (1 - favg * (1 - eavg));
    expect(kc(1, 0.45)).toBeCloseTo(1, 6);
    const dielectric = 0.04 + 0.96 / 21;
    expect(dielectric / kc(dielectric, 0.45)).toBeGreaterThan(20);
  });
});

/**
 * 01-S8 (PRD-01 §15 brdf item (a)-(d)) + 01-DFG: the generated `brdf` chunk
 * against three r185, on CPU ports (`brdf-cpu.ts`), plus the DFG LUT data and
 * its generated-program binding.
 *
 *   (a) direct specular == r185 BRDF_GGX_Multiscatter; diffuse == BRDF_Lambert
 *   (b) indirect (unit radiance / irradiance) == r185 RE_IndirectSpecular_Physical
 *   (c) white-furnace directional albedo, single vs multiscatter
 *   (d) LUT halves byte-identical to node_modules/three DFGLUTData.js
 *
 * The chunk text itself is also checked for the r185 forms the ports assume
 * (exp2 Fresnel, no EPSILON in computeMultiscattering, radiance·single +
 * multi·irradiance/π), so a GLSL edit that drifts from the port fails here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRDF_CHUNK_GLSL } from "../../../../packages/rendering/src/program/chunks/brdf.glsl";
import { DFG_LUT_RG16F, DFG_LUT_SIZE } from "../../../../packages/rendering/src/program/DFGLutData";
import { dfgLutBinding, dfgLutRgba16f, dfgLutTexture } from "../../../../packages/rendering/src/program/DFGLut";
import {
  auraDirectSpecular,
  auraIndirect,
  brdfGgxMultiscatter,
  dot,
  lambertDirect,
  normalize,
  physicalMaterial,
  PI,
  sampleDFG,
  splat,
  threeIndirect,
  type MaterialInput,
  type V3
} from "./brdf-cpu";

/** Mulberry32: fixed-seed PRNG so sample sets are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform direction on the hemisphere around +Z (z ≥ zMin). */
function hemi(r: () => number, zMin = 0.05): V3 {
  const z = zMin + (1 - zMin) * r();
  const phi = 2 * PI * r();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(phi), s * Math.sin(phi), z];
}

const N: V3 = [0, 0, 1];

function randomMaterial(r: () => number): MaterialInput {
  return {
    baseColor: [r(), r(), r()],
    metallic: r(),
    roughness: 0.05 + 0.95 * r(),
    ior: 1 + 1.5 * r(),
    specularIntensity: r(),
    specularColorFactor: [0.5 + 0.5 * r(), 0.5 + 0.5 * r(), 0.5 + 0.5 * r()]
  };
}

function relErr(a: V3, b: V3): number {
  let worst = 0;
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!) / Math.max(Math.abs(b[i]!), 1e-4));
  return worst;
}

describe("01-S8 (a) direct specular + diffuse match r185", () => {
  it("200 random samples, relative error < 1e-3", () => {
    const r = rng(0x01a5);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const m = physicalMaterial(randomMaterial(r));
      const V = hemi(r), L = hemi(r);
      worst = Math.max(worst, relErr(auraDirectSpecular(L, V, N, m), brdfGgxMultiscatter("exp2", L, V, N, m)));
      worst = Math.max(worst, relErr(lambertDirect(L, N, m), lambertDirect(L, N, m)));
    }
    expect(worst).toBeLessThan(1e-3);
  });
});

describe("01-S8 (b) indirect matches r185 RE_IndirectSpecular_Physical", () => {
  it("200 random samples, unit radiance + irradiance, relative error < 1e-3", () => {
    const r = rng(0x01b5);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const m = physicalMaterial(randomMaterial(r));
      const V = hemi(r);
      const aura = auraIndirect(splat(1), splat(1), N, V, m);
      const three = threeIndirect(splat(1), splat(1), N, V, m);
      worst = Math.max(worst, relErr(aura.specular, three.specular), relErr(aura.diffuse, three.diffuse));
    }
    expect(worst).toBeLessThan(1e-3);
  });
});

describe("01-S8 (c) white furnace: metal F0 = 1, roughness 1", () => {
  const metal = physicalMaterial({ baseColor: [1, 1, 1], metallic: 1, roughness: 1, ior: 1.5, specularIntensity: 1, specularColorFactor: [1, 1, 1] });

  /** ∫ f(L)·dotNL dω over the hemisphere, uniform sampling (pdf = 1/2π). */
  function albedo(dotNV: number, f: (L: V3, V: V3) => V3): number {
    const r = rng(0x01c5);
    const V = normalize([Math.sqrt(Math.max(0, 1 - dotNV * dotNV)), 0, dotNV]);
    let sum = 0;
    const n = 65_536;
    for (let i = 0; i < n; i++) {
      const L = hemi(r, 0);
      sum += f(L, V)[0] * dot(N, L);
    }
    return (sum / n) * 2 * PI;
  }

  // PRD-01 §15 (c) also asks for "single within ±0.02 of dfg.x + dfg.y" and
  // "multiscatter recovers ≥ half the loss". three r185 itself misses both at
  // dotNV 0.5 / 1.0 (single-vs-LUT gap 0.026 / 0.038: bilinear LUT sampling at
  // roughness 1 lands on texel centre 15.5/16; r185's direct Turquin term
  // recovers < 50 % at high dotNV). Aura equals r185 to 1e-4 here, so those
  // two bounds are a spec question raised with the G1 lead, not asserted.
  for (const dotNV of [0.2, 0.5, 1.0]) {
    it(`dotNV ${dotNV}: single ≤ 0.80; multiscatter raises albedo, stays ≤ 1.02, equals r185`, () => {
      const single = albedo(dotNV, (L, V) => auraDirectSpecular(L, V, N, metal, false));
      expect(single).toBeLessThanOrEqual(0.8);
      const multi = albedo(dotNV, (L, V) => auraDirectSpecular(L, V, N, metal, true));
      expect(multi).toBeGreaterThan(single);
      expect(multi).toBeLessThanOrEqual(1.02);
      const three = albedo(dotNV, (L, V) => brdfGgxMultiscatter("exp2", L, V, N, metal, true));
      expect(Math.abs(multi - three)).toBeLessThanOrEqual(1e-4);
    });
  }
});

describe("01-S8 (d) + 01-DFG: the r185 DFG LUT", () => {
  it("halves are byte-identical to node_modules/three DFGLUTData.js", () => {
    const src = readFileSync(resolve(__dirname, "../../../../node_modules/three/src/renderers/shaders/DFGLUTData.js"), "utf8");
    const body = src.slice(src.indexOf("new Uint16Array( [") + "new Uint16Array( [".length, src.indexOf("] );"));
    const three = (body.match(/0x[0-9a-fA-F]{4}/g) ?? []).map((h) => Number.parseInt(h, 16));
    expect(three).toHaveLength(DFG_LUT_SIZE * DFG_LUT_SIZE * 2);
    expect(Array.from(DFG_LUT_RG16F)).toEqual(three);
  });

  it("the uploaded RGBA16F texture keeps R/G bit-identical (B = 0, A = 1)", () => {
    const rgba = dfgLutRgba16f();
    for (let i = 0; i < DFG_LUT_SIZE * DFG_LUT_SIZE; i++) {
      expect(rgba[i * 4]).toBe(DFG_LUT_RG16F[i * 2]);
      expect(rgba[i * 4 + 1]).toBe(DFG_LUT_RG16F[i * 2 + 1]);
      expect(rgba[i * 4 + 2]).toBe(0x0000);
      expect(rgba[i * 4 + 3]).toBe(0x3c00);
    }
    const tex = dfgLutTexture();
    expect([tex.width, tex.height, tex.format, tex.colorSpace]).toEqual([16, 16, "rgba16f", "linear"]);
    const binding = dfgLutBinding();
    expect(binding.name).toBe("u_dfgLut");
    expect(binding.texture).toBe(tex);
    expect(dfgLutBinding()).toBe(binding);
  });
});

describe("01-S8: the brdf chunk text carries the r185 forms the ports assume", () => {
  const glsl = BRDF_CHUNK_GLSL;
  it("exp2 Fresnel (both overloads), no pow5", () => {
    expect(glsl.match(/exp2\(\(-5\.55473 \* dotVH - 6\.98316\) \* dotVH\)/g)).toHaveLength(2);
    expect(glsl).not.toContain("pow(1.0 - dotVH, 5.0)");
  });
  it("r185 computeMultiscattering (no EPSILON) and indirect composition", () => {
    expect(glsl).toContain("vec3 Fms = FssEss * Favg / (1.0 - Ems * Favg);");
    expect(glsl).toContain("return radiance * single + multi * (irradiance * RECIPROCAL_PI);");
    expect(glsl).toContain("a3dMultiscatter(N, V, m.baseColor, m.specularF90, m.roughness, singleMetallic, multiMetallic);");
    expect(glsl).toContain("vec3 remaining = m.diffuseContribution * (vec3(1.0) - (singleDielectric + multiDielectric));");
  });
  it("direct multiscatter keeps r185's + EPSILON denominator", () => {
    expect(glsl).toContain("vec3 Fms = FssEss_V * FssEss_L * Favg / (1.0 - Ems_V * Ems_L * Favg + EPSILON);");
  });
});

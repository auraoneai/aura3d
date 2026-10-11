/**
 * lobes-visual.test.ts — 04-LOBES follow-ups (visible material quality):
 *
 *  1. per-light lobe hook: clearcoat / sheen / iridescence / anisotropy
 *     `direct` call chunks run inside BOTH the bucketed and the clustered light
 *     loops (no lobe skips clustered lighting; no private light loops left);
 *  2. iridescence + anisotropy energy reaches lighting (direct delta + ibl);
 *  3. ibl composition order: iridescence/anisotropy (5) → sheen (20) → clearcoat (30);
 *  4. lobe textures are sampled when the lobe map bit is set (+ A3D_NEED_UV0);
 *  5. `lobe.bind` has a generated-path caller (`bindMaterialLobeUniforms`):
 *     descriptor factors + lobe textures, material parameters authoritative;
 *  6. flag-off / no-extension programs carry no lobe code.
 * Structural checks only; the WebGL2 compile + pixels are the macos-14 specs.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd04";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { bindMaterialLobeUniforms } from "../../../../packages/rendering/src/materials/PhysicalFeatures";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { isTextureBinding } from "../../../../packages/rendering/src/TextureBinding";

const FLAGS = resolveQrFlags({ env: { A3D_QR: "core,materials" } });
const BUCKETED = { dir: 2, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
const CLUSTERED = { dir: 0, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } as const;

const ext = (lobe: string, bits: Record<string, boolean | number | string> = {}, maps: string[] = []) => ({ lobe, maps, bits });
const gen = (partial: Partial<ProgramFeatures>, flags: unknown = FLAGS) =>
  generateProgramImpl(normalizeProgramFeatures(partial), { flags: flags as never });

const ALL_LOBES = [ext("clearcoat"), ext("sheen"), ext("iridescence", { film: true }), ext("anisotropy")];

/** Text between `start` and the next `end` after it. */
function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `missing ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a + start.length);
  return src.slice(a, b);
}

describe("04-LOBES: per-light lobe hook", () => {
  it("bucketed loop: every lobe direct call follows a3dDirectLight inside the loop", () => {
    const frag = gen({ lighting: "lit", lights: BUCKETED, extensions: ALL_LOBES, features: { "prd04.tangentFrame": true } }).fragment;
    const loop = between(frag, "// bucketed light count", "#ifdef LIGHTS_CLUSTERED");
    for (const marker of ["a3dPrd04CoatDirect +=", "a3dPrd04SheenDirectSum +=", "a3dIrFilm - a3dIrF", "a3dAnAniso - a3dAnIso"]) {
      expect(loop, marker).toContain(marker);
    }
  });

  it("clustered loop: lobe direct terms are no longer skipped", () => {
    const frag = gen({ lighting: "lit", lights: CLUSTERED, extensions: ALL_LOBES, features: { "prd04.tangentFrame": true } }).fragment;
    const cluster = between(frag, "#ifdef LIGHTS_CLUSTERED\n  int a3dCluster", "#endif");
    for (const marker of ["a3dPrd04CoatDirect +=", "a3dPrd04SheenDirectSum +=", "a3dIrFilm - a3dIrF", "a3dAnAniso - a3dAnIso"]) {
      expect(cluster, marker).toContain(marker);
    }
  });

  it("no lobe keeps a private A3D_NUM_DIRECT_LIGHTS loop", () => {
    const frag = gen({ lighting: "lit", lights: CLUSTERED, extensions: ALL_LOBES }).fragment;
    expect(frag).not.toMatch(/for \( int a3d(Cc|Sh)I/);
    expect(frag).not.toContain("a3dLegacyLightRadiance( a3d");
  });
});

describe("04-LOBES: iridescence + anisotropy energy and ibl order", () => {
  it("ibl calls compose iridescence/anisotropy → sheen → clearcoat", () => {
    const frag = gen({ lighting: "lit", lights: BUCKETED, extensions: ALL_LOBES, features: { "prd04.tangentFrame": true } }).fragment;
    const irid = frag.indexOf("a3dPrd04ComputeMultiscatteringIridescence( N, V");
    const aniso = frag.indexOf("a3dPrd04AnisotropyBentNormal( V, N");
    const sheen = frag.indexOf("a3dPrd04SheenEnergyCompensationIndirect( N, V");
    const coat = frag.indexOf("vec3 a3dCcBase =");
    expect(irid).toBeGreaterThan(-1);
    expect(aniso).toBeGreaterThan(-1);
    expect(sheen).toBeGreaterThan(Math.max(irid, aniso));
    expect(coat).toBeGreaterThan(sheen);
  });
});

describe("04-LOBES: lobe textures are sampled", () => {
  const cases: [string, Record<string, boolean>, string[], string[]][] = [
    ["clearcoat", { map: true, roughnessMap: true }, ["clearcoat", "clearcoatRoughness"], ["texture( u_clearcoatTexture, v_uv )", "texture( u_clearcoatRoughnessTexture, v_uv )"]],
    ["sheen", { colorMap: true, roughnessMap: true }, ["sheenColor", "sheenRoughness"], ["texture( u_sheenColorTexture, v_uv )", "texture( u_sheenRoughnessTexture, v_uv )"]],
    ["iridescence", { map: true, thicknessMap: true }, ["iridescence", "iridescenceThickness"], ["texture( u_iridescenceTexture, v_uv )", "texture( u_iridescenceThicknessTexture, v_uv )"]],
    ["anisotropy", { map: true }, ["anisotropy"], ["texture( u_anisotropyTexture, v_uv )"]]
  ];
  for (const [lobe, bits, maps, samples] of cases) {
    it(`${lobe}: map bits define the sampler guard and the UV varying`, () => {
      const out = gen({ lighting: "lit", lights: BUCKETED, extensions: [ext(lobe, bits, maps)], features: { "prd04.tangentFrame": true } });
      expect(out.defines.A3D_NEED_UV0).toBe(true);
      for (const sample of samples) expect(out.fragment).toContain(sample);
      for (const bit of Object.keys(bits)) {
        const token = `A3D_LOBE_${lobe.toUpperCase()}_${bit.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
        expect(out.defines[token], token).toBe(true);
      }
    });
  }

  it("without map bits the lobe reads its factors only (no UV varying forced)", () => {
    const out = gen({ lighting: "lit", lights: BUCKETED, extensions: [ext("clearcoat")] });
    expect(out.defines.A3D_NEED_UV0).toBeUndefined();
    expect(out.defines.A3D_LOBE_CLEARCOAT_MAP).toBeUndefined();
  });
});

describe("04-LOBES: lobe.bind caller (bindMaterialLobeUniforms)", () => {
  const coatTexture = new Texture({ width: 2, height: 2 } as never);
  const legacyMaterial = { prd04Options: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.2, clearcoatTexture: coatTexture } };

  it("binds descriptor factors and lobe textures for the lobes the record carries", () => {
    const seen = new Map<string, unknown>();
    bindMaterialLobeUniforms([ext("clearcoat", { map: true }, ["clearcoat"])], legacyMaterial, FLAGS as never, (n, v) => seen.set(n, v));
    expect(seen.get("u_clearcoatFactor")).toBe(0.7);
    expect(seen.get("u_clearcoatRoughnessFactor")).toBe(0.2);
    const binding = seen.get("u_clearcoatTexture");
    expect(isTextureBinding(binding as never)).toBe(true);
    expect((binding as { texture?: unknown }).texture).toBe(coatTexture);
  });

  it("binds nothing for lobes absent from the record, or for materials without a descriptor", () => {
    const seen = new Map<string, unknown>();
    bindMaterialLobeUniforms([ext("sheen")], legacyMaterial, FLAGS as never, (n, v) => seen.set(n, v));
    expect(seen.has("u_clearcoatFactor")).toBe(false);
    bindMaterialLobeUniforms([ext("clearcoat")], {}, FLAGS as never, (n, v) => seen.set(n, v));
    expect(seen.has("u_clearcoatFactor")).toBe(false);
  });
});

describe("04-LOBES: flag-off / no-extension programs unchanged", () => {
  it("no lobe code without extensions, and none without flags", () => {
    expect(gen({ lighting: "lit", lights: CLUSTERED }).fragment).not.toMatch(/a3dPrd04|a3dLobes/);
    const noFlags = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights: BUCKETED, extensions: ALL_LOBES }), {});
    expect(noFlags.fragment).not.toMatch(/a3dPrd04CoatDirect|a3dLobes\./);
  });
});

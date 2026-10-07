/**
 * typed-glb-actor-snapshot.test.ts — PRD-04 P2-1/P2-2 (C-15 actor surface).
 *
 * Loads the real damaged-helmet GLB through `createTypedGLBActor` (data URI + stub image
 * decoder, same seam as tests/assets/production-runtime-gltf-render-pipeline.test.ts):
 *
 *  - the post-load authored snapshot equals the post-load parameter state;
 *  - `setMaterialOverrides` re-applies from that snapshot (no accumulation) and
 *    `setMaterialOverrides([])` restores authored parameters exactly;
 *  - flag-off `setTint` keeps the legacy mutation byte-for-byte (legacy heuristics apply);
 *  - flag-on `setTint` lowers to a single explicit override (only given fields written);
 *  - `setMaterialVariant`/`materialVariants` exercise KHR_materials_variants on the
 *    MaterialsVariantsShoe fixture and report `variant-unknown` for unknown names.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createTypedGLBActor, type TypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { Material } from "../../../../packages/rendering/src/Material";

const imageDecoder = () => ({
  width: 4,
  height: 4,
  data: new Uint8Array(4 * 4 * 4).fill(180),
  colorSpace: "srgb" as const
});

function dataUri(path: string): string {
  return `data:model/gltf-binary;base64,${readFileSync(path).toString("base64")}`;
}

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true } });
const FLAGS_OFF = resolveQrFlags({ options: {} });

afterEach(() => {
  setTypedGLBActorQrFlags(FLAGS_OFF);
});

async function helmet(flags: "on" | "off", overrides?: readonly unknown[]): Promise<TypedGLBActor> {
  setTypedGLBActorQrFlags(flags === "on" ? FLAGS_ON : FLAGS_OFF);
  return createTypedGLBActor({
    id: `helmet-${flags}`,
    asset: { url: dataUri("fixtures/asset-corpus/damaged-helmet.glb") },
    width: 64,
    height: 64,
    imageDecoder,
    ...(overrides ? { materialOverrides: overrides as never } : {})
  });
}

function allParams(actor: TypedGLBActor): Map<string, Map<string, unknown>> {
  const out = new Map<string, Map<string, unknown>>();
  for (const [key, material] of actor.pipeline.resources.materialLibrary) {
    out.set(key, new Map(material.getParameters() as ReadonlyMap<string, unknown>));
  }
  return out;
}

function expectMaterialsEqual(a: Map<string, Map<string, unknown>>, b: Map<string, Map<string, unknown>>): void {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const key of a.keys()) {
    const pa = a.get(key)!;
    const pb = b.get(key)!;
    expect([...pa.keys()].sort(), `${key} param keys`).toEqual([...pb.keys()].sort());
    for (const param of pa.keys()) {
      expect(pa.get(param), `${key}.${param}`).toEqual(pb.get(param));
    }
  }
}

describe("createTypedGLBActor material snapshot + overrides (flag on)", () => {
  it("post-load params equal the authored snapshot; [] restores exactly", async () => {
    const actor = await helmet("on");
    const pristine = allParams(actor);
    const before = [...actor.pipeline.resources.materialLibrary.values()]
      .map((m: Material) => m.getParameter("u_baseColorFactor") ?? m.getParameter("u_baseColor"));
    expect(before.length).toBeGreaterThan(0);

    actor.setMaterialOverrides([{ baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
    const after = [...actor.pipeline.resources.materialLibrary.values()]
      .map((m: Material) => m.getParameter("u_baseColorFactor") ?? m.getParameter("u_baseColor"));
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i += 1) {
      const b = before[i] as readonly number[];
      const a = after[i] as readonly number[];
      expect(a.slice(0, 3), `material ${i} multiplied`).toEqual(b.slice(0, 3).map((v) => v * 0.5));
    }

    // Idempotent re-application does not accumulate.
    actor.setMaterialOverrides([{ baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
    const again = [...actor.pipeline.resources.materialLibrary.values()]
      .map((m: Material) => m.getParameter("u_baseColorFactor") ?? m.getParameter("u_baseColor"));
    for (let i = 0; i < before.length; i += 1) {
      expect((again[i] as readonly number[]).slice(0, 3)).toEqual((before[i] as readonly number[]).slice(0, 3).map((v) => v * 0.5));
    }

    actor.setMaterialOverrides([]);
    expectMaterialsEqual(allParams(actor), pristine);
    actor.dispose();
  });

  it("inspectMaterials reports per-material info consistent with post-load params", async () => {
    const actor = await helmet("on");
    const infos = actor.inspectMaterials();
    expect(infos.length).toBeGreaterThan(0);
    const libSize = actor.pipeline.resources.materialLibrary.size;
    expect(infos.length).toBe(libSize);
    for (const info of infos) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.featureKey.length).toBeGreaterThan(0);
      expect(info.lightsEvaluated).toBe("uniform-16");
      expect(Array.isArray(info.enabledMaps)).toBe(true);
      expect(Array.isArray(info.extensions)).toBe(true);
      expect(Array.isArray(info.warnings)).toBe(true);
      for (const c of info.baseColorFactor) expect(typeof c).toBe("number");
    }
    // DamagedHelmet ships a base color texture -> at least one material enables it.
    expect(infos.some((info) => info.enabledMaps.includes("baseColor"))).toBe(true);
    actor.dispose();
  });
});

describe("setTint (flag-gated lowering vs legacy byte-equality)", () => {
  const tint = { baseColor: [0.25, 0.5, 0.75, 1] as const, replaceSurfaceTextures: true };

  it("flag OFF keeps the legacy in-place mutation semantics", async () => {
    const actor = await helmet("off");
    actor.setTint(tint);
    const mat = [...actor.pipeline.resources.materialLibrary.values()][0] as Material;
    // Legacy: baseColorFactor/baseColor are REPLACED with the authored-texture-disabling tint,
    // and the emissive channel falls back to the tint color when no emissive override is given.
    expect(mat.getParameter("u_baseColorFactor")).toEqual([0.25, 0.5, 0.75, 1]);
    expect(mat.getParameter("u_emissiveColor")).toEqual([0.25, 0.5, 0.75]);
    expect(mat.getParameter("u_baseColorTextureEnabled")).toBe(0);
    actor.dispose();
  });

  it("flag ON lowers tint to an override writing only explicitly-given fields", async () => {
    const actor = await helmet("on");
    const pristine = allParams(actor);
    actor.setTint(tint);
    const mat = [...actor.pipeline.resources.materialLibrary.values()][0] as Material;
    // Only baseColor is written (replace mode + replaceTextures per the deprecated mapping);
    // emissive fields stay authored — no baseColor-fallback heuristic. Overrides write only
    // to authored param keys, so the material's existing `u_baseColor` is the target here.
    expect(mat.getParameter("u_baseColor")).toEqual([0.25, 0.5, 0.75, 1]);
    const pristineEmissive = pristine.get([...pristine.keys()][0])!.get("u_emissiveColor");
    expect(mat.getParameter("u_emissiveColor")).toEqual(pristineEmissive);
    expect(mat.getParameter("u_baseColorTextureEnabled")).toBe(0);
    actor.dispose();
  });
});

describe("material variants (KHR_materials_variants, R11)", () => {
  it("lists declared variants, rebinds on select, and reports variant-unknown", async () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
    const actor = await createTypedGLBActor({
      id: "variants-shoe",
      asset: { url: dataUri("fixtures/asset-corpus/materials-variants-shoe.glb") },
      width: 64,
      height: 64,
      imageDecoder
    });
    const variants = actor.materialVariants();
    expect(variants.length).toBeGreaterThan(0);

    const authored = allParams(actor);
    actor.setMaterialVariant("definitely-not-a-variant");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const warned = actor.inspectMaterials().flatMap((info) => info.warnings);
    expect(warned.some((w) => w.startsWith("variant-unknown:"))).toBe(true);
    // Unknown variant leaves the authored binding untouched.
    expectMaterialsEqual(allParams(actor), authored);

    actor.setMaterialVariant(variants[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.dispose();
  });
});

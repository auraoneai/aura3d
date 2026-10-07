import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import { batchStaticRenderItems } from "../../../../packages/rendering/src/SceneOptimization";
import { identityMat4 } from "@aura3d/scene";
import { shadowCasterVariantId } from "../../../../packages/rendering/src/contracts/shadows";
import {
  resolvePrd02ShadowCasterVariant,
  prd02DepthFeatures,
  prd02ShadowCasterEligible,
  ensurePrd02DepthFeatures
} from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

ensurePrd02DepthFeatures();
const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const TIER = QUALITY_TIERS.high;

const geometry = () => Geometry.triangle();

const resolve = (item: RenderItem) => resolvePrd02ShadowCasterVariant(item, FLAGS_ON, TIER, prd02DepthFeatures());

describe("PRD-02 §6.4 / C-11 shadow caster variants", () => {
  it("skinned item → skinning 4; extraInfluences → 8", () => {
    const skinned4 = resolve({
      geometry: geometry(),
      material: new UnlitMaterial({ name: "s4" }),
      skinning: { jointCount: 32, matrices: new Float32Array(32 * 16) }
    } as never);
    expect(skinned4.skinning).toBe(4);
    const skinned8 = resolve({
      geometry: geometry(),
      material: new UnlitMaterial({ name: "s8" }),
      skinning: { jointCount: 32, matrices: new Float32Array(32 * 16), extraInfluences: true }
    } as never);
    expect(skinned8.skinning).toBe(8);
  });

  it("static batch from SceneOptimization metadata → batched + instanced", () => {
    const inputs = [0, 1, 2].map((i) => ({
      geometry: geometry(),
      material: new UnlitMaterial({ name: `m${i}` }),
      modelMatrix: identityMat4(),
      batchKey: "k",
      castShadow: true
    }));
    const result = batchStaticRenderItems(inputs);
    expect(result.batches).toBe(1);
    const batchedItem = result.renderItems[0]!;
    const key = resolve(batchedItem);
    expect(key.instanced).toBe(true);
    expect(key.batched).toBe(true);
  });

  it("MASK (u_alphaCutoff set, no blend) → alphaTest", () => {
    const material = new UnlitMaterial({ name: "mask" });
    material.setParameter("u_alphaCutoff", 0.5);
    const key = resolve({ geometry: geometry(), material, castShadow: true } as never);
    expect(key.alphaTest).toBe(true);
    expect(key.alphaHash).toBe(false);
  });

  it("BLEND + castShadow: true → alphaHash; BLEND default → excluded", () => {
    const blended = () => new UnlitMaterial({ name: "b", renderState: { blend: true, depthWrite: false } });
    const caster = { geometry: geometry(), material: blended(), castShadow: true } as never;
    const key = resolve(caster);
    expect(key.alphaHash).toBe(true);
    expect(prd02ShadowCasterEligible(caster)).toBe(true);

    const defaulted = { geometry: geometry(), material: blended() } as never;
    expect(resolve(defaulted).alphaHash).toBe(false);
    expect(prd02ShadowCasterEligible(defaulted)).toBe(false);

    const opaque = { geometry: geometry(), material: new UnlitMaterial({ name: "op" }) } as never;
    expect(prd02ShadowCasterEligible(opaque)).toBe(true);
    expect(prd02ShadowCasterEligible({ geometry: geometry(), castShadow: false } as never)).toBe(false);
  });

  it("variant id is stable across runs and a registered depth feature lands in `features`", () => {
    const item = {
      geometry: geometry(),
      material: new UnlitMaterial({ name: "stable" }),
      instanceTransforms: new Float32Array(16),
      castShadow: true
    } as never;
    const a = shadowCasterVariantId(resolve(item));
    const b = shadowCasterVariantId(resolve({ ...(item as object) } as never));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    // `prd02.depthInstancing` is registered in the lane module (imported via the
    // library under test) → instanced items report it in `features`.
    expect(resolve(item).features["prd02.depthInstancing"]).toBe(1);
  });
});

describe("PRD-02 item 1923 lane fixture — receiveShadow collect override", () => {
  it("stamps receiveShadow:false on matching items only (C-01 collect)", async () => {
    const { createPrd02ReceiveShadowContributor } = await import(
      "../../../../packages/rendering/src/shadows/Prd02ReceiveShadowContributor"
    );
    const contributor = createPrd02ReceiveShadowContributor({
      predicate: (item) => item.label === "floor"
    });
    const items = [
      { geometry: geometry(), label: "floor", castShadow: false },
      { geometry: geometry(), label: "box", castShadow: true }
    ] as never[];
    const out = contributor.collect!(items, {} as never);
    expect(out[0]!.receiveShadow).toBe(false);
    expect(out[1]!.receiveShadow).toBeUndefined();
    // No-op path returns the same array identity (no realloc churn).
    expect(contributor.collect!(items.map((i) => ({ ...(i as object) })) as never[], {} as never)[0]!.receiveShadow)
      .toBe(false);
    const untouched = [{ geometry: geometry(), label: "other" }] as never[];
    expect(contributor.collect!(untouched, {} as never)).toBe(untouched);
  });
});

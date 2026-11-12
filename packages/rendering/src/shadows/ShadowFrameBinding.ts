/**
 * PRD-02 Phase 4 — binds a frame's `Prd02ShadowFrameUniforms` onto forward
 * materials as `u_prd02*` parameters, matching the C-11 chunk
 * (`a3d_prd02_shadow_lookup`). Runs inside the `prd02.shadows` contributor
 * pass so opaque draws that follow see this frame's shadow state — the same
 * per-frame material-mutation convention `ForwardPass.applyLightUniforms`
 * uses for `u_lightCount`/`u_lightData`.
 *
 * Flag: A3D_QR_LIGHTING (the contributor only exists under it).
 */

import type { Material } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderMaterial } from "../ForwardPass";
import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import type { Prd02ShadowFrameUniforms, ShadowSystemConfigInput } from "./ShadowSystem";

const COMPARE_SAMPLER = new Sampler({
  minFilter: "linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge",
  compare: "less-equal"
});

const RAW_SAMPLER = new Sampler({
  minFilter: "nearest",
  magFilter: "nearest",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

function freezeShadowBinding(binding: TextureBinding): TextureBinding {
  Object.freeze(binding.offset);
  Object.freeze(binding.scale);
  return Object.freeze(binding);
}

const compareNullBindings = new Map<string, TextureBinding>();
const compareTextureBindings = new WeakMap<object, Map<string, TextureBinding>>();
const rawTextureBindings = new WeakMap<object, TextureBinding>();
let rawNullBinding: TextureBinding | undefined;

function compareBinding(name: string, texture: Prd02ShadowFrameUniforms["cascadeTexture"]): TextureBinding {
  if (!texture) {
    let binding = compareNullBindings.get(name);
    if (!binding) {
      binding = freezeShadowBinding(new TextureBinding({ name, texture: null, sampler: COMPARE_SAMPLER, required: false }));
      compareNullBindings.set(name, binding);
    }
    return binding;
  }
  let byName = compareTextureBindings.get(texture);
  if (!byName) {
    byName = new Map();
    compareTextureBindings.set(texture, byName);
  }
  let binding = byName.get(name);
  if (!binding) {
    binding = freezeShadowBinding(new TextureBinding({ name, texture, sampler: COMPARE_SAMPLER, required: false }));
    byName.set(name, binding);
  }
  return binding;
}

function rawShadowBinding(texture: Prd02ShadowFrameUniforms["atlasTexture"]): TextureBinding {
  if (!texture) {
    rawNullBinding ??= freezeShadowBinding(
      new TextureBinding({ name: "u_prd02ShadowRaw", texture: null, sampler: RAW_SAMPLER, required: false })
    );
    return rawNullBinding;
  }
  let binding = rawTextureBindings.get(texture);
  if (!binding) {
    binding = freezeShadowBinding(new TextureBinding({ name: "u_prd02ShadowRaw", texture, sampler: RAW_SAMPLER, required: false }));
    rawTextureBindings.set(texture, binding);
  }
  return binding;
}

interface CachedMaterialShadowBinding {
  readonly normalBias: number;
  readonly strength: number;
  readonly mapSize: number;
  readonly cascade0: Prd02ShadowFrameUniforms["cascadeTexture"];
  readonly cascade1: Prd02ShadowFrameUniforms["cascadeTexture"];
  readonly cascade2: Prd02ShadowFrameUniforms["cascadeTexture"];
  readonly cascade3: Prd02ShadowFrameUniforms["cascadeTexture"];
  readonly atlasTexture: Prd02ShadowFrameUniforms["atlasTexture"];
}

const boundMaterialsByFrame = new WeakMap<Prd02ShadowFrameUniforms, WeakMap<Material, CachedMaterialShadowBinding>>();

/** The base `Material` an item's RenderMaterial resolves to. */
export function shadowBindingMaterial(material: RenderMaterial): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}

/**
 * Binds every `u_prd02*` shadow uniform the chunk declares onto `material`.
 * Deduplicates per unique `Material` within a frame (via optional caller `seen`
 * `Set<Material>` and per-`uniforms` `WeakMap`) so shared materials only write
 * the 16 parameters once per frame instead of `N * M` times.
 */
export function bindShadowFrameUniforms(
  material: Material,
  uniforms: Prd02ShadowFrameUniforms,
  config: Pick<ShadowSystemConfigInput, "normalBias" | "strength">,
  seen?: Set<Material>
): void {
  if (seen) {
    if (seen.has(material)) return;
    seen.add(material);
  } else {
    let perFrame = boundMaterialsByFrame.get(uniforms);
    if (!perFrame) {
      perFrame = new WeakMap();
      boundMaterialsByFrame.set(uniforms, perFrame);
    }
    const c0 = uniforms.cascadeTextures[0] ?? null;
    const c1 = uniforms.cascadeTextures[1] ?? null;
    const c2 = uniforms.cascadeTextures[2] ?? null;
    const c3 = uniforms.cascadeTextures[3] ?? null;
    const prev = perFrame.get(material);
    if (
      prev &&
      prev.normalBias === config.normalBias &&
      prev.strength === config.strength &&
      prev.mapSize === uniforms.mapSize &&
      prev.cascade0 === c0 &&
      prev.cascade1 === c1 &&
      prev.cascade2 === c2 &&
      prev.cascade3 === c3 &&
      prev.atlasTexture === uniforms.atlasTexture
    ) {
      return;
    }
    perFrame.set(material, {
      normalBias: config.normalBias,
      strength: config.strength,
      mapSize: uniforms.mapSize,
      cascade0: c0,
      cascade1: c1,
      cascade2: c2,
      cascade3: c3,
      atlasTexture: uniforms.atlasTexture
    });
  }
  for (let i = 0; i < 4; i += 1) {
    const name = `u_prd02CascadeCompare${i}`;
    material.setParameter(name, compareBinding(name, uniforms.cascadeTextures[i] ?? null));
  }
  material.setParameter("u_prd02LocalCompare", compareBinding("u_prd02LocalCompare", uniforms.atlasTexture));
  material.setParameter("u_prd02ShadowRaw", rawShadowBinding(uniforms.atlasTexture));
  material.setParameter("u_prd02CascadeMatrix", uniforms.cascadeMatrices);
  material.setParameter("u_prd02CascadeSplits", uniforms.cascadeSplits);
  material.setParameter("u_prd02CascadeTexelWorld", uniforms.cascadeTexelWorld);
  material.setParameter("u_prd02ShadowMapSize", uniforms.mapSize);
  material.setParameter("u_prd02NormalBias", config.normalBias);
  material.setParameter("u_prd02ShadowStrength", config.strength);
  material.setParameter("u_prd02ShadowAtlasRect", uniforms.localShadowData);
  material.setParameter("u_prd02LocalShadowMatrix", uniforms.localShadowMatrices);
  material.setParameter("u_prd02LocalShadowIndex", uniforms.localShadowIndexData);
}

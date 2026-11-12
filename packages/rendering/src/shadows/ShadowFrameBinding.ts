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

/** The base `Material` an item's RenderMaterial resolves to. */
export function shadowBindingMaterial(material: RenderMaterial): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}

/** Binds every `u_prd02*` shadow uniform the chunk declares onto `material`. */
export function bindShadowFrameUniforms(
  material: Material,
  uniforms: Prd02ShadowFrameUniforms,
  config: Pick<ShadowSystemConfigInput, "normalBias" | "strength">
): void {
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

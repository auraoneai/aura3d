/**
 * PRD-06 T0.10: skinning uniform application, shared by the forward pass and the
 * skinned depth/velocity variant feature (T0.13 `bindUniforms` reuses these).
 *
 * `applySkinningUniforms` and `createSkinningPaletteTexture` are the verbatim
 * pre-rebuild path (moved out of `forward/Deform.ts`, re-exported there for
 * existing callers). `applySkinningUniformsCached` is the `A3D_QR_ANIMATION`
 * path: the palette texture, sampler, bindings and zero-fill uniform block are
 * kept per `skinning.paletteKey` in a `SkinningPaletteTextureCache`, so a
 * >96-joint rig uploads one `texSubImage2D` per frame instead of allocating a
 * fresh RGBA32F texture, sampler and zero array per draw (E21).
 */

import type { SkinningPaletteBinding, SkinningPalettePath } from "./ForwardPass.js";
import type { RenderItem } from "./contracts/renderItem.js";
import { MAX_SKINNING_JOINTS, MAX_UNIFORM_SKINNING_JOINTS, isFiniteArrayLike } from "./ForwardPass.js";
import { Material } from "./Material.js";
import { RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice.js";
import { Sampler } from "./Sampler.js";
import { Texture } from "./Texture.js";
import { TextureBinding } from "./TextureBinding.js";
import type { SkinningPaletteTextureCache } from "./SkinningPaletteTextureCache.js";

export const SKINNING_PALETTE_TEXTURE_MAX_WIDTH = 1024;

export function ceilToMultiple(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

export function applySkinningUniforms(
  skinning: SkinningPaletteBinding,
  material: Material,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): SkinningPalettePath {
  if (!shader.reflection.uniforms.has("u_jointMatrices") || !shader.reflection.uniforms.has("u_jointCount")) {
    throw new RenderDeviceError("Skinned render item requires a shader with joint palette uniforms", "SKINNING_SHADER_CONTRACT", {
      material: material.name
    });
  }
  if (!Number.isInteger(skinning.jointCount) || skinning.jointCount <= 0 || skinning.jointCount > MAX_SKINNING_JOINTS) {
    throw new RenderDeviceError(`Skinning jointCount must be an integer in [1, ${MAX_SKINNING_JOINTS}]`, "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      maxUniformJoints: MAX_UNIFORM_SKINNING_JOINTS,
      maxJoints: MAX_SKINNING_JOINTS
    });
  }
  if (skinning.matrices.length !== skinning.jointCount * 16) {
    throw new RenderDeviceError("Skinning matrix palette length must equal jointCount * 16", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      matrixScalars: skinning.matrices.length
    });
  }
  if (!isFiniteArrayLike(skinning.matrices)) {
    throw new RenderDeviceError("Skinning matrix palette must contain finite values", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount
    });
  }
  uniforms.set("u_jointCount", skinning.jointCount);
  // Over the uniform-array limit the palette travels as an RGBA32F data texture, four
  // texels per matrix. A mat4 uniform costs four vec4 slots, so a uniform array cannot
  // be grown far enough for large rigs without exhausting MAX_VERTEX_UNIFORM_VECTORS.
  const path: SkinningPalettePath = skinning.jointCount > MAX_UNIFORM_SKINNING_JOINTS ? "data-texture" : "uniform-array";
  if (path === "data-texture") {
    if (!shader.reflection.uniforms.has("u_jointPaletteTexture") || !shader.reflection.uniforms.has("u_jointPaletteMode")) {
      throw new RenderDeviceError(
        `Skinning palettes above ${MAX_UNIFORM_SKINNING_JOINTS} joints require a shader with data-texture palette uniforms`,
        "SKINNING_SHADER_CONTRACT",
        { material: material.name, jointCount: skinning.jointCount }
      );
    }
    const texture = createSkinningPaletteTexture(skinning, material.name);
    uniforms.set("u_jointPaletteMode", 1);
    uniforms.set("u_jointPaletteTexture", new TextureBinding({
      name: "u_jointPaletteTexture",
      texture,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true
    }));
    uniforms.set("u_jointPaletteTextureSize", [texture.width, texture.height]);
    // The uniform array is still declared by the shader, so give it a valid value.
    uniforms.set("u_jointMatrices", new Float32Array(MAX_UNIFORM_SKINNING_JOINTS * 16));
    return path;
  }
  if (shader.reflection.uniforms.has("u_jointPaletteMode")) {
    uniforms.set("u_jointPaletteMode", 0);
    if (shader.reflection.uniforms.has("u_jointPaletteTextureSize")) uniforms.set("u_jointPaletteTextureSize", [1, 1]);
    if (shader.reflection.uniforms.has("u_jointPaletteTexture")) {
      uniforms.set("u_jointPaletteTexture", new TextureBinding({ name: "u_jointPaletteTexture", required: false }));
    }
  }
  uniforms.set("u_jointMatrices", skinning.matrices);
  return path;
}

export function createSkinningPaletteTexture(skinning: SkinningPaletteBinding, materialName: string): Texture {
  const texelsPerMatrix = 4;
  const totalTexels = skinning.jointCount * texelsPerMatrix;
  const width = Math.min(SKINNING_PALETTE_TEXTURE_MAX_WIDTH, Math.max(texelsPerMatrix, ceilToMultiple(Math.ceil(Math.sqrt(totalTexels)), texelsPerMatrix)));
  const height = Math.ceil(totalTexels / width);
  const data = new Float32Array(width * height * 4);
  data.set(skinning.matrices.subarray(0, Math.min(skinning.matrices.length, data.length)));
  if (skinning.matrices.length > data.length) {
    throw new RenderDeviceError("Skinning palette does not fit the data texture", "INVALID_SKINNING_PALETTE", {
      material: materialName,
      jointCount: skinning.jointCount
    });
  }
  return new Texture({
    width,
    height,
    format: "rgba32f",
    colorSpace: "linear",
    label: `aura3d-skinning-palette-${skinning.jointCount}-joints`,
    data
  });
}

/**
 * The `skinning.paletteKey` field arrives via a structural stamp from
 * `GLTFAnimationRuntime` (PRD-06 T0.11/§9.2) — the declared `SkinningPaletteBinding`
 * type in `contracts/renderItem.ts` does not carry it yet (CCR-06-4). Returns the
 * key only when the producer stamped an object identity.
 */
export function paletteKeyOf(skinning: SkinningPaletteBinding): object | null {
  const key = (skinning as SkinningPaletteBinding & { paletteKey?: unknown }).paletteKey;
  return typeof key === "object" && key !== null ? key : null;
}

/**
 * C-18 real path (`A3D_QR_ANIMATION` on + `paletteKey` stamped). Same contract
 * checks as `applySkinningUniforms`, but the >96-joint branch reuses the cache's
 * texture pair, sampler, bindings and zero block; the palette upload goes
 * through `SkinningPaletteTextureCache.upload` (one `texture.update` per key
 * per frame — `texSubImage2D`, no new WebGLTexture). The first upload per key
 * still runs the finite scan; later frames trust the runtime's dirty flag.
 */
export function applySkinningUniformsCached(
  skinning: SkinningPaletteBinding,
  material: Material,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  cache: SkinningPaletteTextureCache
): SkinningPalettePath {
  if (!shader.reflection.uniforms.has("u_jointMatrices") || !shader.reflection.uniforms.has("u_jointCount")) {
    throw new RenderDeviceError("Skinned render item requires a shader with joint palette uniforms", "SKINNING_SHADER_CONTRACT", {
      material: material.name
    });
  }
  if (!Number.isInteger(skinning.jointCount) || skinning.jointCount <= 0 || skinning.jointCount > MAX_SKINNING_JOINTS) {
    throw new RenderDeviceError(`Skinning jointCount must be an integer in [1, ${MAX_SKINNING_JOINTS}]`, "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      maxUniformJoints: MAX_UNIFORM_SKINNING_JOINTS,
      maxJoints: MAX_SKINNING_JOINTS
    });
  }
  if (skinning.matrices.length !== skinning.jointCount * 16) {
    throw new RenderDeviceError("Skinning matrix palette length must equal jointCount * 16", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      matrixScalars: skinning.matrices.length
    });
  }
  const key = paletteKeyOf(skinning);
  const path: SkinningPalettePath = skinning.jointCount > MAX_UNIFORM_SKINNING_JOINTS ? "data-texture" : "uniform-array";
  if (path === "data-texture" && key) {
    if (!shader.reflection.uniforms.has("u_jointPaletteTexture") || !shader.reflection.uniforms.has("u_jointPaletteMode")) {
      throw new RenderDeviceError(
        `Skinning palettes above ${MAX_UNIFORM_SKINNING_JOINTS} joints require a shader with data-texture palette uniforms`,
        "SKINNING_SHADER_CONTRACT",
        { material: material.name, jointCount: skinning.jointCount }
      );
    }
    const palette = cache.paletteUniformSet(key, skinning.jointCount);
    // The once-per-key finite scan: the runtime reuses the same backing buffer, so
    // a palette that validated finite on its first frame keeps that guarantee while
    // the buffer contents are overwritten only by finite joint writes (T0.10).
    if (!palette.finiteValidated) {
      if (!isFiniteArrayLike(skinning.matrices)) {
        throw new RenderDeviceError("Skinning matrix palette must contain finite values", "INVALID_SKINNING_PALETTE", {
          jointCount: skinning.jointCount
        });
      }
      palette.markFiniteValidated();
    }
    cache.upload(key, skinning.matrices);
    uniforms.set("u_jointCount", skinning.jointCount);
    uniforms.set("u_jointPaletteMode", 1);
    uniforms.set("u_jointPaletteTexture", palette.currentBinding);
    uniforms.set("u_jointPaletteTextureSize", [palette.textureSize[0], palette.textureSize[1]]);
    uniforms.set("u_jointMatrices", palette.zeroJointUniforms);
    return path;
  }
  // ≤96-joint rigs and unstamped producers keep the legacy semantics exactly.
  return applySkinningUniforms(skinning, material, shader, uniforms);
}

/**
 * T0.13 — the shared bone-texture binder for the `prd06.deform` depth/velocity
 * variants (and any other pass whose shader carries `a3d_prd06_skinning_common`).
 * Binds the texture pair the forward bind already uploaded this frame — no
 * second upload, no allocation after the first bind per key.
 *
 * `set` is the feature's uniform setter (`ShaderFeature.bindUniforms`), so this
 * never materialises a uniforms Map. Returns false when the item has no
 * stamped palette (`select` already gates on `item.skinning`).
 */
export function bindBoneTexture(
  set: (name: string, value: UniformValue) => void,
  cache: SkinningPaletteTextureCache,
  item: RenderItem
): boolean {
  const skinning = item.skinning;
  if (!skinning) return false;
  const key = paletteKeyOf(skinning);
  if (!key) return false;
  // paletteUniformSet materialises the per-key entry (first bind only); upload()
  // dedupes per cache frame id, so it is a no-op when the forward bind already
  // ran this frame and a one-shot upload when depth binds first.
  const palette = cache.paletteUniformSet(key, skinning.jointCount);
  cache.upload(key, skinning.matrices);
  set("u_boneTexture", palette.currentBinding);
  set("u_boneTextureWidth", palette.textureSize[0]);
  set("u_prevBoneTexture", palette.previousBinding);
  return true;
}

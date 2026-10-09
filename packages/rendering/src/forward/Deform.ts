// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from ForwardPass.ts.
// PRD-06 T0.10: `applySkinningUniforms`/`createSkinningPaletteTexture`/sizing
// helpers moved to `../SkinningUniforms.js` (re-exported below); the flag-on
// path goes through `SkinningPaletteTextureCache` (C-18) instead of allocating
// a fresh palette texture per draw.

import type { SkinningPaletteBinding, SkinningPaletteDecisionRecord, SkinningPaletteDiagnostics, SkinningPalettePath } from "../ForwardPass.js";
import { MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES, MAX_SKINNING_JOINTS, MAX_UNIFORM_SKINNING_JOINTS } from "../ForwardPass.js";
import { Geometry } from "../Geometry.js";
import { IndexBuffer } from "../IndexBuffer.js";
import { Material } from "../Material.js";
import { applyMorphTargets, computeMorphTargetEnvelopeBounds, type MorphTargetDelta } from "../MorphTarget.js";
import { VertexBuffer } from "../VertexBuffer.js";
import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type UniformValue } from "../RenderDevice.js";
import { decideSkinningPalettePath } from "../WebGPUSkinningLimits.js";
import type { RenderItem } from "../contracts/renderItem.js";
import { applySkinningUniforms, applySkinningUniformsCached, paletteKeyOf } from "../SkinningUniforms.js";
import { prd06FlagsOn, skinningPaletteCache } from "../lanes/prd06.js";
import { bindPrd06MorphTextureUniforms } from "../shaders/deform/forwardFeature.js";

export {
  applySkinningUniforms,
  createSkinningPaletteTexture,
  ceilToMultiple,
  SKINNING_PALETTE_TEXTURE_MAX_WIDTH
} from "../SkinningUniforms.js";

/** T0.10: adds the C-18 cache's per-frame texture-creation counter (E21 probe). */
export interface SkinningPaletteDiagnosticsQr extends SkinningPaletteDiagnostics {
  readonly texturesCreatedThisFrame: number;
}

export class SkinningPaletteUploadManager {
  private static readonly validatedGeometryJointCounts = new WeakMap<Geometry, Set<number>>();
  private static readonly maxRecordedDecisions = 64;
  private submissions = 0;
  private jointsUploaded = 0;
  private maxJointCount = 0;
  private uniformArraySubmissions = 0;
  private dataTextureSubmissions = 0;
  private eightInfluenceSubmissions = 0;
  private cpuFallbackCount = 0;
  private decisions: SkinningPaletteDecisionRecord[] = [];
  private decisionOverflow = 0;
  /**
   * C-18 palette cache (T0.10). Always allocated — it is inert while
   * `A3D_QR_ANIMATION` is off because `bind` never consults it without a
   * stamped `paletteKey`.
   */
  private readonly paletteCache = skinningPaletteCache;

  beginFrame(): void {
    this.paletteCache.beginFrame();
    this.submissions = 0;
    this.jointsUploaded = 0;
    this.maxJointCount = 0;
    this.uniformArraySubmissions = 0;
    this.dataTextureSubmissions = 0;
    this.eightInfluenceSubmissions = 0;
    this.cpuFallbackCount = 0;
    this.decisions = [];
    this.decisionOverflow = 0;
  }

  /**
   * Which palette paths this frame actually used. Published rather than inferred so a
   * claim about data-texture or eight-influence skinning rests on observed submissions.
   * Each submission also records its `decideSkinningPalettePath` decision (same inputs the
   * upload path used) so the CPU-fallback reason code travels with the diagnostics.
   */
  diagnostics(): SkinningPaletteDiagnosticsQr {
    return {
      submissions: this.submissions,
      jointsUploaded: this.jointsUploaded,
      maxJointCount: this.maxJointCount,
      uniformArraySubmissions: this.uniformArraySubmissions,
      dataTextureSubmissions: this.dataTextureSubmissions,
      eightInfluenceSubmissions: this.eightInfluenceSubmissions,
      cpuFallbackCount: this.cpuFallbackCount,
      maxUniformJoints: MAX_UNIFORM_SKINNING_JOINTS,
      decisions: [...this.decisions],
      decisionOverflow: this.decisionOverflow,
      texturesCreatedThisFrame: this.paletteCache.diagnostics().createdThisFrame
    };
  }

  /**
   * T0.10 dispose seam: `prd06.animation` TypedGLBActor extension calls this when
   * the actor runtime tears down so the palette textures (and their GL handles)
   * die with the actor instead of leaking across mounts.
   */
  releasePalette(key: object): void {
    this.paletteCache.release(key);
  }

  releaseAllPalettes(): void {
    this.paletteCache.releaseAll();
  }

  bind(
    item: RenderItem,
    skinning: SkinningPaletteBinding,
    material: Material,
    shader: RenderShaderProgram,
    uniforms: Map<string, UniformValue>,
    device?: RenderDevice
  ): void {
    // Recorded before the upload so a contract failure still leaves its reason code behind.
    this.recordDecision(item, skinning, shader);
    // All-flags safety: validate before any palette upload, and degrade the item —
    // never throw out of a mid-frame pass. A barely-visible weight or an overshoot
    // vertex must not take every sibling item's draw with it; the item draws
    // unskinned (recorded as a `skinning-geometry-contract` cpu fallback) instead.
    const validatedJointCounts = SkinningPaletteUploadManager.validatedGeometryJointCounts.get(item.geometry) ?? new Set<number>();
    if (!validatedJointCounts.has(skinning.jointCount)) {
      try {
        validateSkinningGeometryContract(item, skinning);
      } catch {
        validatedJointCounts.add(skinning.jointCount);
        SkinningPaletteUploadManager.validatedGeometryJointCounts.set(item.geometry, validatedJointCounts);
        this.cpuFallbackCount += 1;
        if (this.decisions.length < SkinningPaletteUploadManager.maxRecordedDecisions) {
          this.decisions.push({
            label: item.label ?? "skinned-item",
            jointCount: skinning.jointCount,
            path: "cpu",
            reason: "skinning-geometry-contract",
            cpuFallback: true
          });
        } else {
          this.decisionOverflow += 1;
        }
        return;
      }
      validatedJointCounts.add(skinning.jointCount);
      SkinningPaletteUploadManager.validatedGeometryJointCounts.set(item.geometry, validatedJointCounts);
    }
    // T0.10: flag-on + stamped paletteKey → cached C-18 path (texSubImage2D);
    // anything else keeps the verbatim pre-rebuild submission path.
    const path = prd06FlagsOn("A3D_QR_ANIMATION") && paletteKeyOf(skinning)
      ? applySkinningUniformsCached(skinning, material, shader, uniforms, this.paletteCache, device)
      : applySkinningUniforms(skinning, material, shader, uniforms);
    if (path === "data-texture") this.dataTextureSubmissions += 1;
    else this.uniformArraySubmissions += 1;
    const eightInfluence = item.geometry.vertexBuffer.format.hasAttribute("joints1")
      && item.geometry.vertexBuffer.format.hasAttribute("weights1");
    if (eightInfluence) this.eightInfluenceSubmissions += 1;
    this.submissions += 1;
    this.jointsUploaded += skinning.jointCount;
    this.maxJointCount = Math.max(this.maxJointCount, skinning.jointCount);
  }

  private recordDecision(item: RenderItem, skinning: SkinningPaletteBinding, shader: RenderShaderProgram): void {
    const reflection = shader.reflection.uniforms;
    const decision = decideSkinningPalettePath({
      jointCount: skinning.jointCount,
      maxUniformJoints: MAX_UNIFORM_SKINNING_JOINTS,
      maxDataTextureJoints: MAX_SKINNING_JOINTS,
      shaderHasSkinningUniforms: reflection.has("u_jointMatrices") && reflection.has("u_jointCount"),
      shaderHasDataTexturePalette: reflection.has("u_jointPaletteTexture") && reflection.has("u_jointPaletteMode"),
      shaderHasBoneTexture: reflection.has("u_boneTexture")
    });
    if (decision.cpuFallback) this.cpuFallbackCount += 1;
    if (this.decisions.length < SkinningPaletteUploadManager.maxRecordedDecisions) {
      this.decisions.push({
        label: item.label ?? "skinned-item",
        jointCount: skinning.jointCount,
        path: decision.path,
        reason: decision.reason,
        cpuFallback: decision.cpuFallback
      });
    } else {
      this.decisionOverflow += 1;
    }
  }
}

export function resolveRenderGeometry(item: RenderItem): Geometry {
  if (item.morphTargets === undefined && item.morphWeights === undefined) {
    return item.geometry;
  }
  if (!item.morphTargets || !item.morphWeights) {
    throw new RenderDeviceError("Morph render items require both morphTargets and morphWeights", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets?.length ?? 0,
      weightCount: item.morphWeights?.length ?? 0
    });
  }
  // T2.3: flag-on rewrites one persistent dynamic VBO per source geometry —
  // `upload()` reissues only the dirty range (`bufferSubData`) instead of a
  // fresh `Geometry` + `dispose` every frame. Flag-off stays byte-identical.
  return prd06FlagsOn("A3D_QR_ANIMATION")
    ? resolveRenderGeometryPersistent(item, item.morphTargets, item.morphWeights)
    : applyMorphTargets(item.geometry, item.morphTargets, item.morphWeights);
}

// ---------------------------------------------------------------------------
// T2.3 (PRD-06:1228) persistent CPU-morph scratch
//
// The legacy path allocates `new VertexBuffer` + `new IndexBuffer` +
// `new Geometry` per morphed draw and ForwardPass's finally block disposes it,
// so the GPU sees a fresh buffer upload every frame. The persistent path keeps
// one VertexBuffer (+ one IndexBuffer) per *source* geometry: each call copies
// the source attributes in, applies the morph blend, and the buffer's
// dirty-range upload becomes a `bufferSubData` rewrite of the same VBO.
//
// `MorphTarget.ts`'s inner loop is not exported and that file is lane-01's, so
// the vertex math is mirrored here — keep it in sync with
// `applyMorphTargets`/`morphVec3`/`normalizeVec3`/`morphTangent`.
//
// Cache key is the source `Geometry` (a stable asset): `RenderItem`s are
// rebuilt per frame by collectRenderItems, so an item-keyed map would miss
// every frame. Draws submit immediately (`submitDraw` → `device.draw`), so
// serial resolve→upload→draw order makes one buffer per geometry safe even
// when two items morph it differently.
// ---------------------------------------------------------------------------

/**
 * Returned to ForwardPass each frame — its `geometry.dispose()` is a no-op so
 * the scratch buffers survive. `bounds` is the morph envelope
 * (`computeMorphTargetEnvelopeBounds`), conservative for every weight set, so
 * the wrapper can be cached for a fixed target set while weights animate.
 */
class MorphScratchGeometry extends Geometry {
  dispose(): void {
    // Persistent — see T2.3 block comment.
  }
}

interface MorphScratch {
  readonly vertexBuffer: VertexBuffer;
  readonly indexBuffer: IndexBuffer | null;
  targets: readonly MorphTargetDelta[];
  geometry: Geometry;
}

// `var` + lazy init — `forward/Deform.ts` sits inside the lanes→Deform import
// cycle (see forwardFeature.ts), so module-level `let`/`const` can be read
// before initialization when the cycle enters this module early.
var morphScratchCache: WeakMap<Geometry, MorphScratch> | undefined;

function resolveRenderGeometryPersistent(
  item: RenderItem,
  targets: readonly MorphTargetDelta[],
  weights: readonly number[]
): Geometry {
  if (targets.length !== weights.length) {
    throw new Error("Morph target count must match morph weight count.");
  }
  const source = item.geometry;
  morphScratchCache ??= new WeakMap();
  let scratch = morphScratchCache.get(source);
  if (!scratch || scratch.targets !== targets) {
    // Rebuild the wrapper only when the target *set* changes (weights change
    // per frame; the envelope bound covers every combination). The buffers
    // are reused either way — only the `Geometry` wrapper + bounds refresh.
    const vertexBuffer = scratch?.vertexBuffer
      ?? new VertexBuffer(source.vertexBuffer.format, source.vertexBuffer.vertexCount);
    const indexBuffer = scratch?.indexBuffer
      ?? (source.indexBuffer ? new IndexBuffer(Array.from(source.indexBuffer.data), source.vertexBuffer.vertexCount) : null);
    scratch = {
      vertexBuffer,
      indexBuffer,
      targets,
      geometry: new MorphScratchGeometry(
        vertexBuffer,
        indexBuffer,
        source.topology,
        computeMorphTargetEnvelopeBounds(source, targets)
      )
    };
    morphScratchCache.set(source, scratch);
  }
  writeMorphedVertices(source.vertexBuffer, targets, weights, scratch.vertexBuffer);
  return scratch.geometry;
}

/** Release seam mirroring `releasePalette`: callers that own the source
 * geometry's lifecycle (actor teardown) may drop the scratch early; the
 * WeakMap otherwise frees it when the source geometry is collected. */
export function releaseMorphScratchGeometry(geometry: Geometry): void {
  morphScratchCache?.delete(geometry);
}

function writeMorphedVertices(
  source: VertexBuffer,
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  out: VertexBuffer
): void {
  for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
    for (const attribute of source.format.attributes) {
      if (attribute.semantic === "position" || attribute.semantic === "normal" || attribute.semantic === "tangent") continue;
      out.setAttribute(vertex, attribute.semantic, source.getAttribute(vertex, attribute.semantic));
    }
    if (source.format.hasAttribute("position")) {
      out.setAttribute(vertex, "position", morphScratchVec3(source.getAttribute(vertex, "position"), targets, weights, vertex, "positions"));
    }
    if (source.format.hasAttribute("normal")) {
      out.setAttribute(vertex, "normal", normalizeScratchVec3(morphScratchVec3(source.getAttribute(vertex, "normal"), targets, weights, vertex, "normals")));
    }
    if (source.format.hasAttribute("tangent")) {
      out.setAttribute(vertex, "tangent", morphScratchTangent(source.getAttribute(vertex, "tangent"), targets, weights, vertex));
    }
  }
}

function morphScratchVec3(
  base: readonly number[],
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  vertex: number,
  key: "positions" | "normals" | "tangents"
): readonly [number, number, number] {
  const result: [number, number, number] = [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0];
  for (let index = 0; index < targets.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (weight === 0) continue;
    const delta = targets[index]?.[key]?.[vertex];
    if (!delta) continue;
    result[0] += delta[0] * weight;
    result[1] += delta[1] * weight;
    result[2] += delta[2] * weight;
  }
  return result;
}

function normalizeScratchVec3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-9 ? [value[0] / length, value[1] / length, value[2] / length] : [0, 0, 1];
}

function morphScratchTangent(
  base: readonly number[],
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  vertex: number
): readonly [number, number, number, number] {
  const morphed = normalizeScratchVec3(morphScratchVec3(base, targets, weights, vertex, "tangents"));
  return [morphed[0], morphed[1], morphed[2], base[3] ?? 1];
}


export function applyGpuMorphUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): boolean {
  // T2.2: a generated `prd06.deform` program (A3D_MORPH) declares
  // `u_morphTexture` — bind the §8.2 array texture + packed top-K list and keep
  // the item's geometry unchanged (the CPU morph dispatch at ForwardPass.ts
  // `resolveRenderGeometry` is skipped when this returns true). Falls back to
  // the legacy uniform path when the build reports a CPU fallback. This is the
  // lane-side `bindUniforms` consumer until lane 01 wires the C-02 per-item
  // select/bind loop into program acquisition (qr-request Q-01-4).
  if (shader.reflection.uniforms.has("u_morphTexture")) {
    if (bindPrd06MorphTextureUniforms(item, shader, uniforms)) return true;
    // Texture build fell back to CPU (limits/bucket ceiling) — CPU morph below.
    return false;
  }
  if (
    !shader.reflection.uniforms.has("u_morphPositionDeltas") ||
    !shader.reflection.uniforms.has("u_morphWeights") ||
    !shader.reflection.uniforms.has("u_morphTargetCount")
  ) {
    return false;
  }
  if (!item.morphTargets || !item.morphWeights) {
    throw new RenderDeviceError("Morph render items require both morphTargets and morphWeights", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets?.length ?? 0,
      weightCount: item.morphWeights?.length ?? 0
    });
  }
  if (item.morphTargets.length !== item.morphWeights.length) {
    throw new RenderDeviceError("Morph target count must match morph weight count", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets.length,
      weightCount: item.morphWeights.length
    });
  }
  // Counts beyond the uniform fast-path capacity are not an error: fall back to the CPU morph
  // (resolveRenderGeometry -> applyMorphTargets), which is unlimited and morphs normals + tangents
  // so lighting follows the deformation. The texture-backed GPU plan (createMorphTargetPlan) packs
  // the same data for the texture path; see MorphTargetPlan.ts.
  if (item.morphTargets.length > MAX_GPU_MORPH_TARGETS || item.geometry.vertexBuffer.vertexCount > MAX_GPU_MORPH_VERTICES) {
    return false;
  }
  const packed = new Float32Array(MAX_GPU_MORPH_TARGETS * MAX_GPU_MORPH_VERTICES * 4);
  const packedNormals = new Float32Array(MAX_GPU_MORPH_TARGETS * MAX_GPU_MORPH_VERTICES * 4);
  const weights = new Float32Array(MAX_GPU_MORPH_TARGETS);
  for (let targetIndex = 0; targetIndex < item.morphTargets.length; targetIndex += 1) {
    const target = item.morphTargets[targetIndex]!;
    if (!target.positions || target.positions.length < item.geometry.vertexBuffer.vertexCount) {
      throw new RenderDeviceError("GPU morph shader path requires position deltas for every source vertex", "GPU_MORPH_TARGET_CONTRACT", {
        label: item.label,
        targetIndex,
        vertexCount: item.geometry.vertexBuffer.vertexCount,
        deltaCount: target.positions?.length ?? 0
      });
    }
    const weight = item.morphWeights[targetIndex] ?? 0;
    if (!Number.isFinite(weight)) {
      throw new RenderDeviceError("GPU morph weights must be finite", "GPU_MORPH_TARGET_CONTRACT", {
        label: item.label,
        targetIndex,
        weight
      });
    }
    weights[targetIndex] = weight;
    for (let vertex = 0; vertex < item.geometry.vertexBuffer.vertexCount; vertex += 1) {
      const delta = target.positions[vertex]!;
      if (delta.length !== 3 || !Number.isFinite(delta[0]) || !Number.isFinite(delta[1]) || !Number.isFinite(delta[2])) {
        throw new RenderDeviceError("GPU morph position deltas must be finite vec3 values", "GPU_MORPH_TARGET_CONTRACT", {
          label: item.label,
          targetIndex,
          vertex
        });
      }
      const offset = (targetIndex * MAX_GPU_MORPH_VERTICES + vertex) * 4;
      packed[offset] = delta[0];
      packed[offset + 1] = delta[1];
      packed[offset + 2] = delta[2];
      const normal = target.normals?.[vertex];
      if (normal && normal.length === 3) {
        packedNormals[offset] = normal[0];
        packedNormals[offset + 1] = normal[1];
        packedNormals[offset + 2] = normal[2];
      }
    }
  }
  uniforms.set("u_morphPositionDeltas", packed);
  uniforms.set("u_morphWeights", weights);
  uniforms.set("u_morphTargetCount", item.morphTargets.length);
  // Normal deltas are uploaded only when the bound shader declares the uniform (lit morph variants);
  // the default unlit morph shader ignores them.
  if (shader.reflection.uniforms.has("u_morphNormalDeltas")) {
    uniforms.set("u_morphNormalDeltas", packedNormals);
  }
  return true;
}

export function validateSkinningGeometryContract(item: RenderItem, skinning: SkinningPaletteBinding): void {
  const format = item.geometry.vertexBuffer.format;
  if (!format.hasAttribute("joints") || !format.hasAttribute("weights")) {
    throw new RenderDeviceError("Skinned render item geometry must include joints and weights attributes", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label,
      jointCount: skinning.jointCount,
      vertexFormat: format.attributes.map((attribute) => attribute.shaderName),
      missingAttributes: [
        ...(format.hasAttribute("joints") ? [] : ["a_joints"]),
        ...(format.hasAttribute("weights") ? [] : ["a_weights"])
      ]
    });
  }

  const jointsAttribute = format.getAttribute("joints");
  const weightsAttribute = format.getAttribute("weights");
  if (jointsAttribute.components !== 4 || weightsAttribute.components !== 4) {
    throw new RenderDeviceError("Skinned render item geometry must use four joint and four weight influences per vertex", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label,
      jointCount: skinning.jointCount,
      jointComponents: jointsAttribute.components,
      weightComponents: weightsAttribute.components
    });
  }

  // Eight-influence geometry must supply both halves of the second set, and both must
  // be vec4. A half-declared second set would silently drop influences at draw time.
  const hasJoints1 = format.hasAttribute("joints1");
  const hasWeights1 = format.hasAttribute("weights1");
  if (hasJoints1 !== hasWeights1) {
    throw new RenderDeviceError("Eight-influence skinned geometry must declare both joints1 and weights1", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label,
      hasJoints1,
      hasWeights1
    });
  }
  const eightInfluence = hasJoints1 && hasWeights1;
  if (eightInfluence) {
    const joints1Attribute = format.getAttribute("joints1");
    const weights1Attribute = format.getAttribute("weights1");
    if (joints1Attribute.components !== 4 || weights1Attribute.components !== 4) {
      throw new RenderDeviceError("Eight-influence skinned geometry must use four components per second-set attribute", "SKINNING_GEOMETRY_CONTRACT", {
        label: item.label,
        joints1Components: joints1Attribute.components,
        weights1Components: weights1Attribute.components
      });
    }
  }

  for (let vertex = 0; vertex < item.geometry.vertexBuffer.vertexCount; vertex += 1) {
    const joints = item.geometry.vertexBuffer.getAttribute(vertex, "joints");
    const weights = item.geometry.vertexBuffer.getAttribute(vertex, "weights");
    let weightSum = 0;
    if (eightInfluence) {
      // Validate the second set with the same rules, and fold it into the weight sum so
      // a vertex whose influence is split across both sets is not reported as unweighted.
      const joints1 = item.geometry.vertexBuffer.getAttribute(vertex, "joints1");
      const weights1 = item.geometry.vertexBuffer.getAttribute(vertex, "weights1");
      for (let influence = 0; influence < 4; influence += 1) {
        const joint = joints1[influence] ?? 0;
        const weight = weights1[influence] ?? 0;
        if (!Number.isFinite(weight) || weight < 0) {
          throw new RenderDeviceError("Skinned render item weights must be finite non-negative values", "SKINNING_GEOMETRY_CONTRACT", {
            label: item.label,
            jointCount: skinning.jointCount,
            vertex,
            influence: influence + 4,
            weight
          });
        }
        if (!Number.isInteger(joint) || joint < 0 || joint >= skinning.jointCount) {
          throw new RenderDeviceError("Skinned render item joint indices must reference palette joints", "SKINNING_GEOMETRY_CONTRACT", {
            label: item.label,
            jointCount: skinning.jointCount,
            vertex,
            influence: influence + 4,
            joint
          });
        }
        weightSum += weight;
      }
    }
    for (let influence = 0; influence < 4; influence += 1) {
      const joint = joints[influence] ?? 0;
      const weight = weights[influence] ?? 0;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RenderDeviceError("Skinned render item weights must be finite non-negative values", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          weight
        });
      }
      if (!Number.isFinite(joint) || !Number.isInteger(joint) || joint < 0) {
        throw new RenderDeviceError("Skinned render item joints must be finite non-negative integer indices", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          joint
        });
      }
      if (weight > 0 && joint >= skinning.jointCount) {
        throw new RenderDeviceError("Skinned render item joint indices must be within the uploaded skinning palette", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          joint,
          weight
        });
      }
      weightSum += weight;
    }
    if (weightSum <= 0) {
      throw new RenderDeviceError("Skinned render item weights must sum to a positive value", "SKINNING_GEOMETRY_CONTRACT", {
        label: item.label,
        jointCount: skinning.jointCount,
        vertex,
        weightSum
      });
    }
    if (Math.abs(weightSum - 1) > 0.02) {
      throw new RenderDeviceError("Skinned render item weights must be normalized before GPU skinning", "SKINNING_GEOMETRY_CONTRACT", {
        label: item.label,
        jointCount: skinning.jointCount,
        vertex,
        weightSum
      });
    }
  }
}



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
import { applyMorphTargets, computeMorphTargetEnvelopeBounds, computeMorphTargetWeightedBounds, createMorphTargetBuffers, writeMorphTargetBuffers, type MorphTargetDelta } from "../MorphTarget.js";
import { VertexBuffer } from "../VertexBuffer.js";
import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type UniformValue } from "../RenderDevice.js";
import { isTextureBinding, type TextureBinding } from "../TextureBinding.js";
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
  private static readonly validatedGeometryJointCounts = new WeakMap<Geometry, {
    readonly primary: VertexBuffer;
    readonly buffers: readonly VertexBuffer[];
    readonly revisions: readonly number[];
    readonly counts: Set<string>;
  }>();
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
   * stamped `paletteKey`. Read lazily: `lanes/prd06` sits in an import
   * cycle with this module, and a field initializer captured `undefined`
   * when `@aura3d/engine` was imported before `@aura3d/rendering`.
   */
  private get paletteCache() {
    return skinningPaletteCache;
  }

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

  /** Validate generated deformation before selecting or uploading its palette. */
  validateGenerated(item: RenderItem, skinning: SkinningPaletteBinding): void {
    validateSkinningPaletteContract(skinning);
    const count = itemInstanceCount(item);
    if (!Number.isSafeInteger(count) || count < 1
      || (item.instanceTransforms !== undefined && item.instanceTransforms.length !== count * 16)
      || (item.instanceTransforms !== undefined && item.instanceCount !== undefined && item.instanceCount !== count)) {
      throw new RenderDeviceError("Skinned render item requires a valid instance count", "INVALID_INSTANCE_COUNT", { count });
    }
    const validated = this.validationCountsFor(item.geometry);
    const key = `generated:${skinning.jointCount}:${count}:${skinning.extraInfluences === true}`;
    if (validated.has(key)) return;
    validateSkinningGeometryContract(item, skinning, { generated: true });
    validated.add(key);
  }

  private validationCountsFor(geometry: Geometry): Set<string> {
    const format = geometry.vertexBuffer.format;
    const streams = (["joints", "weights", "joints1", "weights1"] as const)
      .filter((semantic) => format.hasAttribute(semantic))
      .map((semantic) => geometry.getAttributeBuffer(semantic));
    const revisions = streams.map((buffer) => buffer.revision);
    let cached = SkinningPaletteUploadManager.validatedGeometryJointCounts.get(geometry);
    if (!cached || cached.primary !== geometry.vertexBuffer || cached.buffers.length !== streams.length
      || streams.some((buffer, index) => buffer !== cached!.buffers[index] || revisions[index] !== cached!.revisions[index])) {
      cached = { primary: geometry.vertexBuffer, buffers: streams, revisions, counts: new Set<string>() };
      SkinningPaletteUploadManager.validatedGeometryJointCounts.set(geometry, cached);
    }
    return cached.counts;
  }

  bind(
    item: RenderItem,
    skinning: SkinningPaletteBinding,
    material: Material,
    shader: RenderShaderProgram,
    uniforms: Map<string, UniformValue>,
    device?: RenderDevice
  ): TextureBinding | undefined {
    // Recorded before the upload so a contract failure still leaves its reason code behind.
    this.recordDecision(item, skinning, shader);
    // All-flags safety (flag-on, non-strict only): validate before any palette
    // upload and degrade the item — never throw out of a mid-frame pass. A
    // barely-visible weight or an overshoot vertex must not take every sibling
    // item's draw with it; the item is skipped (recorded as a
    // `skinning-geometry-contract` cpu fallback). Flag-off and strict (C-36)
    // keep the pre-rebuild order and throws verbatim (validated after upload).
    const degradeOnContract = prd06FlagsOn("A3D_QR_ANIMATION") && !prd06FlagsOn("A3D_QR_STRICT");
    const validatedJointCounts = this.validationCountsFor(item.geometry);
    const validationKey = `legacy:${skinning.jointCount}:${itemInstanceCount(item)}`;
    if (degradeOnContract && !validatedJointCounts.has(validationKey)) {
      try {
        validateSkinningGeometryContract(item, skinning);
      } catch {
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
        return undefined;
      }
      validatedJointCounts.add(validationKey);
    }
    // T0.10: flag-on + stamped paletteKey → cached C-18 path (texSubImage2D);
    // anything else keeps the verbatim pre-rebuild submission path.
    const cachedPalette = prd06FlagsOn("A3D_QR_ANIMATION") && paletteKeyOf(skinning) !== null;
    const path = cachedPalette
      ? applySkinningUniformsCached(skinning, material, shader, uniforms, this.paletteCache, device)
      : applySkinningUniforms(skinning, material, shader, uniforms);
    const binding = uniforms.get("u_jointPaletteTexture");
    const transient = !cachedPalette && path === "data-texture" && isTextureBinding(binding) ? binding : undefined;
    try {
      if (path === "data-texture") this.dataTextureSubmissions += 1;
      else this.uniformArraySubmissions += 1;
      const eightInfluence = item.geometry.vertexBuffer.format.hasAttribute("joints1")
        && item.geometry.vertexBuffer.format.hasAttribute("weights1");
      if (eightInfluence) this.eightInfluenceSubmissions += 1;
      if (!validatedJointCounts.has(validationKey)) {
        validateSkinningGeometryContract(item, skinning);
        validatedJointCounts.add(validationKey);
      }
      this.submissions += 1;
      this.jointsUploaded += skinning.jointCount;
      this.maxJointCount = Math.max(this.maxJointCount, skinning.jointCount);
      return transient;
    } catch (error) {
      transient?.texture?.dispose();
      throw error;
    }
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

/**
 * A direction delta needs a real per-vertex base stream. The CPU writer and
 * the generated texture shader both add deltas to that stream; if it is
 * absent, instance-rate, or too narrow, silently skipping the channel would
 * render a different deformation. Zero-weight targets need no base stream.
 */
function activeDirectionMorphs(item: RenderItem): { normals: boolean; tangents: boolean } {
  const targets = item.morphTargets;
  const weights = item.morphWeights;
  if (!targets && !weights) return { normals: false, tangents: false };
  if (!targets || !weights) {
    throw new RenderDeviceError("Morph render items require both morphTargets and morphWeights", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: targets?.length ?? 0,
      weightCount: weights?.length ?? 0
    });
  }
  if (targets.length !== weights.length) {
    throw new RenderDeviceError("Morph target count must match morph weight count", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: targets.length,
      weightCount: weights.length
    });
  }
  const vertexCount = item.geometry.vertexBuffer.vertexCount;
  let normals = false;
  let tangents = false;
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const weight = weights[targetIndex] ?? 0;
    if (!Number.isFinite(weight)) {
      throw new RenderDeviceError("Morph weights must be finite", "MORPH_TARGET_CONTRACT", { label: item.label, targetIndex, weight });
    }
    if (weight === 0) continue;
    const target = targets[targetIndex];
    if (!target) throw new RenderDeviceError("Morph target is missing", "MORPH_TARGET_CONTRACT", { label: item.label, targetIndex });
    for (const channel of ["normals", "tangents"] as const) {
      const deltas = target[channel];
      // An empty channel is absent (glTF targets without NORMAL/TANGENT, as in
      // applyMorphTargets and the morph texture packer).
      if (deltas === undefined || (Array.isArray(deltas) && deltas.length === 0)) continue;
      if (!deltas || deltas.length !== vertexCount) {
        throw new RenderDeviceError(`Active morph ${channel} require one delta per source vertex`, "MORPH_TARGET_CONTRACT", {
          label: item.label, targetIndex, vertexCount, deltaCount: deltas?.length ?? 0
        });
      }
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const delta = deltas[vertex];
        if (!delta || delta.length !== 3 || !Number.isFinite(delta[0]) || !Number.isFinite(delta[1]) || !Number.isFinite(delta[2])) {
          throw new RenderDeviceError(`Active morph ${channel} require finite vec3 deltas`, "MORPH_TARGET_CONTRACT", {
            label: item.label, targetIndex, vertex
          });
        }
      }
      if (channel === "normals") normals = true;
      else tangents = true;
    }
  }
  const format = item.geometry.vertexBuffer.format;
  for (const [active, semantic] of [[normals, "normal"], [tangents, "tangent"]] as const) {
    if (!active) continue;
    const attribute = format.attributes.find((candidate) => candidate.semantic === semantic);
    const stream = attribute && format.streams.find((candidate) => candidate.slot === attribute.bufferSlot);
    if (!attribute || attribute.components < 3 || attribute.integer || stream?.stepMode !== "vertex"
      || item.geometry.getAttributeBuffer(semantic).vertexCount < vertexCount) {
      throw new RenderDeviceError(`Active morph ${semantic} deltas require a compatible per-vertex base ${semantic} attribute`, "MORPH_TARGET_CONTRACT", {
        label: item.label, semantic, vertexCount
      });
    }
  }
  return { normals, tangents };
}

/** A prior draw using the same program must not deform an already-morphed CPU buffer again. */
function cpuMorphFallback(shader: RenderShaderProgram, uniforms: Map<string, UniformValue>): false {
  for (const name of ["u_morphTargetCount", "u_morphActiveCount", "u_morphUsesTexture"] as const) {
    if (shader.reflection.uniforms.has(name)) uniforms.set(name, 0);
  }
  return false;
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
  activeDirectionMorphs(item);
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

  /** Release this wrapper's buffer retains when it leaves the scratch cache. */
  releaseScratch(): void {
    super.dispose();
  }
}

interface MorphScratch {
  readonly buffers: readonly VertexBuffer[];
  readonly sourceBuffers: readonly VertexBuffer[];
  readonly indexBuffer: IndexBuffer | null;
  readonly sourceIndexBuffer: IndexBuffer | null;
  targets: readonly MorphTargetDelta[];
  geometry: MorphScratchGeometry;
  envelope: Geometry["bounds"];
  positionRevision: number;
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
  const sourceBuffers = source.vertexBuffer.format.streams.map((stream) => source.getVertexBuffer(stream.slot));
  const sourceIndexBuffer = source.indexBuffer;
  if (scratch && (scratch.sourceBuffers.length !== sourceBuffers.length
    || scratch.sourceBuffers.some((buffer, index) => buffer !== sourceBuffers[index])
    || scratch.sourceIndexBuffer !== sourceIndexBuffer
    || (scratch.indexBuffer?.count ?? 0) !== (sourceIndexBuffer?.count ?? 0)
    || (scratch.indexBuffer?.type === "uint16" && sourceIndexBuffer?.type === "uint32"
      && sourceIndexBuffer.data.some((index) => index > 65535)))) {
    // Remove the dead entry first: a device cleanup callback may re-enter and
    // install a new scratch for this source while the old one is released.
    morphScratchCache.delete(source);
    disposeMorphScratch(scratch);
    scratch = undefined;
  }
  if (!scratch || scratch.targets !== targets) {
    // Rebuild the wrapper only when the target *set* changes (weights change
    // per frame; the envelope bound covers every combination). The buffers
    // are reused either way — the new wrapper must retain them before the old
    // wrapper releases its retains.
    const previous = scratch;
    let newBuffers: readonly VertexBuffer[] | undefined;
    let newIndex: IndexBuffer | null = null;
    let replacement: MorphScratchGeometry | undefined;
    let next: MorphScratch;
    try {
      const buffers = previous?.buffers ?? (newBuffers = createMorphTargetBuffers(source));
      const indexBuffer = previous ? previous.indexBuffer : sourceIndexBuffer
        ? (newIndex = new IndexBuffer(sourceIndexBuffer.data, source.vertexBuffer.vertexCount, sourceIndexBuffer.type))
        : null;
      const envelope = computeMorphTargetEnvelopeBounds(source, targets);
      const positionRevision = source.getAttributeBuffer("position").revision;
      // Authored accessors can synchronously release or replace a scratch
      // while the new envelope is being evaluated. Never publish over it.
      if (morphScratchCache.get(source) !== previous || source.indexBuffer !== sourceIndexBuffer
        || source.vertexBuffer.format.streams.length !== sourceBuffers.length
        || source.vertexBuffer.format.streams.some((stream, index) => source.getVertexBuffer(stream.slot) !== sourceBuffers[index])) {
        throw new Error("Morph scratch changed while a replacement was being prepared");
      }
      replacement = new MorphScratchGeometry(
        buffers[0]!,
        indexBuffer,
        source.topology,
        envelope,
        buffers.slice(1)
      );
      next = { buffers, sourceBuffers, indexBuffer, sourceIndexBuffer, targets, envelope, positionRevision, geometry: replacement };
      morphScratchCache.set(source, next);
    } catch (error) {
      // A failed replacement must leave the previous scratch untouched. On a
      // first construction, release every newly allocated standalone buffer;
      // keep the original error even if one cleanup also fails.
      if (replacement) {
        try { replacement.releaseScratch(); } catch { /* Preserve the construction failure. */ }
      } else if (!previous) {
        for (const buffer of new Set(newBuffers ?? [])) {
          try { buffer.dispose(); } catch { /* Continue cleaning the remaining buffers. */ }
        }
        try { newIndex?.dispose(); } catch { /* Preserve the construction failure. */ }
      }
      throw error;
    }
    scratch = next;
    previous?.geometry.releaseScratch();
  }
  writeMorphTargetBuffers(source, scratch.buffers, targets, weights);
  if (scratch.indexBuffer && source.indexBuffer) {
    // Source indices can be edited in place while the scratch wrapper survives.
    const current = source.indexBuffer.data;
    let first = 0;
    while (first < current.length && current[first] === scratch.indexBuffer.data[first]) first += 1;
    if (first < current.length) scratch.indexBuffer.setIndices(first, current.subarray(first));
  }
  // Morph envelopes cover [0, 1]; include the current weighted pose when a
  // caller extrapolates, or when mutable source streams have changed.
  const positionRevision = source.getAttributeBuffer("position").revision;
  if (scratch.positionRevision !== positionRevision) {
    scratch.envelope = computeMorphTargetEnvelopeBounds(source, targets);
    scratch.positionRevision = positionRevision;
  }
  const envelope = scratch.envelope;
  if (weights.every((weight) => weight >= 0 && weight <= 1)) scratch.geometry.bounds = envelope;
  else {
    const weighted = computeMorphTargetWeightedBounds(source, targets, weights);
    scratch.geometry.bounds = {
      min: [Math.min(envelope.min[0], weighted.min[0]), Math.min(envelope.min[1], weighted.min[1]), Math.min(envelope.min[2], weighted.min[2])],
      max: [Math.max(envelope.max[0], weighted.max[0]), Math.max(envelope.max[1], weighted.max[1]), Math.max(envelope.max[2], weighted.max[2])]
    };
  }
  scratch.geometry.drawRange = source.drawRange;
  scratch.geometry.groups = source.groups;
  scratch.geometry.morphTargets = source.morphTargets;
  return scratch.geometry;
}

/** Release seam mirroring `releasePalette`: callers that own the source
 * geometry's lifecycle (actor teardown) may drop the scratch early; the
 * WeakMap otherwise frees it when the source geometry is collected. */
export function releaseMorphScratchGeometry(geometry: Geometry): void {
  const scratch = morphScratchCache?.get(geometry);
  if (!scratch) return;
  // Delete before cleanup so re-entrant creation is not removed afterwards.
  morphScratchCache!.delete(geometry);
  disposeMorphScratch(scratch);
}

function disposeMorphScratch(scratch: MorphScratch): void {
  scratch.geometry.releaseScratch();
}


export function applyGpuMorphUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): boolean {
  const activeDirections = activeDirectionMorphs(item);
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
    return cpuMorphFallback(shader, uniforms);
  }
  if (
    !shader.reflection.uniforms.has("u_morphPositionDeltas") ||
    !shader.reflection.uniforms.has("u_morphWeights") ||
    !shader.reflection.uniforms.has("u_morphTargetCount")
  ) {
    return cpuMorphFallback(shader, uniforms);
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
  // The legacy uniform contract has no tangent-delta input. Normal deltas
  // also need a declared normal-delta uniform. Keep the actual deformed
  // vertex stream when either channel cannot be represented by this shader.
  if (activeDirections.tangents || (activeDirections.normals && !shader.reflection.uniforms.has("u_morphNormalDeltas"))) {
    return cpuMorphFallback(shader, uniforms);
  }
  // Counts beyond the uniform fast-path capacity are not an error: fall back to the CPU morph
  // (resolveRenderGeometry -> applyMorphTargets), which is unlimited and morphs normals + tangents
  // so lighting follows the deformation. The texture-backed GPU plan (createMorphTargetPlan) packs
  // the same data for the texture path; see MorphTargetPlan.ts.
  if (item.morphTargets.length > MAX_GPU_MORPH_TARGETS || item.geometry.vertexBuffer.vertexCount > MAX_GPU_MORPH_VERTICES) {
    return cpuMorphFallback(shader, uniforms);
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

function validateSkinningPaletteContract(skinning: SkinningPaletteBinding): void {
  if (!Number.isInteger(skinning.jointCount) || skinning.jointCount <= 0 || skinning.jointCount > MAX_SKINNING_JOINTS) {
    throw new RenderDeviceError(`Skinning jointCount must be an integer in [1, ${MAX_SKINNING_JOINTS}]`, "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount, maxJoints: MAX_SKINNING_JOINTS
    });
  }
  if (!skinning.matrices || skinning.matrices.length !== skinning.jointCount * 16) {
    throw new RenderDeviceError("Skinning matrix palette length must equal jointCount * 16", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount, matrixScalars: skinning.matrices?.length ?? 0
    });
  }
  for (let index = 0; index < skinning.matrices.length; index += 1) {
    if (!Number.isFinite(skinning.matrices[index])) throw new RenderDeviceError("Skinning matrix palette must contain finite values", "INVALID_SKINNING_PALETTE", { jointCount: skinning.jointCount, index });
  }
}

export function validateSkinningGeometryContract(item: RenderItem, skinning: SkinningPaletteBinding, options: { readonly generated?: boolean } = {}): void {
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
  if (options.generated && eightInfluence !== (skinning.extraInfluences === true)) {
    throw new RenderDeviceError("Generated skinning must enable exactly the geometry's declared influence sets", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label, extraInfluences: skinning.extraInfluences === true, hasJoints1, hasWeights1
    });
  }
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

  const jointBuffer = item.geometry.getAttributeBuffer("joints");
  const weightBuffer = item.geometry.getAttributeBuffer("weights");
  const joint1Buffer = eightInfluence ? item.geometry.getAttributeBuffer("joints1") : undefined;
  const weight1Buffer = eightInfluence ? item.geometry.getAttributeBuffer("weights1") : undefined;
  const vertexCount = item.geometry.vertexBuffer.vertexCount;
  const instanceDependent = [jointBuffer, weightBuffer, joint1Buffer, weight1Buffer].some((buffer) =>
    buffer && buffer.format.streams.find((stream) => stream.slot === buffer.bufferSlot)?.stepMode === "instance");
  const instanceCount = instanceDependent ? itemInstanceCount(item) : 1;
  for (let record = 0; record < instanceCount * vertexCount; record += 1) {
    const vertex = record % vertexCount;
    const instance = Math.floor(record / vertexCount);
    const joints = readSkinningAttribute(jointBuffer, "joints", vertex, instance);
    const weights = readSkinningAttribute(weightBuffer, "weights", vertex, instance);
    let weightSum = 0;
    if (eightInfluence) {
      // Validate the second set with the same rules, and fold it into the weight sum so
      // a vertex whose influence is split across both sets is not reported as unweighted.
      const joints1 = readSkinningAttribute(joint1Buffer!, "joints1", vertex, instance);
      const weights1 = readSkinningAttribute(weight1Buffer!, "weights1", vertex, instance);
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
      if ((weight > 0 || options.generated) && joint >= skinning.jointCount) {
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

function itemInstanceCount(item: RenderItem): number {
  return item.instanceTransforms ? Math.floor(item.instanceTransforms.length / 16) : item.instanceCount ?? 1;
}

function readSkinningAttribute(buffer: VertexBuffer, semantic: "joints" | "weights" | "joints1" | "weights1", vertex: number, instance: number): readonly number[] {
  const stream = buffer.format.streams.find((candidate) => candidate.slot === buffer.bufferSlot)!;
  return buffer.getDecodedAttribute(stream.stepMode === "instance" ? Math.floor(instance / stream.divisor) : vertex, semantic);
}



// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from ForwardPass.ts; 0 changed logic lines.

import type { SkinningPaletteBinding, SkinningPaletteDecisionRecord, SkinningPaletteDiagnostics, SkinningPalettePath } from "../ForwardPass.js";
import { MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES, MAX_SKINNING_JOINTS, MAX_UNIFORM_SKINNING_JOINTS, isFiniteArrayLike } from "../ForwardPass.js";
import { Geometry } from "../Geometry.js";
import { Material } from "../Material.js";
import { applyMorphTargets } from "../MorphTarget.js";
import { RenderDeviceError, type RenderShaderProgram, type UniformValue } from "../RenderDevice.js";
import { Sampler } from "../Sampler.js";
import { Texture } from "../Texture.js";
import { TextureBinding } from "../TextureBinding.js";
import { decideSkinningPalettePath } from "../WebGPUSkinningLimits.js";
import type { RenderItem } from "../contracts/renderItem.js";

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

  beginFrame(): void {
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
  diagnostics(): SkinningPaletteDiagnostics {
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
      decisionOverflow: this.decisionOverflow
    };
  }

  bind(
    item: RenderItem,
    skinning: SkinningPaletteBinding,
    material: Material,
    shader: RenderShaderProgram,
    uniforms: Map<string, UniformValue>
  ): void {
    // Recorded before the upload so a contract throw still leaves its reason code behind.
    this.recordDecision(item, skinning, shader);
    const path = applySkinningUniforms(skinning, material, shader, uniforms);
    if (path === "data-texture") this.dataTextureSubmissions += 1;
    else this.uniformArraySubmissions += 1;
    const eightInfluence = item.geometry.vertexBuffer.format.hasAttribute("joints1")
      && item.geometry.vertexBuffer.format.hasAttribute("weights1");
    if (eightInfluence) this.eightInfluenceSubmissions += 1;
    const validatedJointCounts = SkinningPaletteUploadManager.validatedGeometryJointCounts.get(item.geometry) ?? new Set<number>();
    if (!validatedJointCounts.has(skinning.jointCount)) {
      validateSkinningGeometryContract(item, skinning);
      validatedJointCounts.add(skinning.jointCount);
      SkinningPaletteUploadManager.validatedGeometryJointCounts.set(item.geometry, validatedJointCounts);
    }
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
      shaderHasDataTexturePalette: reflection.has("u_jointPaletteTexture") && reflection.has("u_jointPaletteMode")
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
  return applyMorphTargets(item.geometry, item.morphTargets, item.morphWeights);
}

export function applyGpuMorphUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): boolean {
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

export function ceilToMultiple(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

export const SKINNING_PALETTE_TEXTURE_MAX_WIDTH = 1024;

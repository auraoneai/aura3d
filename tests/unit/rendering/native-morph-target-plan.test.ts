import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { applyMorphTargets, type MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import { createMorphTargetPlan, planMorphTargets } from "../../../packages/rendering/src/MorphTargetPlan";
import type { RenderShaderProgram, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { buildMorphTargetTexture, type MorphTargetTextureResult } from "../../../packages/rendering/src/resources/MorphTargetTexture";
import {
  bindPrd06MorphTextureUniforms,
  createPrd06DeformFeature,
  packActiveMorphs,
  releaseMorphTargetTexture,
  selectPrd06DeformValue
} from "../../../packages/rendering/src/shaders/deform/forwardFeature";
import { deformResources } from "../../../packages/rendering/src/lanes/prd06";

const flags = { values: {}, on: () => true } as QrFlags;
const limits = { maxTextureSize: 64, maxArrayLayers: 32 };
const restoreBuilder = deformResources.get(flags).buildMorphTargetTexture;

function geometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, 1);
  vertices.setAttribute(0, "position", [1, 2, 3]);
  return new Geometry(vertices, null);
}

function targets(count: number): MorphTargetDelta[] {
  return Array.from({ length: count }, (_, index) => ({ positions: [[index + 1, 0, 0]] }));
}

function item(overrides: Partial<RenderItem> = {}): RenderItem {
  return { ...overrides, geometry: overrides.geometry ?? geometry() } as RenderItem;
}

function shader(maxActiveVectors: number): RenderShaderProgram {
  return {
    reflection: {
      uniforms: new Set(["u_morphTexture", "u_morphActiveIndex4"]),
      uniformDetails: new Map([["u_morphActiveIndex4", { arraySize: maxActiveVectors }]])
    }
  } as unknown as RenderShaderProgram;
}

describe("non-lossy morph target planning", () => {
  it("packs all 32 supported target layers without modifying the input", () => {
    const base = geometry();
    const source = targets(32);
    const result = buildMorphTargetTexture(base, source, limits, "rgba32f");
    expect("texture" in result).toBe(true);
    if (!("texture" in result)) throw new Error(result.reason);
    expect(result.targetCount).toBe(32);
    expect(result.targets).toBe(source);
    expect(result.texture.data?.[31 * 4]).toBe(32);
    result.texture.dispose();
    base.dispose();
  });

  it("requests CPU fallback for the 33rd target and preserves its actual deformation", () => {
    const base = geometry();
    const source = targets(33);
    const weights = Array(33).fill(0) as number[];
    weights[32] = 0.5;
    expect(buildMorphTargetTexture(base, source, limits, "rgba32f")).toMatchObject({ fallback: "cpu" });
    const morphed = applyMorphTargets(base, source, weights);
    expect(morphed.vertexBuffer.getAttribute(0, "position")).toEqual([17.5, 2, 3]);
    expect(base.vertexBuffer.getAttribute(0, "position")).toEqual([1, 2, 3]);
    expect(source[32]?.positions).toEqual([[33, 0, 0]]);
    morphed.dispose();
    base.dispose();
  });

  it("uses the texture plan for tangent deltas even at the uniform size limit", () => {
    const source: MorphTargetDelta[] = [{ positions: [[1, 0, 0]], tangents: [[0, 2, 0]] }];
    const active = createMorphTargetPlan(source, [1], 1);
    expect(active).toMatchObject({ mode: "texture", morphsTangents: true, rowsPerTarget: 3 });
    expect(Array.from(active.textureData.slice(8, 12))).toEqual([0, 2, 0, 0]);
    expect(active.uniformPositionDeltas).toHaveLength(0);
    // The plan exposes mutable weight storage, so retain zero-weight tangent
    // data as well; activating it later must not reveal an omitted channel.
    const inactive = createMorphTargetPlan(source, [0], 1);
    expect(inactive.mode).toBe("texture");
    expect(Array.from(inactive.textureData.slice(8, 12))).toEqual([0, 2, 0, 0]);
    expect(inactive.uniformWeights[0]).toBe(0);
    expect(planMorphTargets(1, 1, true).mode).toBe("uniform");
  });

  it("requests CPU fallback if the tangent rows do not fit the 2D texture", () => {
    const plan = createMorphTargetPlan([{ tangents: [[0, 1, 0]] }], [1], 1, { maxTextureSize: 2 });
    expect(plan.mode).toBe("cpu");
    expect(plan.morphsTangents).toBe(true);
    expect(plan.textureData).toHaveLength(0);
    expect(plan.uniformWeights[0]).toBe(1);
  });

  it("does not select a capped array-texture program for too many targets or active weights", () => {
    const overBucket = item({ morphTargets: targets(33), morphWeights: Array(33).fill(0) });
    expect(selectPrd06DeformValue(overBucket, "forward", QUALITY_TIERS.high, flags)).toBeUndefined();
    const source = targets(9);
    const overActive = item({ morphTargets: source, morphWeights: Array(9).fill(1) });
    expect(selectPrd06DeformValue(overActive, "forward", QUALITY_TIERS.low, flags)).toBeUndefined();
    const atActive = item({ morphTargets: source, morphWeights: [...Array(8).fill(1), 0] });
    createPrd06DeformFeature({} as never, buildMorphTargetTexture);
    try {
      expect(selectPrd06DeformValue(atActive, "forward", QUALITY_TIERS.low, flags)).toBe("morph16|k8");
    } finally {
      releaseMorphTargetTexture(atActive.geometry);
      createPrd06DeformFeature({} as never, restoreBuilder);
    }
    overBucket.geometry.dispose();
    overActive.geometry.dispose();
    atActive.geometry.dispose();
  });

  it("accounts for previous-only contributions when checking the shader cap", () => {
    const source = targets(9);
    const current = [1, 1, 1, 1, 0, 0, 0, 0, 0];
    const previous = Float32Array.from([0, 0, 0, 0, 1, 1, 1, 1, 1]);
    const renderItem = item({ morphTargets: source, morphWeights: current, previousMorphWeights: previous });
    expect(selectPrd06DeformValue(renderItem, "forward", QUALITY_TIERS.low, flags)).toBeUndefined();
    const packed = packActiveMorphs([1, 0, 0], 3, 4, Float32Array.from([0, 0, 0.5]));
    expect(packed.count).toBe(2);
    expect(Array.from(packed.indices.slice(0, 2))).toEqual([0, 2]);
    expect(Array.from(packed.current.slice(0, 2))).toEqual([1, 0]);
    expect(Array.from(packed.previous!.slice(0, 2))).toEqual([0, 0.5]);
    renderItem.geometry.dispose();
  });

  it("refuses a reflected shader cap overflow without binding a partial texture", () => {
    const renderItem = item({ morphTargets: targets(5), morphWeights: [1, 1, 1, 1, 1] });
    const uniforms = new Map<string, UniformValue>();
    expect(bindPrd06MorphTextureUniforms(renderItem, shader(1), uniforms)).toBe(false);
    expect(uniforms.size).toBe(0);
    renderItem.geometry.dispose();
  });

  it("clears prior motion weights when the current item has no previous weights", () => {
    const feature = createPrd06DeformFeature({} as never, buildMorphTargetTexture);
    const renderItem = item({ morphTargets: targets(2), morphWeights: [0.5, 0] });
    const uniforms = new Map<string, UniformValue>([["u_morphPrevWeight4", Float32Array.of(1, 1, 1, 1)]]);
    try {
      feature.bindUniforms!("morph4|k8", renderItem, (name, value) => uniforms.set(name, value));
      expect(Array.from(uniforms.get("u_morphPrevWeight4") as Float32Array)).toEqual([0, 0, 0, 0]);
    } finally {
      releaseMorphTargetTexture(renderItem.geometry);
      createPrd06DeformFeature({} as never, restoreBuilder);
      renderItem.geometry.dispose();
    }
  });

  it("selects CPU before building a texture that exceeds the dimension limit", () => {
    const build = vi.fn(() => { throw new Error("must not build"); });
    createPrd06DeformFeature({} as never, build);
    const large = new Geometry(new VertexBuffer(VertexFormat.P3N3T4T2, 4097), null);
    const renderItem = item({ geometry: large, morphTargets: targets(1), morphWeights: [1] });
    try {
      expect(selectPrd06DeformValue(renderItem, "forward", QUALITY_TIERS.high, flags)).toBeUndefined();
      expect(build).not.toHaveBeenCalled();
    } finally {
      createPrd06DeformFeature({} as never, restoreBuilder);
      large.dispose();
    }
  });

  it("rejects a non-finite previous weight instead of rendering an invalid velocity", () => {
    const renderItem = item({
      morphTargets: targets(1), morphWeights: [1], previousMorphWeights: Float32Array.of(NaN)
    });
    expect(() => selectPrd06DeformValue(renderItem, "forward", QUALITY_TIERS.high, flags)).toThrow(/finite/);
    renderItem.geometry.dispose();
  });

  it("falls back before shader selection if the builder declines, and retries after it becomes available", () => {
    let available = false;
    const build = vi.fn((...args: Parameters<typeof buildMorphTargetTexture>): MorphTargetTextureResult =>
      available ? buildMorphTargetTexture(...args) : { fallback: "cpu", reason: "provider unavailable" }
    );
    createPrd06DeformFeature({} as never, build);
    const renderItem = item({ morphTargets: targets(1), morphWeights: [1] });
    try {
      expect(selectPrd06DeformValue(renderItem, "forward", QUALITY_TIERS.high, flags)).toBeUndefined();
      available = true;
      expect(selectPrd06DeformValue(renderItem, "forward", QUALITY_TIERS.high, flags)).toBe("morph4|k32");
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      releaseMorphTargetTexture(renderItem.geometry);
      createPrd06DeformFeature({} as never, restoreBuilder);
      renderItem.geometry.dispose();
    }
  });

  it("rejects a stale selected key before building when weights exceed its cap", () => {
    const build = vi.fn(() => { throw new Error("must not build"); });
    const feature = createPrd06DeformFeature({} as never, build);
    const renderItem = item({ morphTargets: targets(5), morphWeights: [1, 1, 1, 1, 1] });
    try {
      expect(() => feature.bindUniforms!("morph8|k4", renderItem, () => {})).toThrow(/CPU deformation/);
      expect(build).not.toHaveBeenCalled();
    } finally {
      createPrd06DeformFeature({} as never, restoreBuilder);
      renderItem.geometry.dispose();
    }
  });
});

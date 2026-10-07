/**
 * PRD-06 T2.2 (required spec, PRD-06:1145) — the forward `prd06.deform` C-02
 * ShaderFeature. Covers:
 *   - `select`: rigid → undefined; 4-joint skin → `skin4`; 8-influence →
 *     `skin8`; morph-only → `morph<B>[n][t]|k<K>`; combined `skin…|morph…|k…`.
 *     A sample rig battery keeps the distinct value count under 6 per tier so
 *     generated programs stay cacheable.
 *   - `defines`: parses the key back into `A3D_SKINNING`, `A3D_MORPH` (bucket),
 *     `A3D_MORPH_NORMALS`, `A3D_MORPH_TANGENTS`, `A3D_MORPH_MAX_ACTIVE`; the
 *     pre-select `true` stamp contributes no defines.
 *   - Program-key segregation: changing the feature value changes
 *     `computeProgramKey`.
 *   - The §8.2 uniform bind path (`bindPrd06MorphTextureUniforms`), including
 *     the CPU fallback.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QrFlags, QrFlagName, QrFlagValue } from "@aura3d/rendering/contracts";
import { computeProgramKey, shaderFeaturesFor, type ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import type { MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import type { SkinningPaletteBinding } from "../../../packages/rendering/src/ForwardPass";
import {
  bindPrd06MorphTextureUniforms,
  morphMaxActiveForTier,
  packActiveMorphs,
  parsePrd06DeformKey,
  prd06DeformDefines,
  selectPrd06DeformValue
} from "../../../packages/rendering/src/shaders/deform/forwardFeature";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
// Importing the lane barrel registers the feature + morph builder (module init).
import "../../../packages/rendering/src/lanes/prd06";

function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

const FLAGS_ON = flagsOf({ A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true });
const FLAGS_ANIMATION_ONLY = flagsOf({ A3D_QR_ANIMATION: true });
const TIER_HIGH = QUALITY_TIERS.high;

function geometry(vertexCount = 8): Geometry {
  return new Geometry(new VertexBuffer(VertexFormat.P3N3T4T2, vertexCount), new IndexBuffer([0, 1, 2], vertexCount));
}

function skinned(extraInfluences = false, jointCount = 24): SkinningPaletteBinding {
  return { jointCount, matrices: new Float32Array(jointCount * 16), extraInfluences };
}

type Vec3 = readonly [number, number, number];

function morphTargets(count: number, opts: { normals?: boolean; tangents?: boolean } = {}, vertexCount = 8): MorphTargetDelta[] {
  const positions = (): Vec3[] => Array.from({ length: vertexCount }, () => [0.1, 0, 0]);
  const normals = (): Vec3[] => Array.from({ length: vertexCount }, () => [0, 1, 0]);
  const tangents = (): Vec3[] => Array.from({ length: vertexCount }, () => [1, 0, 0]);
  return Array.from({ length: count }, (_, i) => ({
    name: `t${i}`,
    positions: positions(),
    ...(opts.normals ? { normals: normals() } : {}),
    ...(opts.tangents ? { tangents: tangents() } : {})
  }));
}

function item(overrides: Partial<RenderItem>): RenderItem {
  return { geometry: geometry(), ...overrides } as RenderItem;
}

describe("prd06.deform forward feature — select", () => {
  it("returns undefined for a rigid item", () => {
    expect(selectPrd06DeformValue(item({}), "forward", TIER_HIGH, FLAGS_ON)).toBeUndefined();
  });

  it("returns undefined outside the forward pass even when skinned", () => {
    expect(selectPrd06DeformValue(item({ skinning: skinned() }), "depth", TIER_HIGH, FLAGS_ON)).toBeUndefined();
  });

  it("skin4 for a four-influence skin; skin8 for eight", () => {
    expect(selectPrd06DeformValue(item({ skinning: skinned(false) }), "forward", TIER_HIGH, FLAGS_ON)).toBe("skin4");
    expect(selectPrd06DeformValue(item({ skinning: skinned(true) }), "forward", TIER_HIGH, FLAGS_ON)).toBe("skin8");
  });

  it("morph-only keys carry the bucket and attribute suffixes", () => {
    const two = morphTargets(2, { normals: true });
    expect(selectPrd06DeformValue(item({ morphTargets: two, morphWeights: [0.5, 0] }), "forward", TIER_HIGH, FLAGS_ON)).toBe(
      `morph4n|k${morphMaxActiveForTier(TIER_HIGH)}`
    );
    const withTangents = morphTargets(5, { normals: true, tangents: true });
    expect(
      selectPrd06DeformValue(item({ morphTargets: withTangents, morphWeights: [1] }), "forward", TIER_HIGH, FLAGS_ON)
    ).toBe(`morph8nt|k${morphMaxActiveForTier(TIER_HIGH)}`);
  });

  it("combines skin + morph into one key", () => {
    const targets = morphTargets(12, { normals: true });
    const value = selectPrd06DeformValue(
      item({ skinning: skinned(true), morphTargets: targets, morphWeights: [0.25] }),
      "forward",
      TIER_HIGH,
      FLAGS_ON
    );
    expect(value).toBe(`skin8|morph16n|k${morphMaxActiveForTier(TIER_HIGH)}`);
  });

  it("omits the morph segment when A3D_QR_ANIMATION_GPU_MORPH is off", () => {
    const targets = morphTargets(2);
    expect(
      selectPrd06DeformValue(item({ morphTargets: targets, morphWeights: [1] }), "forward", TIER_HIGH, FLAGS_ANIMATION_ONLY)
    ).toBeUndefined();
    expect(
      selectPrd06DeformValue(
        item({ skinning: skinned(), morphTargets: targets, morphWeights: [1] }),
        "forward",
        TIER_HIGH,
        FLAGS_ANIMATION_ONLY
      )
    ).toBe("skin4");
  });

  it("stays under 6 distinct values across a representative rig battery", () => {
    const battery: RenderItem[] = [
      item({}),
      item({ skinning: skinned(false) }),
      item({ skinning: skinned(true) }),
      item({ morphTargets: morphTargets(2), morphWeights: [0.5] }),
      item({ morphTargets: morphTargets(9, { normals: true }), morphWeights: [0.5] }),
      item({ skinning: skinned(false), morphTargets: morphTargets(3), morphWeights: [0.5] }),
      item({ skinning: skinned(true), morphTargets: morphTargets(20, { normals: true, tangents: true }), morphWeights: [0.5] })
    ];
    const values = new Set(
      battery.map((entry) => selectPrd06DeformValue(entry, "forward", TIER_HIGH, FLAGS_ON)).filter((v) => v !== undefined)
    );
    expect(values.size).toBeLessThanOrEqual(6);
    expect(values.size).toBeGreaterThanOrEqual(5);
  });

  it("changes the program key when the deform key changes", () => {
    const base = { pass: "forward", features: { "prd06.deform": "skin4" } } as unknown as ProgramFeatures;
    const other = { pass: "forward", features: { "prd06.deform": "skin8|morph16n|k32" } } as unknown as ProgramFeatures;
    expect(computeProgramKey(base)).not.toBe(computeProgramKey(other));
    expect(computeProgramKey(base)).toContain("skin4");
  });
});

describe("prd06.deform forward feature — defines + registry", () => {
  it("parses the select key back into the §8.2/§8.3 define set", () => {
    expect(prd06DeformDefines("skin8|morph16nt|k32")).toEqual({
      A3D_SKINNING: 8,
      A3D_MORPH: 16,
      A3D_MORPH_MAX_ACTIVE: 32,
      A3D_MORPH_NORMALS: true,
      A3D_MORPH_TANGENTS: true,
      A3D_HAS_TANGENT: true
    });
    expect(prd06DeformDefines("skin4")).toEqual({ A3D_SKINNING: 4 });
  });

  it("contributes no defines for the pre-select `true` stamp", () => {
    expect(prd06DeformDefines(true)).toEqual({});
    expect(prd06DeformDefines(1)).toEqual({});
  });

  it("registers under A3D_QR_ANIMATION: active(flags) gates contribution", () => {
    const on = shaderFeaturesFor(FLAGS_ANIMATION_ONLY).map((f) => f.id);
    const off = shaderFeaturesFor(flagsOf({})).map((f) => f.id);
    expect(on).toContain("prd06.deform");
    expect(off).not.toContain("prd06.deform");
  });

  it("maps the C-27 tier caps: 8/16/32/64 by tier", () => {
    const expectCap = (tier: AuraQualityTierSettings, expected: number) => expect(morphMaxActiveForTier(tier)).toBe(expected);
    expectCap(QUALITY_TIERS.low, 8);
    expectCap(QUALITY_TIERS.medium, 16);
    expectCap(QUALITY_TIERS.high, 32);
    expectCap(QUALITY_TIERS.ultra, 64);
  });
});

describe("packActiveMorphs — §8.2 top-K list", () => {
  it("packs non-zero weights sorted by |w| into vec4-sized arrays", () => {
    const packed = packActiveMorphs([0, 0.9, 0.1, -0.8, 0, 0.05], 6, 32);
    expect(packed.count).toBe(4);
    expect(Array.from(packed.indices.slice(0, 4))).toEqual([1, 3, 2, 5]);
    expect(Array.from(packed.current.slice(0, 4))).toEqual([0.9, -0.8, 0.1, 0.05].map((v) => Math.fround(v)));
    expect(packed.indices.length % 4).toBe(0);
    expect(packed.previous).toBeNull();
  });

  it("caps at maxActive and records previous weights for velocity", () => {
    const weights = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 0.01 * i : 0));
    const prev = Float32Array.from({ length: 40 }, () => 0.5);
    const packed = packActiveMorphs(weights, 40, 8, prev);
    expect(packed.count).toBe(8);
    expect(packed.previous?.length).toBe(packed.indices.length);
    expect(packed.previous?.[0]).toBe(0.5);
  });

  it("returns a zero-count pack for all-zero weights", () => {
    const packed = packActiveMorphs([0, 0, 0], 3, 8);
    expect(packed.count).toBe(0);
    expect(packed.indices.length).toBe(4);
  });
});

describe("bindPrd06MorphTextureUniforms — §8.2 bind", () => {
  // The provided C-18 builder defers to A3D_QR_ANIMATION_GPU_MORPH at call time;
  // install the lane flags for the bind assertions and restore after.
  beforeEach(() => setRendererQrFlags(FLAGS_ON));
  afterEach(() => setRendererQrFlags(flagsOf({})));

  function fakeShader(names: Record<string, number | null>) {
    return {
      reflection: {
        uniforms: new Set(Object.keys(names)),
        uniformDetails: new Map(Object.entries(names).map(([name, arraySize]) => [name, { arraySize }]))
      }
    } as never;
  }

  it("binds the array texture, stride, width and the packed top-K list", () => {
    const shader = fakeShader({ u_morphTexture: null, u_morphActiveIndex4: 8 });
    const uniforms = new Map<string, unknown>();
    const targets = morphTargets(3);
    const renderItem = item({ morphTargets: targets, morphWeights: [0.7, 0, -0.2] });
    expect(bindPrd06MorphTextureUniforms(renderItem, shader as never, uniforms as never)).toBe(true);
    expect(uniforms.get("u_morphStride")).toBe(1);
    expect(uniforms.get("u_morphTexWidth")).toBeGreaterThan(0);
    expect(uniforms.get("u_morphActiveCount")).toBe(2);
    const indices = uniforms.get("u_morphActiveIndex4") as Float32Array;
    const weights = uniforms.get("u_morphActiveWeight4") as Float32Array;
    expect(Array.from(indices.slice(0, 2))).toEqual([0, 2]);
    expect(weights[0]).toBeCloseTo(0.7);
    expect(weights[1]).toBeCloseTo(-0.2);
    expect(uniforms.get("u_morphTexture")).toBeTruthy();
  });

  it("returns false when the program does not declare the morph texture", () => {
    const uniforms = new Map<string, unknown>();
    const renderItem = item({ morphTargets: morphTargets(2), morphWeights: [1] });
    expect(bindPrd06MorphTextureUniforms(renderItem, fakeShader({}) as never, uniforms as never)).toBe(false);
    expect(uniforms.size).toBe(0);
  });

  it("returns false when the texture build falls back to CPU (oversized vertex set)", () => {
    const shader = fakeShader({ u_morphTexture: null, u_morphActiveIndex4: 2 });
    const uniforms = new Map<string, unknown>();
    const big = item({
      geometry: geometry(5000), // > PRD06_MORPH_TEXTURE_LIMITS.maxTextureSize (4096)
      morphTargets: morphTargets(2, {}, 5000),
      morphWeights: [1, 0]
    });
    expect(bindPrd06MorphTextureUniforms(big, shader as never, uniforms as never)).toBe(false);
  });
});

describe("select key parser", () => {
  it("round-trips the emitted key", () => {
    expect(parsePrd06DeformKey("skin8|morph16nt|k64")).toEqual({
      influences: 8,
      morphBucket: 16,
      morphNormals: true,
      morphTangents: true,
      morphMaxActive: 64
    });
    expect(parsePrd06DeformKey("skin4")).toMatchObject({ influences: 4, morphBucket: null });
    expect(parsePrd06DeformKey("morph8n|k8")).toMatchObject({ morphBucket: 8, morphNormals: true, morphTangents: false, morphMaxActive: 8 });
  });
});

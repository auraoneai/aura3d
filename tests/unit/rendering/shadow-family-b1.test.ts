import { describe, expect, it } from "vitest";
import {
  applyForwardSpotShadowMapUniforms,
  type RenderItem,
} from "../../../packages/rendering/src/ForwardPass";
import { RenderDeviceError, type RenderShaderProgram, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { createShadowAtlasPlan } from "../../../packages/rendering/src/ShadowMap";
import {
  computeShimmerScore,
  createCascadeBiasTable,
  selectCascadeWithHysteresis,
} from "../../../packages/rendering/src/shadows/CascadeHysteresis";
import {
  createSpotShadowProjection,
  projectSpotShadowUv,
  resolveSpotShadowFactor,
  selectSpotShadowAtlasTier,
  type ForwardSpotShadowMapOptions,
} from "../../../packages/rendering/src/shadows/SpotShadowMaps";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import {
  createDefaultShaderLibrary,
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
  DEFAULT_MORPH_UNLIT_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
} from "../../../packages/rendering/src/ShaderLibrary";

/**
 * B1 shadow family (muse3jsparity-PRD): spot perspective path, shared-bias
 * hardening, atlas packing with fallback, CSM hysteresis + shimmer metric.
 * Browser pixel proof (60s moving-camera stress, caster-free control) is
 * recorded as blocked: no Playwright browsers in this environment.
 */

const SPOT_UNIFORMS = [
  "u_spotShadowMapTexture",
  "u_spotShadowMapEnabled",
  "u_spotShadowLightPosition",
  "u_spotShadowLightDirection",
  "u_spotShadowMatrix",
  "u_spotShadowCone",
  "u_spotShadowRange",
  "u_spotShadowStrength",
  "u_spotShadowBias",
  "u_spotShadowSlopeBias",
  "u_spotShadowTexelSize",
  "u_spotShadowPcfSampleCount",
  "u_spotShadowPcfSamples",
];

function fakeShader(uniforms: readonly string[]): RenderShaderProgram {
  return {
    reflection: {
      attributes: new Map(),
      uniforms: new Set(uniforms),
      attributeDetails: new Map(),
      uniformDetails: new Map(),
    },
  } as unknown as RenderShaderProgram;
}

function fakeItem(): RenderItem {
  return { geometry: Geometry.triangle(), label: "spot-test" };
}

function spotOptions(): ForwardSpotShadowMapOptions {
  return {
    texture: new TextureBinding({
      name: "u_spotShadowMapTexture",
      texture: new Texture({ width: 1024, height: 1024, format: "depth24" }),
    }),
    lightPosition: [0, 4, 0],
    lightDirection: [0, -1, 0],
    angle: Math.PI / 6,
    penumbra: 0.4,
    range: 12,
    shadowMatrix: new Float32Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)),
  };
}

describe("B1 spot shadow projection", () => {
  it("builds a perspective projection with fovY = 2 * angle", () => {
    const projection = createSpotShadowProjection(Math.PI / 6, 12);
    expect(projection.fovY).toBeCloseTo(Math.PI / 3, 10);
    expect(projection.near).toBe(0.1);
    expect(projection.far).toBe(12);
    // f = 1/tan(30deg) = sqrt(3)
    expect(projection.projectionMatrix[0]).toBeCloseTo(Math.sqrt(3), 10);
    expect(projection.projectionMatrix[5]).toBeCloseTo(Math.sqrt(3), 10);
    expect(() => createSpotShadowProjection(0, 12)).toThrow(RangeError);
    expect(() => createSpotShadowProjection(Math.PI / 6, -1)).toThrow(RangeError);
  });

  it("rejects positions behind the light or outside the cone", () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    // Behind the light (positive Y while the cone points down).
    expect(projectSpotShadowUv([0, 5, 0], [0, 4, 0], [0, -1, 0], Math.PI / 6, identity)).toBeNull();
    // Far outside the cone.
    expect(projectSpotShadowUv([10, 0, 0], [0, 4, 0], [0, -1, 0], Math.PI / 6, identity)).toBeNull();
    // Inside the cone, centered under the light: identity matrix maps to NDC (0,0,z).
    const hit = projectSpotShadowUv([0, 0, 0], [0, 4, 0], [0, -1, 0], Math.PI / 6, identity);
    expect(hit).not.toBeNull();
    expect(hit!.u).toBeCloseTo(0.5, 10);
    expect(hit!.v).toBeCloseTo(0.5, 10);
  });

  it("resolves a PCF factor hardened by the shared bias tables", () => {
    // Occluder taps nearer than the receiver shadow it; taps beyond it pass.
    // All taps lit -> full light; no taps lit (default strength 1) -> 0.
    expect(
      resolveSpotShadowFactor({ tapDepths: [0.5, 0.5, 0.5, 0.5], receiverDepth: 0.4, normalDotLight: 1 })
    ).toBe(1);
    expect(
      resolveSpotShadowFactor({ tapDepths: [0.1, 0.1, 0.1, 0.1], receiverDepth: 0.4, normalDotLight: 1 })
    ).toBe(0);
    // Partially lit taps average, scaled by strength.
    expect(
      resolveSpotShadowFactor({ tapDepths: [0.5, 0.5, 0.1, 0.1], receiverDepth: 0.4, normalDotLight: 1, strength: 0.65 })
    ).toBeCloseTo(0.675, 5);
    expect(() => resolveSpotShadowFactor({ tapDepths: [], receiverDepth: 0.4, normalDotLight: 1 })).toThrow(RangeError);
  });

  it("tiers atlas resolution by cone width", () => {
    expect(selectSpotShadowAtlasTier(Math.PI / 12).resolution).toBe(512);
    expect(selectSpotShadowAtlasTier(Math.PI / 6).resolution).toBe(1024);
    expect(selectSpotShadowAtlasTier(Math.PI / 3).resolution).toBe(2048);
  });
});

describe("B1 ForwardPass spot uniform wiring", () => {
  it("is a no-op when the program declares no spot uniforms (zero look change)", () => {
    const uniforms = new Map<string, UniformValue>();
    applyForwardSpotShadowMapUniforms(spotOptions(), fakeItem(), fakeShader([]), uniforms);
    expect(uniforms.size).toBe(0);
  });

  it("binds disabled defaults when no spot map is provided", () => {
    const uniforms = new Map<string, UniformValue>();
    applyForwardSpotShadowMapUniforms(undefined, fakeItem(), fakeShader(SPOT_UNIFORMS), uniforms);
    expect(uniforms.get("u_spotShadowMapEnabled")).toBe(0);
    expect(uniforms.get("u_spotShadowCone")).toEqual([Math.PI / 4, 0]);
  });

  it("binds cone + matrix + PCF kernel when a spot map is provided", () => {
    const uniforms = new Map<string, UniformValue>();
    applyForwardSpotShadowMapUniforms(spotOptions(), fakeItem(), fakeShader(SPOT_UNIFORMS), uniforms);
    expect(uniforms.get("u_spotShadowMapEnabled")).toBe(1);
    expect(uniforms.get("u_spotShadowCone")).toEqual([Math.PI / 6, 0.4]);
    expect(uniforms.get("u_spotShadowRange")).toBe(12);
    expect(uniforms.get("u_spotShadowPcfSampleCount")).toBe(9);
  });

  it("rejects out-of-range cone angles with the spot contract code", () => {
    const uniforms = new Map<string, UniformValue>();
    const bad = { ...spotOptions(), angle: Math.PI };
    try {
      applyForwardSpotShadowMapUniforms(bad, fakeItem(), fakeShader(SPOT_UNIFORMS), uniforms);
      expect.unreachable("spot cone validation must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RenderDeviceError);
      expect((error as RenderDeviceError).code).toBe("FORWARD_SPOT_SHADOW_MAP_CONTRACT");
    }
  });
});

describe("B1 atlas plan with over-budget fallback", () => {
  it("packs directional + spot + point with utilization reported", () => {
    const plan = createShadowAtlasPlan(
      [
        { id: "directional", size: 1024, priority: 3 },
        { id: "spot-stage", size: 1024, priority: 2 },
        { id: "point-hall", size: 512, priority: 1 },
      ],
      2048
    );
    expect(plan.fallbacks).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.allocations).toHaveLength(3);
    expect(plan.utilization).toBeCloseTo((1024 * 1024 * 2 + 512 * 512) / (2048 * 2048), 5);
  });

  it("sheds lowest-priority lights with a warning instead of throwing", () => {
    const plan = createShadowAtlasPlan(
      [
        { id: "directional", size: 2048, priority: 3 },
        { id: "spot-a", size: 1024, priority: 2 },
        { id: "spot-b", size: 1024, priority: 1 },
        { id: "point-c", size: 1024, priority: 0 },
      ],
      2048
    );
    expect(plan.fallbacks.length).toBeGreaterThan(0);
    expect(plan.warnings.length).toBe(plan.fallbacks.length);
    expect(plan.allocations.map((a) => a.id)).toContain("directional");
    expect(plan.utilization).toBeGreaterThan(1);
  });
});

describe("B1 cascade hysteresis + shimmer", () => {
  const splits = [
    { index: 0, near: 0, far: 10 },
    { index: 1, near: 10, far: 30 },
    { index: 2, near: 30, far: 100 },
  ];

  it("holds the current cascade inside the hysteresis band", () => {
    // Depth 10.5 is past the raw boundary but inside the 8%-of-span band.
    expect(selectCascadeWithHysteresis({ depth: 10.5, splits, previousIndex: 0 })).toBe(0);
    // Depth 12 clears the band -> flips.
    expect(selectCascadeWithHysteresis({ depth: 12, splits, previousIndex: 0 })).toBe(1);
    // First frame has no history -> raw selection.
    expect(selectCascadeWithHysteresis({ depth: 10.5, splits, previousIndex: null })).toBe(1);
  });

  it("scores a stable path near zero and a flickering path high", () => {
    const stable = Array.from({ length: 60 }, (_, i) => ({ cascadeIndex: 1, depth: 15 + i * 0.01 }));
    const stableScore = computeShimmerScore(stable, 100);
    expect(stableScore.flipRate).toBe(0);
    expect(stableScore.score).toBe(0);
    expect(stableScore.depthJitter).toBeGreaterThan(0);

    const flicker = Array.from({ length: 60 }, (_, i) => ({ cascadeIndex: i % 2, depth: 10 + (i % 2) * 0.5 }));
    const flickerScore = computeShimmerScore(flicker, 100);
    expect(flickerScore.flipRate).toBe(1);
    expect(flickerScore.score).toBeGreaterThan(0.5);
    expect(() => computeShimmerScore([stable[0]!], 100)).toThrow(RangeError);
  });

  it("grows per-cascade bias with cascade index (contact-gap retention)", () => {
    const table = createCascadeBiasTable({ cascadeCount: 4 });
    expect(table).toHaveLength(4);
    expect(table[0]!.baseBias).toBe(0.001);
    expect(table[3]!.baseBias).toBeGreaterThan(table[0]!.baseBias);
    expect(table[3]!.slopeScale).toBeGreaterThan(table[0]!.slopeScale);
    expect(table[0]!.effectiveBias).toBe(table[0]!.baseBias);
    expect(() => createCascadeBiasTable({ cascadeCount: 0 })).toThrow(RangeError);
  });
});

describe("B1 spot GLSL conformance", () => {
  const library = createDefaultShaderLibrary();
  const litShaders = [
    DEFAULT_INSTANCED_PBR_SHADER_NAME,
    DEFAULT_SKINNED_LIT_SHADER_NAME,
    DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
    DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  ];
  const spotUniformDeclarations = [
    "uniform sampler2D u_spotShadowMapTexture;",
    "uniform float u_spotShadowMapEnabled;",
    "uniform vec3 u_spotShadowLightPosition;",
    "uniform vec3 u_spotShadowLightDirection;",
    "uniform mat4 u_spotShadowMatrix;",
    "uniform vec2 u_spotShadowCone;",
    "uniform float u_spotShadowRange;",
    "uniform float u_spotShadowStrength;",
    "uniform float u_spotShadowBias;",
    "uniform float u_spotShadowSlopeBias;",
    "uniform vec2 u_spotShadowTexelSize;",
    "uniform float u_spotShadowPcfSampleCount;",
    "uniform vec4 u_spotShadowPcfSamples[32];",
  ];

  it("declares all 13 spot uniforms in every touched forward lit shader", () => {
    for (const name of [...litShaders, DEFAULT_TEXTURED_PBR_SHADER_NAME]) {
      const fragment = library.get(name).fragment;
      for (const declaration of spotUniformDeclarations) {
        expect(fragment, `${name} ${declaration}`).toContain(declaration);
      }
    }
  });

  it("samples the perspective spot map with the shared PCF/bias policy", () => {
    for (const name of litShaders) {
      const fragment = library.get(name).fragment;
      expect(fragment).toContain("float a3dSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection)");
      expect(fragment).toContain("if (u_spotShadowMapEnabled < 0.5) return 1.0;");
      expect(fragment).toContain("texture(u_spotShadowMapTexture, uv + offset).r");
      expect(fragment).toContain("u_spotShadowSlopeBias");
      expect(fragment).toContain("u_spotShadowPcfSamples[i]");
    }
    const textured = library.get(DEFAULT_TEXTURED_PBR_SHADER_NAME).fragment;
    expect(textured).toContain("float a3dTexturedPbrSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection)");
    expect(textured).toContain("texture(u_spotShadowMapTexture, uv + offset).r");
    expect(textured).not.toContain("a3dResolveSpotShadowOverride(");
  });

  it("gates the spot override to kind == 2 with an enabled flag, preserving the legacy factor otherwise", () => {
    for (const name of litShaders) {
      const fragment = library.get(name).fragment;
      expect(fragment).toContain(
        "step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled)"
      );
      expect(fragment).toContain("a3dResolveSpotShadowOverride(");
    }
    expect(library.get(DEFAULT_TEXTURED_PBR_SHADER_NAME).fragment).toContain(
      "a3dTexturedPbrResolveSpotShadowOverride("
    );
  });

  it("leaves unlit and lean-core shaders without spot uniforms (reflection guard stays a no-op)", () => {
    for (const name of [
      DEFAULT_PBR_SHADER_NAME,
      DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
      DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
      DEFAULT_SKINNED_UNLIT_SHADER_NAME,
      DEFAULT_MORPH_UNLIT_SHADER_NAME,
    ]) {
      expect(library.get(name).fragment, name).not.toContain("u_spotShadowMapEnabled");
    }
  });

  it("opts the two sampler-exhausted textured variants out of the spot block (16-sampler budget)", () => {
    // clearcoat-transmission-volume and specular-sheen-anisotropy-iridescence
    // sit at the 16-sampler WebGL2 minimum without the spot texture, so
    // A3D_PBR_NO_SPOT_SHADOW keeps them linkable; they sample spot lights
    // through the legacy directional factor.
    for (const variant of [
      DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
      DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
    ]) {
      const fragment = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, variant).fragment;
      expect(fragment, variant).not.toContain("u_spotShadowMapTexture");
      expect(fragment, variant).not.toContain("a3dTexturedPbrSpotShadowFactor");
      expect(fragment, variant).not.toContain("a3dTexturedPbrResolveSpotShadowOverride");
      const samplerCount = [...fragment.matchAll(/\buniform\s+sampler2D\s+/g)].length;
      expect(samplerCount, variant).toBeLessThanOrEqual(16);
    }
  });
});

import { describe, expect, it } from "vitest";
import { defineAuraAssets, effects, material, primitives, scene } from "../../../packages/engine/src/public/index.js";
import { parseAuraColorLinear, parseAuraColorSrgb } from "../../../packages/engine/src/agent-api/color.js";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess.js";
import { collectExposureSection, recordAuthoredPostContext, resetAuthoredPostContext } from "../../../packages/engine/src/agent-api/postBridge.js";
import { parseAuraColor } from "../../../packages/engine/src/contracts/sceneGraph.js";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core.js";
import { resolveToonPass } from "../../../packages/engine/src/agent-api/nodes/effects.toon.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { checkGlslUnchanged, checkWgslDepthTwin, checkWgslTwin } from "../apps/wgslTwinChecks.js";

const rampAsset = defineAuraAssets({
  ramp: { type: "texture", format: "png", url: "/ramp.png" }
}).ramp;

const MATERIAL_TWINS: readonly (readonly [string, AuraCustomMaterialSpec, boolean, boolean])[] = [
  ["strata-default", material.strata().custom!, true, true],
  ["strata-slope", material.strata({ colors: ["#aa5533", "#ddaa77", "#884422"], slope: { angle: 40, blend: 10, flatColor: "#ccbbaa" } }).custom!, true, true],
  ["caustics-default", material.caustics().custom!, true, true],
  ["caustics-surface", material.caustics({ surfaceY: 4, depthFade: 0.2 }).custom!, true, true],
  ["lightBeam", material.lightBeam({ color: "#ffe8b0", intensity: 1.5, length: 24 }).custom!, true, false],
  ["toon-plain", material.toon({ color: "#88aaff", steps: 4 }).custom!, true, true],
  ["toon-rim", material.toon({ color: "#88aaff", rim: { color: "#ffeecc", power: 4, intensity: 0.8 } }).custom!, true, true],
  ["toon-ramp-rim", material.toon({ color: "#ffffff", ramp: rampAsset, rim: { color: "#ffeecc", power: 3, intensity: 0.5 } }).custom!, true, true],
  ["distance", material.distance({ referencePosition: [1, 2, 3], near: 0.5, far: 50 }).custom!, false, false],
  ["shadow-directional", material.shadow({ color: "#101820", opacity: 0.5 }).custom!, false, false],
  ["shadow-point", material.shadow({ light: "point", opacity: 0.4 }).custom!, false, false],
  ["shadow-spot", material.shadow({ light: "spot", opacity: 0.4 }).custom!, false, false]
];

describe("WP-03: 7 built-in WGSL material & post twins", () => {
  it.each(MATERIAL_TWINS)("%s: WGSL twin matches GLSL reflection, locations, and bindings", (name, spec, instanced, castsShadow) => {
    checkWgslTwin(name, spec, instanced);
    if (castsShadow) {
      checkWgslDepthTwin(name, spec);
    }
  });

  it("keeps GLSL stages byte-for-byte identical across all paired material helpers", () => {
    checkGlslUnchanged(MATERIAL_TWINS);
  });

  it("passes webgpuCustomShaderGap with undefined gap for all 6 built-in custom materials", () => {
    let s = scene();
    for (const [name, spec] of MATERIAL_TWINS) {
      s = s.add(primitives.box({ name, material: { kind: "custom", custom: spec } }));
    }
    expect(webgpuCustomShaderGap(s.toJSON())).toBeUndefined();
  });

  it("emits paired WGSL shaders matching executeWebGPUCustomPass bindings for effects.toon (color & depth ink)", () => {
    const colorOnly = resolveToonPass({ bands: 4, edgeStart: 0.2, edgeEnd: 0.7 });
    expect(colorOnly.usesDepth).toBe(false);
    expect(colorOnly.wgsl).toContain("values: array<vec4<f32>, 7>");
    expect(colorOnly.wgsl).toContain("@group(0) @binding(1) var u_sampler: sampler;");
    expect(colorOnly.wgsl).toContain("@group(0) @binding(2) var u_color: texture_2d<f32>;");
    expect(colorOnly.wgsl).not.toContain("@binding(3)");

    const colorPass = effects.toon({ bands: 4, edgeStart: 0.2, edgeEnd: 0.7 });
    expect(colorPass.inputs).toBeUndefined();
    expect(colorPass.fragment.wgsl).toContain("@group(0) @binding(0) var<uniform> u_toon: ToonUniforms;");

    const depthInk = resolveToonPass({ inkSource: "depth", fadeDistance: 60 });
    expect(depthInk.usesDepth).toBe(true);
    expect(depthInk.wgsl).toContain("values: array<vec4<f32>, 10>");
    expect(depthInk.wgsl).toContain("@group(0) @binding(3) var u_depthLinear: texture_2d<f32>;");
    expect(depthInk.wgsl).toContain("textureLoad(u_depthLinear");

    const depthPass = effects.toon({ inkSource: "both", fadeDistance: 45 });
    expect(depthPass.inputs).toEqual(["color", "depth"]);
    expect(depthPass.fragment.glsl).toContain("texelFetch(u_depthLinear");
    expect(depthPass.fragment.wgsl).toContain("@group(0) @binding(3) var u_depthLinear: texture_2d<f32>;");
  });
});

describe("WP-03: primitives point-topology castShadow default", () => {
  it("defaults castShadow to false on point-topology primitives unless explicitly set to true", () => {
    const pointGeom = {
      kind: "aura-custom-geometry" as const,
      positions: new Float32Array([0, 0, 0, 1, 1, 1, -1, 0.5, 0]),
      indices: new Uint16Array([0, 1, 2]),
      topology: "points" as const
    };
    const defaultPoints = primitives.box({ geometry: pointGeom }).toJSON();
    expect(defaultPoints.castShadow).toBe(false);

    const explicitPoints = primitives.box({ geometry: pointGeom, castShadow: true }).toJSON();
    expect(explicitPoints.castShadow).toBe(true);

    const defaultTriangles = primitives.box({}).toJSON();
    expect(defaultTriangles.castShadow).toBe(true);
  });
});

describe("WP-03: wide-gamut Display-P3 & hardened CSS Color 4 parser", () => {
  it("parses color(display-p3 ...) with unclamped linear Rec.709 coordinates in parseAuraColorLinear / parseAuraColor", () => {
    const p3RedLinear = parseAuraColorLinear("color(display-p3 1 0 0)");
    // Display-P3 pure red in linear Rec.709 exceeds 1.0 in R and has negative G/B excursions.
    expect(p3RedLinear[0]).toBeCloseTo(1.2249401, 5);
    expect(p3RedLinear[1]).toBeCloseTo(-0.0420569, 5);
    expect(p3RedLinear[2]).toBeCloseTo(-0.0196376, 5);
    expect(p3RedLinear[3]).toBe(1);

    // Scene-graph parseAuraColor preserves wide-gamut linear coordinates for Display-P3 / HDR pipelines.
    const sceneColor = parseAuraColor("color(display-p3 1 0 0 / 0.5)");
    expect(sceneColor[0]).toBeCloseTo(1.2249401, 5);
    expect(sceneColor[1]).toBeCloseTo(-0.0420569, 5);
    expect(sceneColor[2]).toBeCloseTo(-0.0196376, 5);
    expect(sceneColor[3]).toBeCloseTo(0.5, 6);

    // Legacy sRGB helper clamps into [0, 1] without NaNs.
    const srgbClamped = parseAuraColorSrgb("color(display-p3 1 0 0)");
    expect(srgbClamped[0]).toBeCloseTo(1, 12);
    expect(srgbClamped[1]).toBe(0);
    expect(srgbClamped[2]).toBe(0);
    expect(srgbClamped[3]).toBe(1);
  });

  it("supports color(srgb), color(srgb-linear), oklab(), hwb(), none keyword, and bare-number hsl()", () => {
    expect(parseAuraColorSrgb("color(srgb 0.5 0.25 1 / 80%)")).toEqual([0.5, 0.25, 1, 0.8]);
    expect(parseAuraColorLinear("color(srgb-linear 0.2 0.4 0.8)")).toEqual([0.2, 0.4, 0.8, 1]);
    expect(parseAuraColorSrgb("hsl(120 100 50)")).toEqual(parseAuraColorSrgb("hsl(120 100% 50%)"));
    expect(parseAuraColorSrgb("hwb(0 0% 0%)")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("oklab(1 0 0)")[0]).toBeCloseTo(1, 3);
    expect(parseAuraColorSrgb("oklch(0.7 0 none / 50%)")[3]).toBeCloseTo(0.5, 6);
  });

  it("rejects malformed unit-only CSS tokens instead of silently coercing Number('') === 0", () => {
    for (const bad of ["rgb(%, %, %)", "rgba(255, 0, 0, %)", "hsl(deg, 50%, 50%)", "oklch(% % deg)", "color(display-p3 % 0 0)"]) {
      expect(() => parseAuraColorSrgb(bad), bad).toThrow(/COLOR_INVALID/);
      expect(() => parseAuraColorLinear(bad), bad).toThrow(/COLOR_INVALID/);
    }
  });

  it("omits conflicting legacy srgb outputColorSpace on v2 toneMapping when outputColorSpace is display-p3", () => {
    const snap = scene().add(primitives.box({ name: "cube" })).add(effects.bloom({ intensity: 0.25 })).toJSON();
    try {
      recordAuthoredPostContext({
        flags: createTrustedQrFlags({ A3D_QR_POST: true }),
        options: { output: { outputColorSpace: "display-p3", toneMapping: "agx" } }
      });
      const compiled = createProductionRuntimePostprocess(snap, []);
      expect(compiled.v2).toBe(true);
      expect(compiled.pipeline?.outputColorSpace).toBe("display-p3");
      expect(compiled.toneMapping).toBeTruthy();
      if (compiled.toneMapping && typeof compiled.toneMapping === "object") {
        expect(compiled.toneMapping.outputColorSpace).toBeUndefined();
        expect(compiled.toneMapping.operator).toBe("agx");
      }
      expect(collectExposureSection({ canvas: undefined } as never).outputColorSpace).toBe("display-p3");
    } finally {
      resetAuthoredPostContext();
    }
  });
});

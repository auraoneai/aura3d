import { describe, expect, test } from "vitest";
import {
  debugViewFeature,
  debugViewEndChunk,
  debugViewParsChunk,
  prd05DebugViewDefineName,
  prd05DebugViewValue,
  PRD05_DEBUG_VIEW_CHANNELS,
} from "../../../../packages/rendering/src/shaders/debug-view.glsl.js";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem.js";

/**
 * PRD-05 §6.7 debug views — feature select/defines/bind + channel table.
 * Chunk compile is covered by tests/qr/prd05/browser/debug-view-chunks.spec.ts.
 */

const item = (materialParams: Record<string, unknown>, lodLevel?: number): RenderItem => ({
  kind: "mesh",
  material: { getParameter: (name: string) => materialParams[name] },
  lodLevel,
} as unknown as RenderItem);

describe("PRD-05 §6.7 debugView feature", () => {
  test("channel table + define names", () => {
    expect(PRD05_DEBUG_VIEW_CHANNELS).toEqual([
      "TEXEL_DENSITY", "MIP_LEVEL", "FACET", "LOD_LEVEL",
      "BASE_COLOR", "WORLD_NORMAL", "ROUGHNESS", "METALLIC", "OCCLUSION", "UV_LAYOUT",
    ]);
    expect(prd05DebugViewValue("texelDensity")).toBe(1);
    expect(prd05DebugViewValue("lodLevel")).toBe(4);
    expect(prd05DebugViewValue("occlusion")).toBe(9);
    expect(prd05DebugViewDefineName(1)).toBe("A3D_PRD05_DEBUG_VIEW_TEXEL_DENSITY");
    expect(prd05DebugViewDefineName(4)).toBe("A3D_PRD05_DEBUG_VIEW_LOD_LEVEL");
    expect(prd05DebugViewDefineName(10)).toBe("A3D_PRD05_DEBUG_VIEW_UV_LAYOUT");
    expect(prd05DebugViewDefineName(0)).toBeUndefined();
    expect(prd05DebugViewDefineName(11)).toBeUndefined();
  });

  test("select activates only on forward pass with a valid u_prd05DebugView", () => {
    const base = { pass: "forward", tier: "high", flags: {} };
    const input = (renderItem: RenderItem, pass = "forward") =>
      ({ ...base, pass, item: renderItem }) as unknown as Parameters<NonNullable<typeof debugViewFeature.select>>[0];
    expect(debugViewFeature.select(input(item({ u_prd05DebugView: 1 })))).toBe(1);
    expect(debugViewFeature.select(input(item({ u_prd05DebugView: 4 })))).toBe(4);
    expect(debugViewFeature.select(input(item({ u_prd05DebugView: 0 })))).toBeUndefined();
    expect(debugViewFeature.select(input(item({})))).toBeUndefined();
    expect(debugViewFeature.select(input(item({ u_prd05DebugView: 1 }), "shadow"))).toBeUndefined();
  });

  test("defines emit exactly one channel define", () => {
    expect(debugViewFeature.defines(1)).toEqual({ A3D_PRD05_DEBUG_VIEW_TEXEL_DENSITY: true });
    expect(debugViewFeature.defines(2)).toEqual({ A3D_PRD05_DEBUG_VIEW_MIP_LEVEL: true });
    expect(debugViewFeature.defines(9)).toEqual({ A3D_PRD05_DEBUG_VIEW_OCCLUSION: true });
    expect(debugViewFeature.defines(11)).toEqual({});
  });

  test("bindUniforms mirrors baseColour texture + stamps lodLevel + texel band", () => {
    const setCalls: Record<string, unknown> = {};
    debugViewFeature.bindUniforms?.(3, item({ u_baseColorTexture: { id: "tex" }, u_prd05TexelBand: [1, 8] }, 2), (name, value) => { setCalls[name] = value; });
    expect(setCalls["a3d_prd05_debugSampler"]).toEqual({ id: "tex" });
    expect(setCalls["u_prd05LodLevel"]).toBe(2);
    expect(setCalls["u_prd05TexelBand"]).toEqual([1, 8]);
    const defaults: Record<string, unknown> = {};
    debugViewFeature.bindUniforms?.(1, item({}), (name, value) => { defaults[name] = value; });
    expect(defaults["u_prd05TexelBand"]).toEqual([0.5, 4]);
    expect(defaults["u_prd05LodLevel"]).toBe(0);
  });

  test("chunks are hook-aligned: pars chunk at fragment:pars, end chunk at fragment:end", () => {
    expect(debugViewFeature.chunks).toEqual([debugViewParsChunk.name, debugViewEndChunk.name]);
    expect(debugViewFeature.hooks).toEqual(["fragment:pars", "fragment:end"]);
    // hookSplice appends the pars chunk for hook-aligned end chunks, so the
    // end chunk declares no explicit `requires` (see debug-view.glsl.ts).
    expect(debugViewEndChunk.requires).toEqual([]);
    expect(debugViewFeature.flag).toBe("A3D_QR_ASSETS_LOOKDEV");
  });
});

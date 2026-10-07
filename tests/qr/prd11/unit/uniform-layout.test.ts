/**
 * PRD 11 Phase 6 groundwork (◦ §7.3): std140Offsets vs hand-computed offsets
 * for the C-08 AuraFrame/AuraLights member lists, emitGlslBlock/emitWgslStruct
 * shape, and the WGSL twin manifest parity report.
 */
import { describe, expect, it } from "vitest";
import {
  std140Offsets,
  emitGlslBlock,
  emitWgslStruct,
  AURA_FRAME_LAYOUT,
  AURA_LIGHTS_LAYOUT,
  type UniformBlockLayout
} from "../../../../packages/rendering/src/program/UniformLayout";
import { manifestParity, wgslTwins, wgslTwinFor } from "../../../../packages/rendering/src/program/chunks/manifest";
import { registerPrd11DrawIdShader, PRD11_DRAWID_CHUNK } from "../../../../packages/rendering/src/batching/shaders/drawId.glsl";
import { registerPrd11InstanceEmissiveShader, PRD11_INSTANCE_EMISSIVE_VTX_CHUNK, PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK } from "../../../../packages/rendering/src/batching/shaders/instanceEmissive.glsl";

describe("std140Offsets", () => {
  it("matches hand-computed offsets for AuraFrame (C-08 frozen order)", () => {
    const { size, offsets } = std140Offsets(AURA_FRAME_LAYOUT);
    expect(offsets).toEqual({
      u_view: 0,
      u_projection: 64,
      u_viewProjection: 128,
      u_prevViewProjection: 192,
      u_cameraPositionNear: 256,
      u_resolutionFarTime: 272,
      u_exposureFlags: 288
    });
    expect(size).toBe(304);
  });

  it("matches hand-computed offsets for AuraLights", () => {
    const { size, offsets } = std140Offsets(AURA_LIGHTS_LAYOUT);
    // u_lightCount: f32 at 0 (4B); u_lightData: vec4 array → 16B base at 16,
    // stride 16 × 96 = 1536; struct padded to 16.
    expect(offsets).toEqual({ u_lightCount: 0, u_lightData: 16 });
    expect(size).toBe(1552);
  });

  it("aligns vec3 to 16 and vec2 to 8; arrays stride at 16", () => {
    const layout: UniformBlockLayout = {
      name: "AuraMaterial",
      group: 2,
      binding: 0,
      members: [
        { name: "a", type: "f32" },       // 0..4
        { name: "b", type: "vec3" },      // align 16 → 16..28
        { name: "c", type: "vec2" },      // align 8 → 32..40
        { name: "d", type: "f32", arrayLength: 4 } // array → align 16, stride 16 → 48,64,80,96
      ]
    };
    const { size, offsets } = std140Offsets(layout);
    expect(offsets).toEqual({ a: 0, b: 16, c: 32, d: 48 });
    expect(size).toBe(112);
  });

  it("rejects invalid array lengths", () => {
    const layout: UniformBlockLayout = {
      name: "AuraObject", group: 3, binding: 0,
      members: [{ name: "x", type: "f32", arrayLength: 0 }]
    };
    expect(() => std140Offsets(layout)).toThrow(RangeError);
  });
});

describe("emitGlslBlock / emitWgslStruct", () => {
  it("emits a layout(std140) GLSL block with frozen member order", () => {
    const glsl = emitGlslBlock(AURA_FRAME_LAYOUT);
    expect(glsl).toContain("layout(std140) uniform AuraFrame {");
    expect(glsl).toContain("mat4 u_view;");
    expect(glsl).toContain("vec4 u_exposureFlags;");
    expect(glsl.trim().endsWith("};")).toBe(true);
  });

  it("emits a WGSL struct + uniform declaration with group/binding", () => {
    const wgsl = emitWgslStruct(AURA_FRAME_LAYOUT, "uniform");
    expect(wgsl).toContain("struct AuraFrame {");
    expect(wgsl).toContain("u_view: mat4x4<f32>,");
    expect(wgsl).toContain("@group(0) @binding(0) var<uniform> auraFrame: AuraFrame;");
  });

  it("emits storage var for kind=storage", () => {
    const wgsl = emitWgslStruct(AURA_LIGHTS_LAYOUT, "storage");
    expect(wgsl).toContain("@group(1) @binding(0) var<storage, read> auraLights: AuraLights;");
    expect(wgsl).toContain("u_lightData: array<vec4<f32>, 96>,");
  });
});

describe("WGSL twin manifest parity (§6.2)", () => {
  it("records the lane-11 twins at chunk registration", () => {
    registerPrd11DrawIdShader();
    registerPrd11InstanceEmissiveShader();
    const names = wgslTwins().map((t) => t.chunkName).sort();
    expect(names).toEqual([
      PRD11_DRAWID_CHUNK,
      PRD11_INSTANCE_EMISSIVE_VTX_CHUNK,
      PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK
    ].sort());
    expect(wgslTwinFor(PRD11_DRAWID_CHUNK)).toContain("fn a3dDrawTexel");
  });

  it("reports missing twins per owner without failing", () => {
    registerPrd11DrawIdShader();
    const parity = manifestParity([
      { name: PRD11_DRAWID_CHUNK, owner: "prd11" },
      { name: "a3d_prd02_csm", owner: "prd02" },
      { name: "a3d_prd03_bloom", owner: "prd03", wgsl: "// inline twin" }
    ]);
    expect(parity.withTwin).toBe(2);
    expect(parity.missing).toEqual([{ name: "a3d_prd02_csm", owner: "prd02" }]);
  });

  it("self-parity is clean once twins are registered", () => {
    registerPrd11DrawIdShader();
    registerPrd11InstanceEmissiveShader();
    expect(manifestParity()).toEqual({ withTwin: 3, missing: [] });
  });
});

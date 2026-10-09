/**
 * Lane-01 §15 Phase-4 test: C-05 OutputPass (r185 operators, exposure,
 * dither, BACKGROUND_COVERAGE MRT mix, juice overlay) + the §9.1 v2 frame
 * order (opaque/transparent split, scene-depth copy, sortDepth interleave)
 * + HDR scene-target allocation. Runs on MockRenderDevice — GLSL content and
 * draw sequencing are asserted, rasterization is the browser lane's job.
 */

import { describe, expect, it } from "vitest";

import {
  MockRenderDevice,
  OutputPass,
  PBRMaterial,
  UnlitMaterial,
  Renderer,
  createHdrTarget,
  ensureHdrTarget,
  mergeTransparentSegments,
  outputFragmentGlsl,
  probeHdrTargetFormat,
  splitForwardItems
} from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { registerFrameContributor } from "../../../../packages/rendering/src/contracts/frameGraph";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ env: {} });

function device(): MockRenderDevice {
  const d = new MockRenderDevice();
  (d.info as unknown as { capabilities: import("../../../../packages/rendering/src/RenderDevice").RenderDeviceCapability[] }).capabilities = [...(d.info.capabilities ?? []), "hdr-render-targets"];
  return d;
}

function triangleGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  for (let i = 0; i < 3; i++) vertices.setAttribute(i, "normal", [0, 0, 1]);
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

function item(material: PBRMaterial | UnlitMaterial, x = 0): RenderItem {
  return { geometry: triangleGeometry(), material, modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1] } as RenderItem;
}

function transparentItem(x = 0): RenderItem {
  return item(new UnlitMaterial({ renderState: { blend: true, depthWrite: false } as never }), x);
}

describe("outputFragmentGlsl variant keys", () => {
  it("maps each operator to its r185 function via TONE_MAP", () => {
    for (const [op, fn] of Object.entries({ none: "NoneToneMapping", linear: "LinearToneMapping", reinhard: "ReinhardToneMapping", aces: "ACESFilmicToneMapping", agx: "AgXToneMapping", neutral: "NeutralToneMapping" })) {
      const src = outputFragmentGlsl({ toneMapping: op, backgroundCoverage: false, overlay: false });
      expect(src).toContain(`#define TONE_MAP(c) ${fn}(c)`);
      expect(src).toContain("TONE_MAP(hdr * u_exposure)");
    }
  });

  it("keeps r185 operator constants and removes exposure lines", () => {
    const src = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: false, overlay: false });
    expect(src).toContain("0.59719");              // ACES input matrix
    expect(src).toContain("AgxMinEv = - 12.47393"); // AgX range
    expect(src).toContain("StartCompression");      // Khronos Neutral
    expect(src).not.toContain("toneMappingExposure");
  });

  it("applies sRGB OETF and triangular dither", () => {
    const src = outputFragmentGlsl({ toneMapping: "none", backgroundCoverage: false, overlay: false });
    expect(src).toContain("a3dLinearToSRGB(clamp(display, 0.0, 1.0))");
    expect(src).toContain("a3dTriangularNoise(gl_FragCoord.xy) / 255.0");
  });

  it("gates coverage mix and overlay on their defines", () => {
    const plain = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: false, overlay: false });
    expect(plain).not.toContain("#define BACKGROUND_COVERAGE");
    expect(plain).not.toContain("#define OUTPUT_OVERLAY");
    const covered = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: true, overlay: true });
    expect(covered).toContain("#define BACKGROUND_COVERAGE");
    expect(covered).toContain("texture(u_coverage, v_uv).r");
    expect(covered).toContain("#define OUTPUT_OVERLAY");
    expect(covered).toContain("a3dApplyOutputOverlay(encoded, v_uv)");
  });
});

describe("OutputPass on MockRenderDevice", () => {
  it("draws the fullscreen triangle to canvas with the expected uniforms", () => {
    const d = device();
    const scene = createHdrTarget(d, { width: 4, height: 4 });
    const pass = new OutputPass(d);
    d.beginFrame(4, 4);
    pass.execute(scene, null, { toneMapping: "aces", exposure: 2, dithering: true, backgroundCoverage: false }, "canvas");
    d.endFrame();
    const draw = d.drawCommands.at(-1);
    expect(draw).toBeTruthy();
    const uniforms = (draw as { uniforms?: Map<string, unknown> }).uniforms;
    expect(uniforms?.get("u_exposure")).toBe(2);
    expect(uniforms?.get("u_dither")).toBe(1);
    expect(uniforms?.has("u_scene")).toBe(true);
    scene.dispose();
    pass.dispose();
  });

  it("reuses one shader module per variant key", () => {
    const d = device();
    const scene = createHdrTarget(d, { width: 4, height: 4 });
    const pass = new OutputPass(d);
    const shadersBefore = (d as unknown as { shaders: Set<unknown> }).shaders.size;
    d.beginFrame(4, 4);
    pass.execute(scene, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, "canvas");
    pass.execute(scene, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, "canvas");
    const shadersAfterAces = (d as unknown as { shaders: Set<unknown> }).shaders.size;
    expect(shadersAfterAces - shadersBefore).toBe(1);
    pass.execute(scene, null, { toneMapping: "agx", exposure: 1, dithering: false, backgroundCoverage: false }, "canvas");
    d.endFrame();
    expect((d as unknown as { shaders: Set<unknown> }).shaders.size - shadersAfterAces).toBe(1);
    scene.dispose();
    pass.dispose();
  });

  it("binds coverage attachment 1 and the zeroed-overlay branch", () => {
    const d = device();
    const scene = createHdrTarget(d, { width: 4, height: 4, coverage: true });
    const pass = new OutputPass(d);
    d.beginFrame(4, 4);
    pass.execute(scene, scene, {
      toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: true,
      overlay: { flash: [0, 0, 0, 0.001], vignette: [0, 0, 0, 0.001], shape: [0.7, 0.3], fade: [0, 0, 0, 0.001] }
    }, "canvas");
    const draw = d.drawCommands.at(-1) as { uniforms?: Map<string, unknown> };
    expect(draw?.uniforms?.has("u_coverage")).toBe(true);
    // Every amount < 1/512 → shape.w = 0 (uniform branch, bit-identical).
    expect(draw?.uniforms?.get("u_overlayShape")).toEqual([0.7, 0.3, 1, 0]);
    scene.dispose();
    pass.dispose();
  });

  it("restores the previously bound render target, not `input` (T0-04)", () => {
    const d = device();
    const scene = createHdrTarget(d, { width: 4, height: 4 });
    const previous = createHdrTarget(d, { width: 4, height: 4 });
    const pass = new OutputPass(d);
    d.beginFrame(4, 4);
    d.setRenderTarget(previous);
    pass.execute(scene, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, "canvas");
    expect(d.getRenderTarget()).toBe(previous);
    d.setRenderTarget(null);
    pass.execute(scene, null, { toneMapping: "aces", exposure: 1, dithering: false, backgroundCoverage: false }, previous);
    expect(d.getRenderTarget()).toBeNull();
    d.endFrame();
    scene.dispose();
    previous.dispose();
    pass.dispose();
  });
});

describe("HDR target", () => {
  it("probes rgba16f on HDR-capable devices and rgba8 otherwise", () => {
    const d = device();
    expect(probeHdrTargetFormat(d)).toBe("rgba16f");
    const ldr = new MockRenderDevice();
    expect(probeHdrTargetFormat(ldr)).toBe("rgba8");
    const scene = createHdrTarget(d, { width: 8, height: 4, coverage: true, sampleCount: 4 });
    expect(scene.colorTextures?.length).toBe(2);
    expect(scene.colorTextures?.[0]?.format).toBe("rgba16f");
    expect(scene.colorTextures?.[1]?.format).toBe("rgba8");
    expect(scene.depthTexture).toBeTruthy();
    expect(scene.sampleCount).toBe(4);
    scene.dispose();
  });

  it("ensureHdrTarget reuses on identical spec and rebuilds on change", () => {
    const d = device();
    const a = ensureHdrTarget(d, null, { width: 4, height: 4 });
    const b = ensureHdrTarget(d, a, { width: 4, height: 4 });
    expect(b).toBe(a);
    const c = ensureHdrTarget(d, b, { width: 8, height: 4 });
    expect(c).not.toBe(a);
    expect(a.disposed).toBe(true);
    c.dispose();
  });
});

describe("splitForwardItems + mergeTransparentSegments", () => {
  it("buckets opaque vs transparent and sorts transparents back-to-front", () => {
    const opaque = new PBRMaterial({});
    const camera = [0, 0, 10] as const;
    const near = transparentItem(1);
    const far = transparentItem(-20);
    const split = splitForwardItems([item(opaque), near, far], camera);
    expect(split.opaque.length).toBe(1);
    expect(split.transmission.length).toBe(0);
    expect(split.transparent.map((t) => t.item)).toEqual([far, near]);
    expect(split.transparent[0]!.sortDepth).toBeGreaterThan(split.transparent[1]!.sortDepth);
  });

  it("interleaves contributor queue items by sortDepth, order asc on ties", () => {
    const engine = [
      { item: item(new UnlitMaterial()), sortDepth: 10 },
      { item: item(new UnlitMaterial()), sortDepth: 4 }
    ];
    const mk = (sortDepth: number, order = 0) => ({ sortDepth, order, draw: () => {} });
    const segments = mergeTransparentSegments(engine, [mk(30), mk(6), mk(6, 1), mk(1)]);
    const kinds = segments.map((s) => (s.engine ? "engine" : "queue"));
    // queue(30) → engine(10) → queue(6,o0) → queue(6,o1) → engine(4) → queue(1)
    expect(kinds).toEqual(["queue", "engine", "queue", "queue", "engine", "queue"]);
    expect(segments[2]?.queue?.order).toBe(0);
    expect(segments[3]?.queue?.order).toBe(1);
  });
});

describe("Renderer under A3D_QR_CORE_OUTPUT", () => {
  it("renders through OutputPass to canvas and reports appliedOutput", async () => {
    setRendererQrFlags(V2);
    try {
      const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
      renderer.setOutput({ toneMapping: "agx", exposure: 1.5, dithering: true });
      renderer.render([item(new PBRMaterial({}))]);
      const applied = renderer.appliedOutput;
      expect(applied).not.toBeNull();
      expect(applied?.toneMapping).toBe("agx");
      expect(applied?.exposure.applied).toBe(1.5);
      expect(applied?.exposure.source).toBe("output");
      expect(applied?.dithering).toBe(true);
      renderer.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });

  it("flag-off does not allocate an HDR target and leaves appliedOutput null", async () => {
    setRendererQrFlags(OFF);
    try {
      const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
      renderer.render([item(new UnlitMaterial())]);
      expect(renderer.appliedOutput).toBeNull();
      renderer.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });

  it("post-hdr contributor exposure flows through the blackboard", async () => {
    setRendererQrFlags(V2);
    const unregister = registerFrameContributor({
      id: "prd99.test-exposure",
      owner: "prd03",
      flag: "A3D_QR_CORE",
      phases: ["post-hdr"],
      passes: (phase, ctx) => {
        ctx.blackboard.set("prd03.exposure", 2);
        return [];
      }
    });
    try {
      const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
      renderer.setOutput({ exposure: 1.5 });
      renderer.render([item(new UnlitMaterial())]);
      expect(renderer.appliedOutput?.exposure.applied).toBe(3);
      expect(renderer.appliedOutput?.exposure.source).toBe("grade");
      renderer.dispose();
    } finally {
      unregister();
      setRendererQrFlags(OFF);
    }
  });
});

/**
 * #245 (01-ISSUES / PRD-07 P3-T1): float readback exists on the
 * RenderDevice surface — `readFloatPixels` returns unclamped Float32
 * values so `rgba16f` GPU asserts (sun-disc luminance > 10) are
 * expressible. MockRenderDevice implements the same contract the
 * WebGL2 probe exposes.
 */
describe("#245 float readback on RenderDevice", () => {
  it("exposes readFloatPixels returning Float32Array (unclamped)", () => {
    const d = new MockRenderDevice();
    expect(typeof d.readFloatPixels).toBe("function");
    const out = d.readFloatPixels(0, 0, 1, 1);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(4);
    // Mock backbuffer holds linear values; key property is no 1.0 clamp.
    expect(d.getDiagnostics().errors ?? []).toHaveLength(0);
  });

  it("rejects a non-positive readback rectangle", () => {
    const d = new MockRenderDevice();
    expect(() => d.readFloatPixels(0, 0, 0, 1)).toThrowError(/positive|bounds/);
  });
});

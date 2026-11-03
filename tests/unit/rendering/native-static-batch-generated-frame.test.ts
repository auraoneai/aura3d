import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { programCacheSlot, type ProgramCacheLike, type ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { fakeGeneratedStaticWebGLCanvas } from "./static-generated-unlit-fake-webgl";

// These tests track modeled WebGL calls; they do not compile GLSL or prove
// browser rendering, driver behavior, or performance.
const flags = createTrustedQrFlags({
  A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});
const model = (x: number) => [0.25, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];

async function frame() {
  const fixture = fakeGeneratedStaticWebGLCanvas();
  const renderer = await Renderer.create({ backend: "webgl2", canvas: fixture.canvas, width: 128, height: 128, qrFlags: flags });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  const geometryMatrix = new Float32Array([0.8, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // Final sort order is intentionally opposite to array order.
  const source: RenderSource = {
    staticBatching: true, cameraPolicy: "identity", frustumCulling: false, shadow: false, environmentLighting: false,
    renderItems: [
      { geometry, material, geometryMatrix, label: "right", renderOrder: 1, modelMatrix: model(0.625) },
      { geometry, material, geometryMatrix, label: "left", renderOrder: 0, modelMatrix: model(-0.625) }
    ]
  };
  const dispose = () => { renderer.dispose(); geometry.dispose(); material.dispose(); };
  return { ...fixture, renderer, source, geometryMatrix, dispose };
}

function generatedPair(draw: ReturnType<typeof fakeGeneratedStaticWebGLCanvas>["nativeDraws"][number]): boolean {
  return draw.name === "drawElementsInstanced"
    && draw.program?.shaders.some((shader) => shader.source.includes(GENERATED_PROGRAM_MARKER)) === true
    && draw.program?.shaders.some((shader) => shader.source.includes("u_batchModel[2]")) === true;
}

describe("generated unlit pair frame integration", () => {
  it("submits the final sorted pair with ordinary geometry and frame transforms", async () => {
    const f = await frame();
    try {
      const first = f.renderer.render(f.source);
      expect(first).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      expect(f.nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);

      let paired = false;
      for (let attempt = 0; attempt < 8 && !paired; attempt += 1) {
        const start = f.nativeDraws.length;
        const diagnostics = f.renderer.render(f.source);
        const draws = f.nativeDraws.slice(start);
        if (draws.length !== 1 || !generatedPair(draws[0]!)) continue;
        paired = true;
        expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
        expect(draws[0]!.args.at(-1)).toBe(2);
        const matrices = draws[0]!.uniforms.get("u_batchModel") as Float32Array;
        expect(matrices).toBeInstanceOf(Float32Array);
        expect(matrices).toHaveLength(32);
        expect(matrices[12]).toBeCloseTo(-0.625);
        expect(matrices[28]).toBeCloseTo(0.625);
        expect(draws[0]!.uniforms.get("u_geometryMatrix")).toEqual(f.geometryMatrix);
        const binding = f.generated.drawBindings.at(-1)!;
        expect(binding.buffer).not.toBeNull();
        expect(binding.size).toBeGreaterThanOrEqual(192);
        const bytes = new DataView(binding.bytes.buffer, binding.bytes.byteOffset, binding.bytes.byteLength);
        expect([bytes.getFloat32(128, true), bytes.getFloat32(148, true), bytes.getFloat32(168, true), bytes.getFloat32(188, true)])
          .toEqual([1, 1, 1, 1]);
      }
      expect(paired, "the generated path must submit a native pair after warmup").toBe(true);

      const beforeAsync = f.nativeDraws.length;
      const asyncDiagnostics = await f.renderer.renderAsync(f.source);
      expect(asyncDiagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
      const asyncDraws = f.nativeDraws.slice(beforeAsync);
      expect(asyncDraws).toHaveLength(1);
      expect(generatedPair(asyncDraws[0]!)).toBe(true);

      const beforeCapture = f.nativeDraws.length;
      const captured = f.renderer.captureFrame(f.source);
      expect(captured.diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      expect(f.nativeDraws.slice(beforeCapture).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { f.dispose(); }
  });

  it("keeps an unregistered custom cache on its ordinary draw and acquisition path", async () => {
    const acquired: ProgramFeatures[] = [];
    const original = programCacheSlot.get.bind(programCacheSlot);
    const select = vi.spyOn(programCacheSlot, "get").mockImplementation((qr) => {
      const factory = original(qr);
      return (device, options) => {
        const delegate = factory(device, options);
        const custom: ProgramCacheLike = {
          acquire: (features) => { acquired.push(features); return delegate.acquire(features); },
          precompile: (features) => delegate.precompile(features),
          stats: () => delegate.stats(),
          beginFrame: () => delegate.beginFrame?.(),
          markReady: () => delegate.markReady?.(),
          dispose: () => delegate.dispose()
        };
        return custom;
      };
    });
    let f: Awaited<ReturnType<typeof frame>> | undefined;
    try {
      f = await frame();
      f.renderer.render({ ...f.source, staticBatching: false });
      select.mockRestore();
      const beforeOrdinary = acquired.length;
      const ordinaryStart = f.nativeDraws.length;
      const ordinary = f.renderer.render({ ...f.source, staticBatching: false });
      const ordinaryAcquires = acquired.length - beforeOrdinary;
      expect(ordinaryAcquires).toBeGreaterThanOrEqual(2);
      expect(ordinary).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      expect(f.nativeDraws.slice(ordinaryStart).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);

      const beforeOptIn = acquired.length;
      const optInStart = f.nativeDraws.length;
      const optIn = f.renderer.render(f.source);
      expect(acquired.length - beforeOptIn).toBe(ordinaryAcquires);
      expect(optIn).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 2 });
      const draws = f.nativeDraws.slice(optInStart);
      expect(draws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      expect(draws.every((draw) => draw.program?.shaders.some((shader) => shader.source.includes(GENERATED_PROGRAM_MARKER)))).toBe(true);
    } finally {
      select.mockRestore();
      f?.dispose();
    }
  });
});

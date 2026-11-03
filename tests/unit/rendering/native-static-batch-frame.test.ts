import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ShaderModule } from "../../../packages/rendering/src/ShaderModule";
import { createLeanCoreShaderLibrary, DEFAULT_UNLIT_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

const leanFlags = () => createTrustedQrFlags({
  A3D_QR_CORE: false, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});

const transform = (x: number) => [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, x, 0, 0, 1];

async function trackedFrame() {
  const fixture = fakeWebGLCanvas();
  const renderer = await Renderer.create({ backend: "webgl2", canvas: fixture.canvas, width: 128, height: 128, qrFlags: leanFlags() });
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  // Render order deliberately differs from array order.
  const source = { staticBatching: true, cameraPolicy: "identity" as const, frustumCulling: false, renderItems: [
    { geometry, material, label: "right", renderOrder: 1, modelMatrix: transform(0.5) },
    { geometry, material, label: "left", renderOrder: 0, modelMatrix: transform(-0.5) }
  ] };
  const dispose = () => { renderer.dispose(); geometry.dispose(); material.dispose(); };
  return { ...fixture, renderer, source, dispose };
}

describe("static unlit pair frame integration", () => {
  it("peeks at a cached shader without compiling or reviving disposed resources", () => {
    const device = new MockRenderDevice();
    const create = vi.spyOn(device, "createShaderProgram");
    const library = createLeanCoreShaderLibrary();
    const module = new ShaderModule(library.compileSource(DEFAULT_UNLIT_SHADER_NAME));
    expect(module.peek(device)).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    const first = module.compile(device);
    expect(module.peek(device)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    device.contextLost = true;
    expect(module.peek(device)).toBeUndefined();
    device.contextLost = false;
    first.dispose();
    expect(module.peek(device)).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    const second = module.compile(device);
    expect(second).not.toBe(first);
    expect(module.peek(device)).toBe(second);
    device.dispose();
    expect(module.peek(device)).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("preserves sorted logical items, callbacks, and counts on an unsupported backend", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 32, height: 32, qrFlags: leanFlags() });
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    const callbacks: string[] = [];
    const items = [
      { geometry, material, label: "last", renderOrder: 2, onBeforeRender: () => callbacks.push("last") },
      { geometry, material, label: "first", renderOrder: 0, onBeforeRender: () => callbacks.push("first") },
      { geometry, material, label: "middle", renderOrder: 1, onBeforeRender: () => callbacks.push("middle") }
    ];
    try {
      const diagnostics = renderer.render({ staticBatching: true, renderItems: items, cameraPolicy: "identity", frustumCulling: false });
      expect(callbacks).toEqual(["first", "middle", "last"]);
      expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(["first", "middle", "last"]);
      expect(diagnostics).toMatchObject({ submittedObjects: 3, visibleObjects: 3, drawCalls: 3 });
    } finally {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    }
  });

  it("pairs adjacent sorted logical items after warmup in sync and async frames", async () => {
    const frame = await trackedFrame();
    try {
      const first = frame.renderer.render(frame.source);
      expect(first).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2, triangles: 2 });
      expect(frame.nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      // The second frame is allowed to prepare the pair shader, but still
      // draws both originals while it warms that resource.
      const second = frame.renderer.render(frame.source);
      expect(second).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2, triangles: 2 });
      expect(frame.nativeDraws.slice(-2).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      const third = frame.renderer.render(frame.source);
      expect(third).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 1, triangles: 2 });
      const paired = frame.nativeDraws.at(-1)!;
      expect(paired.name).toBe("drawElementsInstanced");
      expect(paired.args.at(-1)).toBe(2);
      const matrices = paired.uniforms.get("u_batchMVP");
      expect(matrices).toBeInstanceOf(Float32Array);
      expect((matrices as Float32Array)[12]).toBeCloseTo(-0.5);
      expect((matrices as Float32Array)[28]).toBeCloseTo(0.5);

      const beforeAsync = frame.nativeDraws.length;
      const asyncDiagnostics = await frame.renderer.renderAsync(frame.source);
      expect(asyncDiagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 1, triangles: 2 });
      expect(frame.nativeDraws.slice(beforeAsync).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);

      const beforeCapture = frame.nativeDraws.length;
      const captured = frame.renderer.captureFrame(frame.source);
      expect(captured.diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2, triangles: 2 });
      expect(frame.nativeDraws.slice(beforeCapture).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { frame.dispose(); }
  });

  it("never replays either item after a native pair attempt throws", async () => {
    const frame = await trackedFrame();
    try {
      frame.renderer.render(frame.source);
      frame.renderer.render(frame.source);
      frame.state.failInstanced = true;
      const before = frame.nativeDraws.length;
      expect(() => frame.renderer.render(frame.source)).toThrow("instanced draw failed after entry");
      expect(frame.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
    } finally { frame.dispose(); }
  });

  it("bypasses the static pair when the recursive binder is monkeypatched", async () => {
    const frame = await trackedFrame();
    try {
      frame.renderer.render(frame.source);
      frame.renderer.render(frame.source);
      const bind = vi.spyOn(MaterialBinding.prototype, "bindRecursive");
      try {
        const before = frame.nativeDraws.length;
        const diagnostics = frame.renderer.render(frame.source);
        expect(diagnostics.drawCalls).toBe(2);
        expect(frame.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
        expect(bind).toHaveBeenCalledTimes(2);
      } finally { bind.mockRestore(); }
    } finally { frame.dispose(); }
  });
});

import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

const flags = createTrustedQrFlags({
  A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});

async function fixture(floatBlend = true) {
  const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
  const device = renderer.device as MockRenderDevice;
  const originalDraw = device.draw.bind(device);
  const draws: Array<{ label: string | undefined; uniforms: Map<string, unknown>; depthTest: boolean; depthWrite: boolean }> = [];
  const spy = vi.spyOn(device, "draw").mockImplementation((command) => {
    draws.push({ label: command.label, uniforms: new Map(command.uniforms), depthTest: command.renderState?.depthTest ?? true, depthWrite: command.renderState?.depthWrite ?? true });
    return originalDraw(command);
  });
  Object.defineProperty(device.info, "capabilities", { configurable: true,
    value: [...device.info.capabilities!, "hdr-render-targets", ...(floatBlend ? ["float-blending"] : [])] });
  const geometry = Geometry.triangle();
  const opaque = new UnlitMaterial({ name: "opaque" });
  const alpha = new UnlitMaterial({ name: "transparent", color: [1, 0.2, 0.1, 0.5],
    renderState: { blend: true, blendMode: "alpha", depthWrite: false, cullMode: "none" } });
  const source = { cameraPolicy: "identity" as const, shadow: false as const, environmentLighting: false as const,
    transparencyMode: "weighted" as const, renderItems: [{ geometry, material: opaque }, { geometry, material: alpha }],
    postprocess: { sampleCount: 1, ssao: {}, execution: "cpu-deterministic" as const } };
  return { renderer, device, geometry, opaque, alpha, source, draws,
    dispose() { spy.mockRestore(); renderer.dispose(); geometry.dispose(); opaque.dispose(); alpha.dispose(); } };
}

describe("renderer weighted transparency integration", () => {
  it.each([false, true])("reports float blending only when the WebGL extension exists (%s)", (available) => {
    const f = fakeWebGLCanvas();
    const getExtension = f.gl.getExtension.bind(f.gl);
    vi.spyOn(f.gl, "getExtension").mockImplementation((name) => name === "EXT_float_blend" && available ? {} as never : getExtension(name));
    const device = WebGL2Device.create({ canvas: f.canvas });
    try { expect(device.info.capabilities?.includes("float-blending")).toBe(available); }
    finally { device.dispose(); }
  });

  it.each([false, true])("renders eligible transparent items in weighted phases (async=%s)", async (asynchronous) => {
    const f = await fixture();
    try {
      let weighted = false;
      for (let i = 0; i < 8 && !weighted; i++) {
        f.draws.length = 0;
        if (asynchronous) await f.renderer.renderAsync(f.source); else f.renderer.render(f.source);
        weighted = f.draws.some((command) => command.label === "weighted-transparency-composite");
      }
      expect(weighted).toBe(true);
      expect(f.renderer.transparencyDiagnostics).toEqual({ mode: "weighted" });
      const weightedDraws = f.draws.filter((command) => command.uniforms.has("u_a3dOpaqueDepth"));
      expect(weightedDraws).toHaveLength(2);
      expect(weightedDraws.every((command) => command.depthTest === false && command.depthWrite === false)).toBe(true);
      expect(f.draws.some((command) => command.label === "weighted-transparency-composite")).toBe(true);
    } finally { f.dispose(); }
  });

  it("uses the existing sorted draw when float blending is unavailable", async () => {
    const f = await fixture(false);
    try {
      for (let i = 0; i < 4; i++) { f.draws.length = 0; f.renderer.render(f.source); }
      expect(f.draws.some((command) => command.label === "weighted-transparency-composite")).toBe(false);
      expect(f.draws.some((command) => command.uniforms.has("u_a3dOpaqueDepth"))).toBe(false);
      expect(f.draws.map((command) => command.label)).toEqual(["opaque", "transparent"]);
      expect(f.renderer.transparencyDiagnostics).toMatchObject({ mode: "sorted" });
    } finally { f.dispose(); }
  });

  it("falls back for the complete transparent group when one item needs explicit ordering", async () => {
    const f = await fixture();
    const other = new UnlitMaterial({ name: "ordered", color: [0, 1, 0, 0.5],
      renderState: { blend: true, blendMode: "alpha", depthWrite: false, cullMode: "none" } });
    try {
      const input = { ...f.source, renderItems: [...f.source.renderItems, { geometry: f.geometry, material: other, renderOrder: 1 }] };
      for (let i = 0; i < 4; i++) { f.draws.length = 0; f.renderer.render(input); }
      expect(f.draws.map((command) => command.label)).toEqual(["opaque", "transparent", "ordered"]);
      expect(f.draws.some((command) => command.uniforms.has("u_a3dOpaqueDepth"))).toBe(false);
      expect(f.draws.some((command) => command.label === "weighted-transparency-composite")).toBe(false);
      expect(f.renderer.transparencyDiagnostics).toMatchObject({ mode: "sorted" });
    } finally { f.dispose(); other.dispose(); }
  });

  it("retains ordinary draw callbacks and excludes multisampled targets", async () => {
    const f = await fixture();
    const callback = vi.fn();
    try {
      const items = [{ geometry: f.geometry, material: f.opaque }, { geometry: f.geometry, material: f.alpha, onBeforeRender: callback }];
      for (let i = 0; i < 4; i++) { f.draws.length = 0; f.renderer.render({ ...f.source, renderItems: items }); }
      expect(callback).toHaveBeenCalledTimes(4);
      expect(f.draws.some((command) => command.label === "weighted-transparency-composite")).toBe(false);
      f.draws.length = 0;
      f.renderer.render({ ...f.source, postprocess: { ...f.source.postprocess, sampleCount: 4 } });
      expect(f.draws.some((command) => command.label === "weighted-transparency-composite")).toBe(false);
    } finally { f.dispose(); }
  });

  it("retires only the weighted resources of disposed output-target views", async () => {
    const f = await fixture();
    const originalCreate = f.device.createRenderTarget.bind(f.device);
    const owned: ReturnType<MockRenderDevice["createRenderTarget"]>[] = [];
    const spy = vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = originalCreate(descriptor);
      if (descriptor.label?.startsWith("scene-weighted-transparency-")) owned.push(target);
      return target;
    });
    const first = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    const second = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false });
    const renderUntilWeighted = (target: typeof first): void => {
      for (let i = 0; i < 8; i++) {
        f.renderer.render({ ...f.source, renderTarget: target });
        if (f.renderer.transparencyDiagnostics?.mode === "weighted") return;
      }
      throw new Error("weighted programs did not become ready");
    };
    try {
      renderUntilWeighted(first);
      expect(owned).toHaveLength(2);
      const firstResources = owned.slice();
      renderUntilWeighted(second);
      expect(owned).toHaveLength(4);
      const secondResources = owned.slice(2);
      renderUntilWeighted(first);
      expect(owned).toHaveLength(4);
      expect(firstResources.every((target) => !target.disposed)).toBe(true);
      expect(secondResources.every((target) => !target.disposed)).toBe(true);

      first.dispose();
      renderUntilWeighted(second);
      expect(firstResources.every((target) => target.disposed)).toBe(true);
      expect(secondResources.every((target) => !target.disposed)).toBe(true);
      expect(owned).toHaveLength(4);

      second.dispose();
      f.renderer.render(f.source);
      expect(secondResources.every((target) => target.disposed)).toBe(true);
    } finally {
      first.dispose(); second.dispose(); spy.mockRestore(); f.dispose();
    }
  });

  it("releases its weighted resources when another renderer shares the device", async () => {
    const f = await fixture();
    const originalCreate = f.device.createRenderTarget.bind(f.device);
    const owned: ReturnType<MockRenderDevice["createRenderTarget"]>[] = [];
    const spy = vi.spyOn(f.device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = originalCreate(descriptor);
      if (descriptor.label?.startsWith("scene-weighted-transparency-")) owned.push(target);
      return target;
    });
    const other = new Renderer(f.device, { backend: "mock", width: 4, height: 4, qrFlags: flags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    try {
      for (let i = 0; i < 8; i++) {
        f.renderer.render(f.source);
        if (f.renderer.transparencyDiagnostics?.mode === "weighted") break;
      }
      expect(f.renderer.transparencyDiagnostics?.mode).toBe("weighted");
      expect(owned).toHaveLength(2);
      const firstResources = owned.slice();
      for (let i = 0; i < 8; i++) {
        other.render(f.source);
        if (other.transparencyDiagnostics?.mode === "weighted") break;
      }
      expect(other.transparencyDiagnostics?.mode).toBe("weighted");
      expect(owned).toHaveLength(4);
      const otherResources = owned.slice(2);
      expect(owned.every((target) => !target.disposed)).toBe(true);
      f.renderer.dispose();
      expect(firstResources.every((target) => target.disposed)).toBe(true);
      expect(otherResources.every((target) => !target.disposed)).toBe(true);
      expect(f.device.disposed).toBe(false);
      expect(() => other.render(f.source)).not.toThrow();
      expect(other.transparencyDiagnostics?.mode).toBe("weighted");
    } finally {
      spy.mockRestore(); other.dispose(); f.dispose();
    }
  });
});

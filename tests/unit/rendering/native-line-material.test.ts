import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry.js";
import { ScreenSpaceLineMaterial } from "../../../packages/rendering/src/ScreenSpaceLineMaterial.js";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary.js";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass.js";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice.js";
import { lines } from "../../../packages/engine/src/agent-api/nodes/lines.js";
import { lineNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import type { SceneCompileContext } from "../../../packages/engine/src/contracts/compiler.js";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice.js";
import type { Material } from "../../../packages/rendering/src/Material.js";
import { setPrd01ColorParsing, withPrd01ColorParsing } from "../../../packages/engine/src/agent-api/compiler/color.js";

function compileContext() {
  return {
    canvas: { width: 1200, height: 600, clientWidth: 600 },
    flags: resolveQrFlags({ options: "A3D_PARITY_LINES" }),
    strict: false, quality: { tier: "high" }, renderer: null, assets: null,
    degrade: () => undefined
  } as unknown as SceneCompileContext;
}
function sink() {
  const items: RenderItem[] = [];
  return { items, addItems(next: readonly RenderItem[]) { items.push(...next); }, feature() {}, set() {}, addLights() {} };
}

describe("native line materials and compiler", () => {
  it("compiles vertex gradients and world-unit dashes with continuous transformed distances", () => {
    const node = lines.fat({
      points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
      colors: ["#ff0000", "#00ff00", "#0000ff"],
      width: 0.2, worldUnits: true, dashed: true, dashSize: 2, gapSize: 1
    }).toJSON();
    const ctx = compileContext();
    const out = sink();
    lineNodeHandler.compile(node, ctx, out as never);
    lineNodeHandler.update!(node, { scale: [2, 3, 1] } as never, ctx, out as never, 0);
    const item = out.items[0]!;
    const vertices = item.geometry.vertexBuffer;
    expect(item.material).toBeInstanceOf(ScreenSpaceLineMaterial);
    const material = item.material as ScreenSpaceLineMaterial;
    expect(material.getParameter("u_lineWorldUnits")).toBe(1);
    expect(material.getParameter("u_lineResolution")).toEqual([1200, 600]);
    expect(material.getParameter("u_linePixelRatio")).toBe(2);
    expect(vertices.getAttribute(0, "color")).toEqual([1, 0, 0, 1]);
    expect(vertices.getAttribute(2, "color")).toEqual([0, 1, 0, 1]);
    expect(vertices.getAttribute(4, "color")).toEqual([0, 1, 0, 1]);
    expect(vertices.getAttribute(6, "color")).toEqual([0, 0, 1, 1]);
    expect([0, 2, 4, 6].map((i) => vertices.getAttribute(i, "lineDistance")[0])).toEqual([0, 2, 2, 5]);
    expect(vertices.getAttribute(0, "custom:lineOtherColor")).toEqual([0, 1, 0, 1]);
    expect(vertices.getAttribute(0, "custom:lineOtherDistance")).toEqual([2]);
    expect(item.frustumCulled).toBe(false);
    lineNodeHandler.dispose!(node);
    expect(material.disposed).toBe(true);
  });

  it("retains all segments and endpoint colors for thin lines and loops", () => {
    const node = lines.loop({ points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], colors: ["#ff0000", "#00ff00", "#0000ff"] }).toJSON();
    const ctx = compileContext();
    const out = sink();
    lineNodeHandler.compile(node, ctx, out as never);
    lineNodeHandler.update!(node, undefined, ctx, out as never, 0);
    const buffer = out.items[0]!.geometry.vertexBuffer;
    expect(buffer.vertexCount).toBe(6);
    expect(buffer.getAttribute(4, "position")).toEqual([1, 1, 0]);
    expect(buffer.getAttribute(5, "position")).toEqual([0, 0, 0]);
    expect(buffer.getAttribute(4, "color")).toEqual([0, 0, 1, 1]);
    expect(buffer.getAttribute(5, "color")).toEqual([1, 0, 0, 1]);
    lineNodeHandler.dispose!(node);
  });

  it("preserves vertex alpha and enables blending without the core color flag", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], colors: ["#ff000080", "#00ff00ff"] }).toJSON();
    const ctx = { ...compileContext(), flags: resolveQrFlags({ options: { A3D_PARITY_LINES: true, A3D_QR_CORE: false } }) };
    expect(ctx.flags.on("A3D_QR_CORE")).toBe(false);
    const out = sink();
    const owner = {};
    const cleanup = setPrd01ColorParsing(null, owner);
    withPrd01ColorParsing(owner, () => {
      lineNodeHandler.compile(node, ctx, out as never);
      lineNodeHandler.update!(node, undefined, ctx, out as never, 0);
    });
    const item = out.items[0]!;
    expect(item.geometry.vertexBuffer.getAttribute(0, "color")[3]).toBeCloseTo(128 / 255);
    expect((item.material as Material).renderState.blend).toBe(true);
    expect((item.material as Material).renderState.depthWrite).toBe(false);
    lineNodeHandler.dispose!(node);
    cleanup();
  });

  it("supplies portable native WebGPU line stages and matching reflected bindings", async () => {
    const modules: string[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule(descriptor) { modules.push(descriptor.code); return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      const material = new ScreenSpaceLineMaterial({ worldUnits: true, dashSize: 1, gapSize: 1 });
      const shader = createDefaultShaderLibrary().compileSource(material.shaderKey);
      device.createShaderProgram(shader);
      expect(modules).toHaveLength(2);
      const vertex = modules.find((code) => code.includes("fn vs_main"))!;
      const fragment = modules.find((code) => code.includes("fn fs_main"))!;
      expect(vertex).toContain("@location(14) otherColor");
      expect(vertex).toContain("nearStart = start.z + start.w");
      expect(vertex).toContain("(clip.z + clip.w) * 0.5");
      expect(fragment).toContain("aura.u_lineDashOffset");
      expect(fragment).toContain("aura.u_baseColor * color");
      expect(shader.portableBindings?.map((binding) => binding.name)).toContain("u_projectionMatrix");
      material.dispose();
    } finally {
      device.dispose();
    }
  });

  it("binds the line shader and camera matrices through the mock forward pass", () => {
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, -1], end: [1, 0, -2] }]);
    const material = new ScreenSpaceLineMaterial({ width: 0.5, worldUnits: true, dashSize: 1, gapSize: 1, color: [1, 1, 1, 0.5] });
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const projection = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -4, 1];
    device.beginFrame(400, 200);
    new ForwardPass({
      items: [{ geometry, material }], shaderLibrary: library,
      cameraViewMatrix: view, auraFrameCamera: { projectionMatrix: projection }
    }).execute({ device, width: 400, height: 200 });
    device.endFrame();
    expect(device.drawCommands).toHaveLength(1);
    const uniforms = device.drawCommands[0]!.uniforms!;
    expect(Array.from(uniforms.get("u_viewMatrix") as Float32Array)).toEqual(view);
    expect(Array.from(uniforms.get("u_projectionMatrix") as Float32Array)).toEqual(projection.map(Math.fround));
    expect(uniforms.get("u_lineWorldUnits")).toBe(1);
    expect(material.renderState.blend).toBe(true);
    expect(material.renderState.depthWrite).toBe(false);
    const shader = library.get(material.shaderKey);
    expect(shader.vertex).toContain("nearStart = originalStart.z + originalStart.w");
    expect(shader.vertex).toContain("mix(colorStart, colorEnd, t)");
    expect(shader.fragment).toContain("u_baseColor * v_lineColor");
    geometry.dispose(); material.dispose();
  });

  it("updates pixel dimensions and rejects invalid widths, dashes, positions and colors", () => {
    const material = new ScreenSpaceLineMaterial({ width: 4, resolution: [100, 50], pixelRatio: 1 });
    material.setResolution(300, 200, 2);
    expect(material.getParameter("u_lineResolution")).toEqual([300, 200]);
    expect(material.getParameter("u_linePixelRatio")).toBe(2);
    expect(() => material.setResolution(0, 100)).toThrow(/resolution/);
    expect(() => new ScreenSpaceLineMaterial({ dashSize: 1, gapSize: 0 })).toThrow(/gapSize/);
    expect(() => new ScreenSpaceLineMaterial({ dashOffset: NaN })).toThrow(/dashOffset/);
    expect(() => lines.line({ points: [0, 0, NaN, 1, 1, 1] })).toThrow(/finite/);
    expect(() => lines.line({ points: [[0, 0, 0], [1, 0, 0]], colors: ["#ffffff"] })).toThrow(/colors must match/);
    expect(() => lines.fat({ points: [[0, 0, 0], [1, 0, 0]], dashed: true, dashSize: NaN, gapSize: 1 })).toThrow(/finite/);
    material.dispose();
  });
});

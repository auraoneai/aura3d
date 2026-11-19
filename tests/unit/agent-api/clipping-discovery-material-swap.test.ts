import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp } from "../../../packages/engine/src/public/index";
import { clipping } from "../../../packages/engine/src/agent-api/nodes/clipping";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { prd07SystemFor } from "../../../packages/engine/src/agent-api/vfx/effects-api";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("clip-group discovery on material swaps", () => {
  it("skips the scene walk for unclipped swaps and still follows clip groups exactly", async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; callbacks.set(id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const devices: MockRenderDevice[] = [];
    const create = Renderer.create.bind(Renderer);
    vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      const device = renderer.device as MockRenderDevice;
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      devices.push(device);
      return renderer;
    });
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene()
        .add(primitives.box({ name: "mesh" }).runtime({ id: "mesh", mutable: false }))
        .add(primitives.box({ name: "bystander", position: [2, 0, 0] }).runtime({ id: "bystander", mutable: false })),
      autoStart: true, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    prd07SystemFor(app)?.dispose();
    const fireFrame = (): void => {
      expect(callbacks.size).toBe(1);
      const [id, callback] = [...callbacks][0]!;
      callbacks.delete(id);
      callback(nextFrame * 16);
    };
    const submittedPlane = (): number | undefined => {
      const draw = devices.at(-1)?.drawCommands.find((command) => command.uniforms?.has("u_a3dClipPlanes"));
      return (draw?.uniforms?.get("u_a3dClipPlanes") as Float32Array | undefined)?.[3];
    };
    try {
      await app.ready();
      if (callbacks.size) fireFrame();
      const mesh = app.nodes.require("mesh");
      const bystander = app.nodes.require("bystander");
      // Discovery reads every node snapshot; an unclipped swap in an unclipped scene must not.
      // (Frame rendering reads it separately; count only the swap notifications.)
      const bystanderSnapshots = vi.spyOn(bystander, "snapshot");
      let duringSwaps = 0;
      for (let i = 0; i < 5; i += 1) {
        const before = bystanderSnapshots.mock.calls.length;
        mesh.setMaterial(material.pbr({ color: "#ffffff", roughness: 0.2 + i * 0.1 }));
        duringSwaps += bystanderSnapshots.mock.calls.length - before;
        fireFrame();
      }
      expect(duringSwaps).toBe(0);
      bystanderSnapshots.mockRestore();

      // A swap that introduces a clip group is discovered and subscribed.
      const group = clipping.material({ planes: [[1, 0, 0, -1]] });
      mesh.setMaterial(material.pbr({ color: "#ffffff", clipping: group }));
      fireFrame();
      expect(submittedPlane()).toBe(-1);
      group.update({ planes: [[1, 0, 0, -2]] });
      fireFrame();
      expect(submittedPlane()).toBe(-2);
      // With a live subscription every swap rescans, so dropping the group releases it.
      mesh.setMaterial(material.pbr({ color: "#ffffff" }));
      fireFrame();
      group.update({ planes: [[1, 0, 0, -3]] });
      expect(callbacks.size).toBe(0);
      // Back in an unclipped scene, a later clipped swap on another node is still found.
      const other = clipping.material({ planes: [[1, 0, 0, -4]] });
      bystander.setMaterial(material.pbr({ color: "#ffffff" }));
      fireFrame();
      bystander.setMaterial(material.pbr({ color: "#ffffff", clipping: other }));
      fireFrame();
      expect(submittedPlane()).toBe(-4);
      other.update({ planes: [[1, 0, 0, -5]] });
      fireFrame();
      expect(submittedPlane()).toBe(-5);
    } finally { app.dispose(); }
  });
});

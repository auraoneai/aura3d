import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore";
import type { PhysicsWorldAccess } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess";
import { camera, defineModelAssets, model, scene } from "../../../packages/engine/src/public/index";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

class LabelDevice extends MockRenderDevice {
  labels: string[] = [];
  override draw(command: DrawCommand): void { this.labels.push(command.label ?? ""); super.draw(command); }
}

function triangleDocument(): Uint8Array {
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const bytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  return new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  }));
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("model hidden at mount (D1-01)", () => {
  it("draws after setVisible(true) when a runtime model was created hidden", async () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://scene.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("location", { origin: "https://scene.example.test", href: "https://scene.example.test/", search: "" });
    const document = triangleDocument(), originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("data:")) return originalFetch(input, init);
      if (new URL(url, "https://scene.example.test/").pathname === "/triangle.gltf") {
        return new Response(document.slice().buffer as ArrayBuffer, { headers: { "content-type": "model/gltf+json" } });
      }
      throw new Error(`Unexpected model fixture request: ${url}`);
    }));
    const asset = defineModelAssets({ triangle: {
      url: "/triangle.gltf", sha256: createHash("sha256").update(document).digest("hex")
    } }, { queryParam: null }).refs.triangle;
    const devices: LabelDevice[] = [];
    vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
      const device = new LabelDevice();
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      devices.push(device);
      return new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    });
    const access: PhysicsWorldAccess = { preload: async () => {}, requireReady: () => { throw new Error("physics unused"); } };
    const app = createAuraAppWithPhysicsWorldAccess(access, new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene({ camera: camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], fov: 50 }) })
        .add(model(asset, { name: "pooled", visible: false }).runtime({ id: "pooled" })),
      autoStart: false, resize: false,
      physics: { bindNodes: false, gravity: [0, 0, 0] },
      qualityRebuild: { flags: {
        A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
        A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false
      }, allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      const device = devices[devices.length - 1]!;
      device.labels.length = 0;
      app.step(0);
      expect(device.labels.some((label) => label.startsWith("actor-"))).toBe(false);
      app.nodes.require("pooled").setVisible(true);
      await vi.waitFor(() => {
        device.labels.length = 0;
        app.step(0);
        expect(device.labels.some((label) => label.startsWith("actor-"))).toBe(true);
      }, { timeout: 3000 });
    } finally { await app.disposeAsync(); }
  });
});

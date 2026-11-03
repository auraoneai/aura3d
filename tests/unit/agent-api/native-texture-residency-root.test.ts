import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, defineModelAssets, model, scene } from "../../../packages/engine/src/public/index";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

/*
 * Independently authored glTF geometry with a CC0 ETC1S fixture embedded in
 * the hashed document. The one-level fixture is retained alongside the
 * separately generated three-level fixture for the refinement regression.
 */
function texturedTriangle(mipmapped = false): Uint8Array {
  const binary = Buffer.alloc(66);
  [-1, -1, 0, 1, -1, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 1]
    .forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 60 + index * 2));
  const filename = mipmapped ? "ktx2-red-mips-4x4.ktx2" : "ktx2-red-4x4.ktx2";
  const red = readFileSync(new URL(`../../assets/native-fixtures/${filename}`, import.meta.url));
  const document = {
    asset: { version: "2.0" }, extensionsUsed: ["KHR_texture_basisu"],
    buffers: [{ byteLength: binary.byteLength, uri: `data:application/octet-stream;base64,${binary.toString("base64")}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      { buffer: 0, byteOffset: 60, byteLength: 6 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ uri: `data:image/ktx2;base64,${red.toString("base64")}`, mimeType: "image/ktx2" }],
    textures: [{ name: "red", extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  return new TextEncoder().encode(JSON.stringify(document));
}

/** A strict WebGL2-shaped context. Unknown operations fail rather than silently succeeding. */
function makeContext() {
  const constants = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0]]);
  const c = (name: string) => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const calls: { name: string; args: unknown[] }[] = [];
  let id = 0, active = c("TEXTURE0"), binding: unknown = null;
  let wait = c("ALREADY_SIGNALED");
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const methods: Record<string, unknown> = {
    getError: () => 0, isContextLost: () => false,
    getParameter: (name: number) => name === c("MAX_VERTEX_ATTRIBS") || name === c("MAX_TEXTURE_IMAGE_UNITS") ? 16
      : name === c("MAX_SAMPLES") ? 4 : name === c("MAX_TEXTURE_SIZE") ? 4096
      : name === c("ACTIVE_TEXTURE") ? active : name === c("TEXTURE_BINDING_2D") ? binding : 0,
    getExtension: () => null,
    createTexture: () => ({ id: ++id }), deleteTexture: record("deleteTexture"),
    bindTexture: (target: number, value: unknown) => { binding = value; calls.push({ name: "bindTexture", args: [target, value] }); },
    activeTexture: (value: number) => { active = value; },
    texImage2D: (...args: unknown[]) => { calls.push({ name: "texImage2D", args: [binding, ...args] }); },
    texParameteri: record("texParameteri"), pixelStorei: record("pixelStorei"), bindBuffer: record("bindBuffer"),
    createSampler: () => ({ id: ++id }), samplerParameteri: record("samplerParameteri"), samplerParameterf: record("samplerParameterf"),
    bindSampler: record("bindSampler"), uniform1i: record("uniform1i"), deleteSampler: record("deleteSampler"),
    fenceSync: (...args: unknown[]) => { calls.push({ name: "fenceSync", args }); return { id: ++id }; },
    flush: record("flush"), clientWaitSync: recordWait, deleteSync: record("deleteSync"),
    deleteProgram: record("deleteProgram"), deleteVertexArray: record("deleteVertexArray"), deleteBuffer: record("deleteBuffer")
  };
  function recordWait(...args: unknown[]) { calls.push({ name: "clientWaitSync", args }); return wait; }
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in methods) return methods[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    throw new Error(`Unexpected WebGL call: ${name}`);
  } }) as WebGL2RenderingContext;
  return { gl, calls, setWait: (name: string) => { wait = c(name); } };
}

type Context = ReturnType<typeof makeContext>;
class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  readonly context: Context = makeContext();
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return this.context.gl; }
  addEventListener() {}
  removeEventListener() {}
}

interface Submission { readonly item: RenderItem; readonly binding: TextureBinding; readonly handle: unknown }
interface Publication { readonly texture: Texture; readonly handle: WebGLTexture; readonly sampledHandle: unknown }
function installRendererShell(observePublications = false) {
  const devices: WebGL2Device[] = [];
  const submissions: Submission[] = [];
  const publications: Publication[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    const device = WebGL2Device.create({ canvas: options.canvas!, textureBudgetPolicy: options.textureBudgetPolicy });
    devices.push(device);
    const host = (device as unknown as { host: WebGL2DeviceHost }).host;
    if (observePublications) {
      // Pass through to the real registry, then sample the newly published
      // identity through the real sampler while each mip tail is current.
      const publish = host.textureRegistry.publishStreamedTexture.bind(host.textureRegistry);
      vi.spyOn(host.textureRegistry, "publishStreamedTexture").mockImplementation((texture, handle) => {
        publish(texture, handle);
        host.samplers.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "u_baseColorTexture", texture }), 0, "sampler2D");
        publications.push({ texture, handle, sampledHandle: host.gl.getParameter(host.gl.TEXTURE_BINDING_2D) });
      });
    }
    const shell = {
      device,
      getDiagnostics: () => device.getDiagnostics(),
      getShadowEvidence: () => null,
      isDeviceLost: () => device.isDeviceLost(),
      onDeviceLost: (listener: () => void) => device.onDeviceLost(listener),
      onDeviceRestored: (listener: () => void) => device.onDeviceRestored(listener),
      invalidateBenchmarkMaskFrame() {}, resetTemporalHistory() {}, resize() {},
      postDiagnosticViews: () => undefined, postScopeId: () => undefined,
      render(source: { collectRenderItems?: () => Iterable<RenderItem>; renderItems?: Iterable<RenderItem> }) {
        const items = [...(source.collectRenderItems?.() ?? []), ...(source.renderItems ?? [])];
        for (const item of items) {
          const binding = item.material?.getParameter("u_baseColorTexture");
          if (!(binding instanceof TextureBinding) || !binding.texture) continue;
          host.samplers.uploadTextureUniform({} as WebGLUniformLocation, binding, 0, "sampler2D");
          submissions.push({ item, binding, handle: host.textureRegistry.getTextureHandle(binding.texture) });
        }
        return { ...device.getDiagnostics(), drawCalls: items.length };
      },
      dispose: () => device.dispose()
    };
    return shell as unknown as Renderer;
  });
  return { devices, submissions, publications };
}

async function until(assertion: () => void, attempts = 200) {
  let last: unknown;
  for (let index = 0; index < attempts; index++) {
    try { assertion(); return; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw last;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("public typed-model WebGL texture residency", () => {
  it.each([
    { compiler: false, teardown: "remove" }, { compiler: true, teardown: "remove" },
    { compiler: false, teardown: "dispose" }, { compiler: true, teardown: "dispose" }
  ] as const)("publishes decoded texture and fences $teardown with compiler=$compiler", async ({ compiler, teardown }) => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("location", { origin: "https://site.test", href: "https://site.test/", search: "" });
    const bytes = texturedTriangle();
    const path = `/models/red-${compiler}-${teardown}.gltf`;
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, "https://site.test/").pathname === path) return new Response(new Uint8Array(bytes).buffer, { headers: { "content-type": "model/gltf+json" } });
      if (url.startsWith("data:")) return originalFetch(input, init);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const asset = defineModelAssets({ red: { url: path, sha256: createHash("sha256").update(bytes).digest("hex") } }, { queryParam: null }).refs.red;
    const canvas = new FakeCanvas(), shell = installRendererShell();
    vi.stubGlobal("WebGL2RenderingContext", class { static MAX_TEXTURE_SIZE = canvas.context.gl.MAX_TEXTURE_SIZE; });
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: scene().add(model(asset, { name: "red" }).runtime({ id: "red" })),
      autoStart: false, resize: false, diagnostics: false,
      renderer: { backend: "webgl2", textureResidency: { budgetBytes: 128 } },
      qualityRebuild: { flags: { A3D_QR_COMPILER: compiler, A3D_QR_ASSETS: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    try {
      await app.readyStrict();
      expect(fetch).toHaveBeenCalled();
      expect(shell.devices).toHaveLength(1);
      const device = shell.devices[0]!;
      await until(() => expect(app.diagnostics().renderer?.textures).toMatchObject({
        mode: "device-residency", usedBytes: 68, residentBytes: 64, retiringBytes: 0,
        residentEntries: 1, loadingEntries: 0, unmanagedEntries: [], errors: []
      }));
      app.step(1 / 60);
      expect(shell.submissions.length).toBeGreaterThan(0);
      const { item, binding, handle } = shell.submissions.at(-1)!;
      expect(item.label).toMatch(/^actor-0:mesh-0:/);
      expect(binding.texture).toBeDefined();
      const uploads = canvas.context.calls.filter((call) => call.name === "texImage2D");
      const fallback = uploads.find((upload) => upload.args[4] === 1 && upload.args[5] === 1)!;
      const resident = uploads.find((upload) => upload.args[0] === handle)!;
      expect(uploads.indexOf(fallback)).toBeLessThan(uploads.indexOf(resident));
      expect(fallback.args.slice(1, 9)).toEqual([
        canvas.context.gl.TEXTURE_2D, 0, canvas.context.gl.SRGB8_ALPHA8, 1, 1, 0, canvas.context.gl.RGBA, canvas.context.gl.UNSIGNED_BYTE
      ]);
      expect([...fallback.args[9] as Uint8Array]).toEqual([255, 255, 255, 255]);
      expect(resident.args.slice(1, 9)).toEqual([
        canvas.context.gl.TEXTURE_2D, 0, canvas.context.gl.SRGB8_ALPHA8, 4, 4, 0, canvas.context.gl.RGBA, canvas.context.gl.UNSIGNED_BYTE
      ]);
      expect(handle).not.toBe(fallback.args[0]);
      const pixels = resident.args[9] as Uint8Array;
      expect(pixels).toHaveLength(64);
      for (let offset = 0; offset < pixels.length; offset += 4) {
        expect(pixels[offset]).toBeGreaterThan(180);
        expect(pixels[offset + 1]).toBeLessThan(75);
        expect(pixels[offset + 2]).toBeLessThan(75);
        expect(pixels[offset + 3]).toBe(255);
      }
      expect(canvas.context.calls.filter((call) => call.name === "bindTexture").at(-1)?.args[1]).toBe(handle);
      expect(canvas.context.calls.some((call) => call.name === "bindSampler")).toBe(true);
      expect(device.getDiagnostics().textureBytes).toBe(68);
      const settledUploadCount = uploads.length;
      for (let frame = 0; frame < 3; frame++) {
        app.step(1 / 60);
        await Promise.resolve();
        expect(shell.submissions.at(-1)?.handle).toBe(handle);
      }
      expect(canvas.context.calls.filter((call) => call.name === "texImage2D")).toHaveLength(settledUploadCount);
      expect(device.getDiagnostics().textureBytes).toBe(68);

      vi.useFakeTimers();
      canvas.context.setWait("TIMEOUT_EXPIRED");
      if (teardown === "remove") {
        expect(app.nodes.remove("red")).toBe(true);
        expect(app.nodes.get("red")).toBeUndefined();
      }
      const disposal = app.disposeAsync();
      await vi.advanceTimersByTimeAsync(0);
      expect(device.getDiagnostics().textureBytes).toBe(68);
      expect(binding.texture!.disposed).toBe(false);
      const host = (device as unknown as { host: WebGL2DeviceHost }).host;
      expect(host.textureRegistry.getTextureHandle(binding.texture!)).toBe(fallback.args[0]);
      expect(canvas.context.calls.filter((call) => call.name === "deleteTexture").map((call) => call.args[0])).not.toContain(handle);
      const submissionCount = shell.submissions.length;
      expect(() => app.step(1 / 60)).toThrow(/disposed/);
      expect(shell.submissions).toHaveLength(submissionCount);
      let disposed = false;
      void disposal.then(() => { disposed = true; });
      await Promise.resolve();
      expect(disposed).toBe(false);
      expect(device.disposed).toBe(false);
      canvas.context.setWait("ALREADY_SIGNALED");
      await vi.runAllTimersAsync();
      await expect(disposal).resolves.toBeUndefined();
      expect(binding.texture!.disposed).toBe(true);
      expect(device.getDiagnostics().textureBytes).toBe(0);
      expect(device.disposed).toBe(true);
      expect(canvas.context.calls.filter((call) => call.name === "deleteTexture").map((call) => call.args[0])).toEqual(expect.arrayContaining([handle, fallback.args[0]]));
    } finally {
      canvas.context.setWait("ALREADY_SIGNALED");
      app.dispose();
      if (vi.isFakeTimers()) await vi.runAllTimersAsync();
      await app.disposeAsync();
    }
  });

  it.each([false, true])("publishes and samples the decoded mip tails from coarse to fine with compiler=%s", async (compiler) => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("location", { origin: "https://site.test", href: "https://site.test/", search: "" });
    const bytes = texturedTriangle(true);
    const path = `/models/red-mips-${compiler}.gltf`;
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, "https://site.test/").pathname === path) return new Response(new Uint8Array(bytes).buffer, { headers: { "content-type": "model/gltf+json" } });
      if (url.startsWith("data:")) return originalFetch(input, init);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const asset = defineModelAssets({ red: { url: path, sha256: createHash("sha256").update(bytes).digest("hex") } }, { queryParam: null }).refs.red;
    const canvas = new FakeCanvas(), shell = installRendererShell(true);
    vi.stubGlobal("WebGL2RenderingContext", class { static MAX_TEXTURE_SIZE = canvas.context.gl.MAX_TEXTURE_SIZE; });
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: scene().add(model(asset, { name: "red" }).runtime({ id: "red" })),
      autoStart: false, resize: false, diagnostics: false,
      renderer: { backend: "webgl2", textureResidency: { budgetBytes: 128 } },
      qualityRebuild: { flags: { A3D_QR_COMPILER: compiler, A3D_QR_ASSETS: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    try {
      await app.readyStrict();
      expect(fetch).toHaveBeenCalled();
      await until(() => expect(app.diagnostics().renderer?.textures).toMatchObject({
        mode: "device-residency", usedBytes: 88, residentBytes: 84, retiringBytes: 0,
        residentEntries: 1, loadingEntries: 0, unmanagedEntries: [], errors: []
      }));
      app.step(1 / 60);
      const device = shell.devices[0]!;
      const frame = shell.submissions.at(-1)!;
      const texture = frame.binding.texture!;
      expect(texture.mipLevelCount).toBe(3);
      expect(device.getDiagnostics().textureBytes).toBe(88);

      const uploads = canvas.context.calls.filter((call) => call.name === "texImage2D");
      const publications = shell.publications.filter((publication) => publication.texture === texture);
      // Each published native allocation must contain the expected contiguous
      // mip tail; all data comes from the decoded fixture, not the fallback.
      const dimensions = (publication: Publication) => uploads.filter((upload) => upload.args[0] === publication.handle)
        .map((upload) => [upload.args[2], upload.args[4], upload.args[5]]);
      const expectedTails = [
        [[0, 1, 1]],
        [[0, 2, 2], [1, 1, 1]],
        [[0, 4, 4], [1, 2, 2], [2, 1, 1]]
      ];
      let previous = -1;
      for (const tail of expectedTails) {
        const index = publications.findIndex((publication, at) => at > previous && JSON.stringify(dimensions(publication)) === JSON.stringify(tail));
        expect(index, `missing published mip tail ${JSON.stringify(tail)}`).toBeGreaterThan(previous);
        const publication = publications[index]!;
        expect(publication.sampledHandle).toBe(publication.handle);
        for (const upload of uploads.filter((entry) => entry.args[0] === publication.handle)) {
          const pixels = upload.args[9] as Uint8Array;
          expect(pixels).toHaveLength(Number(upload.args[4]) * Number(upload.args[5]) * 4);
          for (let offset = 0; offset < pixels.length; offset += 4) {
            expect(pixels[offset]).toBeGreaterThan(180);
            expect(pixels[offset + 1]).toBeLessThan(75);
            expect(pixels[offset + 2]).toBeLessThan(75);
            expect(pixels[offset + 3]).toBe(255);
          }
        }
        previous = index;
      }
      expect(frame.handle).toBe(publications[previous]!.handle);
      const uploadCount = uploads.length;
      for (let frameIndex = 0; frameIndex < 3; frameIndex++) { app.step(1 / 60); await Promise.resolve(); }
      expect(canvas.context.calls.filter((call) => call.name === "texImage2D")).toHaveLength(uploadCount);
      expect(shell.submissions.at(-1)?.handle).toBe(frame.handle);
    } finally {
      await app.disposeAsync();
    }
  });
});

// These tests count device/texture/fetch calls for the scene they author; the 5.1 cold-start default look (studio IBL fetch) is off here.
process.env.A3D_COLD_START_LOOK = "0";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import { createAuraApp, defineAuraAssets, material, primitives, scene, texture } from "../../../packages/engine/src/public/index";
import type { AuraApp, AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const ORIGIN = "https://assets.example.test";
const BASE_PIXELS = Uint8Array.of(
  10, 20, 30, 255, 40, 50, 60, 255,
  70, 80, 90, 255, 100, 110, 120, 255
);
const COARSE_PIXEL = Uint8Array.of(31, 47, 59, 255);

/** Construct a small PVR v3 RGBA8 file from values owned by this test. */
function pvr(base = BASE_PIXELS, coarse = COARSE_PIXEL, colorSpace: "linear" | "srgb" = "srgb"): Uint8Array {
  if (base.length !== 16 || coarse.length !== 4) throw new Error("fixture must contain a 2x2 image and one 1x1 mip");
  const bytes = new Uint8Array(52 + base.length + coarse.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x03525650, true); // PVR v3 magic
  header.setUint32(8, 0x61626772, true); // rgba channel names
  header.setUint32(12, 0x08080808, true); // eight bits per channel
  header.setUint32(16, colorSpace === "srgb" ? 1 : 0, true);
  header.setUint32(20, 0, true); // unsigned normalized bytes
  header.setUint32(24, 2, true); // height
  header.setUint32(28, 2, true); // width
  header.setUint32(32, 1, true); // depth
  header.setUint32(36, 1, true); // surfaces
  header.setUint32(40, 1, true); // faces
  header.setUint32(44, 2, true); // mip levels
  bytes.set(base, 52);
  bytes.set(coarse, 68);
  return bytes;
}

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
function asset(id: string, bytes: Uint8Array, request: AssetRequestOptions = {}): AuraAssetRef<"texture"> {
  return defineAuraAssets({ map: {
    type: "texture", format: "pvr", url: `${ORIGIN}/${id}`, hash: `sha256-${digest(bytes)}`, request
  } }).map;
}
function response(bytes: Uint8Array, contentType = "application/octet-stream"): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": contentType } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  constructor(private readonly maxTextureSize?: number) {}
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext(kind: string) {
    return kind === "webgl2" && this.maxTextureSize !== undefined
      ? { getParameter: () => this.maxTextureSize }
      : null;
  }
  addEventListener() {}
  removeEventListener() {}
}

type RecordedDraw = {
  readonly label?: string;
  readonly textures: ReadonlyMap<string, Texture | null>;
  readonly uniforms: DrawCommand["uniforms"];
};
/** Only the device is mocked: public app, scene compiler, material and renderer are real. */
class CapturingDevice extends MockRenderDevice {
  readonly submitted: RecordedDraw[] = [];
  override draw(command: DrawCommand): void {
    const textures = new Map<string, Texture | null>();
    for (const [name, value] of command.uniforms ?? []) {
      if (value instanceof TextureBinding) textures.set(name, value.texture);
    }
    this.submitted.push({ label: command.label, textures, uniforms: command.uniforms });
    super.draw(command);
  }
}

async function harness(initial: ReturnType<typeof scene>, maxTextureSize?: number, deviceTextureSize?: number) {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  if (deviceTextureSize !== undefined) vi.stubGlobal("WebGL2RenderingContext", { MAX_TEXTURE_SIZE: 0x0d33 });
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: `${ORIGIN}/`, search: "" }, addEventListener() {}, removeEventListener() {} });
  const devices: CapturingDevice[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const device = new CapturingDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    devices.push(device);
    return new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
  });
  const app = createAuraApp(new FakeCanvas(deviceTextureSize) as unknown as HTMLCanvasElement, {
    scene: initial, autoStart: false, resize: false,
    ...(maxTextureSize === undefined ? {} : { assets: { maxTextureSize } }),
    qualityRebuild: { flags: {
      A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false
    }, allowUrlFlags: false }
  });
  await app.readyStrict({ stage: "first-frame" });
  return { app, device: () => devices[devices.length - 1]! };
}

async function waitStatus(app: AuraApp, nodeName: string, status: "textured" | "fallback", slots: string[] = []) {
  await vi.waitFor(() => expect(app.diagnostics().renderer?.runtime.texturedMaterials).toContainEqual(
    expect.objectContaining({ nodeName, status, pixelBacked: status === "textured", slots: expect.arrayContaining(slots) })
  ), { timeout: 3000 });
}
function draw(app: AuraApp, device: CapturingDevice, name: string): RecordedDraw {
  device.submitted.length = 0;
  app.step(0);
  const matching = device.submitted.filter((entry) => entry.label?.includes(`:${name}`));
  expect(matching.length, `expected a submitted draw for ${name}`).toBeGreaterThan(0);
  return matching[matching.length - 1]!;
}
function submittedTexture(app: AuraApp, device: CapturingDevice, name: string, uniform: string): Texture {
  const result = draw(app, device, name).textures.get(uniform);
  expect(result, `expected a live ${uniform} binding`).toBeInstanceOf(Texture);
  if (!result) throw new Error(`Missing ${uniform} texture`);
  expect(result.disposed).toBe(false);
  return result;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("native PVR must not use bitmap decoding"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("direct admitted PVR material assets", () => {
  it("submits the verified base map and both authored mips, then retires the engine-owned texture", async () => {
    const bytes = pvr();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const { app, device } = await harness(scene().add(primitives.box({ name: "direct", material: material.pbr({ texture: asset("base", bytes) }) })));
    let resolved: Texture | undefined;
    try {
      await waitStatus(app, "direct", "textured", ["baseColor"]);
      resolved = submittedTexture(app, device(), "direct", "u_baseColorMap");
      expect(resolved.width).toBe(2); expect(resolved.height).toBe(2);
      expect(resolved.format).toBe("rgba8"); expect(resolved.colorSpace).toBe("srgb");
      expect(resolved.mipLevels).toHaveLength(2);
      expect(Array.from(resolved.mipLevels[0]!.data)).toEqual(Array.from(BASE_PIXELS));
      expect(Array.from(resolved.mipLevels[1]!.data)).toEqual(Array.from(COARSE_PIXEL));
      expect(fetch).toHaveBeenCalledOnce();
      expect(createImageBitmap).not.toHaveBeenCalled();
    } finally { await app.disposeAsync(); }
    expect(resolved?.disposed).toBe(true);
  });

  it("upgrades dynamic additions and retires their native ownership without disposing a borrowed replacement", async () => {
    const bytes = pvr();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const borrowed = texture.data({ width: 1, height: 1, data: Uint8Array.of(9, 8, 7, 255), colorSpace: "srgb" });
    const { app, device } = await harness(scene().add(primitives.box({ name: "anchor" })));
    let owned: Texture | undefined;
    try {
      app.nodes.add!(primitives.box({ name: "dynamic-pvr", material: material.pbr({ texture: asset("dynamic", bytes) }) }).runtime({ id: "dynamic-pvr" }));
      await waitStatus(app, "dynamic-pvr", "textured", ["baseColor"]);
      owned = submittedTexture(app, device(), "dynamic-pvr", "u_baseColorMap");
      app.nodes.require("dynamic-pvr").setMaterial(material.pbr({ texture: borrowed }));
      app.step(0);
      await waitStatus(app, "dynamic-pvr", "textured", ["baseColor"]);
      expect(submittedTexture(app, device(), "dynamic-pvr", "u_baseColorMap")).toBe(borrowed.texture);
      await vi.waitFor(() => expect(owned?.disposed).toBe(true));
      expect(app.nodes.remove!("dynamic-pvr")).toBe(true);
      expect(borrowed.texture.disposed).toBe(false);
    } finally { await app.disposeAsync(); }
    expect(borrowed.texture.disposed).toBe(false);
    borrowed.dispose();
  });

  it("uses native base-mip channels for metallic/roughness and submits the normal, occlusion and emissive maps", async () => {
    const roughPixels = Uint8Array.of(1, 21, 3, 255, 4, 51, 6, 255, 7, 81, 9, 255, 10, 111, 12, 255);
    const metalPixels = Uint8Array.of(13, 14, 32, 255, 16, 17, 62, 255, 19, 20, 92, 255, 22, 23, 122, 255);
    const rough = pvr(roughPixels, COARSE_PIXEL, "linear");
    const metal = pvr(metalPixels, COARSE_PIXEL, "linear");
    const linear = pvr(BASE_PIXELS, COARSE_PIXEL, "linear");
    const emissive = pvr();
    const files = new Map([[`${ORIGIN}/rough`, rough], [`${ORIGIN}/metal`, metal], [`${ORIGIN}/linear`, linear], [`${ORIGIN}/emissive`, emissive]]);
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const found = files.get(String(url));
      if (!found) throw new Error(`Unexpected request ${String(url)}`);
      return response(found);
    }));
    const spec = material.pbr({ roughnessMap: asset("rough", rough), metalnessMap: asset("metal", metal),
      normal: asset("linear", linear), occlusionMap: asset("linear", linear), emissiveMap: asset("emissive", emissive), emissive: "#ffffff" });
    const { app, device } = await harness(scene().add(primitives.box({ name: "channels", material: spec })));
    try {
      await waitStatus(app, "channels", "textured", ["metallicRoughness", "normal", "occlusion", "emissive"]);
      const bindings = draw(app, device(), "channels").textures;
      const composite = bindings.get("u_metallicRoughnessMap");
      expect(composite).toBeInstanceOf(Texture);
      expect(Array.from(composite!.data!)).toEqual([255, 21, 32, 255, 255, 51, 62, 255, 255, 81, 92, 255, 255, 111, 122, 255]);
      for (const name of ["u_normalMap", "u_occlusionMap", "u_emissiveMap"]) {
        const bound = bindings.get(name);
        expect(bound, name).toBeInstanceOf(Texture);
        expect(Array.from(bound!.mipLevels[0]!.data)).toEqual(Array.from(BASE_PIXELS));
      }
      expect(createImageBitmap).not.toHaveBeenCalled();
    } finally { await app.disposeAsync(); }
  });

  it("builds the submitted extension atlas from the separate native base mips", async () => {
    const clearPixels = Uint8Array.of(11, 12, 13, 255, 14, 15, 16, 255, 17, 18, 19, 255, 20, 21, 22, 255);
    const sheenPixels = Uint8Array.of(31, 32, 33, 255, 34, 35, 36, 255, 37, 38, 39, 255, 40, 41, 42, 255);
    const iriPixels = Uint8Array.of(51, 52, 53, 255, 54, 55, 56, 255, 57, 58, 59, 255, 60, 61, 62, 255);
    const clear = pvr(clearPixels, COARSE_PIXEL, "linear");
    const sheen = pvr(sheenPixels, COARSE_PIXEL, "linear");
    const iri = pvr(iriPixels, COARSE_PIXEL, "linear");
    const files = new Map([[`${ORIGIN}/clear`, clear], [`${ORIGIN}/sheen`, sheen], [`${ORIGIN}/iri`, iri]]);
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const found = files.get(String(url));
      if (!found) throw new Error(`Unexpected request ${String(url)}`);
      return response(found);
    }));
    const spec = material.pbr({ clearcoat: 1, sheen: 1, iridescence: 1,
      clearcoatMap: asset("clear", clear), sheenRoughnessMap: asset("sheen", sheen), iridescenceMap: asset("iri", iri) });
    const { app, device } = await harness(scene().add(primitives.box({ name: "atlas", material: spec })));
    try {
      await waitStatus(app, "atlas", "textured", ["clearcoat", "sheenRoughness", "iridescence"]);
      const submission = draw(app, device(), "atlas");
      const atlas = submission.textures.get("u_extensionScalarAtlas");
      expect(atlas).toBeInstanceOf(Texture);
      expect(atlas!.data).toBeInstanceOf(Uint8Array);
      for (const [slot, pixels] of [["clearcoat", clearPixels], ["sheenRoughness", sheenPixels], ["iridescence", iriPixels]] as const) {
        const rect = submission.uniforms?.get(`u_${slot}AtlasRect`) as readonly number[] | undefined;
        const y = submission.uniforms?.get(`u_${slot}AtlasY`) as number | undefined;
        expect(rect?.slice(1, 3)).toEqual([2, 2]);
        expect(typeof y).toBe("number");
        const data = atlas!.data as Uint8Array;
        for (let row = 0; row < 2; row += 1) {
          const start = ((y! + row) * atlas!.width + rect![0]!) * 4;
          expect(Array.from(data.slice(start, start + 8))).toEqual(Array.from(pixels.slice(row * 8, row * 8 + 8)));
        }
      }
      expect(createImageBitmap).not.toHaveBeenCalled();
    } finally { await app.disposeAsync(); }
  });

  it("captures queued asset URL, hash and request policy before a four-job bottleneck clears", async () => {
    const bytes = pvr();
    const pending = Array.from({ length: 4 }, () => deferred<Response>());
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const requested = String(url);
      calls.push({ url: requested, init });
      const index = Number(requested.match(/\/hold-(\d)$/)?.[1]);
      if (Number.isInteger(index) && pending[index]) return pending[index]!.promise;
      if (requested === `${ORIGIN}/queued`) return Promise.resolve(response(bytes));
      throw new Error(`Unexpected request ${requested}`);
    }));
    const headers = new Headers({ "x-fixture-policy": "original" });
    const allowedOrigins = [ORIGIN];
    const request: { credentials: RequestCredentials; headers: Headers; allowedOrigins: string[]; maxBytes: number; redirect: RequestRedirect } = {
      credentials: "include", headers, allowedOrigins, maxBytes: bytes.length, redirect: "error"
    };
    const queued = asset("queued", bytes, request);
    const builder = scene();
    for (let index = 0; index < 4; index += 1) builder.add(primitives.box({
      name: `hold-${index}`, material: material.pbr({ texture: asset(`hold-${index}`, bytes) })
    }).runtime({ id: `hold-${index}` }));
    builder.add(primitives.box({ name: "queued", material: material.pbr({ texture: queued }) }).runtime({ id: "queued" }));
    const { app, device } = await harness(builder);
    try {
      await vi.waitFor(() => expect(calls).toHaveLength(4));
      const mutable = queued as unknown as { url: string; hash: string };
      mutable.url = "https://wrong.example.test/changed";
      mutable.hash = `sha256-${"0".repeat(64)}`;
      headers.set("x-fixture-policy", "changed");
      allowedOrigins[0] = "https://wrong.example.test";
      request.credentials = "omit"; request.maxBytes = 0; request.redirect = "follow";
      pending[0]!.resolve(response(bytes));
      await vi.waitFor(() => expect(calls).toHaveLength(5));
      const fifth = calls[4]!;
      expect(fifth.url).toBe(`${ORIGIN}/queued`);
      expect(fifth.init?.credentials).toBe("include");
      expect(fifth.init?.redirect).toBe("error");
      expect(new Headers(fifth.init?.headers).get("x-fixture-policy")).toBe("original");
      await waitStatus(app, "queued", "textured", ["baseColor"]);
      expect(Array.from(submittedTexture(app, device(), "queued", "u_baseColorMap").mipLevels[0]!.data)).toEqual(Array.from(BASE_PIXELS));
      expect(createImageBitmap).not.toHaveBeenCalled();
    } finally {
      for (const item of pending) item.resolve(response(bytes));
      await app.disposeAsync();
    }
  });

  it("does not let uncooperative cancelled fetches release the four physical queue slots", async () => {
    const bytes = pvr();
    const pending = Array.from({ length: 4 }, () => deferred<Response>());
    const calls: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const requested = String(url);
      calls.push({ url: requested, signal: init?.signal ?? undefined });
      const index = Number(requested.match(/\/old-(\d)$/)?.[1]);
      if (Number.isInteger(index) && pending[index]) return pending[index]!.promise; // intentionally ignores abort
      if (requested === `${ORIGIN}/new`) return Promise.resolve(response(bytes));
      throw new Error(`Unexpected request ${requested}`);
    }));
    const builder = scene();
    for (let index = 0; index < 4; index += 1) builder.add(primitives.box({
      name: `old-${index}`, material: material.pbr({ texture: asset(`old-${index}`, bytes) })
    }).runtime({ id: `old-${index}` }));
    builder.add(primitives.box({ name: "next", material: material.pbr({ texture: asset("new", bytes) }) }).runtime({ id: "next" }));
    const { app, device } = await harness(builder);
    try {
      await vi.waitFor(() => expect(calls).toHaveLength(4));
      for (let index = 0; index < 4; index += 1) app.nodes.require(`old-${index}`).setMaterial(material.pbr({ color: "#ffffff" }));
      app.step(0);
      expect(calls.every((call) => call.signal?.aborted)).toBe(true);
      // Drain microtasks: none of the four transports has actually settled yet.
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
      expect(calls).toHaveLength(4);
      pending[0]!.resolve(response(bytes));
      await vi.waitFor(() => expect(calls).toHaveLength(5));
      expect(calls[4]!.url).toBe(`${ORIGIN}/new`);
      await waitStatus(app, "next", "textured", ["baseColor"]);
      expect(Array.from(submittedTexture(app, device(), "next", "u_baseColorMap").mipLevels[0]!.data)).toEqual(Array.from(BASE_PIXELS));
    } finally {
      for (const item of pending) item.resolve(response(bytes));
      await app.disposeAsync();
    }
  });

  it("aborts an obsolete native request across remount and discards its late response", async () => {
    const bytes = pvr();
    const late = deferred<Response>();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return late.promise; // deliberately does not honor abort
    }));
    const { app } = await harness(scene().add(primitives.box({ name: "anchor" })));
    try {
      app.nodes.add!(primitives.box({ name: "stale", material: material.pbr({ texture: asset("stale", bytes) }) }).runtime({ id: "stale" }));
      await vi.waitFor(() => expect(signal).toBeDefined());
      app.setScene(scene().add(primitives.box({ name: "new-scene" })));
      expect(signal?.aborted).toBe(true);
      late.resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      await app.readyStrict({ stage: "first-frame" });
      expect(app.nodes.has("stale")).toBe(false);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.some((item) => item.nodeName === "stale")).toBe(false);
      expect(createImageBitmap).not.toHaveBeenCalled();
    } finally { late.resolve(response(bytes)); await app.disposeAsync(); }
  });

  it("keeps a borrowed replacement when a superseded native transport responds late", async () => {
    const bytes = pvr();
    const late = deferred<Response>();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return late.promise;
    }));
    const borrowed = texture.data({ width: 1, height: 1, data: Uint8Array.of(4, 5, 6, 255), colorSpace: "srgb" });
    const initial = scene().add(primitives.box({ name: "replacement", material: material.pbr({ texture: asset("slow", bytes) }) }).runtime({ id: "replacement" }));
    const { app, device } = await harness(initial);
    try {
      await vi.waitFor(() => expect(signal).toBeDefined());
      app.nodes.require("replacement").setMaterial(material.pbr({ texture: borrowed }));
      app.step(0);
      expect(signal?.aborted).toBe(true);
      await waitStatus(app, "replacement", "textured", ["baseColor"]);
      expect(submittedTexture(app, device(), "replacement", "u_baseColorMap")).toBe(borrowed.texture);
      late.resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      expect(submittedTexture(app, device(), "replacement", "u_baseColorMap")).toBe(borrowed.texture);
      expect(app.diagnostics().warnings.some((warning) => /textured upgrade failed.*replacement/i.test(warning))).toBe(false);
    } finally { late.resolve(response(bytes)); await app.disposeAsync(); }
    expect(borrowed.texture.disposed).toBe(false);
    borrowed.dispose();
  });

  it.each(["missing digest", "conflicting digest", "changed content", "disallowed origin", "byte cap", "unsupported codec", "asset size limit", "device size limit"] as const)(
    "fails closed for %s without submitting a native or bitmap texture", async (problem) => {
      let bytes = pvr();
      const admitted = asset("invalid", bytes) as unknown as {
        kind: "aura-asset-ref"; type: "texture"; id: string; format: string; url: string; hash?: string; request?: AssetRequestOptions;
      };
      let actual = bytes;
      if (problem === "missing digest") delete admitted.hash;
      if (problem === "conflicting digest") admitted.request = { integrity: { version: 1, digest: "0".repeat(64) } };
      if (problem === "changed content") { actual = bytes.slice(); actual[52] = actual[52]! ^ 1; }
      if (problem === "disallowed origin") admitted.request = { allowedOrigins: ["https://other.example.test"] };
      if (problem === "byte cap") admitted.request = { maxBytes: bytes.length - 1 };
      if (problem === "unsupported codec") {
        bytes = pvr();
        new DataView(bytes.buffer).setUint32(8, 2, true); // PVRTC requires a codec unavailable in this CPU route.
        new DataView(bytes.buffer).setUint32(12, 0, true);
        admitted.hash = `sha256-${digest(bytes)}`;
        actual = bytes;
      }
      const fetch = vi.fn(async () => response(actual));
      vi.stubGlobal("fetch", fetch);
      const ref = admitted as unknown as AuraAssetRef<"texture">;
      const { app, device } = await harness(
        scene().add(primitives.box({ name: "rejected", material: material.pbr({ texture: ref }) })),
        problem === "asset size limit" ? 1 : undefined,
        problem === "device size limit" ? 1 : undefined
      );
      try {
        await waitStatus(app, "rejected", "fallback");
        expect(draw(app, device(), "rejected").textures.get("u_baseColorMap")).toBeUndefined();
        expect(createImageBitmap).not.toHaveBeenCalled();
        if (problem === "missing digest" || problem === "conflicting digest" || problem === "disallowed origin") expect(fetch).not.toHaveBeenCalled();
      } finally { await app.disposeAsync(); }
    }
  );

  it("retires an acquired PVR if another map in the same upgrade fails", async () => {
    const bytes = pvr();
    const badImage = Uint8Array.of(1, 2, 3);
    const fetch = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/base") ? response(bytes) : response(badImage, "image/png"));
    const decode = vi.fn(async () => { throw new Error("deliberate bitmap decoder failure"); });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("createImageBitmap", decode);
    const retiredMipTextures: Texture[] = [];
    const originalDispose = Texture.prototype.dispose;
    vi.spyOn(Texture.prototype, "dispose").mockImplementation(function (this: Texture) {
      if (this.width === 2 && this.height === 2 && this.mipLevels.length === 2) retiredMipTextures.push(this);
      originalDispose.call(this);
    });
    const png = defineAuraAssets({ normal: { type: "texture", format: "png", url: `${ORIGIN}/bad.png`, hash: `sha256-${digest(badImage)}` } }).normal;
    const { app } = await harness(scene().add(primitives.box({ name: "mixed", material: material.pbr({ texture: asset("base", bytes), normal: png }) })));
    try {
      await waitStatus(app, "mixed", "fallback");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(decode).toHaveBeenCalledTimes(1);
      expect(retiredMipTextures).toHaveLength(1);
      expect(retiredMipTextures[0]?.disposed).toBe(true);
    } finally { await app.disposeAsync(); }
  });
});

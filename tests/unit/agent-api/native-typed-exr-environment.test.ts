import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, defineAuraAssets, environments, primitives, scene } from "../../../packages/engine/src/public/index";
import { bindPrd02EnvironmentProbe, createProductionRuntimeEnvironment, explicitEnvironmentResolution } from "../../../packages/engine/src/agent-api/compiler/environment";
import type { AuraEnvironmentNodeV2 } from "../../../packages/engine/src/agent-api/nodes/environments";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { decodeProductionEnvironmentImage, upgradeProductionEnvironmentHdri } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { EnvironmentCache } from "../../../packages/rendering/src/environment/EnvironmentCache";
import { halfToFloat } from "../../../packages/rendering/src/environment/probeBuild";
import { environmentProbeFactorySlot, type EnvironmentProbe, type EnvironmentProbeFactory } from "../../../packages/rendering/src/contracts/environment";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource";
import { Texture } from "../../../packages/rendering/src/Texture";

// The OpenEXR fixtures contain an independently authored HDR gradient; see
// tests/unit/parity/exr.test.ts for fixture generation and sample details.
const exr = readFileSync(new URL("../../fixtures/exr/none_half.exr", import.meta.url));
const digest = createHash("sha256").update(exr).digest("hex");
// First part is DWAA-compressed, with independently authored analytic RGB
// samples on a 2x2 grid and alpha on a 1x1 grid (see the EXR fixture tests).
const dwaa = readFileSync(new URL("../../fixtures/exr/subsampled_dwa_rgb.exr", import.meta.url));
const dwaaDigest = createHash("sha256").update(dwaa).digest("hex");
const radiance = Buffer.concat([
  Buffer.from("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 1\n", "ascii"),
  Buffer.from([128, 0, 0, 129, 0, 128, 0, 129])
]);

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function typedEnvironment(integrity = digest) {
  return defineAuraAssets({ sky: {
    type: "texture", format: "exr", url: "https://site.test/lighting/sky?revision=7",
    integrity: { version: 1, digest: integrity },
    request: { credentials: "include", cache: "no-store", securityContext: "exr-test-generation", headers: { "x-environment-test": "scene" } }
  } }).sky;
}

function typedDwaaEnvironment(integrity = dwaaDigest) {
  return defineAuraAssets({ sky: {
    type: "texture", format: "exr", url: "https://site.test/lighting/dwaa?revision=1",
    integrity: { version: 1, digest: integrity },
    request: { credentials: "same-origin", maxBytes: dwaa.byteLength, securityContext: "exr-test-generation", headers: { "x-environment-test": "dwaa" } }
  } }).sky;
}

function typedReflection(integrity = createHash("sha256").update(radiance).digest("hex")) {
  return defineAuraAssets({ mirror: {
    type: "texture", format: "hdr", url: "https://site.test/lighting/reflection?version=1",
    integrity: { version: 1, digest: integrity },
    request: { credentials: "same-origin", cache: "reload", securityContext: "exr-test-generation", headers: { "x-reflection-test": "mirror" } }
  } }).mirror;
}

/** Use the real production renderer with the software-only command-validation device. */
function captureRenderer() {
  const create = Renderer.create.bind(Renderer);
  let renderer: Renderer | undefined;
  const sources: RenderSource[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    // The command-validation device implements HDR targets. Its normal mock
    // identity implies that capability; the mounted bridge checks the
    // explicit capability once we expose it as a WebGL2-shaped device.
    Object.defineProperty(renderer.device, "info", {
      value: { ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"] }
    });
    const render = renderer.render.bind(renderer);
    vi.spyOn(renderer, "render").mockImplementation((source, camera) => {
      sources.push(source as RenderSource);
      return render(source, camera);
    });
    return renderer;
  });
  return { sources };
}

function probeHarness() {
  const device = new MockRenderDevice();
  const images: Texture[] = [];
  const probes: EnvironmentProbe[] = [];
  const fromEquirect = vi.fn((image: Texture): EnvironmentProbe => {
    images.push(image);
    const cube = new Texture({ width: 1, height: 1 });
    const probe: EnvironmentProbe = {
      kind: "environment-probe", specularCube: cube, mipCount: 1, faceSize: 128,
      sh9: new Float32Array(27).fill(image.width === 64 ? 3 : 7), shTexture: null, background: image, source: "hdri",
      dispose() { image.dispose(); cube.dispose(); }
    };
    probes.push(probe);
    return probe;
  });
  const unexpected = () => { throw new Error("Unexpected probe factory operation"); };
  const factory: EnvironmentProbeFactory = { fromEquirect, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
  vi.spyOn(environmentProbeFactorySlot, "get").mockReturnValue(() => factory);
  const cache = new EnvironmentCache(device, factory);
  return { device, cache, images, probes, fromEquirect, dispose() { cache.dispose(); device.dispose(); } };
}

function typedResolution(asset: AuraAssetRef<"texture">, reflection?: AuraAssetRef<"texture">) {
  const node = environments.hdri({ texture: asset, ...(reflection ? { reflectionTexture: reflection } : {}) }).toJSON() as AuraEnvironmentNodeV2;
  const resolution = explicitEnvironmentResolution(node, null);
  if (!resolution) throw new Error("expected typed HDRI resolution");
  return resolution;
}

async function until(assertion: () => void) {
  let last: unknown;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { assertion(); return; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw last;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://site.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("location", { href: "https://site.test/", origin: "https://site.test", search: "" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("typed root EXR environment", () => {
  it("decodes admitted DWAA bytes into correctly oriented probe pixels and verifies integrity", async () => {
    // Verify that the first EXR part really advertises the DWAA compression
    // code (8); the typed HDRI path selects part zero and the root layer.
    const marker = Buffer.from("compression\0compression\0", "ascii");
    const attribute = dwaa.indexOf(marker);
    expect(attribute).toBeGreaterThanOrEqual(0);
    expect(dwaa.readUInt32LE(attribute + marker.length)).toBe(1);
    expect(dwaa[attribute + marker.length + 4]).toBe(8);

    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(dwaa));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = probeHarness();
    const options = {
      device: harness.device, cache: harness.cache, tier: "low" as const,
      flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } })
    };
    try {
      const asset = typedDwaaEnvironment();
      const binding = bindPrd02EnvironmentProbe(typedResolution(asset), options);
      const probe = await binding.pending!;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]![0])).toBe(asset.url);
      expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: "same-origin" });
      expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("x-environment-test")).toBe("dwaa");
      const image = harness.images[0]!;
      expect(image).toMatchObject({ width: 32, height: 32, format: "rgba32f" });
      const pixels = image.data as Float32Array;
      const maxError = [0, 0, 0, 0];
      const nearestSample = (coordinate: number) => Math.max(-4, Math.min(26, Math.floor(coordinate / 2 + 0.5) * 2));
      // Source window is [-4, 27] in both axes; first output row is +Y.
      // DWAA uses lossy DCT, so compare each pixel against the independent
      // source function with the fixture's documented 0.012 tolerance.
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 32; x += 1) {
          const sx = nearestSample(x - 4), sy = nearestSample(y - 4);
          const expected = [0.125 + (sx + 4) / 64, 0.25 + (sy + 4) / 64, 0.375 + (sx + sy + 8) / 128, 1];
          for (let channel = 0; channel < 4; channel += 1) {
            maxError[channel] = Math.max(maxError[channel]!, Math.abs(pixels[(y * 32 + x) * 4 + channel]! - expected[channel]!));
          }
        }
      }
      for (const error of maxError) expect(error).toBeLessThan(0.012);
      expect(pixels[1]).toBeCloseTo(0.25, 1);
      expect(pixels[(31 * 32) * 4 + 1]).toBeCloseTo(0.71875, 1);
      expect(image.disposed).toBe(false);

      const failure = vi.fn();
      const rejected = bindPrd02EnvironmentProbe(typedResolution(typedDwaaEnvironment("0".repeat(64))), { ...options, onUpgradeFailed: failure });
      await expect(rejected.pending!).rejects.toThrow(/SHA-256 integrity mismatch/i);
      expect(failure).toHaveBeenCalledTimes(1);
      // The failed load degrades to the LOOK_HDRI_MISSING procedural probe: one extra (generated) fromEquirect.
      await vi.waitFor(() => expect(harness.fromEquirect).toHaveBeenCalledTimes(2));
      harness.cache.release(probe);
    } finally { harness.dispose(); }
    expect(harness.images[0]?.disposed).toBe(true);
    expect(harness.probes[0]?.specularCube.disposed).toBe(true);
  });

  it("mounts typed DWAA lighting through the public app and disposes its cube", async () => {
    const asset = typedDwaaEnvironment();
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(dwaa));
    vi.stubGlobal("fetch", fetch);
    const { sources } = captureRenderer();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(environments.hdri({ texture: asset })).add(primitives.box()),
      autoStart: false, resize: false, strict: true, renderer: { backend: "webgl2" },
      qualityRebuild: { flags: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    let cube: Texture | null | undefined;
    try {
      await app.readyStrict();
      await until(() => expect(app.diagnostics().renderer?.environment).toMatchObject({ hdriStatus: "ready", iblPixelBacked: true }));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]![0])).toBe(asset.url);
      app.step(1 / 60);
      const lighting = sources.at(-1)?.environmentLighting;
      if (!lighting || typeof lighting !== "object") throw new Error("expected sampled DWAA environment lighting");
      cube = lighting.environmentCubeMapTexture?.texture;
      expect(cube?.format).toBe("rgba16f");
      const poleGreen = (face: "py" | "ny") => {
        const mip = cube?.cubeFaces.find((candidate) => candidate.face === face)?.mipLevels[0];
        if (!mip || !(mip.data instanceof Uint16Array)) throw new Error(`missing ${face} DWAA cube pixels`);
        const center = Math.floor(mip.width / 2);
        return halfToFloat(mip.data[(center * mip.width + center) * 4 + 1]!);
      };
      expect(poleGreen("py")).toBeCloseTo(0.25, 1);
      expect(poleGreen("ny")).toBeCloseTo(0.71875, 1);
      expect(cube?.disposed).toBe(false);
    } finally { app.dispose(); await app.disposeAsync(); }
    expect(cube?.disposed).toBe(true);
  }, 30_000);

  it("cancels a pending typed DWAA response before probe creation", async () => {
    let started!: () => void;
    let release!: (response: Response) => void;
    let observedSignal: AbortSignal | undefined;
    const fetching = new Promise<void>((resolve) => { started = resolve; });
    const response = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      started();
      return response;
    }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = probeHarness();
    const controller = new AbortController();
    const failure = vi.fn(), upgrade = vi.fn();
    try {
      const binding = bindPrd02EnvironmentProbe(typedResolution(typedDwaaEnvironment()), {
        device: harness.device, cache: harness.cache, tier: "low",
        flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } }), signal: controller.signal,
        onUpgradeFailed: failure, onUpgrade: upgrade
      });
      await fetching;
      const rejected = expect(binding.pending!).rejects.toThrow(/cancelled DWAA|abort/i);
      controller.abort(new Error("cancelled DWAA"));
      release(new Response(dwaa));
      await rejected;
      expect(observedSignal?.aborted).toBe(true);
      expect(harness.fromEquirect).not.toHaveBeenCalled();
      expect(harness.cache.residentCount).toBe(0);
      expect(warning).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      expect(upgrade).not.toHaveBeenCalled();
    } finally { controller.abort(); harness.dispose(); }
  });

  it("decodes EXR and Radiance into the same top-down equirectangular row order", async () => {
    const image = await decodeProductionEnvironmentImage(Uint8Array.from(exr).buffer, "exr");
    expect(image).toMatchObject({ width: 64, height: 48 });
    expect(Array.from(image.data.slice(0, 4))).toEqual([0, 0, 0.25, 1]);
    const bottom = (image.height - 1) * image.width * 4;
    expect(image.data[bottom]).toBe(0);
    expect(image.data[bottom + 1]).toBeCloseTo(1.5, 3);
    expect(image.data[bottom + 2]).toBeCloseTo(0.25 + 47 / 110, 3);
    const hdr = await decodeProductionEnvironmentImage(Uint8Array.from(radiance).buffer, "hdr");
    expect(Array.from(hdr.data)).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
    await expect(decodeProductionEnvironmentImage(Uint8Array.from(exr).buffer, "hdr")).rejects.toThrow(/declared|format/i);
    await expect(decodeProductionEnvironmentImage(Uint8Array.from(radiance).buffer, "exr")).rejects.toThrow(/declared|header/i);
    await expect(decodeProductionEnvironmentImage(Uint8Array.from(exr).buffer, "png")).rejects.toThrow(/unsupported/i);
    const oversized = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4097 +X 4096\n");
    await expect(decodeProductionEnvironmentImage(oversized.buffer, "hdr")).rejects.toThrow(/limit|dimensions|exceed/i);
  });

  it("propagates an explicit unsupported-codec error through typed EXR decoding", async () => {
    const image = Uint8Array.from(exr);
    const attributePrefix = Buffer.from("compression\0compression\0\x01\0\0\0", "ascii");
    const attribute = Buffer.from(image).indexOf(attributePrefix);
    expect(attribute).toBeGreaterThan(0);
    expect(image[attribute + attributePrefix.length]).toBe(0);
    image[attribute + attributePrefix.length] = 10; // HTJ2K256, outside the implemented codec set.
    await expect(decodeProductionEnvironmentImage(image.buffer, "exr")).rejects.toThrow(/HTJ2K256.*unsupported/i);
  });

  it("retains complete typed illumination and reflection refs through scene compilation", () => {
    const illumination = typedEnvironment();
    const reflection = defineAuraAssets({ map: { type: "texture", format: "hdr", url: "https://site.test/reflection?revision=1" } }).map;
    const compiled = createProductionRuntimeEnvironment(scene().add(environments.hdri({
      texture: illumination, reflectionTexture: reflection, intensity: 1.5, rotation: 0.4
    })).toJSON());

    expect(compiled.hdriAsset).toEqual(illumination);
    expect(compiled.hdriReflectionAsset).toEqual(reflection);
    expect(compiled).toMatchObject({ hdriUrl: illumination.url, hdriReflectionUrl: reflection.url, hdriRotation: 0.4, intensity: 1.5 });
  });

  it("coalesces the PRD-02 typed EXR upgrade by request identity and owns its decoded texture", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(exr));
    vi.stubGlobal("fetch", fetch);
    const harness = probeHarness();
    const flags = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
    const options = {
      device: harness.device, cache: harness.cache, tier: "low" as const, flags,
      request: { maxBytes: exr.byteLength, referrerPolicy: "no-referrer" as const }
    };
    const resolution = typedResolution(typedEnvironment());
    const upgrades = vi.fn();
    try {
      // Probe diagnostics contain the URL, never private transport settings.
      expect(JSON.stringify(resolution)).not.toContain("x-environment-test");
      const first = bindPrd02EnvironmentProbe(resolution, { ...options, onUpgrade: upgrades });
      const second = bindPrd02EnvironmentProbe(resolution, { ...options, onUpgrade: upgrades });
      expect(first.probe.source).toBe("neutral");
      expect(second.probe).toBe(first.probe);
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(a).toBe(b);
      expect(upgrades).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(harness.fromEquirect).toHaveBeenCalledTimes(1);
      expect(harness.cache.refCount(a)).toBe(2);
      const init = fetch.mock.calls[0]![1];
      expect(init).toMatchObject({ credentials: "include", cache: "no-store", referrerPolicy: "no-referrer" });
      expect(new Headers(init?.headers).get("x-environment-test")).toBe("scene");
      const image = harness.images[0]!;
      expect(image).toMatchObject({ width: 64, height: 48, format: "rgba32f" });
      const pixels = image.data as Float32Array;
      expect(Array.from(pixels.slice(0, 4))).toEqual([0, 0, 0.25, 1]);
      expect(pixels[(image.height - 1) * image.width * 4 + 1]).toBeCloseTo(1.5, 3);
      harness.cache.release(a);
      harness.cache.release(b);
      expect(harness.cache.refCount(a)).toBe(0);
      expect(image.disposed).toBe(false);

      // A different digest must not reuse the prior successful cache entry.
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const failed = vi.fn();
      const wrongHash = bindPrd02EnvironmentProbe(typedResolution(typedEnvironment("0".repeat(64))), { ...options, onUpgradeFailed: failed });
      await expect(wrongHash.pending!).rejects.toThrow(/integrity|sha-?256/i);
      expect(failed).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.waitFor(() => expect(harness.fromEquirect).toHaveBeenCalledTimes(2));
    } finally { harness.dispose(); }
    expect(harness.images[0]?.disposed).toBe(true);
    expect(harness.probes[0]?.specularCube.disposed).toBe(true);
  });

  it("binds PRD-02 illumination SH/background and reflection cube under independent typed policies", async () => {
    const illumination = typedEnvironment();
    const reflection = typedReflection();
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === illumination.url) return new Response(exr);
      if (String(input) === reflection.url) return new Response(radiance);
      throw new Error(`Unexpected environment request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = probeHarness();
    const options = {
      device: harness.device, cache: harness.cache, tier: "low" as const,
      flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } }),
      request: { referrerPolicy: "no-referrer" as const }
    };
    const resolution = typedResolution(illumination, reflection);
    try {
      expect(JSON.stringify(resolution)).not.toMatch(/x-environment-test|x-reflection-test/);
      const first = bindPrd02EnvironmentProbe(resolution, options);
      const second = bindPrd02EnvironmentProbe(resolution, options);
      expect(first.probe.source).toBe("neutral");
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(a).toBe(b);
      expect(harness.cache.refCount(a)).toBe(2);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(harness.fromEquirect).toHaveBeenCalledTimes(2);
      const requestFor = (url: string) => fetch.mock.calls.find(([input]) => String(input) === url)?.[1];
      const illuminationRequest = requestFor(illumination.url);
      const reflectionRequest = requestFor(reflection.url);
      expect(illuminationRequest).toMatchObject({ credentials: "include", cache: "no-store", referrerPolicy: "no-referrer" });
      expect(reflectionRequest).toMatchObject({ credentials: "same-origin", cache: "reload", referrerPolicy: "no-referrer" });
      expect(new Headers(illuminationRequest?.headers).get("x-environment-test")).toBe("scene");
      expect(new Headers(illuminationRequest?.headers).has("x-reflection-test")).toBe(false);
      expect(new Headers(reflectionRequest?.headers).get("x-reflection-test")).toBe("mirror");
      expect(new Headers(reflectionRequest?.headers).has("x-environment-test")).toBe(false);
      const diffuse = harness.probes.find((probe) => probe.background?.width === 64)!;
      const specular = harness.probes.find((probe) => probe.background?.width === 1)!;
      expect(diffuse).toBeDefined();
      expect(specular).toBeDefined();
      expect(a.sh9).toEqual(diffuse.sh9);
      expect(a.background).toBe(diffuse.background);
      expect(a.specularCube).toBe(specular.specularCube);
      expect(a.sh9[0]).toBe(3);
      expect(specular.sh9[0]).toBe(7);
      harness.cache.release(a);
      harness.cache.release(b);
      expect(harness.cache.refCount(a)).toBe(0);
      expect(harness.images.every((image) => !image.disposed)).toBe(true);

      // Changing only the reflection integrity must not hit the old dual probe.
      const failed = bindPrd02EnvironmentProbe(typedResolution(illumination, typedReflection("0".repeat(64))), options);
      await expect(failed.pending!).rejects.toThrow(/integrity|sha-?256/i);
      expect(fetch.mock.calls.filter(([input]) => String(input) === reflection.url)).toHaveLength(2);
    } finally { harness.dispose(); }
    expect(harness.images.every((image) => image.disposed)).toBe(true);
    expect(harness.probes.every((probe) => probe.specularCube.disposed)).toBe(true);
  });

  it("cleans the first PRD-02 source if the second probe factory fails", async () => {
    const illumination = typedEnvironment();
    const reflection = typedReflection();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === illumination.url) return new Response(exr);
      if (String(input) === reflection.url) return new Response(radiance);
      throw new Error(`Unexpected environment request: ${String(input)}`);
    }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = probeHarness();
    const create = harness.fromEquirect.getMockImplementation()!;
    let failedImage: Texture | undefined;
    harness.fromEquirect.mockImplementation((image) => {
      if (harness.probes.length === 1) {
        failedImage = image;
        throw new Error("second probe factory failed");
      }
      return create(image);
    });
    try {
      const binding = bindPrd02EnvironmentProbe(typedResolution(illumination, reflection), {
        device: harness.device, cache: harness.cache, tier: "low",
        flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } })
      });
      await expect(binding.pending!).rejects.toThrow(/second probe factory failed/);
      expect(harness.probes).toHaveLength(1);
      expect(harness.images[0]?.disposed).toBe(true);
      expect(harness.probes[0]?.specularCube.disposed).toBe(true);
      expect(failedImage?.disposed).toBe(true);
      expect(harness.cache.residentCount).toBe(0);
    } finally { harness.dispose(); }
  });

  it("aborts the PRD-02 request before decoded pixels can reach a probe", async () => {
    let started!: () => void;
    let observedSignal: AbortSignal | undefined;
    const fetching = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      observedSignal = init?.signal ?? undefined;
      observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
      started();
    })));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = probeHarness();
    const controller = new AbortController();
    const failure = vi.fn();
    const upgrade = vi.fn();
    try {
      const binding = bindPrd02EnvironmentProbe(typedResolution(typedEnvironment()), {
        device: harness.device, cache: harness.cache, tier: "low",
        flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } }), signal: controller.signal,
        onUpgradeFailed: failure, onUpgrade: upgrade
      });
      await fetching;
      controller.abort(new Error("cancelled environment"));
      await expect(binding.pending!).rejects.toThrow(/cancelled environment|abort/i);
      expect(observedSignal?.aborted).toBe(true);
      expect(harness.fromEquirect).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      expect(upgrade).not.toHaveBeenCalled();
    } finally { controller.abort(); harness.dispose(); }
  });

  it("cancels a late PRD-02 response before decoding when its cache is disposed", async () => {
    let started!: () => void;
    let release!: (response: Response) => void;
    let observedSignal: AbortSignal | undefined;
    const fetching = new Promise<void>((resolve) => { started = resolve; });
    const response = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      started();
      return response;
    }));
    const cancelBody = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = vi.fn();
    const upgrade = vi.fn();
    const harness = probeHarness();
    try {
      const binding = bindPrd02EnvironmentProbe(typedResolution(typedEnvironment()), {
        device: harness.device, cache: harness.cache, tier: "low",
        flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } }),
        onUpgradeFailed: failure, onUpgrade: upgrade
      });
      await fetching;
      harness.cache.dispose();
      release(new Response(new ReadableStream({ cancel: cancelBody })));
      await expect(binding.pending!).rejects.toThrow("ENVIRONMENT_CACHE_DISPOSED");
      await until(() => expect(cancelBody).toHaveBeenCalledTimes(1));
      expect(observedSignal?.aborted).toBe(true);
      expect(harness.fromEquirect).not.toHaveBeenCalled();
      expect(harness.images).toHaveLength(0);
      expect(harness.cache.residentCount).toBe(0);
      expect(warning).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      expect(upgrade).not.toHaveBeenCalled();
    } finally { harness.dispose(); }
  });

  it("disposes a probe created while its PRD-02 cache is being disposed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(exr)));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = vi.fn();
    const upgrade = vi.fn();
    const harness = probeHarness();
    const create = harness.fromEquirect.getMockImplementation()!;
    harness.fromEquirect.mockImplementation((image) => {
      const probe = create(image);
      // A factory can synchronously trigger teardown after allocating the probe
      // but before returning it to the in-flight cache acquisition.
      harness.cache.dispose();
      return probe;
    });
    try {
      const binding = bindPrd02EnvironmentProbe(typedResolution(typedEnvironment()), {
        device: harness.device, cache: harness.cache, tier: "low",
        flags: resolveQrFlags({ options: { A3D_QR_LIGHTING: true } }),
        onUpgradeFailed: failure, onUpgrade: upgrade
      });
      await expect(binding.pending!).rejects.toThrow("ENVIRONMENT_CACHE_DISPOSED");
      await until(() => expect(harness.probes[0]?.specularCube.disposed).toBe(true));
      expect(harness.fromEquirect).toHaveBeenCalledTimes(1);
      expect(harness.images[0]?.disposed).toBe(true);
      expect(harness.cache.residentCount).toBe(0);
      expect(warning).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      expect(upgrade).not.toHaveBeenCalled();
    } finally { harness.dispose(); }
  });

  it("loads extensionless typed EXR bytes, swaps the mounted lighting, and disposes it", async () => {
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", fetch);
    const { sources } = captureRenderer();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(environments.hdri({ texture: typedEnvironment(), intensity: 1.25, rotation: 0.3 })).add(primitives.box()),
      autoStart: false, resize: false, strict: true, renderer: { backend: "webgl2" },
      qualityRebuild: { flags: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    let texture: Texture | null | undefined;
    try {
      await app.readyStrict();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(app.diagnostics().renderer?.environment).toMatchObject({ hdriStatus: "pending", iblPixelBacked: false });
      const [requested, init] = fetch.mock.calls[0]!;
      expect(String(requested)).toBe("https://site.test/lighting/sky?revision=7");
      expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
      expect(new Headers(init?.headers).get("x-environment-test")).toBe("scene");
      release(new Response(exr, { headers: { "content-type": "application/octet-stream" } }));
      await until(() => expect(app.diagnostics().renderer?.environment).toMatchObject({ hdriStatus: "ready", iblPixelBacked: true, dualProbe: false }));

      app.step(1 / 60);
      const lighting = sources.at(-1)?.environmentLighting;
      expect(lighting && typeof lighting === "object").toBe(true);
      if (!lighting || typeof lighting !== "object") throw new Error("expected sampled environment lighting");
      texture = lighting.environmentCubeMapTexture?.texture;
      expect(texture?.dimension).toBe("cube");
      expect(texture?.format).toBe("rgba16f");
      expect(texture?.cubeFaces).toHaveLength(6);
      const poleGreen = (face: "py" | "ny") => {
        const mip = texture?.cubeFaces.find((candidate) => candidate.face === face)?.mipLevels[0];
        if (!mip || !(mip.data instanceof Uint16Array)) throw new Error(`missing ${face} HDR cube pixels`);
        const center = Math.floor(mip.width / 2);
        return halfToFloat(mip.data[(center * mip.width + center) * 4 + 1]!);
      };
      expect(poleGreen("py")).toBeLessThan(0.1);
      expect(poleGreen("ny")).toBeGreaterThan(1.4);
      expect(lighting.environmentMapIntensity).toBe(1.25);
      expect(lighting.environmentMapRotation).toBe(0.3);
      const maximum = app.diagnostics().renderer?.environment?.evidence.match(/maxLinear\s+([\d.e+-]+)/)?.[1];
      expect(Number(maximum)).toBeGreaterThan(1);
      app.step(1 / 60);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(texture?.disposed).toBe(false);
    } finally {
      app.dispose();
      await app.disposeAsync();
    }
    expect(texture?.disposed).toBe(true);
  }, 30_000);

  it("keeps fallback lighting and reports integrity failures without claiming a loaded EXR", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(exr)));
    captureRenderer();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(environments.hdri({ texture: typedEnvironment("0".repeat(64)) })).add(primitives.box()),
      autoStart: false, resize: false, strict: true, renderer: { backend: "webgl2" },
      qualityRebuild: { flags: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    try {
      await app.readyStrict();
      await until(() => expect(app.diagnostics().renderer?.environment).toMatchObject({ hdriStatus: "fallback", iblPixelBacked: false }));
      expect(app.diagnostics().renderer?.runtime.warnings.join(" ")).toMatch(/HDRI upgrade failed.*SHA-256 integrity mismatch/i);
    } finally { app.dispose(); await app.disposeAsync(); }
  });

  it("builds a dual probe from typed EXR illumination and Radiance reflection", async () => {
    const reflection = defineAuraAssets({ map: {
      type: "texture", format: "hdr", url: "https://site.test/lighting/reflection?version=1",
      integrity: { version: 1, digest: createHash("sha256").update(radiance).digest("hex") }
    } }).map;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === typedEnvironment().url) return new Response(exr);
      if (url === reflection.url) return new Response(radiance);
      throw new Error(`Unexpected environment request: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const result = await upgradeProductionEnvironmentHdri(typedEnvironment(), 0.8, reflection, 0.5);
    const cube = result.lighting.environmentCubeMapTexture?.texture;
    const map = result.lighting.environmentMapTexture?.texture;
    try {
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([typedEnvironment().url, reflection.url]);
      expect(result).toMatchObject({ dualProbe: true, specularMipCount: expect.any(Number) });
      expect(result.maxLinearValue).toBeGreaterThan(1);
      expect(result.lighting.environmentMapRotation).toBe(0.5);
      expect(cube?.cubeFaces).toHaveLength(6);
      expect(map).toMatchObject({ width: 1, height: 2 });
      expect(cube?.disposed).toBe(false);
      expect(map?.disposed).toBe(false);
    } finally { result.dispose(); }
    expect(cube?.disposed).toBe(true);
    expect(map?.disposed).toBe(true);
  }, 30_000);

  it("aborts an in-flight typed request when its owning app is disposed", async () => {
    let observedSignal: AbortSignal | undefined;
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      observedSignal = init?.signal ?? undefined;
      observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    captureRenderer();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(environments.hdri({ texture: typedEnvironment() })).add(primitives.box()),
      autoStart: false, resize: false, strict: true, renderer: { backend: "webgl2" },
      qualityRebuild: { flags: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false, A3D_QR_CORE: false, A3D_QR_POST: false } }
    });
    try {
      await app.readyStrict();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(false);
    } finally { app.dispose(); await app.disposeAsync(); }
    expect(observedSignal?.aborted).toBe(true);
  });
});

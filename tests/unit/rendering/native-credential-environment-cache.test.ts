import { Buffer } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRequestOptions } from "../../../packages/assets/src/AssetLoader";
import { bindPrd02EnvironmentProbe, explicitEnvironmentResolution } from "../../../packages/engine/src/agent-api/compiler/environment";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraEnvironmentSourceResolution } from "../../../packages/engine/src/contracts/environment";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraEnvironmentNodeV2 } from "../../../packages/engine/src/agent-api/nodes/environments";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { environmentProbeFactorySlot, type EnvironmentProbe, type EnvironmentProbeFactory } from "../../../packages/rendering/src/contracts/environment";
import { EnvironmentCache, type EnvironmentCacheKey } from "../../../packages/rendering/src/environment/EnvironmentCache";

const url = "https://environment.test/probe.hdr";
const tier = "high" as const;
const flags = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** A single linear RGBE texel; differing red bytes make stale reuse visible. */
function hdr(red: number): Uint8Array {
  return new Uint8Array(Buffer.concat([
    Buffer.from("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n", "ascii"),
    Buffer.from([red, 0, 0, 129])
  ]));
}

/** Independent black single-mip probe container and finite SH coefficients. */
function presetFixture() {
  const payloadBytes = 6 * 128 * 128 * 4;
  const cube = new Uint8Array(92 + payloadBytes);
  cube.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(cube.buffer);
  view.setUint32(12, 142, true);
  view.setUint32(16, 4, true);
  view.setUint32(20, 128, true);
  view.setUint32(24, 128, true);
  view.setUint32(36, 6, true);
  view.setUint32(40, 1, true);
  view.setBigUint64(68, 92n, true);
  view.setBigUint64(76, BigInt(payloadBytes), true);
  view.setBigUint64(84, BigInt(payloadBytes), true);
  const sh9 = new Uint8Array(27 * 4);
  const shView = new DataView(sh9.buffer);
  shView.setFloat32(0, 0.75, true);
  shView.setFloat32(4, -1.25, true);
  const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const names = {
    manifest: "/aura-environments/studio.manifest.json",
    cube: "/aura-environments/studio.specular.ktx2",
    sh9: "/aura-environments/studio.sh9.f32"
  } as const;
  const manifest = new TextEncoder().encode(JSON.stringify({
    name: "studio", faceSize: 128, mipCount: 1,
    specular: "studio.specular.ktx2", sh9: "studio.sh9.f32",
    sha256: { specular: sha256(cube), sh9: sha256(sh9) }
  }));
  const request: AssetRequestOptions = {
    credentials: "include", cache: "no-store", headers: { "x-environment-policy": "preset" },
    allowedOrigins: ["https://environment.test"], securityContext: "generation-a", maxBytes: 1024 * 1024,
    integrity: {
      version: 1, digest: sha256(manifest), requireDependencies: true,
      dependencies: { "studio.specular.ktx2": sha256(cube), "studio.sh9.f32": sha256(sh9) }
    }
  };
  return { names, manifest, cube, sh9, request };
}

const presetResolution: AuraEnvironmentSourceResolution = {
  kind: "explicit", probe: { preset: "studio" }, intensity: 1, diffuseIntensity: 1,
  specularIntensity: 1, rotation: 0, background: false, ambient: null
};

const neutralResolution: AuraEnvironmentSourceResolution = {
  ...presetResolution, probe: "neutral"
};

function mockProbe(background: Texture | null = null): EnvironmentProbe {
  const cube = new Texture({ width: 1, height: 1 });
  return {
    kind: "environment-probe", source: "hdri", specularCube: cube, mipCount: 1,
    faceSize: 128, sh9: new Float32Array(27), shTexture: null, background,
    dispose() { background?.dispose(); cube.dispose(); }
  };
}

function harness() {
  const device = new MockRenderDevice();
  const images: Texture[] = [];
  const fromEquirect = vi.fn((image: Texture): EnvironmentProbe => {
    images.push(image);
    return mockProbe(image);
  });
  const unexpected = () => { throw new Error("Unexpected probe factory call"); };
  const factory: EnvironmentProbeFactory = { fromEquirect, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
  vi.spyOn(environmentProbeFactorySlot, "get").mockReturnValue(() => factory);
  const cache = new EnvironmentCache(device, factory);
  const asset = defineAuraAssets({ probe: { type: "texture", format: "hdr", url } }).probe;
  const resolution = explicitEnvironmentResolution({ kind: "environment", environment: "hdri", texture: asset } as AuraEnvironmentNodeV2, null);
  if (!resolution) throw new Error("Expected typed environment resolution");
  return {
    device, cache, images, fromEquirect, resolution,
    bind(request: AssetRequestOptions = {}, signal?: AbortSignal) {
      return bindPrd02EnvironmentProbe(resolution!, { device, cache, tier, flags, request, signal });
    },
    dispose() { cache.dispose(); device.dispose(); }
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("location", { href: "https://environment.test/", origin: "https://environment.test" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("credential-scoped environment probes", () => {
  it.each([
    ["implicit same-origin", {}],
    ["same-origin", { credentials: "same-origin" as const }],
    ["include", { credentials: "include" as const }]
  ] as const)("does not share or retain an unscoped %s network probe", async (_name, request) => {
    let sequence = 0;
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(hdr(++sequence === 1 ? 128 : 64)));
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    try {
      const first = h.bind(request), second = h.bind(request);
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(a).not.toBe(b);
      expect(h.cache.refCount(a)).toBe(1);
      expect(h.cache.refCount(b)).toBe(1);
      expect(h.images.map((image) => (image.data as Float32Array)[0]).sort()).toEqual([0.5, 1]);

      h.cache.release(a);
      expect(a.specularCube.disposed).toBe(true);
      expect(a.background?.disposed).toBe(true);
      expect(b.specularCube.disposed).toBe(false);
      h.cache.release(b);
      expect(b.specularCube.disposed).toBe(true);
      expect(b.background?.disposed).toBe(true);
      expect(h.cache.residentCount).toBe(0);

      const third = await h.bind(request).pending!;
      expect(third).not.toBe(a);
      expect(third).not.toBe(b);
      expect(fetch).toHaveBeenCalledTimes(3);
      h.cache.release(third);
      expect(third.specularCube.disposed).toBe(true);
    } finally { h.dispose(); }
  });

  it.each(["", "  "])("rejects an empty credential generation before fetching", async (securityContext) => {
    const fetch = vi.fn(async () => new Response(hdr(128)));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    try {
      const binding = h.bind({ credentials: "include", securityContext });
      await expect(binding.pending!).rejects.toThrow(/securityContext.*non-empty/i);
      expect(fetch).not.toHaveBeenCalled();
      expect(h.fromEquirect).not.toHaveBeenCalled();
      expect(h.cache.residentCount).toBe(0);
    } finally { h.dispose(); }
  });

  it.each([
    ["credentials omitted", { credentials: "omit" as const }],
    ["stable credential generation", { credentials: "include" as const, securityContext: "generation-a" }]
  ] as const)("coalesces and can reuse %s with the same effective policy", async (_name, request) => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(hdr(128)));
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    try {
      const first = h.bind(request), second = h.bind(request);
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(h.cache.refCount(a)).toBe(2);
      expect(fetch.mock.calls[0]![1]).not.toHaveProperty("securityContext");
      h.cache.release(a);
      expect(b.specularCube.disposed).toBe(false);
      h.cache.release(b);
      expect(h.cache.refCount(a)).toBe(0);
      expect(a.specularCube.disposed).toBe(false);
      const again = await h.bind(request).pending!;
      expect(again).toBe(a);
      expect(fetch).toHaveBeenCalledTimes(1);
      h.cache.release(again);
    } finally { h.dispose(); }
    expect(h.images[0]?.disposed).toBe(true);
  });

  it("selects a new probe when the credential generation changes on rebind", async () => {
    let sequence = 0;
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(hdr(++sequence === 1 ? 128 : 64)));
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    const request = { credentials: "include" as const, securityContext: "generation-a" };
    try {
      const a = await h.bind(request).pending!;
      expect((a.background?.data as Float32Array)[0]).toBe(1);
      request.securityContext = "generation-b";
      const b = await h.bind(request).pending!;
      expect((b.background?.data as Float32Array)[0]).toBe(0.5);
      expect(b).not.toBe(a);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(h.resolution)).not.toContain("generation-");
      expect(fetch.mock.calls.every(([, init]) => !Object.prototype.hasOwnProperty.call(init ?? {}, "securityContext"))).toBe(true);
      h.cache.release(a);
      h.cache.release(b);
    } finally { h.dispose(); }
  });

  it("disables reuse even for anonymous or scoped requests when secure identity is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    const fetch = vi.fn(async () => new Response(hdr(128)));
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    try {
      for (const request of [
        { credentials: "omit" as const },
        { credentials: "include" as const, securityContext: "generation-a" }
      ]) {
        const [a, b] = await Promise.all([h.bind(request).pending!, h.bind(request).pending!]);
        expect(a).not.toBe(b);
        h.cache.release(a);
        h.cache.release(b);
        expect(a.specularCube.disposed).toBe(true);
        expect(b.specularCube.disposed).toBe(true);
      }
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(h.cache.residentCount).toBe(0);
    } finally { h.dispose(); }
  });

  it("keeps direct network acquisitions unshared by default and shares an explicit opaque identity", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const loader = vi.fn(async (_key: EnvironmentCacheKey) => mockProbe());
    const cache = new EnvironmentCache(device, factory, loader);
    try {
      const key = { url, tier };
      const [a, b] = await Promise.all([cache.acquire(key), cache.acquire(key)]);
      expect(a).not.toBe(b);
      expect(loader).toHaveBeenCalledTimes(2);
      cache.release(a);
      cache.release(b);
      expect(a.specularCube.disposed).toBe(true);
      expect(b.specularCube.disposed).toBe(true);
      expect(cache.residentCount).toBe(0);

      const scoped = { url, tier, identity: { key: "opaque-example", reusable: true } };
      const [c, d] = await Promise.all([cache.acquire(scoped), cache.acquire(scoped)]);
      expect(c).toBe(d);
      expect(loader).toHaveBeenCalledTimes(3);
      expect(cache.refCount(c)).toBe(2);
      cache.release(c);
      cache.release(d);
      expect(c.specularCube.disposed).toBe(false);
      expect(await cache.acquire(scoped)).toBe(c);
      cache.release(c);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("keeps the embedded neutral probe separate from network URL and preset keys", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const loader = vi.fn(async (_key: EnvironmentCacheKey) => mockProbe());
    const cache = new EnvironmentCache(device, factory, loader);
    try {
      const floorA = cache.neutral(tier), floorB = cache.neutral(tier);
      expect(floorA).toBe(floorB);
      const embeddedKey = { preset: "neutral", tier };
      const [embeddedA, embeddedB] = await Promise.all([cache.acquire(embeddedKey), cache.acquire(embeddedKey)]);
      expect(embeddedA).toBe(embeddedB);
      expect(loader).toHaveBeenCalledTimes(1);
      cache.release(embeddedA);
      cache.release(embeddedB);

      // This URL string used to collide with the embedded preset's cache key.
      const network = await cache.acquire({ url: "preset:neutral", tier });
      expect(network).not.toBe(embeddedA);
      cache.release(network);
      expect(network.specularCube.disposed).toBe(true);
      expect(embeddedA.specularCube.disposed).toBe(false);
      const [presetA, presetB] = await Promise.all([
        cache.acquire({ preset: "studio", tier }), cache.acquire({ preset: "studio", tier })
      ]);
      expect(presetA).not.toBe(presetB);
      cache.release(presetA);
      cache.release(presetB);
      expect(presetA.specularCube.disposed).toBe(true);
      expect(presetB.specularCube.disposed).toBe(true);
      expect(cache.neutral(tier)).toBe(floorA);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("passes the scoped app policy and separate digests to all preset resources", async () => {
    const data = presetFixture();
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === data.names.manifest) return new Response(data.manifest);
      if (String(input) === data.names.cube) return new Response(data.cube);
      if (String(input) === data.names.sh9) return new Response(data.sh9);
      throw new Error(`Unexpected preset resource ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    try {
      const options = { device: h.device, cache: h.cache, tier, flags, request: data.request };
      const first = bindPrd02EnvironmentProbe(presetResolution, options);
      const second = bindPrd02EnvironmentProbe(presetResolution, options);
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(a).toBe(b);
      expect(a.source).toBe("preset");
      expect(Array.from(a.sh9.subarray(0, 2))).toEqual([0.75, -1.25]);
      expect(h.cache.refCount(a)).toBe(2);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls.map(([input]) => String(input)).sort()).toEqual(Object.values(data.names).sort());
      for (const [, init] of fetch.mock.calls) {
        expect(init).toMatchObject({ credentials: "include", cache: "no-store", redirect: "error" });
        expect(new Headers(init?.headers).get("x-environment-policy")).toBe("preset");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init).not.toHaveProperty("securityContext");
      }
      h.cache.release(a);
      h.cache.release(b);
      expect(a.specularCube.disposed).toBe(false);
      const reused = await bindPrd02EnvironmentProbe(presetResolution, options).pending!;
      expect(reused).toBe(a);
      expect(fetch).toHaveBeenCalledTimes(3);
      h.cache.release(reused);
    } finally { h.dispose(); }
  });

  it.each(["manifest", "cube", "sh9"] as const)("rejects a mismatched preset %s digest", async (resource) => {
    const data = presetFixture();
    const integrity = data.request.integrity!;
    const invalid = "0".repeat(64);
    const request: AssetRequestOptions = {
      ...data.request,
      integrity: {
        ...integrity,
        digest: resource === "manifest" ? invalid : integrity.digest,
        dependencies: {
          ...integrity.dependencies,
          ...(resource === "cube" ? { "studio.specular.ktx2": invalid } : {}),
          ...(resource === "sh9" ? { "studio.sh9.f32": invalid } : {})
        }
      }
    };
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === data.names.manifest) return new Response(data.manifest);
      if (String(input) === data.names.cube) return new Response(data.cube);
      if (String(input) === data.names.sh9) return new Response(data.sh9);
      throw new Error(`Unexpected preset resource ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    try {
      const binding = bindPrd02EnvironmentProbe(presetResolution, {
        device: h.device, cache: h.cache, tier, flags, request
      });
      await expect(binding.pending!).rejects.toThrow(/SHA-256 integrity mismatch/i);
      expect(h.cache.residentCount).toBe(0);
      if (resource === "manifest") expect(fetch).toHaveBeenCalledTimes(1);
      else expect(fetch).toHaveBeenCalledTimes(3);
    } finally { h.dispose(); }
  });

  it("enforces the app's preset byte limit before loading dependencies", async () => {
    const data = presetFixture();
    const fetch = vi.fn(async () => new Response(data.manifest));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    try {
      const binding = bindPrd02EnvironmentProbe(presetResolution, {
        device: h.device, cache: h.cache, tier, flags,
        request: { ...data.request, maxBytes: data.manifest.byteLength - 1 }
      });
      await expect(binding.pending!).rejects.toThrow(/maxBytes|too large|exceeds|limit/i);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(h.cache.residentCount).toBe(0);
    } finally { h.dispose(); }
  });

  it("enforces the SH payload limit separately from the larger app limit", async () => {
    const data = presetFixture();
    const oversizedSh9 = new Uint8Array(data.sh9.length + 1);
    oversizedSh9.set(data.sh9);
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === data.names.manifest) return new Response(data.manifest);
      if (String(input) === data.names.cube) return new Response(data.cube);
      if (String(input) === data.names.sh9) return new Response(oversizedSh9, { headers: { "content-length": String(oversizedSh9.length) } });
      throw new Error(`Unexpected preset resource ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    try {
      const binding = bindPrd02EnvironmentProbe(presetResolution, {
        device: h.device, cache: h.cache, tier, flags, request: data.request
      });
      await expect(binding.pending!).rejects.toThrow(/maxBytes|too large|exceeds|limit/i);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(h.cache.residentCount).toBe(0);
    } finally { h.dispose(); }
  });

  it("cancels both pending preset payloads through the app-owned binding", async () => {
    const data = presetFixture();
    const cubeResponse = deferred<Response>(), sh9Response = deferred<Response>();
    const fetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      if (String(input) === data.names.manifest) return Promise.resolve(new Response(data.manifest));
      if (String(input) === data.names.cube) return cubeResponse.promise;
      if (String(input) === data.names.sh9) return sh9Response.promise;
      return Promise.reject(new Error(`Unexpected preset resource ${String(input)}`));
    });
    vi.stubGlobal("fetch", fetch);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness(), controller = new AbortController();
    const failed = vi.fn(), upgraded = vi.fn();
    try {
      const binding = bindPrd02EnvironmentProbe(presetResolution, {
        device: h.device, cache: h.cache, tier, flags, request: data.request, signal: controller.signal,
        onUpgradeFailed: failed, onUpgrade: upgraded
      });
      const rejection = expect(binding.pending!).rejects.toThrow(/preset cancelled|abort/i);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
      const inits = fetch.mock.calls.map(([, init]) => init);
      for (const init of inits) {
        expect(init?.credentials).toBe("include");
        expect(new Headers(init?.headers).get("x-environment-policy")).toBe("preset");
      }
      controller.abort(new Error("preset cancelled"));
      await rejection;
      for (const init of inits) expect(init?.signal?.aborted).toBe(true);
      cubeResponse.resolve(new Response(data.cube));
      sh9Response.resolve(new Response(data.sh9));
      expect(h.cache.residentCount).toBe(0);
      expect(warning).not.toHaveBeenCalled();
      expect(failed).not.toHaveBeenCalled();
      expect(upgraded).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      cubeResponse.resolve(new Response(data.cube));
      sh9Response.resolve(new Response(data.sh9));
      h.dispose();
    }
  });

  it("uses the embedded neutral source without fetching even under app credentials", async () => {
    const data = presetFixture();
    const fetch = vi.fn(async () => { throw new Error("Neutral must remain local"); });
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    try {
      const options = { device: h.device, cache: h.cache, tier, flags, request: data.request };
      const first = bindPrd02EnvironmentProbe(neutralResolution, options);
      const second = bindPrd02EnvironmentProbe(neutralResolution, options);
      expect(first.probe).toBe(second.probe);
      const [a, b] = await Promise.all([first.pending!, second.pending!]);
      expect(a).toBe(b);
      expect(fetch).not.toHaveBeenCalled();
      h.cache.release(a);
      h.cache.release(b);
    } finally { h.dispose(); }
  });

  it("cleans each late unshared probe if disposal races pending network loads", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const firstLoad = deferred<EnvironmentProbe>(), secondLoad = deferred<EnvironmentProbe>();
    const loader = vi.fn().mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise);
    const cache = new EnvironmentCache(device, factory, loader);
    const first = cache.acquire({ url, tier }), second = cache.acquire({ url, tier });
    const rejections = Promise.all([
      expect(first).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/),
      expect(second).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/)
    ]);
    const a = mockProbe(), b = mockProbe();
    try {
      expect(loader).toHaveBeenCalledTimes(2);
      cache.dispose();
      firstLoad.resolve(a);
      secondLoad.resolve(b);
      await rejections;
      expect(a.specularCube.disposed).toBe(true);
      expect(b.specularCube.disposed).toBe(true);
      expect(cache.residentCount).toBe(0);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("removes a failed shared acquisition and permits a fresh retry", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const failedLoad = deferred<EnvironmentProbe>();
    const probe = mockProbe();
    const loader = vi.fn().mockReturnValueOnce(failedLoad.promise).mockResolvedValueOnce(probe);
    const cache = new EnvironmentCache(device, factory, loader);
    const key = { url, tier, identity: { key: "opaque-retry", reusable: true } };
    const first = cache.acquire(key), second = cache.acquire(key);
    const rejections = Promise.all([
      expect(first).rejects.toThrow("environment load failed"),
      expect(second).rejects.toThrow("environment load failed")
    ]);
    try {
      expect(loader).toHaveBeenCalledTimes(1);
      failedLoad.reject(new Error("environment load failed"));
      await rejections;
      expect(cache.residentCount).toBe(0);
      expect(await cache.acquire(key)).toBe(probe);
      expect(loader).toHaveBeenCalledTimes(2);
      cache.release(probe);
    } finally { cache.dispose(); device.dispose(); }
    expect(probe.specularCube.disposed).toBe(true);
  });

  it("keeps a shared cache load alive when one subscriber cancels", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const pending = deferred<EnvironmentProbe>();
    let producerSignal: AbortSignal | undefined;
    const loader = vi.fn((_key: EnvironmentCacheKey, signal?: AbortSignal) => {
      producerSignal = signal;
      return pending.promise;
    });
    const cache = new EnvironmentCache(device, factory, loader);
    const key = { url, tier, identity: { key: "opaque-shared", reusable: true } };
    const firstController = new AbortController(), secondController = new AbortController();
    const first = cache.acquire(key, undefined, firstController.signal);
    const second = cache.acquire(key, undefined, secondController.signal);
    const rejected = expect(first).rejects.toThrow(/first cancelled|abort/i);
    const probe = mockProbe();
    try {
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      expect(producerSignal).toBeInstanceOf(AbortSignal);
      firstController.abort(new Error("first cancelled"));
      await rejected;
      expect(producerSignal?.aborted).toBe(false);
      pending.resolve(probe);
      expect(await second).toBe(probe);
      expect(cache.refCount(probe)).toBe(1);
      expect(probe.specularCube.disposed).toBe(false);
      cache.release(probe);
    } finally { cache.dispose(); device.dispose(); }
    expect(probe.specularCube.disposed).toBe(true);
  });

  it("aborts a shared producer after its last waiter cancels and disposes a late result", async () => {
    const device = new MockRenderDevice();
    const unexpected = () => { throw new Error("Unexpected factory call"); };
    const factory: EnvironmentProbeFactory = { fromEquirect: unexpected, fromCube: unexpected, fromScene: unexpected, neutral: unexpected };
    const pending = deferred<EnvironmentProbe>();
    let producerSignal: AbortSignal | undefined;
    const loader = vi.fn((_key: EnvironmentCacheKey, signal?: AbortSignal) => {
      producerSignal = signal;
      return pending.promise;
    });
    const cache = new EnvironmentCache(device, factory, loader);
    const key = { url, tier, identity: { key: "opaque-shared", reusable: true } };
    const firstController = new AbortController(), secondController = new AbortController();
    const first = cache.acquire(key, undefined, firstController.signal);
    const second = cache.acquire(key, undefined, secondController.signal);
    const rejected = Promise.all([
      expect(first).rejects.toThrow(/first cancelled|abort/i),
      expect(second).rejects.toThrow(/second cancelled|abort/i)
    ]);
    const probe = mockProbe();
    try {
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      firstController.abort(new Error("first cancelled"));
      expect(producerSignal?.aborted).toBe(false);
      secondController.abort(new Error("second cancelled"));
      await rejected;
      expect(producerSignal?.aborted).toBe(true);
      pending.resolve(probe); // The provider ignores its signal and completes late.
      await vi.waitFor(() => expect(probe.specularCube.disposed).toBe(true));
      expect(cache.residentCount).toBe(0);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("does not let one scoped typed binding abort another binding's fetch", async () => {
    const pending = deferred<Response>();
    let fetchSignal: AbortSignal | undefined;
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetch);
    const h = harness();
    const acquire = vi.spyOn(h.cache, "acquire");
    const firstController = new AbortController(), secondController = new AbortController();
    const request = { credentials: "include" as const, securityContext: "generation-a" };
    const first = h.bind(request, firstController.signal);
    const second = h.bind(request, secondController.signal);
    const rejected = expect(first.pending!).rejects.toThrow(/first cancelled|abort/i);
    try {
      await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetchSignal).toBeInstanceOf(AbortSignal);
      firstController.abort(new Error("first cancelled"));
      await rejected;
      expect(fetchSignal?.aborted).toBe(false);
      pending.resolve(new Response(hdr(128)));
      const probe = await second.pending!;
      expect(h.fromEquirect).toHaveBeenCalledTimes(1);
      expect(h.cache.refCount(probe)).toBe(1);
      expect(probe.specularCube.disposed).toBe(false);
      h.cache.release(probe);
    } finally { firstController.abort(); secondController.abort(); h.dispose(); }
    expect(h.images[0]?.disposed).toBe(true);
  });
});

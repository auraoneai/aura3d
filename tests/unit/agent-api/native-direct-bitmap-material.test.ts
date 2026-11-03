import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import { defineAuraAssets, material, primitives } from "../../../packages/engine/src/public/index";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import {
  identifyPreparedBitmapAssetLoad,
  matchesPreparedBitmapAssetLoad,
  prepareBitmapAssetLoad,
  startBitmapAssetLoad
} from "../../../packages/engine/src/agent-api/compiler/bitmapAsset";
import {
  isPreparedProductionPrimitiveTextureWorkCurrent,
  prepareProductionPrimitiveTextureWork,
  upgradeProductionPrimitiveTextures
} from "../../../packages/engine/src/agent-api/compiler/textures";

const URL = "https://assets.example.test/image?token=private-value";
const bytes = Uint8Array.of(7, 11, 13, 17);
const digest = createHash("sha256").update(bytes).digest("hex");

function asset(request?: AssetRequestOptions, hash: string | undefined = `sha256-${digest}`): AuraAssetRef<"texture"> {
  return defineAuraAssets({ image: { type: "texture", format: "png", url: URL,
    ...(hash === undefined ? {} : { hash }), ...(request === undefined ? {} : { request }) } }).image;
}

function response(data = bytes, type = "image/png"): Response {
  return new Response(Uint8Array.from(data).buffer, { headers: { "content-type": type } });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeBitmap(width = 2, height = 2) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function observe(promise: Promise<void>): { settled: boolean } {
  const result = { settled: false };
  void promise.then(() => { result.settled = true; });
  return result;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => fakeBitmap()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("typed bitmap asset policy", () => {
  it("snapshots asset and app policy and verifies bytes before decoding the original MIME type", async () => {
    const origins = ["https://assets.example.test"];
    const headers = new Headers({ "x-snapshot": "before" });
    const input = asset({ credentials: "include", allowedOrigins: origins, maxBytes: 32, securityContext: "asset-generation" });
    const appRequest = { headers, allowedOrigins: [...origins], maxBytes: bytes.length, securityContext: "app-generation" };
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(bytes, "image/svg+xml"));
    const decode = vi.fn(async (_blob: Blob) => fakeBitmap());
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("createImageBitmap", decode);
    const plan = prepareBitmapAssetLoad(input, appRequest, 16);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Reflect.ownKeys(plan)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    headers.set("x-snapshot", "after");
    origins[0] = "https://other.example.test";
    appRequest.allowedOrigins[0] = "https://other.example.test";
    appRequest.maxBytes = 0;
    const started = startBitmapAssetLoad(plan);
    const bitmap = await started.result;
    await started.settled;
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(init?.credentials).toBe("include");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("x-snapshot")).toBe("before");
    expect(JSON.stringify(init)).not.toContain("generation");
    expect(decode.mock.calls[0]![0].type).toBe("image/svg+xml");
    bitmap.close();
  });

  it("fails closed for mismatched or conflicting declared hashes before decode", async () => {
    const decode = vi.mocked(createImageBitmap);
    const wrong = asset({}, "sha256-" + "0".repeat(64));
    const started = startBitmapAssetLoad(prepareBitmapAssetLoad(wrong));
    await expect(started.result).rejects.toMatchObject({ name: "AssetIntegrityError" });
    await started.settled;
    expect(decode).not.toHaveBeenCalled();
    expect(() => prepareBitmapAssetLoad(asset({}, "not-a-sha256"))).toThrow(/SHA-256/);
    const conflict = asset() as unknown as { sha256?: string };
    conflict.sha256 = "0".repeat(64);
    expect(() => prepareBitmapAssetLoad(conflict as AuraAssetRef<"texture">)).toThrow(/conflicting/i);
  });

  it("enforces origin, final URL and byte limits without decoding rejected responses", async () => {
    const decode = vi.mocked(createImageBitmap);
    const fetch = vi.mocked(globalThis.fetch);
    const denied = startBitmapAssetLoad(prepareBitmapAssetLoad(asset({ allowedOrigins: ["https://other.example.test"] })));
    await expect(denied.result).rejects.toMatchObject({ name: "AssetPolicyError" });
    await denied.settled;
    expect(fetch).not.toHaveBeenCalled();
    const wrongUrl = startBitmapAssetLoad(prepareBitmapAssetLoad(asset({ expectedUrl: "https://assets.example.test/other" })));
    await expect(wrongUrl.result).rejects.toMatchObject({ name: "AssetPolicyError" });
    await wrongUrl.settled;
    const tooLarge = startBitmapAssetLoad(prepareBitmapAssetLoad(asset({ maxBytes: 1 })));
    await expect(tooLarge.result).rejects.toMatchObject({ name: "AssetSizeError" });
    await tooLarge.settled;
    expect(decode).not.toHaveBeenCalled();
  });

  it("detects mutated ref policy and returns opaque, credential-scoped identities", async () => {
    const first = asset({ credentials: "include", securityContext: "private-generation-1" });
    const firstPlan = prepareBitmapAssetLoad(first);
    const samePlan = prepareBitmapAssetLoad(asset({ credentials: "include", securityContext: "private-generation-1" }));
    const otherPlan = prepareBitmapAssetLoad(asset({ credentials: "include", securityContext: "private-generation-2" }));
    const [one, same, other] = await Promise.all([firstPlan, samePlan, otherPlan].map(identifyPreparedBitmapAssetLoad));
    expect(one.reusable).toBe(true);
    expect(one.key).toBe(same.key);
    expect(one.key).not.toBe(other.key);
    expect(one.key).not.toContain("private-generation");
    expect(one.key).not.toContain("private-value");
    (first.request as { securityContext?: string }).securityContext = "private-generation-2";
    expect(matchesPreparedBitmapAssetLoad(firstPlan, first)).toBe(false);
    const unsafe = await identifyPreparedBitmapAssetLoad(prepareBitmapAssetLoad(asset()));
    expect(unsafe.reusable).toBe(false);
    for (const cache of ["no-store", "reload", "no-cache"] as const) {
      const identity = await identifyPreparedBitmapAssetLoad(prepareBitmapAssetLoad(asset({ credentials: "omit", cache })));
      expect(identity.reusable).toBe(false);
    }
  });

  it("rejects cancellation promptly but holds settlement through late response cancellation", async () => {
    const responseWait = deferred<Response>();
    const cancelWait = deferred<void>();
    const cancel = vi.fn(() => cancelWait.promise);
    vi.stubGlobal("fetch", vi.fn(() => responseWait.promise));
    const controller = new AbortController();
    const started = startBitmapAssetLoad(prepareBitmapAssetLoad(asset()), controller.signal);
    const observed = observe(started.settled);
    controller.abort();
    await expect(started.result).rejects.toMatchObject({ name: "AbortError" });
    expect(observed.settled).toBe(false);
    responseWait.resolve({ body: { locked: false, cancel } } as unknown as Response);
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    cancelWait.resolve();
    await started.settled;
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("closes an aborted late decode and holds settlement until that close", async () => {
    const pending = deferred<ImageBitmap>();
    const decoding = deferred<void>();
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decoding.resolve(); return pending.promise; }));
    const controller = new AbortController();
    const started = startBitmapAssetLoad(prepareBitmapAssetLoad(asset()), controller.signal);
    const observed = observe(started.settled);
    await decoding.promise;
    controller.abort();
    await expect(started.result).rejects.toMatchObject({ name: "AbortError" });
    expect(observed.settled).toBe(false);
    const bitmap = fakeBitmap();
    pending.resolve(bitmap);
    await started.settled;
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("closes a decoded image that exceeds the dimension cap", async () => {
    const bitmap = fakeBitmap(8, 8);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const started = startBitmapAssetLoad(prepareBitmapAssetLoad(asset(), undefined, 4));
    await expect(started.result).rejects.toThrow();
    await started.settled;
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized PNG header before invoking the browser decoder", async () => {
    const header = new Uint8Array(24);
    header.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    header.set([73, 72, 68, 82], 12);
    new DataView(header.buffer).setUint32(16, 1000);
    new DataView(header.buffer).setUint32(20, 1);
    const hash = createHash("sha256").update(header).digest("hex");
    vi.stubGlobal("fetch", vi.fn(async () => response(header)));
    const started = startBitmapAssetLoad(prepareBitmapAssetLoad(asset({}, hash), undefined, 32));
    await expect(started.result).rejects.toThrow();
    await started.settled;
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});

describe("primitive bitmap material ownership", () => {
  async function loadTwoMaps(request: AssetRequestOptions) {
    const image = asset(request);
    const spec = material.pbr({ texture: image, normal: image });
    const node = primitives.box({ name: "bitmap", material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const prepared = prepareProductionPrimitiveTextureWork(spec, undefined, 64);
    await upgradeProductionPrimitiveTextures([entry], vi.fn(), 64, undefined, undefined, undefined, undefined, prepared, 64);
    const resource = entry.resources[0]!;
    expect(resource.textureStatus).toBe("textured");
    const count = vi.mocked(fetch).mock.calls.length;
    resource.textureDisposer?.();
    resource.texturedMaterial?.dispose();
    resource.geometry.dispose();
    resource.material.dispose();
    return count;
  }

  it("shares a bitmap only when credentials and cache mode permit reuse", async () => {
    expect(await loadTwoMaps({ credentials: "omit" })).toBe(1);
    vi.mocked(fetch).mockClear();
    expect(await loadTwoMaps({ credentials: "include", securityContext: "generation" })).toBe(1);
    vi.mocked(fetch).mockClear();
    expect(await loadTwoMaps({})).toBe(2);
    vi.mocked(fetch).mockClear();
    expect(await loadTwoMaps({ credentials: "omit", cache: "no-store" })).toBe(2);
  });

  it("does not start or publish a queued material whose typed asset changed", async () => {
    const image = asset({ credentials: "omit" });
    const spec = material.pbr({ texture: image });
    const node = primitives.box({ name: "stale", material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const prepared = prepareProductionPrimitiveTextureWork(spec, undefined, 64);
    (image as { url: string }).url = "https://other.example.test/changed";
    expect(isPreparedProductionPrimitiveTextureWorkCurrent(prepared, spec)).toBe(false);
    await upgradeProductionPrimitiveTextures([entry], vi.fn(), 64, undefined, undefined, undefined, undefined, prepared, 64);
    expect(fetch).not.toHaveBeenCalled();
    expect(entry.resources[0]!.texturedMaterial).toBeNull();
    entry.resources[0]!.geometry.dispose();
    entry.resources[0]!.material.dispose();
  });

  it("does not coalesce different generations for the same URL", async () => {
    const first = asset({ credentials: "include", securityContext: "one" });
    const second = asset({ credentials: "include", securityContext: "two" });
    const spec = material.pbr({ texture: first, normal: second });
    const node = primitives.box({ name: "separate", material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const prepared = prepareProductionPrimitiveTextureWork(spec, undefined, 64);
    await upgradeProductionPrimitiveTextures([entry], vi.fn(), 64, undefined, undefined, undefined, undefined, prepared, 64);
    const resource = entry.resources[0]!;
    expect(resource.textureStatus).toBe("textured");
    expect(fetch).toHaveBeenCalledTimes(2);
    resource.textureDisposer?.();
    resource.texturedMaterial?.dispose();
    resource.geometry.dispose();
    resource.material.dispose();
  });

  it("keeps the scalar fallback and redacts a signed URL on integrity failure", async () => {
    const image = asset({ credentials: "omit" }, "0".repeat(64));
    const spec = material.pbr({ texture: image });
    const node = primitives.box({ name: "fallback", material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const warn = vi.fn();
    const prepared = prepareProductionPrimitiveTextureWork(spec, undefined, 64);
    await upgradeProductionPrimitiveTextures([entry], warn, 64, undefined, undefined, undefined, undefined, prepared, 64);
    const resource = entry.resources[0]!;
    expect(resource.textureStatus).toBe("fallback");
    expect(resource.texturedMaterial).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-value");
    resource.geometry.dispose();
    resource.material.dispose();
  });
});

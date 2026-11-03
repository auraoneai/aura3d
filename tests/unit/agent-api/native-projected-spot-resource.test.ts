import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import {
  createProjectedSpotResource,
  type ProjectedSpotFrameIdentity,
  type ProjectedSpotResource
} from "../../../packages/engine/src/agent-api/compiler/projectedSpotResources";

const PIXELS = Uint8Array.of(
  12, 34, 56, 0, 78, 90, 123, 127,
  145, 167, 189, 255, 210, 220, 230, 255
);

/** Independently constructed PVR v3 image: two rows in source order. */
function pvr(options: { readonly srgb?: boolean; readonly flags?: number; readonly metadata?: Uint8Array; readonly mips?: number } = {}): Uint8Array {
  const metadata = options.metadata ?? new Uint8Array();
  const levels = options.mips ?? 1;
  const bytes = new Uint8Array(52 + metadata.length + PIXELS.length + (levels > 1 ? 4 : 0));
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x03525650, true);
  header.setUint32(4, options.flags ?? 0, true);
  header.setUint32(8, 0x61626772, true);
  header.setUint32(12, 0x08080808, true);
  header.setUint32(16, options.srgb === false ? 0 : 1, true);
  header.setUint32(20, 0, true);
  header.setUint32(24, 2, true);
  header.setUint32(28, 2, true);
  header.setUint32(32, 1, true);
  header.setUint32(36, 1, true);
  header.setUint32(40, 1, true);
  header.setUint32(44, levels, true);
  header.setUint32(48, metadata.length, true);
  bytes.set(metadata, 52);
  bytes.set(PIXELS, 52 + metadata.length);
  return bytes;
}

function asset(bytes: Uint8Array, request?: AssetRequestOptions): AuraAssetRef<"texture"> {
  return defineAuraAssets({ image: {
    type: "texture", format: "pvr", url: "https://assets.example.test/projector.pvr",
    hash: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
    ...(request === undefined ? {} : { request })
  } }).image;
}

function response(bytes: Uint8Array): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class FrameDevice {
  readonly kind = "webgl2" as const;
  disposed = false;
  contextLost = false;
  generation = 1;
  activeFrameToken: object | null = null;
  completionSupported = true;
  readonly listeners = new Set<() => void>();
  readonly fences: ReturnType<typeof deferred<void>>[] = [];
  readonly supportsSubmittedWorkCompletion = vi.fn(() => this.completionSupported);
  readonly onDeviceLost = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly waitForSubmittedWork = vi.fn(() => {
    const completion = deferred<void>();
    this.fences.push(completion);
    return completion.promise;
  });
  asDevice(): RenderDevice { return this as unknown as RenderDevice; }
  begin(): void { this.activeFrameToken = {}; }
  end(): void { this.activeFrameToken = null; }
  lose(): void {
    this.contextLost = true;
    this.activeFrameToken = null;
    for (const listener of [...this.listeners]) listener();
  }
}

function frame(device: FrameDevice, owner: object, viewId: string | number = "main", frameIndex = 1): ProjectedSpotFrameIdentity {
  return { device: device.asDevice(), owner, viewId, frameIndex };
}

async function loaded(bytes: Uint8Array, device: FrameDevice, owner: object): Promise<{ resource: ProjectedSpotResource; source: AuraAssetRef<"texture"> }> {
  vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
  const source = asset(bytes);
  const resource = createProjectedSpotResource(source, { device: device.asDevice(), owner });
  await resource.ready;
  return { resource, source };
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("projected spot verified texture resource", () => {
  it.each([true, false])("loads one verified %s-sRGB RGBA8 level and keeps its source row order", async (srgb) => {
    const device = new FrameDevice();
    const owner = {};
    const { resource, source } = await loaded(pvr({ srgb }), device, owner);
    expect(resource.state).toBe("ready");
    expect(resource.matchesAsset(source)).toBe(true);
    expect(resource.matchesAsset(asset(pvr({ srgb })))).toBe(false);
    device.begin();
    const identity = frame(device, owner);
    const lease = resource.acquireFrame(identity);
    expect(lease).toBeDefined();
    const image = lease!.texture;
    expect(image).toMatchObject({ dimension: "2d", format: "rgba8", width: 2, height: 2,
      colorSpace: srgb ? "srgb" : "linear", mipLevelCount: 1, flipY: false, generateMipmaps: false, dynamic: false });
    expect(image.data).toBeNull();
    expect(image.usage).toEqual(expect.arrayContaining(["sampled", "copy-dst"]));
    expect(Array.from(image.mipLevels[0]!.data)).toEqual(Array.from(PIXELS));
    expect(lease!.isCurrent(identity)).toBe(true);
    device.end();
    expect(lease!.release()).toBe(true);
    resource.dispose();
    expect(image.disposed).toBe(false);
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
    expect(image.disposed).toBe(true);
    await resource.settled;
  });

  it("rejects untyped, unhashed and non-PVR inputs before fetching", () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const valid = asset(bytes);
    expect(() => createProjectedSpotResource({ ...valid, type: "model" } as never, { device: device.asDevice(), owner })).toThrow(/typed PVR/i);
    expect(() => createProjectedSpotResource({ ...valid, hash: undefined } as never, { device: device.asDevice(), owner })).toThrow(/SHA-256/i);
    expect(() => createProjectedSpotResource({ ...valid, format: "png" } as never, { device: device.asDevice(), owner })).toThrow(/typed PVR/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed integrity metadata without normalizing it into a valid policy", () => {
    const device = new FrameDevice();
    const owner = {};
    const source = asset(pvr());
    const malformed = { version: 1, digest: "0".repeat(64), dependencies: [] };
    expect(() => createProjectedSpotResource({ ...source, integrity: malformed } as never, { device: device.asDevice(), owner })).toThrow(/integrity/i);
    expect(() => createProjectedSpotResource({ ...source, request: { integrity: malformed } } as never, { device: device.asDevice(), owner })).toThrow(/integrity/i);
  });

  it("snapshots app request policy and disallows a mutated asset while loading", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const source = asset(bytes, { allowedOrigins: ["https://assets.example.test"] });
    const headers = new Headers({ "x-projection-test": "original" });
    const reply = deferred<Response>();
    const called = deferred<void>();
    const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => { called.resolve(undefined); return reply.promise; });
    vi.stubGlobal("fetch", fetch);
    const resource = createProjectedSpotResource(source, { device: device.asDevice(), owner,
      request: { headers, allowedOrigins: ["https://assets.example.test"], maxBytes: bytes.length } });
    const failure = expect(resource.ready).rejects.toThrow(/changed during acquisition/i);
    await called.promise;
    headers.set("x-projection-test", "mutated");
    (source as { url: string }).url = "https://assets.example.test/other.pvr";
    reply.resolve(response(bytes));
    await failure;
    expect(resource.state).toBe("failed");
    expect(resource.matchesAsset(source)).toBe(false);
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("x-projection-test")).toBe("original");
    await resource.settled;
    resource.dispose();
  });

  it("rejects a security-context rotation while the image is loading", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const request = { credentials: "include" as const, securityContext: "private-projection-generation-one" };
    const source = asset(bytes, request);
    const reply = deferred<Response>();
    const called = deferred<void>();
    const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => { called.resolve(undefined); return reply.promise; });
    vi.stubGlobal("fetch", fetch);
    const resource = createProjectedSpotResource(source, { device: device.asDevice(), owner });
    const failure = expect(resource.ready).rejects.toThrow(/changed during acquisition/i);
    const diagnostic = resource.ready.then(() => "", (error: unknown) => String(error));
    await called.promise;
    request.securityContext = "private-projection-generation-two";
    reply.resolve(response(bytes));
    await failure;
    expect(await diagnostic).not.toMatch(/private-projection-generation/);
    expect(resource.state).toBe("failed");
    expect(resource.matchesAsset(source)).toBe(false);
    device.begin();
    expect(resource.acquireFrame(frame(device, owner))).toBeUndefined();
    device.end();
    const init = fetch.mock.calls[0]![1]!;
    expect(init).not.toHaveProperty("securityContext");
    expect(new Headers(init.headers).has("securityContext")).toBe(false);
    expect(JSON.stringify(init)).not.toContain("private-projection-generation-one");
    expect(JSON.stringify(resource)).not.toContain("private-projection-generation-one");
    await resource.settled;
    resource.dispose();
  });

  it("refuses an incorrect digest and never publishes a frame lease", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const altered = bytes.slice();
    altered[altered.length - 1] ^= 1;
    vi.stubGlobal("fetch", vi.fn(async () => response(altered)));
    const resource = createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner });
    await expect(resource.ready).rejects.toThrow(/integrity|load asset/i);
    device.begin();
    expect(resource.acquireFrame(frame(device, owner))).toBeUndefined();
    await resource.settled;
    resource.dispose();
  });

  it.each([
    ["unknown orientation metadata", pvr({ metadata: Uint8Array.of(1, 2, 3, 4) })],
    ["premultiplied pixels", pvr({ flags: 2 })],
    ["multiple mip levels", pvr({ mips: 2 })]
  ])("rejects %s rather than silently guessing", async (_name, bytes) => {
    const device = new FrameDevice();
    const owner = {};
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const resource = createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner });
    await expect(resource.ready).rejects.toThrow();
    device.begin();
    expect(resource.acquireFrame(frame(device, owner))).toBeUndefined();
    await resource.settled;
    resource.dispose();
  });

  it("enforces the caller's pixel and dimension budget", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    expect(() => createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner, maxDimension: 2049 })).toThrow(/maxDimension/i);
    const resource = createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner, maxDimension: 1 });
    await expect(resource.ready).rejects.toThrow();
    await resource.settled;
    resource.dispose();
  });

  it("ties admission and currentness to the renderer, device, view, frame and generation", async () => {
    const device = new FrameDevice();
    const other = new FrameDevice();
    const owner = {};
    const { resource } = await loaded(pvr(), device, owner);
    const identity = frame(device, owner);
    expect(resource.acquireFrame(identity)).toBeUndefined();
    device.begin();
    other.begin();
    expect(resource.acquireFrame(frame(other, owner))).toBeUndefined();
    expect(resource.acquireFrame(frame(device, {}))).toBeUndefined();
    expect(resource.acquireFrame(frame(device, owner, "main", -1))).toBeUndefined();
    device.completionSupported = false;
    expect(resource.acquireFrame(identity)).toBeUndefined();
    device.completionSupported = true;
    const lease = resource.acquireFrame(identity)!;
    expect(lease.isCurrent(identity)).toBe(true);
    expect(lease.isCurrent(frame(device, owner, "other"))).toBe(false);
    expect(lease.isCurrent(frame(device, owner, "main", 2))).toBe(false);
    expect(lease.isCurrent(frame(other, owner))).toBe(false);
    device.generation += 1;
    expect(lease.isCurrent(identity)).toBe(false);
    expect(resource.state).toBe("disposed");
    expect(lease.texture.disposed).toBe(true);
    expect(lease.release()).toBe(true);
    expect(device.listeners.size).toBe(0);
  });

  it("rejects admission if the device is lost during its completion capability probe", async () => {
    const device = new FrameDevice();
    const owner = {};
    const { resource } = await loaded(pvr(), device, owner);
    device.begin();
    device.supportsSubmittedWorkCompletion.mockImplementation(() => { device.lose(); return true; });
    expect(resource.acquireFrame(frame(device, owner))).toBeUndefined();
    expect(resource.state).toBe("disposed");
    expect(device.listeners.size).toBe(0);
  });

  it("detects revisioned pixel updates and metadata mutations before submission", async () => {
    const device = new FrameDevice();
    const owner = {};
    const { resource } = await loaded(pvr(), device, owner);
    device.begin();
    const identity = frame(device, owner);
    const lease = resource.acquireFrame(identity)!;
    const image = lease.texture;
    const pixels = (image.mipLevels[0]!.data as Uint8Array).slice();
    image.colorSpace = "linear";
    expect(lease.isCurrent(identity)).toBe(false);
    image.colorSpace = "srgb";
    image.flipY = true;
    expect(lease.isCurrent(identity)).toBe(false);
    image.flipY = false;
    image.generateMipmaps = true;
    expect(lease.isCurrent(identity)).toBe(false);
    image.generateMipmaps = false;
    expect(lease.isCurrent(identity)).toBe(true);
    pixels[0] ^= 1;
    image.updateMip(0, pixels);
    expect(lease.isCurrent(identity)).toBe(false);
    expect(resource.acquireFrame(identity)).toBeUndefined();
    device.end();
    lease.release();
    resource.dispose();
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
    expect(image.disposed).toBe(true);
  });

  it("rejects a live asset whose hash or request policy changes", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const headers = new Headers({ "x-image": "one" });
    const source = asset(bytes, { headers });
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const resource = createProjectedSpotResource(source, { device: device.asDevice(), owner });
    await resource.ready;
    device.begin();
    const identity = frame(device, owner);
    const lease = resource.acquireFrame(identity)!;
    headers.set("x-image", "two");
    expect(resource.matchesAsset(source)).toBe(false);
    expect(lease.isCurrent(identity)).toBe(false);
    headers.set("x-image", "one");
    expect(lease.isCurrent(identity)).toBe(true);
    (source as { hash?: string }).hash = `sha256-${"0".repeat(64)}`;
    expect(lease.isCurrent(identity)).toBe(false);
    device.end();
    lease.release();
    resource.dispose();
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
  });

  it("invalidates an active lease after security-context rotation and loads a new resource", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const request = { credentials: "include" as const, securityContext: "private-projection-generation-one" };
    const source = asset(bytes, request);
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const resource = createProjectedSpotResource(source, { device: device.asDevice(), owner });
    await resource.ready;
    device.begin();
    const identity = frame(device, owner);
    const lease = resource.acquireFrame(identity)!;
    expect(lease.isCurrent(identity)).toBe(true);

    request.securityContext = "private-projection-generation-two";
    expect(resource.matchesAsset(source)).toBe(false);
    expect(lease.isCurrent(identity)).toBe(false);
    expect(resource.acquireFrame(identity)).toBeUndefined();
    const replacement = createProjectedSpotResource(source, { device: device.asDevice(), owner });
    await replacement.ready;
    expect(replacement.matchesAsset(source)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      expect(init).not.toHaveProperty("securityContext");
      expect(new Headers(init?.headers).has("securityContext")).toBe(false);
      expect(JSON.stringify(init)).not.toMatch(/private-projection-generation/);
    }
    expect(JSON.stringify([resource, replacement])).not.toMatch(/private-projection-generation/);

    device.end();
    expect(lease.release()).toBe(true);
    resource.dispose();
    replacement.dispose();
    expect(lease.texture.disposed).toBe(false);
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
    expect(lease.texture.disposed).toBe(true);
    await Promise.all([resource.settled, replacement.settled]);
  });

  it("keeps a disposed resource until all frame completion fences resolve", async () => {
    const device = new FrameDevice();
    const owner = {};
    const { resource } = await loaded(pvr(), device, owner);
    device.begin();
    const identity = frame(device, owner);
    const first = resource.acquireFrame(identity)!;
    const second = resource.acquireFrame(identity)!;
    resource.dispose();
    expect(first.isCurrent(identity)).toBe(false);
    expect(resource.acquireFrame(identity)).toBeUndefined();
    expect(first.release()).toBe(false);
    expect(first.texture.disposed).toBe(false);
    device.end();
    expect(first.release()).toBe(true);
    expect(first.release()).toBe(true);
    expect(second.release()).toBe(true);
    expect(device.waitForSubmittedWork).toHaveBeenCalledTimes(2);
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
    expect(first.texture.disposed).toBe(false);
    device.fences[1]!.resolve(undefined);
    await Promise.resolve();
    expect(first.texture.disposed).toBe(true);
    expect(device.listeners.size).toBe(0);
  });

  it("retains a failed fence until real device loss", async () => {
    const device = new FrameDevice();
    const owner = {};
    const { resource } = await loaded(pvr(), device, owner);
    device.begin();
    const lease = resource.acquireFrame(frame(device, owner))!;
    device.end();
    lease.release();
    resource.dispose();
    device.fences[0]!.reject(new Error("unknown GPU completion"));
    await Promise.resolve();
    expect(lease.texture.disposed).toBe(false);
    device.lose();
    expect(lease.texture.disposed).toBe(true);
    expect(device.listeners.size).toBe(0);
  });

  it("cancels promptly but keeps physical work pending through a late body cancellation", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const fetching = deferred<void>();
    const reply = deferred<Response>();
    const cancelling = deferred<void>();
    const finishCancel = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      cancel: () => { cancelling.resolve(undefined); return finishCancel.promise; }
    });
    vi.stubGlobal("fetch", vi.fn(() => { fetching.resolve(undefined); return reply.promise; }));
    const resource = createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner });
    const failure = expect(resource.ready).rejects.toThrow(/abort/i);
    let physicallySettled = false;
    void resource.settled.then(() => { physicallySettled = true; });
    await fetching.promise;
    resource.dispose();
    await failure;
    expect(resource.state).toBe("disposed");
    expect(physicallySettled).toBe(false);
    reply.resolve(new Response(body));
    await cancelling.promise;
    expect(physicallySettled).toBe(false);
    finishCancel.resolve(undefined);
    await resource.settled;
    expect(physicallySettled).toBe(true);
    expect(device.listeners.size).toBe(0);
  });

  it("does not fetch for an already aborted owner", async () => {
    const bytes = pvr();
    const device = new FrameDevice();
    const owner = {};
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const resource = createProjectedSpotResource(asset(bytes), { device: device.asDevice(), owner, signal: controller.signal });
    await expect(resource.ready).rejects.toThrow(/abort/i);
    await resource.settled;
    expect(resource.state).toBe("disposed");
    expect(fetch).not.toHaveBeenCalled();
    expect(device.listeners.size).toBe(0);
  });
});

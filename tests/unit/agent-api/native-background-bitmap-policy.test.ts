import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const seam = vi.hoisted(() => ({
  plans: [] as Array<{ input: unknown; request: unknown; maxDimension: unknown; initial: string }>,
  jobs: [] as Array<{ signal?: AbortSignal; resolve: (bitmap: ImageBitmap) => void; reject: (error: unknown) => void }>,
  failAt: -1
}));

vi.mock("../../../packages/engine/src/agent-api/compiler/bitmapAsset.js", () => ({
  prepareBitmapAssetLoad(input: unknown, request: unknown, maxDimension: unknown) {
    if (seam.plans.length === seam.failAt) throw new Error("asset https://assets.example/bad.png?token=plan-secret");
    const plan = { input, request, maxDimension, initial: JSON.stringify(input) };
    seam.plans.push(plan);
    return plan;
  },
  matchesPreparedBitmapAssetLoad(plan: { initial: string }, input: unknown) {
    return plan.initial === JSON.stringify(input);
  },
  startBitmapAssetLoad(_plan: unknown, signal?: AbortSignal) {
    let resolve!: (bitmap: ImageBitmap) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<ImageBitmap>((yes, no) => { resolve = yes; reject = no; });
    seam.jobs.push({ signal, resolve, reject });
    return { result, settled: result.then(() => undefined, () => undefined) };
  }
}));
vi.mock("../../../packages/engine/src/agent-api/compiler/textures.js", () => ({
  bitmapRgbaPixels(bitmap: ImageBitmap) {
    return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(bitmap.width * bitmap.height * 4) };
  }
}));

import { createProductionRuntimeBackgroundImage } from "../../../packages/engine/src/agent-api/compiler/backgroundImage";

const flush = async (): Promise<void> => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const snapshot = (backgroundImage: unknown): AuraSceneSnapshot => ({ backgroundImage } as AuraSceneSnapshot);
const image = (width = 2, height = width) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
const faces = () => ["/px.png", "/nx.png", "/py.png", "/ny.png", "/pz.png", "/nz.png"];

afterEach(() => {
  seam.plans.length = 0;
  seam.jobs.length = 0;
  seam.failAt = -1;
});

describe("native background bitmap policy and ownership", () => {
  it("forwards a complete typed asset and app policy, then owns its published bitmap", async () => {
    const asset = {
      kind: "aura-asset-ref", type: "texture", id: "sky", format: "png", url: "https://assets.example/sky.png",
      hash: "a".repeat(64), request: { securityContext: "asset-session", credentials: "include" }
    };
    const request = { securityContext: "app-session", allowedOrigins: ["https://assets.example"] };
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ texture: asset, intensity: 0.75 }), warn, { request, maxDimension: 512 })!;
    expect(seam.plans).toHaveLength(1);
    expect(seam.plans[0]).toMatchObject({ input: asset, request, maxDimension: 512 });
    expect(background.current()).toBeUndefined();
    const bitmap = image();
    seam.jobs[0]!.resolve(bitmap);
    await flush();
    const output = background.current();
    expect(output).toMatchObject({ projection: "equirect", intensity: 0.75 });
    expect(output?.texture.texture?.source).toBe(bitmap);
    background.dispose();
    background.dispose();
    expect(output?.texture.texture?.disposed).toBe(true);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    await background.settled;
  });

  it("redacts transport errors and keeps the clear-colour fallback", async () => {
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ texture: "/sky.png" }), warn)!;
    seam.jobs[0]!.reject(new Error("integrity failed for https://assets.example/sky.png?token=secret-value Authorization: Bearer private-value"));
    await flush();
    expect(background.current()).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("authored clear colour retained");
    expect(warn.mock.calls[0]![0]).not.toContain("secret-value");
    expect(warn.mock.calls[0]![0]).not.toContain("private-value");
    expect(seam.jobs[0]!.signal?.aborted).toBe(true);
    await background.settled;
  });

  it("releases each successful cube face on the first failure even if another face never settles", async () => {
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces() } }), warn)!;
    expect(seam.jobs).toHaveLength(6);
    const first = image();
    seam.jobs[0]!.resolve(first);
    await flush();
    seam.jobs[1]!.reject(new Error("face failed"));
    await flush();
    expect(first.close).toHaveBeenCalledOnce();
    expect(seam.jobs.every((job) => job.signal?.aborted)).toBe(true);
    expect(background.current()).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    const late = image();
    seam.jobs[2]!.resolve(late);
    await flush();
    expect(late.close).toHaveBeenCalledOnce();
    // Other jobs intentionally remain unresolved: cleanup above does not wait for them.
    background.dispose();
  });

  it("aborts on mount cancellation and closes any face delivered afterwards without warning", async () => {
    const controller = new AbortController();
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces() } }), warn, { signal: controller.signal })!;
    controller.abort();
    const late = image();
    seam.jobs[3]!.resolve(late);
    await flush();
    expect(late.close).toHaveBeenCalledOnce();
    expect(seam.jobs.every((job) => job.signal?.aborted)).toBe(true);
    expect(background.current()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    background.dispose();
  });

  it("starts no requests when the mount was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ texture: "/sky.png" }), warn, { signal: controller.signal })!;
    expect(seam.plans).toHaveLength(0);
    expect(seam.jobs).toHaveLength(0);
    expect(background.current()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    await background.settled;
  });

  it("attempts every face cleanup and does not claim settlement when a close fails", async () => {
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces() } }), vi.fn())!;
    const first = image();
    const second = image();
    first.close.mockImplementation(() => { throw new Error("close failed"); });
    seam.jobs[0]!.resolve(first);
    seam.jobs[1]!.resolve(second);
    await flush();
    expect(() => background.dispose()).toThrow(/Background image cleanup failed/);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    const remaining = [image(), image(), image(), image()];
    remaining.forEach((bitmap, index) => seam.jobs[index + 2]!.resolve(bitmap));
    let settled = false;
    void background.settled.then(() => { settled = true; }, () => { settled = true; });
    await flush();
    expect(remaining.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(settled).toBe(false);
  });

  it("publishes all six equal faces and disposes them with the cube", async () => {
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces(), intensity: 0.5 } }), warn)!;
    const bitmaps = faces().map(() => image());
    bitmaps.forEach((bitmap, index) => seam.jobs[index]!.resolve(bitmap));
    await flush();
    const output = background.current();
    expect(output).toMatchObject({ projection: "cubemap", intensity: 0.5 });
    expect(output?.texture.texture?.cubeFaces).toHaveLength(6);
    background.dispose();
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    await background.settled;
  });

  it("retires every decoded face when cube dimensions do not match", async () => {
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces() } }), warn)!;
    const bitmaps = faces().map((_face, index) => index === 4 ? image(3) : image());
    bitmaps.forEach((bitmap, index) => seam.jobs[index]!.resolve(bitmap));
    await flush();
    expect(background.current()).toBeUndefined();
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(warn.mock.calls[0]![0]).toContain("square and equal-sized");
    await background.settled;
  });

  it("does not publish a typed asset whose request changed during decoding", async () => {
    const asset = { kind: "aura-asset-ref", type: "texture", id: "sky", format: "png", url: "/sky.png", request: { securityContext: "old-session" } };
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ texture: asset }), warn)!;
    asset.request.securityContext = "new-session";
    const bitmap = image();
    seam.jobs[0]!.resolve(bitmap);
    await flush();
    expect(background.current()).toBeUndefined();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    await background.settled;
  });

  it("prepares every cube face before starting and redacts a rejected policy", async () => {
    seam.failAt = 3;
    const warn = vi.fn();
    const background = createProductionRuntimeBackgroundImage(snapshot({ cube: { faces: faces() } }), warn)!;
    expect(seam.jobs).toHaveLength(0);
    expect(background.current()).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain("plan-secret");
    await background.settled;
  });
});

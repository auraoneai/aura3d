import { afterEach, describe, expect, it, vi } from "vitest";
import { currentWorkerAssets, installWorkerAssetsFromUrl, workerUrlWithAssets, type AuraWorkerAssetUrls } from "../../../packages/core/src/workerAssets.js";
import { defaultVfxSpritePageUrl } from "../../../packages/engine/src/production-runtime/effects/FlipbookAtlas.js";
import { createRetargetWorker } from "../../../packages/animation/src/pose/RetargetWorker.js";
import { builtInCharacterAssets } from "../../../packages/engine/src/agent-api/nodes/model.js";

const values: AuraWorkerAssetUrls = {
  vfx1024: "https://example.test/assets/vfx-1.png", vfx2048: "https://example.test/assets/vfx-2.png",
  humanoid: "https://example.test/assets/humanoid.glb",
  retargetWorker: "https://example.test/assets/retarget.js", basisScript: "https://example.test/assets/basis.js",
  basisModule: "https://example.test/assets/basis.mjs", basisWasm: "https://example.test/assets/basis.wasm",
  basisWorker: "https://example.test/assets/ktx2.js", dracoModule: "https://example.test/assets/draco.mjs",
  dracoWasm: "https://example.test/assets/draco.wasm", meshoptModule: "https://example.test/assets/meshopt.mjs",
  zstdWorker: "https://example.test/assets/zstd-worker.js"
};
const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); vi.unstubAllGlobals(); });

describe("packaged worker asset URLs", () => {
  it("round-trips a nested-base manifest before rendering and restores realm state", () => {
    const original = new URL("https://example.test/site/assets/render.js?version=1");
    const worker = workerUrlWithAssets(original, values);
    expect(original.search).toBe("?version=1");
    expect(worker.searchParams.get("version")).toBe("1");
    cleanup.push(installWorkerAssetsFromUrl(worker.href));
    expect(currentWorkerAssets()).toEqual(values);
    expect(Object.isFrozen(currentWorkerAssets())).toBe(true);
    cleanup.pop()?.();
    expect(currentWorkerAssets()).toBeUndefined();
  });

  it("rejects foreign, non-HTTP, incomplete and malformed manifests", () => {
    const worker = new URL("https://example.test/assets/render.js");
    expect(() => workerUrlWithAssets(worker, { ...values, basisWasm: "https://foreign.test/codec.wasm" })).toThrow(/same-origin/);
    expect(() => workerUrlWithAssets(worker, { ...values, zstdWorker: "https://foreign.test/zstd.js" })).toThrow(/same-origin/);
    expect(() => workerUrlWithAssets(worker, { ...values, basisWasm: "blob:https://example.test/codec" })).toThrow(/same-origin/);
    expect(() => workerUrlWithAssets(worker, { ...values, basisWasm: "https://example.test@foreign.test/a" })).toThrow(/same-origin/);
    expect(() => workerUrlWithAssets(worker, { ...values, basisWasm: `https://example.test/${"x".repeat(17_000)}` })).toThrow(/too large/);
    const bad = new URL(worker); bad.searchParams.set("aura3dWorkerAssets", JSON.stringify({ vfx1024: values.vfx1024 }));
    expect(() => installWorkerAssetsFromUrl(bad.href)).toThrow(/Incomplete/);
    bad.searchParams.set("aura3dWorkerAssets", "{");
    expect(() => installWorkerAssetsFromUrl(bad.href)).toThrow(/JSON/);
    bad.searchParams.append("aura3dWorkerAssets", "{}");
    expect(() => installWorkerAssetsFromUrl(bad.href)).toThrow(/parameter/);
  });

  it("leaves custom workers without a manifest unchanged", () => {
    cleanup.push(installWorkerAssetsFromUrl("https://example.test/custom-worker.js"));
    expect(currentWorkerAssets()).toBeUndefined();
  });

  it("accepts earlier manifests that do not yet include the Zstandard worker", () => {
    const { zstdWorker: _unused, ...earlier } = values;
    cleanup.push(installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://example.test/assets/render.js"), earlier).href));
    expect(currentWorkerAssets()).toEqual(earlier);
  });

  it("keeps the URL helper usable during server-side module inspection", () => {
    const url = workerUrlWithAssets(new URL("file:///installed/render.worker.bundle.js"), values);
    expect(url.href).toBe("file:///installed/render.worker.bundle.js");
  });

  it("uses packaged VFX and nested retarget URLs from the worker realm", () => {
    cleanup.push(installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://example.test/assets/render.js"), values).href));
    expect(defaultVfxSpritePageUrl(1024)).toBe(values.vfx1024);
    expect(defaultVfxSpritePageUrl(2048)).toBe(values.vfx2048);
    expect(builtInCharacterAssets.humanoid.url).toBe(values.humanoid);
    const created: Array<{ url: string | URL; options?: WorkerOptions }> = [];
    class FakeWorker { constructor(url: string | URL, options?: WorkerOptions) { created.push({ url, options }); } }
    vi.stubGlobal("Worker", FakeWorker);
    expect(createRetargetWorker()).toBeInstanceOf(FakeWorker);
    expect(created).toEqual([{ url: values.retargetWorker, options: { type: "module" } }]);
  });
});

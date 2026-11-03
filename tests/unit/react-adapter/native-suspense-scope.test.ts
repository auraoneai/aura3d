import { PassThrough } from "node:stream";
import { createElement, Suspense } from "react";
// @ts-ignore -- the workspace does not currently install @types/react-dom.
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createAuraAssetResource,
  resourceForDescriptors,
  useAuraAsset,
  type AuraAssetPreloadEvidence,
  type AuraAssetPreloadFn,
  type AuraAssetResource
} from "../../../packages/react/src";

// This test exercises real React server streaming and Suspense without
// starting the renderer or requiring a browser.
vi.mock("@aura3d/engine", () => ({
  camera: {}, createAuraApp: vi.fn(), effects: {}, environments: {}, interactions: {},
  lights: {}, model: vi.fn(), scene: vi.fn()
}));

const descriptors = [{ id: "product", url: "/product.glb" }] as const;
const success: AuraAssetPreloadEvidence = { ok: true, loaded: ["product"], failed: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function assertSuspenseRetry(
  lookup: () => AuraAssetResource,
  resource: AuraAssetResource,
  loader: AuraAssetPreloadFn,
  finishLoad: () => void
): Promise<void> {
  const shell = deferred<void>();
  const completed = deferred<string>();
  const stream = new PassThrough();
  const chunks: string[] = [];
  const errors: unknown[] = [];
  let renderCount = 0;
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => chunks.push(chunk));
  stream.once("end", () => completed.resolve(chunks.join("")));
  stream.once("error", completed.reject);
  // An early shell failure must not leave a rejected stream promise unobserved.
  void completed.promise.catch(() => undefined);

  function Asset() {
    renderCount++;
    const current = lookup();
    expect(current).toBe(resource);
    const evidence = useAuraAsset(current);
    return createElement("output", { "data-ready": "asset" }, evidence.loaded[0]);
  }

  const render = renderToPipeableStream(
    createElement(Suspense, { fallback: createElement("span", null, "loading") }, createElement(Asset)),
    {
      onShellReady() { shell.resolve(); },
      onShellError(error: unknown) { shell.reject(error); },
      onError(error: unknown) { errors.push(error); }
    }
  );
  try {
    await shell.promise;
    render.pipe(stream);
    expect(loader).toHaveBeenCalledTimes(1);
    finishLoad();
    const html = await completed.promise;
    expect(html).toContain('data-ready="asset"');
    expect(html).toContain("product");
    expect(renderCount).toBeGreaterThanOrEqual(2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  } finally {
    finishLoad();
    render.abort();
    stream.destroy();
    resource.dispose();
  }
}

describe("custom asset resource scope across real Suspense retries", () => {
  it("reuses an explicitly scoped resource across an initially suspended render", async () => {
    const load = deferred<AuraAssetPreloadEvidence>();
    const loader = vi.fn<AuraAssetPreloadFn>(() => load.promise);
    // The scope and the retained resource are established outside the
    // initially suspending subtree, rather than in a discarded hook state.
    const securityContext = {};
    const resource = resourceForDescriptors(descriptors, loader, securityContext);
    await assertSuspenseRetry(
      () => resourceForDescriptors(descriptors, loader, securityContext),
      resource,
      loader,
      () => load.resolve(success)
    );
  });

  it("also permits a standalone resource created outside the suspended subtree", async () => {
    const load = deferred<AuraAssetPreloadEvidence>();
    const loader = vi.fn<AuraAssetPreloadFn>(() => load.promise);
    const resource = createAuraAssetResource(descriptors, loader);
    await assertSuspenseRetry(() => resource, resource, loader, () => load.resolve(success));
  });

  it("rejects an unscoped custom shared lookup before it can start loading", () => {
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    expect(() => resourceForDescriptors(descriptors, loader)).toThrow(/securityContext.*createAuraAssetResource/i);
    expect(loader).not.toHaveBeenCalled();
  });
});

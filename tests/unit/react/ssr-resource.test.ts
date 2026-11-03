import { createRequire } from "node:module";
import { createElement, Suspense, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createAuraAssetResource,
  useAuraAsset,
  type AuraAssetPreloadEvidence,
  type AuraAssetPreloadFn
} from "../../../packages/react/src";

vi.mock("@aura3d/engine", () => ({
  camera: {},
  createAuraApp: vi.fn(),
  effects: {},
  environments: {},
  interactions: {},
  lights: {},
  model: vi.fn(),
  scene: vi.fn()
}));

const { renderToPipeableStream } = createRequire(import.meta.url)("react-dom/server") as {
  renderToPipeableStream(
    node: ReactNode,
    options: {
      onShellReady(): void;
      onShellError(error: unknown): void;
      onAllReady(): void;
      onError(error: unknown): void;
    }
  ): { abort(): void };
};

const descriptors = [{ id: "model", url: "/model.glb" }] as const;
const success: AuraAssetPreloadEvidence = { ok: true, loaded: ["model"], failed: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("React server Suspense resource ownership", () => {
  it("cancels an abandoned pre-commit read using its request signal", async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const loading = deferred<AuraAssetPreloadEvidence>();
    const shell = deferred<void>();
    const controller = new AbortController();
    let flightSignal: AbortSignal | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      flightSignal = options?.signal;
      return loading.promise;
    });
    const resource = createAuraAssetResource(descriptors, loader);
    function Asset() {
      const evidence = useAuraAsset(resource, { signal: controller.signal });
      return createElement("output", null, evidence.loaded[0]);
    }
    const stream = renderToPipeableStream(
      createElement(Suspense, { fallback: "loading" }, createElement(Asset)),
      { onShellReady: shell.resolve, onShellError: shell.reject, onAllReady() {}, onError() {} }
    );
    try {
      await shell.promise;
      expect(loader).toHaveBeenCalledOnce();
      controller.abort();
      expect(flightSignal?.aborted).toBe(true);
    } finally {
      stream.abort();
      resource.dispose();
      loading.resolve(success);
    }
  });

  it("keeps a shared server flight alive for another request", async () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    const firstShell = deferred<void>();
    const secondShell = deferred<void>();
    const secondReady = deferred<void>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let flightSignal: AbortSignal | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      flightSignal = options?.signal;
      return loading.promise;
    });
    const resource = createAuraAssetResource(descriptors, loader);
    function Asset(props: { signal: AbortSignal }) {
      const evidence = useAuraAsset(resource, { signal: props.signal });
      return createElement("output", null, evidence.loaded[0]);
    }
    const first = renderToPipeableStream(
      createElement(Suspense, { fallback: "first" }, createElement(Asset, { signal: firstController.signal })),
      { onShellReady: firstShell.resolve, onShellError: firstShell.reject, onAllReady() {}, onError() {} }
    );
    const second = renderToPipeableStream(
      createElement(Suspense, { fallback: "second" }, createElement(Asset, { signal: secondController.signal })),
      { onShellReady: secondShell.resolve, onShellError: secondShell.reject, onAllReady: secondReady.resolve, onError() {} }
    );
    try {
      await Promise.all([firstShell.promise, secondShell.promise]);
      expect(loader).toHaveBeenCalledOnce();
      firstController.abort();
      first.abort();
      expect(flightSignal?.aborted).toBe(false);
      loading.resolve(success);
      await secondReady.promise;
      expect(resource.read()).toEqual(success);
    } finally {
      first.abort();
      second.abort();
      resource.dispose();
      loading.resolve(success);
    }
  });
});

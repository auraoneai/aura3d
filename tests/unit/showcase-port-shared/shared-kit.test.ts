import { describe, expect, it, vi } from "vitest";
import { formatBackendSelection, publishBackendReport, readBackendSelection, readReadiness } from "../../../apps/showcase-port-shared/backend-report";
import { labAppOptions, labCameraOptions, parseLabFlags, resolveLabBackend } from "../../../apps/showcase-port-shared/lab-flags";
import { createLoadingProgress } from "../../../apps/showcase-port-shared/loading-progress";

describe("lab flags (W-8)", () => {
  it("is all off by default and maps to empty option fragments", () => {
    const flags = parseLabFlags("");
    expect(flags).toMatchObject({ worker: false, any: false, ignored: [] });
    expect(labAppOptions(flags)).toEqual({});
    expect(labCameraOptions(flags)).toEqual({});
    expect(parseLabFlags(undefined).any).toBe(false);
  });

  it("maps each flag and keeps a fallback", () => {
    const flags = parseLabFlags("?backend=WebGPU&worker=1&depth=reversed&gamut=p3");
    expect(flags.any).toBe(true);
    expect(labAppOptions(flags)).toEqual({
      renderer: { backend: "webgpu", allowFallback: true },
      worker: { fallback: "main-thread" },
      output: { outputColorSpace: "display-p3" }
    });
    expect(labCameraOptions(flags)).toEqual({ depth: { mode: "reversed", allowFallback: true } });
    expect(parseLabFlags(new URLSearchParams("backend=auto")).backend).toBe("auto");
  });

  it("ignores and reports unknown values; worker=0 is not a flag", () => {
    const flags = parseLabFlags("backend=vulkan&worker=0&depth=near&gamut=rec2020");
    expect(flags.any).toBe(false);
    expect(flags.ignored).toEqual(["backend", "depth", "gamut", "worker"]);
  });

  it("accepts ?backend=webgl2 as the force-WebGL2 opt-out (no renderer fragment)", () => {
    const flags = parseLabFlags("?backend=WebGL2");
    expect(flags).toMatchObject({ backend: "webgl2", any: true, ignored: [] });
    expect(labAppOptions(flags)).toEqual({});
    expect(labAppOptions(flags, { backend: "auto" })).toEqual({});
    expect(resolveLabBackend(flags, "auto")).toBeUndefined();
  });

  it("applies a game's default backend with the WebGL2 fallback unless ?backend= overrides it", () => {
    expect(labAppOptions(parseLabFlags(""), { backend: "auto" })).toEqual({ renderer: { backend: "auto", allowFallback: true } });
    expect(labAppOptions(parseLabFlags("?backend=webgpu"), { backend: "auto" })).toEqual({ renderer: { backend: "webgpu", allowFallback: true } });
    expect(labAppOptions(parseLabFlags("?backend=bogus"), { backend: "auto" })).toEqual({ renderer: { backend: "auto", allowFallback: true } });
    expect(labAppOptions(parseLabFlags(""), {})).toEqual({});
    expect(resolveLabBackend(parseLabFlags(""))).toBeUndefined();
    expect(resolveLabBackend(parseLabFlags(""), "auto")).toBe("auto");
    expect(resolveLabBackend(parseLabFlags("?backend=auto"))).toBe("auto");
  });

  it("carries createWorker in both call forms", () => {
    const createWorker = (): Worker => ({}) as Worker;
    const flags = parseLabFlags("?worker=1");
    expect(labAppOptions(flags, createWorker)).toEqual({ worker: { fallback: "main-thread", createWorker } });
    expect(labAppOptions(flags, { backend: "auto", createWorker })).toEqual({
      renderer: { backend: "auto", allowFallback: true },
      worker: { fallback: "main-thread", createWorker }
    });
    expect(labAppOptions(parseLabFlags("?backend=webgl2&worker=1"), { backend: "auto", createWorker })).toEqual({ worker: { fallback: "main-thread", createWorker } });
  });

  it("applies a game's default depth mode unless ?depth= overrides it; standard opts out", () => {
    expect(labCameraOptions(parseLabFlags(""), "reversed")).toEqual({ depth: { mode: "reversed", allowFallback: true } });
    expect(labCameraOptions(parseLabFlags("?depth=standard"), "reversed")).toEqual({});
    expect(labCameraOptions(parseLabFlags("?depth=logarithmic"), "reversed")).toEqual({ depth: { mode: "logarithmic", allowFallback: true } });
    expect(labCameraOptions(parseLabFlags(""))).toEqual({});
  });
});

describe("backend report (W-6)", () => {
  const diag = { backend: "webgl2", backendSelection: { requested: "auto", active: "webgl2", fallbackReason: "no-adapter", missingFeatures: ["timestamp-query"], deviceLost: false } };

  it("reads and formats the selection, with nested and pre-5.0 shapes", () => {
    const selection = readBackendSelection(diag)!;
    expect(formatBackendSelection(selection)).toBe("backend auto->webgl2 (no-adapter; missing timestamp-query)");
    expect(readBackendSelection({ backend: "webgl2", renderer: { backendSelection: { active: "webgpu", missingFeatures: [], deviceLost: true } } })?.deviceLost).toBe(true);
    expect(readBackendSelection({ backend: "webgl2" })).toBeUndefined();
    expect(readBackendSelection(undefined)).toBeUndefined();
  });

  it("normalises readiness outcomes and never throws", async () => {
    expect(await readReadiness({})).toEqual({ state: "unsupported" });
    expect(await readReadiness({ readiness: async () => ({ state: "ready", stage: "first-frame", backend: "webgl2" }) })).toEqual({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(await readReadiness({ readiness: async () => ({ state: "failed", code: "RENDERER_MOUNT_FAILED", message: "boom" }) })).toEqual({ state: "failed", code: "RENDERER_MOUNT_FAILED", message: "boom" });
    expect(await readReadiness({ readiness: async () => ({ state: "disposed" }) })).toEqual({ state: "disposed" });
    expect(await readReadiness({ readiness: async () => { throw new Error("x"); } })).toEqual({ state: "failed", code: "READINESS_THREW", message: "x" });
  });

  it("publishes both reports onto the QA hook", async () => {
    const hook: Record<string, unknown> = {};
    const report = await publishBackendReport({ diagnostics: () => diag, readiness: async () => ({ state: "ready", stage: "first-frame", backend: "webgl2" }) }, hook);
    expect(hook.backendReport).toBe(report);
    expect(report.readiness.state).toBe("ready");
    expect(report.backendSelection?.active).toBe("webgl2");
  });
});

describe("loading progress (A1 helper)", () => {
  it("aggregates weighted promises monotonically, counts rejections, and drives shell + element", async () => {
    const shell = { setLoadingProgress: vi.fn() };
    const style = new Map<string, string>();
    const attrs = new Map<string, string>();
    const element = { style: { setProperty: (k: string, v: string) => style.set(k, v) }, setAttribute: (k: string, v: string) => attrs.set(k, v) } as unknown as HTMLElement;
    const progress = createLoadingProgress({ shell, element });
    let resolveA!: () => void;
    const a = progress.track(new Promise<void>((r) => { resolveA = r; }), 3, "models");
    const b = progress.track(Promise.reject(new Error("optional")), 1, "audio");
    await b.catch(() => undefined);
    await Promise.resolve();
    expect(progress.fraction).toBeCloseTo(0.25);
    resolveA();
    await a;
    expect(progress.fraction).toBe(1);
    const last = shell.setLoadingProgress.mock.calls.map((c) => c[0] as number);
    expect([...last].sort((x, y) => x - y)).toEqual(last);
    progress.done("ready");
    expect(attrs.get("data-complete")).toBe("true");
    expect(style.get("--aura3d-loading")).toBe("1");
  });

  it("never goes backwards when work is added late, ignores bad numbers, and done() is idempotent", () => {
    const seen: number[] = [];
    const progress = createLoadingProgress({ onProgress: (f) => seen.push(f) });
    progress.set(0.6);
    progress.set(0.2);
    progress.set(Number.NaN);
    expect(progress.fraction).toBe(0.6);
    progress.done();
    progress.done();
    expect(seen.at(-1)).toBe(1);
    expect(seen.filter((f) => f === 1)).toHaveLength(1);
  });
});

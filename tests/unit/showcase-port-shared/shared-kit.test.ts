import { describe, expect, it, vi } from "vitest";
import { formatBackendSelection, publishBackendReport, readBackendSelection, readReadiness } from "../../../apps/showcase-port-shared/backend-report";
import { labAppOptions, labCameraOptions, parseLabFlags } from "../../../apps/showcase-port-shared/lab-flags";
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

  it("ignores and reports unknown values; webgl2 and worker=0 are not flags", () => {
    const flags = parseLabFlags("backend=webgl2&worker=0&depth=standard&gamut=rec2020");
    expect(flags.any).toBe(false);
    expect(flags.ignored).toEqual(["backend", "depth", "gamut", "worker"]);
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

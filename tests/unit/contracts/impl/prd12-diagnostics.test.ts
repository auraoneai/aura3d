import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "@aura3d/engine/contracts";
import * as engine from "@aura3d/engine";

const SECTIONS = contracts.diagnosticsSectionsAll();
const appliedLook = SECTIONS.find((section) => section.key === "appliedLook");
const frameTiming = SECTIONS.find((section) => section.key === "frameTiming");

function fakeApp(diagnosticsState: unknown, scene: object): never {
  return {
    scene,
    diagnostics: () => diagnosticsState
  } as never;
}

describe("PRD-12 T1.14 C-31 sections (appliedLook, frameTiming)", () => {
  it("registers both sections from the lane barrel, owned by prd12", () => {
    expect(appliedLook).toBeDefined();
    expect(frameTiming).toBeDefined();
    expect(appliedLook!.owner).toBe("prd12");
    expect(frameTiming!.owner).toBe("prd12");
    expect(contracts.DIAGNOSTICS_SECTION_KEYS).toContain("appliedLook");
    expect(contracts.DIAGNOSTICS_SECTION_KEYS).toContain("frameTiming");
  });

  it("appliedLook collects from real renderer diagnostics without constants", () => {
    const snapshot = { background: "#10151f", nodes: [], camera: { mode: "orbit" }, diagnostics: { enabled: false } };
    const state = engine.createInitialDiagnostics(snapshot as never);
    const report = appliedLook!.collect(fakeApp(engine.snapshotDiagnostics(state), snapshot));
    expect(report).not.toBeNull();
    const look = report as Record<string, unknown>;
    expect(typeof look.exposure).toBe("number");
    expect(["aces-filmic", "agx", "neutral", "reinhard", "none"]).toContain(look.toneMapping);
    const environment = look.environment as Record<string, unknown>;
    expect(["color", "hdri", "sky"]).toContain(environment.background);
    expect(typeof look.fallbackLightsActive).toBe("boolean");
    expect(["production", "safe-basic", "lean", "compat-preset"]).toContain(look.renderPath);
    expect(typeof look.pixelRatio).toBe("number");
    // No authored lights in the snapshot. A3D_QR_LIGHTING is default-on
    // (#1238): the fallback rig is replaced by the neutral-room environment,
    // so no fallback lights are active.
    expect(look.fallbackLightsActive).toBe(false);
  });

  it("appliedLook reports fallback lights with A3D_QR_LIGHTING explicitly off", () => {
    vi.stubEnv("A3D_QR_LIGHTING", "0");
    try {
      const snapshot = { background: "#10151f", nodes: [], camera: { mode: "orbit" }, diagnostics: { enabled: false } };
      const state = engine.createInitialDiagnostics(snapshot as never);
      const look = appliedLook!.collect(fakeApp(engine.snapshotDiagnostics(state), snapshot)) as Record<string, unknown>;
      // Flag off: the legacy fallback rig is genuinely active.
      expect(look.fallbackLightsActive).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports null where the source is absent — never a constant", () => {
    // App whose renderer diagnostics are missing entirely.
    const report = appliedLook!.collect(fakeApp({}, { nodes: [] }));
    expect(report).toBeNull();
  });

  it("never throws on a disposed app", () => {
    const disposed = {
      scene: { nodes: [] },
      diagnostics: () => {
        throw new Error("Aura3D app is disposed.");
      }
    } as never;
    expect(() => appliedLook!.collect(disposed)).not.toThrow();
    expect(appliedLook!.collect(disposed)).toBeNull();
    expect(() => frameTiming!.collect(disposed)).not.toThrow();
  });

  it("frameTiming is null headless (no rAF) — no fabricated numbers", () => {
    const report = frameTiming!.collect(fakeApp({}, { nodes: [] }));
    // In a browser-less run there is no requestAnimationFrame to sample.
    if (typeof requestAnimationFrame !== "function") {
      expect(report).toBeNull();
    } else if (report !== null) {
      const timing = report as Record<string, unknown>;
      expect(["rAF", "gpu-timer-query"]).toContain(timing.source);
      expect(timing.frames as number).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * T1.14-fix. createAuraApp's diagnostics() runs every registered section with
 * the app; this fake does the same, so a section that calls app.diagnostics()
 * re-enters it exactly as in production.
 */
function reentrantApp(): { app: never; calls: () => number } {
  const snapshot = { background: "#10151f", nodes: [], camera: { mode: "orbit" }, diagnostics: { enabled: false } };
  const state = engine.createInitialDiagnostics(snapshot as never);
  let calls = 0;
  const app = {
    scene: snapshot,
    diagnostics() {
      calls += 1;
      if (calls > 50) throw new RangeError("diagnostics() recursion");
      const report = engine.snapshotDiagnostics(state) as unknown as Record<string, unknown>;
      for (const section of contracts.diagnosticsSectionsAll()) report[section.key] = section.collect(app as never);
      return report;
    }
  };
  return { app: app as never, calls: () => calls };
}

describe("PRD-12 T1.14-fix diagnostics() recursion", () => {
  it("appliedLook makes exactly one nested diagnostics() call per collect", () => {
    const { app, calls } = reentrantApp();
    const look = appliedLook!.collect(app) as Record<string, unknown> | null;
    expect(calls()).toBe(1);
    expect(look).not.toBeNull();
    expect(["production", "safe-basic", "lean", "compat-preset"]).toContain(look!.renderPath);
  });

  it("a full diagnostics() pass reports appliedLook and stays bounded at two passes", () => {
    const { app, calls } = reentrantApp();
    const report = (app as { diagnostics(): Record<string, unknown> }).diagnostics();
    // Outer pass + the one nested pass appliedLook needs to read the renderer report.
    expect(calls()).toBe(2);
    expect(report.appliedLook).not.toBeNull();
    // The guard is released after the collect: a second poll behaves the same.
    (app as { diagnostics(): unknown }).diagnostics();
    expect(calls()).toBe(4);
  });
});

describe("PRD-12 T1.14-fix rAF sampler", () => {
  const queue = new Map<number, (now: number) => void>();
  let nextId = 0;
  let cancelled = 0;

  function runFrames(count: number, start: number, intervalMs: number): number {
    let now = start;
    for (let i = 0; i < count; i += 1) {
      const pending = [...queue.entries()];
      queue.clear();
      for (const [, cb] of pending) cb(now);
      now += intervalMs;
    }
    return now;
  }

  beforeEach(() => {
    queue.clear();
    cancelled = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
      nextId += 1;
      queue.set(nextId, cb);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      if (queue.delete(id)) cancelled += 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("flag off: never arms a rAF loop and reports null", () => {
    vi.stubEnv(frameTiming!.flag, "0");
    expect(frameTiming!.collect(fakeApp({}, { nodes: [] }))).toBeNull();
    expect(queue.size).toBe(0);
  });

  it("flag on: measures one 120-interval window from rAF timestamps, then stops", () => {
    vi.stubEnv(frameTiming!.flag, "1");
    const app = fakeApp({}, { nodes: [] });
    expect(frameTiming!.collect(app)).toBeNull(); // armed, nothing measured yet
    expect(queue.size).toBe(1);
    // 1 baseline callback + 120 intervals of 20 ms (50 fps).
    runFrames(121, 1000, 20);
    expect(queue.size).toBe(0); // window full: the loop stopped itself
    const sample = frameTiming!.collect(app) as Record<string, number | string | null>;
    expect(sample.source).toBe("rAF");
    expect(sample.frames).toBe(120);
    expect(sample.rafFps).toBeCloseTo(50, 6);
    expect(sample.cpuMsP50).toBeCloseTo(20, 6);
    expect(sample.gpuMsP50).toBeNull();
    // That collect re-armed exactly one fresh window.
    expect(queue.size).toBe(1);
    // Release the module-level window for the next test.
    vi.stubEnv(frameTiming!.flag, "0");
    frameTiming!.collect(app);
  });

  it("flag turned off cancels a live window", () => {
    vi.stubEnv(frameTiming!.flag, "1");
    const app = fakeApp({}, { nodes: [] });
    frameTiming!.collect(app);
    expect(queue.size).toBe(1);
    vi.stubEnv(frameTiming!.flag, "0");
    expect(frameTiming!.collect(app)).toBeNull();
    expect(queue.size).toBe(0);
    expect(cancelled).toBe(1);
  });
});

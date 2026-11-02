import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateBands, parseCaptureLog } from "../../../tools/look-metrics/region-luma.mjs";

const { PlaywrightTimeoutError } = vi.hoisted(() => ({
  PlaywrightTimeoutError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TimeoutError";
    }
  }
}));

vi.mock("@playwright/test", () => ({
  test: { describe: vi.fn() },
  errors: { TimeoutError: PlaywrightTimeoutError }
}));
vi.mock("../../browser/example-dev-server", () => ({ startExampleDevServer: vi.fn() }));
vi.mock("../../browser/game-luma-stats", () => ({ glMetaInPage: vi.fn(), glPairInPage: vi.fn() }));
vi.mock("../../browser/game-luma-targets", () => ({ GAME_LUMA_TARGETS: [] }));

const target = { name: "g--a", slug: "g", variant: "a", group: "g1", url: "/" };
const legacyMeta = {
  v1: { mean: 120, p5: 60, p50: 120, p95: 180, darkFrac: 0.01, clipFrac: 0, grid: Array(9).fill(120) },
  v2: { gl: 2, blank: false, w: 1280, h: 720, cells: [], crops: {} },
  rects: [],
  jpeg: "anBlZw=="
};
const newFields = [
  "texPendingBeforeWait", "texWaitStatus", "texWaitElapsedMs",
  "screenshotRequestedSinceReadyMs", "screenshotCompletedSinceReadyMs",
  "diagnosticsRequestedSinceReadyMs", "diagnosticsCompletedSinceReadyMs"
];

type TextureRow = { status?: string } | null;
type Scenario = {
  rows?: TextureRow[] | null;
  appPresent?: boolean;
  waitMs?: number;
  waitError?: Error;
  waitSnapshots?: (TextureRow[] | null)[];
  predicateError?: Error;
  handleValueError?: Error;
  handleValueOverride?: unknown;
  afterShotRows?: TextureRow[] | null;
  afterShotError?: Error;
  screenshotMs?: number;
  wallClockJumpMs?: number;
};

async function loadCapture(waitSeconds: string) {
  vi.stubEnv("GL_TEX_WAIT_S", waitSeconds);
  vi.stubEnv("GL_PAIR_MS", "0");
  vi.resetModules();
  return import("../../browser/game-luma-capture.spec");
}

function harness(options: Scenario = {}) {
  let clock = 25_000;
  let wallOffset = 1_000_000;
  let rows = options.rows === undefined ? [{ status: "pending" }, { status: "pending" }, { status: "ready" }] : options.rows;
  let diagnosticsError: Error | undefined;
  let reads = 0;
  const events: string[] = [];
  const logs: string[] = [];
  const predicateValues: unknown[] = [];
  const handles: { jsonValue: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
  const app = {
    diagnostics() {
      if (diagnosticsError) throw diagnosticsError;
      return {
        renderPath: { path: "hdr-msaa" }, drawCalls: 12, triangles: 123,
        renderer: { runtime: rows === null ? {} : { texturedMaterials: rows } }
      };
    }
  };
  vi.stubGlobal("__AURA3D_LIVE_APPS__", { all: () => options.appPresent === false ? [] : [app] });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(Date, "now").mockImplementation(() => wallOffset + clock);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { logs.push(String(chunk)); return true; });

  const page = {
    evaluate: vi.fn(async (fn: () => unknown, arg?: { png: string }) => {
      if (arg) {
        events.push("pixels");
        clock += 1_200;
        return legacyMeta;
      }
      reads++;
      events.push(reads % 2 ? "pre-wait" : "diagnostics");
      clock += reads % 2 ? 20 : 100;
      return fn();
    }),
    waitForFunction: vi.fn(async (predicate: string) => {
      events.push("wait");
      clock += options.waitMs ?? 4_000;
      if (options.predicateError) {
        diagnosticsError = options.predicateError;
        return runInNewContext(predicate, { window: globalThis });
      }
      if (options.waitError && !options.waitSnapshots) throw options.waitError;
      for (const snapshot of options.waitSnapshots ?? [[]]) {
        rows = snapshot;
        const value: unknown = runInNewContext(predicate, { window: globalThis });
        predicateValues.push(value);
        if (value) {
          const handle = {
            jsonValue: vi.fn(async () => {
              if (options.handleValueError) throw options.handleValueError;
              return "handleValueOverride" in options ? options.handleValueOverride : value;
            }),
            dispose: vi.fn(async () => undefined)
          };
          handles.push(handle);
          return handle;
        }
      }
      if (options.waitError) throw options.waitError;
      throw new Error("mock wait exhausted without a result");
    }),
    addStyleTag: vi.fn(async () => {
      events.push("style");
      clock += 30;
      return { evaluate: async () => { events.push("remove-style"); } };
    }),
    waitForTimeout: vi.fn(async (ms: number) => { events.push("style-wait"); clock += ms; }),
    screenshot: vi.fn(async () => {
      events.push("screenshot");
      clock += options.screenshotMs ?? 70_000;
      wallOffset += options.wallClockJumpMs ?? 0;
      if (options.afterShotRows !== undefined) rows = options.afterShotRows;
      if (options.afterShotError) diagnosticsError = options.afterShotError;
      return Buffer.from("png");
    })
  };
  return {
    page, events, logs, predicateValues, handles, now: () => clock,
    setDiagnosticsError: (error: Error) => { diagnosticsError = error; },
    metas: () => parseCaptureLog(logs.join("")).metas
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("game luma capture timing", () => {
  it("records pre-wait pending, the wait outcome, and distinct screenshot and diagnostic time bounds", async () => {
    const { grab } = await loadCapture("30");
    const h = harness();
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    const [row] = h.metas();
    expect(h.events).toEqual(["pre-wait", "wait", "style", "style-wait", "screenshot", "pixels", "diagnostics", "remove-style"]);
    expect(h.page.waitForFunction).toHaveBeenCalledWith(expect.any(String), undefined, { timeout: 30_000, polling: 2_000 });
    expect(h.handles[0]?.jsonValue).toHaveBeenCalledOnce();
    expect(h.handles[0]?.dispose).toHaveBeenCalledOnce();
    expect(row).toMatchObject({
      target: "g--a", id: "settle-25s", slug: "g", variant: "a", sinceReadyMs: 25_000,
      ...legacyMeta.v1, ...legacyMeta.v2,
      info: { app: true, renderPath: "hdr-msaa", drawCalls: 12, triangles: 123, texPending: 0, texTotal: 0 },
      texPendingBeforeWait: 2, texWaitStatus: "resolved", texWaitElapsedMs: 4_000,
      screenshotRequestedSinceReadyMs: 29_300, screenshotCompletedSinceReadyMs: 99_300,
      diagnosticsRequestedSinceReadyMs: 100_500, diagnosticsCompletedSinceReadyMs: 100_600
    });
    expect(Object.keys(row).slice(0, 14)).toEqual([
      "target", "id", "slug", "variant", "sinceReadyMs", "mean", "p5", "p50", "p95", "darkFrac", "clipFrac", "grid", "info", "gl"
    ]);
    expect(h.logs.some((line) => line.startsWith("GL_JPG g--a settle-25s 1/1 "))).toBe(true);
  });

  it("records timeouts even when textures finish during a long screenshot", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({
      waitMs: 30_000,
      waitError: new PlaywrightTimeoutError("page.waitForFunction: Timeout 30000ms exceeded."),
      afterShotRows: [],
      screenshotMs: 5_000
    });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    const [row] = h.metas();
    expect(row).toMatchObject({
      texPendingBeforeWait: 2, texWaitStatus: "timed-out", texWaitElapsedMs: 30_000,
      screenshotRequestedSinceReadyMs: 55_300, screenshotCompletedSinceReadyMs: 60_300,
      diagnosticsRequestedSinceReadyMs: 61_500, diagnosticsCompletedSinceReadyMs: 61_600,
      info: { texPending: 0 }
    });
    expect(evaluateBands([row])[0].pass).toBe(true);
  });

  it("records zero pending and an immediately resolved wait", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ rows: [], waitMs: 0 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    expect(h.metas()[0]).toMatchObject({
      texPendingBeforeWait: 0, texWaitStatus: "resolved", texWaitElapsedMs: 0, info: { texPending: 0 }
    });
  });

  it("records pending textures even when waiting is disabled", async () => {
    const { grab } = await loadCapture("0");
    const h = harness({ screenshotMs: 0 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    expect(h.page.waitForFunction).not.toHaveBeenCalled();
    expect(h.metas()[0]).toMatchObject({
      texPendingBeforeWait: 2, texWaitStatus: "disabled", texWaitElapsedMs: 0, info: { texPending: 2 }
    });
    expect(evaluateBands(h.metas())[0].pass).toBe(false);
  });

  it("marks a disabled wait separately and preserves unknown pre-wait diagnostics as null", async () => {
    const { grab } = await loadCapture("0");
    const h = harness({ rows: null, screenshotMs: 1_000 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    expect(h.page.waitForFunction).not.toHaveBeenCalled();
    expect(h.metas()[0]).toMatchObject({
      texPendingBeforeWait: null, texWaitStatus: "disabled", texWaitElapsedMs: 0,
      info: { app: true, texPending: 0 }
    });
  });

  it("reports unavailable when the app is missing at the wait", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ appPresent: false, waitMs: 0 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: null, texWaitStatus: "unavailable", info: { app: false } });
  });

  it("does not infer wait readiness from diagnostics that appear after the wait", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ rows: null, waitSnapshots: [null], afterShotRows: [], waitMs: 0 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: null, texWaitStatus: "unavailable", info: { texPending: 0 } });
    expect(h.predicateValues).toEqual(["unavailable"]);
  });

  it("resolves when initially absent diagnostics become available and the wait observes zero pending", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ rows: null, waitSnapshots: [[{ status: "pending" }], []] });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.predicateValues).toEqual([false, "resolved"]);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: null, texWaitStatus: "resolved", info: { texPending: 0 } });
  });

  it("reports unavailable if diagnostics disappear after the pre-wait sample", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ waitSnapshots: [null], waitMs: 0 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: 2, texWaitStatus: "unavailable" });
  });

  it("reports unavailable if diagnostics disappear after a pending poll", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ waitSnapshots: [[{ status: "pending" }], null] });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.predicateValues).toEqual([false, "unavailable"]);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: 2, texWaitStatus: "unavailable" });
  });

  it("records a timeout when newly available diagnostics remain pending", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({
      rows: null, waitSnapshots: [[{ status: "pending" }], [{ status: "pending" }]], waitMs: 30_000,
      waitError: new PlaywrightTimeoutError("page.waitForFunction: Timeout 30000ms exceeded.")
    });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.predicateValues).toEqual([false, false]);
    expect(h.metas()[0]).toMatchObject({ texPendingBeforeWait: null, texWaitStatus: "timed-out", texWaitElapsedMs: 30_000 });
  });

  it("does not reclassify a handle read failure as the wait timing out", async () => {
    const { grab } = await loadCapture("30");
    const error = new PlaywrightTimeoutError("page.waitForFunction: Timeout 30000ms exceeded.");
    const h = harness({ handleValueError: error });
    await expect(grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0)).rejects.toBe(error);
    expect(h.handles[0]?.dispose).toHaveBeenCalledOnce();
    expect(h.page.screenshot).not.toHaveBeenCalled();
    expect(h.metas()).toEqual([]);
  });

  it("rejects an unexpected wait result and disposes its handle", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ handleValueOverride: "unknown" });
    await expect(grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0))
      .rejects.toThrow("Unexpected texture wait result: unknown");
    expect(h.handles[0]?.dispose).toHaveBeenCalledOnce();
    expect(h.page.screenshot).not.toHaveBeenCalled();
    expect(h.metas()).toEqual([]);
  });

  it("makes clear that a subsequent settle-60s shot can happen well after 60 seconds", async () => {
    const { grab } = await loadCapture("30");
    const h = harness();
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    const beforeSecondGrab = h.now();
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-60s", { slug: "g", variant: "a", sinceReadyMs: beforeSecondGrab }, 0);
    const [first, second] = h.metas();
    expect(first.screenshotCompletedSinceReadyMs).toBeGreaterThan(60_000);
    expect(second.id).toBe("settle-60s");
    expect(second.sinceReadyMs).toBe(beforeSecondGrab);
    expect(second.screenshotRequestedSinceReadyMs).toBeGreaterThan(second.sinceReadyMs);
    expect(second.screenshotCompletedSinceReadyMs).toBeGreaterThan(second.screenshotRequestedSinceReadyMs);
    expect(second.diagnosticsRequestedSinceReadyMs).toBeGreaterThan(second.screenshotCompletedSinceReadyMs);
  });

  it("uses a monotonic clock for the new time bounds when the wall clock jumps", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ wallClockJumpMs: -3_600_000 });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    expect(h.metas()[0]).toMatchObject({
      texWaitElapsedMs: 4_000,
      screenshotRequestedSinceReadyMs: 29_300, screenshotCompletedSinceReadyMs: 99_300,
      diagnosticsRequestedSinceReadyMs: 100_500, diagnosticsCompletedSinceReadyMs: 100_600
    });
  });

  it.each([
    new Error("page was closed"),
    new PlaywrightTimeoutError("an unrelated operation timed out")
  ])("propagates unexpected wait failure %# without emitting a successful capture", async (error) => {
    const { grab } = await loadCapture("30");
    const h = harness({ waitError: error });
    await expect(grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0)).rejects.toBe(error);
    expect(h.page.screenshot).not.toHaveBeenCalled();
    expect(h.metas()).toEqual([]);
  });

  it("does not mistake a timeout-named diagnostic exception for the wait's own timeout", async () => {
    const { grab } = await loadCapture("30");
    const error = new Error("texture loader failed");
    error.name = "TimeoutError";
    const h = harness({ predicateError: error });
    await expect(grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0))
      .rejects.toMatchObject({ name: "Error", message: "Texture readiness check failed: TimeoutError: texture loader failed" });
    expect(h.page.screenshot).not.toHaveBeenCalled();
    expect(h.metas()).toEqual([]);
  });

  it("propagates errors while obtaining the pre-wait count", async () => {
    const { grab } = await loadCapture("30");
    const h = harness();
    const error = new Error("diagnostics failed");
    h.setDiagnosticsError(error);
    await expect(grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0)).rejects.toBe(error);
    expect(h.page.waitForFunction).not.toHaveBeenCalled();
    expect(h.metas()).toEqual([]);
  });

  it("retains the existing post-shot diagnostic error field", async () => {
    const { grab } = await loadCapture("30");
    const h = harness({ afterShotError: new Error("late diagnostics failed") });
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", {}, 0);
    expect(h.metas()[0]).toMatchObject({
      texPendingBeforeWait: 2, texWaitStatus: "resolved", info: { app: true, diagErr: "Error: late diagnostics failed" }
    });
  });

  it("leaves existing luma-band decisions unchanged for rows with the added fields", async () => {
    const { grab } = await loadCapture("30");
    const h = harness();
    await grab(h.page as unknown as Parameters<typeof grab>[0], target, "settle-25s", { slug: "g", variant: "a", sinceReadyMs: 25_000 }, 0);
    const [row] = h.metas();
    const legacy = { ...row };
    for (const field of newFields) delete legacy[field];
    expect(evaluateBands([row])).toEqual(evaluateBands([legacy]));
    expect(evaluateBands([row])[0].pass).toBe(true);
    expect(evaluateBands([{ ...row, darkFrac: 0.6 }])[0].pass).toBe(true);
    expect(evaluateBands([{ ...row, darkFrac: 0.6001 }])[0].pass).toBe(false);
    expect(evaluateBands([{ ...row, clipFrac: 0.05 }])[0].pass).toBe(true);
    expect(evaluateBands([{ ...row, clipFrac: 0.0501 }])[0].pass).toBe(false);
    expect(evaluateBands([{ ...row, info: { ...row.info, texPending: 1 } }])[0].misses)
      .toContainEqual(expect.objectContaining({ metric: "texPending", value: 1 }));
  });
});

/**
 * 02-S13 — no stalls on prd02-15-animation-skinning with `lighting` and an
 * HDRI swap (PRD-02 §16.1 S13). Drives `scenes/prd02/counters.html` from the
 * lane bundle on macos-14.
 *
 * Counters are the C-28 device totals on the live renderer
 * (`RenderDeviceDiagnostics.programCompileCount` / `readPixelsCalls`, read
 * through the `Symbol.for("a3d.prd01.renderer")` seam), cross-checked by raw
 * WebGL2 spies; long tasks come from PerformanceObserver("longtask").
 *  - steady window, frames 2–120 after ready+settle: programCompileCount
 *    delta 0, readPixelsCalls delta 0, no long task > 50 ms;
 *  - swap window, frames 2–120 with studioSmall08 → kloppenheim06Puresky at
 *    frame 3 via `app.setScene` (resolved before the window closes): the same
 *    three conditions, summed over every renderer alive in the window.
 * Long Tasks carry no subsystem attribution, so "lighting long task" is
 * checked conservatively as "any main-thread task > 50 ms in the window".
 * Control that must fail: `control=forced-stall` (one device.readPixels, one
 * device.createShaderProgram and a 120 ms busy-wait inside the steady
 * window) — the counters, the GL spies and the observer must all report it.
 */
import { expect, test, type Page } from "@playwright/test";
import { startLaneServer, type LaneServer } from "./lane-page";

interface WindowResult {
  readonly frames: number;
  readonly renderers: number;
  readonly countersPresent: boolean;
  readonly programCompileDelta: number;
  readonly readPixelsDelta: number;
  readonly glSpies: { readonly readPixels: number; readonly compileShader: number; readonly linkProgram: number };
  readonly longTasks: readonly { readonly startTime: number; readonly duration: number }[];
}
interface SwapResult extends WindowResult {
  readonly swappedNodes: number;
  readonly resolvedFrame: number | null;
  readonly remounted: boolean;
  readonly environment: { readonly hdriStatus?: string; readonly iblPixelBacked?: boolean } | null;
}
interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly longTaskSupported?: boolean;
  readonly measured?: { readonly steady: WindowResult; readonly swap: SwapResult | null };
}

const SCENE = "prd02-15-animation-skinning";
const LONG_TASK_MS = 50;
const READY_TIMEOUT_MS = Number(process.env.QR_PRD02_READY_TIMEOUT_MS ?? 240_000);

async function runHarness(page: Page, server: LaneServer, control?: string): Promise<HarnessResult> {
  const query = new URLSearchParams({ scene: SCENE, "a3d-qr": "lighting" });
  if (control) query.set("control", control);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${server.origin}/scenes/prd02/counters.html?${query.toString()}`, { waitUntil: "load", timeout: 60_000 });
  // runAuraScene (ready + settle) plus the steady and swap windows.
  // Expression predicates (a "() => …" string is truthy at once; see chunks.spec.ts).
  await page.waitForFunction("Boolean(window.__A3D_PRD02_COUNTERS__)", undefined, { timeout: READY_TIMEOUT_MS + 240_000, polling: 500 });
  return (await page.evaluate("window.__A3D_PRD02_COUNTERS__")) as HarnessResult;
}

function stalls(result: WindowResult) {
  return {
    compiles: result.programCompileDelta,
    readbacks: result.readPixelsDelta,
    glReadPixels: result.glSpies.readPixels,
    glLinks: result.glSpies.linkProgram,
    longTasks: result.longTasks.filter((task) => task.duration > LONG_TASK_MS)
  };
}

test.describe("02-S13 no stalls on prd02-15 with lighting + HDRI swap", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("steady frames 2–120 and an HDRI swap: 0 compiles, 0 readbacks, no task > 50 ms", async ({ page }) => {
    test.setTimeout(READY_TIMEOUT_MS + 300_000);
    const result = await runHarness(page, server);
    expect(result.status, result.error).toBe("ready");
    expect(result.longTaskSupported, "PerformanceObserver longtask unsupported").toBe(true);
    const steady = result.measured!.steady;
    const swap = result.measured!.swap!;
    const detail = JSON.stringify({ steady, swap });
    // The C-28 counters must exist on the live device — no counter, no claim.
    expect(steady.countersPresent, detail).toBe(true);
    expect(swap.countersPresent, detail).toBe(true);
    expect(steady.frames, detail).toBe(118);
    expect(swap.frames, detail).toBeGreaterThanOrEqual(118);

    const s = stalls(steady);
    expect(s.compiles, detail).toBe(0);
    expect(s.readbacks, detail).toBe(0);
    expect(s.glReadPixels, detail).toBe(0);
    expect(s.glLinks, detail).toBe(0);
    expect(s.longTasks, detail).toEqual([]);

    // The swap really happened and the new HDRI resolved inside the window.
    expect(swap.swappedNodes, detail).toBe(1);
    expect(swap.resolvedFrame, detail).not.toBeNull();
    expect(swap.environment?.hdriStatus, detail).toBe("ready");
    const w = stalls(swap);
    expect(w.compiles, detail).toBe(0);
    expect(w.readbacks, detail).toBe(0);
    expect(w.glReadPixels, detail).toBe(0);
    expect(w.glLinks, detail).toBe(0);
    expect(w.longTasks, detail).toEqual([]);
  });

  test("control: a forced readback + compile + 120 ms stall is detected", async ({ page }) => {
    test.setTimeout(READY_TIMEOUT_MS + 300_000);
    const result = await runHarness(page, server, "forced-stall");
    expect(result.status, result.error).toBe("ready");
    const steady = result.measured!.steady;
    const detail = JSON.stringify(steady);
    expect(steady.countersPresent, detail).toBe(true);
    const s = stalls(steady);
    expect(s.compiles, detail).toBeGreaterThanOrEqual(1);
    expect(s.readbacks, detail).toBeGreaterThanOrEqual(1);
    expect(s.glReadPixels, detail).toBeGreaterThanOrEqual(1);
    expect(s.glLinks, detail).toBeGreaterThanOrEqual(1);
    expect(s.longTasks.length, detail).toBeGreaterThanOrEqual(1);
  });
});

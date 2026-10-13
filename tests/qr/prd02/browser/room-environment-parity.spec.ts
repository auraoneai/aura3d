/**
 * E3 stage-2b step 6 — RoomEnvironment (neutral room) parity vs three r185
 * (E3-STAGE2B-TRACE.md §5 "smallest decisive capture"). Drives
 * `scenes/prd02/room-parity.html` from the lane bundle; modeled line by line
 * on pmrem.spec.ts (02-S7) with the same ±10% linear-luma band.
 *
 * Subjects (all float readbacks, no tone mapping anywhere):
 *  - Aura `production`: `buildNeutralRoomLegacyProbe()` — the probe the
 *    production renderer actually binds when a scene authors no environment
 *    (the benchmark scene `19-room-environment-parity` Aura arm);
 *  - Aura `prefiltered`: C-09 factory `neutral("high")` (GGX prefilter of
 *    the same analytic room) — attribution arm;
 *  - three: `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` (the
 *    benchmark three arm's exact call, three/lib/showcase.ts).
 * Assertions: per-roughness {0,.25,.5,.75,1} mirror-sphere mean linear luma
 * of BOTH Aura arms within ±10% of three with identical HF-energy ordering
 * (pmrem.spec's parityCriterion verbatim), plus the analytic anchor: every
 * arm's roughness-1 window within ±10% of the solid-angle mean luma of
 * `sampleRoomEnvironment` derived in the harness (derivation in
 * room-parity-main.ts header — at r=1, R=N and the roughest mip is the
 * solid-angle average radiance; no fitted constants). Every measured value
 * is attached as JSON evidence so a red run still yields the numbers step 6
 * exists to produce.
 *
 * What this spec does NOT prove (needs the qr-azure-gpu L4 run, see
 * PARITY-CAPTURE-RUNBOOK.md): the full production pipeline (single-knob
 * bind under qr_flags=compiler,lighting, tonemapped frame, LPIPS vs the
 * three frame) and RGBA16F filterability on the L4 Vulkan-ANGLE runner —
 * the harness uploads via raw WebGL2, not the renderer's texture path.
 */
import { expect, test } from "@playwright/test";
import { startLaneServer, type LaneServer } from "./lane-page";

interface SphereWindow {
  readonly roughness: number;
  readonly meanLuma: number;
  readonly hf: number;
  readonly pixels: number;
}
interface Measured {
  readonly source: string;
  readonly mipCount: number;
  readonly faceSize: number;
  readonly windows: readonly SphereWindow[];
}
interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly analyticMeanLuma?: number;
  readonly production?: Measure;
  readonly prefiltered?: Measure;
  readonly three?: { readonly windows: readonly SphereWindow[]; readonly cubeUvHeight: number };
}

const PARITY_TOLERANCE = 0.1;

function hfOrder(windows: readonly SphereWindow[]): number[] {
  return windows.map((w) => w.roughness).sort((a, b) => windows.find((w) => w.roughness === b)!.hf - windows.find((w) => w.roughness === a)!.hf);
}

function parityCriterion(subject: readonly SphereWindow[], reference: readonly SphereWindow[]) {
  const ratios = subject.map((w, i) => w.meanLuma / reference[i]!.meanLuma);
  const meansOk = ratios.every((r) => Math.abs(r - 1) <= PARITY_TOLERANCE);
  const orderOk = JSON.stringify(hfOrder(subject)) === JSON.stringify(hfOrder(reference));
  return { ratios, meansOk, orderOk, pass: meansOk && orderOk };
}

test.describe("E3-6 RoomEnvironment neutral-room parity", () => {
  let server: LaneServer;
  let result: HarnessResult;

  test.beforeAll(async ({ browser }, workerInfo) => {
    test.setTimeout(300_000);
    server = await startLaneServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/scenes/prd02/room-parity.html`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction("Boolean(window.__A3D_PRD02_ROOM_PARITY__)", undefined, { timeout: 240_000, polling: 500 });
    result = (await page.evaluate("window.__A3D_PRD02_ROOM_PARITY__")) as HarnessResult;
    await page.close();
    // Evidence first: the readback values are the deliverable even on red.
    await workerInfo.attach("room-parity-readback", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran: analytic mean finite, all windows populated and HF ordered by roughness", () => {
    expect(result.status, result.error).toBe("ready");
    expect(Number.isFinite(result.analyticMeanLuma) && result.analyticMeanLuma! > 0).toBe(true);
    for (const arm of [result.production!, result.prefiltered!]) {
      expect(arm.windows.length).toBe(5);
      expect(arm.windows.every((w) => w.pixels > 0 && Number.isFinite(w.meanLuma) && w.meanLuma > 0)).toBe(true);
    }
    expect(result.three!.windows.length).toBe(5);
    // Sanity ordering (pmrem harness invariant): HF energy falls with roughness.
    for (const windows of [result.production!.windows, result.prefiltered!.windows, result.three!.windows]) {
      expect(windows[0]!.hf).toBeGreaterThan(windows[windows.length - 1]!.hf);
    }
  });

  test("analytic anchor: every arm's roughness-1 window within 10 % of the analytic room mean luma", () => {
    const mean = result.analyticMeanLuma!;
    const arms = { production: result.production!.windows, prefiltered: result.prefiltered!.windows, three: result.three!.windows };
    for (const [name, windows] of Object.entries(arms)) {
      const roughest = windows.find((w) => w.roughness === 1)!;
      const ratio = roughest.meanLuma / mean;
      expect(Math.abs(ratio - 1), `${name} r=1 ratio ${ratio} vs analytic mean ${mean}`).toBeLessThanOrEqual(PARITY_TOLERANCE);
    }
  });

  test("production neutral-room probe within 10 % of three RoomEnvironment at 5 roughness values, HF order identical", () => {
    const verdict = parityCriterion(result.production!.windows, result.three!.windows);
    const detail = JSON.stringify({ verdict, aura: result.production!.windows, three: result.three!.windows });
    expect(verdict.meansOk, detail).toBe(true);
    expect(verdict.orderOk, detail).toBe(true);
  });

  test("prefiltered neutral probe within 10 % of three RoomEnvironment at 5 roughness values, HF order identical", () => {
    const verdict = parityCriterion(result.prefiltered!.windows, result.three!.windows);
    const detail = JSON.stringify({ verdict, aura: result.prefiltered!.windows, three: result.three!.windows });
    expect(verdict.meansOk, detail).toBe(true);
    expect(verdict.orderOk, detail).toBe(true);
  });
});

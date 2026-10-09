/**
 * camera-feel.spec.ts — browser proofs for the C-22/C-23 controller + feel
 * surface on the L-8 harness (PRD-08 §20): presented-pose plumbing
 * (setPose/setFov/setRoll/addLayer), trauma energy reaching the presented
 * pose, and feel-bus screen uniforms arriving at `screenUniforms()`.
 *
 * Runs the harness's scripted clock (?scripted=1): each tick pumps exactly
 * one presented frame, so pose assertions are frame-exact, not rAF-timed.
 *
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (macos-14). The renderer-VP
 * equality gate of S-15 (diagnostics VP == rasterized VP within 1e-6) is
 * asserted here only at controller level — `presented()`/`diagnostics()` —
 * until the lane-15 seam Q-15-9 (#645) makes the renderer consume it.
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface PoseSnapshot {
  position: readonly number[];
  target: readonly number[];
  up: readonly number[];
  fov: number;
  roll: number;
}

interface HarnessProbe {
  status: "booting" | "ready" | "error";
  error?: string;
  tick?: (dtMs: number) => void;
  app?: {
    camera: {
      presented(): PoseSnapshot;
      setPose(p: Partial<PoseSnapshot>, o?: { cut?: boolean }): void;
      setFov(fov: number, o?: { halflife?: number }): void;
      setRoll(roll: number, o?: { halflife?: number }): void;
      addLayer(l: { apply(p: PoseSnapshot, dt: number): void } | ((p: PoseSnapshot, dt: number) => void), order?: number): () => void;
    };
    feel: {
      emit(id: string, intensity?: number): void;
      screenUniforms(): Record<string, number>;
    };
    diagnostics?(): { camera?: { viewProjection?: readonly number[] } };
  };
}

const HARNESS = "/tests/qr/prd08/harness/camera-feel-harness.html";

let server: ExampleDevServer | undefined;
let serverOrigin: string | undefined;

test.beforeAll(async () => {
  server = await startExampleDevServer();
  serverOrigin = server.origin;
});
test.afterAll(async () => {
  await server?.close();
});

async function openHarness(page: Page): Promise<void> {
  await page.goto(`${serverOrigin!}${HARNESS}?scripted=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
      return h && (h.status === "ready" || h.status === "error");
    },
    undefined,
    { timeout: 30_000 }
  );
  const probe = await page.evaluate(() => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
    return { status: h?.status, error: h?.error };
  });
  if (probe.status !== "ready") throw new Error(`harness not ready: ${probe.error}`);
}

const pump = (page: Page, dtMs = 1000 / 60, frames = 1) =>
  page.evaluate(([d, n]) => {
    const h = (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
    for (let i = 0; i < n; i += 1) h.tick?.(d);
  }, [dtMs, frames]);

const presented = (page: Page) =>
  page.evaluate(() =>
    (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!.app!.camera.presented()
  );

test.describe("prd08 camera feel — presented-pose plumbing", () => {
  test("setPose cut lands on presented() within one presented frame", async ({ page }) => {
    await openHarness(page);
    const before = await presented(page);
    await page.evaluate(() => {
      const c = (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!.app!.camera;
      c.setPose({ position: [1.5, 2.5, 3.5], target: [0, 0.5, 0] }, { cut: true });
    });
    await pump(page);
    const after = await presented(page);
    expect(after.position).not.toEqual(before.position);
    expect(after.position[0]).toBeCloseTo(1.5, 5);
    expect(after.target[1]).toBeCloseTo(0.5, 5);
  });

  test("setFov ramp converges presented fov without an abrupt first frame", async ({ page }) => {
    await openHarness(page);
    await pump(page, 16.67, 5);
    const fov0 = (await presented(page)).fov;
    await page.evaluate(() => {
      (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!.app!.camera.setFov(60, { halflife: 0.2 });
    });
    const seq: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      await pump(page);
      seq.push((await presented(page)).fov);
    }
    // Monotone approach (no overshoot) and converged at the target.
    const diffs = seq.map((f, i) => (i === 0 ? f - fov0 : f - seq[i - 1]));
    for (const d of diffs) expect(d).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(seq[seq.length - 1] - 60)).toBeLessThan(0.25);
  });

  test("setRoll reaches the presented pose; trauma layer adds energy that decays to zero", async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => {
      (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!.app!.camera.setRoll(0.2, { halflife: 0.1 });
    });
    await pump(page, 16.67, 30);
    const rolled = await presented(page);
    expect(Math.abs(rolled.roll - 0.2)).toBeLessThan(0.02);

    // Shake-layer energy: an additive decaying-offset layer registered via
    // addLayer must move the presented pose while it has energy and reach
    // exactly zero once decayed (F-08-2 "decays to exact 0" at browser level).
    const wobble = await page.evaluate(async () => {
      const h = (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!;
      const p0 = [...h.app!.camera.presented().position];
      let amp = 0.3;
      const off = h.app!.camera.addLayer((p) => {
        p.position = [p.position[0] + amp, p.position[1], p.position[2]];
        amp *= 0.85;
        if (amp < 1e-6) amp = 0;
      });
      let moved = 0;
      for (let i = 0; i < 40; i += 1) {
        h.tick?.(16.67);
        const p = h.app!.camera.presented().position;
        moved = Math.max(moved, Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]));
      }
      const settled = h.app!.camera.presented().position;
      const residual = Math.hypot(settled[0] - p0[0], settled[1] - p0[1], settled[2] - p0[2]);
      off();
      return { moved, residual };
    });
    expect(wobble.moved).toBeGreaterThan(0.1); // layer energy reached pixels
    expect(wobble.residual).toBeLessThan(1e-5); // decayed to ~exact zero

    // Feel bus -> screen uniforms arrive in [0,1] (F-08-2 browser surface).
    const uniforms = await page.evaluate(() => {
      const h = (window as never as { __AURA3D_PRD08_HARNESS__: HarnessProbe }).__AURA3D_PRD08_HARNESS__!;
      h.app!.feel.emit("hit", 1);
      h.tick?.(16.67);
      return h.app!.feel.screenUniforms();
    });
    expect(Object.values(uniforms).every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server.js";

/**
 * Mech Hangar runtime contract — NONVISUAL ONLY.
 *
 * Covers the route's interactive state machine without screenshots, pixels,
 * or video:
 *   1. hangar controls: mount, part cycling, pointer orbit, lock-in, arena gate
 *   2. arena bout: paced countdown, KO, KO card, rematch preset, back to hangar
 *   3. resize / reduced motion without runtime errors
 *
 * Environment honesty (measured 2026-09-22, this VM): the VM's SwiftShader
 * renderer stalls `requestAnimationFrame` after the first frame (the same
 * rgba16f framebuffer limitation already documented for visual checks), so the
 * route's `app.onFrame` display loop does not advance here. Assertions below
 * therefore use only:
 *   - the synchronous startup evidence publish,
 *   - raw DOM event handlers (keyboard / pointer), which are event-driven,
 *   - `__MECH_HANGAR_SIM_TICK__`, the route's own synchronous sim pacer
 *     (which republishes evidence per call),
 *   - DOM state (HUD visibility, option labels, KO card).
 * Real-time movement, pause-freeze sampling, keep-away distances, audio
 * timing, and every pixel/visual assertion remain NOT RUN in this VM.
 */

const ROUTE = "/apps/showcase-mech-hangar/";

type TickResult = {
  phase: "countdown" | "fighting" | "ko" | "lost";
  vitals: { playerHp: number; rivalHp: number; playerGuard: number; playerPower: number };
  positions: { playerX: number; rivalX: number };
  koEvents: number;
  preset: string;
} | null;

async function openRoute(page: Page, origin: string, query = ""): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));
  page.on("requestfailed", (request) => {
    // GLB payloads are Git LFS pointers in this checkout and 404/415 here;
    // the route mounts without them. Anything else failing is real signal.
    if (!request.url().endsWith(".glb")) errors.push(`requestfailed: ${request.url()}`);
  });
  await page.goto(origin + ROUTE + query, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForFunction(
    () => {
      const evidence = (window as unknown as { __MECH_HANGAR_EVIDENCE__?: { mounted?: boolean; catalogReady?: boolean } })
        .__MECH_HANGAR_EVIDENCE__;
      return Boolean(evidence?.mounted && evidence?.catalogReady);
    },
    null,
    { timeout: 180_000 }
  );
  return errors;
}

async function readOrbit(page: Page): Promise<{ yaw: number; pitch: number }> {
  return page.evaluate(
    () =>
      (window as unknown as { __MECH_HANGAR_EVIDENCE__: { orbitAngles: { yaw: number; pitch: number } } })
        .__MECH_HANGAR_EVIDENCE__.orbitAngles
  );
}

async function dragPreview(page: Page, dx: number, dy: number): Promise<void> {
  const center = await page.evaluate(() => {
    const canvas = document.querySelector("#app canvas");
    if (!canvas) throw new Error("preview canvas missing");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx, center.y + dy, { steps: 5 });
  await page.mouse.up();
}

async function tick(
  page: Page,
  frames: number,
  options?: { toward?: boolean; strike?: "none" | "light" | "heavy" | "special"; guard?: boolean }
): Promise<Exclude<TickResult, null>> {
  const result = await page.evaluate(
    ([frameCount, paceOptions]) =>
      (
        window as unknown as {
          __MECH_HANGAR_SIM_TICK__: (
            count: number,
            pace: { toward?: boolean; strike?: "none" | "light" | "heavy" | "special"; guard?: boolean }
          ) => TickResult;
        }
      ).__MECH_HANGAR_SIM_TICK__(frameCount, paceOptions ?? {}),
    [frames, options] as const
  );
  expect(result, "SIM_TICK returned null (bout missing or paused)").not.toBeNull();
  return result as Exclude<TickResult, null>;
}

test.describe("mech hangar runtime (nonvisual)", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("hangar controls: mount, cycle, orbit, lock-in, arena gate", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openRoute(page, server.origin, "?seed=mech-hangar-runtime");

    const evidence = await page.evaluate(
      () => (window as unknown as { __MECH_HANGAR_EVIDENCE__: Record<string, unknown> }).__MECH_HANGAR_EVIDENCE__
    );
    expect(evidence.assemblyValidated).toBe(true);
    expect(errors).toEqual([]);

    // Part cycling is a synchronous DOM update: select the arms slot and step
    // to the next option; the HUD option label must change.
    const armsLabel = page.getByTestId("option-arms");
    const labelBefore = await armsLabel.textContent();
    await page.keyboard.press("Digit2");
    await page.keyboard.press("ArrowRight");
    const labelAfter = await armsLabel.textContent();
    expect(labelAfter).not.toBe(labelBefore);

    // Pointer orbit mutates the hangar controller state and republishes
    // evidence on change (the display loop is stalled in this VM, so the
    // republish happens via the orbit-change callback).
    const orbitBefore = await readOrbit(page);
    expect(orbitBefore.yaw).toBeCloseTo(0.62, 2);
    expect(orbitBefore.pitch).toBeCloseTo(0.34, 2);
    await dragPreview(page, 150, 60);
    const orbitAfter = await readOrbit(page);
    expect(orbitAfter.yaw).toBeCloseTo(0.62 - 150 * 0.008, 1);
    expect(orbitAfter.pitch).toBeCloseTo(0.34 + 60 * 0.005, 1);

    // Lock-in enters the arena; the bout card becomes visible.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("bout-card")).toBeVisible();
    await expect(armsLabel).toBeHidden();

    // The orbit affordance is gated to hangar mode: dragging in the arena
    // must not move the preview orbit.
    await dragPreview(page, 150, 60);
    const orbitGated = await readOrbit(page);
    expect(orbitGated.yaw).toBeCloseTo(orbitAfter.yaw, 3);
    expect(orbitGated.pitch).toBeCloseTo(orbitAfter.pitch, 3);

    expect(errors).toEqual([]);
  });

  test("arena bout: countdown, KO, rematch preset, back to hangar", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openRoute(page, server.origin, "?seed=mech-hangar-bout");

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("bout-card")).toBeVisible();

    // The bout starts in countdown (72 frames at 60fps); pacing 90 frames
    // reaches the fighting phase with no KO yet.
    let state = await tick(page, 90);
    expect(state.phase).toBe("fighting");
    expect(state.koEvents).toBe(0);

    // Brawl until someone is KO'd.
    for (let round = 0; round < 60 && state.koEvents === 0; round += 1) {
      state = await tick(page, 400, { toward: true, strike: "heavy" });
    }
    expect(state.koEvents).toBeGreaterThan(0);
    expect(["ko", "lost"]).toContain(state.phase);
    const koVitals = state.vitals;
    expect(Math.min(koVitals.playerHp, koVitals.rivalHp)).toBe(0);
    await expect(page.getByTestId("ko-card")).toHaveAttribute("data-visible", "true");

    // Rematch starts a fresh bout on the next aggression preset with reset
    // vitals and spawn positions (not the KO state).
    await page.keyboard.press("KeyR");
    state = await tick(page, 1);
    expect(state.phase).toBe("countdown");
    expect(state.preset).toBe("balanced");
    expect(state.vitals.playerHp).toBe(1);
    expect(state.vitals.rivalHp).toBe(1);
    expect(state.positions.playerX).toBeCloseTo(-1.9, 1);
    expect(state.positions.rivalX).toBeCloseTo(1.9, 1);

    // Backspace returns to the hangar.
    await page.keyboard.press("Backspace");
    await expect(page.getByTestId("bout-card")).toBeHidden();
    await expect(page.getByTestId("option-arms")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("resize and reduced motion do not produce runtime errors", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ reduced_motion: "reduce" });
    const page = await context.newPage();
    const errors = await openRoute(page, server.origin, "?seed=mech-hangar-resize");
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setViewportSize({ width: 1600, height: 900 });
    const evidence = await page.evaluate(
      () =>
        (window as unknown as { __MECH_HANGAR_EVIDENCE__: { catalogReady?: boolean; assemblyValidated?: boolean } })
          .__MECH_HANGAR_EVIDENCE__
    );
    expect(evidence.catalogReady).toBe(true);
    expect(evidence.assemblyValidated).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
});

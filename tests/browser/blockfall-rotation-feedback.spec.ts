/**
 * BF-R7 — Blockfall Reactor rotation-denied feedback browser coverage.
 *
 * Drives the mounted route through the real input path and asserts the
 * rotation-denied feedback loop end to end:
 * 1. exit attract with a real keypress (fresh game),
 * 2. stage a rotation trap through the acceptance probe (real kit `setBoard`
 *    boxes the active piece in; no fabricated state),
 * 3. press a real rotate key,
 * 4. assert the route counted the refusal (`observedGameplayProof.rotateDenied`)
 *    AND visibly pulsed the rotate buttons (`rotate-denied` class) in the same
 *    in-page poll, so the class assertion cannot race the 0.28 s flash,
 * 5. assert zero console/page errors for the session.
 *
 * Non-visual assertions only; the SwiftShader canvas is black in this VM, so
 * no pixel assertions are made here.
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const ROUTE = "/apps/showcase-blockfall-reactor/";

interface RotationFeedbackEvidence {
  readonly observedGameplayProof?: {
    readonly rotation?: boolean;
    readonly rotateDenied?: number;
  };
  readonly frameCount?: number;
  readonly current?: { readonly score?: number; readonly lines?: number; readonly gameOver?: boolean };
  readonly diagnostics?: { readonly drawCalls?: number };
}

async function readEvidence(page: Page): Promise<RotationFeedbackEvidence> {
  return page.evaluate(() => {
    const source = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: RotationFeedbackEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return source ?? {};
  });
}

async function waitForRunningRoute(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: RotationFeedbackEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return Boolean(
      value?.current &&
        Number(value.frameCount) > 0 &&
        Number(value.diagnostics?.drawCalls) > 0
    );
  }, undefined, { timeout: 120_000 });
}

async function waitForFreshGame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: RotationFeedbackEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    const current = value?.current;
    return Boolean(
      current && current.score === 0 && current.lines === 0 && current.gameOver === false
    );
  }, undefined, { timeout: 90_000 });
  await page.waitForTimeout(250);
}

async function stageRotationTrap(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const probe = (window as unknown as {
      __AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?: { stageRotationTrap(): boolean };
    }).__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__;
    if (!probe) throw new Error("Missing Blockfall acceptance probe.");
    return probe.stageRotationTrap();
  });
}

test("blockfall refused rotation counts the denial and pulses the rotate buttons", async ({
  page
}) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await waitForRunningRoute(page);

    // Exit attract with a real keypress; the triggering press is swallowed and
    // the route resets to a genuinely fresh game.
    await page.keyboard.press("ArrowLeft");
    await waitForFreshGame(page);

    // Sanity: an accepted rotation works before the trap (proof starts clean).
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);
    const before = await readEvidence(page);
    expect(before.observedGameplayProof?.rotation).toBe(true);
    expect(before.observedGameplayProof?.rotateDenied ?? 0).toBe(0);

    // Box the active piece in through the real kit, then refuse a real rotate.
    expect(await stageRotationTrap(page)).toBe(true);
    await page.keyboard.press("ArrowUp");

    // One atomic in-page poll: the counter must rise AND the denied class must
    // be present on the rotate button while the 0.28 s flash is live.
    await page.waitForFunction(() => {
      const evidence = (
        window as unknown as {
          __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: RotationFeedbackEvidence;
        }
      ).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
      const counted = (evidence?.observedGameplayProof?.rotateDenied ?? 0) >= 1;
      const flashing =
        document.getElementById("rotate-left-button")?.classList.contains("rotate-denied") ===
          true ||
        document.getElementById("rotate-right-button")?.classList.contains("rotate-denied") ===
          true;
      return counted && flashing;
    }, undefined, { timeout: 15_000 });

    const after = await readEvidence(page);
    expect(after.observedGameplayProof?.rotateDenied ?? 0).toBeGreaterThanOrEqual(1);
  } finally {
    await server.close();
  }

  expect(consoleErrors, "zero console/page errors during rotation-feedback run").toEqual([]);
});

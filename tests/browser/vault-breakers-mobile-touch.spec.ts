import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import {
  PHONE_CONTEXT_OPTIONS,
  expectTouchControlsReachable,
  pressControl,
  releaseControl,
} from "./mobile-touch-contract";

/**
 * Vault Breakers on a phone (§25).
 *
 * The route publishes `"touch buttons"` in its controls, and pinball is the
 * genre where a control you have to scroll a documentation panel to reach is
 * the same as no control at all: the ball is gone before your thumb arrives.
 * So the assertion is that a touch raises the actual motorised flipper and
 * releases the actual plunger, read from the route's own Rapier-backed
 * evidence rather than from a button that visually depresses.
 */

interface VBEvidence {
  readonly phase?: string;
  readonly flipperLeftRaised?: boolean;
  readonly flipperRightRaised?: boolean;
}

const CONTROLS = [
  { selector: "#vb-left-button", label: "Left flipper" },
  { selector: "#vb-right-button", label: "Right flipper" },
  { selector: "#vb-plunge-button", label: "Plunge" },
  { selector: "#vb-reset-button", label: "Reset" },
  { selector: "#vb-pause-button", label: "Pause" },
];

async function readEvidence(page: Page): Promise<VBEvidence> {
  return page.evaluate(
    () =>
      (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: VBEvidence }).__VAULT_BREAKERS_EVIDENCE__ ?? {},
  );
}

test("vault breakers touch controls are reachable and drive the table on a phone", async ({ browser }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  const context = await browser.newContext({ ...PHONE_CONTEXT_OPTIONS, baseURL: server.origin });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));

  try {
    await page.goto("/apps/showcase-vault-breakers/", { waitUntil: "commit", timeout: 120_000 });
    await page.waitForFunction(
      () =>
        (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { status?: string } })
          .__VAULT_BREAKERS_EVIDENCE__?.status === "ready",
      undefined,
      { timeout: 180_000 },
    );

    await expectTouchControlsReachable(page, CONTROLS);

    const advance = async (frames: number) => {
      await page.evaluate((count) => {
        (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(count);
      }, frames);
    };

    // Pinball on a phone has to run the real sequence: you cannot test a
    // flipper against an empty table. Flippers are deliberately inert while the
    // route sits in `attract` (the documented keyboard verb raises nothing
    // there either), so serve through the touch plunge first.
    const servePhase = (await readEvidence(page)).phase;
    expect(servePhase, "table should start in attract").toBe("attract");
    expect(await pressControl(page, "#vb-plunge-button")).toBe(true);
    await advance(12);
    expect((await readEvidence(page)).phase, "charging should still be attract").toBe("attract");
    await releaseControl(page, "#vb-plunge-button");
    await advance(160);
    expect(
      (await readEvidence(page)).phase,
      `releasing the touch plunge should serve a ball (phase stayed "${servePhase}")`,
    ).toBe("play");

    // A flipper button that only changes its own CSS would satisfy a screenshot
    // and fail here: `flipperLeftRaised` is the Rapier hinge's own state, and
    // it only exists while the finger is down.
    for (const [selector, key] of [
      ["#vb-left-button", "flipperLeftRaised"],
      ["#vb-right-button", "flipperRightRaised"],
    ] as const) {
      expect((await readEvidence(page))[key], `${key} should rest down before the touch`).toBe(false);
      expect(await pressControl(page, selector)).toBe(true);
      await advance(30);
      const held = await readEvidence(page);
      await releaseControl(page, selector);
      await advance(30);
      expect(held[key], `${selector} must raise the ${key} flipper hinge`).toBe(true);
      expect(
        (await readEvidence(page))[key],
        `${selector} must let the ${key} flipper return after release`,
      ).toBe(false);
    }

    expect(pageErrors, `touch play surfaced page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  } finally {
    await context.close();
    await server.close();
  }
});

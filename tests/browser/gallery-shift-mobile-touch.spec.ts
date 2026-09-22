import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import {
  PHONE_CONTEXT_OPTIONS,
  expectTouchControlsReachable,
  holdControl,
  tapControl,
} from "./mobile-touch-contract";

/**
 * Gallery Shift on a phone (§25).
 *
 * The route publishes `"touch buttons"` in its controls list and sets
 * `touch: true`, so the claim is only honest if the eight declared verbs are
 * thumb-reachable at a 390x844 viewport *and* actually drive the heist. The
 * row previously rendered at y=913-965 under `body { overflow: hidden }`,
 * which left every one of them off screen.
 */

interface GSEvidence {
  readonly status?: string;
  readonly state?: string;
  readonly thiefPos?: { x: number; z: number };
  readonly thiefGait?: string;
  readonly frameCount?: number;
}

const CONTROLS = [
  { selector: "#gs-up-button", label: "Up" },
  { selector: "#gs-down-button", label: "Down" },
  { selector: "#gs-left-button", label: "Left" },
  { selector: "#gs-right-button", label: "Right" },
  { selector: "#gs-sneak-button", label: "Sneak" },
  { selector: "#gs-lift-button", label: "Hold to lift" },
  { selector: "#gs-restart-button", label: "Restart" },
  { selector: "#gs-pause-button", label: "Pause" },
];

async function readEvidence(page: import("@playwright/test").Page): Promise<GSEvidence> {
  return page.evaluate(
    () =>
      (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__ ?? {},
  );
}

test("gallery shift touch controls are reachable and drive the heist on a phone", async ({ browser }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  const context = await browser.newContext({ ...PHONE_CONTEXT_OPTIONS, baseURL: server.origin });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));

  try {
    await page.goto("/apps/showcase-gallery-shift/?debug=1", { waitUntil: "commit", timeout: 120_000 });
    await page.waitForFunction(
      () =>
        (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { status?: string } }).__GALLERY_SHIFT_EVIDENCE__
          ?.status === "ready",
      undefined,
      { timeout: 180_000 },
    );

    await expectTouchControlsReachable(page, CONTROLS);

    const advance = async (frames: number) => {
      await page.evaluate((count) => {
        (window as unknown as { __GS_PUMP__?: (frames: number) => number }).__GS_PUMP__?.(count);
      }, frames);
    };

    // Movement: the thief only ever translates from input, so a held touch
    // button must move it. A tap that lands between two frames would not.
    const before = await readEvidence(page);
    expect(await holdControl(page, "#gs-up-button", 90, advance)).toBe(true);
    const moved = await readEvidence(page);
    const travelled = Math.hypot(
      (moved.thiefPos?.x ?? 0) - (before.thiefPos?.x ?? 0),
      (moved.thiefPos?.z ?? 0) - (before.thiefPos?.z ?? 0),
    );
    expect(travelled, "holding the touch Up button must translate the thief").toBeGreaterThan(0.05);

    // Sneak is a toggle, so the gait read must flip and flip back.
    expect(await tapControl(page, "#gs-sneak-button")).toBe(true);
    await advance(6);
    await expect
      .poll(async () => (await readEvidence(page)).thiefGait?.toUpperCase(), { timeout: 30_000 })
      .toMatch(/SNEAK|CROUCH|STEALTH/);
    expect(await tapControl(page, "#gs-sneak-button")).toBe(true);
    await advance(6);
    await expect
      .poll(async () => (await readEvidence(page)).thiefGait?.toUpperCase(), { timeout: 30_000 })
      .not.toMatch(/SNEAK|CROUCH|STEALTH/);

    // Pause must reach the frame loop, not just restyle the button.
    expect(await tapControl(page, "#gs-pause-button")).toBe(true);
    await expect
      .poll(async () => (await readEvidence(page)).state, { timeout: 30_000 })
      .toBe("paused");
    expect(await tapControl(page, "#gs-pause-button")).toBe(true);
    await expect
      .poll(async () => (await readEvidence(page)).state, { timeout: 30_000 })
      .not.toBe("paused");

    expect(pageErrors, `touch play surfaced page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  } finally {
    await context.close();
    await server.close();
  }
});

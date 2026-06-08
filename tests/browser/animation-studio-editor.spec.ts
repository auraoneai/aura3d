import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/animation-studio/editor-ui.json");

test.describe("animation studio editor UI", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("M4 visual editor: timeline scrub, curve edit changes output, serialization round-trips", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${server.origin}/tests/browser/animation-studio-editor-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA3D_ANIMATION_STUDIO_EDITOR__));

    const initial = await page.evaluate(() => window.__AURA3D_ANIMATION_STUDIO_EDITOR__!);
    expect(initial.status, initial.error).toBe("ready");

    // a real DOM editor rendered: clip block + playhead + state-graph chips
    expect(await page.locator("#timeline .clip").count()).toBeGreaterThan(0);
    expect(await page.locator(".graph-state").count()).toBe(3);

    // serialization round-trips through the real controller
    expect(initial.serialized.trackCount).toBe(1);
    expect(initial.serialized.clipCount).toBeGreaterThanOrEqual(1);

    // scrub moves the playhead (timeline editing)
    await page.evaluate(() => window.__auraStudioEditor__!.scrubTo(4));
    const scrubbed = await page.evaluate(() => window.__AURA3D_ANIMATION_STUDIO_EDITOR__!);
    expect(scrubbed.scrubTime).toBeGreaterThan(initial.scrubTime);
    expect(["run", "walk"]).toContain(scrubbed.graphStates.length ? (scrubbed as unknown as { graphStates: string[] }).graphStates[2] : "run");
    const playheadLeft = await page.locator("#playhead").evaluate((el) => (el as HTMLElement).style.left);
    expect(playheadLeft).not.toBe("0%");

    // editing the curve changes the sampled output (curve editing drives result)
    const before = scrubbed.curveSampleAtMid;
    const after = await page.evaluate(() => window.__auraStudioEditor__!.editCurve());
    expect(Math.abs(after - before)).toBeGreaterThan(0.01);

    expect(errors).toEqual([]);

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify({ ok: errors.length === 0, generatedAt: new Date().toISOString(), trackCount: initial.serialized.trackCount, clipCount: initial.serialized.clipCount, curveBefore: before, curveAfter: after }, null, 2)}\n`
    );
  });

  test("M4 visual editor: event-track lane authors hitbox/footstep/vfx markers (add/move/delete)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${server.origin}/tests/browser/animation-studio-editor-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__EVENT_TRACK_PROOF__));

    const initial = await page.evaluate(() => window.__EVENT_TRACK_PROOF__!);
    expect(initial.status).toBe("ready");
    expect(initial.serializedSchema).toBe("animation-event-tracks/v1");
    // three lanes rendered in the DOM (hitbox, footstep, vfx)
    expect(await page.locator(".event-lane").count()).toBe(3);
    expect(await page.locator(".event-marker").count()).toBeGreaterThanOrEqual(3);
    // the hitbox active-frame window is live mid-window
    expect(initial.hitboxWindow).not.toBeNull();
    expect(initial.hitboxActiveAtMid).toBe(true);

    // add a marker
    const id = await page.evaluate(() => window.__auraStudioEditor__!.addEventMarker("footstep", 0.3));
    const added = await page.evaluate(() => window.__EVENT_TRACK_PROOF__!);
    expect(added.markerCount).toBe(initial.markerCount + 1);

    // move it
    await page.evaluate((markerId) => window.__auraStudioEditor__!.moveEventMarker("footstep", markerId, 0.4), id);
    const moved = await page.evaluate(() => window.__EVENT_TRACK_PROOF__!);
    expect(moved.movedMarkerTime).toBe(0.4);

    // delete it
    await page.evaluate((markerId) => window.__auraStudioEditor__!.deleteEventMarker("footstep", markerId), id);
    const deleted = await page.evaluate(() => window.__EVENT_TRACK_PROOF__!);
    expect(deleted.deletedDown).toBe(true);
    expect(deleted.markerCount).toBe(initial.markerCount);

    expect(errors).toEqual([]);
  });
});

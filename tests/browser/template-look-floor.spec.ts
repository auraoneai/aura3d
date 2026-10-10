import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// PRD-13 §17.2 — template look floor (runtime half).
//
// What §17.2 asks for: build each template from packed tarballs, mount it, read
// diagnostics(), assert the §7.5 runtime floor, and capture the 3 shots × 2
// viewports for the panel.
//
// Honest status today (see the fixme'd blocks):
//  - Tarball parity is NOT implemented here — the harness mounts each template's
//    workspace-copy `src/main.ts` through the monorepo dev server (same pattern
//    as template-routes.spec.ts), which proves the runtime floor against the
//    shipped source but not the packed artifact.
//  - Pixel-level floor assertions (specular on metal mask, shadow-region luma,
//    subject-bbox coverage ±10%) have no calibrated thresholds yet — §17.2 says
//    they must be "calibrated so that a broken control fails", which needs a
//    passing remote capture run to tune. Blocked on #442 (capture pipeline) +
//    #137 (owner secret for the GitLab/Kiro path).
//  - tests/browser ownership is lane-15's; the carve-out request is #709.
//
// What IS live below: every template boots in a real browser with zero page
// errors, mounts a live AuraApp, and its `look` diagnostics section reports no
// lint findings at severity "error". That is the runnable slice of the §7.5
// runtime floor.

const GAME_TEMPLATES = [
  { id: "mini-game", expectedLook: "outdoor-day" },
  { id: "falling-blocks-starter", expectedLook: "neon-arcade" },
  { id: "character-controller", expectedLook: "character-showcase" },
  { id: "fighting-game", expectedLook: "arena-fight" },
  { id: "racing-starter", expectedLook: "night-city" }
] as const;

interface LookDiagnosticsSection {
  id?: string | null;
  expansion?: "v1-contracts" | "v0-current-engine" | "none";
  lint?: { severity: string; code?: string }[];
}

interface LiveAppRegistry {
  count(): number;
  all(): { diagnostics(): Record<string, unknown> }[];
}

test.describe("§7.5 template look floor — runtime slice", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  for (const { id: template, expectedLook } of GAME_TEMPLATES) {
    test(`${template}: boots clean, mounts a live app, look lint has no errors`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      await page.goto(`${server.origin}/tests/browser/template-look-floor-harness.html?template=${template}`, {
        waitUntil: "domcontentloaded"
      });

      const harness = await page.evaluate(
        () => (window as unknown as { __AURA3D_LOOK_FLOOR_HARNESS__?: { error?: string; imported: boolean } }).__AURA3D_LOOK_FLOOR_HARNESS__
      );
      expect(harness?.error, `harness import failed: ${harness?.error ?? "unknown"}`).toBeUndefined();
      expect(harness?.imported).toBe(true);

      await expect
        .poll(async () => page.evaluate(() => (window as unknown as { __AURA3D_LIVE_APPS__?: LiveAppRegistry }).__AURA3D_LIVE_APPS__?.count() ?? 0), {
          timeout: 60_000
        })
        .toBeGreaterThan(0);

      const diagnostics = await page.evaluate(() => {
        const apps = (window as unknown as { __AURA3D_LIVE_APPS__?: LiveAppRegistry }).__AURA3D_LIVE_APPS__?.all() ?? [];
        return apps[0]?.diagnostics() as Record<string, unknown> | undefined;
      });
      expect(diagnostics, "mounted app exposes diagnostics()").toBeDefined();
      expect((diagnostics!.errors as string[] | undefined) ?? []).toEqual([]);
      expect(diagnostics!.drawCalls as number).toBeGreaterThan(0);

      const look = diagnostics!.look as LookDiagnosticsSection | undefined;
      expect(look, "diagnostics() carries the `look` section (C-31/lane-13 registration)").toBeDefined();
      const lintErrors = (look!.lint ?? []).filter((f) => f.severity === "error");
      expect(lintErrors, `look lint errors: ${JSON.stringify(lintErrors)}`).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }

  test.describe("§7.5 full runtime floor (unverified — NOT RUN)", () => {
    // Honest skip: these assertions encode the *calibrated* §7.5 floor
    // (specular presence on the metal mask, shadow-region luma, subject-bbox
    // coverage ±10%). §17.2 requires thresholds tuned "so that a broken control
    // fails" — they cannot be calibrated until a remote capture run passes.
    // Also pending: packed-tarball mounting (this spec mounts workspace source,
    // not the tarball the floor demands), the 3-shot × 2-viewport panel, and
    // the tests/browser ownership carve-out (#709). Enable after the first
    // green GitLab capture run lands on this branch.
    test.fixme("asserts appliedLook.environment specular + shadow region darker than surroundings (uncalibrated thresholds)", async () => {
      test.skip();
    });
    test.fixme("mounts each template from packed tarballs (pack-parity, not workspace source)", async () => {
      test.skip();
    });
    test.fixme("captures the 3-shot × 2-viewport floor panel and asserts subject-bbox coverage ±10%", async () => {
      test.skip();
    });
  });
});

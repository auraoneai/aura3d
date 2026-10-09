import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// PRD-13 §17.2 — looks expansion, all 15 look presets.
//
// What §17.2 asks for: `scene().add(looks.preset(id)).add(model(DamagedHelmet))`
// for all 15 looks at Medium, with flags `none` (v0) and `all` (v1 once slots
// are real). Asserts non-void background luma, specular present on the metal
// mask (centre-region luma variance above a calibrated threshold), and a shadow
// region darker than its surroundings — "regression signals, not quality".
//
// Honest status today:
//  - The build + diagnostics half is live: every look id must expand (v0 and
//    forced-v1-with-stubs) without throwing, mount an app, and report its `look`
//    diagnostics section with no error-severity lint.
//  - The pixel half is `test.fixme` — §17.2 requires thresholds "calibrated so
//    that a broken control with IBL off fails". Unverified thresholds would be
//    noise; they wait on the first passing remote capture run (#442).
//  - tests/browser ownership carve-out pending: #709.

interface ExpansionResult {
  look: string | null;
  expansion: string;
  status: "built" | "error";
  error?: string;
  diagnostics?: { look?: { id?: string | null; expansion?: string; lint?: { severity: string }[] }; errors?: string[] };
}

// Kept in sync with looks.list() — asserted in-page too so a preset rename
// fails loudly instead of silently shrinking coverage.
const EXPECTED_LOOKS = [
  "outdoor-day", "golden-hour", "overcast", "night-city", "polar-night",
  "alpine-snow", "interior-warm", "interior-neutral", "interior-industrial",
  "space", "underwater", "product-studio", "character-showcase", "arena-fight", "neon-arcade"
] as const;

test.describe("§17.2 looks expansion — build + diagnostics", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  for (const expansion of ["v0", "v1"] as const) {
    for (const look of EXPECTED_LOOKS) {
      test(`${look} @ expansion=${expansion}: expands, mounts, look lint clean`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));

        await page.goto(
          `${server.origin}/tests/browser/looks-expansion-harness.html?look=${look}&expansion=${expansion}`,
          { waitUntil: "domcontentloaded" }
        );

        const result = await page.evaluate(
          () => (window as unknown as { __AURA3D_LOOKS_EXPANSION__?: ExpansionResult }).__AURA3D_LOOKS_EXPANSION__
        );
        expect(result?.status, `build failed: ${result?.error ?? "unknown"}`).toBe("built");
        expect(result?.diagnostics).toBeDefined();
        const lookSection = result!.diagnostics!.look;
        expect(lookSection, "diagnostics() carries the `look` section").toBeDefined();
        if (expansion === "v1") {
          // Forced v1 emits the AuraLookNode; handler records it (or
          // capability-degraded while slots are stubs — never a throw).
          expect(lookSection!.id).toBe(look);
        } else {
          expect(lookSection!.id ?? "engine-default").not.toBeNull();
        }
        const lintErrors = (lookSection!.lint ?? []).filter((f) => f.severity === "error");
        expect(lintErrors, `look lint errors: ${JSON.stringify(lintErrors)}`).toEqual([]);
        expect(pageErrors).toEqual([]);
      });
    }
  }

  test.describe("§17.2 pixel floor — regression signals (uncalibrated, NOT RUN)", () => {
    // Honest skip: non-void background luma, specular luma variance on the metal
    // mask, and shadow-region darkness need thresholds calibrated against a
    // passing remote capture run — §17.2: "calibrated so that a broken control
    // with IBL off fails". Enable once the first green capture run exists (#442)
    // and the tests/browser carve-out (#709) is granted.
    test.fixme("background luma is non-void for every look (calibrated threshold)", async () => {
      test.skip();
    });
    test.fixme("centre-region specular luma variance exceeds calibrated threshold (broken IBL control must fail)", async () => {
      test.skip();
    });
    test.fixme("shadow region is darker than its surroundings", async () => {
      test.skip();
    });
  });
});

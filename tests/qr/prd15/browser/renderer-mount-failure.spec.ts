/**
 * PRD-15 §15-SPECS — `renderer-mount-failure.spec.ts`.
 *
 * Strict mount of a scene the production bridge rejects (remote model URL)
 * must fail fast with a typed AuraRuntimeError and a visible
 * `role="alert"` overlay — never a hang, never a silent blank canvas
 * (T4.1/T4.2/T4.5). Asserts flag-off identity: the failure class and overlay
 * presence are identical with flags=none and flags=all.
 * Saves the overlay screenshot to tests/reports/prd15/error-overlay-*.png.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd15DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, type Prd15ProbePayload } from "./probe";

const url = (flags: string, extra = "") =>
  `/tests/qr/prd15/harness/prd15-mount.html?mode=fail&flags=${encodeURIComponent(flags)}${extra}`;

test.describe("PRD-15 renderer mount failure (strict)", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd15"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd15/renderer-mount-failure.json"),
      `${JSON.stringify({ spec: "renderer-mount-failure", probes }, null, 2)}\n`
    );
    await server.close();
  });

  for (const flags of ["none", "all"]) {
    test(`typed error + alert overlay (flags=${flags})`, async ({ page }) => {
      const payload: Prd15ProbePayload = await loadProbe(page, `${server.origin}${url(flags)}`);
      probes.push({ flags, payload });
      expect(payload.mountFailed).toBe(true);
      expect(payload.errorName, "typed mount error").toBe("AuraRuntimeError");
      expect(
        payload.errorMessage,
        "names the blocked path or the mount failure"
      ).toMatch(/backend-fallback|renderer-mount-failed|production/i);
      const overlay = page.locator('[role="alert"]');
      await expect(overlay, "error overlay announced to AT").toBeVisible();
      const overlayText = await overlay.textContent();
      expect(overlayText, "overlay carries the typed error").toMatch(/Aura3D|renderer|blocked|failed/i);
      // axe-lite: the alert must be a live region with a readable message.
      expect(await overlay.getAttribute("aria-live")).toBe("assertive");
      const name = `error-overlay-${flags === "all" ? "desktop" : "mobile"}.png`;
      await page.screenshot({ path: resolve("tests/reports/prd15", name) });
    });
  }
});

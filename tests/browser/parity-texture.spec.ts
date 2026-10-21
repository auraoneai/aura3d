/**
 * threejs-parity lane L4 (ST-01/02/03/06/07) — browser evidence for the
 * public `texture.*` namespace: real GPU upload of data/canvas textures,
 * runtime `needsUpdate` re-upload, and LoadingManager-style progress/error
 * callbacks over `texture.load`.
 *
 * Runs against examples/parity-texture-lab via the shared dev server.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

interface LabState {
  status: "boot" | "ready" | "error";
  drawCalls: number;
  texturedMaterials: number;
  pixelBackedMaterials: number;
  nonDarkPixels: number;
  shotBeforeUpdate: string;
  shotAfterUpdate: string;
  progressEvents: number;
  errorEvents: number;
  loadedHandle: boolean;
  loadedWidth: number;
  loadedFormat: string;
  errors: string[];
  error?: string;
}

test("parity-texture-lab uploads public texture.* handles and fires asset events", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/parity-texture-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as { __AURA3D_PARITY_TEXTURE_LAB__?: LabState }).__AURA3D_PARITY_TEXTURE_LAB__?.status === "ready"
        || (window as unknown as { __AURA3D_PARITY_TEXTURE_LAB__?: LabState }).__AURA3D_PARITY_TEXTURE_LAB__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const lab = await page.evaluate(() => (window as unknown as { __AURA3D_PARITY_TEXTURE_LAB__?: LabState }).__AURA3D_PARITY_TEXTURE_LAB__!);

    expect(lab.error, lab.error ?? "").toBeUndefined();
    expect(lab.errors).toEqual([]);
    // ST-01/ST-02: both public-handle materials upgraded to pixel-backed.
    expect(lab.texturedMaterials).toBeGreaterThanOrEqual(2);
    expect(lab.pixelBackedMaterials).toBeGreaterThanOrEqual(2);
    expect(lab.drawCalls).toBeGreaterThan(0);
    expect(lab.nonDarkPixels).toBeGreaterThan(2000);
    // ST-03: repaint + needsUpdate produced visibly different pixels.
    expect(lab.shotBeforeUpdate).not.toBe("");
    expect(lab.shotAfterUpdate).not.toBe("");
    expect(lab.shotAfterUpdate).not.toBe(lab.shotBeforeUpdate);
    // ST-07: data-URI PNG decoded to a real GPU texture (64x64 rgba8).
    expect(lab.loadedHandle).toBe(true);
    expect(lab.loadedWidth).toBe(64);
    expect(lab.loadedFormat).toBe("rgba8");
    // ST-06: progress fired for the successful load; error fired for the 404.
    expect(lab.progressEvents).toBeGreaterThanOrEqual(1);
    expect(lab.errorEvents).toBeGreaterThanOrEqual(1);
    expect(consoleErrors.filter((e) => !e.includes("404") && !e.includes("parity-lab-does-not-exist"))).toEqual([]);
  } finally {
    await server.close();
  }
});

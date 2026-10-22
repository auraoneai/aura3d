import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test("debug swiftshader texture lab", async ({ page }) => {
  test.setTimeout(240_000);
  const server: ExampleDevServer = await startExampleDevServer();
  try {
    const logs: string[] = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(`${server.origin}/examples/parity-texture-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const lab = (window as unknown as { __AURA3D_PARITY_TEXTURE_LAB__?: { status?: string } }).__AURA3D_PARITY_TEXTURE_LAB__;
        return lab?.status === "ready" || lab?.status === "error";
      },
      undefined,
      { timeout: 120_000 }
    );
    const lab = await page.evaluate(() => (window as unknown as { __AURA3D_PARITY_TEXTURE_LAB__?: unknown }).__AURA3D_PARITY_TEXTURE_LAB__);
    logs.push(`lab: ${JSON.stringify(lab)}`);
    await page.screenshot({ path: "test-results/texture-lab-page.png", fullPage: true });
    const canvasShot = await page.locator("canvas").first().screenshot();
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/texture-lab-canvas.png", canvasShot);
    const dataUrl = await page.evaluate(async () => {
      const w = window as unknown as Record<string, unknown>;
      const app = w.__PARITY_TEXTURE_APP__ as
        | { capture?: (o: { type: string }) => Promise<unknown>; screenshot(): { dataUrl: string } }
        | undefined;
      const blob = (await app?.capture?.({ type: "png-blob" })) as Blob | undefined;
      if (!blob) return "";
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    });
    if (dataUrl.startsWith("data:image/png;base64,")) {
      writeFileSync("test-results/texture-lab-app.png", Buffer.from(dataUrl.slice(22), "base64"));
    }
    logs.push(`dataUrl len ${dataUrl.length}`);
    console.log(logs.join("\n"));
    expect(true).toBe(true);
  } finally {
    await server.close();
  }
});

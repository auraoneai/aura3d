import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { assertTemplateLookFloor } from "./look-floor";

test.setTimeout(600_000);

// PRD-13 T3.12 — look floor: non-blank, look.lint error-free, appliedLook
// environment specular > 0, shadow strength >= 0.8, pixelRatio at tier cap,
// subject bounds within ±10% — plus this template's bespoke assertions.
test("Aura3D cinematic scene screenshot clears the look floor", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");

  const floor = await assertTemplateLookFloor(page, { subject: { x: 0.2, y: 0.1, width: 0.62, height: 0.57 } });
  // class-(b) readback: capture through the app (C-05) instead of the
  // compositor screenshot path — the output surface owns the frame.
  // `__AURA3D_LIVE_APPS__` is the live-app registry (not an array); `output`
  // is the C-05 extension installed under A3D_QR_CORE. A missing registry,
  // app or surface fails the spec instead of writing an empty frame.
  const pngBase64 = await page.evaluate(async () => {
    const registry = (window as unknown as {
      __AURA3D_LIVE_APPS__?: {
        all(): readonly { output?: { capture(o: { type: "png-blob" }): Promise<Blob | ImageBitmap> } }[];
      };
    }).__AURA3D_LIVE_APPS__;
    if (!registry) throw new Error("app.output.capture: __AURA3D_LIVE_APPS__ registry is not installed");
    const app = registry.all()[0];
    if (!app) throw new Error("app.output.capture: no live Aura3D app is mounted");
    if (!app.output) throw new Error("app.output.capture: app.output (C-05, A3D_QR_CORE) is not installed");
    const blob = await app.output.capture({ type: "png-blob" });
    if (!(blob instanceof Blob)) throw new Error("app.output.capture: png-blob capture did not return a Blob");
    const dataUrl = await new Promise<string>((resolvePromise) => {
      const reader = new FileReader();
      reader.onload = () => resolvePromise(String(reader.result));
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(",")[1] ?? "";
  });
  const screenshot = Buffer.from(pngBase64, "base64");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, floor }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
